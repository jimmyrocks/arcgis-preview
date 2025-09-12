"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = EsriLayer;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
require("leaflet/dist/leaflet.css");
const esriLayer_1 = require("../lib/esriLayer");
const EsriFeatureLayer_1 = require("./layers/EsriFeatureLayer");
const EsriDynamicLayer_1 = require("./layers/EsriDynamicLayer");
const EsriImageLayer_1 = require("./layers/EsriImageLayer");
function EsriLayer({ serviceUrl, selectedMapLayerId, where = '1=1', onStatusChange, onServiceMetadata, onComputedBounds, onFeatureCollection, onFeatureClickId }) {
    const [serviceMeta, setServiceMeta] = react_1.default.useState(null);
    const resolved = react_1.default.useMemo(() => {
        try {
            return (0, esriLayer_1.resolveEsriLayer)(serviceUrl, selectedMapLayerId ?? undefined);
        }
        catch {
            return { type: 'unknown' };
        }
    }, [serviceUrl, selectedMapLayerId]);
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!serviceUrl)
                    return;
                onStatusChange?.('loading');
                setServiceMeta(null);
                if (resolved.serviceRootUrl) {
                    try {
                        const meta = await (0, esriLayer_1.fetchServiceMetadata)(resolved.serviceRootUrl);
                        if (!cancelled)
                            setServiceMeta(meta);
                        let summary = (0, esriLayer_1.summarizeService)(meta, resolved.layerId);
                        if (resolved.type === 'feature' && resolved.url && typeof resolved.layerId === 'number') {
                            try {
                                const count = await (0, esriLayer_1.fetchFeatureCount)(resolved.url, where);
                                summary = `${summary} — ${count.toLocaleString()} features`;
                            }
                            catch { }
                        }
                        if (!cancelled)
                            onServiceMetadata?.(summary, meta);
                    }
                    catch { }
                }
            }
            catch { }
        })();
        return () => { cancelled = true; };
    }, [serviceUrl, selectedMapLayerId, where]);
    if (resolved.type === 'feature' && resolved.url) {
        return ((0, jsx_runtime_1.jsx)(EsriFeatureLayer_1.default, { url: resolved.url, where: where, serviceMeta: serviceMeta, onStatusChange: onStatusChange, onComputedBounds: onComputedBounds, onFeatureCollection: onFeatureCollection, onFeatureClickId: onFeatureClickId }));
    }
    if (resolved.type === 'dynamic' && resolved.url) {
        return ((0, jsx_runtime_1.jsx)(EsriDynamicLayer_1.default, { url: resolved.url, serviceMeta: serviceMeta, onStatusChange: onStatusChange, onComputedBounds: onComputedBounds }));
    }
    if (resolved.type === 'image' && resolved.url) {
        return ((0, jsx_runtime_1.jsx)(EsriImageLayer_1.default, { url: resolved.url, onStatusChange: onStatusChange, onComputedBounds: onComputedBounds }));
    }
    return null;
}
