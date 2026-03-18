// ---------------------------------------------------------------------------
// SettingsModal – per-index attribute configuration for tooltips.
//
// Features:
//   1. Timestamp field picker – select which field is used for time filtering
//   2. Attribute visibility toggles – show/hide attributes in tooltips
//   3. Drag-to-reorder – change the display order of attributes in tooltips
// ---------------------------------------------------------------------------

import type { DataStore, ApiClient } from '@core/data';
import type { IndexAttributeConfig } from '@filters/types';
import type { Feature } from 'geojson';
import { Config } from '../config';

export interface SettingsModalOpts {
  onTimestampFieldChange?: (sourceId: string, field: string) => void;
  apiClient?: ApiClient;
}

const CONFIG_DOC_ID = 'index-settings';

export class SettingsModal {
  private _attrConfigs = new Map<string, IndexAttributeConfig>();
  private _dataStore: DataStore;
  private _rawData: Map<string, Feature[]>;
  private _onTimestampFieldChange?: (sourceId: string, field: string) => void;
  private _apiClient?: ApiClient;
  /** Track which source is currently being edited (for save on close). */
  private _editingSourceId: string | null = null;

  constructor(dataStore: DataStore, rawData: Map<string, Feature[]>, opts?: SettingsModalOpts) {
    this._dataStore = dataStore;
    this._rawData = rawData;
    this._onTimestampFieldChange = opts?.onTimestampFieldChange;
    this._apiClient = opts?.apiClient;
  }

  // ── Backend persistence ─────────────────────────────────────────────────

