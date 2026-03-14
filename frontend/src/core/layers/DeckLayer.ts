// ---------------------------------------------------------------------------
// DeckLayer – factory that wraps Elasticsearch GeoJSON data into optimised
// deck.gl layer instances (ScatterplotLayer, PathLayer, PolygonLayer).
//
// PERFORMANCE STRATEGY
//  1. Below Config.binaryThreshold features → plain GeoJSON accessor path.
//  2. Above threshold → we convert to binary columnar layout (flat
//     Float32Arrays for positions) so deck.gl skips per-feature iteration
//     entirely and uploads straight to the GPU.
//  3. DataFilterExtension is always attached so the FilterEngine can
//     hide/show features on the GPU without touching the data array.
// ---------------------------------------------------------------------------

import { ScatterplotLayer } from '@deck.gl/layers';
import { PathLayer } from '@deck.gl/layers';
import { PolygonLayer } from '@deck.gl/layers';
import { DataFilterExtension } from '@deck.gl/extensions';
import type { Layer as DeckGLLayer } from '@deck.gl/core';
import type { Feature, Point, MultiLineString, Polygon } from 'geojson';

import type { BaseLayer, LayerMeta } from './BaseLayer';
import { Config } from '../../config';

// ---------------------------------------------------------------------------
// Geometry discriminators
// ---------------------------------------------------------------------------

type PointFeature   = Feature<Point>;
type PolygonFeature = Feature<Polygon>;

/** One flattened sub-path datum used by PathLayer. */
interface PathDatum {
  path: [number, number][];
  source: Feature;
}

export type GeoType = 'point' | 'line' | 'polygon';

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface DeckLayerOptions {
  id: string;
  label: string;
  geoType: GeoType;
  data?: Feature[];
  /** GPU filter range applied via DataFilterExtension. */
  filterRange?: [number, number];
  /** Function that maps a feature to a numeric filter value. */
  getFilterValue?: (d: Feature) => number;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
  color?: [number, number, number, number];
  /** ES index this layer is sourced from (shown in the data panel). */
  esIndex?: string;
}

// ---------------------------------------------------------------------------
// DeckLayerAdapter
// ---------------------------------------------------------------------------

export class DeckLayerAdapter implements BaseLayer {
  meta: LayerMeta;

  /** Geometry type for this layer. */
  readonly geoType: GeoType;

  /** ES index name this layer sources data from (if any). */
  readonly esIndex: string;

  /** Colour for rendering and panel swatches. */
  readonly color: [number, number, number, number];

  private _data: Feature[] = [];
  private _filterRange: [number, number] = [1, 1];
  private _getFilterValue: (d: Feature) => number;
  private _dirty = true;
  private _cachedLayer: DeckGLLayer | null = null;

  constructor(opts: DeckLayerOptions) {
    this.meta = {
      id: opts.id,
      label: opts.label,
      kind: 'deck',
      visible: opts.visible ?? true,
      zIndex: opts.zIndex ?? 0,
      opacity: opts.opacity ?? Config.scatter.opacity,
    };
    this.geoType = opts.geoType;
    this.esIndex = opts.esIndex ?? opts.id;
    this.color = opts.color ?? [0, 128, 255, 200];
    this._data = opts.data ?? [];
    this._filterRange = opts.filterRange ?? [1, 1];
    this._getFilterValue = opts.getFilterValue ?? (() => 1);
  }

  // -- Public accessors -----------------------------------------------------

  /** Current feature count. */
  get dataCount(): number {
    return this._data.length;
  }

  // -- BaseLayer interface -------------------------------------------------

  setVisible(v: boolean): boolean {
    if (this.meta.visible === v) return false;
    this.meta.visible = v;
    this._dirty = true;
    return true;
  }

  setOpacity(o: number): boolean {
    const clamped = Math.max(0, Math.min(1, o));
    if (this.meta.opacity === clamped) return false;
    this.meta.opacity = clamped;
    this._dirty = true;
    return true;
  }

  /** Replace the data array (e.g. after a fresh ES query). */
  setData(features: Feature[]): void {
    this._data = features;
    this._dirty = true;
  }

  /** Update GPU filter range (called by FilterEngine). */
  setFilterRange(range: [number, number]): void {
    this._filterRange = range;
    this._dirty = true;
  }

  toDeckLayer(): DeckGLLayer | null {
    if (!this.meta.visible) return null;

    if (!this._dirty && this._cachedLayer) return this._cachedLayer;
    this._dirty = false;

    const useBinary = this._data.length >= Config.binaryThreshold;

    switch (this.geoType) {
      case 'point':
        this._cachedLayer = this._buildScatterplot(useBinary);
        break;
      case 'line':
        this._cachedLayer = this._buildPath(useBinary);
        break;
      case 'polygon':
        this._cachedLayer = this._buildPolygon(useBinary);
        break;
    }
    return this._cachedLayer;
  }

