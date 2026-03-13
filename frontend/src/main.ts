// ---------------------------------------------------------------------------
// FleetTracker – Entry point
//
// Slim boot sequence: initialises the map engine, discovers Elasticsearch
// indices, loads data, and wires up all UI components.
// ---------------------------------------------------------------------------

import './style.css';

import { MapEngine } from '@core/map';
import { LayerRegistry, DeckLayerAdapter, WmsLayerAdapter } from '@core/layers';
import type { GeoType } from '@core/layers';
import { DataStore, ElasticClient } from '@core/data';
import type { EsIndexInfo } from '@core/data';
import { FilterEngine, FilterPanel } from '@filters';
import { Toolbar, SidePanel, SettingsModal, FeatureTooltip, DrawMode, SearchPanel, Hud } from '@ui';
import type { Feature } from 'geojson';

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
  const dataStore     = new DataStore();
  const rawData       = new Map<string, Feature[]>();
  const layerRegistry = new LayerRegistry();
  const filterEngine  = new FilterEngine();
  const esClient      = new ElasticClient();

  // ── 2. Map engine ───────────────────────────────────────────────────────
  const engine = new MapEngine({ container: 'map' });
  await engine.whenReady();
  console.log('[FleetTracker] Map ready');

  // ── 3. Load Elasticsearch indices ───────────────────────────────────────
  let indices: EsIndexInfo[] = [];
  try {
    indices = await esClient.listIndices();
    console.log(`[FleetTracker] Discovered ${indices.length} ES indices:`, indices.map(i => i.index));
  } catch (err) {
    console.warn('[FleetTracker] Could not connect to Elasticsearch:', err);
    console.log('[FleetTracker] Running with empty data – add ES indices and reload.');
  }

  // ── 4. For each index, detect geo field → load data → create layer ─────
  const t0 = performance.now();
  let colorIdx = 0;

  for (const info of indices) {
    try {
      // Detect geo fields in this index
      const geoFields = await esClient.detectGeoFields(info.index);
      if (geoFields.length === 0) {
        console.log(`[FleetTracker] Index "${info.index}" has no geo fields – skipping layer, but listing in Data panel.`);
        // Still load a sample for the data panel / filters
        const resp = await esClient.search({ index: info.index, size: 100 });
        const features: Feature[] = resp.hits.hits.map(hit => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [0, 0] },
          properties: { _id: hit._id, ...hit._source },
        }));
        rawData.set(info.index, features);
        dataStore.set(info.index, features);
        continue;
      }

      const geoField = geoFields[0]; // Use the first geo field
      const geoType = await esClient.detectGeoType(info.index, geoField) ?? 'point';

      // Fetch data as GeoJSON
      const features = await esClient.searchAsGeoJSON({
        index: info.index,
        geoField,
      });

      console.log(`[FleetTracker] Index "${info.index}": ${features.length} features (${geoType}, field: ${geoField})`);

      rawData.set(info.index, features);
      dataStore.set(info.index, features);

      // Create a deck.gl layer
      const color = PALETTE[colorIdx % PALETTE.length];
      colorIdx++;

      const zIndex = geoType === 'point' ? 10 : geoType === 'line' ? 5 : 1;
      const layer = new DeckLayerAdapter({
        id: info.index,
        label: info.index,
        geoType: geoType as GeoType,
        data: features,
        color,
        esIndex: info.index,
        zIndex,
      });
      layerRegistry.add(layer);
    } catch (err) {
      console.error(`[FleetTracker] Failed to load index "${info.index}":`, err);
    }
  }

  console.log(`[FleetTracker] Loaded ${dataStore.totalFeatures()} features from ${indices.length} indices in ${(performance.now() - t0).toFixed(1)}ms`);

  // ── 5. Example WMS layer ───────────────────────────────────────────────
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

  // ── 6. UI components ───────────────────────────────────────────────────
  const settingsModal = new SettingsModal(dataStore, rawData);
  const hud           = new Hud(engine, dataStore);
  const toolbar       = new Toolbar(filterEngine);
  const sidePanel     = new SidePanel({
    layerRegistry,
    dataStore,
    onOpenSettings: (id: string) => settingsModal.open(id),
  });
  const featureTooltip = new FeatureTooltip(engine, dataStore, settingsModal);
  const drawMode       = new DrawMode(engine, () => filterPanel);
  const searchPanel    = new SearchPanel(engine, dataStore, featureTooltip);

  // ── 7. Sync registry → engine + panels ─────────────────────────────────
  const sync = (): void => {
    engine.setDeckLayers(layerRegistry.buildDeckLayers());
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
    onStartDrawPolygon: () => drawMode.start(),
  });
  filterPanel.render();

  // ── 11. React to filter changes → query ES ─────────────────────────────
  filterEngine.addEventListener('change', async () => {
    for (const [sourceId, originalFeatures] of rawData) {
      const query = filterEngine.buildQuery(sourceId);

      // Check if there are active filters for this index
      const activeFilters = filterEngine.getFiltersForIndex(sourceId);

      if (activeFilters.length === 0) {
        // No filters → restore original data
        dataStore.set(sourceId, originalFeatures);
      } else {
        // Has filters → try ES query, fall back to client-side
        try {
          // Detect the geo field for this index
          const geoFields = await esClient.detectGeoFields(sourceId);
          const geoField = geoFields.length > 0 ? geoFields[0] : 'location';

          const filtered = await esClient.searchAsGeoJSON({
            index: sourceId,
            query,
            geoField,
          });
          dataStore.set(sourceId, filtered);
        } catch {
          // Fallback to client-side filtering
          const pred = filterEngine.buildClientPredicate(sourceId);
          dataStore.set(sourceId, originalFeatures.filter(pred));
        }
      }
    }
    filterPanel.render();
  });

  // ── 12. Views persistence ──────────────────────────────────────────────
  filterEngine.addEventListener('views-change', () => {
    try { localStorage.setItem('ft-views', filterEngine.serializeViews()); } catch { /* noop */ }
    filterPanel.render();
  });

  try {
    const saved = localStorage.getItem('ft-views');
    if (saved) filterEngine.deserializeViews(saved);
  } catch { /* noop */ }

  // ── 13. Expose globals for debugging ───────────────────────────────────
  Object.assign(window, { ft: { engine, layerRegistry, dataStore, filterEngine, esClient } });

  console.log('[FleetTracker] Boot complete');
}

boot().catch(console.error);
