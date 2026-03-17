// ---------------------------------------------------------------------------
// SearchPanel – full-text search across all data sources (dropdown UI).
// Hover on a result → tooltip + fly-to. Click → pin tooltip + close search.
// ---------------------------------------------------------------------------

import type { MapEngine } from '@core/map';
import type { DataStore } from '@core/data';
import type { FeatureTooltip } from './FeatureTooltip';

export class SearchPanel {
  private _engine: MapEngine;
  private _dataStore: DataStore;
  private _tooltip: FeatureTooltip;

  constructor(engine: MapEngine, dataStore: DataStore, tooltip: FeatureTooltip) {
    this._engine = engine;
    this._dataStore = dataStore;
    this._tooltip = tooltip;
  }

  setup(): void {
    const input = document.getElementById('search-input') as HTMLInputElement;
    const results = document.getElementById('search-results')!;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      results.innerHTML = '';

      if (q.length < 2) return;

      let hitCount = 0;
      for (const sourceId of this._dataStore.allSourceIds()) {
        if (hitCount >= 50) break;
        const features = this._dataStore.get(sourceId);
        for (const f of features) {
          if (hitCount >= 50) break;
          const props = f.properties ?? {};
          const match = Object.values(props).some(v =>
            v != null && String(v).toLowerCase().includes(q),
          );
          if (match) {
            hitCount++;
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `<span class="search-result-source">${sourceId}</span> <span class="search-result-name">${props.name || props._id || 'unnamed'}</span>`;

            // ── Hover → tooltip + fly-to ─────────────────────────────
            item.addEventListener('mouseenter', () => {
              // Fly to feature
              if (f.geometry.type === 'Point') {
                const [lng, lat] = f.geometry.coordinates as [number, number];
                this._engine.flyTo([lng, lat], 8);
              }

              // Show tooltip positioned to the right of the search result item
              const rect = item.getBoundingClientRect();
              this._tooltip.showFor({
                x: rect.right + 8,
                y: rect.top,
                feature: f,
                sourceId,
              });
            });

            item.addEventListener('mouseleave', () => {
              this._tooltip.dismiss();
            });

            // ── Click → pin tooltip + close search ───────────────────
            item.addEventListener('click', () => {
              if (f.geometry.type === 'Point') {
                const [lng, lat] = f.geometry.coordinates as [number, number];
                this._engine.flyTo([lng, lat], 8);
              }
              const center = this._engine.map.project(
                f.geometry.type === 'Point'
                  ? (f.geometry.coordinates as [number, number])
                  : [0, 0],
              );
              this._tooltip.showFor({ x: center.x, y: center.y, feature: f, sourceId });

              // Close search dropdown
              document.getElementById('search-dropdown')?.classList.remove('is-open');
            });

            results.appendChild(item);
          }
        }
      }

      if (hitCount === 0) {
        results.innerHTML = '<div class="search-no-results">No results found</div>';
      }
    });
  }
}
