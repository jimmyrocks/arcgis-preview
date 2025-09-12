"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = HighlightOverlay;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_leaflet_1 = require("react-leaflet");
const leaflet_1 = require("leaflet");
const ids_1 = require("../lib/ids");
function HighlightOverlay({ featureCollection, hoverId, selectedId, zoomOnSelect = true }) {
    const map = (0, react_leaflet_1.useMap)();
    const hoverFeature = react_1.default.useMemo(() => (0, ids_1.findFeatureById)(featureCollection, hoverId), [featureCollection, hoverId]);
    const selectedFeature = react_1.default.useMemo(() => (0, ids_1.findFeatureById)(featureCollection, selectedId), [featureCollection, selectedId]);
    react_1.default.useEffect(() => {
        if (!zoomOnSelect)
            return;
        if (!selectedFeature)
            return;
        try {
            const g = leaflet_1.default.geoJSON(selectedFeature);
            const b = g.getBounds();
            if (b && b.isValid()) {
                map.fitBounds(b.pad(0.2), { maxZoom: 14 });
            }
            g.remove();
        }
        catch { }
    }, [selectedFeature, map, zoomOnSelect]);
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [selectedFeature ? ((0, jsx_runtime_1.jsx)(react_leaflet_1.GeoJSON, { data: selectedFeature, pane: "highlight", style: { color: '#5b8cff', weight: 4, opacity: 0.95, fillColor: '#5b8cff', fillOpacity: 0.15 }, interactive: false, bubblingMouseEvents: false }, `selected-${String(selectedId)}`)) : null, hoverFeature && String(hoverId) !== String(selectedId) ? ((0, jsx_runtime_1.jsx)(react_leaflet_1.GeoJSON, { data: hoverFeature, pane: "highlight", style: { color: '#ffd166', weight: 3, opacity: 0.9, dashArray: '4 3', fillColor: '#ffd166', fillOpacity: 0.08 }, interactive: false, bubblingMouseEvents: false }, `hover-${String(hoverId)}`)) : null] }));
}
