# TODO

Authoritative active backlog as of 2026-03-12.

Use this file for what is still left.
Use `TODO-done.md` for work that is materially shipped.
Use `TODO-vision.md` for product direction.
Use `UI-TODO.md`, `TODO-layer-finder.md`, and `TODO-style-switcher.md` as detailed reference specs, not as the source of truth for status.

---

## P0

- [ ] Restore a clean TypeScript build by aligning `maplibre-gl` across this app and the linked `source-arcgis-rest` package.
  Why: `npm run -s typecheck` is still blocked by the dual-version type mismatch.

- [ ] Add true server-backed export for geometry and attributes.
  Why: the current Download tab exports what is loaded/on screen, not the full filtered dataset.
  Scope: `returnIdsOnly` + batched objectId fetches + progress UI + “full dataset” vs “on-screen sample” distinction.

- [ ] Add field profiling / data quality summaries.
  Why: this is the biggest remaining gap in `TODO-vision.md`.
  Scope: null %, distinct count, min/max for numeric fields, top values for text fields, quick profile view per field.

- [ ] Add a true shareable report link.
  Why: URL state is only partially encoded today.
  Scope: include `where`, selected layer, tab, basemap, style mode, custom style, attribute style, and optionally a human `name`.

- [ ] Lift Layer Finder discovery state above `SelectTab`.
  Why: the header finder and details rail still maintain local discovery state and can duplicate crawl/fetch work.

---

## P1

- [ ] Finish Layer Finder polish.
  Scope: global search across the whole known server, named links (`?name=`), and a manual pass through the existing finder test checklist.

- [ ] Finish Style by Attribute phase 2.
  Scope: numeric size channel for points/lines, explicit no-data controls, class-count / classification-method controls, lightweight legend.

- [ ] Clean up the last header/map-control clutter.
  Scope: reduce duplicate “more info” style surfaces on the map and keep the header from regrowing beyond finder + filter.

- [ ] Decide on stronger authentication handling.
  Scope: keep `Open server page` + `Retry`, but evaluate token input or authenticated retry flow for secured internal servers.

---

## P2

- [ ] Add embed/share outputs beyond a raw URL.
  Scope: copy iframe / embed snippet.

- [ ] Add better GIS escape hatches.
  Scope: `Open in QGIS` and a stronger `Copy as cURL` flow.

- [ ] Evaluate offline/PWA support.
  Scope: app shell caching + blank/offline basemap fallback.

- [ ] Explore diff / compare mode.
  Scope: two layers or two filters side-by-side / toggled.

---

## Assessment Notes

- `UI-TODO.md` is mostly complete. Its remaining unchecked Style-by-Attribute section is stale relative to the current codebase.
- `TODO-layer-finder.md` is now primarily a detailed reference doc plus test checklist. Most feature work in it is already shipped.
- `TODO-style-switcher.md` is also partly stale. Attribute styling exists today; the main remaining work is phase-2 polish, missing controls, and test coverage.
- `TODO-vision.md` still holds up as the north-star document and should not be treated like a sprint backlog.
