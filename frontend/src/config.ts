// ---------------------------------------------------------------------------
// FleetTracker – centralised configuration
// All tunables live here so nothing is scattered across modules.
// ---------------------------------------------------------------------------

export const Config = {
  /** Elasticsearch proxy base (Vite dev proxy rewrites to the real host). */
  esBaseUrl: import.meta.env.VITE_ES_BASE_URL ?? '/api/es',

  /** GeoServer proxy base. */
  geoserverBaseUrl:
    import.meta.env.VITE_GEOSERVER_BASE_URL ?? '/api/geoserver',

  /** Default centre [lng, lat] – Atlantic, shows both Americas and Europe. */
  defaultCenter: [0, 30] as [number, number],

  /** Default zoom level. */
  defaultZoom: 3,

  /** Maximum number of features fetched per ES query. */
  esMaxHits: 10_000,

  /** Debounce (ms) before an ES query fires after a filter change. */
  filterDebounceMs: 250,

  /** How many features before we switch to binary column layout in deck.gl. */
  binaryThreshold: 5_000,

  /** deck.gl ScatterplotLayer defaults. */
  scatter: {
    radiusMinPixels: 2,
    radiusMaxPixels: 12,
    opacity: 0.8,
    pickable: true,
  },

  /** deck.gl PathLayer defaults. */
  path: {
    widthMinPixels: 1,
    widthMaxPixels: 6,
    opacity: 0.7,
    pickable: true,
  },

  /** deck.gl PolygonLayer defaults. */
  polygon: {
    filled: true,
    stroked: true,
    lineWidthMinPixels: 1,
    opacity: 0.4,
    pickable: true,
  },

  /** Map style – dark OpenFreeMap tiles (no API key). */
  mapStyle:
    import.meta.env.VITE_MAP_STYLE ??
    'https://tiles.openfreemap.org/styles/dark',
} as const;
