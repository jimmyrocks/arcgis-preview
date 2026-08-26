import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const serviceUrl = 'https://mock.arcgis.test/arcgis/rest/services/Points/FeatureServer/0';
const mapServiceUrl = 'https://mock.arcgis.test/arcgis/rest/services/Points/MapServer/0';
const markerPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==',
  'base64'
);

const serviceMetadata = {
  currentVersion: 11.3,
  serviceDescription: 'Mock point service',
  mapName: 'Points',
  layers: [{ id: 0, name: 'Mock points' }],
  fullExtent: { xmin: -2, ymin: -2, xmax: 2, ymax: 2, spatialReference: { wkid: 4326 } }
};

const layerMetadata = {
  currentVersion: 11.3,
  id: 0,
  name: 'Mock points',
  type: 'Feature Layer',
  capabilities: 'Query',
  geometryType: 'esriGeometryPoint',
  objectIdField: 'OBJECTID',
  maxRecordCount: 2000,
  supportedQueryFormats: 'JSON, geoJSON, PBF',
  advancedQueryCapabilities: {
    supportsPagination: true,
    supportsOrderBy: true
  },
  extent: { xmin: -2, ymin: -2, xmax: 2, ymax: 2, spatialReference: { wkid: 4326 } },
  fields: [
    { name: 'OBJECTID', alias: 'OBJECTID', type: 'esriFieldTypeOID' },
    { name: 'NAME', alias: 'Name', type: 'esriFieldTypeString' }
  ],
  drawingInfo: {
    renderer: {
      type: 'simple',
      symbol: {
        type: 'esriPMS',
        url: 'https://mock.arcgis.test/marker.png',
        width: 16,
        height: 16
      }
    }
  }
};

function geoJson(where: string, offset = 0, count = 1, exceededTransferLimit = false, exactId?: string) {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_, index) => {
      const id = exactId ?? offset + index + 1;
      return {
        type: 'Feature',
        id,
        properties: { OBJECTID: id, NAME: where.includes('Beta') ? 'Beta' : 'Alpha' },
        geometry: { type: 'Point', coordinates: [index * 0.001, 0] }
      };
    }),
    exceededTransferLimit
  };
}

function arcgisJson(where: string, offset = 0, count = 1, exceededTransferLimit = false, exactId?: string) {
  return {
    objectIdFieldName: 'OBJECTID',
    geometryType: 'esriGeometryPoint',
    spatialReference: { wkid: 4326 },
    fields: layerMetadata.fields,
    features: Array.from({ length: count }, (_, index) => {
      const id = exactId ?? offset + index + 1;
      return {
        attributes: { OBJECTID: id, NAME: where.includes('Beta') ? 'Beta' : 'Alpha' },
        geometry: { x: index * 0.001, y: 0, spatialReference: { wkid: 4326 } }
      };
    }),
    exceededTransferLimit
  };
}

