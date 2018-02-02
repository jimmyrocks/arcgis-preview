(function(){
  'use strict'
  //initialize a leaflet map
  var map = L.map('map', {minZoom: 0, maxZoom: 21})
    .setView([40.708816,-74.008799], 11);
  
  //layer will be where we store the L.geoJSON we'll be drawing on the map
  var layer;

  var sql;

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
    var baseUrl = url.replace(/\/{1,}$/,'');
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

    clearTable();


    // pass the query to the sql api endpoint
    $.getJSON('/get?', createQueryObj(true), function(data) {
      console.log('dataz', data);
      $('#run').removeClass('active');
      $('#notifications').show();
      $('#download').show();
      if (data.error !== undefined) {
        //write the error in the sidebar
        $('#notifications').removeClass().addClass('alert alert-danger');
        $('#notifications').text(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      } else if (data.features.length == 0) {
        $('#notifications').removeClass().addClass('alert alert-warning');
        $('#notifications').text('Your query returned no features.');
      } else {
        var features = data.features;
        var geoFeatures = features.filter(function(feature) {
          return feature.geometry;
        });
        $('#notifications').removeClass().addClass('alert alert-success');
        if (geoFeatures.length) {
          addLayer(geoFeatures); //draw the map layer
          $('#notifications').text(features.length + ' features returned.');
        } else {
          // There is no map to display, so switch to the data view
          $('#notifications').html(features.length+ ' features returned.<br/>No geometries returned, see the <a href="#" class="data-view">data view</a> for results.');
          //toggle map and data view
          $('a.data-view').click(function() {
            $('#map').hide();
            $('#table').show();
          });

        }
        buildTable(features); //build the table
      }
    }, function(e) {
      $('#notifications').removeClass().addClass('alert alert-danger');
      $('#notifications').text('unknown error');
    });
  };

  //toggle map and data view
  $('.btn-group button').click(function(e) {
    $(this).addClass('active').siblings().removeClass('active');

    var view = $(this)[0].innerText;

    if(view == "Data View") {
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
    window.open(url, '_blank');
  });

  $('#csv').click(function() {
    var queryObj = createQueryObj(false);
    queryObj.format = 'csv';
    var url = '/get?' + urlify(queryObj);
    window.open(url, '_blank');
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

    var table = $("<table><tr><th>Column</th><th>Value</th></tr></table>");
    var keys = Object.keys(properties);
    var banProperties = ['geom'];
    for (var k = 0; k < keys.length; k++) {
      if (banProperties.indexOf(keys[k]) === -1) {
        var row = $("<tr></tr>");
        row.append($("<td></td>").text(keys[k]));
        row.append($("<td></td>").text(properties[keys[k]]));
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
            fillColor: "#ff7800",
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          }).bindPopup(propertiesTable(feature.properties));
        }
      }).addTo(map)

      map.fitBounds(layer.getBounds());
      $('#notifications').empty();
  }

  function buildTable( features ) {
    //assemble a table from the geojson properties

    //first build the header row
    var fields = Object.keys( features[0].properties );

    $('#table').find('thead').append('<tr/>');
    $('#table').find('tfoot').append('<tr/>');

    fields.forEach( function( field ) {
      $('#table').find('thead').find('tr').append('<th>' + field + '</th>');
      $('#table').find('tfoot').find('tr').append('<th>' + field + '</th>')
    });

    features.forEach( function( feature ) {
      //create tr with tds in memory
      var $tr = $('<tr/>');

      fields.forEach( function( field ) {
        $tr.append('<td>' + feature.properties[field] + '</td>')
      })

      $('#table').find('tbody').append($tr);
    });

      $('#table>table').DataTable();
  }

  function clearTable() {
    $('#table').find('thead').empty();
    $('#table').find('tfoot').empty();
    $('#table').find('tbody').empty();
  };

  function addToHistory(entry) {
    //only store the last 25 queries
    if(queryHistory.length>25) {
      queryHistory.shift();
    }

    queryHistory.push(entry);
    localStorage.history = JSON.stringify(queryHistory);
    historyIndex++;
    updateHistoryButtons();
  }

  function updateEntry(entry) {
    endpoint.setValue(entry.url);
    editor.setValue(entry.where);
    // bbox.setValue(entry.bbox);
  }

  //enable and disable history buttons based on length of queryHistory and historyIndex
  function updateHistoryButtons() {
    if (historyIndex > queryHistory.length - 2) {
       $('#history-next').addClass('disabled')
     } else {
       $('#history-next').removeClass('disabled')
    }

    if(queryHistory[historyIndex-1]) {
      $('#history-previous').removeClass('disabled')
    } else {
      $('#history-previous').addClass('disabled')
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
  endpoint.setSize(null,115);

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
  editor.replaceRange('\n', {line:2,ch:0}); // create newline for editing
  editor.setCursor(2,0);

  window.useExtent = $("input#useExtent")[0];
};
