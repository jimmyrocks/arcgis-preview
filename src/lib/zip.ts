// Minimal ZIP (KMZ) builder with STORED method (no compression)
// Creates a Uint8Array representing a .zip file

export type ZipFile = {
  name: string; // POSIX path within archive
  data: Uint8Array; // file content
  mtime?: Date; // optional mod time
};

export function buildZip(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder();
  const records: { localHeaderOffset: number; nameBytes: Uint8Array; data: Uint8Array; crc: number; mtime: number; mdate: number }[] = [];
  let size = 0;
  // Precompute all local headers + data sizes
  for (const f of files) {
    const nameBytes = enc.encode(f.name.replace(/\\+/g, '/'));
    const data = f.data;
    const crc = crc32(data);
    const { time, date } = msDosTime(f.mtime || new Date());
    const localHeaderLen = 30 + nameBytes.length; // fixed + filename
    const record = { localHeaderOffset: size, nameBytes, data, crc, mtime: time, mdate: date };
    records.push(record);
    size += localHeaderLen + data.length;
  }
  const centralStart = size;
  // Central directory entries
  for (const r of records) {
    size += 46 + r.nameBytes.length; // central dir fixed + filename
  }
  const centralSize = size - centralStart;
  // End of central directory (22 bytes + comment)
  size += 22;

  const out = new Uint8Array(size);
  let off = 0;

  // Write local file headers + data
  for (const r of records) {
    // Local file header signature
    writeU32(out, off, 0x04034b50); off += 4;
    writeU16(out, off, 20); off += 2; // version needed to extract
    writeU16(out, off, 0); off += 2; // general purpose bit flag
    writeU16(out, off, 0); off += 2; // compression method: 0 (stored)
    writeU16(out, off, r.mtime); off += 2; // last mod file time
    writeU16(out, off, r.mdate); off += 2; // last mod file date
    writeU32(out, off, r.crc >>> 0); off += 4;
    writeU32(out, off, r.data.length); off += 4; // compressed size
    writeU32(out, off, r.data.length); off += 4; // uncompressed size
    writeU16(out, off, r.nameBytes.length); off += 2; // file name length
    writeU16(out, off, 0); off += 2; // extra field length
    out.set(r.nameBytes, off); off += r.nameBytes.length;
    out.set(r.data, off); off += r.data.length;
  }

  const centralDirOffset = off;
  // Write central directory headers
  for (const r of records) {
    writeU32(out, off, 0x02014b50); off += 4; // central file header signature
    writeU16(out, off, 20); off += 2; // version made by
    writeU16(out, off, 20); off += 2; // version needed to extract
    writeU16(out, off, 0); off += 2; // general purpose bit flag
    writeU16(out, off, 0); off += 2; // compression method
    writeU16(out, off, r.mtime); off += 2; // time
    writeU16(out, off, r.mdate); off += 2; // date
    writeU32(out, off, r.crc >>> 0); off += 4;
    writeU32(out, off, r.data.length); off += 4; // compressed size
    writeU32(out, off, r.data.length); off += 4; // uncompressed size
    writeU16(out, off, r.nameBytes.length); off += 2; // file name length
    writeU16(out, off, 0); off += 2; // extra length
    writeU16(out, off, 0); off += 2; // file comment length
    writeU16(out, off, 0); off += 2; // disk number start
    writeU16(out, off, 0); off += 2; // internal file attributes
    writeU32(out, off, 0); off += 4; // external file attributes
    writeU32(out, off, r.localHeaderOffset); off += 4; // relative offset
    out.set(r.nameBytes, off); off += r.nameBytes.length;
  }
  const centralDirSize = off - centralDirOffset;

  // End of central directory record
  writeU32(out, off, 0x06054b50); off += 4;
  writeU16(out, off, 0); off += 2; // number of this disk
  writeU16(out, off, 0); off += 2; // disk with central dir start
  writeU16(out, off, records.length); off += 2; // number of entries on this disk
  writeU16(out, off, records.length); off += 2; // total number of entries
  writeU32(out, off, centralDirSize); off += 4; // size of central directory
  writeU32(out, off, centralDirOffset); off += 4; // offset of central directory
  writeU16(out, off, 0); off += 2; // .ZIP file comment length

  return out;
}

function writeU16(buf: Uint8Array, off: number, v: number) { buf[off] = v & 0xff; buf[off + 1] = (v >>> 8) & 0xff; }
function writeU32(buf: Uint8Array, off: number, v: number) { buf[off] = v & 0xff; buf[off + 1] = (v >>> 8) & 0xff; buf[off + 2] = (v >>> 16) & 0xff; buf[off + 3] = (v >>> 24) & 0xff; }

function msDosTime(d: Date): { time: number; date: number } {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2); // 2-second resolution
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { time: dosTime & 0xffff, date: dosDate & 0xffff };
}

// CRC32 (IEEE 802.3, polynomial 0xEDB88320)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0 ^ 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