  dispose(): void {
    this._data = [];
    this._cachedLayer = null;
  }

  // -----------------------------------------------------------------------
  // Layer builders
  // -----------------------------------------------------------------------

  private _buildScatterplot(binary: boolean): DeckGLLayer {
    const extensions = [new DataFilterExtension({ filterSize: 1 })];
    const filterProps = {
      getFilterValue: this._getFilterValue,
      filterRange: this._filterRange,
    };

    if (binary && this._data.length > 0) {
      const { positions, filterValues } = this._toBinaryPoints(
        this._data as PointFeature[],
      );
      return new ScatterplotLayer({
        id: this.meta.id,
        data: {
          length: this._data.length,
          attributes: {
            getPosition:    { value: positions,    size: 2 },
            getFilterValue: { value: filterValues, size: 1 },
          },
        },
        getRadius: 4,
        radiusMinPixels: Config.scatter.radiusMinPixels,
        radiusMaxPixels: Config.scatter.radiusMaxPixels,
        getFillColor: this.color,
        opacity: this.meta.opacity,
        pickable: Config.scatter.pickable,
        extensions,
        filterRange: this._filterRange,
        updateTriggers: {
          getFilterValue: [this._filterRange],
        },
      } as never);
    }

    return new ScatterplotLayer({
      id: this.meta.id,
      data: this._data,
      getPosition: (d: PointFeature) => d.geometry.coordinates as [number, number],
      getRadius: 4,
      radiusMinPixels: Config.scatter.radiusMinPixels,
      radiusMaxPixels: Config.scatter.radiusMaxPixels,
      getFillColor: this.color,
      opacity: this.meta.opacity,
      pickable: Config.scatter.pickable,
      extensions,
      ...filterProps,
      updateTriggers: {
        getFilterValue: [this._filterRange],
      },
    } as never);
  }

  private _buildPath(_binary: boolean): DeckGLLayer {
    const extensions = [new DataFilterExtension({ filterSize: 1 })];

    // PathLayer expects one path per datum.
    // Flatten MultiLineString features into individual PathDatum entries.
    const data: PathDatum[] = [];
    for (const f of this._data) {
      if (f.geometry.type === 'LineString') {
        data.push({ path: f.geometry.coordinates as [number, number][], source: f });
      } else if (f.geometry.type === 'MultiLineString') {
        for (const line of (f.geometry as MultiLineString).coordinates) {
          data.push({ path: line as [number, number][], source: f });
        }
      }
    }

    return new PathLayer({
      id: this.meta.id,
      data,
      getPath: (d: PathDatum) => d.path,
      getColor: this.color,
      widthMinPixels: Config.path.widthMinPixels,
      widthMaxPixels: Config.path.widthMaxPixels,
      opacity: this.meta.opacity,
      pickable: Config.path.pickable,
      extensions,
      getFilterValue: (d: PathDatum) => this._getFilterValue(d.source),
      filterRange: this._filterRange,
      updateTriggers: {
        getFilterValue: [this._filterRange],
      },
    } as never);
  }

  private _buildPolygon(_binary: boolean): DeckGLLayer {
    const extensions = [new DataFilterExtension({ filterSize: 1 })];
    return new PolygonLayer({
      id: this.meta.id,
      data: this._data,
      getPolygon: (d: PolygonFeature) =>
        d.geometry.coordinates as [number, number][][],
      getFillColor: this.color,
      getLineColor: [255, 255, 255, 180] as [number, number, number, number],
      filled: Config.polygon.filled,
      stroked: Config.polygon.stroked,
      lineWidthMinPixels: Config.polygon.lineWidthMinPixels,
      opacity: this.meta.opacity,
      pickable: Config.polygon.pickable,
      extensions,
      getFilterValue: this._getFilterValue,
      filterRange: this._filterRange,
      updateTriggers: {
        getFilterValue: [this._filterRange],
      },
    } as never);
  }

  // -----------------------------------------------------------------------
  // Binary column builders (typed arrays for GPU upload)
  // -----------------------------------------------------------------------

  private _toBinaryPoints(features: PointFeature[]): {
    positions: Float32Array;
    filterValues: Float32Array;
  } {
    const len = features.length;
    const positions = new Float32Array(len * 2);
    const filterValues = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const coords = features[i].geometry.coordinates;
      positions[i * 2] = coords[0];
      positions[i * 2 + 1] = coords[1];
      filterValues[i] = this._getFilterValue(features[i]);
    }
    return { positions, filterValues };
  }
}
