/* global $, L, esriToGeoJSON, CodeMirror */
(function(){
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

  function urlify(obj) {
    var params = [];
    for (var objName in obj) {
      params.push(encodeURIComponent(objName) + '=' + encodeURIComponent(obj[objName]));
    }
    return params.join('&');
  }

  function createQueryObj(historic) {
    var url = window.endpoint.getDoc().getValue();
    var where = window.editor.getDoc().getValue();
    var bbox = window.useExtent.checked &&
               map.getBounds()._southWest.lng + ',' +
               map.getBounds()._southWest.lat + ',' +
               map.getBounds()._northEast.lng + ',' +
               map.getBounds()._northEast.lat;

    //clear the map
    if( map.hasLayer(layer)) {
      layer.clearLayers();
    }

    if (historic) {
      addToHistory({
        endpoint: url,
        where: where,
        bbox: bbox
      });
    }

    //Strip the trailing slash if there is one
    var baseUrl = url.replace(/\/{1,}(query)?(\?)?$/,'');
    var queryObj = {
      'url': baseUrl,
      'where':where,
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
    delete queryObj.url;
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

  $('#geojson').click(function() {
    var queryObj = createQueryObj(false);
    queryObj.format = 'geojson';
    var url = '/get?' + urlify(queryObj);
    // window.open(url, '_blank');
  });

  $('#csv').click(function() {
    var queryObj = createQueryObj(false);
    queryObj.format = 'csv';
    var url = '/get?' + urlify(queryObj);
    // window.open(url, '_blank');
  });

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

  function updateEntry(entry) {
    window.endpoint.setValue(entry.endpoint);
    window.editor.setValue(entry.where);
    $('#useExtent').prop('checked', entry.bbox !== false);
    window.aaa = map;
    window.bbb = entry.bbox;
    if (entry.bbox !== false) {
      var bounds = entry.bbox.split(',');
      map.fitBounds([[bounds[1], bounds[0]],[bounds[3], bounds[2]]]);
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

}());

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
};
