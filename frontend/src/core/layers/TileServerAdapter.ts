// ---------------------------------------------------------------------------
// TileServerAdapter – manages a TileServer GL tileset as a MapLibre layer.
// Supports both raster (png/jpg/webp) and vector (pbf) tile formats.
// ---------------------------------------------------------------------------

import type { Layer as DeckGLLayer } from '@deck.gl/core';
import type { BaseLayer, LayerMeta } from './BaseLayer';
import type { MapEngine } from '../map/MapEngine';

export type TileFormat = 'pbf' | 'png' | 'jpg' | 'webp';

export interface TileServerAdapterOptions {
  id: string;
  label: string;
  /** Tile URL template(s) for MapLibre. */
  tiles: string[];
  /** Tile format — determines raster vs vector handling. */
  format: TileFormat;
  /** Min zoom. */
  minZoom?: number;
  /** Max zoom. */
  maxZoom?: number;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
}

export class TileServerAdapter implements BaseLayer {
  meta: LayerMeta;

  readonly tiles: string[];
  readonly format: TileFormat;
  readonly minZoom: number;
  readonly maxZoom: number;

  private _engine: MapEngine | null = null;

  /** Whether this tileset uses vector (pbf) or raster tiles. */
  get isVector(): boolean {
    return this.format === 'pbf';
  }

  constructor(opts: TileServerAdapterOptions) {
    this.meta = {
      id: opts.id,
      label: opts.label,
      kind: 'tileserver',
      visible: opts.visible ?? false,
      zIndex: opts.zIndex ?? -2,
      opacity: opts.opacity ?? 1,
    };
    this.tiles = opts.tiles;
    this.format = opts.format;
    this.minZoom = opts.minZoom ?? 0;
    this.maxZoom = opts.maxZoom ?? 22;
  }

  /** Attach to the map engine — registers the MapLibre source + layer. */
  attach(engine: MapEngine): void {
    this._engine = engine;
    if (this.meta.visible) {
      this._addToMap();
    }
  }

  setVisible(v: boolean): boolean {
    if (this.meta.visible === v) return false;
    this.meta.visible = v;
    if (this._engine) {
      if (v) {
        this._addToMap();
      } else {
        this._engine.removeTileLayer(this.meta.id);
      }
    }
    return true;
  }

  setOpacity(o: number): boolean {
    const clamped = Math.max(0, Math.min(1, o));
    if (this.meta.opacity === clamped) return false;
    this.meta.opacity = clamped;
    if (this._engine) {
      const prop = this.isVector ? 'circle-opacity' : 'raster-opacity';
      this._engine.map.setPaintProperty(this.meta.id, prop, clamped);
    }
    return true;
  }

  toDeckLayer(): DeckGLLayer | null {
    return null; // Rendered via MapLibre, not deck.gl
  }

  dispose(): void {
    if (this._engine) {
      this._engine.removeTileLayer(this.meta.id);
    }
    this._engine = null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _addToMap(): void {
    if (!this._engine) return;
    if (this.isVector) {
      this._engine.addVectorTileLayer(this.meta.id, this.tiles, {
        minzoom: this.minZoom,
        maxzoom: this.maxZoom,
        opacity: this.meta.opacity,
      });
    } else {
      this._engine.addRasterTileLayer(this.meta.id, this.tiles, {
        minzoom: this.minZoom,
        maxzoom: this.maxZoom,
        opacity: this.meta.opacity,
      });
    }
  }
}
