// ---------------------------------------------------------------------------
// DeckLayer – factory that wraps Elasticsearch GeoJSON data into optimised
// deck.gl layer instances (ScatterplotLayer, IconLayer, PathLayer, PolygonLayer,
// TextLayer).
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
import { IconLayer } from '@deck.gl/layers';
import { PathLayer } from '@deck.gl/layers';
import { PolygonLayer } from '@deck.gl/layers';
import { TextLayer } from '@deck.gl/layers';
import { DataFilterExtension } from '@deck.gl/extensions';
import type { Layer as DeckGLLayer } from '@deck.gl/core';
import type { Feature, Point, MultiLineString, Polygon } from 'geojson';

import type { BaseLayer, LayerMeta } from './BaseLayer';
import type { LayerStyleConfig } from './LayerStyleConfig';
import { CATEGORICAL_PALETTE, lerpColor } from './LayerStyleConfig';
import { getIconDef, iconToDataUrl } from './IconLibrary';
import { Config } from '../../config';

// ---------------------------------------------------------------------------
// Icon atlas cache – lazily builds per-icon Image objects for IconLayer.
// Uses SVG data URIs from IconLibrary rendered to Image elements.
// ---------------------------------------------------------------------------

/** No-op preload — kept for API compat. */
export function preloadIcons(): Promise<void> {
  return Promise.resolve();
}

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
  color: [number, number, number, number];

  private _data: Feature[] = [];
  private _filterRange: [number, number] = [1, 1];
  private _getFilterValue: (d: Feature) => number;
  private _dirty = true;
  private _cachedLayers: DeckGLLayer[] = [];
  private _style: LayerStyleConfig | null = null;

  // Pre-computed color accessor caches
  private _colorAccessor: ((d: Feature) => [number, number, number, number]) | null = null;
  private _fieldStats: { min: number; max: number } | null = null;
  private _categoricalMap: Map<string, [number, number, number, number]> | null = null;

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

  /** Current style config. */
  get style(): LayerStyleConfig | null {
    return this._style;
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
    this._fieldStats = null;
    this._categoricalMap = null;
  }

  /** Update GPU filter range (called by FilterEngine). */
  setFilterRange(range: [number, number]): void {
    this._filterRange = range;
    this._dirty = true;
  }

  /** Apply a visual style configuration. */
  setStyle(style: LayerStyleConfig | null): void {
    this._style = style;
    this._dirty = true;
    this._colorAccessor = null;
    this._fieldStats = null;
    this._categoricalMap = null;

    // Update base color if static color is set
    if (style?.color?.mode === 'static' && style.color.staticColor) {
      this.color = [...style.color.staticColor] as [number, number, number, number];
    }
  }

  /**
   * Build deck.gl layers for this adapter.
   * Returns an array (may include main layer + label layer).
   */
  toDeckLayers(): DeckGLLayer[] {
    if (!this.meta.visible) return [];

    if (!this._dirty && this._cachedLayers.length > 0) return this._cachedLayers;
    this._dirty = false;

    const useBinary = this._data.length >= Config.binaryThreshold && !this._style;
    const layers: DeckGLLayer[] = [];

    // Build color accessor if field-based
    this._buildColorAccessor();

    switch (this.geoType) {
      case 'point':
        if (this._style?.icon) {
          layers.push(this._buildIconLayer());
        } else {
          layers.push(this._buildScatterplot(useBinary));
        }
        break;
      case 'line':
        layers.push(this._buildPath(useBinary));
        break;
      case 'polygon':
        layers.push(this._buildPolygon(useBinary));
        break;
    }

    // Add text label layer if configured
    const labelLayer = this._buildLabelLayer();
    if (labelLayer) layers.push(labelLayer);

    this._cachedLayers = layers;
    return layers;
  }

  /** Legacy single-layer compat (returns first layer or null). */
  toDeckLayer(): DeckGLLayer | null {
    const layers = this.toDeckLayers();
    return layers.length > 0 ? layers[0] : null;
  }

  dispose(): void {
    this._data = [];
    this._cachedLayers = [];
  }

  // -----------------------------------------------------------------------
  // Color accessor
  // -----------------------------------------------------------------------

  private _buildColorAccessor(): void {
    if (!this._style?.color || this._style.color.mode === 'static') {
      this._colorAccessor = null;
      return;
    }

    const cfg = this._style.color;
    const field = cfg.field;
    if (!field) { this._colorAccessor = null; return; }

    if (cfg.colorMap && Object.keys(cfg.colorMap).length > 0) {
      // Categorical: explicit color map
      const map = cfg.colorMap;
      this._colorAccessor = (d: Feature) => {
        const val = String(d.properties?.[field] ?? '');
        return map[val] ?? this.color;
      };
    } else if (cfg.gradient) {
      // Numeric gradient
      const grad = cfg.gradient;
      const stats = this._computeFieldStats(field);
      const minVal = grad.minVal ?? stats.min;
      const maxVal = grad.maxVal ?? stats.max;
      const range = maxVal - minVal || 1;
      this._colorAccessor = (d: Feature) => {
        const v = Number(d.properties?.[field] ?? 0);
        const t = Math.max(0, Math.min(1, (v - minVal) / range));
        return lerpColor(grad.min, grad.max, t);
      };
    } else {
      // Auto-categorical: assign palette colors
      const catMap = this._buildCategoricalMap(field);
      this._colorAccessor = (d: Feature) => {
        const val = String(d.properties?.[field] ?? '');
        return catMap.get(val) ?? this.color;
      };
    }
  }

  private _computeFieldStats(field: string): { min: number; max: number } {
    if (this._fieldStats) return this._fieldStats;
    let min = Infinity, max = -Infinity;
    for (const f of this._data) {
      const v = Number(f.properties?.[field]);
      if (!isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
    }
    if (!isFinite(min)) { min = 0; max = 1; }
    this._fieldStats = { min, max };
    return this._fieldStats;
  }

  private _buildCategoricalMap(field: string): Map<string, [number, number, number, number]> {
    if (this._categoricalMap) return this._categoricalMap;
    const unique = new Set<string>();
    for (const f of this._data) {
      unique.add(String(f.properties?.[field] ?? ''));
      if (unique.size >= CATEGORICAL_PALETTE.length) break;
    }
    const map = new Map<string, [number, number, number, number]>();
    let idx = 0;
    for (const val of unique) {
      map.set(val, CATEGORICAL_PALETTE[idx % CATEGORICAL_PALETTE.length]);
      idx++;
    }
    this._categoricalMap = map;
    return map;
  }

  private _getColor(d: Feature): [number, number, number, number] {
    return this._colorAccessor ? this._colorAccessor(d) : this.color;
  }

  // -----------------------------------------------------------------------
  // Orientation accessor
  // -----------------------------------------------------------------------

  private _getAngle(d: Feature): number {
    if (!this._style?.orientation) return 0;
    if (this._style.orientation.mode === 'static') return this._style.orientation.staticAngle ?? 0;
    if (this._style.orientation.field) {
      return Number(d.properties?.[this._style.orientation.field] ?? 0);
    }
    return 0;
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
    const iconSize = this._style?.iconSize ?? 4;

    if (binary && this._data.length > 0 && !this._colorAccessor) {
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
        getRadius: iconSize,
        radiusUnits: 'pixels',
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
      getRadius: iconSize,
      radiusUnits: 'pixels',
      getFillColor: this._colorAccessor
        ? ((d: PointFeature) => this._getColor(d))
        : this.color,
      opacity: this.meta.opacity,
      pickable: Config.scatter.pickable,
      extensions,
      ...filterProps,
      updateTriggers: {
        getFilterValue: [this._filterRange],
        getFillColor: [this._style?.color],
      },
    } as never);
  }

  /**
   * Build an IconLayer that renders actual SVG icons from IconLibrary
   * on top of the ScatterplotLayer base.
   */
  private _buildIconLayer(): DeckGLLayer {
    const name = this._style!.icon!;
    const iconSize = this._style?.iconSize ?? 24;
    const iconDef = getIconDef(name);
    if (!iconDef) return this._buildScatterplot(false); // fallback

    const atlasSize = Math.max(48, iconSize * 2);
    const extensions = [new DataFilterExtension({ filterSize: 1 })];

    // When a per-feature color accessor exists, render a white SVG and use
    // deck.gl's icon masking so getColor can tint each icon individually.
    // Otherwise bake the layer's static color directly into the SVG.
    const hasColorAccessor = !!this._colorAccessor;
    const svgColor = hasColorAccessor
      ? '#ffffff'
      : `rgb(${this.color[0]},${this.color[1]},${this.color[2]})`;
    const dataUrl = iconToDataUrl(iconDef, atlasSize, svgColor, 1.5);

    return new IconLayer({
      id: `${this.meta.id}-icon`,
      data: this._data,
      getPosition: (d: PointFeature) => d.geometry.coordinates as [number, number],
      getIcon: () => ({
        url: dataUrl,
        width: atlasSize,
        height: atlasSize,
        mask: hasColorAccessor,
      }),
      getColor: hasColorAccessor
        ? ((d: PointFeature) => this._getColor(d))
        : [255, 255, 255, 255],
      getSize: iconSize,
      sizeUnits: 'pixels',
      getAngle: (d: PointFeature) => -this._getAngle(d),
      opacity: this.meta.opacity,
      pickable: false,
      loadOptions: { fetch: { mode: 'no-cors' } },
      extensions,
      getFilterValue: this._getFilterValue,
      filterRange: this._filterRange,
      updateTriggers: {
        getFilterValue: [this._filterRange],
        getIcon: [this._style?.icon, this._style?.color, this.color],
        getColor: [this._style?.color, this.color],
        getSize: [this._style?.iconSize],
        getAngle: [this._style?.orientation],
      },
    } as never);
  }

  private _buildPath(_binary: boolean): DeckGLLayer {
    const extensions = [new DataFilterExtension({ filterSize: 1 })];

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

    const widthPixels = this._style?.iconSize ?? Config.path.widthMinPixels;

    return new PathLayer({
      id: this.meta.id,
      data,
      getPath: (d: PathDatum) => d.path,
      getColor: this._colorAccessor
        ? ((d: PathDatum) => this._getColor(d.source))
        : this.color,
      widthMinPixels: widthPixels,
      widthMaxPixels: Math.max(widthPixels, Config.path.widthMaxPixels),
      opacity: this.meta.opacity,
      pickable: Config.path.pickable,
      extensions,
      getFilterValue: (d: PathDatum) => this._getFilterValue(d.source),
      filterRange: this._filterRange,
      updateTriggers: {
        getFilterValue: [this._filterRange],
        getColor: [this._style?.color],
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
      getFillColor: this._colorAccessor
        ? ((d: PolygonFeature) => this._getColor(d))
        : this.color,
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
        getFillColor: [this._style?.color],
      },
    } as never);
  }

  private _buildLabelLayer(): DeckGLLayer | null {
    const lbl = this._style?.label;
    if (!lbl || lbl.mode === 'none') return null;
    if (this.geoType !== 'point') return null;

    const fontSize = lbl.fontSize ?? 12;

    return new TextLayer({
      id: `${this.meta.id}-labels`,
      data: this._data,
      getPosition: (d: PointFeature) => d.geometry.coordinates as [number, number],
      getText: lbl.mode === 'static'
        ? () => lbl.staticText ?? ''
        : (d: Feature) => String(d.properties?.[lbl.field!] ?? ''),
      getSize: fontSize,
      getColor: [255, 255, 255, 220],
      getAngle: 0,
      getTextAnchor: 'middle' as const,
      getAlignmentBaseline: 'top' as const,
      getPixelOffset: [0, 12],
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 600,
      opacity: this.meta.opacity,
      pickable: false,
      updateTriggers: {
        getText: [lbl.mode, lbl.field, lbl.staticText],
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
