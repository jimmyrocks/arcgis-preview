/* Simple runtime tests without external frameworks */
import { getFeatureId } from '../src/lib/ids';
import { approxPrecisionMetersFromZoomLat } from '../src/lib/mapMath';
import { buildArcgisJsonUrl, canonicalizeArcgisRestUrl, coerceArcgisRestServicesUrl, getRestServiceUrlInfo } from '../src/lib/arcgis';
import { getLayerDescription, htmlToPlainText, summarizePlainText } from '../src/lib/arcgisDescription';
import { buildWhereCondition, formatWhereValue, joinWhereCondition } from '../src/lib/whereBuilder';
import { compareExactIntegers, fieldHasUnsafeIntegers, parseArcGISFeatureId, safeNumericIdAlternative } from '../src/lib/arcgisInteger';
import { stringifyExactJSON } from '../src/lib/exactJson';
import { rowsToCSV } from '../src/lib/csv';
import { featureCollectionToKml, featureCollectionToKmz } from '../src/lib/kml';
import { buildColorExpression, buildCustomLayers } from '../src/lib/esriStyle';
import { dedupeFeatures } from '../src/lib/dedupeFeatures';
import { buildArcGISRequestUrl, normalizeArcGISGeoJSONPage } from '../src/lib/arcgisGeoJSON';
import {
  describeArcgisRenderer,
  getRenderableArcgisRenderer,
  hasRenderableArcgisRenderer,
  pickArcgisRendererSymbol
} from '../src/lib/arcgisRenderer';
import {
  buildKmlMarkerIconDataUri,
  buildKmlStyleHint,
  evaluateRendererSymbol,
  symbolToKmlStyleXml
} from '../src/lib/kmlStyle';

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} | Expected: ${expected}, got: ${actual}`);
  }
}

function assertDeepEqual(actual: any, expected: any, message: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message} | Expected: ${expectedJson}, got: ${actualJson}`);
  }
}

function test_getFeatureId() {
  const cases: Array<{ f: any; expected: any; name: string }> = [
    { f: { type: 'Feature', id: 123, properties: { OBJECTID: 7 } }, expected: 123, name: 'prefers feature.id' },
    { f: { type: 'Feature', properties: { OBJECTID: 42 } }, expected: 42, name: 'OBJECTID attribute' },
    { f: { type: 'Feature', properties: { objectid: 11 } }, expected: 11, name: 'objectid lowercase' },
    { f: { type: 'Feature', properties: { fid: 'abc' } }, expected: 'abc', name: 'fid attribute' },
    { f: { type: 'Feature', properties: { id: 'x' } }, expected: 'x', name: 'id attribute' },
    { f: { type: 'Feature', properties: { Name: 'foo' } }, expected: null, name: 'no id' }
  ];
  for (const c of cases) {
    const got = getFeatureId(c.f);
    assertEqual(got, c.expected, `getFeatureId: ${c.name}`);
  }
}

function expectedApprox(zoom: number, lat: number): number {
  const mpp = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
  return Math.max(1, Math.round(mpp * 1.5));
}

function test_mapMath() {
  const cases: Array<{ z: number; lat: number; name: string }> = [
    { z: 0, lat: 0, name: 'z0 @ equator' },
    { z: 10, lat: 45, name: 'z10 @ mid-lat' },
    { z: 20, lat: 80, name: 'z20 @ high-lat' }
  ];
  for (const c of cases) {
    const got = approxPrecisionMetersFromZoomLat(c.z, c.lat);
    const exp = expectedApprox(c.z, c.lat);
    assertEqual(got, exp, `approxPrecisionMetersFromZoomLat: ${c.name}`);
  }
}

