"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeatureId = getFeatureId;
exports.findFeatureById = findFeatureById;
function getFeatureId(f) {
    try {
        if (f?.id != null)
            return f.id;
        const props = f?.properties || f?.attributes || {};
        const keys = Object.keys(props);
        const oidKey = keys.find(k => /^(objectid|object-id|fid|id)$/i.test(k));
        if (oidKey)
            return props[oidKey];
        return null;
    }
    catch {
        return null;
    }
}
function findFeatureById(fc, id) {
    if (!fc || !Array.isArray(fc.features) || id == null)
        return null;
    return fc.features.find((f) => {
        try {
            if (f?.id != null)
                return String(f.id) === String(id);
            return String(f?.properties?.__id) === String(id);
        }
        catch {
            return false;
        }
    }) || null;
}
