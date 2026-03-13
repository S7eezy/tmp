# FleetTracker — Architecture

## 1. Map Engine Recommendation

### Winner: MapLibre GL JS + deck.gl

After comparing every viable option (MapLibre, deck.gl, OpenLayers, Leaflet, Mapbox GL JS), the **MapLibre GL JS + deck.gl** stack is the clear best fit.

| Criteria | MapLibre GL JS (v5.20) | deck.gl (v9.1) | Combined |
|---|---|---|---|
| License | BSD-3 | MIT | Fully open-source |
| WebGL | WebGL 2 + WebGPU preview | WebGL 2 + WebGPU preview | GPU-native throughout |
| 100k+ features | Excellent via vector tiles | Best-in-class (200k+ proven with GPU filtering) | Unmatched |
| WMS/WFS (GeoServer) | Native WMS raster source | Experimental WMSLayer | Full coverage |
| Weather overlays | WMS raster layers | Tile layers | Both paths available |
| Real-time filtering | Style expressions | GPU-side aggregation & filtering | Sub-frame filter updates |

**Why not the alternatives?**

- **OpenLayers** — strongest OGC/WFS support but WebGL rendering hits memory walls past ~50k complex geometries. Would be the pick if server-side WFS filtering was the primary pattern.
- **Leaflet** — too lightweight; no native WebGL, relies on community plugins for performance.
- **Mapbox GL JS** — proprietary license since v2.0, metered pricing. MapLibre is its open-source fork with feature parity.

### Integration pattern

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│                                                  │
│   MapLibre GL JS (base map + WMS raster layers)  │
│          ▲                                       │
│          │  @deck.gl/mapbox interleaving         │
│          ▼                                       │
│   deck.gl  (ES geopoints, lines, polygons)       │
│          │                                       │
│          ├── ScatterplotLayer  (points)           │
│          ├── PathLayer         (lines/tracks)     │
│          ├── PolygonLayer      (areas)            │
│          └── GPU filtering     (DataFilterExt)    │
└─────────────────────────────────────────────────┘
```

MapLibre owns the map lifecycle and camera. deck.gl renders as interleaved layers via `@deck.gl/mapbox` so features depth-sort correctly with the basemap.

---

## 2. Code Architecture

```
frontend/
├── src/
│   ├── main.ts                     # Entry point
│   ├── config.ts                   # Env vars, endpoints
│   │
│   ├── core/
│   │   ├── map/
│   │   │   ├── MapEngine.ts        # MapLibre init + deck.gl overlay
│   │   │   ├── camera.ts           # Viewport / fly-to helpers
│   │   │   └── controls.ts         # Zoom, compass, scale bar
│   │   │
│   │   ├── layers/
│   │   │   ├── LayerRegistry.ts    # Central registry of all layers
│   │   │   ├── BaseLayer.ts        # Abstract layer interface
│   │   │   ├── WmsLayer.ts         # GeoServer WMS adapter
│   │   │   ├── WeatherLayer.ts     # Weather overlay adapter
│   │   │   └── DeckLayer.ts        # deck.gl layer factory (points, lines, polys)
│   │   │
│   │   ├── data/
│   │   │   ├── ElasticClient.ts    # ES query builder + fetch
│   │   │   ├── VectorTileSource.ts # ES vector tile API adapter
│   │   │   ├── GeoServerClient.ts  # WMS/WFS request helpers
│   │   │   └── DataStore.ts        # In-memory feature cache + signals
│   │   │
│   │   └── filters/
│   │       ├── FilterEngine.ts     # Evaluates filter tree → ES query + GPU filter
│   │       ├── FilterNode.ts       # Single filter condition (field, op, value)
│   │       └── operators.ts        # eq, neq, gt, lt, range, geo_bbox, geo_dist …
│   │
│   ├── ui/                         # Presentation (framework-agnostic skeleton)
│   │   ├── panels/
│   │   │   ├── LayerPanel.ts       # Toggle layers on/off, opacity
│   │   │   ├── DataPanel.ts        # Pick ES index / data source
│   │   │   └── FilterPanel.ts      # Build filter tree via UI
│   │   └── components/
│   │       ├── FilterRow.ts        # Single filter row (field picker, op, value)
│   │       ├── FieldPicker.ts      # Auto-populated from ES mapping
│   │       └── Legend.ts           # Dynamic legend
│   │
│   └── workers/
│       ├── dataWorker.ts           # Off-main-thread ES response → GeoJSON transform
│       └── clusterWorker.ts        # Supercluster for point aggregation
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── Dockerfile
```

### Core module responsibilities

**MapEngine** — single source of truth for the map instance. Initialises MapLibre, attaches the deck.gl `MapboxOverlay`, exposes methods to add/remove layers. Everything else talks to the map through this module.

**LayerRegistry** — flat Map<string, BaseLayer>. Each layer knows how to produce either a MapLibre source+layer (for WMS) or a deck.gl Layer instance. The registry handles visibility toggling, z-ordering, and re-renders.

**ElasticClient** — thin wrapper around `fetch` that builds ES `_search` and `_mvt` (vector tile) requests. Returns raw hits or binary MVT buffers. Never touches the DOM.

**DataStore** — reactive feature cache. Holds the current GeoJSON FeatureCollection per data source. Emits change signals (simple EventTarget) so the UI and layers react without polling.

**FilterEngine** — the brain of the filtering UI. Maintains a tree of `FilterNode` objects (AND/OR groups, leaf conditions). On every change it:
  1. Serialises the tree into an ES `bool` query and re-fetches data.
  2. Simultaneously produces a `DataFilterExtension` range for deck.gl so already-loaded features hide/show on the GPU without a network round-trip.

**Web Workers** — `dataWorker` deserialises large ES responses off the main thread and emits structured GeoJSON. `clusterWorker` wraps Supercluster for server-side-like clustering at the client level.

### Data flow

```
User toggles filter
       │
       ▼
 FilterEngine.update()
       │
       ├──▶ ElasticClient.search(query)  ──▶  ES  ──▶  dataWorker  ──▶  DataStore
       │                                                                    │
       └──▶ GPU filter range (immediate)                                    │
                    │                                                       │
                    ▼                                                       ▼
              deck.gl DataFilterExtension                         DeckLayer.setData()
              (instant visual hide/show)                        (full refresh when data arrives)
