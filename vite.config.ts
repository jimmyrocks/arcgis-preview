import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// For GitHub Pages under repo "arcgis-preview", use base 
// "/arcgis-preview/" in production so asset URLs work when hosted
// at https://<user>.github.io/arcgis-preview/.
export default defineConfig(({ mode }) => {
  const sourceArcgisEntry =
    mode === 'production'
      ? path.resolve(__dirname, '../source-arcgis-rest/dist/index.mjs')
      : path.resolve(__dirname, '../source-arcgis-rest/src/index.ts');
  const sourceArcgisWorker = path.resolve(__dirname, '../source-arcgis-rest/dist/workers/arcgisWorker.mjs');
  const gitSha = getGitSha();

  return {
    base: mode === 'production' ? '/arcgis-preview/' : '/',
    root: '.',
    define: {
      __APP_GIT_SHA__: JSON.stringify(gitSha)
    },
    plugins:
      mode === 'production'
        ? [
            {
              name: 'source-arcgis-worker-asset',
              generateBundle() {
                const workerSource = fs
                  .readFileSync(sourceArcgisWorker, 'utf8')
                  .replace(/\n\/\/# sourceMappingURL=arcgisWorker\.mjs\.map\s*$/, '');
                this.emitFile({
                  type: 'asset',
                  fileName: 'assets/workers/arcgisWorker.mjs',
                  source: workerSource
                });
              }
            }
          ]
        : [],
    server: {
      port: 5173,
      open: true,
      fs: {
        allow: [path.resolve(__dirname, '..')]
      }
    },
    build: {
      // Emit build into docs/ so GitHub Pages can serve from /docs on main
      outDir: 'docs',
      rolldownOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('react-dom') || id.includes('node_modules/react/')) return 'react';
            if (id.includes('maplibre-gl') || id.includes('source-arcgis')) return 'maplibre';
            if (id.includes('@tanstack')) return 'tanstack';
            if (id.includes('react-toastify')) return 'toast';
          }
        }
      },
      // MapLibre is intentionally split into its own vendor chunk; the map is
      // the product, so keep warnings focused on unexpected app-code growth.
      chunkSizeWarningLimit: 2500
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@opendataland/source-arcgis': sourceArcgisEntry
      }
    }
  };
});
