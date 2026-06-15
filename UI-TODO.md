# UI Cleanup TODO

A prioritized list of UI simplification tasks. Work through these roughly in order — higher items have the best effort-to-impact ratio.

---

## Core Layer Finder (Top Priority)

This is the highest-value UI in the entire app. Users should not have to think in ArcGIS implementation terms like "root", "service", and "layer" before they can see data. The product should feel like a world-class file picker / command palette for ArcGIS layers.

- [x] **Replace the current header URL input + Select-tab Root/Service/Layer controls with one unified "Layer Finder"** — a single omnibox that handles paste, search, browse, and selection.
- [x] **Support direct paste of any ArcGIS URL** — service root, folder URL, service URL, or layer URL. Parse it and drop the user into the right place automatically.
- [x] **Open a Quick Pick style results panel under the omnibox** — results should mix folders, services, and layers in one list with distinct icons and short metadata.
- [x] **Use one primary action: "Open layer"** — selecting a layer should immediately load it. Avoid separate "pick service, then pick layer, then zoom" flows when not necessary.
- [x] **Add breadcrumb navigation inside the finder** — once a server is known, show `Server / Folder / Service / Layer` and allow fast backtracking.
- [x] **Add fuzzy search across discovered services/layers within the current server** — users should be able to type fragments, not exact names.
- [x] **Show rich result rows** — label, full path, type (`folder`, `MapServer`, `FeatureServer`, `layer`), and small hints like geometry type or record count when known.
- [x] **Make keyboard navigation first-class** — Arrow keys, Enter to open, Escape to close, Backspace on empty query to go up a breadcrumb level.
- [x] **Add "Recent", "Pinned", and "Examples" sections in the empty state** — blank input should still be useful.
- [x] **Remove ArcGIS jargon from user-facing labels** — use "Server", "Folder", "Service", and "Layer" only where needed; avoid "Root".
- [x] **Design explicit states for loading / empty / invalid / inaccessible** — bad URLs, CORS failures, no layers found, and auth-required services should each have a clear, compact state.
- [x] **Inline-preview the highlighted result before opening it** — a small side pane or footer with URL, type, extent, renderer summary, and "open" affordance reduces wrong clicks.
- [x] **Cache discovered server hierarchies locally** — repeat visits to a known server should feel instant.

## Style Tab

- [x] **Hide advanced controls behind "Show advanced" toggle** — per geometry section, collapse: Dash array, Dash offset, Line cap, Line join, Fill rule (polygon only: Fill rule). Reduces ~20 visible controls → ~5.
- [x] **Only show the relevant geometry section when type is known** — currently when `kind === null` all three sections (Points, Lines, Polygons) render simultaneously. Only show all three when type is truly unknown.
- [x] **Move Layer Opacity here from Select tab** — opacity is a visual/style concern, not a selection concern.

---

## Download Tab

- [x] **Move Quick Copy (BBox, Center, Query URL) out of the top** — collapsed into a "Developer tools" `<details>` at the bottom of the tab.
- [x] **Simplify readiness badges** — replaced emoji squares with small CSS colored dots.

---

## Details Tab

- [x] **Collapse fields table by default** — show a "Show fields (N)" toggle; the table is long and repeats info already in Query tab.
- [x] **Group advanced metadata in a collapsible section** — hide: Spatial Reference, Scale Min/Max, Renderer Type, Max Record Count, Capabilities, Version, Caching info behind an "Advanced" disclosure.

---

## Select Tab

- [x] **Rename "Root" label → "Server URL"** — "Root" is ArcGIS jargon. "Server URL" is immediately understandable.
- [x] **Remove Layer Opacity** — moved to Style tab.

---

## Query Tab

- [x] **Move Beautify inline / demote it** — it's a power-user feature; move it as a subtle icon button inside the editor area rather than a prominent standalone button.
- [x] **Remove the Cmd/Ctrl+Enter hint text** — move to editor placeholder text or tooltip instead of always-visible muted label.

---

## Sidebar Footer

- [x] **Collapse "Contribute: Issues | Fork | Repo" into an icon** — a `?` or `···` icon that opens a small popover/dropdown. Always-visible footer links eat real estate on every tab.

---

## Data Tab

