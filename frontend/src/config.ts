// ---------------------------------------------------------------------------
// FleetTracker – centralised configuration
// All tunables live here so nothing is scattered across modules.
// ---------------------------------------------------------------------------

export const Config = {
  /** Backend API base URL (proxied to FastAPI backend). */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api',

  /** GeoServer proxy base. */
  geoserverBaseUrl:
    (import.meta.env.VITE_GEOSERVER_BASE_URL as string | undefined) ?? '/api/geoserver',

  /** TileServer GL proxy base. */
  tileserverBaseUrl:
    (import.meta.env.VITE_TILESERVER_BASE_URL as string | undefined) ?? '/api/tiles',

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

  /** Map style name (e.g. 'leviathan'). Falls back to 'leviathan' if unset. */
  mapStyleName: (import.meta.env.VITE_MAP_STYLE as string | undefined) ?? 'leviathan',

  /**
   * Fully resolved map style URL for MapLibre.
   * Always goes through the /api/tiles proxy — never an external URL.
   */
  mapStyle: (() => {
    const name = (import.meta.env.VITE_MAP_STYLE as string | undefined) ?? 'leviathan';
    const base = ((import.meta.env.VITE_TILESERVER_BASE_URL as string | undefined) ?? '/api/tiles').replace(/\/$/, '');
    return `${base}/styles/${name}/style.json`;
  })(),
} as const;