  /** Load all saved index configs from backend. Call once at boot. */
  async loadConfigs(): Promise<void> {
    try {
      const res = await fetch(`${Config.apiBaseUrl}/config/${CONFIG_DOC_ID}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.configs)) {
        for (const cfg of data.configs as IndexAttributeConfig[]) {
          this._attrConfigs.set(cfg.indexId, cfg);
          // Restore timestamp field into FilterEngine
          if (cfg.timestampField && this._onTimestampFieldChange) {
            this._onTimestampFieldChange(cfg.indexId, cfg.timestampField);
          }
        }
      }
    } catch {
      // Config not yet saved — ignore
    }
  }

  /** Persist all configs to backend. */
  private async _saveConfigs(): Promise<void> {
    try {
      const configs = [...this._attrConfigs.values()];
      await fetch(`${Config.apiBaseUrl}/config/${CONFIG_DOC_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs }),
      });
    } catch (err) {
      console.warn('[SettingsModal] Failed to persist configs:', err);
    }
  }

  /** Get attribute config for a source (creates default if missing). */
  getConfig(sourceId: string): IndexAttributeConfig {
    let config = this._attrConfigs.get(sourceId);
    if (!config) {
      config = { indexId: sourceId, attributes: {}, fieldOrder: [] };
      this._attrConfigs.set(sourceId, config);
    }
    // Ensure fieldOrder exists (for configs created before this feature)
    if (!config.fieldOrder) {
      config.fieldOrder = Object.keys(config.attributes);
    }
    // Refresh fields from data if the config has no fields yet
    this._refreshFieldsFromData(config, sourceId);
    return config;
  }

  /**
   * If the config has no fields, try to populate from rawData/dataStore features.
   * This handles the case where getConfig was first called before data was loaded.
   */
  private _refreshFieldsFromData(config: IndexAttributeConfig, sourceId: string): void {
    if (config.fieldOrder && config.fieldOrder.length > 0) return;

    const features = this._rawData.get(sourceId) ?? this._dataStore.get(sourceId);
    if (!features || features.length === 0) return;

    // Collect ALL unique property keys from first N features (not just the first)
    const allKeys = new Set<string>();
    const sampleSize = Math.min(features.length, 20);
    for (let i = 0; i < sampleSize; i++) {
      const props = features[i]?.properties;
      if (props) for (const key of Object.keys(props)) allKeys.add(key);
    }

    for (const key of allKeys) {
      if (!(key in config.attributes)) {
        config.attributes[key] = true;
        config.fieldOrder!.push(key);
      }
    }
  }

  async open(sourceId: string): Promise<void> {
    // Save previous source config if any
    if (this._editingSourceId) {
      this._saveConfigs();
    }
    this._editingSourceId = sourceId;

    const overlay = document.getElementById('settings-overlay')!;
    const titleEl = document.getElementById('settings-title')!;
    const bodyEl = document.getElementById('settings-body')!;

    titleEl.textContent = `Settings: ${sourceId}`;
    bodyEl.innerHTML = '<div class="sm-hint" style="padding:16px;text-align:center">Loading fields…</div>';
    overlay.style.display = 'flex';

    const config = this.getConfig(sourceId);

    // Fetch mapping from API to ensure ALL fields are available
    if (this._apiClient) {
      try {
        const mapping = await this._apiClient.getMapping(sourceId);
        const mappingFields = Object.keys(mapping);
        for (const key of mappingFields) {
          if (!(key in config.attributes)) {
            config.attributes[key] = true;
            config.fieldOrder!.push(key);
          }
        }
      } catch {
        // Mapping fetch failed — fall back to feature-based fields (already populated)
      }
    }

    bodyEl.innerHTML = '';

    // ── Timestamp field picker ────────────────────────────────────────────
    const tsSection = document.createElement('div');
    tsSection.className = 'sm-section';

    const tsLabel = document.createElement('label');
    tsLabel.className = 'sm-section-label';
    tsLabel.textContent = 'Timestamp field';

    const tsHint = document.createElement('span');
    tsHint.className = 'sm-hint';
    tsHint.textContent = 'Used by the time filter for this index';

    const tsSelect = document.createElement('select');
    tsSelect.className = 'sm-select fp-input';

    // Add "None" option
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— none —';
    tsSelect.appendChild(noneOpt);

    // Detect date-like fields from first feature
    const allFields = config.fieldOrder ?? Object.keys(config.attributes);
    for (const field of allFields) {
      const opt = document.createElement('option');
      opt.value = field;
      opt.textContent = field;
      if (field === (config.timestampField ?? 'timestamp')) opt.selected = true;
      tsSelect.appendChild(opt);
    }
    // If no match was selected, check if 'timestamp' exists
    if (!config.timestampField && tsSelect.value !== 'timestamp') {
      // No "timestamp" field in the data — leave as "none"
      tsSelect.value = '';
    }

    tsSelect.addEventListener('change', () => {
      config.timestampField = tsSelect.value || undefined;
      if (this._onTimestampFieldChange && tsSelect.value) {
        this._onTimestampFieldChange(sourceId, tsSelect.value);
      }
      this._saveConfigs();
    });

    tsSection.append(tsLabel, tsHint, tsSelect);
    bodyEl.appendChild(tsSection);

    // ── Separator ─────────────────────────────────────────────────────────
    const sep = document.createElement('div');
    sep.className = 'sm-separator';
    bodyEl.appendChild(sep);

    // ── Attribute ordering + visibility ───────────────────────────────────
    const attrSection = document.createElement('div');
    attrSection.className = 'sm-section';

    const attrLabel = document.createElement('label');
    attrLabel.className = 'sm-section-label';
    attrLabel.textContent = 'Tooltip fields';

    const attrHint = document.createElement('span');
    attrHint.className = 'sm-hint';
    attrHint.textContent = 'Drag to reorder, toggle visibility';

    attrSection.append(attrLabel, attrHint);

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'settings-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'settings-search fp-input';
    searchInput.placeholder = 'Search attributes...';
    searchWrap.appendChild(searchInput);
    attrSection.appendChild(searchWrap);

    const list = document.createElement('div');
    list.className = 'sm-attr-list';

    // Working copy of ordered entries
    const orderedFields = [...(config.fieldOrder ?? Object.keys(config.attributes))];

    // Drag state
    let dragIdx: number | null = null;

    const renderList = (filter: string) => {
      list.innerHTML = '';
      const q = filter.toLowerCase();

      for (let i = 0; i < orderedFields.length; i++) {
        const attr = orderedFields[i];
        if (q && !attr.toLowerCase().includes(q)) continue;

        const visible = config.attributes[attr] ?? true;

        const item = document.createElement('div');
        item.className = 'sm-attr-item';
        item.draggable = !q; // Disable drag when filtering
        item.dataset.idx = String(i);

        // Drag handle
        const handle = document.createElement('span');
        handle.className = 'sm-drag-handle';
        handle.textContent = '\u2261'; // ≡ hamburger symbol
        handle.title = 'Drag to reorder';

        // Checkbox
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = visible;
        cb.className = 'sm-attr-cb';
        cb.addEventListener('change', () => {
          config.attributes[attr] = cb.checked;
          this._saveConfigs();
        });

        // Label
        const nameSpan = document.createElement('span');
        nameSpan.className = 'sm-attr-name';
        nameSpan.textContent = attr;

        item.append(handle, cb, nameSpan);

        // ── Drag events ──────────────────────────────────────────────
        item.addEventListener('dragstart', (e) => {
          dragIdx = i;
          item.classList.add('sm-dragging');
          e.dataTransfer!.effectAllowed = 'move';
          // Needed for Firefox
          e.dataTransfer!.setData('text/plain', '');
        });

        item.addEventListener('dragend', () => {
          item.classList.remove('sm-dragging');
          dragIdx = null;
          list.querySelectorAll('.sm-drag-over').forEach(el =>
            el.classList.remove('sm-drag-over'),
          );
        });

        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer!.dropEffect = 'move';
          // Visual indicator
          list.querySelectorAll('.sm-drag-over').forEach(el =>
            el.classList.remove('sm-drag-over'),
          );
          item.classList.add('sm-drag-over');
        });

        item.addEventListener('dragleave', () => {
          item.classList.remove('sm-drag-over');
        });

        item.addEventListener('drop', (e) => {
          e.preventDefault();
          item.classList.remove('sm-drag-over');
          const targetIdx = parseInt(item.dataset.idx!, 10);
          if (dragIdx !== null && dragIdx !== targetIdx) {
            // Move the dragged item to the target position
            const [moved] = orderedFields.splice(dragIdx, 1);
            orderedFields.splice(targetIdx, 0, moved);
            // Update config
            config.fieldOrder = [...orderedFields];
            // Re-render + persist
            renderList(searchInput.value);
            this._saveConfigs();
          }
        });

        list.appendChild(item);
      }

      if (list.children.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sm-hint';
        empty.textContent = 'No matching attributes';
        list.appendChild(empty);
      }
    };

    searchInput.addEventListener('input', () => renderList(searchInput.value));
    renderList('');

    attrSection.appendChild(list);
    bodyEl.appendChild(attrSection);

    // overlay already visible from the loading state above

    const closeModal = () => {
      overlay.style.display = 'none';
      this._editingSourceId = null;
      this._saveConfigs();
    };
    document.getElementById('settings-close')!.onclick = closeModal;
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  }
}
