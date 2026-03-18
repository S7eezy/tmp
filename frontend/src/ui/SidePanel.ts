// ---------------------------------------------------------------------------
// SidePanel – renders Layers / Tiles / Data sections in the right panel.
// ---------------------------------------------------------------------------

import type { LayerRegistry, DeckLayerAdapter, WmsLayerAdapter, GeoType } from '@core/layers';
import type { TileServerAdapter } from '@core/layers';
import type { DataStore, EsIndexInfo } from '@core/data';
import { geoIcon, tileIcon } from './icons';

export interface MapStyleEntry {
  /** Style id (e.g. 'leviathan'). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Full style.json URL. */
  url: string;
}

export interface SidePanelDeps {
  layerRegistry: LayerRegistry;
  dataStore: DataStore;
  onOpenSettings: (sourceId: string) => void;
  onOpenDataConfig: () => void;
  onOpenStyleEditor: (sourceId: string) => void;
  /** Map of index → geo field names (empty array means no geo fields). */
  geoFieldsCache?: Map<string, string[]>;
  /** Callback when the user selects a different basemap style. */
  onSwitchMapStyle?: (style: MapStyleEntry) => void;
  /** Callback when the user toggles a DATA index on (load) or off (unload). */
  onToggleData?: (indexId: string, load: boolean) => void;
}

