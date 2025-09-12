"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = CopyButton;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const CopyIcon_1 = require("../icons/CopyIcon");
function CopyButton({ text }) {
    const [copied, setCopied] = react_1.default.useState(false);
    async function copy() {
        const t = text || '';
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(t);
            }
            else {
                const ta = document.createElement('textarea');
                ta.value = t;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                try {
                    document.execCommand('copy');
                }
                catch { }
                document.body.removeChild(ta);
            }
        }
        catch { }
        try {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        }
        catch { }
    }
    return ((0, jsx_runtime_1.jsxs)("span", { style: { position: 'relative', display: 'inline-flex', alignItems: 'center' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: copy, title: copied ? 'Copied!' : 'Copy to clipboard', "aria-label": "Copy to clipboard", style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: '1px solid #2b3050', background: copied ? '#1b2238' : '#0c0f1a', color: '#e6e8ef', cursor: 'pointer', transition: 'background-color 200ms ease', padding: '0px' }, children: copied ? ((0, jsx_runtime_1.jsx)("span", { "aria-hidden": "true", style: { fontSize: 12 }, children: "\u2713" })) : ((0, jsx_runtime_1.jsx)(CopyIcon_1.default, { size: 20 })) }), copied && ((0, jsx_runtime_1.jsx)("span", { style: { position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,12,20,0.95)', color: '#e6e8ef', border: '1px solid #2b3050', borderRadius: 6, padding: '2px 6px', fontSize: 10, whiteSpace: 'nowrap', pointerEvents: 'none' }, children: "Copied!" }))] }));
}
