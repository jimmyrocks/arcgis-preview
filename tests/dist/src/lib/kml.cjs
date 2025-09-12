"use strict";
// Minimal KML builder for a GeoJSON FeatureCollection
// Supports Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon
Object.defineProperty(exports, "__esModule", { value: true });
exports.featureCollectionToKml = featureCollectionToKml;
exports.featureCollectionToKmz = featureCollectionToKmz;
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function coord(c) { const lon = c[0]; const lat = c[1]; const alt = c[2]; return `${lon},${lat}${alt != null ? ',' + alt : ''}`; }
function coordsList(list) { return list.map(coord).join(' '); }
function lineStringToKml(gs) {
    return `<LineString><coordinates>${coordsList(gs.coordinates)}</coordinates></LineString>`;
}
function polygonToKml(gs) {
    const rings = gs.coordinates || [];
    if (!Array.isArray(rings) || !rings.length)
        return '';
    const outer = rings[0] || [];
    const inners = rings.slice(1);
    return `<Polygon>` +
        `<outerBoundaryIs><LinearRing><coordinates>${coordsList(outer)}</coordinates></LinearRing></outerBoundaryIs>` +
        inners.map((r) => `<innerBoundaryIs><LinearRing><coordinates>${coordsList(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('') +
        `</Polygon>`;
}
function geometryToKml(g) {
    if (!g)
        return '';
    const t = g.type;
    if (t === 'Point')
        return `<Point><coordinates>${coord(g.coordinates)}</coordinates></Point>`;
    if (t === 'MultiPoint')
        return `<MultiGeometry>${g.coordinates.map((c) => `<Point><coordinates>${coord(c)}</coordinates></Point>`).join('')}</MultiGeometry>`;
    if (t === 'LineString')
        return lineStringToKml(g);
    if (t === 'MultiLineString')
        return `<MultiGeometry>${g.coordinates.map((l) => lineStringToKml({ type: 'LineString', coordinates: l })).join('')}</MultiGeometry>`;
    if (t === 'Polygon')
        return polygonToKml(g);
    if (t === 'MultiPolygon')
        return `<MultiGeometry>${g.coordinates.map((p) => polygonToKml({ type: 'Polygon', coordinates: p })).join('')}</MultiGeometry>`;
    return '';
}
function pickName(props) {
    if (!props)
        return '';
    const keys = ['name', 'Name', 'TITLE', 'title', 'OBJECTID', 'id'];
    for (const k of keys)
        if (props[k] != null)
            return String(props[k]);
    return '';
}
function serializeDataEntries(props) {
    try {
        const entries = [];
        const obj = props && typeof props === 'object' ? props : {};
        for (const [k, v] of Object.entries(obj)) {
            const val = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
            entries.push(`<Data name="${esc(k)}"><value>${esc(val)}</value></Data>`);
        }
        return entries.join('');
    }
    catch {
        return '';
    }
}
function toHex2(n) { const v = Math.max(0, Math.min(255, Math.round(n))); return v.toString(16).padStart(2, '0'); }
// KML colors are aabbggrr (alpha, blue, green, red)
function esriColorToKml(c) {
    try {
        const a = Array.isArray(c) ? (c[3] != null ? c[3] : 255) : (typeof c?.a === 'number' ? c.a : 255);
        const r = Array.isArray(c) ? c[0] : (typeof c?.r === 'number' ? c.r : 0);
        const g = Array.isArray(c) ? c[1] : (typeof c?.g === 'number' ? c.g : 0);
        const b = Array.isArray(c) ? c[2] : (typeof c?.b === 'number' ? c.b : 0);
        return `${toHex2(a)}${toHex2(b)}${toHex2(g)}${toHex2(r)}`;
    }
    catch {
        return 'ff000000';
    }
}
function esriColorToCssRgba(c) {
    try {
        const r = Array.isArray(c) ? c[0] : (typeof c?.r === 'number' ? c.r : 0);
        const g = Array.isArray(c) ? c[1] : (typeof c?.g === 'number' ? c.g : 0);
        const b = Array.isArray(c) ? c[2] : (typeof c?.b === 'number' ? c.b : 0);
        const a255 = Array.isArray(c) ? (c[3] != null ? c[3] : 255) : (typeof c?.a === 'number' ? c.a : 255);
        const a = Math.max(0, Math.min(1, a255 / 255));
        return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
    }
    catch {
        return 'rgba(0,0,0,1)';
    }
}
// Drawing helpers are consolidated in drawMarkerDataUri below
function buildKmlStyleFromRenderer(renderer, geometryType, inlineIcons = false) {
    try {
        if (!renderer)
            return '';
        // Prefer a single symbol if available
        const rtype = String(renderer?.type || '').toLowerCase();
        let symbol = renderer?.symbol || renderer?.defaultSymbol || null;
        if (!symbol && Array.isArray(renderer?.uniqueValueInfos) && renderer.uniqueValueInfos.length) {
            symbol = renderer.uniqueValueInfos[0]?.symbol;
        }
        if (!symbol)
            return '';
        // Use unified generator; inlineIcons controls data-URI embedding
        return symbolToKmlStyleXml(symbol, geometryType, 'layer-style', inlineIcons);
    }
    catch {
        return '';
    }
}
function symbolToKmlStyleXml(symbol, geometryType, id = 'layer-style', inlineIcons = false) {
    try {
        const stLine = [];
        const stPoly = [];
        const stIcon = [];
        const symType = String(symbol?.type || '').toLowerCase();
        const outline = symbol?.outline || {};
        const outlineColor = outline?.color != null ? esriColorToKml(outline.color) : null;
        const outlineWidth = typeof outline?.width === 'number' ? outline.width : 1.5;
        if (/sls|simplelinesymbol/i.test(symType) || /line/i.test(String(geometryType || ''))) {
            const lineColor = symbol?.color != null ? esriColorToKml(symbol.color) : (outlineColor || 'ff000000');
            stLine.push(`<LineStyle><color>${lineColor}</color><width>${outlineWidth}</width></LineStyle>`);
        }
        if (/sfs|simplefillsymbol/i.test(symType) || /polygon/i.test(String(geometryType || ''))) {
            const fillColor = symbol?.color != null ? esriColorToKml(symbol.color) : '7f0000ff';
            stPoly.push(`<PolyStyle><color>${fillColor}</color><fill>1</fill><outline>1</outline></PolyStyle>`);
            if (outlineColor)
                stLine.push(`<LineStyle><color>${outlineColor}</color><width>${outlineWidth}</width></LineStyle>`);
        }
        if (/sms|simplemarkersymbol|pms|picturemarkersymbol/i.test(symType) || /point/i.test(String(geometryType || ''))) {
            const scale = 1; // draw image at desired size
            let hrefTag = '';
            if (typeof symbol?.url === 'string' && symbol.url) {
                hrefTag = `<Icon><href>${symbol.url}</href></Icon>`;
            }
            else if (inlineIcons) {
                const size = typeof symbol?.size === 'number' ? Math.max(6, Math.min(48, symbol.size)) : 12;
                const fillCss = symbol?.color != null ? esriColorToCssRgba(symbol.color) : 'rgba(0,0,255,0.5)';
                const strokeCss = outline?.color != null ? esriColorToCssRgba(outline.color) : 'rgba(0,0,0,1)';
                const strokeW = typeof outlineWidth === 'number' ? Math.max(0, Math.min(6, outlineWidth)) : 1;
                const shape = getSimpleMarkerShape(symbol);
                const dataUri = drawMarkerDataUri({ shape, size, fill: fillCss, stroke: strokeCss, strokeWidth: strokeW });
                if (dataUri)
                    hrefTag = `<Icon><href>${dataUri}</href></Icon>`;
            }
            const inner = `<scale>${scale}</scale>${hrefTag}`;
            stIcon.push(`<IconStyle>${inner}</IconStyle>`);
        }
        const body = [stIcon.join(''), stLine.join(''), stPoly.join('')].filter(Boolean).join('');
        if (!body)
            return '';
        return `<Style id="${id}">${body}</Style>`;
    }
    catch {
        return '';
    }
}
function getSimpleMarkerShape(symbol) {
    try {
        const raw = String(symbol?.style || '').toLowerCase();
        if (!raw)
            return 'circle';
        if (raw.includes('square'))
            return 'square';
        if (raw.includes('diamond'))
            return 'diamond';
        if (raw.includes('triangle'))
            return 'triangle';
        if (raw.includes('circle'))
            return 'circle';
        // Newer API might use simple names like 'square'
        const s = String(symbol?.style || '').toLowerCase();
        if (['circle', 'square', 'diamond', 'triangle'].includes(s))
            return s;
    }
    catch { }
    return 'circle';
}
function drawMarkerDataUri({ shape, size = 16, fill, stroke, strokeWidth = 1 }) {
    try {
        const d = Math.max(2, Math.min(128, Math.round(size)));
        const pad = Math.max(0, Math.ceil(strokeWidth));
        const W = d + pad * 2;
        const H = d + pad * 2;
        const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
        if (!canvas)
            return null;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return null;
        const cx = W / 2;
        const cy = H / 2;
        const r = d / 2;
        ctx.beginPath();
        if (shape === 'circle') {
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }
        else if (shape === 'square') {
            ctx.rect(cx - r, cy - r, d, d);
        }
        else if (shape === 'diamond') {
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r, cy);
            ctx.lineTo(cx, cy + r);
            ctx.lineTo(cx - r, cy);
            ctx.closePath();
        }
        else if (shape === 'triangle') {
            // Equilateral triangle pointing up
            const h = r * Math.sqrt(3);
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx - r, cy + (h - r));
            ctx.lineTo(cx + r, cy + (h - r));
            ctx.closePath();
        }
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke && strokeWidth > 0) {
            ctx.lineWidth = strokeWidth;
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
        return canvas.toDataURL('image/png');
    }
    catch {
        return null;
    }
}
function evaluateRendererSymbol(renderer, props) {
    try {
        const type = String(renderer?.type || '').toLowerCase();
        if (!type)
            return renderer?.symbol || renderer?.defaultSymbol || null;
        if (type === 'simple')
            return renderer?.symbol || renderer?.defaultSymbol || null;
        if (type === 'uniquevalue') {
            const f1 = renderer?.field1 || renderer?.field || '';
            const f2 = renderer?.field2 || '';
            const f3 = renderer?.field3 || '';
            const delim = renderer?.fieldDelimiter ?? ', ';
            const parts = [f1, f2, f3].filter(Boolean).map((k) => props?.[k]);
            const val = parts.map((v) => (v == null ? '' : String(v))).join(delim);
            const infos = Array.isArray(renderer?.uniqueValueInfos) ? renderer.uniqueValueInfos : [];
            const hit = infos.find((u) => String(u?.value) === val);
            return hit?.symbol || renderer?.defaultSymbol || renderer?.symbol || null;
        }
        if (type === 'classbreaks') {
            const field = renderer?.field || renderer?.attributeField || renderer?.normalizationField; // best effort
            const raw = props?.[field];
            const value = typeof raw === 'number' ? raw : Number(raw);
            const infos = Array.isArray(renderer?.classBreakInfos) ? renderer.classBreakInfos : [];
            for (const cb of infos) {
                const min = (cb?.minValue != null) ? cb.minValue : -Infinity;
                const max = (cb?.maxValue != null) ? cb.maxValue : Infinity;
                if (value >= min && value <= max)
                    return cb?.symbol || null;
            }
            return renderer?.defaultSymbol || renderer?.symbol || null;
        }
        return renderer?.symbol || renderer?.defaultSymbol || null;
    }
    catch {
        return renderer?.symbol || renderer?.defaultSymbol || null;
    }
}
function keyForSymbol(symbol) {
    try {
        const simp = {
            type: symbol?.type,
            color: symbol?.color,
            size: symbol?.size,
            outline: symbol?.outline ? { color: symbol.outline.color, width: symbol.outline.width } : undefined,
            url: symbol?.url,
        };
        return JSON.stringify(simp);
    }
    catch {
        return String(Math.random());
    }
}
function featureCollectionToKml(fc, opts = {}) {
    const name = esc(opts.name || 'Layer');
    const meta = opts.metaJson ? `<ExtendedData><Data name="_export_meta"><value>${esc(opts.metaJson)}</value></Data></ExtendedData>` : '';
    const features = Array.isArray(fc?.features) ? fc.features : [];
    let styleXml = '';
    let styleUrlByIndex = new Array(features.length).fill('');
    const styleHints = new Map();
    try {
        const rtype = String(opts?.renderer?.type || '').toLowerCase();
        if (!opts?.renderer) {
            // no styles
        }
        else if (rtype === 'uniquevalue' || rtype === 'classbreaks') {
            const styleMap = new Map();
            const styleChunks = [];
            let counter = 0;
            features.forEach((f, i) => {
                const sym = evaluateRendererSymbol(opts.renderer, f?.properties || {});
                if (!sym)
                    return;
                const key = keyForSymbol(sym);
                let id = styleMap.get(key);
                if (!id) {
                    id = `s${++counter}`;
                    styleMap.set(key, id);
                    const sx = symbolToKmlStyleXml(sym, opts.geometryType, id, !!opts.inlineIcons);
                    if (sx)
                        styleChunks.push(sx);
                    const hint = buildStyleHint(sym, opts.geometryType);
                    if (hint)
                        styleHints.set(id, JSON.stringify(hint));
                }
                styleUrlByIndex[i] = `#${id}`;
            });
            styleXml = styleChunks.join('');
        }
        else {
            // simple renderer fallback: one style for all
            const style = buildKmlStyleFromRenderer(opts.renderer, opts.geometryType, !!opts.inlineIcons);
            styleXml = style;
            if (styleXml)
                styleUrlByIndex = styleUrlByIndex.map(() => '#layer-style');
            const sym = opts?.renderer?.symbol || opts?.renderer?.defaultSymbol || null;
            const hint = buildStyleHint(sym, opts.geometryType);
            if (hint)
                styleHints.set('layer-style', JSON.stringify(hint));
        }
    }
    catch { }
    const placemarks = features.map((f, i) => {
        const nm = esc(pickName(f?.properties || {}) || (f?.id != null ? String(f.id) : `feature-${i}`));
        const g = geometryToKml(f?.geometry);
        const su = styleUrlByIndex[i] ? `<styleUrl>${styleUrlByIndex[i]}</styleUrl>` : '';
        const hintId = styleUrlByIndex[i]?.replace(/^#/, '') || '';
        const hint = hintId ? styleHints.get(hintId) : null;
        const propsXml = serializeDataEntries(f?.properties || {});
        const extra = hint ? `<Data name="_style_hint"><value>${esc(hint)}</value></Data>` : '';
        const ext = (propsXml || extra) ? `<ExtendedData>${propsXml}${extra}</ExtendedData>` : '';
        return `<Placemark><name>${nm}</name>${su}${ext}${g}</Placemark>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${name}</name>${meta}${styleXml}${placemarks}</Document></kml>`;
}
function buildStyleHint(symbol, geometryType) {
    try {
        if (!symbol)
            return null;
        const symType = String(symbol?.type || '').toLowerCase();
        if (/simplelinesymbol|sls/i.test(symType) || /line/i.test(String(geometryType || ''))) {
            const style = String(symbol?.style || '').toLowerCase();
            const dash = dashPatternForEsri(style);
            return dash ? { lineStyle: style, lineDash: dash } : { lineStyle: style };
        }
        if (/simplemarkersymbol|sms|point/i.test(symType) || /point/i.test(String(geometryType || ''))) {
            const shape = getSimpleMarkerShape(symbol);
            const size = typeof symbol?.size === 'number' ? symbol.size : undefined;
            return { markerShape: shape, markerSize: size };
        }
        return null;
    }
    catch {
        return null;
    }
}
function dashPatternForEsri(style) {
    const s = String(style || '').toLowerCase();
    if (!s)
        return null;
    if (s.includes('dashdotdot'))
        return [8, 4, 2, 4, 2, 4];
    if (s.includes('dashdot'))
        return [8, 4, 2, 4];
    if (s.includes('dash'))
        return [8, 6];
    if (s.includes('dot'))
        return [2, 4];
    if (s.includes('solid'))
        return null;
    return null;
}
exports.default = featureCollectionToKml;
// KMZ builder: packages KML + generated icons into a .kmz (zip) byte array
const zip_1 = require("./zip");
function dataUriToBytes(uri) {
    try {
        const m = uri.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
        if (!m)
            return null;
        const isBase64 = !!m[2];
        const dataPart = m[3];
        if (isBase64) {
            const bin = atob(dataPart);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++)
                out[i] = bin.charCodeAt(i);
            return out;
        }
        else {
            const decoded = decodeURIComponent(dataPart);
            const enc = new TextEncoder();
            return enc.encode(decoded);
        }
    }
    catch {
        return null;
    }
}
function featureCollectionToKmz(fc, opts) {
    const name = opts.name || 'Layer';
    const enc = new TextEncoder();
    // Build styles similar to KML path, but reference icons/ID.png when we have generated icons
    const features = Array.isArray(fc?.features) ? fc.features : [];
    const styleHints = new Map();
    const iconBytesById = new Map();
    let styleXml = '';
    let styleUrlByIndex = new Array(features.length).fill('');
    try {
        const rtype = String(opts?.renderer?.type || '').toLowerCase();
        if (opts?.renderer) {
            if (rtype === 'uniquevalue' || rtype === 'classbreaks') {
                const styleMap = new Map();
                const styleChunks = [];
                let counter = 0;
                features.forEach((f, i) => {
                    const sym = evaluateRendererSymbol(opts.renderer, f?.properties || {});
                    if (!sym)
                        return;
                    const key = keyForSymbol(sym);
                    let id = styleMap.get(key);
                    if (!id) {
                        id = `s${++counter}`;
                        styleMap.set(key, id);
                        // Build IconStyle, generating icon PNG when needed
                        const st = symbolToKmlStyleXml(sym, opts.geometryType, id, false);
                        // If point symbol without URL, generate icon and patch href
                        const shape = getSimpleMarkerShape(sym);
                        const isPoint = /point/i.test(String(opts.geometryType || '')) || /simplemarkersymbol|sms/i.test(String(sym?.type || ''));
                        const hasUrl = typeof sym?.url === 'string' && sym.url;
                        if (isPoint && !hasUrl) {
                            const size = typeof sym?.size === 'number' ? Math.max(6, Math.min(48, sym.size)) : 12;
                            const outline = sym?.outline || {};
                            const strokeW = typeof outline?.width === 'number' ? Math.max(0, Math.min(6, outline.width)) : 1;
                            const fillCss = sym?.color != null ? esriColorToCssRgba(sym.color) : 'rgba(0,0,255,0.5)';
                            const strokeCss = outline?.color != null ? esriColorToCssRgba(outline.color) : 'rgba(0,0,0,1)';
                            const dataUri = drawMarkerDataUri({ shape, size, fill: fillCss, stroke: strokeCss, strokeWidth: strokeW });
                            const bytes = dataUri ? dataUriToBytes(dataUri) : null;
                            if (bytes) {
                                iconBytesById.set(id, bytes);
                            }
                        }
                        // Replace any IconStyle href with relative icons path when we have an icon
                        const patched = iconBytesById.has(id)
                            ? st.replace(/<Icon><href>[^<]*<\/href><\/Icon>/, `<Icon><href>icons\/${id}.png<\/href><\/Icon>`) : st;
                        styleChunks.push(patched);
                        const hint = buildStyleHint(sym, opts.geometryType);
                        if (hint)
                            styleHints.set(id, JSON.stringify(hint));
                    }
                    styleUrlByIndex[i] = `#${id}`;
                });
                styleXml = styleChunks.join('');
            }
            else {
                // Simple renderer
                const sym = opts.renderer?.symbol || opts.renderer?.defaultSymbol || null;
                let st = symbolToKmlStyleXml(sym, opts.geometryType, 'layer-style', false);
                const shape = getSimpleMarkerShape(sym);
                const isPoint = /point/i.test(String(opts.geometryType || '')) || /simplemarkersymbol|sms/i.test(String(sym?.type || ''));
                const hasUrl = typeof sym?.url === 'string' && sym.url;
                if (isPoint && !hasUrl) {
                    const size = typeof sym?.size === 'number' ? Math.max(6, Math.min(48, sym.size)) : 12;
                    const outline = sym?.outline || {};
                    const strokeW = typeof outline?.width === 'number' ? Math.max(0, Math.min(6, outline.width)) : 1;
                    const fillCss = sym?.color != null ? esriColorToCssRgba(sym.color) : 'rgba(0,0,255,0.5)';
                    const strokeCss = outline?.color != null ? esriColorToCssRgba(outline.color) : 'rgba(0,0,0,1)';
                    const dataUri = drawMarkerDataUri({ shape, size, fill: fillCss, stroke: strokeCss, strokeWidth: strokeW });
                    const bytes = dataUri ? dataUriToBytes(dataUri) : null;
                    if (bytes) {
                        iconBytesById.set('layer-style', bytes);
                        st = st.replace(/<Icon><href>[^<]*<\/href><\/Icon>/, `<Icon><href>icons\/layer-style.png<\/href><\/Icon>`);
                    }
                }
                styleXml = st;
                styleUrlByIndex = styleUrlByIndex.map(() => '#layer-style');
                const hint = buildStyleHint(sym, opts.geometryType);
                if (hint)
                    styleHints.set('layer-style', JSON.stringify(hint));
            }
        }
    }
    catch { }
    const meta = opts.metaJson ? `<ExtendedData><Data name="_export_meta"><value>${esc(opts.metaJson)}</value></Data></ExtendedData>` : '';
    const placemarks = features.map((f, i) => {
        const nm = esc(pickName(f?.properties || {}) || (f?.id != null ? String(f.id) : `feature-${i}`));
        const g = geometryToKml(f?.geometry);
        const su = styleUrlByIndex[i] ? `<styleUrl>${styleUrlByIndex[i]}</styleUrl>` : '';
        const hintId = styleUrlByIndex[i]?.replace(/^#/, '') || '';
        const hint = hintId ? styleHints.get(hintId) : null;
        const propsXml = serializeDataEntries(f?.properties || {});
        const extra = hint ? `<Data name="_style_hint"><value>${esc(hint)}</value></Data>` : '';
        const ext = (propsXml || extra) ? `<ExtendedData>${propsXml}${extra}</ExtendedData>` : '';
        return `<Placemark><name>${nm}</name>${su}${ext}${g}</Placemark>`;
    }).join('');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${esc(name)}</name>${meta}${styleXml}${placemarks}</Document></kml>`;
    const files = [];
    files.push({ name: 'doc.kml', data: enc.encode(kml) });
    for (const [id, bytes] of iconBytesById) {
        files.push({ name: `icons/${id}.png`, data: bytes });
    }
    return (0, zip_1.buildZip)(files);
}
