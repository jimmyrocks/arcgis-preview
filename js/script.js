/* global $, L, esriToGeoJSON, CodeMirror */
function init (){
  'use strict';
  //initialize a leaflet map
  var map = L.map('map', {minZoom: 0, maxZoom: 21})
    .setView([40.708816,-74.008799], 11);
  
  //layer will be where we store the L.geoJSON we'll be drawing on the map
  var layer;

  //add CartoDB 'dark matter' basemap
  L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
  }).addTo(map);

  var queryHistory = (localStorage.history) ? JSON.parse(localStorage.history) : [];
  var historyIndex = queryHistory.length;
  updateHistoryButtons();

  //listen for submit of new query
  $('#run').click(function(){
    submitQuery();
  });

  function cloneObj(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function fromHash(hash) {
    var rawHistory = {};
    hash = hash.replace(/^#/,'');
    var hashArray = hash.split('&');
    hashArray.forEach(function(record) {
      var k = record.split('=')[0];
      var v = record.split('=')[1];
      rawHistory[k] = decodeURIComponent(v);
    });
    return new HistoryObject(false, rawHistory.endpoint, rawHistory.query, rawHistory.bbox);
  }

  function HistoryObject(historic, endpoint, query, bbox) {

    function toHash(obj) {
      var hashArray = [];
      for (var k in obj) {
        if (k !== 'hash' && obj[k] !== undefined) {
          hashArray.push(k + '=' + encodeURIComponent(obj[k]));
        }
      }
      return hashArray.join('&');
    }

    var bounds;
    endpoint = endpoint || window.endpoint.getDoc().getValue();
    query = query || window.editor.getDoc().getValue();
    var bboxText = window.useExtent.checked &&
               map.getBounds()._southWest.lng + ',' +
               map.getBounds()._southWest.lat + ',' +
               map.getBounds()._northEast.lng + ',' +
               map.getBounds()._northEast.lat;
    bbox = (bbox === undefined ? bboxText : bbox);

    // Convert it back to bounds
    if (bbox !== false) {
      bounds =  bbox.split(',');
      bounds = [[bounds[1], bounds[0]],[bounds[3], bounds[2]]];
    }

    var history = {
      endpoint: endpoint,
      query: query,
      bbox: bbox,
      bounds: bounds
    };

    history.hash = toHash(history);

    if (historic) {
      addToHistory(cloneObj(history));
    }

    return cloneObj(history);
  }

  function createQueryObj(historic) {

    //clear the map
    if( map.hasLayer(layer)) {
      layer.clearLayers();
    }

    // Create a new history object based on the current state of the browser
    var historyObject = new HistoryObject(historic);

    //Strip the trailing slash if there is one
    var baseUrl = historyObject.endpoint.replace(/\/{1,}(query)?(\?)?$/,'');
    var bbox = historyObject.bbox;
    var queryObj = {
      'url': baseUrl,
      'hash': historyObject.hash,
      'where': historyObject.query,
      'geometry': bbox === false ? '' : bbox,
      'geometryType': 'esriGeometryEnvelope',
      'inSR':'4326',
      'outFields':'*',
      'returnGeometry':'true',
      'outSR':'4326',
      'f':'JSON'
    };

    return queryObj;
  }

  function submitQuery() {
    $('#notifications').hide();
    $('#download').hide();
    $('#run').addClass('active');

    // pass the query to the sql api endpoint
    var queryObj = createQueryObj(true);
    var baseUrl = queryObj.url;
    var hash = queryObj.hash;
    delete queryObj.url;
    delete queryObj.hash;
    $.ajax({
      type: 'POST',
      dataType: 'jsonp',
      url: baseUrl + '/query?',
      data: queryObj,
      success: function(data) {
        var features = esriToGeoJSON(data).features;
        $('#notifications').removeClass().addClass('alert alert-success');
        if (features.length) {
          addLayer(features); //draw the map layer
          $('#notifications').text(features.length + ' features returned.');
          buildTable(features); //build the table
        } else {
          if (data.error) {
            $('#notifications').removeClass().addClass('alert alert-danger');
            $('#notifications').html('Error: ' + JSON.stringify(data.error, null, 2));
          } else {
          // There is no map to display, so switch to the data view
            $('#notifications').html(features.length+ ' features returned.<br/>No geometries returned, see the <a href="#" class="data-view">data view</a> for results.');
          }
          //toggle map and data view
          $('a.data-view').click(function() {
            $('#map').hide();
            $('#table').show();
          });
        }
        $('#notifications').show();
        $('#run').removeClass('active');
        updateHash(hash);
      },
      error: function(XMLHttpRequest, textStatus) {
        //write the error in the sidebar
        $('#run').removeClass('active');
        $('#notifications').removeClass().addClass('alert alert-danger');
        $('#notifications').text(textStatus);
        $('#notifications').show();
      }
    });
  }

  //toggle map and data view
  $('.btn-group button').click(function() {
    $(this).addClass('active').siblings().removeClass('active');

    var view = $(this)[0].innerText;

    if(view == 'Data View') {
      $('#map').hide();
      $('#table').show();
    } else {
      $('#map').show();
      $('#table').hide();
    }
  });

  //forward and backward buttons for query history
  $('#history-previous').click(function() {
    historyIndex--;
    updateEntry(queryHistory[historyIndex]);
    updateHistoryButtons();
  });

  $('#history-next').click(function() {
    historyIndex++;
    updateEntry(queryHistory[historyIndex]);
    updateHistoryButtons();
  });

  // TODO: Add export functions
  // $('#geojson').click(function() {
  //   var queryObj = createQueryObj(false);
  //   queryObj.format = 'geojson';
  //   var url = '/get?' + urlify(queryObj);
  //   // window.open(url, '_blank');
  // });
  //
  // $('#csv').click(function() {
  //   var queryObj = createQueryObj(false);
  //   queryObj.format = 'csv';
  //   var url = '/get?' + urlify(queryObj);
  //   // window.open(url, '_blank');
  // });

  // initialize keyboard shortcut for submit
  $(window).keydown(function(e){
    if (e.metaKey && e.keyCode == 83) {
      // crtl/cmd+S for submit
      e.preventDefault();
      submitQuery();
      return false;
    }
  });

  function propertiesTable( properties ) {
    if (!properties) {
      properties = {};
    }

    var table = $('<table><tr><th>Column</th><th>Value</th></tr></table>');
    var keys = Object.keys(properties);
    var banProperties = ['geom'];
    for (var k = 0; k < keys.length; k++) {
      if (banProperties.indexOf(keys[k]) === -1) {
        var row = $('<tr></tr>');
        row.append($('<td></td>').text(keys[k]));
        row.append($('<td></td>').text(properties[keys[k]]));
        table.append(row);
      }
    }
    return '<table border="1">' + table.html() + '</table>';
  }

  function addLayer( features ) {
    //create an L.geoJson layer, add it to the map
    layer = L.geoJson(features, {
      style: {
        color: '#fff', // border color
        fillColor: 'steelblue',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7
      },

      onEachFeature: function ( feature, layer ) {
        if (feature.geometry.type !== 'Point') {
          layer.bindPopup(propertiesTable(feature.properties));
        }
      },

      pointToLayer: function ( feature, latlng ) {
        return L.circleMarker(latlng, {
          radius: 4,
          fillColor: '#ff7800',
          color: '#000',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        }).bindPopup(propertiesTable(feature.properties));
      }
    }).addTo(map);

    map.fitBounds(layer.getBounds());
    $('#notifications').empty();
  }

  function buildTable(features) {
    var columns = Object.keys(features[0].properties).map(function(name){return {'title': name};});
    var rows = [];
    features.forEach(function(feature) {
      var row = [];
      columns.forEach(function(column) {
        if (feature.properties && feature.properties[column.title] !== undefined) {
          row.push(feature.properties[column.title]);
        } else {
          row.push('');
        }
      });
      rows.push(row);
    });

    if ($('#data-view_filter').length) {
      $('#data-view').DataTable().destroy();
      $('#data-view').empty();
    }

    $('#data-view').DataTable( {
      columns: columns,
      data: rows
    });

    $('#data-view').DataTable().draw();
  }

  function addToHistory(entry) {
    //only store the last 25 queries
    if(queryHistory.length>25) {
      queryHistory.shift();
      historyIndex--;
    }

    queryHistory.push(entry);
    localStorage.history = JSON.stringify(queryHistory);
    historyIndex++;
    updateHistoryButtons();
  }

  function updateEntry(historyObj) {

    var history = new HistoryObject(false, historyObj.endpoint, historyObj.query, historyObj.bbox);
    window.endpoint.setValue(history.endpoint);
    window.editor.setValue(history.query);
    $('#useExtent').prop('checked', history.bbox.toString() !== 'false');
    if (history.bbox.toString() !== 'false') {
      map.fitBounds(history.bounds);
    }
  }

  //enable and disable history buttons based on length of queryHistory and historyIndex
  function updateHistoryButtons() {
    if (historyIndex > queryHistory.length - 2) {
      $('#history-next').addClass('disabled');
    } else {
      $('#history-next').removeClass('disabled');
    }

    if(queryHistory[historyIndex-1]) {
      $('#history-previous').removeClass('disabled');
    } else {
      $('#history-previous').addClass('disabled');
    }
  }

  // Hash functions
  function readHash(hash) {
    if (hash.length > 1) {
      updateEntry(fromHash(hash));
      submitQuery();
    }
  }

  function updateHash(hash) {
    window.location.hash = hash;
  }

  readHash(window.location.hash);
}

//Load codemirror for syntax highlighting
window.onload = function() {
  window.endpoint = CodeMirror.fromTextArea(document.getElementById('endpointPane'), {
    indentWithTabs: true,
    smartIndent: true,
    lineNumbers: false,
    matchBrackets : false,
    autofocus: true,
    lineWrapping: true,
    theme: 'monokai'
  });
  window.endpoint.setSize(null,115);

  window.editor = CodeMirror.fromTextArea(document.getElementById('wherePane'), {
    mode: 'text/x-pgsql',
    indentWithTabs: true,
    smartIndent: true,
    lineNumbers: false,
    matchBrackets : true,
    autofocus: false,
    lineWrapping: true,
    theme: 'monokai'
  });
  $('.CodeMirror')[1].setAttribute('style','top:-14px');
  window.editor.setSize(null,165);

  window.useExtent = $('input#useExtent')[0];

  // Run the scripts
  init();
};
