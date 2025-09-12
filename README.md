# ArcGIS Preview (Frontend-Only)

Frontend-only app to preview ArcGIS REST MapServer/FeatureServer layers with Leaflet + Esri‑Leaflet and a simple attribute table. No backend required.

What’s here

- Vite + React + TypeScript frontend at repo root
- Leaflet + Esri‑Leaflet map, React‑Leaflet integration
- Attribute table using TanStack Table
- URL input synced to `?url=` query param

Quick start

1) Node 18+ required
2) `npm install`
3) `npm run dev`
4) Paste a layer URL (e.g. `https://services.arcgisonline.com/ArcGIS/rest/services/USA/MapServer/0`)

Notes

- Everything runs in the browser. Some servers may block cross‑origin fetches for the table; map rendering often still works via Esri‑Leaflet.
- Table loads up to 1000 records by default; adjust in `src/lib/arcgis.ts`.
