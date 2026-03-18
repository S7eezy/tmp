// ---------------------------------------------------------------------------
// FleetTracker – FilterEngine
//
// Manages the collection of active filters, builds Elasticsearch bool queries,
// provides client-side predicates for filtering in-memory (synthetic) data,
// and handles Views (named filter combinations).
// ---------------------------------------------------------------------------

import type {
  ActiveFilter, GeoFilter, TimeFilter, ValueFilter, FilterView,
} from './types';
import type { Feature } from 'geojson';

// ---------------------------------------------------------------------------
// Backend config persistence constants
// ---------------------------------------------------------------------------

const VIEWS_DOC_ID = 'filter-views';
const SAVED_FILTERS_DOC_ID = 'saved-filters';

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

let _seq = 1;
export function newFilterId(): string { return `flt-${_seq++}`; }

// ---------------------------------------------------------------------------
// FilterEngine
// ---------------------------------------------------------------------------

export class FilterEngine extends EventTarget {
  private _filters: ActiveFilter[] = [];
  private _views: FilterView[] = [];

  /**
   * Per-index timestamp field overrides.
   * When building time filter queries/predicates for a specific index,
   * this field is used instead of the filter's default `field` property.
   */
  private _timestampFields = new Map<string, string>();

  /** Set the timestamp field for a specific index. */
  setTimestampField(indexId: string, field: string): void {
    this._timestampFields.set(indexId, field);
    this._emit();
  }

  /** Get the timestamp field for a specific index (falls back to filter default). */
  getTimestampField(indexId: string): string | undefined {
    return this._timestampFields.get(indexId);
  }

  // -------------------------------------------------------------------------
  // Read accessors
  // -------------------------------------------------------------------------

  get filters(): ActiveFilter[] { return [...this._filters]; }

  get views(): FilterView[] { return [...this._views]; }

  count(): number { return this._filters.length; }

  activeCount(): number { return this._filters.filter(f => f.enabled).length; }

