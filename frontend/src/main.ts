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
import { DataStore, ApiClient, GeoServerClient, TileServerClient } from '@core/data';
import type { EsIndexInfo } from '@core/data';
import { Config } from './config';
import { FilterEngine, FilterPanel } from '@filters';
import { Toolbar, SidePanel, SettingsModal, DataConfigModal, LayerStyleModal, FeatureTooltip, DrawMode, SearchPanel, Hud, showToast, TimeModal, ViewsModal } from '@ui';
import type { Feature, FeatureCollection } from 'geojson';
import type { GeoFilter } from '@filters';

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
  const apiClient     = new ApiClient();

  // ── 2. Map engine + preload icons ────────────────────────────────────────
  const engine = new MapEngine({ container: 'map' });
  await Promise.all([engine.whenReady(), preloadIcons()]);
  console.log('[FleetTracker] Map ready, icons preloaded');

  // ── 3. Discover ES index METADATA only (no data loaded) ─────────────────
  let indices: EsIndexInfo[] = [];
  try {
    indices = await apiClient.listIndices();
    console.log(`[FleetTracker] Discovered ${indices.length} ES indices:`, indices.map(i => i.index));
  } catch (err) {
    console.warn('[FleetTracker] Could not connect to Elasticsearch:', err);
    console.log('[FleetTracker] Running with empty data – add ES indices and reload.');
  }

  // ── 4. Detect geo fields for all indices (lightweight mapping reads) ────
  const t0 = performance.now();
  await Promise.all(indices.map(async (info) => {
    try {
      const geoFields = await apiClient.detectGeoFields(info.index);
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

  // No external demo WMS fallback — air-gapped deployments must not call
  // outside URLs. If GeoServer is unreachable, the Layers section stays empty.

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
  const settingsModal = new SettingsModal(dataStore, rawData, {
    onTimestampFieldChange: (sourceId, field) => {
      filterEngine.setTimestampField(sourceId, field);
    },
    apiClient,
  });
  // Load saved index settings (timestamp field, attribute config) from backend
  settingsModal.loadConfigs().catch(() => { /* ignore – config not yet saved */ });

  const hud           = new Hud(engine, dataStore);
  const toolbar       = new Toolbar(filterEngine);

  // Data config modal: manages which ES indexes are enabled in the DATA panel
  const dataConfigModal = new DataConfigModal({
    apiClient,
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
    apiClient,
    onStyleChange: () => sync(),
  });
  // Load saved styles from backend on boot
  layerStyleModal.loadFromBackend().catch(() => { /* ignore */ });

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

  // ── 9b. Time modal (toolbar) ────────────────────────────────────────────
  const timeModal = new TimeModal({
    filterEngine,
    onApply: () => { /* filters change event handles re-render */ },
  });
  timeModal.setup();
  // Apply default time filter: last 30 minutes (immediately active from boot)
  timeModal.applyDefault();

  // ── 9c. Views modal (toolbar) ────────────────────────────────────────────
  const viewsModal = new ViewsModal({
    filterEngine,
    getViewExtraState: () => ({
      enabledIndexes: [...sidePanel.enabledIndexes],
      loadedIndexes: [...rawData.keys()],
      layerVisibility: Object.fromEntries(
        layerRegistry.all().map(l => [l.meta.id, l.meta.visible !== false]),
      ),
      activeMapStyle: sidePanel.activeStyleId ?? null,
    }),
  });
  viewsModal.setup();
  document.getElementById('tb-views')?.addEventListener('click', () => viewsModal.open());

  // ── 10. Filter panel ───────────────────────────────────────────────────
  var filterPanel = new FilterPanel({
    bodyEl: document.getElementById('fp-body')!,
    engine: filterEngine,
    getIndexes: () => dataStore.allSourceIds(),
    getFeatures: (id) => rawData.get(id) ?? [],
    onStartDrawPolygon: () => drawMode.start('polygon'),
    onStartDrawBbox:    () => drawMode.start('bbox'),
    mapEngine: engine,
    getEnabledIndexes: () => [...sidePanel.enabledIndexes],
    apiClient,
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

    // ── Re-filter loaded indexes ──────────────────────────────────────────
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
            ?? await apiClient.detectGeoFields(sourceId, signal);
          if (signal.aborted) break;

          const geoField = geoFields.length > 0 ? geoFields[0] : 'location';
          const query = filterEngine.buildQuery(sourceId);

          const filtered = await apiClient.searchAsGeoJSON({
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

    // ── Update filtered counts for enabled-but-NOT-loaded indexes ─────────
    // This lets the user see how many docs match *before* loading, so they
    // can tell when filters bring the count below 10k.
    const hasAnyFilter = filterEngine.activeCount() > 0;
    if (!hasAnyFilter) {
      sidePanel.clearFilteredCounts();
    } else {
      for (const indexId of sidePanel.enabledIndexes) {
        if (signal.aborted) break;
        if (rawData.has(indexId)) continue; // already loaded — handled above
        const activeFilters = filterEngine.getFiltersForIndex(indexId);
        if (activeFilters.length === 0) {
          sidePanel.setFilteredCount(indexId, null);
          continue;
        }
        try {
          const query = filterEngine.buildQuery(indexId);
          const count = await apiClient.count(indexId, query, signal);
          if (!signal.aborted) sidePanel.setFilteredCount(indexId, count);
        } catch (err) {
          if ((err as Error).name === 'AbortError') break;
          // Can't get count — leave as unknown
        }
      }
    }

    if (!signal.aborted) {
      sidePanel.render();
      filterPanel.render();
    }
  }, Config.filterDebounceMs);

  filterEngine.addEventListener('change', applyFilters);

  // ── 11b. Geo filter outline rendering ───────────────────────────────────
  // Draws active geo filter boundaries (bbox / polygon) permanently on the
  // map so the user always sees the spatial constraint.
  const GEO_OUTLINE_SOURCE = 'ft-geo-filter-outline';
  const GEO_OUTLINE_FILL   = 'ft-geo-filter-fill';
  const GEO_OUTLINE_LINE   = 'ft-geo-filter-line';

  function updateGeoFilterOutlines(): void {
    const map = engine.map;
    if (!map.isStyleLoaded()) return;

    // Collect active geo filter geometries
    const geoFeatures: Feature[] = [];
    for (const f of filterEngine.filters) {
      if (f.kind !== 'geo' || !f.enabled) continue;
      const gf = f as GeoFilter;

      if (gf.mode === 'bbox' && gf.bbox) {
        const { north, south, east, west } = gf.bbox;
        geoFeatures.push({
          type: 'Feature',
          properties: { id: gf.id, label: gf.label },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [west, north], [east, north], [east, south], [west, south], [west, north],
            ]],
          },
        });
      } else if (gf.mode === 'polygon' && gf.polygon && gf.polygon.length >= 3) {
        const ring: Array<[number, number]> = [...gf.polygon];
        const [fx, fy] = ring[0]; const [lx, ly] = ring[ring.length - 1];
        if (fx !== lx || fy !== ly) ring.push(ring[0]);
        geoFeatures.push({
          type: 'Feature',
          properties: { id: gf.id, label: gf.label },
          geometry: { type: 'Polygon', coordinates: [ring] },
        });
      } else if (gf.mode === 'country' && gf.bbox) {
        const { north, south, east, west } = gf.bbox;
        geoFeatures.push({
          type: 'Feature',
          properties: { id: gf.id, label: gf.label },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [west, north], [east, north], [east, south], [west, south], [west, north],
            ]],
          },
        });
      }
    }

    const fc: FeatureCollection = { type: 'FeatureCollection', features: geoFeatures };

    // Update or create source + layers
    const src = map.getSource(GEO_OUTLINE_SOURCE);
    if (src && 'setData' in src) {
      (src as { setData: (data: FeatureCollection) => void }).setData(fc);
    } else {
      map.addSource(GEO_OUTLINE_SOURCE, { type: 'geojson', data: fc });
      map.addLayer({
        id: GEO_OUTLINE_FILL,
        type: 'fill',
        source: GEO_OUTLINE_SOURCE,
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.08,
        },
      });
      map.addLayer({
        id: GEO_OUTLINE_LINE,
        type: 'line',
        source: GEO_OUTLINE_SOURCE,
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [4, 3],
          'line-opacity': 0.7,
        },
      });
    }
  }

  // Update outlines on every filter change
  filterEngine.addEventListener('change', updateGeoFilterOutlines);
  // Re-create source/layers after style switch (setStyle destroys all layers)
  engine.map.on('style.load', () => setTimeout(updateGeoFilterOutlines, 100));

  // ── 12. Views & saved-filters persistence (backend API) ────────────────
  filterEngine.setApiBaseUrl(Config.apiBaseUrl);
  filterEngine.addEventListener('views-change', () => {
    filterPanel.render();
  });

  // ── View flush: unload all indexes + hide all layers ─────────────────
  filterEngine.addEventListener('view-flush', () => {
    // Unload every loaded index
    for (const indexId of [...rawData.keys()]) {
      unloadIndex(indexId);
    }
    // Hide all WMS / TileServer layers
    for (const layer of layerRegistry.all()) {
      if (layer.meta.visible) layerRegistry.setVisible(layer.meta.id, false);
    }
  });

  // ── View apply: restore indexes + layers + tiles from saved view state ─
  filterEngine.addEventListener('view-apply', ((e: Event) => {
    const detail = (e as CustomEvent).detail as {
      enabledIndexes: string[];
      loadedIndexes: string[];
      layerVisibility: Record<string, boolean>;
      activeMapStyle: string | null;
    };

    // Restore enabled indexes
    if (detail.enabledIndexes.length > 0) {
      sidePanel.setEnabledIndexes(new Set(detail.enabledIndexes));
    }

    // Restore layer visibility (WMS / TileServer layers)
    for (const [layerId, visible] of Object.entries(detail.layerVisibility)) {
      const layer = layerRegistry.get(layerId);
      if (layer) layerRegistry.setVisible(layerId, visible);
    }

    // Restore basemap style
    if (detail.activeMapStyle && detail.activeMapStyle !== sidePanel.activeStyleId) {
      const style = mapStyles.find(s => s.id === detail.activeMapStyle);
      if (style) {
        sidePanel.setMapStyles(mapStyles, style.id);
        engine.map.setStyle(style.url);
        engine.map.once('style.load', () => {
          for (const layer of layerRegistry.all()) {
            if (layer.meta.kind === 'maplibre' || layer.meta.kind === 'tileserver') {
              (layer as WmsLayerAdapter | TileServerAdapter).attach(engine);
            }
          }
        });
      }
    }

    // Re-load data indexes that were loaded in the saved view
    for (const indexId of detail.loadedIndexes) {
      if (!rawData.has(indexId)) loadIndex(indexId);
    }

    sidePanel.render();
  }) as EventListener);

  // Load saved views + saved filters from backend on boot
  filterEngine.loadFromBackend().then(() => {
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
      const count = await apiClient.count(indexId, query);

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
        ?? await apiClient.detectGeoFields(indexId);
      geoFieldsCache.set(indexId, geoFields);

      if (geoFields.length === 0) {
        // No geo field — load sample for data panel / filters only
        console.log(`[FleetTracker] Index "${indexId}" has no geo fields – loading sample only.`);
        const resp = await apiClient.search({ index: indexId, query, size: 100 });
        const features: Feature[] = resp.hits.hits.map(hit => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [0, 0] },
          properties: { _id: hit._id, ...hit._source },
        }));
        rawData.set(indexId, features);
        dataStore.set(indexId, features);
      } else {
        const geoField = geoFields[0];
        const geoType = await apiClient.detectGeoType(indexId, geoField) ?? 'point';

        const features = await apiClient.searchAsGeoJSON({
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
  Object.assign(window, { ft: { engine, layerRegistry, dataStore, filterEngine, apiClient } });

  console.log('[FleetTracker] Boot complete');
}

boot().catch(console.error);