async function mockArcGIS(page: Page, options: {
  markerDelayMs?: number;
  paginatedTotal?: number;
  laterPageDelayMs?: number;
  exactId?: string;
  simpleRenderer?: boolean;
  exportStatus?: number;
  exportDelayMs?: number;
} = {}) {
  const queryUrls: URL[] = [];
  const exportUrls: URL[] = [];
  const basemapStyleRequests: string[] = [];
  let markerRequests = 0;

  await page.route('https://tiles.openfreemap.org/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/styles/')) {
      basemapStyleRequests.push(url.pathname);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 8,
          sources: {
            openmaptiles: {
              type: 'vector',
              tiles: ['https://tiles.openfreemap.org/mock/{z}/{x}/{y}.pbf']
            }
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#f2f3f0' } },
            {
              id: 'landcover',
              type: 'fill',
              source: 'openmaptiles',
              'source-layer': 'landcover',
              paint: { 'fill-color': '#e6e7e2' }
            }
          ]
        })
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('https://mock.arcgis.test/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/marker.png')) {
      markerRequests += 1;
      if (options.markerDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.markerDelayMs));
      }
      await route.fulfill({ status: 200, contentType: 'image/png', body: markerPng });
      return;
    }
    if (url.pathname.endsWith('/MapServer/legend')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          layers: [{
            layerId: 0,
            layerName: 'Mock points',
            legend: [{
              label: 'Published point',
              contentType: 'image/png',
              imageData: markerPng.toString('base64'),
              width: 1,
              height: 1
            }]
          }]
        })
      });
      return;
    }
    if (url.pathname.endsWith('/MapServer/export')) {
      exportUrls.push(url);
      if (options.exportDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.exportDelayMs));
      }
      if (options.exportStatus) {
        await route.fulfill({
          status: options.exportStatus,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: options.exportStatus, message: 'Mock export failure' } })
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'image/png', body: markerPng });
      }
      return;
    }
    if (url.pathname.endsWith('/query')) {
      queryUrls.push(url);
      if (url.searchParams.get('returnCountOnly') === 'true') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ count: options.paginatedTotal ?? 1 })
        });
        return;
      }
      const format = url.searchParams.get('f');
      if (format === 'pbf') {
        // Exercise the ArcGIS module worker and its public JSON fallback.
        await route.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          body: Buffer.from('not-a-valid-pbf')
        });
      } else {
        const offset = Number(url.searchParams.get('resultOffset') || 0);
        const requested = Number(url.searchParams.get('resultRecordCount') || 1);
        const remaining = Math.max(0, (options.paginatedTotal ?? 1) - offset);
        const count = Math.min(requested, remaining);
        const exceeded = offset + count < (options.paginatedTotal ?? 1);
        if (offset > 0 && options.laterPageDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.laterPageDelayMs));
        }
        const body = format === 'geojson'
          ? geoJson(url.searchParams.get('where') || '1=1', offset, count, exceeded, options.exactId)
          : arcgisJson(url.searchParams.get('where') || '1=1', offset, count, exceeded, options.exactId);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body)
        });
      }
      return;
    }
    const body = /\/(?:FeatureServer|MapServer)\/0\/?$/.test(url.pathname)
      ? (options.simpleRenderer
          ? {
              ...layerMetadata,
              drawingInfo: {
                renderer: {
                  type: 'simple',
                  symbol: {
                    type: 'esriSMS',
                    style: 'esriSMSCircle',
                    color: [37, 99, 235, 255],
                    size: 10
                  }
                }
              }
            }
          : layerMetadata)
      : serviceMetadata;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });

  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 204, body: '' })
  );

  return {
    queryUrls,
    exportUrls,
    basemapStyleRequests,
    markerRequests: () => markerRequests
  };
}

test('uses OpenFreeMap styles and upgrades legacy basemap links', async ({ page }) => {
  const mocked = await mockArcGIS(page, { simpleRenderer: true });
  await page.goto(
    `/arcgis-preview/?url=${encodeURIComponent(serviceUrl)}&center=0,0&z=5&basemap=carto_dark`
  );

  await expect(page.getByRole('button', { name: 'Dark (OpenFreeMap)' })).toBeVisible();
  await expect.poll(() => mocked.basemapStyleRequests.includes('/styles/dark')).toBe(true);
  await expect.poll(() => new URL(page.url()).searchParams.get('basemap')).toBe('openfreemap_dark');

  await page.getByRole('button', { name: 'Dark (OpenFreeMap)' }).click();
  await page.getByRole('menuitemradio', { name: 'Liberty (OpenFreeMap)' }).click();
  await expect.poll(() => mocked.basemapStyleRequests.includes('/styles/liberty')).toBe(true);
  await expect.poll(() => new URL(page.url()).searchParams.get('basemap')).toBe('openfreemap_liberty');
});