function test_dedupeFeatures() {
  const features: any[] = [
    { type: 'Feature', id: 1, properties: { OBJECTID: 1, name: 'A' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    { type: 'Feature', id: 1, properties: { OBJECTID: 1, name: 'A' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    { type: 'Feature', properties: { name: 'No id', __zoom: 12 }, geometry: { type: 'Point', coordinates: [1, 1] } },
    { type: 'Feature', properties: { __zoom: 15, name: 'No id' }, geometry: { type: 'Point', coordinates: [1, 1] } },
    { type: 'Feature', id: 2, properties: { OBJECTID: 2, name: 'B' }, geometry: { type: 'Point', coordinates: [2, 2] } },
    { type: 'Feature', id: 3, properties: { OBJECTID: 3, name: 'C' }, geometry: { type: 'Point', coordinates: [2, 2] } }
  ];
  const result = dedupeFeatures(features);
  assertEqual(result.features.length, 4, 'dedupeFeatures: keeps unique feature set');
  assertEqual(result.summary.duplicateIdentityCount, 1, 'dedupeFeatures: counts duplicate ids');
  assertEqual(result.summary.duplicateNoIdCount, 1, 'dedupeFeatures: counts duplicate no-id fingerprints');
  assertEqual(result.summary.repeatedGeometryCount, 1, 'dedupeFeatures: detects repeated geometry across ids');
  assertDeepEqual(result.summary.suspectedDuplicateIds, [3], 'dedupeFeatures: marks later repeated-geometry ids as hide candidates');
}

function test_arcgisUrlHelpers() {
  const folderUrl = 'https://gis.northamptoncounty.org/arcgisweb/rest/services/Bridges?f=pjson';
  const info = getRestServiceUrlInfo(folderUrl);
  assertEqual(info.baseRoot, 'https://gis.northamptoncounty.org/arcgisweb/rest/services', 'getRestServiceUrlInfo: folder base root');
  assertDeepEqual(info.folders, ['Bridges'], 'getRestServiceUrlInfo: folder path with format query');
  assertEqual(info.serviceUrl, null, 'getRestServiceUrlInfo: folder URL is not a service');
  assertEqual(
    canonicalizeArcgisRestUrl(folderUrl),
    'https://gis.northamptoncounty.org/arcgisweb/rest/services/Bridges',
    'canonicalizeArcgisRestUrl: strips ArcGIS format query'
  );
  assertEqual(
    buildArcgisJsonUrl(info.baseRoot, info.folders.join('/')),
    'https://gis.northamptoncounty.org/arcgisweb/rest/services/Bridges?f=json',
    'buildArcgisJsonUrl: folder listing uses compact JSON'
  );
  assertEqual(
    coerceArcgisRestServicesUrl('https://gis.northamptoncounty.org/arcgisweb/rest/'),
    'https://gis.northamptoncounty.org/arcgisweb/rest/services',
    'coerceArcgisRestServicesUrl: completes rest directory'
  );
  assertEqual(
    coerceArcgisRestServicesUrl(folderUrl),
    'https://gis.northamptoncounty.org/arcgisweb/rest/services/Bridges',
    'coerceArcgisRestServicesUrl: preserves folder URL'
  );
}

function test_arcgisDescriptions() {
  assertEqual(
    htmlToPlainText('<p>Northampton&nbsp;<strong>bridges</strong> &amp; culverts</p>'),
    'Northampton bridges & culverts',
    'htmlToPlainText: strips ArcGIS HTML'
  );
  assertEqual(
    summarizePlainText('This layer inventories bridge assets. It is maintained by public works. Extra trailing detail.', 55),
    'This layer inventories bridge assets.',
    'summarizePlainText: prefers sentence boundary'
  );
  const desc = getLayerDescription(
    { id: 0, name: 'Bridges', description: '<div>Bridge inspection locations.</div>' },
    { description: 'Fallback service description.' }
  );
  assertDeepEqual(
    desc,
    { text: 'Bridge inspection locations.', source: 'layer' },
    'getLayerDescription: prefers layer description'
  );
  assertDeepEqual(
    getLayerDescription(
      { id: 0, name: 'BDREG Units', description: '' },
      { serviceDescription: 'Point locations for City of Bethlehem regulated rental units' }
    ),
    { text: 'Point locations for City of Bethlehem regulated rental units', source: 'service' },
    'getLayerDescription: falls back to service description'
  );
}

function test_whereBuilder() {
  assertEqual(
    formatWhereValue('string', "O'Brien"),
    "'O''Brien'",
    'formatWhereValue: escapes string literals'
  );
  assertEqual(
    buildWhereCondition('NAME', 'CONTAINS', 'Main', 'string'),
    "NAME LIKE '%Main%'",
    'buildWhereCondition: contains helper'
  );
  assertEqual(
    buildWhereCondition('POPULATION', '>=', 1000, 'numeric'),
    'POPULATION >= 1000',
    'buildWhereCondition: numeric comparison'
  );
  assertEqual(
    buildWhereCondition('BIG_OID', '=', '9223372036854775807', 'numeric'),
    'BIG_OID = 9223372036854775807',
    'buildWhereCondition: preserves exact unquoted bigint literal'
  );
  assertEqual(
    joinWhereCondition('1=1', "NAME = 'Main'"),
    "NAME = 'Main'",
    'joinWhereCondition: replaces default query'
  );
  assertEqual(
    joinWhereCondition('COUNTY = \'Northampton\'', 'POPULATION >= 1000'),
    "COUNTY = 'Northampton' AND POPULATION >= 1000",
    'joinWhereCondition: appends with AND'
  );
}

function test_exactArcGISIntegers() {
  assertEqual(parseArcGISFeatureId('42'), 42, 'parseArcGISFeatureId: canonical safe integer');
  assertEqual(parseArcGISFeatureId('0042'), '0042', 'parseArcGISFeatureId: noncanonical string stays a string');
  assertEqual(parseArcGISFeatureId('9007199254740992'), '9007199254740992', 'parseArcGISFeatureId: unsafe ID remains exact');
  assertEqual(safeNumericIdAlternative('9007199254740992'), undefined, 'selection filter: no rounded unsafe alternative');
  assertEqual(safeNumericIdAlternative('42'), 42, 'selection filter: safe numeric alternative');
  assertEqual(compareExactIntegers('9223372036854775807', '9007199254740992'), 1, 'table sort: exact bigint order');
  assertEqual(
    fieldHasUnsafeIntegers([{ properties: { BIG_OID: '9223372036854775807' } }], 'BIG_OID'),
    true,
    'numeric style: unsafe field detection'
  );

  const featureCollection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: '9223372036854775807',
      properties: { BIG_OID: '9223372036854775807' },
      geometry: { type: 'Point', coordinates: [0, 0] }
    }]
  };
  const json = stringifyExactJSON(featureCollection);
  assertEqual(json.includes('"BIG_OID":"9223372036854775807"'), true, 'GeoJSON export: unsafe integer is a quoted exact string');
  assertEqual(stringifyExactJSON({ value: 9223372036854775807n }), '{"value":"9223372036854775807"}', 'JSON export: native bigint cannot escape');
  assertEqual(rowsToCSV([{ BIG_OID: '9223372036854775807' }]), 'BIG_OID\n9223372036854775807', 'CSV export: exact decimal digits');
  assertEqual(featureCollectionToKml(featureCollection).includes('9223372036854775807'), true, 'KML export: exact decimal digits');
  assertEqual(
    new TextDecoder().decode(featureCollectionToKmz(featureCollection, {})).includes('9223372036854775807'),
    true,
    'KMZ export: stored KML contains exact decimal digits'
  );
}

function test_arcgisGeoJSONExperiment() {
  const queryUrl = buildArcGISRequestUrl(
    'https://example.com/arcgis/rest/services/demo/MapServer/23/query',
    {
      where: '1=1',
      outFields: '*',
      resultOffset: '2000',
      resultRecordCount: '1235'
    }
  );
  const parsed = new URL(queryUrl);
  assertEqual(parsed.searchParams.get('where'), '1=1', 'real-data experiment: WHERE parameter');
  assertEqual(parsed.searchParams.get('resultOffset'), '2000', 'real-data experiment: pagination offset');
  assertEqual(parsed.searchParams.get('resultRecordCount'), '1235', 'real-data experiment: pagination count');

  const unsafeId = '9223372036854775807';
  const normalized = normalizeArcGISGeoJSONPage({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { BIG_OID: unsafeId },
      geometry: { type: 'Point', coordinates: [0, 0] }
    }]
  }, 'BIG_OID');
  assertEqual(normalized.features[0].id, unsafeId, 'real-data experiment: exact string OID becomes Feature.id');
}