- [x] **Replace nested List/Inspect tabs with a slide-in inspect panel** — when a feature is selected, slide an inspection panel over the list (with ✕ to dismiss) rather than using tab-within-tab navigation. Lower priority — higher effort.

---

## Header Simplification (High Priority)

The header currently has two full rows always visible:
- Row 1: Layer finder + utility controls
- Row 2: Full WHERE/SQL editor + validation indicators + "Update Query" + "Reset" buttons

This is the #1 source of new-user confusion. The SQL editor shows before any data is loaded.

- [x] **Collapse the WHERE row into a chip/button by default** — When no filter is active, show a subtle "Filter..." link or funnel icon that expands inline on click. When a filter IS active, show a dismissable chip (e.g. `STATE = 'CA' ✕`) instead of the full editor. Click the chip to edit. This is the biggest single UX win in the whole app.
- [x] **Remove "Update Query" / "Reset" buttons from the header row** — Replace with Cmd/Ctrl+Enter to apply (already supported) and the ✕ on the chip to clear. Two prominent action buttons for a collapsed feature is too much.
- [x] **Hide the entire WHERE row when no layer is loaded** — No point showing a SQL filter before any data exists. Show it only once a layer URL has been committed.
- [x] **Rename "Filter (WHERE)" label** → just a placeholder `Filter features…` inside the input itself. "WHERE" is SQL jargon invisible to new users.
- [x] **Collapse header utilities into one overflow menu** — Keep finder as the primary action. Theme switching and external server-list help live behind a single `More` button instead of competing for header space.

---

## Select Tab — Remove URL Duplication

The Select tab has its own "Root" URL input, which means users see a URL input in the header AND one in the first sidebar tab. They look similar but work differently.

- [x] **Remove the "Root" URL input from the Select tab** — The Select tab should derive its root automatically from whatever is in the header URL. No separate input needed. When the header is blank, the Select tab shows an empty state: *"Paste an ArcGIS REST Services URL in the bar above to browse layers."*
- [x] **Add an empty state to the map canvas** — When no layer is loaded, show a centered hint on the map: *"Paste an ArcGIS REST Services URL to get started."* This orients new users without requiring them to read UI labels.
- [x] **Rename the "Select" tab → "Layers"** — "Select" is vague. "Layers" immediately communicates what the tab does.

---

## Query Tab — Consolidate WHERE editing

Currently WHERE can be edited in two places: the header and the Query tab. Both have full CodeMirror editors.

- [x] **Make the Query tab the canonical place to build filters** — Once the header WHERE is collapsed to a chip (see above), the Query tab becomes the primary place to build/edit WHERE. The chip in the header should open/focus the Query tab when clicked.
- [x] **Remove the standalone "Apply" button from QueryTab** — Cmd/Ctrl+Enter is the power-user flow; the header chip becoming active is the visual confirmation. A dedicated Apply button in the tab body is redundant if the header chip pattern is adopted.

---

## Style by Attribute (Low Priority)

This is worth supporting, but only as a constrained advanced feature. Do not let this turn into a full ArcGIS symbology editor.

- [x] **Add a third renderer mode: `Style by attribute`** — Keep `Server renderer` as the default and `Custom style` as the simple single-style option.
- [x] **Support only one-field styling in v1** — `Categorical` for text-like fields and `Numeric ramp` for numeric fields. No multi-field renderers, no expressions, no rule builder.
- [x] **Limit the UI to one or two visual channels per geometry type** — e.g. polygon color, line color/width, point color/size. Do not expose every symbol property in attribute mode.
- [x] **Use sane defaults and auto-generated stops/classes** — A user should be able to pick a field and get a useful result without hand-authoring breaks.
- [x] **Always provide a fallback/default style** — Nulls, unmatched values, and out-of-range values need an explicit visual fallback.
- [x] **Treat this as advanced mode only** — Keep the default UX simple. Attribute styling should not add noise for users who just want to preview a layer.

---

## Notes

- The header WHERE collapse is the single highest-impact change left.
- Style tab advanced controls (already done) was the biggest density reduction.
- The URL duplication between header and Select tab is the #1 confusion point for new users.
- Goal: a new user should see URL input → paste link → see map → done. Everything else is progressive disclosure.
