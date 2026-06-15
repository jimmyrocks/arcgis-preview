# TODO Done

Assessed on 2026-03-12 from the current codebase plus the existing TODO/spec files.

This is not a full QA sign-off.
It is the list of work that is materially shipped and should not keep cluttering the forward backlog.

---

## Core UX

- Unified the old header URL bar and old Select-tab root/service/layer flow into one header-first Layer Finder.
- Removed the duplicate Select-tab URL entry flow.
- Renamed `Select` to `Layers`.
- Added an empty-state prompt on the map when no layer is loaded.
- Collapsed header utilities into a single overflow menu.
- Collapsed the header WHERE editor into a chip/button workflow and hid it until a layer is active.
- Demoted the old `ArcGIS Preview` header title so the top bar is now just the compact finder plus the filter.
- Moved breadcrumb navigation and sublayer switching into the Layer tab so the header stays small.

---

## Layer Finder

- Paste any ArcGIS REST URL: server root, folder, service, or direct layer.
- Automatic navigation to the right browse level after paste.
- Mixed quick-pick results for folders, services, and layers.
- Breadcrumb navigation and Backspace-up behavior.
- Fuzzy search across discovered services and layers.
- Recent layers, pinned servers, and real example servers in the empty state.
- Preview card for the highlighted result.
- Explicit copy actions for preview, selection, folder, server, and layer URLs.
- Friendly service labels on first contact.
- Auth and network error states with `Open server page` and `Retry`.
- `Ctrl/Cmd+K` focus shortcut for the header finder.
- Server/folder summary view in the details rail.
- Local cache for discovered hierarchies and service layers.
- Adaptive finder crawl: eager on normal servers, lazy/on-demand on large or slow servers.

---

## Query / SQL UX

- Canonical WHERE editing lives in the Query tab, with the header acting as a compact filter chip.
- SQL-like CodeMirror completions are context-aware instead of purely token-based.
- The editor is forgiving about pasted `WHERE ...;` input and warns on full `SELECT ... FROM ...`.
- Query tab can surface sample/distinct field values from the server.
- Query helpers now feel more like a SQL WHERE clause editor than a raw text box.

---

## Data / Inspect

- Data tab uses a slide-over inspect panel instead of nested list/inspect tabs.
- Feature inspection is wired to map selection.
- Data table supports search, sorting, keyboard navigation, and “style by field” from column headers.
- Details metadata is collapsed into more compact advanced sections.

---

## Style

- Layer opacity moved into the Style tab.
- Advanced custom-style controls are collapsed behind `Show advanced`.
- Geometry sections are shown more selectively based on layer type.
- Style by Attribute v1 is materially shipped: third renderer mode, `AttributeStyleEditor`, one-field categorical/numeric color styling, auto-classification, palette selection, and map wiring through `App`, `Sidebar`, `StyleTab`, and `MapView`.
- “Style by field” is wired from the data table into the Style tab flow.

---

## Download / Developer Tools

- Download tab is simplified and split into geometry vs attributes.
- Quick-copy tools were moved into a collapsed developer-tools section.
- Readiness indicators were simplified to colored dots.
- Export progress UI exists.
- Copy-to-clipboard actions exist for GeoJSON, CSV/JSON, bbox, center, and query URL.

---

## Performance / Map Behavior

- ArcGIS fetch page size now ramps adaptively instead of starting aggressively.
- Source snapshot processing is debounced to reduce repeated heavy feature scans.
- Zoom-to-layer in the Layers tab queries feature extent first instead of relying only on metadata.
- Finder crawl now avoids reusing in-flight folder requests across different roots.

---

## Known Historical Specs That Are Now Stale

- `UI-TODO.md` still shows Style by Attribute as fully unchecked, but v1 is already implemented.
- `TODO-style-switcher.md` still reads like phase 1 / phase 2 are upcoming work, but large parts of that implementation are already present.
- `TODO-layer-finder.md` still contains a large manual test checklist, but the feature backlog inside it is mostly already shipped.
