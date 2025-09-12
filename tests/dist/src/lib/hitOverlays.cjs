"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHitOverlayManager = createHitOverlayManager;
const leaflet_1 = require("leaflet");
function createHitOverlayManager(map, { onClick }) {
    const hitLayers = [];
    // No point hover/click helper — rely on native feature click.
    return {
        addLine: (geometry, id, baseLayer) => {
            try {
                const hit = leaflet_1.default.geoJSON({ type: 'Feature', geometry, properties: { __id: id } }, {
                    style: { color: '#000', weight: 14, opacity: 0.001, fillOpacity: 0 },
                    interactive: true,
                    bubblingMouseEvents: false,
                });
                hit.on('click', (ev) => {
                    try {
                        leaflet_1.default.DomEvent?.stop?.(ev?.originalEvent);
                    }
                    catch { }
                    onClick(id);
                    try {
                        baseLayer?.openPopup?.();
                    }
                    catch { }
                });
                hit.addTo(map);
                try {
                    hit.bringToFront?.();
                }
                catch { }
                hitLayers.push(hit);
            }
            catch { }
        },
        destroy: () => {
            try {
                hitLayers.forEach((h) => {
                    try {
                        if (h && typeof h.remove === 'function' && typeof h.getPane !== 'function') {
                            h.remove();
                        }
                        else {
                            map.removeLayer(h);
                        }
                    }
                    catch { }
                });
            }
            catch { }
        }
    };
}
