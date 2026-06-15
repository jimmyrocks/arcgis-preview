# Style by Attribute — Implementation Plan

Authoritative spec for adding a third renderer mode ("Style by attribute") to the Style tab. Work through phases in order.

---

## Context

**Why this exists:** In a field consulting session you need to quickly understand what's *in* a field — not just its name and type. Coloring the map by a field is the fastest way to spot distributions, outliers, and data quality issues spatially. Style by Attribute is essentially a **visual field profiler** — see where `STATUS = 'ACTIVE'` vs `'INACTIVE'`, or where `POPULATION` is high vs low, without writing queries.

This comes *after* tabular field statistics (see `TODO-vision.md` gap #1) — profiling in a table is lower effort and surfaces the same insight. Style by Attribute is the visual complement once that foundation exists.

The current renderer has two modes:

| Mode | How it works |
|---|---|
| `server` | Calls `applyRendererAsync` — uses the layer's ArcGIS drawing info |
| `custom` | Calls `buildCustomLayers` — flat MapLibre paint from `GeometryStyleOptions` |

This adds a third mode:

| Mode | How it works |
|---|---|
| `attribute` | Calls `buildAttributeLayers` — MapLibre data-driven expressions keyed on a chosen field |

The key constraint from UI-TODO.md: **one field, two sub-modes (categorical / numeric ramp), one or two visual channels per geometry type.** This is not a full symbology editor. A user picks a field and gets a useful result immediately with auto-generated classes.

---

## What Changes Where

| File | Change |
|---|---|
| `src/lib/styleOptions.ts` | Add `AttributeStyleRule`, `AttributeStyleOptions` types; extend `StyleMode` type |
| `src/components/sidebar/tabs/StyleTab.tsx` | Add "Style by attribute" radio; render `AttributeStyleEditor` when active |
| `src/components/sidebar/components/AttributeStyleEditor.tsx` | NEW — field picker + class list |
| `src/components/sidebar/components/ColorRampPicker.tsx` | NEW — preset palette selector |
| `src/components/MapView.tsx` | Add `attributeStyle` prop; add `buildAttributeLayers` function; wire into the style effect |
| `src/App.tsx` | Thread `attributeStyle` state down; pass `styleMode='attribute'` to MapView |
| `src/lib/colorPalettes.ts` | NEW — hardcoded qualitative + sequential palettes |
| `src/lib/classifyField.ts` | NEW — auto-class generation from feature data |

---

## Type System

Add to `src/lib/styleOptions.ts`:

```typescript
// The three renderer modes (replaces the existing 'server' | 'custom' union elsewhere)
export type StyleMode = 'server' | 'custom' | 'attribute';

// One category → color mapping (categorical sub-mode)
export type CategoryStop = {
  value: string | number | null;  // null = catch-all / "Other"
  color: string;                  // hex color
  label?: string;                 // override display label (optional)
  enabled: boolean;               // false = render as fallback color
};

// One numeric stop → color mapping (numeric ramp sub-mode)
export type NumericStop = {
  value: number;   // lower bound of this class
  color: string;   // hex color
};

export type AttributeStyleRule =
  | {
      kind: 'categorical';
      field: string;
      channel: 'color';          // only supported channel for categorical
      stops: CategoryStop[];     // ordered list; last entry with value===null is fallback
      fallbackColor: string;
    }
  | {
      kind: 'numeric';
      field: string;
      channel: 'color' | 'size'; // size only applies to points (radius) and lines (weight)
      stops: NumericStop[];       // at least 2 stops; MapLibre interpolates between them
      fallbackColor: string;
      // For size channel only:
      minSize?: number;
      maxSize?: number;
    };

export type AttributeStyleOptions = {
  rule?: AttributeStyleRule;
};
```

`StyleMode` is already effectively `'server' | 'custom'` in MapView props — extend the union and add `attributeStyle` as a parallel prop. Do **not** merge it into `GeometryStyleOptions` (different shape, different purpose).

---

## Visual Channels Per Geometry Type

Limit to one or two channels — no sprawl:

| Geometry | Categorical | Numeric |
|---|---|---|
| Point | fill color | fill color OR radius |
| Line | stroke color | stroke color OR stroke width |
| Polygon | fill color | fill color |

Phase 1: **color channel only** for all geometry types. Size channel is Phase 2.

---

## Color Palettes

New file `src/lib/colorPalettes.ts`:

```typescript
export type Palette = {
  id: string;
  label: string;
  colors: string[];  // hex, ordered light → dark (sequential) or distinct (qualitative)
};

// Qualitative — for categorical fields (up to 10 categories)
export const QUALITATIVE_PALETTES: Palette[] = [
  { id: 'tableau10', label: 'Tableau 10', colors: ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'] },
  { id: 'set1',      label: 'Set 1',      colors: ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'] },
  { id: 'pastel',    label: 'Pastel',     colors: ['#fbb4ae','#b3cde3','#ccebc5','#decbe4','#fed9a6','#ffffcc','#e5d8bd','#fddaec','#f2f2f2'] },
];

// Sequential — for numeric ramp fields
export const SEQUENTIAL_PALETTES: Palette[] = [
  { id: 'blues',    label: 'Blues',    colors: ['#deebf7','#9ecae1','#3182bd'] },
  { id: 'reds',     label: 'Reds',     colors: ['#fee0d2','#fc9272','#de2d26'] },
  { id: 'greens',   label: 'Greens',   colors: ['#e5f5e0','#a1d99b','#31a354'] },
  { id: 'oranges',  label: 'Oranges',  colors: ['#feedde','#fdae6b','#e6550d'] },
  { id: 'purples',  label: 'Purples',  colors: ['#efedf5','#bcbddc','#756bb1'] },
  { id: 'ylrd',     label: 'Yellow→Red', colors: ['#ffffb2','#fd8d3c','#bd0026'] },
  { id: 'viridis',  label: 'Viridis',  colors: ['#440154','#31688e','#35b779','#fde725'] },
];
```

Palettes are just ordered arrays of hex colors. Interpolation between stops is done by MapLibre, not by us.

---

## Auto-Class Generation

New file `src/lib/classifyField.ts`:

```typescript
// Given a FeatureCollection and a field name, return auto-generated stops.
// Used when user first picks a field (before they've customized anything).

export function classifyCategorical(
  features: Feature[],
  field: string,
  palette: Palette,
  maxCategories = 8,
): CategoryStop[]

export function classifyNumeric(
  features: Feature[],
  field: string,
  palette: Palette,
  classCount = 5,
  method: 'quantile' | 'equalInterval' = 'quantile',
): NumericStop[]
```

### `classifyCategorical` algorithm
1. Collect all distinct non-null values for `field` across features.
2. Sort by frequency (most common first).
3. Take up to `maxCategories - 1` most frequent values.
4. If there are more distinct values, group the rest into an implicit "Other" (the fallback).
5. Assign palette colors in order. Wrap colors if more categories than palette entries.
6. Always append a `{ value: null, color: palette.colors[last] }` fallback stop.

### `classifyNumeric` algorithm
1. Collect all numeric values for `field`, filter `NaN` / `null`.
2. Sort ascending.
3. Compute `classCount` stops using:
   - **Quantile**: split the sorted array into `classCount` equal-sized buckets; use the first value of each bucket as a stop.
   - **Equal interval**: divide `[min, max]` into `classCount` equal steps.
4. Pair each stop value with the interpolated palette color at that position.
5. `fallbackColor` = `palette.colors[0]` (lightest, for nulls).

Both functions return enough info to immediately generate a MapLibre expression.

---

## MapLibre Expression Generation

New function `buildAttributeLayers` alongside existing `buildCustomLayers` in `MapView.tsx`:

### Categorical color expression
```javascript
// MapLibre 'match' expression
['match',
  ['get', fieldName],
  val1, color1,
  val2, color2,
  ...
  fallbackColor   // default arm (handles nulls and unmatched)
]
```

### Numeric ramp color expression
```javascript
// MapLibre 'interpolate' with 'linear'
['interpolate', ['linear'],
  ['to-number', ['get', fieldName], 0],  // coerce to number; 0 for nulls
  stop1_value, stop1_color,
  stop2_value, stop2_color,
  ...
]
// Clamp at min/max automatically — MapLibre clamps interpolate at range edges
```

### `buildAttributeLayers` signature
```typescript
function buildAttributeLayers(
  sourceId: string,
  geometry: GeometryKind,
  rule: AttributeStyleRule,
  baseOpts: GeometryStyleOptions,  // still used for non-attribute properties (weight, opacity, etc.)
): LayerSpecification[]
```

The function produces the same layer IDs as `buildCustomLayers` (using `CUSTOM_PREFIX`) so the existing remove/add logic works unchanged.

---

## MapView Props Changes

Add to `MapViewProps`:
```typescript
styleMode?: 'server' | 'custom' | 'attribute';  // extend the union
attributeStyle?: AttributeStyleOptions;           // NEW
```

In the style effect:
```typescript
if (styleMode === 'server' && drawingInfo) {
  // existing applyRendererAsync path
} else if (styleMode === 'attribute' && attributeStyle?.rule) {
  const layers = buildAttributeLayers(ARC_SOURCE_ID, geom, attributeStyle.rule, customStyle);
  // add layers same as custom path
} else {
  // existing buildCustomLayers (custom mode) — also fallback when attribute has no rule yet
  const layers = buildCustomLayers(ARC_SOURCE_ID, geom, customStyle);
}
```

The effect dependency array gains `JSON.stringify(attributeStyle?.rule ?? null)`.

---

## StyleTab UI Changes

The `StyleTab` radio group gains a third option:

```
○ Server renderer
○ Custom style
● Style by attribute
```

When `mode === 'attribute'`:
- The existing geometry fieldsets (Points, Lines, Polygons) are hidden.
- `AttributeStyleEditor` renders in their place.
- The "Show advanced" and "Reset" buttons remain but Reset resets the `AttributeStyleRule` to auto-generated defaults from current data.

### AttributeStyleEditor component (`src/components/sidebar/components/AttributeStyleEditor.tsx`)

Props:
```typescript
{
  fields: Array<{ name: string; type: string; alias?: string }>;
  rule: AttributeStyleRule | undefined;
  featureCollection: FeatureCollection | undefined;
  onRuleChange: (rule: AttributeStyleRule) => void;
  geometryType: string | null;
}
```

Layout (top to bottom):
1. **Field picker** — `<select>` of available fields. Numeric fields listed first, then string, then others. Selecting a field auto-generates stops via `classifyField`.
2. **Sub-mode toggle** — only shown when field type is ambiguous: `Categorical | Graduated`. Auto-selected when field type is clear (string → categorical; number → graduated).
3. **Palette picker** — `ColorRampPicker` showing 3-5 swatches. Changing palette re-colors all stops (preserves user value edits, only replaces colors).
4. **Class list** — one row per stop:
   - Categorical: `[color swatch] [value label] [enabled toggle]`
   - Numeric: `[color swatch] [value ≥ N]`
   - Max 10 rows visible; overflow scrolls.
   - Color swatch is a `type="color"` input (same as existing StyleTab).
5. **Fallback row** — always at the bottom: `[color swatch] Other / No data`.
6. **Re-classify button** — re-runs auto-classification from current feature data (useful after filter changes).

---

## App.tsx Changes

Add state:
```typescript
const [attributeStyle, setAttributeStyle] = useState<AttributeStyleOptions>({});
```

Pass to MapView:
```typescript
<MapView
  styleMode={styleMode}
  customStyle={customStyle}
  attributeStyle={attributeStyle}
  ...
/>
```

Pass to Sidebar → StyleTab:
```typescript
<StyleTab
  mode={styleMode}
  options={customStyle}
  attributeStyle={attributeStyle}
  onModeChange={setStyleMode}
  onOptionsChange={setCustomStyle}
  onAttributeStyleChange={setAttributeStyle}
  fields={layerMeta?.fields}
  featureCollection={featureCollection}
  geometryType={layerMeta?.geometryType}
  ...
/>
```

When `styleMode` changes away from `'attribute'`, do **not** clear `attributeStyle` — preserve it so switching back feels instant.

---

## Implementation Phases

### Phase 1 — Types, Palettes, Classification (no UI yet)

**Goal:** All the data-layer plumbing exists and is testable in isolation.

Steps:
1. Add `StyleMode`, `CategoryStop`, `NumericStop`, `AttributeStyleRule`, `AttributeStyleOptions` to `styleOptions.ts`.
2. Create `src/lib/colorPalettes.ts` with the palettes listed above.
3. Create `src/lib/classifyField.ts` with `classifyCategorical` and `classifyNumeric`. Write inline unit tests (or at least test via browser console with a known dataset).
4. Create `buildAttributeLayers` in `MapView.tsx` (next to `buildCustomLayers`). Test with a hardcoded rule by temporarily forcing `styleMode = 'attribute'` in dev.
5. Add `attributeStyle` prop to `MapViewProps` and wire the if/else branch in the style effect.
6. Verify: hardcoded `AttributeStyleRule` renders correctly on a live layer. No TypeScript errors.

**Exit condition:** MapLibre expressions render correctly for a manually crafted rule. `npm run build` clean.

---

### Phase 2 — StyleTab UI

**Goal:** Users can pick a field and see colored features.

Steps:
1. Create `ColorRampPicker.tsx` — takes `palettes: Palette[]`, `value: string` (palette id), `onChange`. Renders a row of swatches for each palette, highlights active. Clicking selects and re-colors all stops.
2. Create `AttributeStyleEditor.tsx` — full component as described above. On first render (no rule yet), auto-classify using the first numeric field found (or first field if all strings). On field change, auto-reclassify.
3. Add the third radio button to `StyleTab`. When selected, hide existing geometry fieldsets; render `AttributeStyleEditor`. When deselected, restore existing fieldsets.
4. Wire `onAttributeStyleChange` through `Sidebar.tsx` → `StyleTab.tsx` → `AttributeStyleEditor.tsx`.
5. Pass `fields` and `featureCollection` down from `App.tsx` through `Sidebar` to `StyleTab`.
6. Reset button in `StyleTab` when in attribute mode: re-runs auto-classification from current `featureCollection`.

**Exit condition:**
- Select "Style by attribute" → field picker appears with layer's fields.
- Select a string field → categorical stops auto-generated → features colored on map.
- Select a numeric field → graduated stops auto-generated → features colored on map.
- Change palette → all stop colors update → map re-renders.
- Edit an individual stop's color → that category/stop updates on map.
- Toggle a category off → those features render in fallback color.
- Reset → re-classifies from current data.

---

### Phase 3 — Size Channel (Points + Lines) *(Deferred)*

**Goal:** Numeric fields can also drive point radius or line weight.

Steps:
1. Add `channel` picker in `AttributeStyleEditor` for numeric mode on point/line geometry: `Color | Size`.
2. When `channel === 'size'`: render `Min size` and `Max size` number inputs instead of the color list. (The color stays a single flat color from `baseOpts`.)
3. `buildAttributeLayers` for `channel === 'size'`:
   - Point: `circle-radius` = `interpolate linear` expression.
   - Line: `line-width` = `interpolate linear` expression.
4. Clamp `minSize` / `maxSize` to reasonable ranges (2–40 for radius; 0.5–20 for weight).

**Exit condition:**
- Numeric field + Size channel → point radii scale with field value.
- Min/max size inputs control the range.
- Color channel still works as before.

---

### Phase 4 — Polish *(Deferred)*

Optional improvements, lower priority:

- **Diverging palettes** — for numeric fields with meaningful zero (e.g., change from baseline). Add `DIVERGING_PALETTES` and auto-detect when field has both positive and negative values.
- **Class count control** — small `<input type="number" min=2 max=10>` to change the number of graduated classes, triggering re-classification.
- **Classification method toggle** — Quantile vs. Equal Interval (affects numeric auto-classes).
- **Null/missing value handling** — explicit "No data" category in categorical, shown always. For numeric: choose between fallback color or hiding features with no data.
- **Legend in sidebar** — show the class list as a read-only legend when `styleMode === 'server'` (pulled from `drawingInfo.renderer` if interpretable). Phase 4b / separate task.

---

## Files to Create / Modify Summary

### Create (new files)
```
src/lib/colorPalettes.ts
src/lib/classifyField.ts
src/components/sidebar/components/AttributeStyleEditor.tsx
src/components/sidebar/components/ColorRampPicker.tsx
```

### Modify (existing files)
```
src/lib/styleOptions.ts       — add new types
src/components/MapView.tsx    — buildAttributeLayers, extend props/effect
src/components/sidebar/tabs/StyleTab.tsx  — third radio + AttributeStyleEditor
src/components/sidebar/components/Sidebar.tsx  — pass new props through
src/App.tsx                   — attributeStyle state, wire to MapView + Sidebar
```

---

## Test Checklist

### Phase 1 — Data Layer

- [ ] `classifyCategorical` with 3 distinct values → 3 CategoryStops + 1 fallback.
- [ ] `classifyCategorical` with 15 distinct values → 7 CategoryStops + "Other" fallback (maxCategories=8).
- [ ] `classifyCategorical` with null values in data → nulls go to fallback, not counted as a category.
- [ ] `classifyNumeric` with 5-class quantile → 5 stops with correct breakpoints.
- [ ] `classifyNumeric` with equal interval → evenly spaced stops.
- [ ] `buildAttributeLayers` with categorical rule on polygon → `fill-color: ['match', ...]` expression.
- [ ] `buildAttributeLayers` with numeric rule on polygon → `fill-color: ['interpolate', ...]` expression.
- [ ] `buildAttributeLayers` with categorical rule on point → `circle-color: ['match', ...]` expression.
- [ ] `buildAttributeLayers` with categorical rule on line → `line-color: ['match', ...]` expression.
- [ ] Switching `styleMode` server → attribute → custom → server does not leave orphaned map layers.
- [ ] `npm run build` passes with no TypeScript errors.

### Phase 2 — UI

- [ ] Select "Style by attribute" radio → `AttributeStyleEditor` appears; geometry fieldsets hidden.
- [ ] Select "Custom style" radio → `AttributeStyleEditor` hidden; geometry fieldsets reappear.
- [ ] Field picker shows all layer fields; numeric fields listed first.
- [ ] Selecting a string field → categorical sub-mode auto-selected; stops generated.
- [ ] Selecting a numeric field → graduated sub-mode auto-selected; stops generated.
- [ ] Features on map update color immediately when field changes.
- [ ] Changing palette re-colors all stops; map re-renders.
- [ ] Editing a single stop color → only that category/stop updates on map.
- [ ] Disabling a CategoryStop (toggle off) → those features render in fallback color.
- [ ] Fallback color picker changes → unmatched/null features update.
- [ ] Reset button → re-runs auto-classification; previous customization discarded.
- [ ] Switching away from "Style by attribute" and back → previous rule is preserved (not lost).
- [ ] Works on a layer with ≥ 500 features without UI lag (classification is sync but fast).
- [ ] Works when `featureCollection` is empty → graceful empty state ("Load a layer first").
- [ ] Works when field has all-null values → fallback color applied everywhere; no crash.

### Phase 3 — Size Channel

- [ ] Numeric field + Size channel on a point layer → `circle-radius` driven by field.
- [ ] Min/max size inputs clamp correctly (min ≥ 1, max ≤ 40).
- [ ] Min size > Max size → min and max swap or min is clamped to max.
- [ ] Switching back to Color channel → size expression removed; color expression applied.
- [ ] Size channel not available for polygon layers.

### Regression

- [ ] Server renderer still works after changes.
- [ ] Custom style still works.
- [ ] Layer opacity slider still works in all three modes.
- [ ] "Show advanced" toggle still works for custom style mode.
- [ ] Reset button for custom style still resets to defaults.
- [ ] Style persists correctly when WHERE filter changes (re-render applies same rule).

---

## Open Questions

1. **Where does classification run?** The `featureCollection` in `App.tsx` is the currently downloaded features (up to page limit). Classification runs on this sample, not the full dataset. This is acceptable for v1 — document it as "based on loaded features". If the layer has millions of features, the sample may be unrepresentative. Note this in the UI.

2. **What happens when a new page of features loads?** The attribute rule stays fixed — new features get colored by the same expression (MapLibre handles this automatically since the expression is in the layer spec). The class list does NOT auto-update when new features arrive. A "Re-classify from loaded data" button handles intentional refresh.

3. **Field type detection for auto sub-mode**: ArcGIS field types include `esriFieldTypeString`, `esriFieldTypeInteger`, `esriFieldTypeDouble`, `esriFieldTypeDate`, etc. Mapping: String/GUID/OID → categorical; Integer/Double/Single/Float → numeric; Date → categorical (by year or raw). We should read from `layerMeta.fields[].type` directly.

4. **How many stops before the UI becomes unwieldy?** Categorical: cap at 10 displayed + "Other". Graduated: cap at 10 stops. The underlying `CategoryStop[]` / `NumericStop[]` can hold more but the editor only shows/edits the auto-generated set.

5. **Should the rule survive a layer URL change?** No — a new layer has different fields. Clear `attributeStyle` when `serviceUrl` changes (same as resetting `customStyle`).
