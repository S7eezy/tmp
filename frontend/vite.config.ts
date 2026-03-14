import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load all .env variables (no prefix filter) so server-side proxy targets
  // can be overridden without the VITE_ prefix restriction.
  const env = loadEnv(mode, resolve(__dirname, '..'), '');

  // In Docker Compose the container environment sets these to the service names.
  // For frontend-only dev (npm run dev outside Docker) set them in .env to
  // the locally reachable addresses (e.g. http://localhost:9200).
  const esTarget = env.VITE_ES_URL ?? 'http://elasticsearch:9200';
  const geoserverTarget = env.VITE_GEOSERVER_URL ?? 'http://geoserver:8080/geoserver';

  return {
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
        target: esTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/es/, ''),
      },
      '/api/geoserver': {
        target: geoserverTarget,
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
  };
});
