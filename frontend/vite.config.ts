import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load all .env variables (no prefix filter) so we can read the runtime
  // service URLs (BACKEND_URL, GEOSERVER_URL, TILESERVER_URL) for dev proxy.
  // These are NOT the VITE_ build-time vars (which are relative paths).
  const env = loadEnv(mode, resolve(__dirname, '..'), '');

  // Dev proxy targets — actual service URLs for local development.
  // Override via BACKEND_URL / GEOSERVER_URL / TILESERVER_URL in root .env.
  const backendTarget    = env.BACKEND_URL    || 'http://localhost:8000';
  const geoserverTarget  = env.GEOSERVER_URL  || 'http://localhost:8080';
  const tileserverTarget = env.TILESERVER_URL || 'http://localhost:8081';

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
      // Longer prefixes first so they match before the /api catch-all
      '/api/geoserver': {
        target: geoserverTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/geoserver/, '/geoserver'),
      },
      '/api/tiles': {
        target: tileserverTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tiles/, ''),
      },
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
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
