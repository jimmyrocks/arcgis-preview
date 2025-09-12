import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true
  },
  build: {
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
});
