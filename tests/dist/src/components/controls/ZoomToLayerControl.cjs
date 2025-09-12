"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ZoomToLayerControl;
const react_1 = require("react");
const react_leaflet_1 = require("react-leaflet");
const leaflet_1 = require("leaflet");
function ZoomToLayerControl({ bounds }) {
    const map = (0, react_leaflet_1.useMap)();
    const controlRef = react_1.default.useRef(null);
    const buttonRef = react_1.default.useRef(null);
    // Only create/show the control when bounds exist
    react_1.default.useEffect(() => {
        if (!bounds)
            return; // no extent yet -> no control
        const C = leaflet_1.default.Control.extend({
            options: { position: 'topright' },
            onAdd: function () {
                const container = leaflet_1.default.DomUtil.create('div', 'leaflet-control leaflet-bar');
                const a = leaflet_1.default.DomUtil.create('a', '', container);
                a.href = '#';
                a.title = 'Zoom to layer extent';
                a.setAttribute('role', 'button');
                a.style.width = '28px';
                a.style.height = '28px';
                a.style.display = 'flex';
                a.style.alignItems = 'center';
                a.style.justifyContent = 'center';
                a.innerHTML = iconSvg;
                buttonRef.current = a;
                return container;
            },
        });
        const ctl = new C();
        controlRef.current = ctl;
        map.addControl(ctl);
        const btn = buttonRef.current;
        const onClick = (e) => {
            e.preventDefault();
            if (!bounds)
                return;
            try {
                map.fitBounds(bounds.pad(0.1), { maxZoom: 12 });
            }
            catch { }
        };
        if (btn)
            btn.addEventListener('click', onClick);
        return () => {
            try {
                if (btn)
                    btn.removeEventListener('click', onClick);
            }
            catch { }
            try {
                map.removeControl(ctl);
            }
            catch { }
            buttonRef.current = null;
            controlRef.current = null;
        };
    }, [map, bounds]);
    return null;
}
const iconSvg = `
<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- four corner brackets -->
    <path d="M4 9V5h4"/>
    <path d="M20 9V5h-4"/>
    <path d="M4 15v4h4"/>
    <path d="M20 15v4h-4"/>
    <!-- inner rectangle representing layer extent -->
    <rect x="7" y="8" width="10" height="8" rx="1"/>
  </g>
</svg>`;
