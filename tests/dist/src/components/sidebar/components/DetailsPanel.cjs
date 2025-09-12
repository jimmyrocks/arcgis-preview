"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DetailsPanel;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const Sidebar_1 = require("./Sidebar");
const DataReportTable_1 = require("./DataReportTable");
const ExtentMiniMap_1 = require("../../ui/ExtentMiniMap");
const TimeBadge_1 = require("../../ui/TimeBadge");
const arcgis_meta_1 = require("../../../lib/arcgis-meta");
function DetailsPanel({ serviceMeta, layerMeta, loading, isDynamic, onZoomToExtent, featureCount, serviceUrl }) {
    if (loading)
        return (0, jsx_runtime_1.jsx)("div", { style: { color: '#9aa0b4', fontSize: 12, marginTop: 8 }, children: "Loading metadata\u2026" });
    if (layerMeta && typeof layerMeta.id === 'number') {
        return ((0, jsx_runtime_1.jsx)(LayerDetailsSection, { layerMeta: layerMeta, serviceMeta: serviceMeta, onZoomToExtent: onZoomToExtent, featureCount: featureCount, serviceUrl: serviceUrl }));
    }
    if (serviceMeta) {
        return ((0, jsx_runtime_1.jsx)(ServiceDetailsSection, { serviceMeta: serviceMeta, onZoomToExtent: onZoomToExtent, serviceUrl: serviceUrl }));
    }
    return null;
}
function LayerDetailsSection({ layerMeta, serviceMeta, onZoomToExtent, featureCount, serviceUrl }) {
    const fieldCount = Array.isArray(layerMeta.fields) ? layerMeta.fields.length : 0;
    const extent = layerMeta?.extent;
    const timeInfo = layerMeta?.timeInfo || serviceMeta?.timeInfo;
    const timeBadge = (0, arcgis_meta_1.timeExtentToBadge)(timeInfo);
    const [lastEdited, setLastEdited] = react_1.default.useState('');
    const [extentOpen, setExtentOpen] = react_1.default.useState(false);
    react_1.default.useEffect(() => {
        let cancelled = false;
        (0, arcgis_meta_1.computeLastEditDateString)(layerMeta, serviceUrl).then((s) => { if (!cancelled)
            setLastEdited(s || ''); }).catch(() => { });
        return () => { cancelled = true; };
    }, [layerMeta, serviceUrl]);
    return ((0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 10, display: 'grid', gap: 6 }, children: [extent ? ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setExtentOpen(o => !o), style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: 'pointer' }, children: extentOpen ? 'Hide Extent Map' : 'Show Extent Map' }), onZoomToExtent ? ((0, jsx_runtime_1.jsx)("button", { onClick: () => onZoomToExtent(extent), style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: 'pointer' }, children: "Zoom to Layer Extent" })) : null] }), extentOpen ? (0, jsx_runtime_1.jsx)(ExtentMiniMap_1.default, { extent: extent }) : null] })) : null, timeBadge ? ((0, jsx_runtime_1.jsx)("div", { style: { marginTop: 2 }, children: (0, jsx_runtime_1.jsx)(TimeBadge_1.default, { text: timeBadge }) })) : null, (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Name", children: layerMeta.name || '—' }), (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Type", children: layerMeta.type || '—' }), (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Geometry", children: layerMeta.geometryType || '—' }), layerMeta.displayField ? (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Display Field", children: layerMeta.displayField }) : null, typeof layerMeta?.minScale === 'number' || typeof layerMeta?.maxScale === 'number' ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Scale Range", children: formatScaleRange(layerMeta?.minScale, layerMeta?.maxScale) })) : null, (layerMeta?.drawingInfo?.renderer?.type) ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Renderer", children: String(layerMeta.drawingInfo.renderer.type) })) : null, (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Description", children: (0, jsx_runtime_1.jsx)(Sidebar_1.HtmlValue, { html: layerMeta.description || '' }) }), (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Records", children: typeof featureCount === 'number' ? featureCount.toLocaleString() : '—' }), (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Fields", children: fieldCount }), lastEdited ? (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Last Edited", children: lastEdited }) : null, fieldCount ? (0, jsx_runtime_1.jsx)(FieldsTable, { fields: layerMeta.fields || [] }) : null] }));
}
function ServiceDetailsSection({ serviceMeta, onZoomToExtent, serviceUrl }) {
    const title = serviceMeta?.documentInfo?.Title || serviceMeta.mapName || 'Service';
    const desc = serviceMeta?.serviceDescription || serviceMeta?.description || '';
    const layerCount = Array.isArray(serviceMeta.layers) ? serviceMeta.layers.length : 0;
    const tableCount = Array.isArray(serviceMeta.tables) ? serviceMeta.tables.length : 0;
    const extent = serviceMeta?.fullExtent || serviceMeta?.initialExtent;
    const timeBadge = (0, arcgis_meta_1.timeExtentToBadge)(serviceMeta?.timeInfo);
    const [extentOpen, setExtentOpen] = react_1.default.useState(false);
    return ((0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 10, display: 'grid', gap: 6 }, children: [extent ? ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setExtentOpen(o => !o), style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: 'pointer' }, children: extentOpen ? 'Hide Extent Map' : 'Show Extent Map' }), onZoomToExtent ? ((0, jsx_runtime_1.jsx)("button", { onClick: () => onZoomToExtent(extent), style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: 'pointer' }, children: "Zoom to Service Extent" })) : null] }), extentOpen ? (0, jsx_runtime_1.jsx)(ExtentMiniMap_1.default, { extent: extent }) : null] })) : null, (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Title", children: title }), (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Layers", children: layerCount }), (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Tables", children: tableCount }), desc ? (0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Description", children: (0, jsx_runtime_1.jsx)(Sidebar_1.HtmlValue, { html: desc }) }) : null, timeBadge ? ((0, jsx_runtime_1.jsx)("div", { children: (0, jsx_runtime_1.jsx)(TimeBadge_1.default, { text: timeBadge }) })) : null, serviceMeta?.spatialReference?.wkid || serviceMeta?.spatialReference?.latestWkid ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Spatial Ref", children: String(serviceMeta?.spatialReference?.latestWkid || serviceMeta?.spatialReference?.wkid) })) : null, serviceMeta?.capabilities ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Capabilities", children: serviceMeta.capabilities })) : null, serviceMeta?.supportedQueryFormats ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Query Formats", children: serviceMeta.supportedQueryFormats })) : null, typeof serviceMeta?.singleFusedMapCache === 'boolean' ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Cached Tiles", children: serviceMeta.singleFusedMapCache ? 'Yes' : 'No' })) : null, serviceMeta?.documentInfo?.Author ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Author", children: String(serviceMeta?.documentInfo?.Author) })) : null, serviceMeta?.documentInfo?.Category ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Category", children: String(serviceMeta?.documentInfo?.Category) })) : null, serviceUrl ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Endpoint", children: (0, jsx_runtime_1.jsx)("a", { href: serviceUrl, target: "_blank", rel: "noreferrer", style: { color: '#5b8cff', textDecoration: 'none' }, children: serviceUrl }) })) : null, serviceMeta?.copyrightText ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Copyright", children: serviceMeta.copyrightText })) : null, typeof serviceMeta?.maxRecordCount === 'number' ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Max Records", children: serviceMeta.maxRecordCount })) : null, typeof serviceMeta?.currentVersion === 'number' ? ((0, jsx_runtime_1.jsx)(Sidebar_1.LabelValue, { label: "Version", children: serviceMeta.currentVersion })) : null] }));
}
function FieldsTable({ fields }) {
    const rows = react_1.default.useMemo(() => {
        return (Array.isArray(fields) ? fields : []).map(f => ({
            alias: f.alias || f.name,
            name: f.name,
            type: f.type,
            length: typeof f.length === 'number' ? f.length : '',
        }));
    }, [fields]);
    if (!rows.length)
        return null;
    return ((0, jsx_runtime_1.jsx)("div", { style: { marginTop: 6 }, children: (0, jsx_runtime_1.jsx)(DataReportTable_1.default, { data: rows, datasetName: 'fields', displayFields: ['alias', 'name', 'type', 'length'], showHideButton: true, fullHeight: false, maxHeight: 220 }) }));
}
// helpers moved to src/lib/arcgis-meta.ts
function formatScaleRange(minScale, maxScale) {
    const min = typeof minScale === 'number' && Number.isFinite(minScale) ? minScale : null;
    const max = typeof maxScale === 'number' && Number.isFinite(maxScale) ? maxScale : null;
    if (min && max)
        return `${min} — ${max}`;
    if (min)
        return `≥ ${min}`;
    if (max)
        return `≤ ${max}`;
    return '—';
}
