"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PopupContent;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const CopyButton_1 = require("./ui/CopyButton");
const format_1 = require("../lib/format");
function PopupContent({ feature, layerName, maxWidth = 340, maxHeight = 240 }) {
    const { properties = {}, geometry, id } = feature;
    const [tab, setTab] = react_1.default.useState('attrs');
    const entries = react_1.default.useMemo(() => Object.entries(properties || {})
        .filter(([k]) => !['__id', '__precision_m', '__zoom'].includes(k)), [properties]);
    const jsonPretty = react_1.default.useMemo(() => JSON.stringify(properties || {}, null, 2), [properties]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "odl-pop-react", style: {
            maxWidth,
            width: maxWidth,
            minWidth: 280,
            font: '12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
            color: '#e6e8ef',
            background: '#0c0f1a',
            border: '1px solid #2b3050',
            borderRadius: 8,
            overflow: 'hidden',
        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #2b3050', background: '#12162a' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 600, flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: layerName || 'Feature' }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', color: '#c3c7d5' }, children: [(0, jsx_runtime_1.jsx)(Badge, { title: "Geometry type", children: String((geometry && geometry.type) || 'Unknown') }), id !== undefined && id !== null ? (0, jsx_runtime_1.jsxs)(Badge, { title: "Feature id", children: ["id: ", String(id)] }) : null, layerName ? (0, jsx_runtime_1.jsx)(Badge, { title: "Layer name", children: layerName }) : null] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 6, padding: '6px 8px', borderBottom: '1px solid #2b3050', background: '#0c0f1a', alignItems: 'center' }, children: [(0, jsx_runtime_1.jsx)(TabButton, { active: tab === 'attrs', onClick: () => setTab('attrs'), children: "Attributes" }), (0, jsx_runtime_1.jsx)(TabButton, { active: tab === 'json', onClick: () => setTab('json'), children: "JSON" }), (0, jsx_runtime_1.jsx)("div", { style: { marginLeft: 'auto' } }), (0, jsx_runtime_1.jsx)(CopyButton_1.default, { text: tab === 'json' ? jsonPretty : jsonPretty })] }), tab === 'attrs' ? ((0, jsx_runtime_1.jsx)("div", { style: { maxHeight, overflow: 'auto' }, children: (0, jsx_runtime_1.jsx)("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: (0, jsx_runtime_1.jsx)("tbody", { children: entries.length === 0 ? ((0, jsx_runtime_1.jsx)("tr", { children: (0, jsx_runtime_1.jsx)("td", { style: { color: '#9aa0b4', padding: '8px 10px' }, colSpan: 2, children: "(no attributes)" }) })) : entries.map(([k, v]) => ((0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsx)("th", { style: { textAlign: 'left', padding: '6px 10px', whiteSpace: 'nowrap', color: '#e6e8ef', borderTop: '1px solid #1b2238' }, children: k }), (0, jsx_runtime_1.jsx)("td", { style: { padding: '6px 10px', color: '#c3c7d5', borderTop: '1px solid #1b2238' }, children: (0, format_1.formatAttrValue)(v) })] }, k))) }) }) })) : ((0, jsx_runtime_1.jsx)("div", { style: { maxHeight, overflow: 'auto', padding: '8px 10px', background: '#0c0f1a' }, children: (0, jsx_runtime_1.jsx)("pre", { style: { margin: 0, whiteSpace: 'pre', color: '#c3c7d5' }, children: jsonPretty }) }))] }));
}
function TabButton({ active, onClick, children }) {
    return ((0, jsx_runtime_1.jsx)("button", { onClick: onClick, style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: `1px solid ${active ? '#5b8cff' : '#2b3050'}`, background: active ? '#1b2238' : '#12162a', color: '#e6e8ef', cursor: 'pointer' }, children: children }));
}
function Badge({ title, children }) {
    return ((0, jsx_runtime_1.jsx)("span", { title: title, style: { display: 'inline-block', fontSize: 11, border: '1px solid #2b3050', borderRadius: 999, padding: '2px 6px', background: '#0c0f1a' }, children: children }));
}
