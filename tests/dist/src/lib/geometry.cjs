"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extentToBounds = extentToBounds;
const leaflet_1 = require("leaflet");
// Converts ArcGIS Extent (Web Mercator 102100/3857 or WGS84 4326) to Leaflet bounds
function extentToBounds(ext) {
    // Normalize nullable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = ext;
    if (!e)
        return null;
    const wkid = (e.spatialReference?.latestWkid || e.spatialReference?.wkid) ?? 0;
    if (wkid === 102100 || wkid === 3857) {
        const sw = leaflet_1.default.Projection.SphericalMercator.unproject(leaflet_1.default.point(e.xmin, e.ymin));
        const ne = leaflet_1.default.Projection.SphericalMercator.unproject(leaflet_1.default.point(e.xmax, e.ymax));
        return leaflet_1.default.latLngBounds(sw, ne);
    }
    if (wkid === 4326) {
        return leaflet_1.default.latLngBounds(leaflet_1.default.latLng(e.ymin, e.xmin), leaflet_1.default.latLng(e.ymax, e.xmax));
    }
    return null;
}