```

This dual path gives the user **instant visual feedback** (GPU filter) while the accurate server-side result loads in the background.

---

## 3. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Type safety across ES queries, GeoJSON, deck.gl props |
| Bundler | Vite | Fast HMR, native ESM, simple config |
| UI framework | None initially (vanilla TS + DOM) | Keep core framework-agnostic; wrap in React/Solid later if needed |
| State management | EventTarget signals + DataStore | Zero dependencies, easy to test, replaceable |
| ES query style | Build queries as plain objects | No DSL library needed, full control |
| Large data path | ES vector tile API (`_mvt`) | Streams pre-tiled data; avoids transferring raw JSON for huge datasets |
| Clustering | Supercluster in Web Worker | Client-side clustering without blocking the UI thread |
| Styling | CSS Modules or plain CSS | Minimal footprint, no runtime cost |

---

## 4. Infrastructure (Docker)

```
docker compose up
```

| Service | Image | Port | Purpose |
|---|---|---|---|
| elasticsearch | elastic/elasticsearch:8.17.0 | 9200 | Geospatial data store |
| geoserver | kartoza/geoserver:2.26.1 | 8080 | WMS/WFS map layers |
| frontend | node:22-alpine (Vite) | 5173 | Dev server with HMR |

All services share a `ft-net` bridge network. The frontend container mounts the source tree as a volume so edits are reflected instantly via Vite HMR.

---

## 5. Next Steps

1. `npm create vite@latest` inside `frontend/`, install MapLibre + deck.gl.
2. Implement `MapEngine.ts` — get a map on screen with a single WMS layer from GeoServer.
3. Wire up `ElasticClient.ts` — query a test index, render results as a `ScatterplotLayer`.
4. Build the `FilterEngine` + `FilterPanel` — start with simple field/op/value rows, compound with AND/OR.
5. Add Web Workers for large payloads, then stress-test with 100k+ synthetic features.
