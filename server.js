// geopreview
// A super simple node app + leaflet frontend for viewing ESRI ArcGIS servers and querying them
//
// Forked from
// postgis-preview
// A super simple node app + leaflet frontend for quickly viewing PostGIS query results

// dependencies
var express = require('express');
var jsonexport = require('jsonexport');
var superagent = require('superagent');
var path = require('path');
require('dotenv').config();

// create express app and prepare db connection
var app = express();
var port = process.env.PORT || 4000;

// use express static to serve up the frontend
app.use(express.static(path.join(__dirname, 'public')));

// expose sql endpoint, grab query as URL parameter and send it to the database
app.get('/sql', function (req, res) {
  var sql = req.query.q;
  var format = req.query.format || 'topojson';
  console.log('Executing SQL: ' + sql, format);
  // query using pg-promise
  jsonExport({});
});

function jsonExport (data) {
  // remove geom
  data.forEach(function (row) {
    delete row.geom;
  });

  return new Promise(function (resolve, reject) {
    jsonexport(data, function (err, csv) {
      if (err) {
        reject(err);
      } else {
        resolve(csv);
      }
    });
  });
}

// start the server
app.listen(port);
console.log('postgis-preview is listening on port ' + port + '...');
