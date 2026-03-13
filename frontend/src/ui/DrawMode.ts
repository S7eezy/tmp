// ---------------------------------------------------------------------------
// DrawMode – draw polygon on the map for geo filters.
// ---------------------------------------------------------------------------

import type { MapEngine } from '@core/map';
import type { FilterPanel } from '@filters';
import type { Feature } from 'geojson';

export class DrawMode {
  private _active = false;
  private _points: Array<[number, number]> = [];
  private _engine: MapEngine;
  private _getFilterPanel: () => FilterPanel | null;

  private readonly _sourceId = 'draw-polygon-source';
  private readonly _layerId = 'draw-polygon-layer';
  private readonly _pointsLayerId = 'draw-polygon-points';

  constructor(engine: MapEngine, getFilterPanel: () => FilterPanel | null) {
    this._engine = engine;
    this._getFilterPanel = getFilterPanel;
  }

  get isActive(): boolean {
    return this._active;
  }

  start(): void {
    this._active = true;
    this._points = [];
    document.body.classList.add('draw-mode');

    if (!this._engine.map.getSource(this._sourceId)) {
      this._engine.map.addSource(this._sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this._engine.map.addLayer({
        id: this._layerId,
        type: 'fill',
        source: this._sourceId,
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 },
      });
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

    if (this._points.length >= 3) {
      const panel = this._getFilterPanel();
      if (panel) panel.setPolygonPoints([...this._points]);
    }

    if (this._engine.map.getLayer(this._layerId)) this._engine.map.removeLayer(this._layerId);
    if (this._engine.map.getLayer(this._pointsLayerId)) this._engine.map.removeLayer(this._pointsLayerId);
    if (this._engine.map.getSource(this._sourceId)) this._engine.map.removeSource(this._sourceId);
  }

  /** Attach map click/dblclick handlers. Call once during setup. */
  setupEvents(): void {
    this._engine.map.on('click', (e) => {
      if (!this._active) return;
      this._points.push([e.lngLat.lng, e.lngLat.lat]);
      this._updateLayer();
    });

    this._engine.map.on('dblclick', (e) => {
      if (!this._active) return;
      e.preventDefault();
      this.finish();
    });
  }

  private _updateLayer(): void {
    const source = this._engine.map.getSource(this._sourceId);
    if (!source || !('setData' in source)) return;

    const features: Feature[] = [];

    for (const pt of this._points) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: {} });
    }

    if (this._points.length >= 3) {
      const ring = [...this._points, this._points[0]];
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} });
    } else if (this._points.length >= 2) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: this._points }, properties: {} });
    }

    (source as unknown as { setData: (d: unknown) => void }).setData({ type: 'FeatureCollection', features });
  }
}
