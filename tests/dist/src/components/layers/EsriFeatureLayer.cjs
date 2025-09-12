"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = EsriFeatureLayer;
const react_1 = require("react");
const react_leaflet_1 = require("react-leaflet");
const leaflet_1 = require("leaflet");
const esri_leaflet_1 = require("esri-leaflet");
require("esri-leaflet-renderers");
const geometry_1 = require("../../lib/geometry");
const hitOverlays_1 = require("../../lib/hitOverlays");
const PopupContent_1 = require("../PopupContent");
const client_1 = require("react-dom/client");
const mapMath_1 = require("../../lib/mapMath");
const ids_1 = require("../../lib/ids");
function EsriFeatureLayer({ url, where = '1=1', serviceMeta, onStatusChange, onComputedBounds, onFeatureCollection, onFeaturePrecision, onFeatureClickId }) {
    const map = (0, react_leaflet_1.useMap)();
    (0, react_1.useEffect)(() => {
        if (!url)
            return;
        let layer = null;
        let cancelled = false;
        const collectedProperties = new Map();
        const collectedGeometries = new Map();
        const collectedGeometriesPrecision = new Map();
        const report = () => {
            // Stitch together the collected features
            const features = [];
            for (const [id, properties] of collectedProperties) {
                const geometry = collectedGeometries.get(id) || { type: 'Point', coordinates: [] };
                features.push({ type: 'Feature', id, properties, geometry });
            }
            // Report the data
            try {
                const vals = Array.from(collectedGeometriesPrecision.values());
                let fc = { type: 'FeatureCollection', features };
                if (vals.length) {
                    const min = Math.min(...vals);
                    const max = Math.max(...vals);
                    onFeaturePrecision?.(min, max);
                    fc._precision_range_m = { min: Math.round(min), max: Math.round(max) };
                }
                onFeatureCollection?.(fc);
                return;
            }
            catch { }
            onFeatureCollection?.({ type: 'FeatureCollection', features });
        };
        const hitMgr = (0, hitOverlays_1.createHitOverlayManager)(map, {
            onClick: (id) => { try {
                onFeatureClickId?.(id);
            }
            catch { } }
        });
        const featureId = (f, props) => {
            try {
                const id = (0, ids_1.getFeatureId)(f);
                if (id != null)
                    return id;
                return JSON.stringify(props).slice(0, 200);
            }
            catch {
                return Math.random();
            }
        };
        (async () => {
            try {
                onStatusChange?.('loading');
                layer = (0, esri_leaflet_1.featureLayer)({
                    url,
                    simplifyFactor: 0.5,
                    precision: 5,
                    where: (where || '1=1').trim() || undefined,
                    renderer: leaflet_1.default.canvas ? leaflet_1.default.canvas({ tolerance: 2 }) : undefined,
                    onEachFeature: (feat, lyr) => {
                        // parse out the feature into a valid GeoJSON
                        const properties = feat?.properties || feat?.attributes || {};
                        const geometry = feat?.geometry || null;
                        const id = featureId(feat, properties);
                        const feature = { type: 'Feature', id, properties, geometry };
                        try {
                            const container = document.createElement('div');
                            const layerName = inferLayerName(serviceMeta, url);
                            try {
                                lyr.bindPopup(container, { maxWidth: 360, className: 'odl-react-popup' });
                            }
                            catch { }
                            let root = null;
                            lyr.on('popupopen', () => {
                                try {
                                    if (!root)
                                        root = (0, client_1.createRoot)(container);
                                    root.render(react_1.default.createElement(PopupContent_1.default, { feature, layerName }));
                                }
                                catch { }
                            });
                            lyr.on('popupclose', () => { try {
                                root?.unmount?.();
                                root = null;
                            }
                            catch { } });
                            // Collect the data
                            if (!collectedProperties.has(id)) {
                                collectedProperties.set(id, properties);
                            }
                            // Check if the new data has better precision than the previous one
                            const isPoint = geometry?.type === 'Point' || geometry?.type === 'MultiPoint';
                            const currP = isPoint ? 0 : (0, mapMath_1.approxPrecisionMeters)(map);
                            const prevP = collectedGeometriesPrecision.get(id) ?? Number.POSITIVE_INFINITY;
                            // If this geometry is better than the previous one, keep it
                            if (currP < prevP) {
                                if (geometry) {
                                    collectedGeometries.set(id, geometry);
                                    collectedGeometriesPrecision.set(id, currP);
                                }
                            }
                        }
                        catch { }
                        report();
                        // Add info for click testing
                        try {
                            lyr.on('click', (ev) => {
                                try {
                                    ev.originalEvent._odlFeatureClick = true;
                                }
                                catch { }
                                // Allow normal Leaflet popup handling; just mark + center + select
                                try {
                                    if (ev && ev.latlng)
                                        map.panTo?.(ev.latlng, { animate: true });
                                }
                                catch { }
                                try {
                                    onFeatureClickId?.(id);
                                }
                                catch { }
                            });
                            if (geometry?.type === 'LineString' || geometry?.type === 'MultiLineString') {
                                hitMgr.addLine(geometry, id, lyr);
                            }
                        }
                        catch { }
                    }
                });
                if (!layer)
                    return;
                if (cancelled)
                    return;
                await new Promise((resolveReady) => {
                    try {
                        map.whenReady(resolveReady);
                    }
                    catch {
                        resolveReady();
                    }
                });
                // Defer one tick to ensure container is fully sized before adding
                await new Promise((r) => setTimeout(() => r(), 0));
                try {
                    // Guard against unmounted map
                    if (map?.remove) {
                        layer.addTo(map);
                    }
                    try {
                        layer.bringToFront?.();
                    }
                    catch { }
                    if (layer.query) {
                        await new Promise((resolve) => {
                            layer.query().bounds((err, latlngbounds) => {
                                if (!err && latlngbounds) {
                                    onComputedBounds?.(latlngbounds);
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
                    onStatusChange?.('loaded');
                }
            }
            catch {
                if (!cancelled)
                    onStatusChange?.('error');
            }
        })();
        return () => {
            cancelled = true;
            try {
                onFeatureCollection?.({ type: 'FeatureCollection', features: [] });
            }
            catch { }
            try {
                hitMgr.destroy();
            }
            catch { }
            if (layer) {
                try {
                    map.removeLayer(layer);
                }
                catch { }
            }
        };
    }, [url, where, map]);
    return null;
}
function inferLayerName(serviceMeta, layerUrl) {
    try {
        // Try to get layer id from URL
        const m = String(layerUrl || '').match(/\/(\d+)(?:\/?(?:query)?$)?/);
        const id = m ? Number(m[1]) : undefined;
        if (id != null && serviceMeta && Array.isArray(serviceMeta.layers)) {
            const layer = serviceMeta.layers.find((l) => l && l.id === id);
            if (layer && layer.name)
                return String(layer.name);
        }
        // Fall back to document title / mapName
        const title = (serviceMeta?.documentInfo?.Title && String(serviceMeta.documentInfo.Title).trim())
            || (serviceMeta?.mapName && String(serviceMeta.mapName).trim());
        return title || undefined;
    }
    catch {
        return undefined;
    }
}
