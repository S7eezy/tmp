// ---------------------------------------------------------------------------
// WmsLayer – adapter that manages a GeoServer (or any OGC WMS) raster layer
// through MapLibre's native raster tile pipeline.
// ---------------------------------------------------------------------------

import type { Layer as DeckGLLayer } from '@deck.gl/core';
import type { BaseLayer, LayerMeta } from './BaseLayer';
import type { MapEngine } from '../map/MapEngine';

export type TileKind = 'raster' | 'vector' | 'satellite';

export interface WmsLayerOptions {
  id: string;
  label: string;
  /** GeoServer WMS endpoint (e.g. /api/geoserver/wms). */
  wmsUrl: string;
  /** WMS GetMap parameters (LAYERS is required). */
  wmsParams: Record<string, string>;
  /** Visual category shown in the tiles panel. */
  tileKind?: TileKind;
  /** Min zoom at which this layer is fetched. */
  minZoom?: number;
  /** Max zoom at which this layer is fetched. */
  maxZoom?: number;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
}

export class WmsLayerAdapter implements BaseLayer {
  meta: LayerMeta;

  /** Visual category for the tiles panel. */
  readonly tileKind: TileKind;

  /** Zoom range. */
  readonly minZoom: number;
  readonly maxZoom: number;

  private _wmsUrl: string;
  private _wmsParams: Record<string, string>;
  private _engine: MapEngine | null = null;

  constructor(opts: WmsLayerOptions) {
    this.meta = {
      id: opts.id,
      label: opts.label,
      kind: 'maplibre',
      visible: opts.visible ?? true,
      zIndex: opts.zIndex ?? 0,
      opacity: opts.opacity ?? 1,
    };
    this._wmsUrl = opts.wmsUrl;
    this._wmsParams = opts.wmsParams;
    this.tileKind = opts.tileKind ?? 'raster';
    this.minZoom = opts.minZoom ?? 0;
    this.maxZoom = opts.maxZoom ?? 22;
  }

  /** Attach to the map engine – must be called once after engine is ready. */
  attach(engine: MapEngine): void {
    this._engine = engine;
    if (this.meta.visible) {
      engine.addWmsLayer(this.meta.id, this._wmsUrl, this._wmsParams, {
        opacity: this.meta.opacity,
      });
    }
  }

  setVisible(v: boolean): boolean {
    if (this.meta.visible === v) return false;
    this.meta.visible = v;
    if (this._engine) {
      if (v) {
        this._engine.addWmsLayer(this.meta.id, this._wmsUrl, this._wmsParams, {
          opacity: this.meta.opacity,
        });
      }
      this._engine.setLayerVisibility(this.meta.id, v);
    }
    return true;
  }

  setOpacity(o: number): boolean {
    const clamped = Math.max(0, Math.min(1, o));
    if (this.meta.opacity === clamped) return false;
    this.meta.opacity = clamped;
    if (this._engine) {
      this._engine.map.setPaintProperty(
        this.meta.id,
        'raster-opacity',
        clamped,
      );
    }
    return true;
  }

  toDeckLayer(): DeckGLLayer | null {
    return null;
  }

  dispose(): void {
    if (this._engine) {
      this._engine.removeWmsLayer(this.meta.id);
    }
    this._engine = null;
  }
}
