// ---------------------------------------------------------------------------
// DrawMode – draw a polygon or bounding box on the map for geo filters.
// ---------------------------------------------------------------------------

import type { MapEngine } from '@core/map';
import type { FilterPanel } from '@filters';
import type { Feature } from 'geojson';

export type DrawModeType = 'polygon' | 'bbox';

export class DrawMode {
  private _active = false;
  private _mode: DrawModeType = 'polygon';
  private _points: Array<[number, number]> = [];
  private _engine: MapEngine;
  private _getFilterPanel: () => FilterPanel | null;

  private readonly _sourceId      = 'draw-source';
  private readonly _fillLayerId   = 'draw-fill';
  private readonly _lineLayerId   = 'draw-line';
  private readonly _pointsLayerId = 'draw-points';

  constructor(engine: MapEngine, getFilterPanel: () => FilterPanel | null) {
    this._engine = engine;
    this._getFilterPanel = getFilterPanel;
  }

  get isActive(): boolean {
    return this._active;
  }

  start(mode: DrawModeType = 'polygon'): void {
    this._active = true;
    this._mode = mode;
    this._points = [];
    document.body.classList.add('draw-mode');

    if (!this._engine.map.getSource(this._sourceId)) {
      this._engine.map.addSource(this._sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Polygon fill
      this._engine.map.addLayer({
        id: this._fillLayerId,
        type: 'fill',
        source: this._sourceId,
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 },
      });
      // Polygon / line outline
      this._engine.map.addLayer({
        id: this._lineLayerId,
        type: 'line',
        source: this._sourceId,
        filter: ['any', ['==', '$type', 'Polygon'], ['==', '$type', 'LineString']],
        paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-dasharray': [4, 2] },
      });
      // Vertex dots
      this._engine.map.addLayer({
        id: this._pointsLayerId,
        type: 'circle',
        source: this._sourceId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#3b82f6',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
    }

    this._updateLayer();
  }

  finish(): void {
    this._active = false;
    document.body.classList.remove('draw-mode');

    const panel = this._getFilterPanel();

    if (this._mode === 'bbox' && this._points.length === 2) {
      if (panel) panel.setBboxPoints(this._points[0], this._points[1]);
    } else if (this._mode === 'polygon') {
      // MapLibre fires two 'click' events before 'dblclick'; remove the
      // trailing duplicate that the second click in a double-click creates.
      const pts = this._points;
      if (pts.length >= 2) {
        const [ax, ay] = pts[pts.length - 2];
        const [bx, by] = pts[pts.length - 1];
        if (ax === bx && ay === by) pts.pop();
      }
      if (pts.length >= 3 && panel) panel.setPolygonPoints([...pts]);
    }

    if (this._engine.map.getLayer(this._fillLayerId))   this._engine.map.removeLayer(this._fillLayerId);
    if (this._engine.map.getLayer(this._lineLayerId))   this._engine.map.removeLayer(this._lineLayerId);
    if (this._engine.map.getLayer(this._pointsLayerId)) this._engine.map.removeLayer(this._pointsLayerId);
    if (this._engine.map.getSource(this._sourceId))     this._engine.map.removeSource(this._sourceId);
  }

  /** Attach canvas and map event handlers. Call once during setup. */
  setupEvents(): void {
    const canvas = this._engine.map.getCanvas();

    // Use direct canvas click to bypass deck.gl event interception
    canvas.addEventListener('click', (e: MouseEvent) => {
      if (!this._active) return;
      const lngLat = this._engine.map.unproject([e.offsetX, e.offsetY]);
      const coord: [number, number] = [lngLat.lng, lngLat.lat];

      this._points.push(coord);

      if (this._mode === 'bbox' && this._points.length === 2) {
        this.finish();
      } else {
        this._updateLayer();
      }
    });

    // Live bbox rectangle preview as cursor moves after first corner
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this._active || this._mode !== 'bbox' || this._points.length !== 1) return;
      const lngLat = this._engine.map.unproject([e.offsetX, e.offsetY]);
      this._setSourceData(this._bboxFeatures(this._points[0], [lngLat.lng, lngLat.lat]));
    });

    // Double-click finishes polygon (dblclick fires after two clicks, so the
    // duplicate second-click vertex is cleaned up in finish())
    this._engine.map.on('dblclick', (e) => {
      if (!this._active || this._mode !== 'polygon') return;
      e.preventDefault();
      this.finish();
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _updateLayer(): void {
    const features: Feature[] = this._points.map(pt => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: pt },
      properties: {},
    }));

    if (this._mode === 'polygon') {
      if (this._points.length >= 3) {
        const ring = [...this._points, this._points[0]];
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: {},
        });
      } else if (this._points.length === 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: this._points },
          properties: {},
        });
      }
    }

    this._setSourceData(features);
  }

  private _bboxFeatures(a: [number, number], b: [number, number]): Feature[] {
    const minLng = Math.min(a[0], b[0]), maxLng = Math.max(a[0], b[0]);
    const minLat = Math.min(a[1], b[1]), maxLat = Math.max(a[1], b[1]);
    const ring: [number, number][] = [
      [minLng, maxLat], [maxLng, maxLat],
      [maxLng, minLat], [minLng, minLat],
      [minLng, maxLat],
    ];
    return [
      { type: 'Feature', geometry: { type: 'Point', coordinates: a }, properties: {} },
      { type: 'Feature', geometry: { type: 'Point', coordinates: b }, properties: {} },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} },
    ];
  }

  private _setSourceData(features: Feature[]): void {
    const source = this._engine.map.getSource(this._sourceId);
    if (!source || !('setData' in source)) return;
    (source as unknown as { setData: (d: unknown) => void }).setData({
      type: 'FeatureCollection',
      features,
    });
  }
}
