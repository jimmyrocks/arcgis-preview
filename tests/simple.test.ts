/* Simple runtime tests without external frameworks */
import { getFeatureId } from '../src/lib/ids';
import { approxPrecisionMetersFromZoomLat } from '../src/lib/mapMath';

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} | Expected: ${expected}, got: ${actual}`);
  }
}

function test_getFeatureId() {
  const cases: Array<{ f: any; expected: any; name: string }> = [
    { f: { type: 'Feature', id: 123, properties: { OBJECTID: 7 } }, expected: 123, name: 'prefers feature.id' },
    { f: { type: 'Feature', properties: { OBJECTID: 42 } }, expected: 42, name: 'OBJECTID attribute' },
    { f: { type: 'Feature', properties: { objectid: 11 } }, expected: 11, name: 'objectid lowercase' },
    { f: { type: 'Feature', properties: { fid: 'abc' } }, expected: 'abc', name: 'fid attribute' },
    { f: { type: 'Feature', properties: { id: 'x' } }, expected: 'x', name: 'id attribute' },
    { f: { type: 'Feature', properties: { Name: 'foo' } }, expected: null, name: 'no id' }
  ];
  for (const c of cases) {
    const got = getFeatureId(c.f);
    assertEqual(got, c.expected, `getFeatureId: ${c.name}`);
  }
}

function expectedApprox(zoom: number, lat: number): number {
  const mpp = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
  return Math.max(1, Math.round(mpp * 1.5));
}

function test_mapMath() {
  const cases: Array<{ z: number; lat: number; name: string }> = [
    { z: 0, lat: 0, name: 'z0 @ equator' },
    { z: 10, lat: 45, name: 'z10 @ mid-lat' },
    { z: 20, lat: 80, name: 'z20 @ high-lat' }
  ];
  for (const c of cases) {
    const got = approxPrecisionMetersFromZoomLat(c.z, c.lat);
    const exp = expectedApprox(c.z, c.lat);
    assertEqual(got, exp, `approxPrecisionMetersFromZoomLat: ${c.name}`);
  }
}

function run() {
  const start = Date.now();
  test_getFeatureId();
  test_mapMath();
  const dur = Date.now() - start;
  console.log(`OK - 2 suites passed in ${dur}ms`);
}

run();
