// ---------------------------------------------------------------------------
// Hud – HUD badges + live coordinates display.
// ---------------------------------------------------------------------------

import type { MapEngine } from '@core/map';
import type { DataStore } from '@core/data';

export class Hud {
  private _engine: MapEngine;
  private _dataStore: DataStore;

  constructor(engine: MapEngine, dataStore: DataStore) {
    this._engine = engine;
    this._dataStore = dataStore;
  }

  updateFeatureCount(): void {
    const el = document.querySelector('#hud-features strong');
    if (el) el.textContent = this._dataStore.totalFeatures().toLocaleString();
  }

  setupCoords(): void {
    const latEl = document.getElementById('coords-lat')!;
    const lngEl = document.getElementById('coords-lng')!;

    this._engine.map.on('mousemove', (e) => {
      const { lng, lat } = e.lngLat;
      latEl.textContent = lat.toFixed(4);
      lngEl.textContent = lng.toFixed(4);
    });

    this._engine.map.getCanvas().addEventListener('mouseleave', () => {
      latEl.textContent = '\u2014';
      lngEl.textContent = '\u2014';
    });
  }

  setupCursorTooltip(): void {
    const el = document.getElementById('tooltip')!;
    this._engine.map.getCanvas().addEventListener('mousemove', (e: MouseEvent) => {
      el.style.left = `${e.clientX + 12}px`;
      el.style.top = `${e.clientY + 12}px`;
    });
  }
}
