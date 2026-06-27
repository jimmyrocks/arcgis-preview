type RendererKind = 'simple' | 'uniqueValue' | 'classBreaks';

export function normalizeArcgisRendererType(value: unknown): RendererKind | null {
  const compact = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
  if (compact === 'simple' || compact === 'simplerenderer') return 'simple';
  if (compact === 'uniquevalue' || compact === 'uniquevaluerenderer') return 'uniqueValue';
  if (compact === 'classbreaks' || compact === 'classbreak' || compact === 'classbreaksrenderer' || compact === 'classbreakrenderer') return 'classBreaks';
  return null;
}

export function hasRenderableArcgisSymbol(symbol: unknown): boolean {
  if (!symbol || typeof symbol !== 'object' || Array.isArray(symbol)) return false;
  const value = symbol as Record<string, unknown>;
  if (Array.isArray(value.color) && value.color.length >= 3) return true;
  if (typeof value.size === 'number' || typeof value.width === 'number' || typeof value.height === 'number') return true;
  if (value.url || value.imageData || value.contentType) return true;
  if (value.style || value.angle || value.xoffset || value.yoffset) return true;
  const outline = value.outline;
  if (outline && typeof outline === 'object' && !Array.isArray(outline)) {
    const o = outline as Record<string, unknown>;
    return Array.isArray(o.color) || typeof o.width === 'number' || !!o.style;
  }
  return false;
}

export function getRenderableArcgisRenderer(renderer: unknown): Record<string, any> | null {
  if (!renderer || typeof renderer !== 'object' || Array.isArray(renderer)) return null;
  const raw = renderer as Record<string, any>;
  const type = normalizeArcgisRendererType(raw.type);
  if (!type) return null;

  if (type === 'simple') {
    if (!hasRenderableArcgisSymbol(raw.symbol)) return null;
    return { ...raw, type, symbol: raw.symbol };
  }

  if (type === 'uniqueValue') {
    const field1 = firstString(raw.field1, raw.field, raw.attributeField);
    const uniqueValueInfos = Array.isArray(raw.uniqueValueInfos)
      ? raw.uniqueValueInfos.filter((info: any) => hasRenderableArcgisSymbol(info?.symbol))
      : [];
    const defaultSymbol = hasRenderableArcgisSymbol(raw.defaultSymbol) ? raw.defaultSymbol : undefined;
    if (!uniqueValueInfos.length && !defaultSymbol) return null;
    if (uniqueValueInfos.length && !field1) {
      if (!defaultSymbol) return null;
      return { ...raw, type, field1: '', uniqueValueInfos: [], defaultSymbol };
    }
    return {
      ...raw,
      type,
      field1,
      uniqueValueInfos,
      ...(defaultSymbol ? { defaultSymbol } : { defaultSymbol: undefined }),
    };
  }

  const field = firstString(raw.field, raw.attributeField, raw.normalizationField);
  const classBreakInfos = Array.isArray(raw.classBreakInfos)
    ? raw.classBreakInfos.filter((info: any) => hasRenderableArcgisSymbol(info?.symbol))
    : [];
  const defaultSymbol = hasRenderableArcgisSymbol(raw.defaultSymbol) ? raw.defaultSymbol : undefined;
  if (!classBreakInfos.length && !defaultSymbol) return null;
  if (classBreakInfos.length && !field) {
    if (!defaultSymbol) return null;
    return { ...raw, type, field: '', classBreakInfos: [], defaultSymbol };
  }
  return {
    ...raw,
    type,
    field,
    classBreakInfos,
    ...(defaultSymbol ? { defaultSymbol } : { defaultSymbol: undefined }),
  };
}

export function hasRenderableArcgisRenderer(renderer: unknown): boolean {
  return !!getRenderableArcgisRenderer(renderer);
}

export function pickArcgisRendererSymbol(renderer: unknown): any | null {
  const normalized = getRenderableArcgisRenderer(renderer);
  if (!normalized) return null;
  if (hasRenderableArcgisSymbol(normalized.symbol)) return normalized.symbol;
  if (hasRenderableArcgisSymbol(normalized.defaultSymbol)) return normalized.defaultSymbol;
  if (Array.isArray(normalized.uniqueValueInfos)) {
    const hit = normalized.uniqueValueInfos.find((info: any) => hasRenderableArcgisSymbol(info?.symbol));
    if (hit?.symbol) return hit.symbol;
  }
  if (Array.isArray(normalized.classBreakInfos)) {
    const hit = normalized.classBreakInfos.find((info: any) => hasRenderableArcgisSymbol(info?.symbol));
    if (hit?.symbol) return hit.symbol;
  }
  return null;
}

export function describeArcgisRenderer(renderer: unknown): string {
  const normalized = getRenderableArcgisRenderer(renderer);
  if (!normalized) return '';
  if (normalized.type === 'simple') return 'Simple';
  if (normalized.type === 'uniqueValue') {
    const count = Array.isArray(normalized.uniqueValueInfos) ? normalized.uniqueValueInfos.length : 0;
    const field = normalized.field1 || '';
    const suffix = count ? ` (${count})` : normalized.defaultSymbol ? ' (default)' : '';
    return `Unique values${field ? `: ${field}` : ''}${suffix}`;
  }
  if (normalized.type === 'classBreaks') {
    const count = Array.isArray(normalized.classBreakInfos) ? normalized.classBreakInfos.length : 0;
    const field = normalized.field || '';
    const suffix = count ? ` (${count})` : normalized.defaultSymbol ? ' (default)' : '';
    return `Class breaks${field ? `: ${field}` : ''}${suffix}`;
  }
  return '';
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) return text;
  }
  return '';
}
