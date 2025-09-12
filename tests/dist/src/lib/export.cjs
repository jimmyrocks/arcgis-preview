"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterFeatureCollectionByRowIds = filterFeatureCollectionByRowIds;
exports.downloadText = downloadText;
exports.downloadBlob = downloadBlob;
function filterFeatureCollectionByRowIds(featureCollection, rows) {
    try {
        const fc = featureCollection && featureCollection.type === 'FeatureCollection' ? featureCollection : { type: 'FeatureCollection', features: [] };
        const ids = new Set((rows || []).map((r) => r?.__id).filter((v) => v != null));
        const feats = Array.isArray(fc.features) ? fc.features.filter((f) => {
            const id = f?.properties?.__id;
            return ids.size ? ids.has(id) : true;
        }) : [];
        return { type: 'FeatureCollection', features: feats };
    }
    catch {
        return { type: 'FeatureCollection', features: [] };
    }
}
function downloadText(filename, mime, content) {
    try {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    catch { }
}
function downloadBlob(filename, mime, data) {
    try {
        let parts;
        if (Array.isArray(data)) {
            parts = data;
        }
        else if (data instanceof Uint8Array) {
            // Convert to plain ArrayBuffer to satisfy older DOM lib typings
            const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            parts = [ab];
        }
        else {
            parts = [data];
        }
        const blob = new Blob(parts, { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    catch { }
}