test('switches a queryable MapServer layer between interactive and published rendering', async ({ page }) => {
  const mocked = await mockArcGIS(page, { simpleRenderer: true });
  const where = "NAME = 'Alpha'";
  await page.goto(
    `/arcgis-preview/?url=${encodeURIComponent(mapServiceUrl)}&center=0,0&z=5&where=${encodeURIComponent(where)}`
  );

  const interactive = page.getByRole('radio', { name: /Interactive features/ });
  const published = page.getByRole('radio', { name: /Published map/ });
  await expect(interactive).toBeVisible();
  await expect(interactive).toBeChecked();

  await published.check();
  await expect(published).toBeChecked();
  await expect.poll(() => new URL(page.url()).searchParams.get('render')).toBe('published');
  await expect.poll(() => mocked.exportUrls.length).toBeGreaterThan(0);

  const exportUrl = mocked.exportUrls.at(-1)!;
  expect(exportUrl.searchParams.get('layers')).toBe('show:0');
  expect(JSON.parse(exportUrl.searchParams.get('layerDefs') || '{}')).toEqual({ 0: where });
  await expect(page.getByText('Published point')).toBeVisible();

  await page.getByRole('tab', { name: 'Data' }).click();
  await expect(page.getByRole('heading', { name: 'Data works with interactive features' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to Interactive features' }).click();
  await page.getByRole('tab', { name: 'Layer' }).click();
  await expect(interactive).toBeChecked();
  await expect.poll(() => new URL(page.url()).searchParams.has('render')).toBe(false);
  await expect(page.getByRole('tab', { name: 'Data' })).toBeEnabled();
});

test('published map failures explain the problem and offer recovery', async ({ page }) => {
  await mockArcGIS(page, { simpleRenderer: true, exportStatus: 403 });
  await page.goto(`/arcgis-preview/?url=${encodeURIComponent(mapServiceUrl)}&center=0,0&z=5`);
  await page.getByRole('radio', { name: /Published map/ }).check();

  const alert = page.getByRole('alert').filter({ hasText: 'This map requires access' });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(alert.getByRole('link', { name: 'Open service' })).toHaveAttribute('target', '_blank');

  await alert.getByRole('button', { name: 'Use Interactive features' }).click();
  await expect(alert).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.has('render')).toBe(false);
});

test('published-map UX remains keyboard-friendly, responsive, and reduced-motion safe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockArcGIS(page, { simpleRenderer: true, exportDelayMs: 450 });
  await page.goto(`/arcgis-preview/?url=${encodeURIComponent(mapServiceUrl)}&center=0,0&z=5`);

  await page.getByRole('button', { name: 'Open sidebar' }).click();
  const layerTab = page.getByRole('tab', { name: 'Layer' });
  await layerTab.focus();
  await layerTab.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');

  await layerTab.click();
  await page.getByRole('radio', { name: /Published map/ }).check();
  const transition = page.getByRole('status').filter({ hasText: 'Loading published map' });
  await expect(transition).toBeVisible();
  await expect(transition).toHaveCSS('animation-name', 'none');

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const legend = page.getByLabel('Published map legend');
  await expect(legend).toBeVisible();
  const box = await legend.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('loads, selects, and round-trips an unsafe object ID exactly', async ({ page }) => {
  const exactId = '9223372036854775807';
  await mockArcGIS(page, { exactId, simpleRenderer: true });
  await page.goto(`/arcgis-preview/?url=${encodeURIComponent(serviceUrl)}&center=0,0&z=5`);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.getByRole('tab', { name: 'Data' }).click();
  await page.getByText(exactId, { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('id')).toBe(exactId);
});

test('main app experimental tiles toggle renders selectable exact-ID features', async ({ page }) => {
  const exactId = '9223372036854775807';
  await mockArcGIS(page, { exactId, simpleRenderer: true });
  await page.goto(
    `/arcgis-preview/?url=${encodeURIComponent(serviceUrl)}&center=0,0&z=5`
  );

  const toggle = page.getByRole('checkbox', { name: 'Experimental tiles' });
  await page.getByText('Advanced rendering', { exact: true }).click();
  await expect(toggle).not.toBeChecked();
  const canvas = page.locator('.maplibregl-canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('tab', { name: 'Data' }).click();
  await expect(page.getByText(exactId, { exact: true })).toBeVisible();

  // Switch only after the one-record layer is fully cached. A fresh
  // controller must not inherit the replaced controller's completion pause.
  await page.getByRole('tab', { name: 'Layer' }).click();
  await toggle.check();
  await expect.poll(() => new URL(page.url()).searchParams.get('experimentalTiles')).toBe('1');
  await expect.poll(() => page.evaluate(() => (window as any).__arcgisExperimentalTiles?.sourceFeatures ?? 0))
    .toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__arcgisExperimentalTiles?.renderedFeatures ?? 0))
    .toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Map canvas has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => new URL(page.url()).searchParams.get('id')).toBe(exactId);
  await page.keyboard.press('Escape');

  await toggle.uncheck();
  await expect.poll(() => new URL(page.url()).searchParams.has('experimentalTiles')).toBe(false);
  await expect(page.getByText(/Rendered 1 \/ 1 features/)).toBeVisible();
  await toggle.check();
  await expect.poll(() => new URL(page.url()).searchParams.get('experimentalTiles')).toBe('1');
  await expect.poll(() => page.evaluate(() => (window as any).__arcgisExperimentalTiles?.sourceFeatures ?? 0))
    .toBeGreaterThan(0);
  await expect(page.getByText(/Rendered 1 \/ 1 features.* in [\d,]+ ms/)).toBeVisible();
});

test('compares GeoJSON and local MVT sources with exact promoted IDs', async ({ page }, testInfo) => {
  const exactId = '9223372036854775807';
  const mocked = await mockArcGIS(page, { paginatedTotal: 2500, exactId });
  await page.goto(
    `/arcgis-preview/?experiment=geojson-vs-tiles&service=${encodeURIComponent(serviceUrl)}&limit=2500`
  );
  await expect(page.getByTestId('geojson-map').locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByTestId('vector-map').locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByTestId('source-mode-metrics')).toBeVisible();

  await expect.poll(() => page.evaluate(() => (window as any).__sourceModeExperiment?.featureCount ?? 0)).toBe(2500);
  await expect.poll(() => mocked.queryUrls.some((url) => url.searchParams.get('resultOffset') === '2000')).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__sourceModeExperiment?.vectorRequests ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__sourceModeExperiment?.vectorGeneratedBytes ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__sourceModeExperiment?.geojsonRendered ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__sourceModeExperiment?.vectorRendered ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).__sourceModeExperiment?.promotedSampleId ?? null))
    .toBe(exactId);

  const before = await page.evaluate(() => (window as any).__sourceModeExperiment?.vectorRequests ?? 0);
  await page.getByTestId('vector-map').getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__sourceModeExperiment?.vectorRequests ?? 0)).toBeGreaterThan(before);
  const metrics = await page.evaluate(() => (window as any).__sourceModeExperiment);
  console.log('SOURCE_MODE_METRICS', JSON.stringify(metrics));
  await testInfo.attach('source-mode-metrics.json', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
});

