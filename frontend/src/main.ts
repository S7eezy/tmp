// ---------------------------------------------------------------------------
// FleetTracker – Entry point
//
// Slim boot sequence: initialises the map engine, discovers Elasticsearch
// indices (metadata only), and wires up all UI components.
// Data is loaded on-demand when the user toggles an index in the DATA panel.
// ---------------------------------------------------------------------------

import './style.css';

import { MapEngine } from '@core/map';
import { LayerRegistry, DeckLayerAdapter, WmsLayerAdapter, TileServerAdapter, preloadIcons } from '@core/layers';
import type { GeoType, TileFormat } from '@core/layers';
import { DataStore, ElasticClient, GeoServerClient, TileServerClient } from '@core/data';
import type { EsIndexInfo } from '@core/data';
import { Config } from './config';
import { FilterEngine, FilterPanel } from '@filters';
import { Toolbar, SidePanel, SettingsModal, DataConfigModal, LayerStyleModal, FeatureTooltip, DrawMode, SearchPanel, Hud, showToast } from '@ui';
import type { Feature } from 'geojson';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Delays `fn` until `ms` ms after the last call. */
function debounce<F extends (...args: Parameters<F>) => void>(fn: F, ms: number): F {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<F>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as F;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

// ---------------------------------------------------------------------------
// Palette for auto-generated layers
// ---------------------------------------------------------------------------

const PALETTE: [number, number, number, number][] = [
  [0, 180, 255, 200],   // cyan
  [255, 200, 0, 160],   // gold
  [0, 255, 100, 80],    // green
  [255, 80, 120, 180],  // rose
  [160, 100, 255, 180], // purple
  [255, 140, 0, 180],   // orange
  [0, 220, 200, 180],   // teal
  [255, 255, 100, 180], // lemon
];

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot(): Promise<void> {
  // ── 1. Core singletons ──────────────────────────────────────────────────
  const dataStore       = new DataStore();
  const rawData         = new Map<string, Feature[]>();
  /** Geo field names per index — populated lazily, reused by the filter handler. */
  const geoFieldsCache  = new Map<string, string[]>();
  const layerRegistry   = new LayerRegistry();
  const filterEngine  = new FilterEngine();
  const esClient      = new ElasticClient();

  // ── 2. Map engine + preload icons ────────────────────────────────────────
  const engine = new MapEngine({ container: 'map' });
  await Promise.all([engine.whenReady(), preloadIcons()]);
  console.log('[FleetTracker] Map ready, icons preloaded');

  // ── 3. Discover ES index METADATA only (no data loaded) ─────────────────
  let indices: EsIndexInfo[] = [];
  try {
    indices = await esClient.listIndices();
    console.log(`[FleetTracker] Discovered ${indices.length} ES indices:`, indices.map(i => i.index));
  } catch (err) {
    console.warn('[FleetTracker] Could not connect to Elasticsearch:', err);
    console.log('[FleetTracker] Running with empty data – add ES indices and reload.');
  }

  // ── 4. Detect geo fields for all indices (lightweight mapping reads) ────
  const t0 = performance.now();
  await Promise.all(indices.map(async (info) => {
    try {
      const geoFields = await esClient.detectGeoFields(info.index);
      geoFieldsCache.set(info.index, geoFields);
    } catch {
      // Skip – mapping might be inaccessible
    }
  }));
  console.log(`[FleetTracker] Detected geo fields for ${geoFieldsCache.size} indices in ${(performance.now() - t0).toFixed(1)}ms`);

  // ── 5. Discover GeoServer layers & tiles ────────────────────────────────
  const geoServerClient = new GeoServerClient();
  try {
    const { wmsLayers } = await geoServerClient.listAllLayers();
    console.log(`[FleetTracker] GeoServer: discovered ${wmsLayers.length} WMS layers`);

    for (const gsLayer of wmsLayers) {
      const id = `gs-${gsLayer.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const wms = new WmsLayerAdapter({
        id,
        label: gsLayer.title || gsLayer.name,
        wmsUrl: `${Config.geoserverBaseUrl}/wms`,
        wmsParams: { LAYERS: gsLayer.name },
        tileKind: 'raster',
        minZoom: 0,
        maxZoom: 22,
        visible: false,
        zIndex: -1,
      });
      layerRegistry.add(wms);
      wms.attach(engine);
    }
  } catch (err) {
    console.warn('[FleetTracker] Could not connect to GeoServer:', err);
    console.log('[FleetTracker] Running without GeoServer layers.');
  }

  // Fallback: keep the demo WMS layer if no GeoServer layers were discovered
  if (layerRegistry.all().filter(l => l.meta.kind === 'maplibre').length === 0) {
    const demoWms = new WmsLayerAdapter({
      id: 'osm-wms',
      label: 'OpenStreetMap WMS',
      wmsUrl: 'https://ows.terrestris.de/osm/service',
      wmsParams: { LAYERS: 'OSM-WMS' },
      tileKind: 'raster',
      minZoom: 0,
      maxZoom: 18,
      visible: false,
      zIndex: -1,
    });
    layerRegistry.add(demoWms);
    demoWms.attach(engine);
  }

  // ── 5b. Discover TileServer GL tilesets & styles ───────────────────────
  const tileServerClient = new TileServerClient();
  /** Available basemap styles from TileServer GL. */
  let mapStyles: import('./ui/SidePanel').MapStyleEntry[] = [];
  try {
    const [tilesets, styleInfos] = await Promise.all([
      tileServerClient.listTiles(),
      tileServerClient.listStyles(),
    ]);
    console.log(`[FleetTracker] TileServer: discovered ${tilesets.length} tilesets, ${styleInfos.length} styles`);

    for (const ts of tilesets) {
      const id = `ts-${ts.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const adapter = new TileServerAdapter({
        id,
        label: ts.name || ts.id,
        tiles: ts.tiles,
        format: ts.format as TileFormat,
        minZoom: ts.minzoom,
        maxZoom: ts.maxzoom,
        visible: false,
        zIndex: -2,
      });
      layerRegistry.add(adapter);
      adapter.attach(engine);
    }

    // Convert style infos → MapStyleEntry for the side panel
    mapStyles = styleInfos.map(s => ({ id: s.id, name: s.name, url: s.url }));
  } catch (err) {
    console.warn('[FleetTracker] Could not connect to TileServer:', err);
    console.log('[FleetTracker] Running without TileServer tiles.');
  }

  // ── 6. UI components ───────────────────────────────────────────────────
  const settingsModal = new SettingsModal(dataStore, rawData);
  const hud           = new Hud(engine, dataStore);
  const toolbar       = new Toolbar(filterEngine);

  // Data config modal: manages which ES indexes are enabled in the DATA panel
  const dataConfigModal = new DataConfigModal({
    esClient,
    enabledIndexes: new Set(),
    geoFieldsCache,
    onSave: (enabled) => {
      sidePanel.setEnabledIndexes(enabled);
      sidePanel.render();
    },
  });
  dataConfigModal.setIndices(indices);

  // Load saved data visibility config from ES
  dataConfigModal.loadConfig().then(enabled => {
    sidePanel.setEnabledIndexes(enabled);
    sidePanel.render();
  }).catch(() => { /* ignore – config not yet saved */ });

  // Layer style editor: manages per-layer visual configuration
  const layerStyleModal = new LayerStyleModal({
    layerRegistry,
    dataStore,
    esClient,
    onStyleChange: () => sync(),
  });
  // Load saved styles from ES on boot
  layerStyleModal.loadFromES().catch(() => { /* ignore */ });

  const sidePanel     = new SidePanel({
    layerRegistry,
    dataStore,
    onOpenSettings: (id: string) => settingsModal.open(id),
    onOpenDataConfig: () => dataConfigModal.open(),
    onOpenStyleEditor: (id: string) => layerStyleModal.open(id),
    geoFieldsCache,
    onSwitchMapStyle: (style) => {
      console.log(`[FleetTracker] Switching basemap to "${style.name}" (${style.url})`);
      engine.map.setStyle(style.url);
      // After style loads, re-attach all MapLibre-managed layers (WMS + tileserver)
      engine.map.once('style.load', () => {
        for (const layer of layerRegistry.all()) {
          if (layer.meta.kind === 'maplibre' || layer.meta.kind === 'tileserver') {
            (layer as WmsLayerAdapter | TileServerAdapter).attach(engine);
          }
        }
      });
    },
    onToggleData: (indexId, loadRequested) => {
      if (loadRequested) loadIndex(indexId);
      else unloadIndex(indexId);
    },
  });
  // Feed index metadata for doc counts on unloaded rows
  sidePanel.setIndexMetadata(indices);
  // Feed discovered TileServer styles into the side panel
  if (mapStyles.length > 0) {
    sidePanel.setMapStyles(mapStyles, Config.mapStyleName ?? null);
  }
  const featureTooltip = new FeatureTooltip(engine, dataStore, settingsModal);
  const drawMode       = new DrawMode(engine, () => filterPanel);
  const searchPanel    = new SearchPanel(engine, dataStore, featureTooltip);

  // ── 7. Sync registry → engine + panels ─────────────────────────────────
  const sync = (): void => {
    try {
      engine.setDeckLayers(layerRegistry.buildDeckLayers());
    } catch (err) {
      console.error('[FleetTracker] Error building deck layers:', err);
    }
    hud.updateFeatureCount();
    sidePanel.render();
  };
  layerRegistry.addEventListener('change', sync);

  dataStore.addEventListener('data-change', ((e: Event) => {
    const { sourceId } = (e as CustomEvent<{ sourceId: string; featureCount: number }>).detail;
    const layer = layerRegistry.get<DeckLayerAdapter>(sourceId);
    if (layer) layer.setData(dataStore.get(sourceId));
    hud.updateFeatureCount();
    sidePanel.render();
    engine.setDeckLayers(layerRegistry.buildDeckLayers());
  }) as EventListener);

  // ── 8. Initial render ──────────────────────────────────────────────────
  sync();

  // ── 9. Wire up all UI ─────────────────────────────────────────────────
  toolbar.setup();
  toolbar.setupNotches();
  toolbar.setupSectionToggles();
  toolbar.setupMapClickClose();
  hud.setupCoords();
  hud.setupCursorTooltip();
  drawMode.setupEvents();
  featureTooltip.setup();
  searchPanel.setup();

  // ── 10. Filter panel ───────────────────────────────────────────────────
  var filterPanel = new FilterPanel({
    bodyEl: document.getElementById('fp-body')!,
    engine: filterEngine,
    getIndexes: () => dataStore.allSourceIds(),
    getFeatures: (id) => rawData.get(id) ?? [],
    onStartDrawPolygon: () => drawMode.start('polygon'),
    onStartDrawBbox:    () => drawMode.start('bbox'),
    mapEngine: engine,
  });
  filterPanel.render();

  // ── 11. React to filter changes → query ES ─────────────────────────────
  //
  // Debounced so rapid toggles only fire one ES round-trip.
  // AbortController cancels any in-flight requests from the previous event.
  let _filterAbort: AbortController | null = null;

  const applyFilters = debounce(async () => {
    // Cancel previous in-flight batch
    _filterAbort?.abort();
    _filterAbort = new AbortController();
    const { signal } = _filterAbort;

    for (const [sourceId, originalFeatures] of rawData) {
      if (signal.aborted) break;

      const activeFilters = filterEngine.getFiltersForIndex(sourceId);

      if (activeFilters.length === 0) {
        // No filters → restore original data
        dataStore.set(sourceId, originalFeatures);
      } else {
        // Has filters → try ES query, fall back to client-side
        try {
          // Use cached mapping from boot; fall back to live fetch only for
          // indices that appeared after startup (edge case).
          const geoFields = geoFieldsCache.get(sourceId)
            ?? await esClient.detectGeoFields(sourceId, signal);
          if (signal.aborted) break;

          const geoField = geoFields.length > 0 ? geoFields[0] : 'location';
          const query = filterEngine.buildQuery(sourceId);

          const filtered = await esClient.searchAsGeoJSON({
            index: sourceId,
            query,
            geoField,
            signal,
          });
          if (!signal.aborted) dataStore.set(sourceId, filtered);
        } catch (err) {
          if ((err as Error).name === 'AbortError') break;
          // Fallback to client-side filtering
          const pred = filterEngine.buildClientPredicate(sourceId);
          dataStore.set(sourceId, originalFeatures.filter(pred));
        }
      }
    }

    if (!signal.aborted) filterPanel.render();
  }, Config.filterDebounceMs);

  filterEngine.addEventListener('change', applyFilters);

  // ── 12. Views & saved-filters persistence (Elasticsearch) ──────────────
  filterEngine.setEsBaseUrl(Config.esBaseUrl);
  filterEngine.addEventListener('views-change', () => {
    filterPanel.render();
  });

  // Load saved views + saved filters from ES on boot
  filterEngine.loadFromES().then(() => {
    filterPanel.render();
  }).catch(() => { /* config not yet saved */ });

  // ── 13. On-demand data loading / unloading ─────────────────────────────

  /** Load data for a single ES index on demand. */
  async function loadIndex(indexId: string): Promise<void> {
    sidePanel.setLoading(indexId, true);
    sidePanel.render();

    try {
      // Pre-flight count check (with active filters if any)
      const activeFilters = filterEngine.getFiltersForIndex(indexId);
      const query = activeFilters.length > 0
        ? filterEngine.buildQuery(indexId)
        : undefined;
      const count = await esClient.count(indexId, query);

      if (count > 10_000) {
        showToast(
          `"${indexId}" has ${fmtCount(count)} docs — please add filters to reduce the dataset before loading.`,
          'warning',
          5000,
        );
        sidePanel.setLoading(indexId, false);
        sidePanel.render();
        return;
      }

      // Detect geo fields (use cache if available)
      const geoFields = geoFieldsCache.get(indexId)
        ?? await esClient.detectGeoFields(indexId);
      geoFieldsCache.set(indexId, geoFields);

      if (geoFields.length === 0) {
        // No geo field — load sample for data panel / filters only
        console.log(`[FleetTracker] Index "${indexId}" has no geo fields – loading sample only.`);
        const resp = await esClient.search({ index: indexId, query, size: 100 });
        const features: Feature[] = resp.hits.hits.map(hit => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [0, 0] },
          properties: { _id: hit._id, ...hit._source },
        }));
        rawData.set(indexId, features);
        dataStore.set(indexId, features);
      } else {
        const geoField = geoFields[0];
        const geoType = await esClient.detectGeoType(indexId, geoField) ?? 'point';

        const features = await esClient.searchAsGeoJSON({
          index: indexId,
          geoField,
          query,
        });
        console.log(`[FleetTracker] Loaded "${indexId}": ${features.length} features (${geoType}, field: ${geoField})`);

        rawData.set(indexId, features);
        dataStore.set(indexId, features);

        // Create deck.gl layer
        const colorIdx = indices.findIndex(i => i.index === indexId);
        const color = PALETTE[(colorIdx >= 0 ? colorIdx : 0) % PALETTE.length];
        const zIndex = geoType === 'point' ? 10 : geoType === 'line' ? 5 : 1;
        const layer = new DeckLayerAdapter({
          id: indexId,
          label: indexId,
          geoType: geoType as GeoType,
          data: features,
          color,
          esIndex: indexId,
          zIndex,
        });
        layerRegistry.add(layer);

        // Apply saved layer style if available
        layerStyleModal.applyStyleFor(indexId);
      }
    } catch (err) {
      console.error(`[FleetTracker] Failed to load "${indexId}":`, err);
      showToast(`Failed to load "${indexId}"`, 'error');
    } finally {
      sidePanel.setLoading(indexId, false);
      sidePanel.render();
    }
  }

  /** Completely unload data and layer for an index. */
  function unloadIndex(indexId: string): void {
    rawData.delete(indexId);
    dataStore.remove(indexId);      // emits data-change with count 0
    layerRegistry.remove(indexId);  // calls dispose() + emits change
    sidePanel.render();
    console.log(`[FleetTracker] Unloaded "${indexId}"`);
  }

  // ── 14. Expose globals for debugging ───────────────────────────────────
  Object.assign(window, { ft: { engine, layerRegistry, dataStore, filterEngine, esClient } });

  console.log('[FleetTracker] Boot complete');
}

boot().catch(console.error);
