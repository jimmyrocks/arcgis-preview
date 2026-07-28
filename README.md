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

1) Node 20.19+ or Node 22.12+ required
2) `npm install`
3) `npm run dev`
4) Paste a layer URL (e.g. `https://services.arcgisonline.com/ArcGIS/rest/services/USA/MapServer/0`)

Deploy

The site is hosted on GitHub Pages, served from the **root** of the
`gh-pages` branch (live at https://loc8.us/arcgis-preview/). Unreleased
development lives on Gitea's `maplibre-dev` branch. Gitea's `maplibre` branch
contains released source and triggers deployment. Generated output is committed
only to GitHub's `gh-pages` branch (`docs/` is gitignored on source branches).

To publish, merge tested changes from `maplibre-dev` into `maplibre`, then push
Gitea's `maplibre` branch. The workflow in `.gitea/workflows/deploy.yml`:

1) Checks out this repository and
   `maplibre-gl-plugins/source-arcgis-rest@develop`.
2) Installs dependencies, typechecks, runs unit tests, and builds the site.
3) Publishes the generated site to GitHub `gh-pages`.

Run the workflow manually from Gitea's Actions tab when a
`source-arcgis-rest@develop` change should be deployed without a corresponding
release-branch commit.

The workflow requires an active Gitea Actions runner, read access to the source
dependency, and the repository Actions secret `GH_DEPLOY_KEY`. The matching
public deploy key on GitHub must have write access to this repository.

Notes

- Everything runs in the browser. Some servers may block cross-origin fetches for the table; map rendering often still works via MapLibre.
- Feature layers fetch progressively for the visible map extent. Auto-fetch can
  be paused, and manual fetches use the same in-browser cache.
