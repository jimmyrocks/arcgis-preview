"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_toastify_1 = require("react-toastify");
require("react-toastify/dist/ReactToastify.css");
const MapView_1 = require("./components/MapView");
const FlashButton_1 = require("./components/ui/FlashButton");
const MoreInfoOverlay_1 = require("./components/MoreInfoOverlay");
const Sidebar_1 = require("./components/sidebar/components/Sidebar");
const esriLayer_1 = require("./lib/esriLayer");
function getInitialUrl() {
    const params = new URLSearchParams(location.search);
    return params.get('url') || '';
}
function App() {
    const [serviceUrl, setServiceUrl] = (0, react_1.useState)(getInitialUrl());
    const [selectedMapLayerId, setSelectedMapLayerId] = (0, react_1.useState)(undefined);
    const defaultPlaceholder = 'https://sampleserver6.arcgisonline.com/arcgis/rest/services';
    const [inputUrl, setInputUrl] = (0, react_1.useState)(serviceUrl || '');
    const [bbox, setBbox] = (0, react_1.useState)('');
    const [sidebarOpen, setSidebarOpen] = (0, react_1.useState)(true);
    const [center, setCenter] = (0, react_1.useState)('');
    const [zoom, setZoom] = (0, react_1.useState)(0);
    const [mouse, setMouse] = (0, react_1.useState)('');
    const [infoOpen, setInfoOpen] = (0, react_1.useState)(false);
    const [coordOrder, setCoordOrder] = (0, react_1.useState)('lng-lat');
    const [gdal, setGdal] = (0, react_1.useState)(false);
    const [zoomToExtent, setZoomToExtent] = (0, react_1.useState)(null);
    const [serviceMeta, setServiceMeta] = (0, react_1.useState)(null);
    const [layerMeta, setLayerMeta] = (0, react_1.useState)(null);
    const [featureCount, setFeatureCount] = (0, react_1.useState)(null);
    const [layerDataRows, setLayerDataRows] = (0, react_1.useState)([]);
    const [featureCollection, setFeatureCollection] = (0, react_1.useState)({ type: 'FeatureCollection', features: [] });
    const [hoverFeatureId, setHoverFeatureId] = (0, react_1.useState)(null);
    const [selectedFeatureId, setSelectedFeatureId] = (0, react_1.useState)(null);
    const resolvedLayer = react_1.default.useMemo(() => {
        try {
            return (0, esriLayer_1.resolveEsriLayer)(serviceUrl, selectedMapLayerId);
        }
        catch {
            return { type: null };
        }
    }, [serviceUrl, selectedMapLayerId]);
    const isFeatureLayer = resolvedLayer?.type === 'feature';
    const [where, setWhere] = (0, react_1.useState)('1=1');
    const [whereInput, setWhereInput] = (0, react_1.useState)(where);
    const [sidebarWidth, setSidebarWidth] = (0, react_1.useState)(() => {
        const v = Number(localStorage.getItem('sidebarWidth') || '0');
        return Number.isFinite(v) && v > 0 ? v : 315;
    });
    // Header "server list" info popover state
    const [showServerList, setShowServerList] = (0, react_1.useState)(false);
    const serverListRef = react_1.default.useRef(null);
    // Sidebar resize interaction is handled with transient listeners; no state needed
    const showToast = (msg, options = {}) => (0, react_toastify_1.toast)(msg, { autoClose: 1400, ...options });
    (0, react_1.useEffect)(() => {
        const params = new URLSearchParams(location.search);
        if (serviceUrl) {
            params.set('url', serviceUrl);
        }
        else {
            params.delete('url');
        }
        const newUrl = `${location.pathname}?${params.toString()}`;
        history.replaceState({}, '', newUrl);
    }, [serviceUrl]);
    // Keep header input mirrored with serviceUrl for a simple UX
    (0, react_1.useEffect)(() => { setInputUrl(serviceUrl || ''); }, [serviceUrl]);
    // Keep header WHERE input mirrored with state
    (0, react_1.useEffect)(() => { setWhereInput(where || '1=1'); }, [where]);
    // Persist sidebar width
    (0, react_1.useEffect)(() => { try {
        localStorage.setItem('sidebarWidth', String(sidebarWidth));
    }
    catch { } }, [sidebarWidth]);
    // Click-away close for the server list popover
    (0, react_1.useEffect)(() => {
        const onDocClick = (e) => {
            const el = serverListRef.current;
            if (!el)
                return;
            if (e.target && el.contains(e.target))
                return;
            setShowServerList(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);
    function commitUrl() {
        const raw = (inputUrl || '').trim();
        if (!raw) {
            setServiceUrl('');
            return;
        }
        let cleaned = raw.replace(/\s+/g, '').replace(/\/$/, '');
        if (/\/FeatureServer$/i.test(cleaned))
            cleaned = `${cleaned}/0`;
        setServiceUrl(cleaned);
        setInputUrl(cleaned);
    }
    function commitWhere() {
        const raw = (whereInput || '').trim();
        const w = raw.length ? raw : '1=1';
        setWhere(w);
        setWhereInput(w);
        // Clear current rows; Esri layer will repopulate based on new filter
        setLayerDataRows([]);
    }
    function swapPairStr(pair) {
        // pair is formatted as "a, b" with fixed decimals
        const parts = pair.split(',').map(s => s.trim());
        if (parts.length !== 2)
            return pair;
        return `${parts[1]}, ${parts[0]}`;
    }
    function format(pair, order) {
        if (!pair)
            return '—';
        return order === 'lng-lat' ? pair : swapPairStr(pair);
    }
    function formatBbox(b, order, gdalFmt) {
        if (!b)
            return '—';
        const nums = b.split(',').map(s => s.trim());
        if (nums.length !== 4)
            return b;
        // b is stored as minX, minY, maxX, maxY (lng, lat)
        let out = nums;
        if (order === 'lat-lng')
            out = [nums[1], nums[0], nums[3], nums[2]];
        return gdalFmt ? out.join(' ') : out.join(', ');
    }
    // FlashButton and CopyButton moved to components/ui
    // Reset layer selection when URL changes
    (0, react_1.useEffect)(() => {
        const lower = serviceUrl.toLowerCase();
        const m = lower.match(/\/mapserver\/(\d+)$/i);
        if (/\/mapserver$/i.test(lower)) {
            // Switch to dynamic MapServer view: clear any previously selected layer id
            setSelectedMapLayerId(undefined);
        }
        else if (m) {
            setSelectedMapLayerId(Number(m[1]));
        }
        else {
            setSelectedMapLayerId(undefined);
        }
        // reset details when URL changes; MapView will repopulate
        setServiceMeta(null);
        setLayerMeta(null);
        setFeatureCount(null);
        setLayerDataRows([]);
        setFeatureCollection({ type: 'FeatureCollection', features: [] });
        setHoverFeatureId(null);
        setSelectedFeatureId(null);
    }, [serviceUrl]);
    // Table is disabled for now while map UX is refined
    return ((0, jsx_runtime_1.jsxs)("div", { className: "app", children: [(0, jsx_runtime_1.jsxs)("header", { className: "header", style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 12, alignItems: 'center', width: '100%' }, children: [(0, jsx_runtime_1.jsx)("h1", { style: { margin: 0, marginRight: 8 }, children: "ArcGIS Preview" }), (0, jsx_runtime_1.jsx)("input", { value: inputUrl, onChange: (e) => setInputUrl(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                    commitUrl(); }, onBlur: commitUrl, placeholder: defaultPlaceholder, style: { flex: '1 1 auto', padding: '10px 14px', fontSize: 18, borderRadius: 8, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef' } }), (0, jsx_runtime_1.jsxs)("div", { ref: serverListRef, style: { position: 'relative', display: 'inline-flex', alignItems: 'center' }, children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setShowServerList(v => !v), "aria-label": "Find ArcGIS servers", "aria-expanded": showServerList, title: "Find ArcGIS REST servers", style: {
                                            background: 'transparent',
                                            border: '1px solid var(--border)',
                                            color: '#9aa0b4',
                                            borderRadius: 999,
                                            width: 28,
                                            height: 28,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                        }, children: "\u24D8" }), showServerList ? ((0, jsx_runtime_1.jsxs)("div", { role: "dialog", "aria-modal": false, style: {
                                            position: 'absolute',
                                            right: 0,
                                            top: 'calc(100% + 6px)',
                                            maxWidth: 420,
                                            padding: '10px 12px',
                                            fontSize: 12,
                                            color: 'var(--text)',
                                            background: 'var(--panel)',
                                            border: '1px solid var(--border)',
                                            borderRadius: 8,
                                            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                                            zIndex: 2000,
                                        }, children: ["Looking for ArcGIS REST servers? Try:", ' ', (0, jsx_runtime_1.jsx)("a", { href: "https://mappingsupport.com/p/surf_gis/list-federal-state-county-city-GIS-servers.txt", target: "_blank", rel: "noreferrer", style: { color: '#5b8cff', textDecoration: 'none' }, children: "mappingsupport.com server list" })] })) : null] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: 12, alignItems: 'center', width: '100%' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: 12, color: '#9aa0b4', minWidth: 80 }, children: "Filter (WHERE)" }), (0, jsx_runtime_1.jsx)("input", { value: whereInput, onChange: (e) => setWhereInput(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                    commitWhere(); }, onBlur: commitWhere, placeholder: '1=1', style: { flex: '1 1 auto', padding: '8px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef' } }), (0, jsx_runtime_1.jsx)(FlashButton_1.default, { onClick: () => { commitWhere(); showToast('Query Updated'); }, children: "Update Query" }), (0, jsx_runtime_1.jsx)(FlashButton_1.default, { onClick: () => { setWhere('1=1'); setWhereInput('1=1'); setLayerDataRows([]); showToast('Reset filter'); }, children: "Reset" })] })] }), (0, jsx_runtime_1.jsxs)("main", { className: "main", style: { display: 'flex', minHeight: 0 }, children: [(0, jsx_runtime_1.jsxs)("section", { className: "map-panel", style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { flex: '1 1 0%', minHeight: 0, position: 'relative' }, children: [(0, jsx_runtime_1.jsx)(MapView_1.default, { serviceUrl: serviceUrl, selectedMapLayerId: selectedMapLayerId, where: where, zoomToExtent: zoomToExtent, onFeatureCollection: (fc) => setFeatureCollection(fc), featureCollection: featureCollection, hoverFeatureId: hoverFeatureId, selectedFeatureId: selectedFeatureId, onMapFeatureHoverId: (id) => setHoverFeatureId(id), onMapFeatureClickId: (id) => setSelectedFeatureId(id), onBoundsChange: (b) => {
                                            try {
                                                const sw = b.getSouthWest();
                                                const ne = b.getNorthEast();
                                                const fmt = (x) => x.toFixed(6);
                                                setBbox(`${fmt(sw.lng)}, ${fmt(sw.lat)}, ${fmt(ne.lng)}, ${fmt(ne.lat)}`);
                                            }
                                            catch {
                                                setBbox('');
                                            }
                                        }, onCenterZoomChange: (c, z) => {
                                            const fmt = (x) => x.toFixed(6);
                                            setCenter(`${fmt(c.lat)}, ${fmt(c.lng)}`);
                                            setZoom(z);
                                        }, onMouseMove: (ll) => setMouse(`${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`), onStatusChange: (s) => {
                                            if (s === 'loading') { /* no toast to reduce noise */ }
                                            if (s === 'error')
                                                showToast('Failed to load layer', { type: 'error' });
                                            if (s === 'loaded') { /* no toast to reduce noise */ }
                                        }, onServiceMetadata: async (summary, meta) => {
                                            // Show summary and persist details for Sidebar tabs
                                            try {
                                                showToast(summary, { type: 'info' });
                                            }
                                            catch { }
                                            try {
                                                setServiceMeta(meta);
                                            }
                                            catch { }
                                            try {
                                                const resolved = (0, esriLayer_1.resolveEsriLayer)(serviceUrl, selectedMapLayerId);
                                                if (resolved.type === 'feature' && resolved.url) {
                                                    const lm = await (0, esriLayer_1.fetchLayerMetadata)(resolved.url);
                                                    setLayerMeta(lm);
                                                    try {
                                                        const n = await (0, esriLayer_1.fetchFeatureCount)(resolved.url);
                                                        setFeatureCount(n);
                                                    }
                                                    catch {
                                                        setFeatureCount(null);
                                                    }
                                                }
                                                else {
                                                    setLayerMeta(null);
                                                    setFeatureCount(null);
                                                }
                                            }
                                            catch {
                                                setLayerMeta(null);
                                                setFeatureCount(null);
                                            }
                                        } }), infoOpen ? ((0, jsx_runtime_1.jsx)(MoreInfoOverlay_1.default, { open: true, onClose: () => setInfoOpen(false), mouse: format(mouse, coordOrder), zoom: zoom, center: format(center, coordOrder), bbox: formatBbox(bbox, coordOrder, gdal), coordOrder: coordOrder, onChangeCoordOrder: setCoordOrder, gdal: gdal, onChangeGdal: setGdal, showHeaderButton: true })) : ((0, jsx_runtime_1.jsxs)(FlashButton_1.default, { onClick: () => { setInfoOpen(true); }, ariaLabel: "Show more info", title: 'Show more info', style: { position: 'absolute', left: 10, bottom: 10, zIndex: 1500, padding: '8px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [(0, jsx_runtime_1.jsx)("span", { style: { display: 'inline-block', transform: 'rotate(0deg)' }, children: "\u23F5" }), "More Info"] }))] }), !sidebarOpen && ((0, jsx_runtime_1.jsx)(FlashButton_1.default, { onClick: () => { setSidebarOpen(true); }, title: 'Show sidebar', ariaLabel: 'Show sidebar', style: {
                                    position: 'absolute',
                                    right: 13,
                                    top: 140,
                                    zIndex: 1500,
                                    padding: '8px 10px',
                                    borderRadius: 20,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }, children: (0, jsx_runtime_1.jsx)("span", { style: { display: 'inline-block', transform: 'rotate(180deg)' }, children: "\u23F5" }) }))] }), sidebarOpen && ((0, jsx_runtime_1.jsx)("div", { onMouseDown: (e) => {
                            const startX = e.clientX;
                            const startWidth = sidebarWidth;
                            try {
                                document.body.style.cursor = 'col-resize';
                                document.body.style.userSelect = 'none';
                            }
                            catch { }
                            const onMove = (ev) => {
                                const delta = startX - ev.clientX;
                                const next = Math.max(240, Math.min(700, startWidth + delta));
                                setSidebarWidth(next);
                            };
                            const onUp = () => {
                                try {
                                    document.body.style.cursor = '';
                                    document.body.style.userSelect = '';
                                }
                                catch { }
                                window.removeEventListener('mousemove', onMove);
                                window.removeEventListener('mouseup', onUp);
                            };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                        }, style: { width: 6, cursor: 'col-resize', background: 'transparent' }, title: "Drag to resize sidebar" })), sidebarOpen && ((0, jsx_runtime_1.jsx)("aside", { style: { position: 'relative', width: sidebarWidth, borderLeft: '1px solid #2b3050', background: 'var(--panel)', padding: 12, overflow: 'auto' }, children: (0, jsx_runtime_1.jsx)(Sidebar_1.default, { serviceUrl: serviceUrl, onSelectServiceUrl: setServiceUrl, serviceMeta: serviceMeta, layerMeta: layerMeta, featureCount: featureCount, layerDataRows: layerDataRows, featureCollection: featureCollection, onZoomToExtent: (ext) => setZoomToExtent(ext), onApplyWhere: (w) => setWhere(w || '1=1'), whereValue: where, onRowHover: (id) => setHoverFeatureId(id), onRowClick: (id) => setSelectedFeatureId(id), highlightId: selectedFeatureId ?? hoverFeatureId, disableQuery: !isFeatureLayer, disableData: !isFeatureLayer, disableDownload: !isFeatureLayer, zoom: zoom, bbox: bbox, center: center }) }))] }), (0, jsx_runtime_1.jsx)(react_toastify_1.ToastContainer, { position: "bottom-right", theme: "dark", autoClose: 1400, hideProgressBar: true, closeOnClick: true, pauseOnHover: false, newestOnTop: false })] }));
}
