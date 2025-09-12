"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = EsriImageLayer;
const react_1 = require("react");
const react_leaflet_1 = require("react-leaflet");
const esri_leaflet_1 = require("esri-leaflet");
const geometry_1 = require("../../lib/geometry");
function EsriImageLayer({ url, onStatusChange, onComputedBounds }) {
    const map = (0, react_leaflet_1.useMap)();
    (0, react_1.useEffect)(() => {
        if (!url)
            return;
        let layer = null;
        (async () => {
            try {
                onStatusChange?.('loading');
                layer = (0, esri_leaflet_1.imageMapLayer)({ url });
                layer.addTo(map);
                try {
                    layer.bringToFront?.();
                }
                catch { }
                if (layer.metadata) {
                    await new Promise((resolve) => {
                        layer.metadata((err, meta) => {
                            if (!err) {
                                const b = (0, geometry_1.extentToBounds)(meta?.fullExtent || meta?.initialExtent);
                                if (b) {
                                    onComputedBounds?.(b);
                                }
                            }
                            resolve();
                        });
                    });
                }
                onStatusChange?.('loaded');
            }
            catch {
                onStatusChange?.('error');
            }
        })();
        return () => { try {
            if (layer)
                map.removeLayer(layer);
        }
        catch { } };
    }, [url, map]);
    return null;
}
