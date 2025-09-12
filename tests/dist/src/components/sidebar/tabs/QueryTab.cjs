"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = QueryTab;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
function QueryTab({ fields = [], whereValue, onApplyWhere }) {
    const [fieldName, setFieldName] = react_1.default.useState('');
    const [operator, setOperator] = react_1.default.useState('=');
    const [value, setValue] = react_1.default.useState('');
    const [where, setWhere] = react_1.default.useState('');
    // Sync with external WHERE when provided
    react_1.default.useEffect(() => {
        if (typeof whereValue === 'string')
            setWhere(whereValue);
    }, [whereValue]);
    const currentField = fields.find(f => f.name === fieldName);
    const type = (currentField?.type || '').toLowerCase();
    const isString = type.includes('string');
    const isNumber = type.includes('integer') || type.includes('double') || type.includes('small') || type.includes('float');
    const isDate = type.includes('date');
    const ops = isString
        ? ['=', '!=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL']
        : isNumber || isDate
            ? ['=', '!=', '>', '>=', '<', '<=', 'IS NULL', 'IS NOT NULL']
            : ['=', '!='];
    function addClause() {
        if (!fieldName)
            return;
        let clause = '';
        const v = (value || '').trim();
        if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
            clause = `${fieldName} ${operator}`;
        }
        else if (isString) {
            clause = `${fieldName} ${operator} '${v.replace(/'/g, "''")}'`;
        }
        else if (isDate) {
            clause = `${fieldName} ${operator} DATE '${v.replace(/'/g, "''")}'`;
        }
        else {
            clause = `${fieldName} ${operator} ${v}`;
        }
        setWhere(prev => prev ? `${prev} AND ${clause}` : clause);
        setValue('');
    }
    function clearWhere() { setWhere(''); }
    function applyWhere() { if (onApplyWhere)
        onApplyWhere(where); }
    return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gap: 10, color: '#e6e8ef' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: '#9aa0b4', fontSize: 12 }, children: "Build a WHERE filter based on fields and types" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 6, alignItems: 'center' }, children: [(0, jsx_runtime_1.jsxs)("select", { value: fieldName, onChange: (e) => setFieldName(e.target.value), style: { width: '100%', minWidth: 0, maxWidth: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', overflow: 'hidden', textOverflow: 'ellipsis' }, children: [(0, jsx_runtime_1.jsx)("option", { value: "", children: "\u2014 Field \u2014" }), fields.map(f => ((0, jsx_runtime_1.jsx)("option", { value: f.name, children: f.alias || f.name }, f.name)))] }), (0, jsx_runtime_1.jsx)("select", { value: operator, onChange: (e) => setOperator(e.target.value), style: { padding: '6px 8px', borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', minWidth: 0, maxWidth: '100%' }, children: ops.map(op => (0, jsx_runtime_1.jsx)("option", { value: op, children: op }, op)) }), operator.includes('NULL') ? ((0, jsx_runtime_1.jsx)("span", {})) : ((0, jsx_runtime_1.jsx)("input", { value: value, onChange: (e) => setValue(e.target.value), placeholder: "Value", style: { width: '100%', minWidth: 0, maxWidth: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef' } })), (0, jsx_runtime_1.jsxs)("div", { style: { gridColumn: '1 / -1', display: 'flex', gap: 6, flexWrap: 'wrap' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: addClause, style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: 'pointer' }, children: "Add" }), (0, jsx_runtime_1.jsx)("button", { onClick: clearWhere, style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: 'pointer' }, children: "Clear" }), (0, jsx_runtime_1.jsx)("button", { onClick: applyWhere, disabled: !where, style: { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', cursor: where ? 'pointer' : 'not-allowed' }, children: "Apply WHERE" })] })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { style: { display: 'block', fontSize: 12, color: '#9aa0b4', marginBottom: 4 }, children: "WHERE (editable)" }), (0, jsx_runtime_1.jsx)("textarea", { value: where, onChange: (e) => setWhere(e.target.value), placeholder: "1=1\nExample: COLORMAP = 7 OR COLORMAP = 8", spellCheck: false, style: { width: '100%', minHeight: 72, padding: '8px 10px', borderRadius: 6, border: '1px solid #2b3050', background: '#0c0f1a', color: '#e6e8ef', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 12, whiteSpace: 'pre-wrap' } })] })] }));
}
