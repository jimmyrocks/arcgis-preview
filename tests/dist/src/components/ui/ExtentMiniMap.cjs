"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ExtentMiniMap;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_leaflet_1 = require("react-leaflet");
require("leaflet/dist/leaflet.css");
const geometry_1 = require("../../lib/geometry");
function FitBounds({ bounds }) {
    const map = (0, react_leaflet_1.useMap)();
    react_1.default.useEffect(() => {
        if (!bounds)
            return;
        try {
            map.fitBounds(bounds.pad(0.05));
        }
        catch { }
    }, [map, bounds]);
    return null;
}
function ExtentMiniMap({ extent, height = 120 }) {
    const bounds = react_1.default.useMemo(() => (0, geometry_1.extentToBounds)(extent), [extent]);
    if (!bounds)
        return null;
    const rect = [bounds.getSouthWest(), bounds.getNorthEast()];
    return ((0, jsx_runtime_1.jsx)("div", { style: { width: '100%', height, border: '1px solid #2b3050', borderRadius: 6, overflow: 'hidden' }, children: (0, jsx_runtime_1.jsxs)(react_leaflet_1.MapContainer, { style: { width: '100%', height: '100%' }, center: bounds.getCenter(), zoom: 3, zoomControl: false, doubleClickZoom: false, scrollWheelZoom: false, dragging: false, attributionControl: false, children: [(0, jsx_runtime_1.jsx)(react_leaflet_1.TileLayer, { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" }), (0, jsx_runtime_1.jsx)(react_leaflet_1.Rectangle, { bounds: rect, pathOptions: { color: '#5b8cff', weight: 2, fill: false } }), (0, jsx_runtime_1.jsx)(FitBounds, { bounds: bounds })] }) }));
}
