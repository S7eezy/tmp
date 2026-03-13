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
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

export class SidePanel {
  private _reg: LayerRegistry;
  private _store: DataStore;
  private _onOpenSettings: (sourceId: string) => void;

  constructor(deps: SidePanelDeps) {
    this._reg = deps.layerRegistry;
    this._store = deps.dataStore;
    this._onOpenSettings = deps.onOpenSettings;
  }

  render(): void {
    this._renderLayers();
    this._renderTiles();
    this._renderData();
  }

  // ── Layers ──────────────────────────────────────────────────────────────

  private _renderLayers(): void {
    const body = document.getElementById('sp-layers-body')!;
    const countEl = document.getElementById('sp-layers-count')!;
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
      const row = document.createElement('div');
      row.className = 'sp-row' + (layer.meta.visible ? '' : ' sp-row--off');

      const toggle = document.createElement('div');
      toggle.className = 'sp-row__toggle' + (layer.meta.visible ? ' sp-row__toggle--on' : '');

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
      row.addEventListener('click', () =>
        this._reg.setVisible(layer.meta.id, !layer.meta.visible),
      );
      body.appendChild(row);
    }
  }

  // ── Tiles ───────────────────────────────────────────────────────────────

  private _renderTiles(): void {
    const body = document.getElementById('sp-tiles-body')!;
    const countEl = document.getElementById('sp-tiles-count')!;
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
      const row = document.createElement('div');
      row.className = 'sp-row' + (layer.meta.visible ? '' : ' sp-row--off');

      const toggle = document.createElement('div');
      toggle.className = 'sp-row__toggle' + (layer.meta.visible ? ' sp-row__toggle--on' : '');

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
      row.addEventListener('click', () =>
        this._reg.setVisible(layer.meta.id, !layer.meta.visible),
      );
      body.appendChild(row);
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────

  private _renderData(): void {
    const body = document.getElementById('sp-data-body')!;
    const countEl = document.getElementById('sp-data-count')!;
    body.innerHTML = '';

    const sourceIds = this._store.allSourceIds();
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

      const row = document.createElement('div');
      row.className = 'sp-row';

      const toggle = document.createElement('div');
      toggle.className = 'sp-row__toggle' + (matchingLayer?.meta.visible !== false ? ' sp-row__toggle--on' : '');

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

      // Settings gear icon
      const gear = document.createElement('button');
      gear.className = 'sp-row__gear';
      gear.title = 'Configure tooltip attributes';
      gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
      gear.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onOpenSettings(sourceId);
      });

      row.append(toggle, iconWrap, label, meta, gear);

      if (matchingLayer) {
        row.addEventListener('click', () =>
          this._reg.setVisible(matchingLayer.meta.id, !matchingLayer.meta.visible),
        );
      }

      body.appendChild(row);
    }
  }
}
