# ArcGIS Geo Preview
A lightweight frontend for quickly previewing ArcGIS Geo queries. _Pull Requests Welcomed!_  Take a look at the [open issues](https://github.com/jimmyrocks/arcgis-preview/issues)
Forked from [PostGIS Preview](https://github.com/chriswhong/postgis-preview).

### Why
I have been working with many ArcGIS REST endpoints, and wanted a quick and easy way to visualize the data contained in these systems.

I have been using the [PostGIS Preview](https://github.com/chriswhong/postgis-preview) project to visualize some internal PostGIS databases, and thought that this format would be useful for ArcGIS REST endpoints as well. Since ArcGIS REST endpoints are already web servers and support jsonp, I realized that this project could be implemented as just a frontend and hosted directly from Github.

### The original postgis-preview project background
Our team at the NYC Department of City Planning needed to be able to test out PostGIS Geo queries in a local environment and iterate quickly.  CartoDB provides this functionality, giving users a SQL pane and a map view to quickly see the geometries returned from the database (This UI and SQL preview workflow are inspired by the CartoDB editor)

When asking on Twitter if anyone had solutions to this problem, responses included:
  - Run queries in pgadmin and use `ST_asGeoJson()`, copy and paste the geojson into [geojson.io](http://www.geojson.io)
  - Use [QGIS](http://www.qgis.org/en/site/) dbmanager.  This works, but requires a few clicks once the data are returned to add them to the map.
  - Use various command line tools that show previews in the terminal or send the results to geojson.io programmatically.

### How ArcGIS Preview works
The frontend is a simple Bootstrap layout with a Leaflet map, CartoDB basemaps, a table, and a SQL pane.  The ESRI Json from the ArcGIS REST Endpoint is parsed using the jsonConverters.js code from Esri's [geojson-utils](https://github.com/Esri/geojson-utils) project. It adds that GeoJSON to the map as an L.geoJson layer with generic styling.

### How to Use

- Navigate to: [The Web Interface](https://jimmyrocks.github.io/arcgis-preview)
- Enter your ArcGIS endpoint Feature Server or Map Server, include the number as well (ex. .../MapServer/0/)
- Edit the "Where" section (defaults to 1=1) to query certain attributes, similar to how you modify the Where second on the REST HTML page
- Select (or deselect) the query current extent, this limits your query to only data displayed within the current view
- Query like a boss

### TODO

- Allow exports from this tool to other formats.
  - JSON
  - CSV
  - Geojson.io