function test_esriStyle() {
  const categorical = buildColorExpression({
    kind: 'categorical',
    field: 'status',
    channel: 'color',
    fallbackColor: '#999999',
    stops: [
      { value: 'open', color: '#00ff00', enabled: true },
      { value: 'closed', color: '#ff0000', enabled: false },
      { value: null, color: '#0000ff', enabled: true }
    ]
  });
  assertDeepEqual(
    categorical,
    ['match', ['get', 'status'], 'open', '#00ff00', '#0000ff'],
    'buildColorExpression: categorical'
  );

  const groupedCategorical = buildColorExpression({
    kind: 'categorical',
    field: 'status',
    channel: 'color',
    fallbackColor: '#999999',
    stops: [
      { value: 'open', color: '#00ff00', enabled: false },
      { value: 'closed', color: '#ff0000', enabled: false },
      { value: null, color: '#0000ff', enabled: false }
    ]
  });
  assertEqual(
    groupedCategorical,
    '#0000ff',
    'buildColorExpression: all grouped categories use other color'
  );

  const numeric = buildColorExpression({
    kind: 'numeric',
    field: 'score',
    channel: 'color',
    fallbackColor: '#999999',
    stops: [
      { value: 10, color: '#aaaaaa' },
      { value: 0, color: '#111111' },
      { value: 20, color: '#ffffff' }
    ]
  });
  assertDeepEqual(
    numeric,
    ['interpolate', ['linear'], ['to-number', ['get', 'score'], 0], 0, '#111111', 10, '#aaaaaa', 20, '#ffffff'],
    'buildColorExpression: numeric'
  );

  const lineLayers = buildCustomLayers(
    'arc-source',
    'polyline',
    { line: { color: '#123456', weight: 3, lineCap: 'square' } },
    'test-style'
  );
  assertEqual(lineLayers.length, 1, 'buildCustomLayers: polyline visual layer count');
  assertEqual(lineLayers[0].id, 'test-style-line', 'buildCustomLayers: polyline layer id');
  assertEqual((lineLayers[0] as any).paint['line-color'], '#123456', 'buildCustomLayers: line color');
  assertEqual((lineLayers[0] as any).layout['line-cap'], 'square', 'buildCustomLayers: line cap');

  const labeledPointLayers = buildCustomLayers(
    'arc-source',
    'point',
    { label: { enabled: true, field: 'BRIDGE_NAME', position: 'bottom-right', color: '#111111', size: 14 } },
    'test-style'
  );
  assertEqual(labeledPointLayers.length, 2, 'buildCustomLayers: point label layer count');
  assertEqual(labeledPointLayers[1].id, 'test-style-label', 'buildCustomLayers: label layer id');
  assertEqual(labeledPointLayers[1].type, 'symbol', 'buildCustomLayers: label layer type');
  assertDeepEqual(
    (labeledPointLayers[1] as any).layout['text-field'],
    ['case', ['has', 'BRIDGE_NAME'], ['to-string', ['get', 'BRIDGE_NAME']], ''],
    'buildCustomLayers: label text expression'
  );
  assertEqual((labeledPointLayers[1] as any).layout['text-anchor'], 'top-left', 'buildCustomLayers: label anchor');
  assertDeepEqual((labeledPointLayers[1] as any).layout['text-offset'], [0.6, 0.6], 'buildCustomLayers: label offset');
  assertEqual((labeledPointLayers[1] as any).paint['text-color'], '#111111', 'buildCustomLayers: label color');

  const iconPointLayers = buildCustomLayers(
    'arc-source',
    'point',
    {
      point: {
        symbol: 'icon',
        icon: 'odl-star',
        iconSize: 32,
        fillColor: '#222222',
        fillOpacity: 0.8,
        iconAnchor: 'bottom',
        iconAllowOverlap: true,
        iconIgnorePlacement: true,
        iconRotate: 45,
        iconRotationAlignment: 'map',
        iconPitchAlignment: 'viewport'
      }
    },
    'test-style'
  );
  assertEqual(iconPointLayers.length, 1, 'buildCustomLayers: point icon layer count');
  assertEqual(iconPointLayers[0].id, 'test-style-point-icon', 'buildCustomLayers: point icon layer id');
  assertEqual(iconPointLayers[0].type, 'symbol', 'buildCustomLayers: point icon layer type');
  assertEqual((iconPointLayers[0] as any).layout['icon-image'], 'odl-star', 'buildCustomLayers: point icon image');
  assertEqual((iconPointLayers[0] as any).layout['icon-size'], 0.5, 'buildCustomLayers: point icon size');
  assertEqual((iconPointLayers[0] as any).layout['icon-anchor'], 'bottom', 'buildCustomLayers: point icon anchor');
  assertEqual((iconPointLayers[0] as any).layout['icon-allow-overlap'], true, 'buildCustomLayers: point icon allow overlap');
  assertEqual((iconPointLayers[0] as any).layout['icon-ignore-placement'], true, 'buildCustomLayers: point icon ignore placement');
  assertEqual((iconPointLayers[0] as any).layout['icon-rotate'], 45, 'buildCustomLayers: point icon rotate');
  assertEqual((iconPointLayers[0] as any).layout['icon-rotation-alignment'], 'map', 'buildCustomLayers: point icon rotation alignment');
  assertEqual((iconPointLayers[0] as any).layout['icon-pitch-alignment'], 'viewport', 'buildCustomLayers: point icon pitch alignment');
  assertEqual((iconPointLayers[0] as any).paint['icon-color'], '#222222', 'buildCustomLayers: point icon color');

  const defaultIconPointLayers = buildCustomLayers(
    'arc-source',
    'point',
    { point: { symbol: 'icon' } },
    'test-default-icon-style'
  );
  assertEqual((defaultIconPointLayers[0] as any).layout['icon-allow-overlap'], true, 'buildCustomLayers: default point icon allow overlap');
  assertEqual((defaultIconPointLayers[0] as any).paint['icon-opacity'], 1, 'buildCustomLayers: default point icon opacity');
}

