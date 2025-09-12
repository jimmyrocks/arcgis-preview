import { defineConfig } from 'vite';
import path from 'path';

// For GitHub Pages under repo "arcgis-preview", use base 
// "/arcgis-preview/" in production so asset URLs work when hosted
// at https://<user>.github.io/arcgis-preview/.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/arcgis-preview/' : '/',
  root: '.',
  server: {
    port: 5173,
    open: true
  },
  build: {
    // Emit build into docs/ so GitHub Pages can serve from /docs on main
    outDir: 'docs',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          leaflet: ['leaflet'],
          esri: ['esri-leaflet', 'esri-leaflet-renderers'],
          tanstack: ['@tanstack/react-table'],
          toast: ['react-toastify']
        }
      }
    },
    chunkSizeWarningLimit: 900
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
}));
