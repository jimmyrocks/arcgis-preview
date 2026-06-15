# Product Vision

---

## What this tool is

A **field tool for GIS practitioners** — bring it up in any browser on any network, paste an ArcGIS REST URL, and immediately see what's in the data. No account, no install, no project setup.

The primary use case: **showing up at a client site, connecting to their ArcGIS server on their internal network, and exploring what's there** — schema, layers, field values, spatial extent — live, in front of them.

Think DBeaver or TablePlus for SQL databases, but for ArcGIS REST services.

---

## The workflow it enables

1. Arrive at client site. Open browser. Pull up the tool.
2. Paste the client's ArcGIS server URL (internal network, no CORS issue).
3. Layer Finder browses the server hierarchy — folders, services, layers.
4. Open a layer. See features on the map immediately.
5. Filter with WHERE to check specific subsets.
6. Inspect field values, schema, record counts in the sidebar.
7. Style by attribute to visualize distributions.
8. Export a filtered GeoJSON/CSV sample or copy the query URL to hand off.

---

## Competitive landscape

### What exists

| Tool | Problem |
|---|---|
| **ArcGIS Online Map Viewer** | Requires account, slow, assumes GIS professional, burying REST URL paste behind menus |
| **ArcGIS REST HTML browser** | Every server exposes `/rest/services` as self-describing HTML — works, but raw and ugly |
| **Felt** | Beautiful modern GIS app, but subscription-based, upload-focused, not ArcGIS-REST-native |
| **Kepler.gl** | Great for large datasets, but file/API upload only — no ArcGIS URL paste, no layer browsing |
| **geojson.io** | Gold standard for GeoJSON quick-view, zero friction — but wrong format entirely |
| **QGIS** | Free, powerful, desktop app — real learning cliff, not a quick field tool |
| **Various "ArcGIS viewer" GitHub projects** | Almost all abandoned, developer-only, or broken on modern CORS rules |

### The real gap

**There is no good, free, zero-friction way to paste an ArcGIS REST URL and just see the data.** Official tools gate everything behind accounts. Unofficial tools are developer-only. This is the hole.

---

## Differentiators

### Already true

- **Zero auth, zero install** — works in any browser on any network
- **URL-shareable state** — `?url=…&where=…` encodes everything; paste to a colleague and they see exactly what you see
- **Layer Finder** — browse an entire ArcGIS server like a file system; nothing else does this gracefully
- **Dev tools built in** — WHERE editor, metadata panel, download, query URL — things GIS devs need constantly but no simple viewer has
- **Works on internal networks** — the primary client-site use case; CORS is a non-issue on the same network

### Goals

- **Speed** — adaptive page size, MapLibre rendering, cached server hierarchies. Feels instant on return visits.
- **Progressive disclosure** — paste URL → see map → done. Filter, style, inspect, download are tabs you open if you want them.
- **Framing** — not "an ArcGIS viewer," but **"TablePlus for ArcGIS"**: fast, local, connect-and-explore.

---

## Gaps to close (roughly prioritized)

### High value, lower effort

**Field statistics / data profiling**
The most useful thing in a data discovery session is knowing field completeness and value distributions. Currently you get the field list but no quality indicators. A "Profile" view per field showing null %, distinct value count, min/max for numerics, and top-N values for strings would be extremely fast to build and extremely valuable. See also `TODO-style-switcher.md` — Style by Attribute is the *visual* complement to this: once tabular profiling exists, coloring the map by a field is the natural next step for spatial data quality review.

**"What's on this server" summary view**
Before drilling into a layer, a scannable one-page overview of the server — total services, types breakdown, folder count — would be great for a quick briefing. The Layer Finder gives you this interactively but not at a glance.

**Quick shareable snapshot**
`?url=…&where=…&style=…` is partially there. A "Copy report link" button that encodes the current state (including style mode and filter) would let you hand a reproducible view to a client after the meeting.

### High value, higher effort

**Authentication handling**
Internal ArcGIS servers often require Windows auth, token auth, or OAuth. A 401 currently just shows an error. Detecting auth-required and surfacing "Open this URL to authenticate, then return" (or a token input field) would make the tool usable on secured internal servers — which is exactly the client-site scenario.

**Field profiling tab (deeper)**
Beyond per-field stats: a full "Profiler" tab that runs `SELECT field, COUNT(*) GROUP BY field` style queries against the ArcGIS REST API to show value distributions, top-N values, outliers. Useful for data quality reviews.

**Embed code**
"Copy iframe" that generates a minimal embeddable viewer for a specific URL + WHERE + style. Journalists and researchers would use this constantly to embed a live filtered layer in a story or dashboard.

### Lower priority

**Offline / installable (PWA)**
If a client site has no internet, tile basemaps fail. A PWA manifest + service worker caching the app shell ensures it always loads. An offline-capable basemap fallback (blank canvas or cached tiles) would make it fully usable air-gapped.

**Diff / compare mode**
Load two layers (different WHERE clauses, or two servers) side-by-side or toggled. No competitor does this. Useful for before/after comparisons during a data migration review.

**"Open in QGIS" / "Copy as cURL"**
One-click escape hatches for when a user needs to go deeper than the viewer allows.

**Named links**
`?url=…&name=My+Map` so shared links show a human label instead of a raw URL in the browser tab and any link previews.

---

## Audience

| Primary | GIS consultants, analysts, and developers doing reconnaissance or review on unfamiliar ArcGIS servers |
|---|---|
| Secondary | Civic hackers, journalists, researchers accessing public government/NGO ArcGIS data |
| Not the target | ArcGIS Online power users who need editing, publishing, or full cartographic control |

The primary audience knows what ArcGIS is but doesn't want to open ArcGIS Online for a quick look. The secondary audience may not know ArcGIS at all — they just have a URL from a data portal and need to see what's in it.

Both audiences benefit from the same thing: **zero friction, immediate data, progressive disclosure of power features**.

---

## Design principles

1. **URL first** — the URL is the product. Paste in, see data. Everything else is secondary.
2. **No jargon on first contact** — "Root", "service type", "WKID" are hidden behind advanced panels. The first screen says "paste a URL."
3. **Works where GIS professionals actually are** — internal networks, air-gapped environments, client laptops. No cloud dependency for core functionality.
4. **Escape hatches over walls** — when the tool can't do something (auth, complex symbology, huge datasets), give the user a path forward rather than a dead end.
5. **Speed is a feature** — a tool you pull up in a client meeting has to be fast. Slow = awkward. Cached hierarchies, adaptive fetch, instant render.
