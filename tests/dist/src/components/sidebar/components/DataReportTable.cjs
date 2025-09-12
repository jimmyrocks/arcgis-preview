"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DataReportTable;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
function DataReportTable({ data, displayFields, onRowClick, onRowHover, maxHeight = 260, displayOnLoad = false, datasetName = 'data', columnAliases, showHideButton = true, fullHeight = false, highlightId = null, rowIds = [] }) {
    const [open, setOpen] = react_1.default.useState(displayOnLoad || fullHeight || showHideButton === false);
    const scrollRef = react_1.default.useRef(null);
    const columns = react_1.default.useMemo(() => {
        if (displayFields && displayFields.length)
            return displayFields;
        const sample = data?.[0] || {};
        return Object.keys(sample);
    }, [data, displayFields]);
    const hasData = Array.isArray(data) && data.length > 0 && columns.length > 0;
    // Auto-scroll highlighted row into view (nearest) when highlight changes
    react_1.default.useEffect(() => {
        if (highlightId == null)
            return;
        const scroller = scrollRef.current;
        if (!scroller)
            return;
        try {
            const el = scroller.querySelector(`[data-row-id="${CSS.escape(String(highlightId))}"]`);
            if (el)
                el.scrollIntoView({ block: 'nearest' });
        }
        catch { }
    }, [highlightId]);
    return ((0, jsx_runtime_1.jsxs)("div", { style: { marginTop: 10 }, children: [showHideButton !== false ? ((0, jsx_runtime_1.jsx)("button", { onClick: () => setOpen(o => !o), style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: 'pointer', marginBottom: 6 }, children: open ? `Hide ${datasetName}` : `Show ${datasetName} (${(Array.isArray(data) ? data.length : 0).toLocaleString()})` })) : null, !hasData ? ((0, jsx_runtime_1.jsx)("div", { style: { color: '#9aa0b4', fontSize: 12 }, children: "(no data)" })) : open ? ((0, jsx_runtime_1.jsx)("div", { className: "data-table-wrapper", style: { border: '1px solid #2b3050', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }, children: (0, jsx_runtime_1.jsx)("div", { ref: scrollRef, className: "data-table-scroll", style: { maxHeight: fullHeight ? 'unset' : maxHeight, height: fullHeight ? '100%' : undefined, overflowY: 'auto', flex: '1 1 0%' }, children: (0, jsx_runtime_1.jsxs)("table", { className: "data-table", style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 }, children: [(0, jsx_runtime_1.jsx)("thead", { children: (0, jsx_runtime_1.jsx)("tr", { className: "data-header-row", style: { background: '#12162a' }, children: columns.map((c) => ((0, jsx_runtime_1.jsx)("th", { className: "data-header-cell", style: { position: 'sticky', top: 0, textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #2b3050' }, children: columnAliases?.[c] || c }, c))) }) }), (0, jsx_runtime_1.jsx)("tbody", { children: data.map((row, idx) => {
                                    const rid = rowIds[idx] != null ? rowIds[idx] : row?.__id;
                                    const selected = isActiveRow(rid, highlightId);
                                    const rowClass = `data-row${selected ? ' is-selected' : ''}${onRowClick ? ' is-clickable' : ''}`;
                                    return ((0, jsx_runtime_1.jsx)("tr", { className: rowClass, "data-row-id": safeId(rid), onClick: () => onRowClick?.(row, idx), onMouseEnter: () => onRowHover?.(row, idx), title: selected ? 'Selected' : undefined, children: columns.map((c) => {
                                            const v = row[c];
                                            const isNumber = typeof v === 'number';
                                            return ((0, jsx_runtime_1.jsx)("td", { className: `data-cell${isNumber ? ' is-number' : ''}`, style: { padding: '6px 8px', borderBottom: '1px solid #1b2238', verticalAlign: 'top' }, children: formatCell(v) }, c));
                                        }) }, idx));
                                }) })] }) }) })) : null] }));
}
function formatCell(v) {
    if (v == null)
        return '';
    if (typeof v === 'object') {
        try {
            return JSON.stringify(v);
        }
        catch {
            return String(v);
        }
    }
    return String(v);
}
function safeId(v) {
    if (v == null)
        return '';
    return String(v);
}
function isActiveRow(id, highlightId) {
    if (id == null || highlightId == null)
        return false;
    try {
        return String(id) === String(highlightId);
    }
    catch {
        return false;
    }
}
