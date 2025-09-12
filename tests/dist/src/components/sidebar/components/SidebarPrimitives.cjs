"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabelValue = LabelValue;
exports.HtmlValue = HtmlValue;
const jsx_runtime_1 = require("react/jsx-runtime");
function LabelValue({ label, children }) {
    return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 8 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { minWidth: 92, color: '#9aa0b4', fontSize: 12 }, children: [label, ":"] }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12 }, children: children })] }));
}
function HtmlValue({ html }) {
    const safe = html || '';
    if (!safe.trim())
        return (0, jsx_runtime_1.jsx)("span", { children: "\u2014" });
    return ((0, jsx_runtime_1.jsx)("div", { style: {
            fontSize: 12,
            lineHeight: 1.4,
            maxHeight: 160,
            overflowY: 'auto',
            padding: '6px 8px',
            border: '1px solid #2b3050',
            borderRadius: 6,
            background: '#0c0f1a',
        }, dangerouslySetInnerHTML: { __html: safe } }));
}
