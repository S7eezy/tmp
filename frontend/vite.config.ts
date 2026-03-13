import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@ui': resolve(__dirname, 'src/ui/index.ts'),
      '@filters': resolve(__dirname, 'src/filters'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/es': {
        target: 'http://elasticsearch:9200',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/es/, ''),
      },
      '/api/geoserver': {
        target: 'http://geoserver:8080/geoserver',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/geoserver/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          deckgl: [
            '@deck.gl/core',
            '@deck.gl/layers',
            '@deck.gl/extensions',
            '@deck.gl/mapbox',
          ],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
