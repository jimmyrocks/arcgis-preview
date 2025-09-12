"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = FlashButton;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
function FlashButton({ onClick, children, style, title, ariaLabel }) {
    const [flash, setFlash] = react_1.default.useState(false);
    function handleClick() {
        try {
            setFlash(true);
            setTimeout(() => setFlash(false), 350);
        }
        catch { }
        onClick();
    }
    return ((0, jsx_runtime_1.jsx)("button", { onClick: handleClick, title: title, "aria-label": ariaLabel, style: {
            padding: '10px 14px',
            fontSize: 16,
            borderRadius: 8,
            border: '1px solid #2b3050',
            background: flash ? '#1b2238' : '#0c0f1a',
            color: '#e6e8ef',
            cursor: 'pointer',
            transition: 'background-color 250ms ease',
            ...style,
        }, children: children }));
}
