// Color palettes used for attribute styling.
//
// Sequential and qualitative palettes are from ColorBrewer 2.0
// (colorbrewer2.org), Copyright (c) Cynthia Brewer, Mark Harrower, and
// The Pennsylvania State University. Licensed under the Apache License,
// Version 2.0.

export type Palette = {
  id: string;
  label: string;
  colors: string[]; // hex, ordered light→dark (sequential) or distinct (qualitative)
};

// Qualitative — for categorical fields (up to 8–9 categories)
// ColorBrewer 2.0: Set1, Set2, Pastel1
export const QUALITATIVE_PALETTES: Palette[] = [
  { id: 'set2',    label: 'Set 2',    colors: ['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'] },
  { id: 'set1',    label: 'Set 1',    colors: ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#a65628','#f781bf','#999999'] },
  { id: 'pastel1', label: 'Pastel 1', colors: ['#fbb4ae','#b3cde3','#ccebc5','#decbe4','#fed9a6','#ffffcc','#e5d8bd','#fddaec','#f2f2f2'] },
];

// Sequential — for numeric ramp fields
// ColorBrewer 2.0: Blues, Reds, Greens, Oranges, Purples, YlOrRd
export const SEQUENTIAL_PALETTES: Palette[] = [
  { id: 'blues',    label: 'Blues',       colors: ['#deebf7','#9ecae1','#3182bd'] },
  { id: 'reds',     label: 'Reds',        colors: ['#fee0d2','#fc9272','#de2d26'] },
  { id: 'greens',   label: 'Greens',      colors: ['#e5f5e0','#a1d99b','#31a354'] },
  { id: 'oranges',  label: 'Oranges',     colors: ['#feedde','#fdae6b','#e6550d'] },
  { id: 'purples',  label: 'Purples',     colors: ['#efedf5','#bcbddc','#756bb1'] },
  { id: 'ylrd',     label: 'YlOrRd',      colors: ['#ffffb2','#fd8d3c','#bd0026'] },
];

export function getPaletteById(id: string): Palette | undefined {
  return [...QUALITATIVE_PALETTES, ...SEQUENTIAL_PALETTES].find(p => p.id === id);
}
