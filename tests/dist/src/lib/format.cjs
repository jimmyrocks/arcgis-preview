"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatAttrValue = formatAttrValue;
function formatAttrValue(v) {
    if (v === null || v === undefined)
        return '';
    if (typeof v === 'boolean')
        return v ? 'true' : 'false';
    if (typeof v === 'number') {
        if (v > 946684800000 && v < 4102444800000) {
            try {
                return new Date(v).toLocaleString();
            }
            catch {
                return String(v);
            }
        }
        if (v > 946684800 && v < 4102444800) {
            const ms = v * 1000;
            try {
                return new Date(ms).toLocaleString();
            }
            catch {
                return String(v);
            }
        }
        return String(v);
    }
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
