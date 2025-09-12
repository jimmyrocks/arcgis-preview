"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approxPrecisionMetersFromZoomLat = approxPrecisionMetersFromZoomLat;
exports.approxPrecisionMeters = approxPrecisionMeters;
function approxPrecisionMetersFromZoomLat(zoom, lat) {
    try {
        const mpp = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
        return Math.max(1, Math.round(mpp * 1.5));
    }
    catch {
        return 0;
    }
}
function approxPrecisionMeters(map) {
    try {
        const lat = map.getCenter().lat || 0;
        const z = typeof map.getZoom === 'function' ? map.getZoom() : 0;
        return approxPrecisionMetersFromZoomLat(z, lat);
    }
    catch {
        return 0;
    }
}
