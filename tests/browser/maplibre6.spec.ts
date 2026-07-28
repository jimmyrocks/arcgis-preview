import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const serviceUrl = 'https://mock.arcgis.test/arcgis/rest/services/Points/FeatureServer/0';
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

function geoJson(where: string, offset = 0, count = 1, exceededTransferLimit = false) {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_, index) => {
      const id = offset + index + 1;
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

function arcgisJson(where: string, offset = 0, count = 1, exceededTransferLimit = false) {
  return {
    objectIdFieldName: 'OBJECTID',
    geometryType: 'esriGeometryPoint',
    spatialReference: { wkid: 4326 },
    fields: layerMetadata.fields,
    features: Array.from({ length: count }, (_, index) => {
      const id = offset + index + 1;
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
} = {}) {
  const queryUrls: URL[] = [];
  let markerRequests = 0;

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
          ? geoJson(url.searchParams.get('where') || '1=1', offset, count, exceeded)
          : arcgisJson(url.searchParams.get('where') || '1=1', offset, count, exceeded);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body)
        });
      }
      return;
    }
    const body = /\/FeatureServer\/0\/?$/.test(url.pathname)
      ? layerMetadata
      : serviceMetadata;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });

  await page.route(/basemaps\.cartocdn\.com|tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 204, body: '' })
  );

  return {
    queryUrls,
    markerRequests: () => markerRequests
  };
}

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
  expect(mocked.queryUrls.some((url) => url.searchParams.get('where') === "NAME = 'Alpha'")).toBe(true);

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
  await page.route('https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.mjs', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: fs.readFileSync(path.join(maplibreRoot, 'maplibre-gl.mjs'))
    })
  );
  await page.route('https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.css', (route) =>
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