  /** All filters applicable to a given ES index (enabled + scoped). */
  getFiltersForIndex(index: string): ActiveFilter[] {
    return this._filters.filter(f =>
      f.enabled && (f.scope.includes('*') || f.scope.includes(index)),
    );
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  add(filter: ActiveFilter): void {
    this._filters.push(filter);
    this._emit();
  }

  remove(id: string): void {
    this._filters = this._filters.filter(f => f.id !== id);
    this._emit();
  }

  toggle(id: string): void {
    const f = this._filters.find(f => f.id === id);
    if (f) { f.enabled = !f.enabled; this._emit(); }
  }

  clear(): void { this._filters = []; this._emit(); }

  /**
   * Rename a filter.
   * @param silent – if true, skip emitting `change` (avoids re-query + re-render
   *                 while the user is still typing in the rename input).
   */
  rename(id: string, newLabel: string, silent = false): void {
    const f = this._filters.find(f => f.id === id);
    if (f) {
      f.label = newLabel;
      if (!silent) this._emit();
    }
  }

  // -------------------------------------------------------------------------
  // Saved Filters Library – individual filters saved for reuse
  // -------------------------------------------------------------------------

  private _savedFilters: ActiveFilter[] = [];

  get savedFilters(): ActiveFilter[] { return [...this._savedFilters]; }

  saveFilter(filter: ActiveFilter): boolean {
    // Prevent duplicate names in library
    if (this._savedFilters.some(f => f.label === filter.label)) {
      return false;
    }
    const saved = JSON.parse(JSON.stringify(filter));
    saved.id = `saved-${Date.now()}`;
    this._savedFilters.push(saved);
    this._emitViews();
    return true;
  }

  removeSavedFilter(id: string): void {
    this._savedFilters = this._savedFilters.filter(f => f.id !== id);
    this._emitViews();
  }

  addFromLibrary(savedId: string): void {
    const saved = this._savedFilters.find(f => f.id === savedId);
    if (!saved) return;
    const clone: ActiveFilter = JSON.parse(JSON.stringify(saved));
    clone.id = newFilterId();
    clone.enabled = true;
    this._filters.push(clone);
    this._emit();
  }

  serializeSavedFilters(): string { return JSON.stringify(this._savedFilters); }

  deserializeSavedFilters(json: string): void {
    try { this._savedFilters = JSON.parse(json); } catch { /* ignore */ }
  }

  // -------------------------------------------------------------------------
  // Views – save/load/toggle named filter combinations
  // -------------------------------------------------------------------------

  /** Save current filters + UI state as a named view. */
  saveView(name: string, description?: string, extraState?: {
    enabledIndexes?: string[];
    loadedIndexes?: string[];
    layerVisibility?: Record<string, boolean>;
    activeMapStyle?: string | null;
  }): FilterView {
    // Remove existing view with same name
    this._views = this._views.filter(v => v.name !== name);
    const view: FilterView = {
      name,
      createdAt: new Date().toISOString(),
      description,
      filters: JSON.parse(JSON.stringify(this._filters)),
      active: false,
      enabledIndexes: extraState?.enabledIndexes,
      loadedIndexes: extraState?.loadedIndexes,
      layerVisibility: extraState?.layerVisibility,
      activeMapStyle: extraState?.activeMapStyle,
    };
    this._views.push(view);
    this._emitViews();
    return view;
  }

  /** Load a view – replaces current filters with the view's snapshot. */
  loadView(name: string): void {
    const view = this._views.find(v => v.name === name);
    if (!view) return;
    // Deep-clone so toggling doesn't mutate the saved snapshot
    this._filters = JSON.parse(JSON.stringify(view.filters));
    // Re-sequence IDs to avoid collisions
    for (const f of this._filters) f.id = newFilterId();
    // Mark this view as active, others as inactive
    for (const v of this._views) v.active = v.name === name;
    // Emit view-apply so main.ts can restore indexes/layers/tiles
    this._emitViewApply(view);
    this._emit();
    this._emitViews();
  }

  /**
   * Toggle a view on/off.
   * On = flush everything, then apply the view's full state.
   * Off = flush everything (filters + indexes + layers).
   */
  toggleView(name: string): void {
    const view = this._views.find(v => v.name === name);
    if (!view) return;
    if (view.active) {
      view.active = false;
      this._filters = [];
      // Emit flush event so main.ts unloads all indexes + hides layers
      this._emitViewFlush();
      this._emit();
      this._emitViews();
    } else {
      // Flush first, then load
      this._emitViewFlush();
      this.loadView(name);
    }
  }

  /** Toggle a view's favourite status. */
  toggleFavourite(name: string): void {
    const view = this._views.find(v => v.name === name);
    if (!view) return;
    view.favourite = !view.favourite;
    this._emitViews();
  }

  /** Remove a saved view. */
  removeView(name: string): void {
    this._views = this._views.filter(v => v.name !== name);
    this._emitViews();
  }

  /** Serialize views to JSON (for saving to ES or localStorage). */
  serializeViews(): string {
    return JSON.stringify(this._views);
  }

  /** Deserialize views from JSON. */
  deserializeViews(json: string): void {
    try {
      this._views = JSON.parse(json);
      this._emitViews();
    } catch { /* ignore bad data */ }
  }

  // -------------------------------------------------------------------------
  // Elasticsearch query building
  // -------------------------------------------------------------------------

  /**
   * Build a full Elasticsearch bool query for the given index.
   * Returns `{ match_all: {} }` when no active filters apply.
   */
  buildQuery(index: string): Record<string, unknown> {
    const applicable = this.getFiltersForIndex(index);
    if (applicable.length === 0) return { match_all: {} };
    return { bool: { must: applicable.map(f => this._toClause(f, index)) } };
  }

  private _toClause(f: ActiveFilter, index?: string): Record<string, unknown> {
    switch (f.kind) {
      case 'geo':   return this._geoClause(f);
      case 'time':  return this._timeClause(this._resolveTimeField(f, index));
      case 'value': return this._valueClause(f);
    }
  }

  /** Resolve the time filter field for a specific index (per-index override). */
  private _resolveTimeField(f: TimeFilter, index?: string): TimeFilter {
    if (!index) return f;
    const override = this._timestampFields.get(index);
    if (override && override !== f.field) return { ...f, field: override };
    return f;
  }

  private _geoClause(f: GeoFilter): Record<string, unknown> {
    if (f.mode === 'bbox' && f.bbox) {
      // geo_shape with Envelope works on both geo_point and geo_shape fields;
      // geo_bounding_box only works on geo_point.
      return {
        geo_shape: {
          [f.geoField]: {
            shape: {
              type: 'Envelope',
              coordinates: [
                [f.bbox.west, f.bbox.north],
                [f.bbox.east, f.bbox.south],
              ],
            },
            relation: 'intersects',
          },
        },
      };
    }
    if (f.mode === 'polygon' && f.polygon && f.polygon.length >= 3) {
      const ring = [...f.polygon];
      // Close the ring if not already closed
      const [fx, fy] = ring[0]; const [lx, ly] = ring[ring.length - 1];
      if (fx !== lx || fy !== ly) ring.push(ring[0]);
      return {
        geo_shape: {
          [f.geoField]: {
            shape: { type: 'Polygon', coordinates: [ring] },
            relation: 'intersects',
          },
        },
      };
    }
    if (f.mode === 'country' && f.country) {
      if (f.bbox) return this._geoClause({ ...f, mode: 'bbox' });
      return { match: { country_code: f.country } };
    }
    return { match_all: {} };
  }

  private _timeClause(f: TimeFilter): Record<string, unknown> {
    const r: Record<string, string> = {};
    switch (f.mode) {
      case 'before':  r.lte = f.to!; break;
      case 'after':   r.gte = f.from!; break;
      case 'between': r.gte = f.from!; r.lte = f.to!; break;
      case 'last': {
        const u: Record<string, string> = { minute: 'm', hour: 'h', day: 'd', week: 'w' };
        r.gte = `now-${f.lastAmount}${u[f.lastUnit ?? 'hour']}`;
        r.lte = 'now';
        break;
      }
    }
    return { range: { [f.field]: r } };
  }

  private _valueClause(f: ValueFilter): Record<string, unknown> {
    switch (f.op) {
      case 'eq':      return { term:  { [f.field]: f.value } };
      case 'ne':      return { bool: { must_not: [{ term: { [f.field]: f.value } }] } };
      case 'in':      return { terms: { [f.field]: f.terms ?? [] } };
      case 'not_in':  return { bool: { must_not: [{ terms: { [f.field]: f.terms ?? [] } }] } };
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':     return { range: { [f.field]: { [f.op]: f.value } } };
      case 'between': return { range: { [f.field]: { gte: f.value, lte: f.valueTo } } };
    }
    return { match_all: {} };
  }

  // -------------------------------------------------------------------------
  // Client-side predicates (for in-memory / synthetic data)
  // -------------------------------------------------------------------------

  buildClientPredicate(index: string): (f: Feature) => boolean {
    const applicable = this.getFiltersForIndex(index);
    if (applicable.length === 0) return () => true;
    const preds = applicable.map(f => this._toPredicateFor(f, index));
    return feat => preds.every(p => p(feat));
  }

  private _toPredicateFor(f: ActiveFilter, index: string): (feat: Feature) => boolean {
    switch (f.kind) {
      case 'geo':   return this._geoPredicate(f);
      case 'time':  return this._timePredicate(this._resolveTimeField(f, index));
      case 'value': return this._valuePredicate(f);
    }
  }

  private _geoPredicate(f: GeoFilter): (feat: Feature) => boolean {
    if (f.mode === 'bbox' && f.bbox) {
      const { north, south, east, west } = f.bbox;
      return feat => {
        if (feat.geometry.type !== 'Point') return true;
        const [lon, lat] = feat.geometry.coordinates as [number, number];
        return lat >= south && lat <= north && lon >= west && lon <= east;
      };
    }
    if (f.mode === 'polygon' && f.polygon && f.polygon.length >= 3) {
      return feat => {
        if (feat.geometry.type !== 'Point') return true;
        return _pointInPolygon(
          feat.geometry.coordinates as [number, number],
          f.polygon!,
        );
      };
    }
    if (f.mode === 'country' && f.bbox) {
      return this._geoPredicate({ ...f, mode: 'bbox' });
    }
    return () => true;
  }

  private _timePredicate(f: TimeFilter): (feat: Feature) => boolean {
    const now = Date.now();
    const toMs = (s: string): number =>
      /^\d{10,}$/.test(s) ? Number(s) : new Date(s).getTime();

    switch (f.mode) {
      case 'before': {
        if (!f.to) return () => true;
        const cap = toMs(f.to);
        return feat => { const v = feat.properties?.[f.field]; return v == null || toMs(String(v)) <= cap; };
      }
      case 'after': {
        if (!f.from) return () => true;
        const floor = toMs(f.from);
        return feat => { const v = feat.properties?.[f.field]; return v == null || toMs(String(v)) >= floor; };
      }
      case 'between': {
        if (!f.from || !f.to) return () => true;
        const lo = toMs(f.from), hi = toMs(f.to);
        return feat => {
          const v = feat.properties?.[f.field];
          if (v == null) return true;
          const ms = toMs(String(v));
          return ms >= lo && ms <= hi;
        };
      }
      case 'last': {
        const unitMs: Record<string, number> = {
          minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000,
        };
        const delta = (f.lastAmount ?? 1) * (unitMs[f.lastUnit ?? 'hour'] ?? 3_600_000);
        return feat => {
          const v = feat.properties?.[f.field];
          return v == null || toMs(String(v)) >= now - delta;
        };
      }
    }
  }

  private _valuePredicate(f: ValueFilter): (feat: Feature) => boolean {
    return feat => {
      const raw = feat.properties?.[f.field];
      if (raw == null) return true;
      if (f.fieldType === 'number') {
        const v = Number(raw), fv = Number(f.value);
        switch (f.op) {
          case 'eq':      return v === fv;
          case 'ne':      return v !== fv;
          case 'gt':      return v > fv;
          case 'gte':     return v >= fv;
          case 'lt':      return v < fv;
          case 'lte':     return v <= fv;
          case 'between': return v >= fv && v <= Number(f.valueTo);
        }
      } else {
        const v = String(raw);
        switch (f.op) {
          case 'eq':      return v === String(f.value);
          case 'ne':      return v !== String(f.value);
          case 'in':      return (f.terms ?? []).includes(v);
          case 'not_in':  return !(f.terms ?? []).includes(v);
        }
      }
      return true;
    };
  }

  // -------------------------------------------------------------------------
  // Backend API persistence
  // -------------------------------------------------------------------------

  private _apiBaseUrl: string | null = null;

  /** Set the backend API base URL to enable config persistence. */
  setApiBaseUrl(url: string): void {
    this._apiBaseUrl = url.replace(/\/$/, '');
  }

  /** Load saved views + saved filters from backend. */
  async loadFromBackend(): Promise<void> {
    if (!this._apiBaseUrl) return;
    try {
      const [viewsRes, filtersRes] = await Promise.all([
        fetch(`${this._apiBaseUrl}/config/${VIEWS_DOC_ID}`),
        fetch(`${this._apiBaseUrl}/config/${SAVED_FILTERS_DOC_ID}`),
      ]);
      if (viewsRes.ok) {
        const doc = await viewsRes.json();
        this._views = doc.views ?? [];
      }
      if (filtersRes.ok) {
        const doc = await filtersRes.json();
        this._savedFilters = doc.filters ?? [];
      }
      this._emitViews();
    } catch {
      // Config doesn't exist yet – fine
    }
  }

  /** Persist saved views to backend. */
  private async _saveViews(): Promise<void> {
    if (!this._apiBaseUrl) return;
    try {
      await fetch(`${this._apiBaseUrl}/config/${VIEWS_DOC_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ views: this._views }),
      });
    } catch (err) {
      console.error('[FilterEngine] Failed to save views:', err);
    }
  }

  /** Persist saved filters library to backend. */
  private async _saveSavedFilters(): Promise<void> {
    if (!this._apiBaseUrl) return;
    try {
      await fetch(`${this._apiBaseUrl}/config/${SAVED_FILTERS_DOC_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: this._savedFilters }),
      });
    } catch (err) {
      console.error('[FilterEngine] Failed to save filters:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _emit(): void {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { filters: this.filters, activeCount: this.activeCount() },
    }));
  }

  private _emitViews(): void {
    this.dispatchEvent(new CustomEvent('views-change', {
      detail: { views: this.views },
    }));
    // Fire-and-forget backend persistence
    this._saveViews();
    this._saveSavedFilters();
  }

  /** Emitted when a view is loaded — carries the full saved state for main.ts to restore. */
  private _emitViewApply(view: FilterView): void {
    this.dispatchEvent(new CustomEvent('view-apply', {
      detail: {
        enabledIndexes: view.enabledIndexes ?? [],
        loadedIndexes: view.loadedIndexes ?? [],
        layerVisibility: view.layerVisibility ?? {},
        activeMapStyle: view.activeMapStyle ?? null,
      },
    }));
  }

  /** Emitted before a view toggle — tells main.ts to unload all indexes + hide all layers. */
  private _emitViewFlush(): void {
    this.dispatchEvent(new CustomEvent('view-flush'));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ray-casting point-in-polygon. */
function _pointInPolygon(
  [px, py]: [number, number],
  ring: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
