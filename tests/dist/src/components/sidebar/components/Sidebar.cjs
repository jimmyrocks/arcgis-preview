"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HtmlValue = exports.LabelValue = void 0;
exports.default = Sidebar;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const SelectTab_1 = require("../tabs/SelectTab");
const DetailsTab_1 = require("../tabs/DetailsTab");
const QueryTab_1 = require("../tabs/QueryTab");
const DataTab_1 = require("../tabs/DataTab");
const DownloadTab_1 = require("../tabs/DownloadTab");
var SidebarPrimitives_1 = require("./SidebarPrimitives");
Object.defineProperty(exports, "LabelValue", { enumerable: true, get: function () { return SidebarPrimitives_1.LabelValue; } });
Object.defineProperty(exports, "HtmlValue", { enumerable: true, get: function () { return SidebarPrimitives_1.HtmlValue; } });
function Sidebar({ serviceUrl, onSelectServiceUrl, onZoomToExtent, serviceMeta, layerMeta, featureCount, onApplyWhere, whereValue, layerDataRows, featureCollection, onRowHover, onRowClick, highlightId, disableQuery = false, disableData = false, disableDownload = false, zoom, bbox, center }) {
    const [activeTab, setActiveTab] = (0, react_1.useState)('select');
    const columnAliases = react_1.default.useMemo(() => {
        const map = {};
        const fields = layerMeta?.fields || [];
        fields.forEach((f) => { if (f?.name && f?.alias && f.alias !== f.name)
            map[f.name] = f.alias; });
        return map;
    }, [layerMeta]);
    // Ensure disabled tabs cannot remain active
    react_1.default.useEffect(() => {
        if ((activeTab === 'query' && disableQuery) || (activeTab === 'data' && disableData) || (activeTab === 'download' && disableDownload)) {
            setActiveTab('select');
        }
    }, [activeTab, disableQuery, disableData, disableDownload]);
    return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexDirection: 'column', height: '100%' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "tabs", role: "tablist", "aria-label": "Sidebar Tabs", style: { display: 'flex', gap: 0, marginBottom: 0 }, children: [(0, jsx_runtime_1.jsx)(TabButton, { name: "select", active: activeTab === 'select', onClick: () => setActiveTab('select'), children: "Select" }), (0, jsx_runtime_1.jsx)(TabButton, { name: "details", active: activeTab === 'details', onClick: () => setActiveTab('details'), children: "Details" }), (0, jsx_runtime_1.jsx)(TabButton, { name: "query", active: activeTab === 'query', disabled: disableQuery, onClick: () => !disableQuery && setActiveTab('query'), title: disableQuery ? 'Query only for Feature layers' : undefined, children: "Query" }), (0, jsx_runtime_1.jsx)(TabButton, { name: "data", active: activeTab === 'data', disabled: disableData, onClick: () => !disableData && setActiveTab('data'), title: disableData ? 'Data only for Feature layers' : undefined, children: "Data" }), (0, jsx_runtime_1.jsx)(TabButton, { name: "download", active: activeTab === 'download', disabled: disableDownload, onClick: () => !disableDownload && setActiveTab('download'), title: disableDownload ? 'Download only for Feature layers' : undefined, children: "Download" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "tab-panels", style: { flex: '1 1 0%', minHeight: 0, overflow: 'auto' }, children: [activeTab === 'select' ? ((0, jsx_runtime_1.jsx)(SelectTab_1.default, { serviceUrl: serviceUrl, onSelectServiceUrl: onSelectServiceUrl, onZoomToExtent: onZoomToExtent, serviceMeta: serviceMeta ?? null, layerMeta: layerMeta ?? null })) : null, activeTab === 'details' ? ((0, jsx_runtime_1.jsx)(DetailsTab_1.default, { serviceMeta: serviceMeta ?? null, layerMeta: layerMeta ?? null, featureCount: featureCount ?? null, onZoomToExtent: onZoomToExtent, serviceUrl: serviceUrl })) : null, activeTab === 'query' ? ((0, jsx_runtime_1.jsx)(QueryTab_1.default, { fields: layerMeta?.fields || [], whereValue: whereValue, onApplyWhere: (w) => onApplyWhere?.(w) })) : null, activeTab === 'data' ? ((0, jsx_runtime_1.jsx)(DataTab_1.default, { rows: Array.isArray(layerDataRows) ? layerDataRows : [], datasetName: layerMeta?.name || 'features', columnAliases: columnAliases, featureCollection: featureCollection, onRowHover: onRowHover, onRowClick: onRowClick, highlightId: highlightId })) : null, activeTab === 'download' ? ((0, jsx_runtime_1.jsx)(DownloadTab_1.default, { rows: Array.isArray(layerDataRows) ? layerDataRows : [], datasetName: layerMeta?.name || 'features', featureCollection: featureCollection, whereValue: whereValue || '1=1', serviceUrl: serviceUrl, layerId: layerMeta?.id, geometryType: layerMeta?.geometryType, spatialWkid: serviceMeta?.spatialReference?.latestWkid || serviceMeta?.spatialReference?.wkid, zoom: zoom, bbox: bbox, center: center, layerTotal: typeof featureCount === 'number' ? featureCount : undefined, renderer: layerMeta?.drawingInfo?.renderer })) : null] })] }));
}
function TabButton({ name, active, onClick, children, disabled = false, title }) {
    return ((0, jsx_runtime_1.jsx)("button", { onClick: onClick, title: title, role: "tab", id: `tab-${name}`, "aria-controls": `panel-${name}`, "aria-selected": active, "aria-disabled": disabled, disabled: disabled, className: `tab-button${active ? ' is-active' : ''}`, style: {
            padding: '8px 12px',
            margin: 0,
            border: '1px solid var(--border)',
            borderBottom: active ? '1px solid var(--panel)' : '1px solid var(--border)',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            background: active ? 'var(--panel)' : '#12162a',
            color: disabled ? '#7a8095' : (active ? '#e6e8ef' : '#c3c7d5'),
            cursor: disabled ? 'not-allowed' : 'pointer',
        }, children: (0, jsx_runtime_1.jsx)("span", { className: "tab-label", children: children }) }));
}
