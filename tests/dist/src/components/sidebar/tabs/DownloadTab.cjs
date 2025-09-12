"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DownloadTab;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const export_1 = require("../../../lib/export");
const exportMeta_1 = require("../../../lib/exportMeta");
const kml_1 = require("../../../lib/kml");
const esriLayer_1 = require("../../../lib/esriLayer");
const CopyButton_1 = require("../../ui/CopyButton");
const react_toastify_1 = require("react-toastify");
const mapMath_1 = require("../../../lib/mapMath");
function DownloadTab({ rows, datasetName = 'features', featureCollection, whereValue = '1=1', serviceUrl, layerId, geometryType, spatialWkid, zoom = 0, bbox = '', center = '', layerTotal, renderer }) {
    const hasGeom = Boolean(featureCollection && Array.isArray(featureCollection.features) && featureCollection.features.some((f) => f && f.geometry));
    const featureCount = hasGeom ? (featureCollection.features.length || 0) : 0;
    const attrRows = react_1.default.useMemo(() => {
        try {
            if (featureCollection && Array.isArray(featureCollection.features)) {
                return featureCollection.features.map((f) => ({ ...(f?.properties || {}) }));
            }
        }
        catch { }
        return Array.isArray(rows) ? rows : [];
    }, [featureCollection, rows]);
    const rowCount = attrRows.length;
    const isPoint = (geometryType || '').toLowerCase().includes('point');
    const [totalInView, setTotalInView] = react_1.default.useState(null);
    const [loadingCount, setLoadingCount] = react_1.default.useState(false);
    const [attrFormat, setAttrFormat] = react_1.default.useState('csv');
    react_1.default.useEffect(() => {
        let cancelled = false;
        async function loadCount() {
            setLoadingCount(true);
            try {
                const layerUrl = resolveLayerUrl(serviceUrl, layerId);
                if (isPoint && layerUrl && bbox) {
                    const n = await (0, esriLayer_1.fetchFeatureCountInExtent)(layerUrl, bbox, whereValue);
                    if (!cancelled)
                        setTotalInView(n);
                }
                else {
                    if (!cancelled)
                        setTotalInView(null);
                }
            }
            catch {
                if (!cancelled)
                    setTotalInView(null);
            }
            finally {
                if (!cancelled)
                    setLoadingCount(false);
            }
        }
        loadCount();
        return () => { cancelled = true; };
    }, [serviceUrl, layerId, whereValue, bbox, isPoint]);
    const readiness = react_1.default.useMemo(() => {
        if (!hasGeom)
            return { color: 'gray', label: 'N/A' };
        if (!isPoint)
            return { color: 'red', label: 'Low precision' };
        if (loadingCount)
            return { color: 'yellow', label: 'Checking…' };
        // Green only when ALL features are loaded into memory
        if (typeof layerTotal === 'number' && layerTotal > 0 && featureCount >= layerTotal) {
            return { color: 'green', label: 'Complete' };
        }
        return featureCount > 0 ? { color: 'yellow', label: 'Partial' } : { color: 'gray', label: 'N/A' };
    }, [hasGeom, isPoint, featureCount, totalInView, loadingCount, layerTotal]);
    const attrReadiness = react_1.default.useMemo(() => {
        if (rowCount === 0)
            return { color: 'red', label: 'No data' };
        // Green only when ALL features are loaded into memory
        if (typeof layerTotal === 'number' && layerTotal > 0 && rowCount >= layerTotal) {
            return { color: 'green', label: 'Complete' };
        }
        return { color: 'yellow', label: 'Partial' };
    }, [rowCount, layerTotal]);
    const tolerance = react_1.default.useMemo(() => {
        // Approx display tolerance (meters) based on zoom and center latitude
        const lat = parseFloat((center || '').split(',')[0] || '0'); // center comes as "lat, lng"
        if (isPoint)
            return { text: 'Exact locations (no simplification)', range: null };
        const base = (0, mapMath_1.approxPrecisionMetersFromZoomLat)(zoom || 0, lat);
        const min = Math.max(1, base);
        const max = Math.max(min, Math.round(base * (4 / 1.5)));
        return { text: `Display-simplified; vertices spaced ~${min}–${max} m at this zoom`, range: [min, max] };
    }, [zoom, center, isPoint]);
    const storedRange = react_1.default.useMemo(() => {
        try {
            const r = featureCollection?._precision_range_m;
            if (r && typeof r.min === 'number' && typeof r.max === 'number')
                return r;
        }
        catch { }
        return null;
    }, [featureCollection]);
    const [geomFormat, setGeomFormat] = react_1.default.useState('geojson');
    function downloadGeometry() {
        if (!hasGeom)
            return;
        const out = (0, export_1.filterFeatureCollectionByRowIds)(featureCollection, rows || []);
        const meta = (0, exportMeta_1.default)({
            exportType: 'on-screen', geometryType, zoom, bbox, where: whereValue, rendered: featureCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
        });
        const name = buildExportFileName(datasetName, 'on-screen', zoom, featureCount);
        if (geomFormat === 'kml') {
            const kml = (0, kml_1.featureCollectionToKml)(out, { name: datasetName, metaJson: JSON.stringify(meta), renderer, geometryType, inlineIcons: false });
            (0, export_1.downloadText)(`${name}.kml`, 'application/vnd.google-earth.kml+xml', kml);
        }
        else if (geomFormat === 'kmz') {
            const kmz = (0, kml_1.featureCollectionToKmz)(out, { name: datasetName, metaJson: JSON.stringify(meta), renderer, geometryType });
            (0, export_1.downloadBlob)(`${name}.kmz`, 'application/vnd.google-earth.kmz', kmz);
        }
        else {
            try {
                out._export_meta = meta;
            }
            catch { }
            (0, export_1.downloadText)(`${name}.geojson`, 'application/geo+json', JSON.stringify(out));
        }
        showExportToast(readiness.color, featureCount, totalInView ?? undefined);
    }
    function downloadAttributes() {
        const meta = (0, exportMeta_1.default)({
            exportType: 'attributes', geometryType, zoom, bbox, where: whereValue, rendered: rowCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
        });
        const name = buildExportFileName(datasetName, 'attributes', zoom, rowCount);
        if (attrFormat === 'json') {
            const payload = { _export_meta: meta, rows: attrRows || [] };
            (0, export_1.downloadText)(`${name}.json`, 'application/json', JSON.stringify(payload));
        }
        else {
            const csv = toCSV(attrRows || []);
            (0, export_1.downloadText)(`${name}.csv`, 'text/csv', csv);
            (0, export_1.downloadText)(`${name}.meta.json`, 'application/json', JSON.stringify(meta));
        }
        const color = attrReadiness.color;
        const total = (isPoint && totalInView != null) ? totalInView : layerTotal;
        showExportToast(color, rowCount, total);
    }
    const totalForGeo = (() => {
        if (typeof layerTotal === 'number')
            return layerTotal;
        if (isPoint && totalInView != null)
            return totalInView;
        return null;
    })();
    const statusDetailGeo = (() => {
        if (readiness.color === 'yellow')
            return 'Pan/zoom the map to load the full dataset.';
        if (readiness.color === 'green')
            return 'All records are loaded.';
        return '';
    })();
    const statusDetailAttr = (() => {
        if (attrReadiness.color === 'yellow')
            return 'Pan/zoom the map to load the full dataset.';
        if (attrReadiness.color === 'green')
            return 'All records are loaded.';
        if (attrReadiness.color === 'red')
            return 'No records in view.';
        return '';
    })();
    return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gap: 10 }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: '#9aa0b4', fontSize: 12 }, children: "Download current data" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [(0, jsx_runtime_1.jsx)("small", { style: { color: '#9aa0b4' }, children: "Quick Copy:" }), (0, jsx_runtime_1.jsx)(CopyButton_1.default, { text: bbox || '' }), (0, jsx_runtime_1.jsx)("span", { style: { color: '#9aa0b4' }, children: "BBox" }), (0, jsx_runtime_1.jsx)(CopyButton_1.default, { text: center || '' }), (0, jsx_runtime_1.jsx)("span", { style: { color: '#9aa0b4' }, children: "Center" })] }), (0, jsx_runtime_1.jsx)("div", { style: { border: '1px solid #2b3050', borderRadius: 6, overflow: 'hidden' }, children: (0, jsx_runtime_1.jsxs)("table", { className: "data-table", style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 }, children: [(0, jsx_runtime_1.jsx)("thead", { children: (0, jsx_runtime_1.jsxs)("tr", { style: { background: '#12162a' }, children: [(0, jsx_runtime_1.jsx)("th", { style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2b3050' } }), (0, jsx_runtime_1.jsx)("th", { style: { textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #2b3050' }, children: "Count" }), (0, jsx_runtime_1.jsx)("th", { style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2b3050' }, children: "Status" }), (0, jsx_runtime_1.jsx)("th", { style: { textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #2b3050' }, children: "Action" })] }) }), (0, jsx_runtime_1.jsxs)("tbody", { children: [(0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsxs)("td", { style: { padding: '6px 8px', borderBottom: '1px solid #1b2238' }, children: ["Geospatial", (0, jsx_runtime_1.jsx)("div", { style: { marginTop: 4 }, children: (0, jsx_runtime_1.jsxs)("select", { value: geomFormat, onChange: (e) => setGeomFormat(e.target.value || 'geojson'), style: { padding: '4px 6px', borderRadius: 4, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef' }, children: [(0, jsx_runtime_1.jsx)("option", { value: "geojson", children: "GeoJSON" }), (0, jsx_runtime_1.jsx)("option", { value: "kml", children: "KML" }), (0, jsx_runtime_1.jsx)("option", { value: "kmz", children: "KMZ (Google Earth)" })] }) })] }), (0, jsx_runtime_1.jsx)("td", { style: { padding: '6px 8px', borderBottom: '1px solid #1b2238', textAlign: 'right' }, children: hasGeom ? ((0, jsx_runtime_1.jsx)("div", { children: (0, jsx_runtime_1.jsxs)("div", { children: [featureCount.toLocaleString(), " ", totalForGeo != null ? ((0, jsx_runtime_1.jsxs)("span", { style: { color: '#9aa0b4' }, children: ["of ", totalForGeo.toLocaleString()] })) : null] }) })) : '—' }), (0, jsx_runtime_1.jsx)("td", { style: { padding: '6px 8px', borderBottom: '1px solid #1b2238', color: '#e6e8ef' }, children: (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, children: [(0, jsx_runtime_1.jsx)(ReadinessBadge, { color: readiness.color, label: readiness.label }), (0, jsx_runtime_1.jsx)("div", { style: { color: '#9aa0b4' }, children: "Display geometry is simplified; use backend tools for analysis." }), readiness.color === 'red' && storedRange ? ((0, jsx_runtime_1.jsxs)("div", { style: { color: '#9aa0b4' }, children: ["Stored precision range: ~", storedRange.min, "\u2013~", storedRange.max, " m"] })) : null, statusDetailGeo ? ((0, jsx_runtime_1.jsx)("div", { style: { color: '#9aa0b4' }, children: statusDetailGeo })) : null] }) }), (0, jsx_runtime_1.jsxs)("td", { style: { padding: '6px 8px', borderBottom: '1px solid #1b2238', textAlign: 'right' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: downloadGeometry, disabled: !hasGeom || featureCount === 0, title: !hasGeom || featureCount === 0 ? 'No features in view.' : undefined, style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: (!hasGeom || featureCount === 0) ? 'not-allowed' : 'pointer' }, children: "Download" }), featureCount > 10000 ? ((0, jsx_runtime_1.jsx)("div", { style: { color: '#9aa0b4', fontSize: 11, marginTop: 4 }, children: "Large export; may be slow to download." })) : null] })] }), (0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsxs)("td", { style: { padding: '6px 8px' }, children: ["Attributes", (0, jsx_runtime_1.jsx)("div", { style: { marginTop: 4 }, children: (0, jsx_runtime_1.jsxs)("select", { value: attrFormat, onChange: (e) => setAttrFormat(e.target.value || 'csv'), style: { padding: '4px 6px', borderRadius: 4, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef' }, children: [(0, jsx_runtime_1.jsx)("option", { value: "csv", children: "CSV" }), (0, jsx_runtime_1.jsx)("option", { value: "json", children: "JSON" })] }) })] }), (0, jsx_runtime_1.jsx)("td", { style: { padding: '6px 8px', textAlign: 'right' }, children: (0, jsx_runtime_1.jsxs)("div", { children: [rowCount.toLocaleString(), " ", typeof layerTotal === 'number' ? ((0, jsx_runtime_1.jsxs)("span", { style: { color: '#9aa0b4' }, children: ["of ", layerTotal.toLocaleString()] })) : null] }) }), (0, jsx_runtime_1.jsx)("td", { style: { padding: '6px 8px', color: '#e6e8ef' }, children: (0, jsx_runtime_1.jsxs)("div", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [(0, jsx_runtime_1.jsx)(ReadinessBadge, { color: attrReadiness.color, label: attrReadiness.label }), (0, jsx_runtime_1.jsx)("span", { style: { color: '#9aa0b4' }, children: statusDetailAttr })] }) }), (0, jsx_runtime_1.jsx)("td", { style: { padding: '6px 8px', textAlign: 'right' }, children: (0, jsx_runtime_1.jsx)("button", { onClick: downloadAttributes, disabled: !rowCount, title: !rowCount ? 'No attributes in view.' : undefined, style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: rowCount ? 'pointer' : 'not-allowed' }, children: "Download" }) })] })] })] }) }), (0, jsx_runtime_1.jsxs)("div", { style: { color: '#9aa0b4', fontSize: 12 }, children: ["Looking to download data? Try", ' ', (0, jsx_runtime_1.jsx)("a", { href: "https://geodatadownloader.com", target: "_blank", rel: "noreferrer", style: { color: '#5b8cff', textDecoration: 'none' }, children: "geodatadownloader.com" })] })] }));
}
function ReadinessBadge({ color, label }) {
    const dot = color === 'red' ? '🟥' : color === 'yellow' ? '🟨' : color === 'green' ? '🟩' : '⬜';
    return (0, jsx_runtime_1.jsxs)("span", { "aria-label": `Readiness: ${label}`, title: `Readiness: ${label}`, style: { whiteSpace: 'nowrap' }, children: [dot, " ", (0, jsx_runtime_1.jsx)("span", { style: { color: '#9aa0b4' }, children: label })] });
}
function resolveLayerUrl(serviceUrl, layerId) {
    if (!serviceUrl)
        return null;
    const trimmed = serviceUrl.replace(/\/+$/, '');
    if (/\/(\d+)$/.test(trimmed))
        return trimmed;
    if (typeof layerId === 'number' && /(MapServer|FeatureServer)$/i.test(trimmed))
        return `${trimmed}/${layerId}`;
    return null;
}
function buildExportFileName(dataset, kind, zoom, n) {
    const now = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const base = dataset || 'dataset';
    return kind === 'on-screen'
        ? `${sanitize(base)}_on-screen_z${zoom}_${stamp}_n${n}`
        : `${sanitize(base)}_attributes_${stamp}_n${n}`;
}
// buildExportMeta moved to src/lib/exportMeta.ts
function sanitize(s) { return s.replace(/[^a-z0-9_\-]+/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, ''); }
function showExportToast(color, rendered, total) {
    try {
        if (color === 'red')
            (0, react_toastify_1.toast)('Export complete (simplified geometry or no data). For analysis, use backend tools.', { type: 'warning', autoClose: 2500 });
        else if (color === 'yellow') {
            const msg = typeof total === 'number' ? `Exported visible records (partial: ${rendered.toLocaleString()}/${total.toLocaleString()}).` : `Exported visible records (partial: ${rendered.toLocaleString()}).`;
            (0, react_toastify_1.toast)(msg, { type: 'info', autoClose: 2500 });
        }
        else if (color === 'green')
            (0, react_toastify_1.toast)(`Exported visible records (complete: ${rendered.toLocaleString()}).`, { type: 'success', autoClose: 2000 });
    }
    catch { }
}
function toCSV(rows) {
    const keys = Array.from(rows.reduce((s, r) => { Object.keys(r || {}).forEach(k => s.add(k)); return s; }, new Set()));
    if (keys.length === 0)
        return '';
    const esc = (v) => {
        if (v == null)
            return '';
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const header = keys.join(',');
    const lines = rows.map((r) => keys.map(k => esc(r[k])).join(','));
    return [header, ...lines].join('\n');
}
