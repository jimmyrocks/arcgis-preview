# Changelog

## [0.2.0] - 2025-09-12

### Added
- Basemap Chooser control with thumbnails (USGS, OSM, CARTO, Esri World Imagery, OpenTopoMap, and custom URL). Panel anchors correctly on left/right and is sized predictably.
- ErrorBoundary around MapView and Sidebar with a friendly recovery overlay.
- Loading ribbon over the map with aria-live polite status while a layer loads.
- “Recenter on selected” (🎯) Leaflet control that enables only when a feature is selected.
- Sticky Data table toolbar; keyboard navigation (↑/↓, Enter) within the table.
- Utility CSS classes for consistent typography and layout: `.u-small`, `.u-label`, `.u-kv*`, `.u-htmlbox`, `.u-row`, `.u-btn`, `.u-input`, `.u-note`.

### Changed
- Download tab redesigned into two compact cards (On‑screen features, Attributes) with clearer actions. “Open in geojson.io” now sits to the right of “Copy GeoJSON”.
- Basemap/Layers/extent controls arranged: zoom + extent on the left; Basemap Chooser on the right.
- WHERE editor DOM warnings resolved by filtering custom props from the fallback input.
- Numeric cell rendering in Data tab no longer adds grouping (no 2,005 for year 2005). Dates display as “Mon DD, YYYY, HH:MM:SS”.
- Data tab header now optionally shows dataset total, e.g. “4 of 5 rows (3,000 in dataset)”.
- Map no longer auto‑recenters to the selected feature while you pan; recenters only when selection changes.
- Cleans up and consolidates CSS (removed overlay/GitHub corner remnants, consolidated tab-panel rules).

### Fixed
- Prevents temporary dynamic overlay from sticking around when style changes (avoids double rendering).
- Leaflet TileLayer no longer passes undefined `subdomains`/`detectRetina` (fixes error reading `length`).
- Multiple minor a11y fixes (aria-live for loading, control labels).

### Removed
- External viewer links beyond geojson.io; Gist export and share service worker were removed to keep UX simple.
- Data tab column picker and local copy/download actions (Download tab is the single export surface).
