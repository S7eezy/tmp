// ---------------------------------------------------------------------------
// DataConfigModal – popup to configure which ES indexes appear in the DATA
// section of the side panel. Shows all discovered indexes with doc counts
// and allows toggling visibility. Persists config to Elasticsearch.
// ---------------------------------------------------------------------------

import type { ElasticClient, EsIndexInfo } from '@core/data';
import type { HiddenIndexes } from './SidePanel';

/** Warn icon SVG for indexes with no geo field. */
const WARN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--ft-warn, #e6a817)" stroke-width="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

// ---------------------------------------------------------------------------
// ES persistence helpers
// ---------------------------------------------------------------------------

const CONFIG_INDEX = '.fleettracker-config';
const CONFIG_DOC_ID = 'data-visibility';

export interface DataVisibilityConfig {
  /** Index names that are hidden from the DATA panel. */
  hiddenIndexes: string[];
}

// ---------------------------------------------------------------------------
// DataConfigModal
// ---------------------------------------------------------------------------

export class DataConfigModal {
  private _esClient: ElasticClient;
  private _allIndices: EsIndexInfo[] = [];
  private _hiddenIndexes: HiddenIndexes;
  private _onSave: (hidden: HiddenIndexes) => void;
  private _geoFieldsCache: Map<string, string[]>;

  constructor(opts: {
    esClient: ElasticClient;
    hiddenIndexes: HiddenIndexes;
    onSave: (hidden: HiddenIndexes) => void;
    geoFieldsCache?: Map<string, string[]>;
  }) {
    this._esClient = opts.esClient;
    this._hiddenIndexes = opts.hiddenIndexes;
    this._onSave = opts.onSave;
    this._geoFieldsCache = opts.geoFieldsCache ?? new Map();
  }

  /** Update the reference to all known indices (call after boot). */
  setIndices(indices: EsIndexInfo[]): void {
    this._allIndices = indices;
  }

  // -- ES persistence ----------------------------------------------------

  /** Load hidden indexes config from ES. Returns a Set of hidden index names. */
  async loadConfig(): Promise<HiddenIndexes> {
    try {
      const res = await fetch(
        `${this._esClient.baseUrl}/${CONFIG_INDEX}/_doc/${CONFIG_DOC_ID}`,
      );
      if (res.ok) {
        const doc = await res.json();
        const cfg = doc._source as DataVisibilityConfig;
        return new Set(cfg.hiddenIndexes ?? []);
      }
    } catch {
      // Config index doesn't exist yet – that's fine
    }
    return new Set();
  }

  /** Save hidden indexes config to ES (shared across all users). */
  async saveConfig(hidden: HiddenIndexes): Promise<void> {
    const body: DataVisibilityConfig = {
      hiddenIndexes: [...hidden],
    };

    // Ensure config index exists (only create if missing)
    try {
      const head = await fetch(`${this._esClient.baseUrl}/${CONFIG_INDEX}`, { method: 'HEAD' });
      if (!head.ok) {
        await fetch(`${this._esClient.baseUrl}/${CONFIG_INDEX}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: { number_of_shards: 1, number_of_replicas: 0 },
          }),
        });
      }
    } catch {
      // Ignore – ES might be unreachable
    }

    const res = await fetch(
      `${this._esClient.baseUrl}/${CONFIG_INDEX}/_doc/${CONFIG_DOC_ID}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      console.error('[DataConfigModal] Failed to save config:', res.status);
    }
  }

  // -- UI ----------------------------------------------------------------

  async open(): Promise<void> {
    // Refresh the full index list before opening
    try {
      this._allIndices = await this._esClient.listIndices();
    } catch (err) {
      console.warn('[DataConfigModal] Could not refresh index list:', err);
    }

    const overlay = document.getElementById('settings-overlay')!;
    const titleEl = document.getElementById('settings-title')!;
    const bodyEl = document.getElementById('settings-body')!;

    titleEl.textContent = 'Configure Data Sources';
    bodyEl.innerHTML = '';

    // Work on a local copy so we can cancel
    const localHidden = new Set(this._hiddenIndexes);

    // Hint text
    const info = document.createElement('p');
    info.className = 'settings-hint';
    info.textContent = 'Toggle which Elasticsearch indexes are visible in the DATA list:';
    bodyEl.appendChild(info);

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'settings-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'settings-search';
    searchInput.placeholder = 'Search indexes...';
    searchWrap.appendChild(searchInput);
    bodyEl.appendChild(searchWrap);

    // Index list
    const list = document.createElement('div');
    list.className = 'data-config-list';

    const renderList = (filter: string) => {
      list.innerHTML = '';
      const q = filter.toLowerCase();
      let matchCount = 0;

      for (const idx of this._allIndices) {
        if (q && !idx.index.toLowerCase().includes(q)) continue;
        matchCount++;

        const item = document.createElement('div');
        item.className = 'data-config-item';

        const isVisible = !localHidden.has(idx.index);

        const toggle = document.createElement('div');
        toggle.className = 'sp-row__toggle' + (isVisible ? ' sp-row__toggle--on' : '');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'data-config-name';
        nameSpan.textContent = idx.index;

        const countSpan = document.createElement('span');
        countSpan.className = 'data-config-count';
        countSpan.textContent = fmtCount(idx.docsCount) + ' docs';

        // Show warning icon if index has no geo fields
        const geoFields = this._geoFieldsCache.get(idx.index);
        if (geoFields && geoFields.length === 0) {
          const warn = document.createElement('span');
          warn.className = 'data-config-warn';
          warn.title = 'No compatible geo field – cannot be mapped';
          warn.innerHTML = WARN_SVG;
          item.append(toggle, nameSpan, warn, countSpan);
        } else {
          item.append(toggle, nameSpan, countSpan);
        }

        item.addEventListener('click', () => {
          if (localHidden.has(idx.index)) {
            localHidden.delete(idx.index);
            toggle.classList.add('sp-row__toggle--on');
            item.classList.remove('data-config-item--off');
          } else {
            localHidden.add(idx.index);
            toggle.classList.remove('sp-row__toggle--on');
            item.classList.add('data-config-item--off');
          }
        });

        if (!isVisible) {
          item.classList.add('data-config-item--off');
        }

        list.appendChild(item);
      }

      if (matchCount === 0) {
        const empty = document.createElement('div');
        empty.className = 'sp-empty';
        empty.textContent = q ? 'No matching indexes' : 'No Elasticsearch indexes found';
        list.appendChild(empty);
      }
    };

    searchInput.addEventListener('input', () => renderList(searchInput.value));
    renderList('');

    bodyEl.appendChild(list);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'data-config-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'data-config-btn data-config-btn--ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    const saveBtn = document.createElement('button');
    saveBtn.className = 'data-config-btn data-config-btn--primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      // Update state
      this._hiddenIndexes = new Set(localHidden);
      this._onSave(this._hiddenIndexes);

      // Persist to ES
      try {
        await this.saveConfig(this._hiddenIndexes);
      } catch (err) {
        console.error('[DataConfigModal] Failed to persist config:', err);
      }

      overlay.style.display = 'none';
    });

    actions.append(cancelBtn, saveBtn);
    bodyEl.appendChild(actions);

    // Show
    overlay.style.display = 'flex';

    // Close handlers
    document.getElementById('settings-close')!.onclick = () => {
      overlay.style.display = 'none';
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}