/** Set of index names that are enabled in the DATA list. */
export type EnabledIndexes = Set<string>;

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
  private _onSwitchMapStyle: ((style: MapStyleEntry) => void) | null;
  private _onToggleData: ((indexId: string, load: boolean) => void) | null;
  private _geoFieldsCache: Map<string, string[]>;

  /** Indexes that are enabled (shown) in the DATA panel — set by Configure modal. */
  private _enabledIndexes: EnabledIndexes = new Set();
  /** Indexes that are currently loading data from ES. */
  private _loadingIndexes: Set<string> = new Set();
  /** Index metadata from listIndices() — used for doc counts on unloaded rows. */
  private _indexMetadata: Map<string, EsIndexInfo> = new Map();
  /** Filtered doc counts for enabled-but-unloaded indexes (updated when filters change). */
  private _filteredCounts: Map<string, number> = new Map();

  /** Available basemap styles from TileServer GL. */
  private _mapStyles: MapStyleEntry[] = [];
  /** Currently active style id. */
  private _activeStyleId: string | null = null;

  constructor(deps: SidePanelDeps) {
    this._reg = deps.layerRegistry;
    this._store = deps.dataStore;
    this._onOpenSettings = deps.onOpenSettings;
    this._onOpenDataConfig = deps.onOpenDataConfig;
    this._onOpenStyleEditor = deps.onOpenStyleEditor;
    this._onSwitchMapStyle = deps.onSwitchMapStyle ?? null;
    this._onToggleData = deps.onToggleData ?? null;
    this._geoFieldsCache = deps.geoFieldsCache ?? new Map();
  }

  // -- Public setters -----------------------------------------------------

  /** Update the set of enabled indexes (from ES config). */
  setEnabledIndexes(enabled: EnabledIndexes): void {
    this._enabledIndexes = enabled;
  }

  get enabledIndexes(): EnabledIndexes {
    return this._enabledIndexes;
  }

  get activeStyleId(): string | null {
    return this._activeStyleId;
  }

  /** Feed index metadata from listIndices() for doc counts on unloaded rows. */
  setIndexMetadata(indices: EsIndexInfo[]): void {
    this._indexMetadata.clear();
    for (const info of indices) this._indexMetadata.set(info.index, info);
  }

  /** Mark an index as loading or finished loading. */
  setLoading(indexId: string, loading: boolean): void {
    if (loading) this._loadingIndexes.add(indexId);
    else this._loadingIndexes.delete(indexId);
  }

  /** Update filtered doc count for an unloaded index. Pass `null` to clear. */
  setFilteredCount(indexId: string, count: number | null): void {
    if (count === null) this._filteredCounts.delete(indexId);
    else this._filteredCounts.set(indexId, count);
  }

  /** Clear all filtered counts (e.g. when filters are cleared). */
  clearFilteredCounts(): void {
    this._filteredCounts.clear();
  }

  /** Set the list of available basemap styles and which one is active. */
  setMapStyles(styles: MapStyleEntry[], activeId: string | null): void {
    this._mapStyles = styles;
    this._activeStyleId = activeId;
  }

  // -- Render -------------------------------------------------------------

  render(): void {
    this._renderData();
    this._renderDataConfigButton();
    this._renderLayers();
    this._renderTiles();
  }

  // ── Layers (GeoServer WMS) ─────────────────────────────────────────────

  private _renderLayers(): void {
    const body = document.getElementById('sp-layers-body');
    const countEl = document.getElementById('sp-layers-count');
    if (!body || !countEl) return;
    body.innerHTML = '';

    const wmsLayers = this._reg.all().filter(
      (l): l is WmsLayerAdapter => l.meta.kind === 'maplibre',
    ) as WmsLayerAdapter[];
    countEl.textContent = String(wmsLayers.length);

    if (wmsLayers.length === 0) {
      body.innerHTML = '<div class="sp-empty">No GeoServer layers</div>';
      return;
    }

    for (const layer of wmsLayers) {
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

      row.addEventListener('click', () => {
        this._reg.setVisible(layerId, !this._reg.get(layerId)!.meta.visible);
      });
      body.appendChild(row);
    }
  }

  // ── Tiles (TileServer GL data + styles) ────────────────────────────────

  private _renderTiles(): void {
    const body = document.getElementById('sp-tiles-body');
    const countEl = document.getElementById('sp-tiles-count');
    if (!body || !countEl) return;
    body.innerHTML = '';

    const tileLayers = this._reg.all().filter(
      (l): l is TileServerAdapter => l.meta.kind === 'tileserver',
    ) as TileServerAdapter[];

    const totalCount = this._mapStyles.length + tileLayers.length;
    countEl.textContent = String(totalCount);

    if (totalCount === 0) {
      body.innerHTML = '<div class="sp-empty">No tile layers</div>';
      return;
    }

    // ── Basemap styles (radio-button: only one active at a time) ──────────
    if (this._mapStyles.length > 0) {
      for (const style of this._mapStyles) {
        const isActive = style.id === this._activeStyleId;

        const row = document.createElement('div');
        row.className = 'sp-row' + (isActive ? '' : ' sp-row--off');

        const toggle = document.createElement('div');
        toggle.className = 'sp-row__toggle' + (isActive ? ' sp-row__toggle--on' : '');

        const iconWrap = document.createElement('div');
        iconWrap.className = 'sp-row__icon';
        iconWrap.appendChild(tileIcon('raster', 'var(--ft-accent)'));

        const label = document.createElement('span');
        label.className = 'sp-row__label';
        label.textContent = style.name;

        const meta = document.createElement('span');
        meta.className = 'sp-row__meta';
        meta.textContent = 'style';

        row.append(toggle, iconWrap, label, meta);

        row.addEventListener('click', () => {
          if (this._activeStyleId === style.id) return; // already active
          this._activeStyleId = style.id;
          if (this._onSwitchMapStyle) this._onSwitchMapStyle(style);
          this.render();
        });
        body.appendChild(row);
      }
    }

    // ── Tile data layers (toggleable overlays) ────────────────────────────
    for (const layer of tileLayers) {
      const isVisible = layer.meta.visible;
      const layerId = layer.meta.id;

      const row = document.createElement('div');
      row.className = 'sp-row' + (isVisible ? '' : ' sp-row--off');

      const toggle = document.createElement('div');
      toggle.className = 'sp-row__toggle' + (isVisible ? ' sp-row__toggle--on' : '');

      const iconWrap = document.createElement('div');
      iconWrap.className = 'sp-row__icon';
      const tileKind = layer.isVector ? 'vector' as const : 'raster' as const;
      iconWrap.appendChild(tileIcon(tileKind, 'var(--ft-accent)'));

      const label = document.createElement('span');
      label.className = 'sp-row__label';
      label.textContent = layer.meta.label;

      const meta = document.createElement('span');
      meta.className = 'sp-row__meta';
      meta.textContent = `${layer.format} · z${layer.minZoom}–${layer.maxZoom}`;

      row.append(toggle, iconWrap, label, meta);

      row.addEventListener('click', () => {
        this._reg.setVisible(layerId, !this._reg.get(layerId)!.meta.visible);
      });
      body.appendChild(row);
    }
  }

  // ── Data (ES indexes – lazy loaded) ────────────────────────────────────

  private _renderData(): void {
    const body = document.getElementById('sp-data-body');
    const countEl = document.getElementById('sp-data-count');
    if (!body || !countEl) return;
    body.innerHTML = '';

    const enabledIds = [...this._enabledIndexes].sort((a, b) => a.localeCompare(b));
    countEl.textContent = String(enabledIds.length);

    if (enabledIds.length === 0) {
      body.innerHTML = '<div class="sp-empty">No data sources enabled</div>';
      return;
    }

    for (const sourceId of enabledIds) {
      const isLoading = this._loadingIndexes.has(sourceId);
      const matchingLayer = this._reg.get<DeckLayerAdapter>(sourceId);
      const isLoaded = !!matchingLayer;
      const isVisible = isLoaded && matchingLayer.meta.visible !== false;

      const row = document.createElement('div');
      row.className = 'sp-row' + (isVisible ? '' : ' sp-row--off');

      // Toggle indicator
      const toggle = document.createElement('div');
      toggle.className = 'sp-row__toggle'
        + (isVisible ? ' sp-row__toggle--on' : '')
        + (isLoading ? ' sp-row__toggle--loading' : '');

      // Geo icon
      const iconWrap = document.createElement('div');
      iconWrap.className = 'sp-row__icon';
      if (isLoaded && matchingLayer) {
        const c = matchingLayer.color ?? [100, 160, 220, 200];
        const geoType: GeoType = matchingLayer.geoType;
        iconWrap.appendChild(geoIcon(geoType, `rgb(${c[0]},${c[1]},${c[2]})`));
      } else {
        // Unloaded — show generic point icon in muted color
        iconWrap.appendChild(geoIcon('point', 'var(--ft-text-muted)'));
      }

      // Label
      const label = document.createElement('span');
      label.className = 'sp-row__label';
      label.textContent = sourceId;

      // Meta: feature count (loaded) or doc count from metadata (unloaded)
      const meta = document.createElement('span');
      meta.className = 'sp-row__meta';
      if (isLoading) {
        meta.textContent = 'loading…';
      } else if (isLoaded) {
        meta.textContent = fmtCount(this._store.get(sourceId).length);
      } else {
        // Show filtered count if available, otherwise raw doc count
        const filteredCount = this._filteredCounts.get(sourceId);
        const info = this._indexMetadata.get(sourceId);
        if (filteredCount != null && info) {
          meta.textContent = `${fmtCount(filteredCount)} / ${fmtCount(info.docsCount)} docs`;
        } else if (info) {
          meta.textContent = fmtCount(info.docsCount) + ' docs';
        } else {
          meta.textContent = '—';
        }
      }

      // Warning icon for indexes with no compatible geo field
      const geoFields = this._geoFieldsCache.get(sourceId);
      const hasNoGeo = geoFields && geoFields.length === 0;
      if (hasNoGeo) {
        const warn = document.createElement('span');
        warn.className = 'sp-row__warn';
        warn.title = 'No compatible geo field detected';
        warn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        row.append(toggle, iconWrap, label, warn, meta);
      } else {
        row.append(toggle, iconWrap, label, meta);
      }

      // Style button — only when loaded (requires data to edit style)
      if (isLoaded) {
        const styleBtn = document.createElement('button');
        styleBtn.className = 'sp-row__gear';
        styleBtn.title = 'Edit layer style';
        styleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';
        styleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._onOpenStyleEditor(sourceId);
        });
        row.append(styleBtn);
      }

      // Settings gear — always available (timestamp field config works for unloaded indexes)
      {
        const gear = document.createElement('button');
        gear.className = 'sp-row__gear';
        gear.title = 'Configure tooltip attributes';
        gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        gear.addEventListener('click', (e) => {
          e.stopPropagation();
          this._onOpenSettings(sourceId);
        });
        row.append(gear);
      }

      // Row click = toggle load/unload
      row.addEventListener('click', () => {
        if (isLoading) return; // ignore clicks while loading
        if (this._onToggleData) {
          this._onToggleData(sourceId, !isLoaded);
        }
      });

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
