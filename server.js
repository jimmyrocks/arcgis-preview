// geopreview
// A super simple node app + leaflet frontend for viewing ESRI ArcGIS servers and querying them
//
// Forked from
// postgis-preview
// A super simple node app + leaflet frontend for quickly viewing PostGIS query results

// dependencies
var express = require('express');
var superagent = require('superagent');
var path = require('path');
var arcgisToGeoJSON = require('@esri/arcgis-to-geojson-utils').arcgisToGeoJSON;

// create express app and prepare db connection
var app = express();
var port = process.env.PORT || 4000;

// use express static to serve up the frontend
app.use(express.static(path.join(__dirname, 'public')));

// expose sql endpoint, grab query as URL parameter and send it to the database
app.get('/get', function (req, res) {
  var query = req.query;
  var format = query.format;
  var url = query.url + '/query?';
  delete query.url;
  delete query.format;

  var resJson = new ResWrapper(res, format || 'json');

  readArcGISRest(url, query, format)
    .then(function (result) {
      resJson(result);
    })
    .catch(function (e) {
      resJson({
        'error': e
      });
    });

});

function ResWrapper(res, format) {
  var formats = {
    'json': function(json) {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(json, null, 2));
    },
    'geojson': function(json, pretty) {
      res.setHeader('Content-disposition', 'attachment; filename=query.geojson');
      res.setHeader('Content-Type', 'application/json');
      res.send(geojsonify(json.features, pretty));
    },
    'csv': function(json, pretty) {
      res.setHeader('Content-disposition', 'attachment; filename=query.csv');
      res.setHeader('Content-Type', 'text/csv');
      res.send(csvify(json.features, pretty));
    }
  };
  return formats[format];
}

function geojsonify(geojsonFeatures) {
  var geojson = {
    'type': 'FeatureCollection',
    'features': geojsonFeatures
  };
  return JSON.stringify(geojson, null, 2);
}

function csvify (geojsonFeatures, noHeaders) {
  // This is a hack that will only work if all records have the same number or properties
  //
  var quotify = function(value) {
    value = value.toString ? value.toString() : '?';
    if (value.match(/[",\r\n]/)) {
      return value.replace('"','"') + '"';
    } else {
      return value;
    }
  };

  var csvArray = geojsonFeatures.map(function(feature) {
    var featureArray=[];
    for (var property in feature.properties) {
      featureArray.push(quotify(feature.properties[property]));
    }
    return featureArray.join(',');
  });

  var headerArray = [];
  if (noHeaders === true) {
    for (var propertyName in geojsonFeatures[0].properties){
      headerArray.push(quotify(propertyName));
    }
    csvArray.unshift(headerArray.join(','));
  }
  return csvArray.join('\r\n');
}

function readArcGISRest (url, query) {
  return new Promise(function (resolve, reject) {
    var response;
    superagent
      .get(url)
      .query(query)
      .end(function (err, data) {
        console.log('d', data);
        if (err || !data) {
          reject(err || 'no response from server');
        } else {
          try {
            response = convertResponse(data);
            if (response.error || response.features === undefined) {
              reject(response.error || 'No features returned');
            } else {
              resolve(response);
            }
          } catch (e) {
            reject(e || 'Error parsing response');
          }
        }
      });
  });
}

function convertResponse(data) {
  var esriJson = JSON.parse(data.text);

  console.log(esriJson);
  if (esriJson.features) {
    // parse ArcGIS JSON, convert it to GeoJSON
    esriJson.features = esriJson.features.map(function (feature) {
      return arcgisToGeoJSON(feature);
    });
  }

  return esriJson;
}

// start the server
app.listen(port);
console.log('geopreview is listening on port ' + port + '...');