function test_arcgisRendererInfo() {
  const lineSymbol = { type: 'esriSLS', color: [10, 20, 30, 255], width: 2 };
  const simple = { type: 'simple', symbol: lineSymbol };
  assertEqual(hasRenderableArcgisRenderer(simple), true, 'arcgisRenderer: simple renderer is usable');
  assertEqual(describeArcgisRenderer(simple), 'Simple', 'arcgisRenderer: describes simple renderer');
  assertEqual(pickArcgisRendererSymbol(simple), lineSymbol, 'arcgisRenderer: picks simple symbol');

  assertEqual(hasRenderableArcgisRenderer({ type: 'default' }), false, 'arcgisRenderer: ignores default renderer marker');
  assertEqual(describeArcgisRenderer({ type: 'default' }), '', 'arcgisRenderer: does not describe unsupported renderer');
  assertEqual(hasRenderableArcgisRenderer({ type: 'simple', symbol: { type: 'esriSMS' } }), false, 'arcgisRenderer: ignores empty fallback symbol');

  const classBreakSymbol = { type: 'esriSMS', color: [255, 0, 0, 255], size: 8 };
  const classBreaks = getRenderableArcgisRenderer({
    type: 'classbreaks',
    attributeField: 'score',
    classBreakInfos: [{ classMinValue: 0, classMaxValue: 10, symbol: classBreakSymbol }]
  });
  assertEqual(classBreaks?.type, 'classBreaks', 'arcgisRenderer: normalizes class breaks type');
  assertEqual(classBreaks?.field, 'score', 'arcgisRenderer: normalizes class breaks field');
  assertEqual(describeArcgisRenderer(classBreaks), 'Class breaks: score (1)', 'arcgisRenderer: describes class breaks');

  const uniqueDefault = getRenderableArcgisRenderer({
    type: 'uniquevalue',
    defaultSymbol: { type: 'esriSFS', color: [0, 0, 255, 128] }
  });
  assertEqual(uniqueDefault?.type, 'uniqueValue', 'arcgisRenderer: allows default-only unique renderer');
  assertEqual(describeArcgisRenderer(uniqueDefault), 'Unique values (default)', 'arcgisRenderer: describes default-only renderer');
}