test('built preview loads both workers and preserves controller interactions', async ({ page }) => {
  const mocked = await mockArcGIS(page);
  const workerAssets = new Set<string>();
  page.on('response', (response) => {
    if (/maplibre-gl-worker|arcgisWorker/.test(response.url()) && response.ok()) {
      workerAssets.add(response.url());
    }
  });

  await page.goto(
    `/arcgis-preview/?url=${encodeURIComponent(serviceUrl)}&center=0,0&z=5&where=${encodeURIComponent("NAME = 'Alpha'")}`
  );
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(() => mocked.queryUrls.some((url) => url.searchParams.get('f') !== 'pbf')).toBe(true);
  await expect.poll(() => [...workerAssets].some((url) => url.includes('maplibre-gl-worker'))).toBe(true);
  await expect.poll(() => [...workerAssets].some((url) => url.includes('arcgisWorker'))).toBe(true);
  await expect.poll(mocked.markerRequests).toBeGreaterThan(0);
  await expect.poll(() =>
    mocked.queryUrls.some((url) => url.searchParams.get('where') === "NAME = 'Alpha'")
  ).toBe(true);

  const canvas = page.locator('.maplibregl-canvas');
  await expect(page.locator('.fetch-ctrl-count')).toBeVisible();
  await page.getByRole('tab', { name: 'Style' }).click();
  const customStyle = page.getByRole('radio', { name: 'Custom style' });
  const serverStyle = page.getByRole('radio', { name: 'Server style' });
  await customStyle.click();
  await serverStyle.click();
  await customStyle.click();
  await expect(customStyle).toBeChecked();

  await page.getByRole('tab', { name: 'Data' }).click();
  await page.getByText('Alpha', { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('id')).toBe('1');

  const fetchHeader = page.locator('.fetch-ctrl-header');
  await fetchHeader.click();
  const syncSwitch = page.getByRole('switch');
  await expect(syncSwitch).toHaveAttribute('aria-checked', 'true');
  await syncSwitch.click();
  await expect(syncSwitch).toHaveAttribute('aria-checked', 'false');

  const clearButton = page.getByRole('button', { name: 'Clear', exact: true });
  await expect(clearButton).toBeEnabled();
  await clearButton.click();
  await expect(page.locator('.fetch-ctrl-count')).toHaveCount(0);

  const countBeforeFetch = mocked.queryUrls.length;
  const fetchButton = page.getByRole('button', { name: 'Fetch', exact: true });
  await expect(fetchButton).toBeEnabled();
  await fetchButton.click();
  await expect.poll(() => mocked.queryUrls.length).toBeGreaterThan(countBeforeFetch);
  await syncSwitch.click();
  await expect(syncSwitch).toHaveAttribute('aria-checked', 'true');

  const countBeforeZoom = mocked.queryUrls.length;
  await canvas.hover();
  await page.mouse.wheel(0, -600);
  await expect.poll(() => mocked.queryUrls.length).toBeGreaterThan(countBeforeZoom);

  await page.getByRole('button', { name: /^Filter:/ }).click();
  const editor = page.getByRole('textbox', { name: 'Filter features' });
  await editor.fill("NAME = 'Beta'");
  await page.keyboard.press('Control+Enter');
  await expect.poll(() =>
    mocked.queryUrls.some((url) =>
      url.searchParams.get('where') === "NAME = 'Beta'" && url.searchParams.get('f') !== 'pbf'
    )
  ).toBe(true);
});

test('WebGL2 failure is accessible and leaves the surrounding UI usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    const withoutWebGL2 = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null;
      return original.call(this, type as never, ...(args as []));
    };
    HTMLCanvasElement.prototype.getContext =
      withoutWebGL2 as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/arcgis-preview/');
  await expect(page.getByRole('alert').filter({ hasText: 'Map unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open header menu' })).toBeEnabled();
});

