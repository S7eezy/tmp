// ---------------------------------------------------------------------------
// FeatureTooltip – persistent click-to-inspect tooltip for map features.
// ---------------------------------------------------------------------------

import type { MapEngine } from '@core/map';
import type { DataStore } from '@core/data';
import type { SettingsModal } from './SettingsModal';
import type { Feature } from 'geojson';

export interface PinnedTooltip {
  x: number;
  y: number;
  feature: Feature;
  sourceId: string;
}

export class FeatureTooltip {
  private _pinned: PinnedTooltip | null = null;
  private _tooltipEl: HTMLElement;
  private _engine: MapEngine;
  private _dataStore: DataStore;
  private _settings: SettingsModal;

  constructor(engine: MapEngine, dataStore: DataStore, settings: SettingsModal) {
    this._tooltipEl = document.getElementById('feature-tooltip')!;
    this._engine = engine;
    this._dataStore = dataStore;
    this._settings = settings;
  }

  get pinned(): PinnedTooltip | null {
    return this._pinned;
  }

  setup(): void {
    this._engine.map.getCanvas().addEventListener('click', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(
        '.side-panel, .filter-panel, .search-panel, .toolbar, .settings-overlay',
      )) return;

      const point = { x: e.offsetX, y: e.offsetY };
      const lngLat = this._engine.map.unproject([point.x, point.y]);

      let bestFeature: Feature | null = null;
      let bestSourceId = '';
      let bestDist = Infinity;

      for (const sourceId of this._dataStore.allSourceIds()) {
        const features = this._dataStore.get(sourceId);
        for (const f of features) {
          if (f.geometry.type === 'Point') {
            const [fLng, fLat] = f.geometry.coordinates as [number, number];
            const projected = this._engine.map.project([fLng, fLat]);
            const dx = projected.x - point.x;
            const dy = projected.y - point.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 20 && dist < bestDist) {
              bestDist = dist;
              bestFeature = f;
              bestSourceId = sourceId;
            }
          } else if (f.geometry.type === 'Polygon') {
            const coords = f.geometry.coordinates[0] as [number, number][];
            if (pointInPoly([lngLat.lng, lngLat.lat], coords)) {
              bestFeature = f;
              bestSourceId = sourceId;
              bestDist = 0;
            }
          }
        }
      }

      if (bestFeature) {
        this._pinned = { x: e.clientX, y: e.clientY, feature: bestFeature, sourceId: bestSourceId };
        this._show(this._pinned);
      } else {
        this._pinned = null;
        this._tooltipEl.classList.remove('visible');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._pinned) {
        this._pinned = null;
        this._tooltipEl.classList.remove('visible');
      }
    });
  }

  /** Programmatically show a tooltip (e.g. from search results). */
  showFor(info: PinnedTooltip): void {
    this._pinned = info;
    this._show(info);
  }

  private _show(info: PinnedTooltip): void {
    const { feature, sourceId } = info;
    const props = feature.properties ?? {};
    const el = this._tooltipEl;

    const config = this._settings.getConfig(sourceId);
    const entries = Object.entries(props).filter(([key]) => {
      return config.attributes[key] !== false;
    });

    el.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'ft-tooltip-header';
    header.textContent = props.name || props._id || sourceId;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ft-tooltip-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => {
      this._pinned = null;
      el.classList.remove('visible');
    });
    header.appendChild(closeBtn);
    el.appendChild(header);

    // Source badge
    const srcBadge = document.createElement('div');
    srcBadge.className = 'ft-tooltip-source';
    srcBadge.textContent = sourceId;
    el.appendChild(srcBadge);

    // Attribute rows
    const body = document.createElement('div');
    body.className = 'ft-tooltip-body';
    for (const [key, val] of entries) {
      if (key === '_id') continue;
      const row = document.createElement('div');
      row.className = 'ft-tooltip-row';
      const k = document.createElement('span');
      k.className = 'ft-tooltip-key';
      k.textContent = key;
      const v = document.createElement('span');
      v.className = 'ft-tooltip-val';
      if (key.match(/time|date|stamp/i) && typeof val === 'number') {
        v.textContent = new Date(val).toLocaleString();
      } else if (typeof val === 'number') {
        v.textContent = val.toFixed(2);
      } else {
        v.textContent = String(val);
      }
      row.append(k, v);
      body.appendChild(row);
    }
    el.appendChild(body);

    // Position
    el.style.left = `${Math.min(info.x + 12, window.innerWidth - 300)}px`;
    el.style.top = `${Math.min(info.y - 10, window.innerHeight - 250)}px`;
    el.classList.add('visible');
  }
}

// ---------------------------------------------------------------------------
// Geometry helper
// ---------------------------------------------------------------------------

function pointInPoly(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  const [px, py] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
