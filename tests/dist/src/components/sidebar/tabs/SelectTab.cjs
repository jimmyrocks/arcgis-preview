"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SelectTab;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const arcgis_1 = require("../../../lib/arcgis");
const esriLayer_1 = require("../../../lib/esriLayer");
function SelectTab({ serviceUrl, onSelectServiceUrl, onZoomToExtent, serviceMeta, layerMeta }) {
    const defaultRoot = 'https://sampleserver6.arcgisonline.com/arcgis/rest/services';
    const parsed = (0, react_1.useMemo)(() => {
        try {
            return (0, arcgis_1.getRestServiceUrlInfo)(serviceUrl);
        }
        catch {
            return null;
        }
    }, [serviceUrl]);
    const [root, setRoot] = (0, react_1.useState)(parsed?.baseRoot || defaultRoot);
    const [services, setServices] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [selectedService, setSelectedService] = (0, react_1.useState)(parsed?.servicePath ? `${parsed.servicePath}/${parsed.serviceType}` : '');
    const [layers, setLayers] = (0, react_1.useState)([]);
    const [selectedLayerId, setSelectedLayerId] = (0, react_1.useState)(() => parsed?.layerId !== undefined ? String(parsed.layerId) : '');
    // No details state here; details are owned by App/MapView
    // Recursively load ALL services under root
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        async function walk(folderParts) {
            const base = root.replace(/\/+$/, '');
            const sub = folderParts.length ? `/${folderParts.join('/')}` : '';
            const url = `${base}${sub}?f=pjson`;
            const res = await fetch(url);
            if (!res.ok)
                return [];
            const json = await res.json();
            const list = Array.isArray(json?.services)
                ? json.services
                    .filter((s) => s && (s.type === 'MapServer' || s.type === 'FeatureServer' || s.type === 'ImageServer'))
                    .map((s) => {
                    const name = s.name.split('/').pop();
                    const path = [...folderParts, name].join('/');
                    return { path, name, type: s.type };
                })
                : [];
            const folders = Array.isArray(json?.folders) ? json.folders : [];
            const nested = await Promise.all(folders.map(f => walk([...folderParts, f])));
            return [...list, ...nested.flat()];
        }
        async function loadAll() {
            setLoading(true);
            try {
                const all = await walk([]);
                if (!cancelled)
                    setServices(all);
            }
            catch {
                if (!cancelled)
                    setServices([]);
            }
            finally {
                if (!cancelled)
                    setLoading(false);
            }
        }
        loadAll();
        return () => { cancelled = true; };
    }, [root]);
    // Load layers for selected service
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        async function loadLayers() {
            setLayers([]);
            // details are handled upstream
            if (!selectedService)
                return;
            const lastSlash = selectedService.lastIndexOf('/');
            const servicePath = selectedService.slice(0, lastSlash);
            const type = selectedService.slice(lastSlash + 1);
            const svcUrl = `${root.replace(/\/+$/, '')}/${servicePath}/${type}`;
            try {
                const meta = await (0, esriLayer_1.fetchServiceMetadata)(svcUrl);
                if (cancelled)
                    return;
                const ls = Array.isArray(meta?.layers) ? meta.layers.map((l) => ({ id: l.id, name: l.name })) : [];
                setLayers(ls);
                // Update app URL, preserve layer id if present (e.g., user entered /MapServer/:id)
                if (type === 'MapServer') {
                    if (selectedLayerId) {
                        onSelectServiceUrl(`${svcUrl}/${selectedLayerId}`);
                    }
                    else {
                        onSelectServiceUrl(svcUrl);
                    }
                }
                else {
                    const id = selectedLayerId || '0';
                    onSelectServiceUrl(`${svcUrl}/${id}`);
                    setSelectedLayerId(id);
                }
            }
            catch {
                if (!cancelled) {
                    setLayers([]);
                }
            }
        }
        loadLayers();
        return () => { cancelled = true; };
    }, [selectedService, root]);
    function applyLayer(id) {
        setSelectedLayerId(id);
        if (!selectedService)
            return;
        const lastSlash = selectedService.lastIndexOf('/');
        const servicePath = selectedService.slice(0, lastSlash);
        const type = selectedService.slice(lastSlash + 1);
        const svcUrl = `${root.replace(/\/+$/, '')}/${servicePath}/${type}`;
        if (type === 'MapServer') {
            if (id)
                onSelectServiceUrl(`${svcUrl}/${id}`);
            else
                onSelectServiceUrl(svcUrl);
        }
        else {
            onSelectServiceUrl(`${svcUrl}/${id || '0'}`);
        }
        // Details (layer meta/count) are handled upstream when URL changes
    }
    return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gap: 10 }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { style: { display: 'block', fontSize: 12, color: '#9aa0b4', marginBottom: 4 }, children: "Root" }), (0, jsx_runtime_1.jsx)("input", { value: root, onChange: (e) => setRoot(e.target.value), placeholder: defaultRoot, style: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef' } })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { style: { display: 'block', fontSize: 12, color: '#9aa0b4', marginBottom: 4 }, children: "Service" }), (0, jsx_runtime_1.jsxs)("select", { value: selectedService, onChange: (e) => setSelectedService(e.target.value), style: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef' }, children: [(0, jsx_runtime_1.jsx)("option", { value: "", children: "\u2014 Select Service \u2014" }), loading ? (0, jsx_runtime_1.jsx)("option", { value: "", children: "Loading\u2026" }) : null, !loading && services.length === 0 ? (0, jsx_runtime_1.jsx)("option", { value: "", children: "(no services)" }) : null, services.map(s => ((0, jsx_runtime_1.jsxs)("option", { value: `${s.path}/${s.type}`, children: [s.path, " (", s.type, ")"] }, `${s.path}/${s.type}`)))] })] }), selectedService ? ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { style: { display: 'block', fontSize: 12, color: '#9aa0b4', marginBottom: 4 }, children: "Layer" }), (0, jsx_runtime_1.jsxs)("select", { value: selectedLayerId, onChange: (e) => applyLayer(e.target.value), style: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef' }, children: [selectedService.endsWith('/MapServer') ? (0, jsx_runtime_1.jsx)("option", { value: "", children: "Dynamic (all layers)" }) : null, layers.length === 0 ? ((0, jsx_runtime_1.jsx)("option", { value: "0", children: "0 \u2014 Layer" })) : (layers.map(l => (0, jsx_runtime_1.jsxs)("option", { value: String(l.id), children: [l.id, " \u2014 ", l.name] }, l.id)))] }), (layerMeta?.extent || serviceMeta?.fullExtent || serviceMeta?.initialExtent) && onZoomToExtent ? ((0, jsx_runtime_1.jsx)("div", { style: { marginTop: 6 }, children: (0, jsx_runtime_1.jsx)("button", { onClick: () => onZoomToExtent((layerMeta?.extent || serviceMeta?.fullExtent || serviceMeta?.initialExtent)), style: { padding: '8px 10px', fontSize: 12, borderRadius: 8, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: 'pointer', outlineStyle: 'none' }, children: "Zoom to Extent" }) })) : null] })) : null] }));
}
