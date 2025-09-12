"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MapView;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_leaflet_1 = require("react-leaflet");
require("leaflet/dist/leaflet.css");
const leaflet_1 = require("leaflet");
require("esri-leaflet-renderers");
const EsriLayer_1 = require("./EsriLayer");
const HighlightOverlay_1 = require("./HighlightOverlay");
const geometry_1 = require("../lib/geometry");
const ZoomToLayerControl_1 = require("./controls/ZoomToLayerControl");
function MapAutoResizer() {
    const map = (0, react_leaflet_1.useMap)();
    (0, react_1.useEffect)(() => {
        const invalidate = () => {
            try {
                map.invalidateSize({ animate: false });
            }
            catch { }
        };
        // Initial pass after mount/layout
        const t = setTimeout(invalidate, 0);
        // Window resize
        window.addEventListener('resize', invalidate);
        // Observe container size changes (more reliable than window resize)
        let ro = null;
        try {
            ro = new ResizeObserver(() => invalidate());
            ro.observe(map.getContainer());
        }
        catch { }
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', invalidate);
            try {
                ro?.disconnect();
            }
            catch { }
        };
    }, [map]);
    return null;
}
function MapInfoReporter({ onBoundsChange, onCenterZoomChange, onMouseMove, }) {
    const map = (0, react_leaflet_1.useMap)();
    (0, react_leaflet_1.useMapEvents)({
        load() {
            try {
                onBoundsChange?.(map.getBounds());
                onCenterZoomChange?.(map.getCenter(), map.getZoom());
            }
            catch { }
        },
        moveend() {
            try {
                onBoundsChange?.(map.getBounds());
                onCenterZoomChange?.(map.getCenter(), map.getZoom());
            }
            catch { }
        },
        zoomend() {
            try {
                onBoundsChange?.(map.getBounds());
                onCenterZoomChange?.(map.getCenter(), map.getZoom());
            }
            catch { }
        },
        resize() {
            try {
                onBoundsChange?.(map.getBounds());
                onCenterZoomChange?.(map.getCenter(), map.getZoom());
            }
            catch { }
        },
        mousemove(e) {
            try {
                onMouseMove?.(e.latlng);
            }
            catch { }
        },
    });
    react_1.default.useEffect(() => {
        const t = setTimeout(() => {
            try {
                onBoundsChange?.(map.getBounds());
                onCenterZoomChange?.(map.getCenter(), map.getZoom());
            }
            catch { }
        }, 50);
        return () => clearTimeout(t);
    }, [map, onBoundsChange, onCenterZoomChange]);
    return null;
}
function MapView({ serviceUrl, selectedMapLayerId, where, onBoundsChange, onCenterZoomChange, onMouseMove, onStatusChange, onServiceMetadata, zoomToExtent, onFeatureCollection, featureCollection, hoverFeatureId, selectedFeatureId, onMapFeatureHoverId, onMapFeatureClickId }) {
    const [layerBounds, setLayerBounds] = react_1.default.useState(null);
    return ((0, jsx_runtime_1.jsx)("div", { style: { position: 'relative', height: '100%', width: '100%', minHeight: 0 }, children: (0, jsx_runtime_1.jsxs)(react_leaflet_1.MapContainer, { center: [37.7749, -122.4194], zoom: 10, preferCanvas: true, style: { position: 'absolute', inset: 0 }, children: [(0, jsx_runtime_1.jsx)(MapAutoResizer, {}), (0, jsx_runtime_1.jsx)(react_leaflet_1.Pane, { name: "highlight", style: { zIndex: 650, pointerEvents: 'none' } }), (0, jsx_runtime_1.jsx)(MapClearSelection, { onClear: () => { try {
                        onMapFeatureClickId?.(null);
                    }
                    catch { } } }), (0, jsx_runtime_1.jsx)(MapInfoReporter, { onBoundsChange: onBoundsChange, onCenterZoomChange: onCenterZoomChange, onMouseMove: onMouseMove }), (0, jsx_runtime_1.jsxs)(react_leaflet_1.LayersControl, { position: "topright", children: [(0, jsx_runtime_1.jsx)(react_leaflet_1.LayersControl.BaseLayer, { checked: true, name: "USGS National Map (Topo)", children: (0, jsx_runtime_1.jsx)(react_leaflet_1.TileLayer, { url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles courtesy of the U.S. Geological Survey" }) }), (0, jsx_runtime_1.jsx)(react_leaflet_1.LayersControl.BaseLayer, { name: "USGS Imagery Topo", children: (0, jsx_runtime_1.jsx)(react_leaflet_1.TileLayer, { url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}", attribution: "Imagery courtesy of the U.S. Geological Survey" }) }), (0, jsx_runtime_1.jsx)(react_leaflet_1.LayersControl.BaseLayer, { name: "USGS Imagery Only", children: (0, jsx_runtime_1.jsx)(react_leaflet_1.TileLayer, { url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}", attribution: "Imagery courtesy of the U.S. Geological Survey" }) }), (0, jsx_runtime_1.jsx)(react_leaflet_1.LayersControl.BaseLayer, { name: "OpenStreetMap", children: (0, jsx_runtime_1.jsx)(react_leaflet_1.TileLayer, { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "\u00A9 OpenStreetMap contributors" }) }), (0, jsx_runtime_1.jsx)(react_leaflet_1.LayersControl.BaseLayer, { name: "CARTO Positron", children: (0, jsx_runtime_1.jsx)(react_leaflet_1.TileLayer, { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "\u00A9 OpenStreetMap contributors \u00A9 CARTO", subdomains: ["a", "b", "c", "d"], detectRetina: true }) }), (0, jsx_runtime_1.jsx)(react_leaflet_1.LayersControl.BaseLayer, { name: "CARTO DarkMatter", children: (0, jsx_runtime_1.jsx)(react_leaflet_1.TileLayer, { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "\u00A9 OpenStreetMap contributors \u00A9 CARTO", subdomains: ["a", "b", "c", "d"], detectRetina: true }) })] }), serviceUrl ? ((0, jsx_runtime_1.jsx)(EsriLayer_1.default, { serviceUrl: serviceUrl, selectedMapLayerId: selectedMapLayerId, where: where, onStatusChange: onStatusChange, onServiceMetadata: onServiceMetadata, onFeatureCollection: onFeatureCollection, onFeatureHoverId: onMapFeatureHoverId, onFeatureClickId: onMapFeatureClickId, onComputedBounds: (b) => setLayerBounds(b) })) : null, (0, jsx_runtime_1.jsx)(HighlightOverlay_1.default, { featureCollection: featureCollection, hoverId: hoverFeatureId, selectedId: selectedFeatureId, zoomOnSelect: false }), (0, jsx_runtime_1.jsx)(CenterOnSelectedEffect, { featureCollection: featureCollection, selectedId: selectedFeatureId }), (0, jsx_runtime_1.jsx)(ZoomToLayerControl_1.default, { bounds: layerBounds }), (0, jsx_runtime_1.jsx)(ZoomToExtentEffect, { extent: zoomToExtent })] }) }));
}
function ZoomToExtentEffect({ extent }) {
    const map = (0, react_leaflet_1.useMap)();
    (0, react_1.useEffect)(() => {
        if (!extent)
            return;
        const b = (0, geometry_1.extentToBounds)(extent);
        if (b) {
            try {
                map.fitBounds(b, { maxZoom: 12 });
            }
            catch { }
        }
    }, [extent, map]);
    return null;
}
function CenterOnSelectedEffect({ featureCollection, selectedId }) {
    const map = (0, react_leaflet_1.useMap)();
    (0, react_1.useEffect)(() => {
        if (!featureCollection || selectedId == null)
            return;
        try {
            const feats = Array.isArray(featureCollection.features) ? featureCollection.features : [];
            const f = feats.find((x) => x && (String(x.id) === String(selectedId) || String(x?.properties?.__id) === String(selectedId)));
            if (!f)
                return;
            const g = leaflet_1.default.geoJSON(f);
            const b = g.getBounds();
            g.remove();
            if (b && b.isValid()) {
                const c = b.getCenter();
                try {
                    map.panTo?.(c, { animate: true });
                }
                catch { }
            }
        }
        catch { }
    }, [featureCollection, selectedId, map]);
    return null;
}
function MapClearSelection({ onClear }) {
    (0, react_leaflet_1.useMapEvents)({
        click(e) {
            try {
                // Skip clearing when the click originated from a feature handler
                if (e?.originalEvent && e.originalEvent._odlFeatureClick)
                    return;
                onClear?.();
            }
            catch { }
        },
    });
    return null;
}
