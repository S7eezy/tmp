// ---------------------------------------------------------------------------
// MapEngine – the single source of truth for the map instance.
//
// Initialises MapLibre GL JS, attaches a deck.gl MapboxOverlay for
// high-performance layer rendering, and exposes a minimal API that the rest
// of the application talks through.
//
// PERFORMANCE NOTES
//  • deck.gl layers are interleaved into MapLibre via @deck.gl/mapbox so
//    depth-sorting with the basemap works correctly.
//  • We never call `map.addLayer` for data-heavy features – those always go
//    through deck.gl which renders them on the GPU.
//  • MapLibre is only used for the basemap tiles and lightweight WMS raster
//    overlays from GeoServer.
// ---------------------------------------------------------------------------

import {
  Map as MLMap,
  type MapOptions,
  type IControl,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer as DeckLayer } from '@deck.gl/core';

import { Config } from '../../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MapEngineOptions {
  container: string | HTMLElement;
  center?: [number, number];
  zoom?: number;
  style?: string;
  /** Extra MapLibre options (hash, bearingSnap …). */
  maplibreOptions?: Partial<MapOptions>;
}

export type DeckLayerList = DeckLayer[];

// ---------------------------------------------------------------------------
// MapEngine class
// ---------------------------------------------------------------------------

export class MapEngine {
  // -- Internals --
  private _map!: MLMap;
  private _overlay!: MapboxOverlay;
  private _ready = false;
  private _readyQueue: Array<() => void> = [];
  private _deckLayers: DeckLayerList = [];

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  constructor(opts: MapEngineOptions) {
    this._init(opts);
  }

  private _init(opts: MapEngineOptions): void {
    const {
      container,
      center = Config.defaultCenter,
      zoom = Config.defaultZoom,
      style = Config.mapStyle,
      maplibreOptions = {},
    } = opts;

    // -- MapLibre ----------------------------------------------------------
    this._map = new MLMap({
      container,
      style,
      center,
      zoom,
      antialias: true, // smoother lines at negligible cost
      attributionControl: false,
      ...maplibreOptions,
    });

    // Default controls (no attribution – replaced by live coords in HUD)
    this._map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
    this._map.addControl(new ScaleControl({ maxWidth: 200 }), 'bottom-left');

    // -- deck.gl overlay ---------------------------------------------------
    this._overlay = new MapboxOverlay({
      interleaved: true, // depth-sort with MapLibre layers
      layers: [],
    });
    this._map.addControl(this._overlay as unknown as IControl);

    // -- Ready gate --------------------------------------------------------
    this._map.on('load', () => {
      this._ready = true;
      for (const fn of this._readyQueue) fn();
      this._readyQueue.length = 0;
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Returns the raw MapLibre map (escape hatch). */
  get map(): MLMap {
    return this._map;
  }

  /** True once the style has loaded and the map is interactive. */
  get ready(): boolean {
    return this._ready;
  }

  /** Await map readiness (resolves immediately if already loaded). */
  whenReady(): Promise<void> {
    if (this._ready) return Promise.resolve();
    return new Promise((resolve) => this._readyQueue.push(resolve));
  }

  // -- deck.gl layer management -------------------------------------------

  /**
   * Replace the entire deck.gl layer stack.
   *
   * deck.gl performs shallow-equal diffing on the layer array, so unchanged
   * Layer instances are *not* re-rendered. Callers should cache layer
   * instances and only create new ones when data or props change.
   */
  setDeckLayers(layers: DeckLayerList): void {
    this._deckLayers = layers;
    this._overlay.setProps({ layers: this._deckLayers });
  }

  /** Append a single deck.gl layer (convenience wrapper). */
  addDeckLayer(layer: DeckLayer): void {
    this._deckLayers = [...this._deckLayers, layer];
    this._overlay.setProps({ layers: this._deckLayers });
  }

  /** Remove a deck.gl layer by id. */
  removeDeckLayer(id: string): void {
    this._deckLayers = this._deckLayers.filter((l) => l.id !== id);
    this._overlay.setProps({ layers: this._deckLayers });
  }

  // -- MapLibre native layers (WMS, raster) --------------------------------

  /**
   * Add a WMS raster source + layer to MapLibre.
   *
   * Use this for GeoServer / weather overlays that are served as raster
   * tiles – they go through MapLibre's tile pipeline, not deck.gl.
   */
  addWmsLayer(
    id: string,
    url: string,
    wmsParams: Record<string, string>,
    options: { opacity?: number; beforeId?: string } = {},
  ): void {
    const tileUrl = this._buildWmsTileUrl(url, wmsParams);

    if (!this._map.getSource(id)) {
      this._map.addSource(id, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
      });
    }

    if (!this._map.getLayer(id)) {
      this._map.addLayer(
        {
          id,
          type: 'raster',
          source: id,
          paint: {
            'raster-opacity': options.opacity ?? 1,
          },
        },
        options.beforeId,
      );
    }
  }

  /** Remove a MapLibre-managed WMS layer + source. */
  removeWmsLayer(id: string): void {
    if (this._map.getLayer(id)) this._map.removeLayer(id);
    if (this._map.getSource(id)) this._map.removeSource(id);
  }

  /** Toggle visibility of any MapLibre layer. */
  setLayerVisibility(id: string, visible: boolean): void {
    if (this._map.getLayer(id)) {
      this._map.setLayoutProperty(
        id,
        'visibility',
        visible ? 'visible' : 'none',
      );
    }
  }

  // -- Camera helpers -----------------------------------------------------

  flyTo(center: [number, number], zoom?: number): void {
    this._map.flyTo({ center, zoom, essential: true });
  }

  fitBounds(
    bounds: [[number, number], [number, number]],
    padding = 40,
  ): void {
    this._map.fitBounds(bounds, { padding });
  }

  /** Current viewport bounding box [west, south, east, north]. */
  getBounds(): [number, number, number, number] {
    const b = this._map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  // -- Resize / destroy ---------------------------------------------------

  resize(): void {
    this._map.resize();
  }

  destroy(): void {
    this._map.remove();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Build a WMS GetMap tile URL template with {bbox-epsg-3857} placeholder
   * that MapLibre replaces at request time.
   */
  private _buildWmsTileUrl(
    baseUrl: string,
    params: Record<string, string>,
  ): string {
    const defaults: Record<string, string> = {
      SERVICE: 'WMS',
      VERSION: '1.1.1',
      REQUEST: 'GetMap',
      FORMAT: 'image/png',
      TRANSPARENT: 'true',
      SRS: 'EPSG:3857',
      WIDTH: '256',
      HEIGHT: '256',
      BBOX: '{bbox-epsg-3857}',
    };
    const merged = { ...defaults, ...params };
    const qs = Object.entries(merged)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}${qs}`;
  }
}
