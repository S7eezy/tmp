// ---------------------------------------------------------------------------
// SidePanel – renders Layers / Tiles / Data sections in the right panel.
// ---------------------------------------------------------------------------

import type { LayerRegistry, DeckLayerAdapter, WmsLayerAdapter, GeoType } from '@core/layers';
import type { DataStore } from '@core/data';
import { geoIcon, tileIcon } from './icons';

export interface SidePanelDeps {
  layerRegistry: LayerRegistry;
  dataStore: DataStore;
  onOpenSettings: (sourceId: string) => void;
  onOpenDataConfig: () => void;
  onOpenStyleEditor: (sourceId: string) => void;
  /** Map of index → geo field names (empty array means no geo fields). */
  geoFieldsCache?: Map<string, string[]>;
}

/** Set of index names that are hidden from the DATA list. */
export type HiddenIndexes = Set<string>;

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

export class SidePanel {
  private _reg: LayerRegistry;
  private _store: DataStore;
  private _onOpenSettings: (sourceId: string) => void;
  private _onOpenDataConfig: () => void;
  private _onOpenStyleEditor: (sourceId: string) => void;
  private _hiddenIndexes: HiddenIndexes = new Set();
  private _geoFieldsCache: Map<string, string[]>;

  constructor(deps: SidePanelDeps) {
    this._reg = deps.layerRegistry;
    this._store = deps.dataStore;
    this._onOpenSettings = deps.onOpenSettings;
    this._onOpenDataConfig = deps.onOpenDataConfig;
    this._onOpenStyleEditor = deps.onOpenStyleEditor;
    this._geoFieldsCache = deps.geoFieldsCache ?? new Map();
  }

  /** Update the set of hidden indexes (from ES config). */
  setHiddenIndexes(hidden: HiddenIndexes): void {
    this._hiddenIndexes = hidden;
  }

  get hiddenIndexes(): HiddenIndexes {
    return this._hiddenIndexes;
  }

  render(): void {
    this._renderLayers();
    this._renderTiles();
    this._renderData();
    this._renderDataConfigButton();
  }

  // ── Layers ──────────────────────────────────────────────────────────────

  private _renderLayers(): void {
    const body = document.getElementById('sp-layers-body');
    const countEl = document.getElementById('sp-layers-count');
    if (!body || !countEl) return;
    body.innerHTML = '';

    const deckLayers = this._reg.all().filter(
      (l): l is DeckLayerAdapter => l.meta.kind === 'deck',
    ) as DeckLayerAdapter[];
    countEl.textContent = String(deckLayers.length);

    if (deckLayers.length === 0) {
      body.innerHTML = '<div class="sp-empty">No layers</div>';
      return;
    }

    for (const layer of deckLayers) {
      const isVisible = layer.meta.visible;
      const layerId = layer.meta.id;

      const row = document.createElement('div');
      row.className = 'sp-row' + (isVisible ? '' : ' sp-row--off');

      const toggle = document.createElement('div');
      toggle.className = 'sp-row__toggle' + (isVisible ? ' sp-row__toggle--on' : '');

      const iconWrap = document.createElement('div');
      iconWrap.className = 'sp-row__icon';
      const c = layer.color;
      iconWrap.appendChild(geoIcon(layer.geoType, `rgb(${c[0]},${c[1]},${c[2]})`));

      const label = document.createElement('span');
      label.className = 'sp-row__label';
      label.textContent = layer.meta.label;

      const meta = document.createElement('span');
      meta.className = 'sp-row__meta';
      meta.textContent = fmtCount(layer.dataCount);

      row.append(toggle, iconWrap, label, meta);

      // Single click handler on the row — toggles visibility
      row.addEventListener('click', () => {
        this._reg.setVisible(layerId, !this._reg.get(layerId)!.meta.visible);
      });
      body.appendChild(row);
    }
  }

  // ── Tiles ───────────────────────────────────────────────────────────────

