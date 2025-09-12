"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExportMeta = buildExportMeta;
function buildExportMeta({ exportType, geometryType, zoom, bbox, where, rendered, totalInView, tolerance, serviceUrl, layerId, crs }) {
    return {
        export_type: exportType,
        geometry_type: geometryType || null,
        zoom: zoom ?? null,
        bbox: bbox || null,
        where: where || null,
        rendered_count: rendered,
        total_in_view: typeof totalInView === 'number' ? totalInView : null,
        display_tolerance_m_approx: tolerance ? { min: tolerance[0], max: tolerance[1] } : (geometryType && /point/i.test(geometryType) ? 'exact' : null),
        drawn_at_iso: new Date().toISOString(),
        service_url: serviceUrl || null,
        layer_id: typeof layerId === 'number' ? layerId : null,
        crs: crs || null,
    };
}
exports.default = buildExportMeta;
