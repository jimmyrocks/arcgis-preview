"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DataTab;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const DataReportTable_1 = require("../components/DataReportTable");
const ids_1 = require("../../../lib/ids");
function DataTab({ datasetName = 'features', columnAliases, featureCollection, onRowHover, onRowClick, highlightId }) {
    const rows = react_1.default.useMemo(() => {
        if (!featureCollection?.features)
            return [];
        return featureCollection.features.map((f) => ({ ...(f?.properties || {}) }));
    }, [featureCollection]);
    const rowIds = react_1.default.useMemo(() => {
        if (!featureCollection?.features)
            return [];
        return featureCollection.features.map((f) => (0, ids_1.getFeatureId)(f));
    }, [featureCollection]);
    return ((0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }, children: (0, jsx_runtime_1.jsx)(DataReportTable_1.default, { data: rows, datasetName: datasetName, columnAliases: columnAliases, rowIds: rowIds, displayOnLoad: true, showHideButton: false, fullHeight: true, highlightId: highlightId, onRowHover: (_row, idx) => { const id = rowIds[idx] ?? null; onRowHover?.(id); }, onRowClick: (_row, idx) => { const id = rowIds[idx] ?? null; onRowClick?.(id); } }) }));
}
