/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ES_BASE_URL?: string;
  readonly VITE_GEOSERVER_BASE_URL?: string;
  readonly VITE_MAP_STYLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
