"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TimeBadge;
const jsx_runtime_1 = require("react/jsx-runtime");
function TimeBadge({ text }) {
    if (!text)
        return null;
    return ((0, jsx_runtime_1.jsx)("span", { style: { display: 'inline-block', fontSize: 11, background: '#1b2238', color: '#bcd0ff', border: '1px solid #2b3050', padding: '2px 6px', borderRadius: 999 }, children: text }));
}