function test_kmlStyle() {
  const lineSymbol = {
    type: 'esriSLS',
    style: 'esriSLSDashDot',
    color: [255, 0, 0, 255],
    outline: { color: [0, 0, 0, 255], width: 2 }
  };
  const lineStyleXml = symbolToKmlStyleXml(lineSymbol, 'polyline', 'line-style');
  const lineHint = buildKmlStyleHint(lineSymbol, 'polyline');
  assertEqual(
    lineStyleXml.includes('<Style id="line-style">'),
    true,
    'symbolToKmlStyleXml: line style id'
  );
  assertEqual(lineStyleXml.includes('<LineStyle>'), true, 'symbolToKmlStyleXml: line style body');
  assertDeepEqual(
    lineHint,
    { lineStyle: 'esrislsdashdot', lineDash: [8, 4, 2, 4] },
    'buildKmlStyleHint: line symbol'
  );

  const lowSymbol = { type: 'esriSMS', style: 'esriSMSCircle', color: [0, 0, 255, 255], size: 8 };
  const highSymbol = { type: 'esriSMS', style: 'esriSMSSquare', color: [255, 0, 0, 255], size: 10 };
  const classBreakSymbol = evaluateRendererSymbol(
    {
      type: 'classBreaks',
      field: 'score',
      classBreakInfos: [
        { classMinValue: 0, classMaxValue: 10, symbol: lowSymbol },
        { classMinValue: 10, classMaxValue: 20, symbol: highSymbol }
      ]
    },
    { score: 14 }
  );
  assertEqual(classBreakSymbol, highSymbol, 'evaluateRendererSymbol: class breaks hit');
  assertDeepEqual(
    buildKmlStyleHint(classBreakSymbol, 'point'),
    { markerShape: 'square', markerSize: 10 },
    'buildKmlStyleHint: point symbol'
  );

  const originalDocument = (globalThis as any).document;
  const mockContext = {
    beginPath() {},
    arc() {},
    rect() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillStyle: '',
    lineWidth: 0,
    strokeStyle: ''
  };
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext() {
      return mockContext;
    },
    toDataURL() {
      return 'data:image/png;base64,ZmFrZQ==';
    }
  };
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`Unexpected element: ${tag}`);
      return mockCanvas;
    }
  };

  try {
    const markerSymbol = {
      type: 'esriSMS',
      style: 'esriSMSDiamond',
      size: 14,
      color: [10, 20, 30, 255],
      outline: { color: [255, 255, 255, 255], width: 2 }
    };
    const dataUri = buildKmlMarkerIconDataUri(markerSymbol);
    const markerStyleXml = symbolToKmlStyleXml(markerSymbol, 'point', 'marker-style', true);

    assertEqual(
      dataUri,
      'data:image/png;base64,ZmFrZQ==',
      'buildKmlMarkerIconDataUri: generated marker icon'
    );
    assertEqual(
      markerStyleXml.includes('<Style id="marker-style">'),
      true,
      'symbolToKmlStyleXml: marker style id'
    );
    assertEqual(
      markerStyleXml.includes('<Icon><href>data:image/png;base64,ZmFrZQ==</href></Icon>'),
      true,
      'symbolToKmlStyleXml: inline icon href'
    );
  } finally {
    (globalThis as any).document = originalDocument;
  }
}

function run() {
  const start = Date.now();
  test_getFeatureId();
  test_mapMath();
  test_dedupeFeatures();
  test_arcgisUrlHelpers();
  test_arcgisDescriptions();
  test_whereBuilder();
  test_exactArcGISIntegers();
  test_arcgisGeoJSONExperiment();
  test_esriStyle();
  test_arcgisRendererInfo();
  test_kmlStyle();
  const dur = Date.now() - start;
  console.log(`OK - 11 suites passed in ${dur}ms`);
}

run();
