import type { Feature } from 'geojson';
import type { CategoryStop, NumericStop } from './styleOptions';
import type { Palette } from './colorPalettes';

/**
 * Given features and a field name, return auto-generated categorical stops
 * ordered by frequency (most common first), with a null fallback at the end.
 */
export function classifyCategorical(
  features: Feature[],
  field: string,
  palette: Palette,
  maxCategories = 8,
): CategoryStop[] {
  // Count frequencies
  const freq = new Map<string | number, number>();
  for (const f of features) {
    const v = (f.properties as any)?.[field];
    if (v == null) continue;
    const key = typeof v === 'number' ? v : String(v);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  // Sort by frequency descending
  const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);

  // Take top N-1 (leaving room for the "Other"/null fallback slot)
  const topN = sorted.slice(0, maxCategories - 1);
  const colors = palette.colors;

  const stops: CategoryStop[] = topN.map(([value, count], i) => ({
    value,
    color: colors[i % colors.length],
    enabled: true,
    count,
  }));

  // Always append a null fallback
  stops.push({
    value: null,
    color: '#aaaaaa',
    label: 'Other / No data',
    enabled: true,
  });

  return stops;
}

/**
 * Given features and a numeric field name, return auto-generated numeric stops
 * using quantile or equal-interval classification.
 */
export function classifyNumeric(
  features: Feature[],
  field: string,
  palette: Palette,
  classCount = 5,
  method: 'quantile' | 'equalInterval' = 'quantile',
): NumericStop[] {
  // Collect numeric values
  const values: number[] = [];
  for (const f of features) {
    const v = (f.properties as any)?.[field];
    if (v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    values.push(n);
  }

  if (values.length === 0) {
    // No data — return two stops using first/last palette color
    const colors = palette.colors;
    return [
      { value: 0, color: colors[0] },
      { value: 1, color: colors[colors.length - 1] },
    ];
  }

  values.sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const count = Math.max(2, Math.min(classCount, values.length));

  let breakpoints: number[];
  if (method === 'quantile') {
    breakpoints = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / (count - 1)) * (values.length - 1));
      breakpoints.push(values[idx]);
    }
  } else {
    // Equal interval
    breakpoints = [];
    const step = (max - min) / (count - 1);
    for (let i = 0; i < count; i++) {
      breakpoints.push(min + step * i);
    }
  }

  // Deduplicate while preserving order
  const unique = Array.from(new Set(breakpoints));
  const colors = palette.colors;

  return unique.map((value, i) => ({
    value,
    color: interpolatePaletteColor(colors, i / Math.max(1, unique.length - 1)),
  }));
}

/** Linearly interpolate between palette colors at position t ∈ [0, 1]. */
export function interpolatePaletteColor(colors: string[], t: number): string {
  if (colors.length === 0) return '#888888';
  if (colors.length === 1) return colors[0];
  const scaled = t * (colors.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.ceil(scaled);
  if (lo === hi) return colors[lo];
  const frac = scaled - lo;
  return lerpHex(colors[lo], colors[hi], frac);
}

function lerpHex(a: string, b: string, t: number): string {
  try {
    const ra = parseInt(a.slice(1, 3), 16);
    const ga = parseInt(a.slice(3, 5), 16);
    const ba = parseInt(a.slice(5, 7), 16);
    const rb = parseInt(b.slice(1, 3), 16);
    const gb = parseInt(b.slice(3, 5), 16);
    const bb = parseInt(b.slice(5, 7), 16);
    const r = Math.round(ra + (rb - ra) * t);
    const g = Math.round(ga + (gb - ga) * t);
    const bl = Math.round(ba + (bb - ba) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
  } catch {
    return a;
  }
}

/**
 * Detect the likely sub-mode for a field based on ArcGIS field type string.
 * Returns 'categorical' for strings/dates/OIDs, 'numeric' for numbers.
 */
export function inferSubMode(fieldType?: string): 'categorical' | 'numeric' {
  if (!fieldType) return 'categorical';
  const t = fieldType.toLowerCase();
  if (t.includes('integer') || t.includes('double') || t.includes('single') || t.includes('float')) {
    return 'numeric';
  }
  return 'categorical';
}
