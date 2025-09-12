"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = EsriDynamicLayer;
const react_1 = require("react");
const react_leaflet_1 = require("react-leaflet");
const esri_leaflet_1 = require("esri-leaflet");
const geometry_1 = require("../../lib/geometry");
function EsriDynamicLayer({ url, serviceMeta, onStatusChange, onComputedBounds }) {
    const map = (0, react_leaflet_1.useMap)();
    (0, react_1.useEffect)(() => {
        if (!url)
            return;
        let layer = null;
        (async () => {
            try {
                onStatusChange?.('loading');
                const allLayers = Array.isArray(serviceMeta?.layers) ? serviceMeta.layers : [];
                const defaultVisible = allLayers.filter((l) => l && l.defaultVisibility === true).map((l) => l.id);
                const leafLayers = allLayers
                    .filter((l) => !Array.isArray(l?.subLayerIds) || l.subLayerIds.length === 0)
                    .map((l) => l.id);
                const visibleLayerIds = (defaultVisible.length > 0 ? defaultVisible : leafLayers);
                layer = (0, esri_leaflet_1.dynamicMapLayer)({
                    url,
                    useCors: true,
                    format: 'png32',
                    transparent: true,
                    opacity: 1,
                    layers: Array.isArray(visibleLayerIds) && visibleLayerIds.length ? visibleLayerIds : undefined,
                });
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
                else if (serviceMeta) {
                    const b = (0, geometry_1.extentToBounds)(serviceMeta?.fullExtent || serviceMeta?.initialExtent);
                    if (b) {
                        onComputedBounds?.(b);
                    }
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
    }, [url, serviceMeta, map]);
    return null;
}
