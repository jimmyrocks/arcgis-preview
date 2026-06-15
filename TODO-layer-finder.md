# Layer Finder — Spec & Remaining Work

The Layer Finder is the entry point for the tool's primary use case: arriving at a client site, connecting to their ArcGIS server, and quickly understanding what's there. It has to work fast, handle unfamiliar servers gracefully, and require zero prior knowledge of ArcGIS REST structure.

See [TODO-vision.md](TODO-vision.md) for the broader product context.

---

## What's already shipped

The Layer Finder launched as a full rebuild of `SelectTab`. The old three-step flow (root input → service dropdown → layer dropdown) is replaced with:

| Feature | Status |
|---|---|
| Paste any ArcGIS REST URL (root, folder, service, layer) | ✅ Done |
| Immediate navigation to the right level on paste | ✅ Done |
| Breadcrumb navigation (Server / Folder / Service / Layer) | ✅ Done |
| Backspace on empty query navigates up one level | ✅ Done |
| Fuzzy search across all discovered services and layers | ✅ Done |
| Result rows with name, path, type badge, hints | ✅ Done |
| Grouped results (Folders → Services → Layers) | ✅ Done |
| Auth-required (401/403) detection and error message | ✅ Done |
| CORS/network error detection and error message | ✅ Done |
| Loading / empty states with clear copy | ✅ Done |
| Recent servers (localStorage, persists across sessions) | ✅ Done |
| Pinned servers (localStorage, pin/unpin button) | ✅ Done |
| Examples section in empty state | ✅ Done |
| `localStorage` cache with 12-hour TTL | ✅ Done |
| Adaptive discovery (eager crawl for small servers, lazy folder loading for large/slow servers) | ✅ Done |
| Prefetch layer lists for top fuzzy matches during search | ✅ Done |
| Preview strip rendered for the active header result | ✅ Done |
| Friendly service labels on first contact (`Map service`, `Feature service`, etc.) | ✅ Done |
| Auth-required flow with `Open server page` and `Retry` | ✅ Done |
| Real-world example servers (government/public data, not just Esri demos) | ✅ Done |
| Recent entries track opened layers, not just visited roots | ✅ Done |
| `Ctrl/Cmd+K` focuses the header finder | ✅ Done |
| Server/folder summary view in the details rail | ✅ Done |
| Current selection card has an explicit copy-URL action | ✅ Done |

### Architecture as built

The finder is now header-first. `SelectTab` still owns the discovery/search logic, but it now renders only as the compact header omnibox:
- `finderMode="search-only"` in the header as the primary omnibox
- `LayersTab` in the sidebar as the current-selection, breadcrumb, and sublayer rail

This aligns better with [TODO-vision.md](TODO-vision.md):
- `URL first` — the first thing you see is the finder
- `No jargon on first contact` — friendly labels and compact preview
- `Escape hatches over walls` — auth failures offer an open-and-retry path
- `Speed is a feature` — cached discovery and recent-layer jumpbacks stay front and center

```
App
├── Header
│   └── <SelectTab finderMode="search-only">   ← primary Layer Finder
├── Sidebar
│   └── <LayersTab>
│       ├── CurrentSelectionCard               ✅ shipped
│       ├── BreadcrumbNavigation               ✅ shipped
│       ├── SublayerDropdown                   ✅ shipped
│       └── Zoom / current-layer actions       ✅ shipped
└── MapView                                    ← unchanged
```

---

## Recently completed

### Smart crawl strategy for very large servers

This is now shipped:
- fetch the root immediately
- keep eager crawl for small/medium servers
- switch to lazy folder loading when the root is slow or obviously large
- keep loading newly visited folders on demand

This keeps the tool aligned with the vision principle that speed itself is part of the product.

---

## Deferred (lower priority)

- **`?name=` query param**: encode a human label in the share URL so bookmarks are readable.
- **Global search across the whole server**: when typing, optionally search all discovered services/layers not just the current browse level. The prefetch-on-fuzzy-match already partially enables this.
- **Shared discovery state across header + details rail**: `SelectTab` still owns discovery locally in two render modes. Lifting the crawl/cache state higher would avoid duplicated fetches when both surfaces need the same server summary.