test('a stalled renderer image cannot pin the layer in Rendering state', async ({ page }) => {
  await mockArcGIS(page, { markerDelayMs: 15_000 });
  await page.goto(
    `/arcgis-preview/?url=${encodeURIComponent(serviceUrl)}&center=0,0&z=5`
  );

  await expect(page.locator('.fetch-ctrl-count')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Rendered 1/ }).first()).toBeVisible();
});

test('large paginated layers publish a first batch before pagination completes', async ({ page }) => {
  const mocked = await mockArcGIS(page, {
    paginatedTotal: 1024,
    laterPageDelayMs: 5_000
  });
  await page.goto(
    `/arcgis-preview/?url=${encodeURIComponent(serviceUrl)}&center=0,0&z=5&where=${encodeURIComponent("NAME = 'Alpha'")}`
  );

  await expect.poll(() =>
    mocked.queryUrls.some((url) =>
      url.searchParams.get('resultRecordCount') === '512' &&
      url.searchParams.get('resultOffset') === '512'
    )
  ).toBe(true);
  await expect(page.locator('.fetch-ctrl-count')).toHaveText('512');
});

test('representative standalone ESM demo initializes on MapLibre 6', async ({ page }) => {
  const maplibreRoot = path.resolve(process.cwd(), 'node_modules/maplibre-gl/dist');
  await page.route('https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.mjs', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: fs.readFileSync(path.join(maplibreRoot, 'maplibre-gl.mjs'))
    })
  );
  await page.route('https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl-shared.mjs', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: fs.readFileSync(path.join(maplibreRoot, 'maplibre-gl-shared.mjs'))
    })
  );
  await page.route('https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.css', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: fs.readFileSync(path.join(maplibreRoot, 'maplibre-gl.css'))
    })
  );
  await page.route('https://demotiles.maplibre.org/style.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 8, sources: {}, layers: [] })
    })
  );
  await page.route('https://sampleserver6.arcgisonline.com/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/query')
      ? geoJson('1=1')
      : layerMetadata;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });

  await page.goto('http://127.0.0.1:6173/public/minimal.html');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('#map')).not.toContainText('plugin missing');
});
