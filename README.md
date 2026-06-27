# ArcGIS Preview (Frontend-Only)

Frontend-only app to preview ArcGIS REST MapServer, FeatureServer, ImageServer,
and VectorTileServer layers with MapLibre + @opendataland/source-arcgis. No
backend required.

What’s here

- Vite + React + TypeScript frontend at repo root
- MapLibre map with feature rendering, imagery fallbacks, raster previews, and
  vector-tile previews
- Layer finder/search with recent layers and service navigation
- WHERE filtering with field-aware validation
- Feature table, feature inspector, hover/click map-table linking, and export
  tools
- Server-derived styling plus custom feature and raster style controls
- Shareable URL state for layer, filter, camera, basemap, selection, and style

Quick start

1) Node 18+ required
2) `npm install`
3) `npm run dev`
4) Paste a layer URL (e.g. `https://services.arcgisonline.com/ArcGIS/rest/services/USA/MapServer/0`)

Deploy

The site is hosted on GitHub Pages, served from the **root** of the
`gh-pages` branch (live at https://loc8.us/arcgis-preview/). Source lives on
`maplibre`; built output is never committed there (`docs/` is gitignored).

To publish:

1) From `maplibre`, run `npm run deploy`. This builds into `docs/` and copies
   it to the `gh-pages` branch root via a throwaway git worktree, then commits
   on `gh-pages` — **locally only, it does not push.**
2) To publish in the same step, run `npm run deploy -- --push`. This pushes
   `gh-pages` to `gitea` first, then mirrors it to `origin`.

Notes

- Everything runs in the browser. Some servers may block cross-origin fetches for the table; map rendering often still works via MapLibre.
- Feature layers fetch progressively for the visible map extent. Auto-fetch can
  be paused, and manual fetches use the same in-browser cache.