---

## Test checklist

### Core flow
- [ ] Paste server root → breadcrumb shows hostname → folders and services appear.
- [ ] Paste folder URL → breadcrumb shows folder → that folder's services appear.
- [ ] Paste service URL → breadcrumb shows service → layer list appears.
- [ ] Paste layer URL → layer loads on map immediately, no extra click.
- [ ] Paste non-ArcGIS URL → inline error, no crash.
- [ ] Type to filter → fuzzy results appear with highlights.
- [ ] Click a folder → breadcrumb advances, folder contents appear.
- [ ] Click a service → layer list appears below.
- [ ] Click a layer → layer loads, breadcrumb shows layer name.
- [ ] Breadcrumb: click Server segment → returns to root service list.
- [ ] Breadcrumb: click Folder segment → returns to that folder.
- [ ] Backspace on empty query → navigates up one breadcrumb level.

### Empty state
- [ ] No server known → shows Recent, Pinned, Examples sections.
- [ ] Examples contain real government servers (not just Esri samples).
- [ ] Click a Recent entry → navigates correctly.
- [ ] Click an Example → navigates correctly.
- [ ] Pin server button toggles correctly; pinned server appears in Pinned section.

### Error states
- [ ] CORS/network failure → "Unable to list…" message, no crash.
- [ ] 401/403 → distinct "authentication required" message with Open link.
- [ ] "Open server page" link opens the root URL in a new tab.
- [ ] Retry after auth → discovery runs again.
- [ ] Empty folder → "No services in this folder." message.
- [ ] Service with no sublayers → "No sublayers were reported." message.

### Cache
- [ ] Second visit to a known server shows cached results instantly (< 100ms before network).
- [ ] Cache key is per server root; switching servers shows fresh results.
- [ ] 12-hour TTL: stale cache is ignored (test by manipulating `Date.now` or reducing TTL).
- [ ] Large/slow server switches to lazy mode and still loads newly visited folders.
- [ ] Switching roots mid-scan never leaks folders or services from the previous server.

### Preview strip
- [ ] Hovering a result shows the preview card.
- [ ] Preview shows: name, URL, type badges, geometry type (if known).
- [ ] Clicking the preview URL copies it.
- [ ] Preview "Open" button performs the same action as clicking the row.
- [ ] Preview disappears when mouse leaves and no keyboard item is focused.

### De-jargon
- [ ] "MapServer" never appears as a standalone user-facing label (replaced by "Map Service").
- [ ] "FeatureServer" → "Feature Service".
- [ ] "ImageServer" → "Image Service".
- [ ] "VectorTileServer" → "Tile Service".
- [ ] Raw type name still visible in small/muted text for power users.

### Regression
- [ ] Header layer finder still works; pasting there updates the selection.
- [ ] WHERE filter chip still works.
- [ ] Style tab still applies custom styles.
- [ ] Download tab still works.
- [ ] Data tab / inspect panel still works.
- [ ] Zoom to layer button still works.
- [ ] `?url=` query param on page load still opens the layer.

---

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-03-12 | Header omnibox became the primary Layer Finder | Better match to the `URL first` product vision; first action is now paste/find |
| 2026-03-12 | Sidebar `LayersTab` became the navigation rail | Avoids duplicate inputs while preserving current-layer details, breadcrumbs, and sublayer access |
| 2026-03-11 | `localStorage` for cache (not `sessionStorage`) with 12h TTL | Client-site servers are stable for hours; revisiting next morning should still be fast |
| 2026-03-12 | Adaptive crawl: eager first, lazy when the server is huge or slow | Preserves fast global browse on normal servers without punishing large internal deployments |
| 2026-03-11 | `matchScore` fuzzy search reused from original SelectTab | Already solid; no reason to reinvent |
| 2026-03-12 | Recent history tracks opened layers, not just roots | Better return path during live reconnaissance and client walkthroughs |
| 2026-03-12 | Auth failures now offer `Open server page` + `Retry` | Aligns with `escape hatches over walls` for secured internal ArcGIS servers |
