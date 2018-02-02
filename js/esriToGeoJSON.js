/*
 * Copyright 2017 Esri
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// FORKED FROM: https://github.com/Esri/arcgis-to-geojson-utils

function esriToGeoJSON (esriJson, primaryKey) {
  function geojsonify (geojsonFeatures) {
    var geojson = {
      'type': 'FeatureCollection',
      'features': geojsonFeatures
    };
    return JSON.stringify(geojson, null, 2);
  }

  function csvify (geojsonFeatures, noHeaders) {
    // This is a hack that will only work if all records have the same number or properties
    //
    var quotify = function (value) {
      value = (value && value.toString) ? value.toString() : '?';
      if (value.match(/[",\r\n]/)) {
        return value.replace('"', '"') + '"';
      } else {
        return value;
      }
    };

    var csvArray = geojsonFeatures.map(function (feature) {
      var featureArray = [];
      for (var property in feature.properties) {
        featureArray.push(quotify(feature.properties[property]));
      }
      return featureArray.join(',');
    });

    var headerArray = [];
    if (noHeaders === true) {
      for (var propertyName in geojsonFeatures[0].properties) {
        headerArray.push(quotify(propertyName));
      }
      csvArray.unshift(headerArray.join(','));
    }
    return csvArray.join('\r\n');
  }

  // checks if 2 x,y points are equal
  function pointsEqual (a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  // checks if the first and last points of a ring are equal and closes the ring
  function closeRing (coordinates) {
    if (!pointsEqual(coordinates[0], coordinates[coordinates.length - 1])) {
      coordinates.push(coordinates[0]);
    }
    return coordinates;
  }

  // determine if polygon ring coordinates are clockwise. clockwise signifies outer ring, counter-clockwise an inner ring
  // or hole. this logic was found at http://stackoverflow.com/questions/1165647/how-to-determine-if-a-list-of-polygon-
  // points-are-in-clockwise-order
  function ringIsClockwise (ringToTest) {
    var total = 0;
    var i = 0;
    var rLength = ringToTest.length;
    var pt1 = ringToTest[i];
    var pt2;
    for (i; i < rLength - 1; i++) {
      pt2 = ringToTest[i + 1];
      total += (pt2[0] - pt1[0]) * (pt2[1] + pt1[1]);
      pt1 = pt2;
    }
    return (total >= 0);
  }

  // ported from terraformer.js https://github.com/Esri/Terraformer/blob/master/terraformer.js#L504-L519
  function vertexIntersectsVertex (a1, a2, b1, b2) {
    var uaT = ((b2[0] - b1[0]) * (a1[1] - b1[1])) - ((b2[1] - b1[1]) * (a1[0] - b1[0]));
    var ubT = ((a2[0] - a1[0]) * (a1[1] - b1[1])) - ((a2[1] - a1[1]) * (a1[0] - b1[0]));
    var uB = ((b2[1] - b1[1]) * (a2[0] - a1[0])) - ((b2[0] - b1[0]) * (a2[1] - a1[1]));

    if (uB !== 0) {
      var ua = uaT / uB;
      var ub = ubT / uB;

      if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return true;
      }
    }

    return false;
  }

  // ported from terraformer.js https://github.com/Esri/Terraformer/blob/master/terraformer.js#L521-L531
  function arrayIntersectsArray (a, b) {
    for (var i = 0; i < a.length - 1; i++) {
      for (var j = 0; j < b.length - 1; j++) {
        if (vertexIntersectsVertex(a[i], a[i + 1], b[j], b[j + 1])) {
          return true;
        }
      }
    }

    return false;
  }

  // ported from terraformer.js https://github.com/Esri/Terraformer/blob/master/terraformer.js#L470-L480
  function coordinatesContainPoint (coordinates, point) {
    var contains = false;
    for (var i = -1, l = coordinates.length, j = l - 1; ++i < l; j = i) {
      if (((coordinates[i][1] <= point[1] && point[1] < coordinates[j][1]) ||
          (coordinates[j][1] <= point[1] && point[1] < coordinates[i][1])) &&
        (point[0] < (((coordinates[j][0] - coordinates[i][0]) * (point[1] - coordinates[i][1])) / (coordinates[j][1] - coordinates[i][1])) + coordinates[i][0])) {
        contains = !contains;
      }
    }
    return contains;
  }

  // ported from terraformer-arcgis-parser.js https://github.com/Esri/terraformer-arcgis-parser/blob/master/terraformer-arcgis-parser.js#L106-L113
  function coordinatesContainCoordinates (outer, inner) {
    var intersects = arrayIntersectsArray(outer, inner);
    var contains = coordinatesContainPoint(outer, inner[0]);
    if (!intersects && contains) {
      return true;
    }
    return false;
  }

  // do any polygons in this array contain any other polygons in this array?
  // used for checking for holes in arcgis rings
  // ported from terraformer-arcgis-parser.js https://github.com/Esri/terraformer-arcgis-parser/blob/master/terraformer-arcgis-parser.js#L117-L172
  function convertRingsToGeoJSON (rings) {
    var outerRings = [];
    var holes = [];
    var x; // iterator
    var outerRing; // current outer ring being evaluated
    var hole; // current hole being evaluated

    // for each ring
    for (var r = 0; r < rings.length; r++) {
      var ring = closeRing(rings[r].slice(0));
      if (ring.length < 4) {
        continue;
      }
      // is this ring an outer ring? is it clockwise?
      if (ringIsClockwise(ring)) {
        var polygon = [ring];
        outerRings.push(polygon); // push to outer rings
      } else {
        holes.push(ring); // counterclockwise push to holes
      }
    }

    var uncontainedHoles = [];

    // while there are holes left...
    while (holes.length) {
      // pop a hole off out stack
      hole = holes.pop();

      // loop over all outer rings and see if they contain our hole.
      var contained = false;
      for (x = outerRings.length - 1; x >= 0; x--) {
        outerRing = outerRings[x][0];
        if (coordinatesContainCoordinates(outerRing, hole)) {
          // the hole is contained push it into our polygon
          outerRings[x].push(hole);
          contained = true;
          break;
        }
      }

      // ring is not contained in any outer ring
      // sometimes this happens https://github.com/Esri/esri-leaflet/issues/320
      if (!contained) {
        uncontainedHoles.push(hole);
      }
    }

    // if we couldn't match any holes using contains we can try intersects...
    while (uncontainedHoles.length) {
      // pop a hole off out stack
      hole = uncontainedHoles.pop();

      // loop over all outer rings and see if any intersect our hole.
      var intersects = false;

      for (x = outerRings.length - 1; x >= 0; x--) {
        outerRing = outerRings[x][0];
        if (arrayIntersectsArray(outerRing, hole)) {
          // the hole is contained push it into our polygon
          outerRings[x].push(hole);
          intersects = true;
          break;
        }
      }

      if (!intersects) {
        outerRings.push([hole.reverse()]);
      }
    }

    if (outerRings.length === 1) {
      return {
        type: 'Polygon',
        coordinates: outerRings[0]
      };
    } else {
      return {
        type: 'MultiPolygon',
        coordinates: outerRings
      };
    }
  }

  function shallowClone (obj) {
    var target = {};
    for (var i in obj) {
      if (obj.hasOwnProperty(i)) {
        target[i] = obj[i];
      }
    }
    return target;
  }

  function arcgisToGeoJSON (arcgis, idAttribute) {
    var geojson = {};

    if (typeof arcgis.x === 'number' && typeof arcgis.y === 'number') {
      geojson.type = 'Point';
      geojson.coordinates = [arcgis.x, arcgis.y];
      if (typeof arcgis.z === 'number') {
        geojson.coordinates.push(arcgis.z);
      }
    }

    if (arcgis.points) {
      geojson.type = 'MultiPoint';
      geojson.coordinates = arcgis.points.slice(0);
    }

    if (arcgis.paths) {
      if (arcgis.paths.length === 1) {
        geojson.type = 'LineString';
        geojson.coordinates = arcgis.paths[0].slice(0);
      } else {
        geojson.type = 'MultiLineString';
        geojson.coordinates = arcgis.paths.slice(0);
      }
    }

    if (arcgis.rings) {
      geojson = convertRingsToGeoJSON(arcgis.rings.slice(0));
    }

    if (arcgis.geometry || arcgis.attributes) {
      geojson.type = 'Feature';
      geojson.geometry = (arcgis.geometry) ? arcgisToGeoJSON(arcgis.geometry) : null;
      geojson.properties = (arcgis.attributes) ? shallowClone(arcgis.attributes) : null;
      if (arcgis.attributes) {
        geojson.id = arcgis.attributes[idAttribute] || arcgis.attributes.OBJECTID || arcgis.attributes.FID;
      }
    }

    // if no valid geometry was encountered
    if (JSON.stringify(geojson.geometry) === JSON.stringify({})) {
      geojson.geometry = null;
    }

    return geojson;
  }
  var dataFeatures = esriJson.features || [];
  var features = dataFeatures.map(function(feature) {
    return arcgisToGeoJSON(feature, primaryKey);
  });
  return {
    'geojson': geojsonify(features),
    'csv': csvify(features),
    'features': features
  };
}
