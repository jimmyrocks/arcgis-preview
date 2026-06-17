# ArcGIS Preview (Frontend-Only)

Frontend-only app to preview ArcGIS REST MapServer/FeatureServer layers with MapLibre + @opendataland/source-arcgis and a simple attribute table. No backend required.

What’s here

- Vite + React + TypeScript frontend at repo root
- MapLibre map with @opendataland/source-arcgis
- Attribute table using TanStack Table
- URL input synced to `?url=` query param

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
2) Push to the private server first, then mirror to GitHub:
   `git push gitea gh-pages && git push origin gh-pages`

Notes

- Everything runs in the browser. Some servers may block cross-origin fetches for the table; map rendering often still works via MapLibre.
- Table loads up to 1000 records by default; adjust in `src/lib/arcgis.ts`.
