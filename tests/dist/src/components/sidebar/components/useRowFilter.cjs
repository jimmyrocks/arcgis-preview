"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRowFilter = useRowFilter;
const react_1 = require("react");
function useRowFilter(rows, query) {
    return react_1.default.useMemo(() => {
        const q = (query || '').toLowerCase().trim();
        if (!q)
            return rows || [];
        try {
            return (rows || []).filter((r) => {
                for (const k of Object.keys(r || {})) {
                    const v = r?.[k];
                    if (v == null)
                        continue;
                    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
                    if (s.toLowerCase().includes(q))
                        return true;
                }
                return false;
            });
        }
        catch {
            return rows || [];
        }
    }, [rows, query]);
}
