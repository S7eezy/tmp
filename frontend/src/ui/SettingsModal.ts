// ---------------------------------------------------------------------------
// SettingsModal – per-index attribute visibility configuration for tooltips.
// ---------------------------------------------------------------------------

import type { DataStore } from '@core/data';
import type { IndexAttributeConfig } from '@filters/types';
import type { Feature } from 'geojson';

export class SettingsModal {
  private _attrConfigs = new Map<string, IndexAttributeConfig>();
  private _dataStore: DataStore;
  private _rawData: Map<string, Feature[]>;

  constructor(dataStore: DataStore, rawData: Map<string, Feature[]>) {
    this._dataStore = dataStore;
    this._rawData = rawData;
  }

  /** Get attribute config for a source (creates default if missing). */
  getConfig(sourceId: string): IndexAttributeConfig {
    let config = this._attrConfigs.get(sourceId);
    if (!config) {
      const features = this._rawData.get(sourceId) ?? this._dataStore.get(sourceId);
      const attrs: Record<string, boolean> = {};
      if (features.length > 0 && features[0].properties) {
        for (const key of Object.keys(features[0].properties)) {
          attrs[key] = true;
        }
      }
      config = { indexId: sourceId, attributes: attrs };
      this._attrConfigs.set(sourceId, config);
    }
    return config;
  }

  open(sourceId: string): void {
    const overlay = document.getElementById('settings-overlay')!;
    const titleEl = document.getElementById('settings-title')!;
    const bodyEl = document.getElementById('settings-body')!;

    titleEl.textContent = `Tooltip: ${sourceId}`;
    bodyEl.innerHTML = '';

    const config = this.getConfig(sourceId);

    const info = document.createElement('p');
    info.className = 'settings-hint';
    info.textContent = 'Toggle which attributes appear in the tooltip when clicking features:';
    bodyEl.appendChild(info);

    const list = document.createElement('div');
    list.className = 'settings-attr-list';

    for (const [attr, visible] of Object.entries(config.attributes)) {
      const item = document.createElement('label');
      item.className = 'settings-attr-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = visible;
      cb.addEventListener('change', () => {
        const cfg = this._attrConfigs.get(sourceId);
        if (cfg) cfg.attributes[attr] = cb.checked;
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = attr;

      item.append(cb, nameSpan);
      list.appendChild(item);
    }

    bodyEl.appendChild(list);
    overlay.style.display = 'flex';

    document.getElementById('settings-close')!.onclick = () => { overlay.style.display = 'none'; };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
  }
}