  private _renderTiles(): void {
    const body = document.getElementById('sp-tiles-body');
    const countEl = document.getElementById('sp-tiles-count');
    if (!body || !countEl) return;
    body.innerHTML = '';

    const tileLayers = this._reg.all().filter(
      (l): l is WmsLayerAdapter => l.meta.kind === 'maplibre',
    ) as WmsLayerAdapter[];
    countEl.textContent = String(tileLayers.length);

    if (tileLayers.length === 0) {
      body.innerHTML = '<div class="sp-empty">No tile layers</div>';
      return;
    }

    for (const layer of tileLayers) {
      const isVisible = layer.meta.visible;
      const layerId = layer.meta.id;

      const row = document.createElement('div');
      row.className = 'sp-row' + (isVisible ? '' : ' sp-row--off');

      const toggle = document.createElement('div');
      toggle.className = 'sp-row__toggle' + (isVisible ? ' sp-row__toggle--on' : '');

      const iconWrap = document.createElement('div');
      iconWrap.className = 'sp-row__icon';
      iconWrap.appendChild(tileIcon(layer.tileKind, 'var(--ft-accent)'));

      const label = document.createElement('span');
      label.className = 'sp-row__label';
      label.textContent = layer.meta.label;

      const meta = document.createElement('span');
      meta.className = 'sp-row__meta';
      meta.textContent = `z${layer.minZoom}–${layer.maxZoom}`;

      row.append(toggle, iconWrap, label, meta);

      // Single click handler on the row — toggles visibility
      row.addEventListener('click', () => {
        this._reg.setVisible(layerId, !this._reg.get(layerId)!.meta.visible);
      });
      body.appendChild(row);
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────

  private _renderData(): void {
    const body = document.getElementById('sp-data-body');
    const countEl = document.getElementById('sp-data-count');
    if (!body || !countEl) return;
    body.innerHTML = '';

    const sourceIds = this._store.allSourceIds()
      .filter(id => !this._hiddenIndexes.has(id))
      .sort((a, b) => a.localeCompare(b));
    countEl.textContent = String(sourceIds.length);

    if (sourceIds.length === 0) {
      body.innerHTML = '<div class="sp-empty">No data sources</div>';
      return;
    }

    for (const sourceId of sourceIds) {
      const features = this._store.get(sourceId);
      const count = features.length;

      const matchingLayer = this._reg.get<DeckLayerAdapter>(sourceId);
      const geoType: GeoType = matchingLayer
        ? matchingLayer.geoType
        : (features[0]?.geometry?.type === 'Point'
            ? 'point'
            : features[0]?.geometry?.type === 'LineString'
              ? 'line'
              : 'polygon');

      const isVisible = matchingLayer?.meta.visible !== false;

      const row = document.createElement('div');
      row.className = 'sp-row' + (isVisible ? '' : ' sp-row--off');

      const toggle = document.createElement('div');
      toggle.className = 'sp-row__toggle' + (isVisible ? ' sp-row__toggle--on' : '');

      const iconWrap = document.createElement('div');
      iconWrap.className = 'sp-row__icon';
      const c = matchingLayer?.color ?? [100, 160, 220, 200];
      iconWrap.appendChild(geoIcon(geoType, `rgb(${c[0]},${c[1]},${c[2]})`));

      const label = document.createElement('span');
      label.className = 'sp-row__label';
      label.textContent = sourceId;

      const meta = document.createElement('span');
      meta.className = 'sp-row__meta';
      meta.textContent = fmtCount(count);

      // Style paintbrush button
      const styleBtn = document.createElement('button');
      styleBtn.className = 'sp-row__gear';
      styleBtn.title = 'Edit layer style';
      styleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';

      // Settings gear button
      const gear = document.createElement('button');
      gear.className = 'sp-row__gear';
      gear.title = 'Configure tooltip attributes';
      gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

      // Warning icon for indexes with no compatible geo field
      const geoFields = this._geoFieldsCache.get(sourceId);
      if (geoFields && geoFields.length === 0) {
        const warn = document.createElement('span');
        warn.className = 'sp-row__warn';
        warn.title = 'No compatible geo field detected';
        warn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        row.append(toggle, iconWrap, label, warn, meta, styleBtn, gear);
      } else {
        row.append(toggle, iconWrap, label, meta, styleBtn, gear);
      }

      // Button handlers — stopPropagation prevents the row toggle from firing
      styleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onOpenStyleEditor(sourceId);
      });
      gear.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onOpenSettings(sourceId);
      });

      // Row click = toggle visibility (only if there's a layer to toggle)
      if (matchingLayer) {
        row.addEventListener('click', () => {
          const current = this._reg.get(sourceId);
          if (current) {
            this._reg.setVisible(sourceId, !current.meta.visible);
          }
        });
      }

      body.appendChild(row);
    }
  }

  // ── Configure button for DATA section header ───────────────────────────

  private _renderDataConfigButton(): void {
    const header = document.querySelector('[data-toggle="data"]');
    if (!header) return;

    // Remove existing configure button if present (avoid duplicates)
    const existing = header.querySelector('.sp-section__configure');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.className = 'sp-section__configure';
    btn.textContent = 'Configure';
    btn.title = 'Configure visible data sources';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._onOpenDataConfig();
    });

    // Insert before the chevron (last child)
    const chevron = header.querySelector('.sp-section__chevron');
    if (chevron) {
      header.insertBefore(btn, chevron);
    } else {
      header.appendChild(btn);
    }
  }
}
