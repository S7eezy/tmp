// ---------------------------------------------------------------------------
// FleetTracker – FilterPanel
//
// Manages the left-side filter panel UI. Renders active filter cards, an
// "Add filter" wizard with geo/time/value forms, and a Views section for
// saving/loading named filter combinations.
// ---------------------------------------------------------------------------

import type { Feature } from 'geojson';
import {
  type ActiveFilter, type GeoFilter, type TimeFilter, type ValueFilter,
  type FilterScope, type TimeMode, type TimeUnit,
  type ValueFieldType, type ValueOp, type GeoBounds, type FilterView,
} from './types';
import { FilterEngine, newFilterId } from './FilterEngine';
import type { MapEngine } from '@core/map';

// ---------------------------------------------------------------------------
// Country catalogue (maritime nations, approximate bounding boxes)
// ---------------------------------------------------------------------------

const COUNTRIES: Array<{ code: string; name: string; bbox: GeoBounds }> = [
  { code: 'AU', name: 'Australia',        bbox: { north: -10.7, south: -43.6, west: 113.2, east: 153.6 } },
  { code: 'BR', name: 'Brazil',           bbox: { north:   5.3, south: -33.7, west: -73.9, east: -34.7 } },
  { code: 'CA', name: 'Canada',           bbox: { north:  83.1, south:  41.7, west:-141.0, east: -52.6 } },
  { code: 'CN', name: 'China',            bbox: { north:  53.6, south:  18.2, west:  73.6, east: 134.8 } },
  { code: 'DK', name: 'Denmark',          bbox: { north:  57.8, south:  54.6, west:   8.1, east:  15.2 } },
  { code: 'FI', name: 'Finland',          bbox: { north:  70.1, south:  59.8, west:  20.0, east:  31.6 } },
  { code: 'FR', name: 'France',           bbox: { north:  51.1, south:  41.3, west:  -5.1, east:   9.6 } },
  { code: 'DE', name: 'Germany',          bbox: { north:  55.1, south:  47.3, west:   5.9, east:  15.0 } },
  { code: 'GR', name: 'Greece',           bbox: { north:  41.7, south:  35.0, west:  20.0, east:  29.7 } },
  { code: 'IN', name: 'India',            bbox: { north:  35.5, south:   8.1, west:  68.1, east:  97.4 } },
  { code: 'ID', name: 'Indonesia',        bbox: { north:   5.9, south: -10.9, west:  95.0, east: 141.0 } },
  { code: 'IT', name: 'Italy',            bbox: { north:  47.1, south:  37.9, west:   6.6, east:  18.5 } },
  { code: 'JP', name: 'Japan',            bbox: { north:  45.5, south:  24.3, west: 122.9, east: 153.9 } },
  { code: 'MY', name: 'Malaysia',         bbox: { north:   7.4, south:   0.9, west: 100.1, east: 119.3 } },
  { code: 'MX', name: 'Mexico',           bbox: { north:  32.7, south:  14.5, west:-117.1, east: -86.7 } },
  { code: 'NL', name: 'Netherlands',      bbox: { north:  53.5, south:  50.8, west:   3.3, east:   7.2 } },
  { code: 'NO', name: 'Norway',           bbox: { north:  71.2, south:  57.9, west:   4.5, east:  31.2 } },
  { code: 'PH', name: 'Philippines',      bbox: { north:  21.1, south:   4.6, west: 116.9, east: 126.6 } },
  { code: 'PL', name: 'Poland',           bbox: { north:  54.8, south:  49.0, west:  14.1, east:  24.2 } },
  { code: 'PT', name: 'Portugal',         bbox: { north:  42.2, south:  37.0, west:  -9.5, east:  -6.2 } },
  { code: 'RU', name: 'Russia',           bbox: { north:  81.9, south:  41.2, west:  19.6, east: 180.0 } },
  { code: 'SG', name: 'Singapore',        bbox: { north:   1.5, south:   1.2, west: 103.6, east: 104.0 } },
  { code: 'KR', name: 'South Korea',      bbox: { north:  38.6, south:  34.3, west: 126.1, east: 129.6 } },
  { code: 'ES', name: 'Spain',            bbox: { north:  43.8, south:  36.0, west:  -9.3, east:   3.3 } },
  { code: 'SE', name: 'Sweden',           bbox: { north:  69.1, south:  55.3, west:  10.9, east:  24.2 } },
  { code: 'TR', name: 'Türkiye',          bbox: { north:  42.1, south:  35.8, west:  25.7, east:  44.8 } },
  { code: 'GB', name: 'United Kingdom',   bbox: { north:  60.9, south:  49.9, west:  -8.2, east:   1.8 } },
  { code: 'US', name: 'United States',    bbox: { north:  49.4, south:  24.4, west:-125.0, east: -66.9 } },
];

// ---------------------------------------------------------------------------
// Internal form state
// ---------------------------------------------------------------------------

type FormStep = 'closed' | 'type-pick' | 'geo' | 'time' | 'value';

interface FormState {
  step: FormStep;
  geoMode: 'bbox' | 'polygon' | 'country';
  bboxNorth: string; bboxSouth: string; bboxWest: string; bboxEast: string;
  country: string;
  geoField: string;
  polygonPoints: Array<[number, number]>;
  timeMode: TimeMode;
  timeField: string;
  timeBefore: string; timeAfter: string;
  timeBetweenFrom: string; timeBetweenTo: string;
  timeLastAmount: string; timeLastUnit: TimeUnit;
  valueIndex: string;
  valueField: string;
  valueFieldType: ValueFieldType;
  valueOp: ValueOp;
  valueInput: string;
  valueInputTo: string;
  valueTerms: string[];
  scope: string[];
}

function defaultForm(allIndexes: string[]): FormState {
  return {
    step: 'closed',
    geoMode: 'bbox',
    bboxNorth: '60', bboxSouth: '35', bboxWest: '-10', bboxEast: '40',
    country: 'FR',
    geoField: 'location',
    polygonPoints: [],
    timeMode: 'last',
    timeField: 'timestamp',
    timeBefore: '', timeAfter: '',
    timeBetweenFrom: '', timeBetweenTo: '',
    timeLastAmount: '24', timeLastUnit: 'hour',
    valueIndex: allIndexes[0] ?? '',
    valueField: '',
    valueFieldType: 'number',
    valueOp: 'gt',
    valueInput: '',
    valueInputTo: '',
    valueTerms: [],
    scope: [...allIndexes],
  };
}

// ---------------------------------------------------------------------------
// Inferred field info for value filters
// ---------------------------------------------------------------------------

interface FieldInfo {
  name: string;
  type: ValueFieldType;
  values?: string[];
}

// ---------------------------------------------------------------------------
// FilterPanel
// ---------------------------------------------------------------------------

export interface FilterPanelOptions {
  bodyEl: HTMLElement;
  engine: FilterEngine;
  getIndexes: () => string[];
  getFeatures: (id: string) => Feature[];
  onStartDrawPolygon?: () => void;
  onStartDrawBbox?: () => void;
  mapEngine?: MapEngine;
}

export class FilterPanel {
  private _engine: FilterEngine;
  private _bodyEl: HTMLElement;
  private _getIndexes: () => string[];
  private _getFeatures: (id: string) => Feature[];
  private _onStartDrawPolygon?: () => void;
  private _onStartDrawBbox?: () => void;
  private _mapEngine: MapEngine | null;

  private _form: FormState;
  private _fieldCache = new Map<string, FieldInfo[]>();
  private _activeSection: 'filters' | 'views' = 'filters';
  private _showViewSaveForm = false;
  /** Tracks which saved-filter categories are collapsed (persists across renders). */
  private _collapsedLibraryCats = new Set<string>();

  // SVG overlay for geo filter hover preview
  private _hoverSvg: SVGSVGElement | null = null;
  private _hoverMapMoveHandler: (() => void) | null = null;

  constructor(opts: FilterPanelOptions) {
    this._engine = opts.engine;
    this._bodyEl = opts.bodyEl;
    this._getIndexes = opts.getIndexes;
    this._getFeatures = opts.getFeatures;
    this._onStartDrawPolygon = opts.onStartDrawPolygon;
    this._onStartDrawBbox    = opts.onStartDrawBbox;
    this._mapEngine = opts.mapEngine ?? null;
    this._form = defaultForm(opts.getIndexes());
  }

  setPolygonPoints(points: Array<[number, number]>): void {
    this._form.polygonPoints = points;
    if (this._form.step === 'geo' && this._form.geoMode === 'polygon') {
      this.render();
    }
  }

  setBboxPoints(a: [number, number], b: [number, number]): void {
    this._form.bboxNorth = String(Math.max(a[1], b[1]).toFixed(6));
    this._form.bboxSouth = String(Math.min(a[1], b[1]).toFixed(6));
    this._form.bboxWest  = String(Math.min(a[0], b[0]).toFixed(6));
    this._form.bboxEast  = String(Math.max(a[0], b[0]).toFixed(6));
    if (this._form.step === 'geo' && this._form.geoMode === 'bbox') {
      this.render();
    }
  }

  render(): void {
    // Clean up any hover preview (cards are about to be destroyed)
    this._hideGeoPreview();

    const body = this._bodyEl;
    body.innerHTML = '';

    const countEl = document.getElementById('fp-count');
    if (countEl) {
      const n = this._engine.count();
      countEl.textContent = n > 0 ? String(n) : '0';
      countEl.classList.toggle('fp-count--active', this._engine.activeCount() > 0);
    }

    if (this._form.step === 'closed') {
      this._form.scope = [...this._getIndexes()];
      if (!this._form.valueIndex && this._getIndexes().length > 0) {
        this._form.valueIndex = this._getIndexes()[0];
      }
    }

    body.appendChild(this._makeTabBar());

    if (this._activeSection === 'filters') {
      this._renderFiltersSection(body);
    } else {
      this._renderViewsSection(body);
    }
  }

  private _makeTabBar(): HTMLElement {
    const bar = _el('div', { class: 'fp-tab-bar' });
    const filterTab = _el('button', {
      class: `fp-tab${this._activeSection === 'filters' ? ' fp-tab--active' : ''}`,
    }, 'Filters');
    filterTab.addEventListener('click', () => { this._activeSection = 'filters'; this.render(); });

    const viewTab = _el('button', {
      class: `fp-tab${this._activeSection === 'views' ? ' fp-tab--active' : ''}`,
    }, 'Views');
    viewTab.addEventListener('click', () => { this._activeSection = 'views'; this.render(); });

    bar.appendChild(filterTab);
    bar.appendChild(viewTab);
    return bar;
  }

  private _renderFiltersSection(body: HTMLElement): void {
    if (this._engine.count() === 0 && this._form.step === 'closed') {
      body.appendChild(_el('div', { class: 'fp-empty' }, 'No active filters'));
    }
    for (const filter of this._engine.filters) {
      body.appendChild(this._makeCard(filter));
    }
    body.appendChild(this._makeAddArea());

    // Saved filters library
    const saved = this._engine.savedFilters;
    if (saved.length > 0) {
      body.appendChild(this._makeSavedFilterLibrary(saved));
    }
  }

  private _makeSavedFilterLibrary(saved: ActiveFilter[]): HTMLElement {
    const area = _el('div', { class: 'fp-library-area' });
    area.appendChild(_el('div', { class: 'fp-library-title' }, 'Saved Filters'));

    // Group by kind (geo / time / value)
    // SVG icons (stroke-based, 24×24 viewBox) replace emojis for consistency
    const CAT_ICONS: Record<string, string> = {
      geo:   '<circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 13 8 13s8-7.75 8-13a8 8 0 0 0-8-8z"/>',
      time:  '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      value: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    };
    const groups: Record<string, { label: string; icon: string; badge: string; filters: ActiveFilter[] }> = {
      geo:   { label: 'Geo Filters',   icon: CAT_ICONS.geo,   badge: 'GEO',  filters: [] },
      time:  { label: 'Time Filters',  icon: CAT_ICONS.time,  badge: 'TIME', filters: [] },
      value: { label: 'Value Filters', icon: CAT_ICONS.value, badge: 'VAL',  filters: [] },
    };

    for (const f of saved) {
      const g = groups[f.kind];
      if (g) g.filters.push(f);
    }

    for (const [kind, group] of Object.entries(groups)) {
      if (group.filters.length === 0) continue;

      // Sort within group alphabetically
      group.filters.sort((a, b) => a.label.localeCompare(b.label));

      const isCollapsed = this._collapsedLibraryCats.has(kind);
      const section = _el('div', { class: 'fp-library-cat' });

      // Collapsible header
      const header = _el('div', { class: 'fp-library-cat__header' });
      const arrow = _el('span', {
        class: `fp-library-cat__arrow${isCollapsed ? '' : ' fp-library-cat__arrow--open'}`,
      });
      arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg>';
      const catIcon = _el('span', { class: 'fp-library-cat__icon' });
      catIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">${group.icon}</svg>`;
      const catLabel = _el('span', { class: 'fp-library-cat__label' }, group.label);
      const countBadge = _el('span', { class: 'fp-library-cat__count' }, String(group.filters.length));
      header.append(arrow, catIcon, catLabel, countBadge);

      header.addEventListener('click', () => {
        if (this._collapsedLibraryCats.has(kind)) {
          this._collapsedLibraryCats.delete(kind);
        } else {
          this._collapsedLibraryCats.add(kind);
        }
        this.render();
      });

      section.appendChild(header);

      // Items list (hidden when collapsed)
      if (!isCollapsed) {
        const list = _el('div', { class: 'fp-library-cat__list' });
        for (const f of group.filters) {
          const item = _el('div', { class: 'fp-library-item' });
          const badge = _el('span', {
            class: `fp-library-item__badge fp-badge--${f.kind}`,
          }, group.badge);
          const name = _el('span', { class: 'fp-library-item__name' }, f.label);
          const addBtn = _el('button', { class: 'fp-library-item__add' }, '+ Add');
          addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._engine.addFromLibrary(f.id);
            this.render();
          });
          const delBtn = _el('button', { class: 'fp-library-item__del' }, '×');
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._engine.removeSavedFilter(f.id);
            this.render();
          });
          item.append(badge, name, addBtn, delBtn);
          list.appendChild(item);
        }
        section.appendChild(list);
      }

      area.appendChild(section);
    }

    return area;
  }

  private _renderViewsSection(body: HTMLElement): void {
    const views = this._engine.views;

    if (views.length === 0 && !this._showViewSaveForm) {
      body.appendChild(_el('div', { class: 'fp-empty' }, 'No saved views'));
    }

    for (const view of views) {
      body.appendChild(this._makeViewCard(view));
    }

    if (this._showViewSaveForm) {
      body.appendChild(this._makeViewSaveForm());
    } else {
      const saveArea = _el('div', { class: 'fp-add-area' });
      const saveBtn = _el('button', { class: 'fp-add-btn' });
      saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save current filters as view`;
      saveBtn.addEventListener('click', () => { this._showViewSaveForm = true; this.render(); });
      if (this._engine.count() === 0) {
        saveBtn.style.opacity = '0.4';
        saveBtn.style.pointerEvents = 'none';
      }
      saveArea.appendChild(saveBtn);
      body.appendChild(saveArea);
    }
  }

  private _makeViewCard(view: FilterView): HTMLElement {
    const card = _el('div', { class: `fp-card fp-view-card${view.active ? ' fp-view-card--active' : ''}` });
    const header = _el('div', { class: 'fp-card-header' });
    const badge = _el('span', { class: 'fp-badge fp-badge--view' }, 'VIEW');
    const labelEl = _el('span', { class: 'fp-card-label' }, view.name);

    const tog = _el('div', {
      class: `fp-toggle${view.active ? ' fp-toggle--on' : ''}`,
      title: view.active ? 'Deactivate view' : 'Activate view',
    });
    tog.addEventListener('click', e => {
      e.stopPropagation();
      this._engine.toggleView(view.name);
      this.render();
    });

    const del = _el('button', { class: 'fp-card-delete', title: 'Remove view' }, '×');
    del.addEventListener('click', e => {
      e.stopPropagation();
      this._engine.removeView(view.name);
      this.render();
    });

    header.appendChild(badge);
    header.appendChild(labelEl);
    header.appendChild(tog);
    header.appendChild(del);

    const summary = _el('div', { class: 'fp-card-summary' });
    const filterCount = view.filters.length;
    const date = new Date(view.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    summary.textContent = `${filterCount} filter${filterCount !== 1 ? 's' : ''} · ${date}`;
    if (view.description) summary.textContent += ` · ${view.description}`;

    card.appendChild(header);
    card.appendChild(summary);
    return card;
  }

  private _makeViewSaveForm(): HTMLElement {
    const wrap = _el('div', { class: 'fp-form', style: 'padding: 8px;' });
    const title = _el('div', { class: 'fp-form-title' });
    title.appendChild(_el('span', {}, 'Save as View'));
    const cancel = _el('button', { class: 'fp-btn fp-btn--ghost fp-btn--sm' }, 'Cancel');
    cancel.addEventListener('click', () => { this._showViewSaveForm = false; this.render(); });
    title.appendChild(cancel);
    wrap.appendChild(title);

    const formBody = _el('div', { class: 'fp-form-body' });
    formBody.appendChild(this._makeField('Name',
      this._makeInput('view-name', 'text', '', 'e.g. Mediterranean Watch'),
    ));
    formBody.appendChild(this._makeField('Description (optional)',
      this._makeInput('view-desc', 'text', '', 'Brief description...'),
    ));
    wrap.appendChild(formBody);

    const actions = _el('div', { class: 'fp-form-actions' });
    const saveBtn = _el('button', { class: 'fp-btn fp-btn--primary' }, 'Save View');
    saveBtn.addEventListener('click', () => {
      const nameEl = this._bodyEl.querySelector<HTMLInputElement>('[data-name="view-name"]');
      const descEl = this._bodyEl.querySelector<HTMLInputElement>('[data-name="view-desc"]');
      const name = nameEl?.value.trim();
      if (!name) { _showError('Enter a view name.'); return; }
      this._engine.saveView(name, descEl?.value.trim() || undefined);
      this._showViewSaveForm = false;
      this.render();
    });
    actions.appendChild(saveBtn);
    wrap.appendChild(actions);
    return wrap;
  }

  private _makeCard(f: ActiveFilter): HTMLElement {
    const card = _el('div', { class: `fp-card${f.enabled ? '' : ' fp-card--off'}` });
    const header = _el('div', { class: 'fp-card-header' });
    const badge = _el('span', { class: `fp-badge fp-badge--${f.kind}` },
      f.kind === 'geo' ? 'GEO' : f.kind === 'time' ? 'TIME' : 'VAL');

    // Label with inline rename on double-click — updates live while typing
    const labelEl = _el('span', { class: 'fp-card-label' }, f.label);
    labelEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = _el('input', { class: 'fp-rename-input', type: 'text', value: f.label }) as HTMLInputElement;
      input.value = f.label;

      // Live rename on every keystroke (silent = true to avoid re-render)
      input.addEventListener('input', () => {
        const newName = input.value.trim();
        if (newName) {
          this._engine.rename(f.id, newName, true);
        }
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === 'Escape') {
          input.blur();
        }
      });
      input.addEventListener('blur', () => {
        // Final rename with event emission for persistence
        const finalName = input.value.trim();
        if (finalName && finalName !== f.label) {
          this._engine.rename(f.id, finalName);
        }
        this.render();
      });

      labelEl.textContent = '';
      labelEl.appendChild(input);
      input.focus();
      input.select();
    });

    const tog = _el('div', {
      class: `fp-toggle${f.enabled ? ' fp-toggle--on' : ''}`,
      title: f.enabled ? 'Disable filter' : 'Enable filter',
    });
    tog.addEventListener('click', e => { e.stopPropagation(); this._engine.toggle(f.id); this.render(); });

    // Save to library button (material save icon)
    const saveToLib = _el('button', { class: 'fp-save-btn', title: 'Save to library' });
    saveToLib.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    saveToLib.addEventListener('click', e => {
      e.stopPropagation();
      const ok = this._engine.saveFilter(f);
      if (!ok) {
        saveToLib.title = 'A filter with this name already exists';
        saveToLib.classList.add('fp-save-btn--error');
        setTimeout(() => {
          saveToLib.title = 'Save to library';
          saveToLib.classList.remove('fp-save-btn--error');
        }, 1500);
        return;
      }
      this.render();
    });

    const del = _el('button', { class: 'fp-card-delete', title: 'Remove filter' }, '×');
    del.addEventListener('click', e => { e.stopPropagation(); this._engine.remove(f.id); });

    header.appendChild(badge);
    header.appendChild(labelEl);
    header.appendChild(saveToLib);
    header.appendChild(tog);
    header.appendChild(del);

    const summary = _el('div', { class: 'fp-card-summary' }, this._summary(f));
    const scope = _el('div', { class: 'fp-card-scope' });
    const scopeList = f.scope.includes('*') ? ['all indexes'] : f.scope;
    for (const s of scopeList) scope.appendChild(_el('span', { class: 'fp-scope-tag' }, s));

    card.appendChild(header);
    card.appendChild(summary);
    card.appendChild(scope);

    // Hover preview for geo filters — show shape on map
    if (f.kind === 'geo' && this._mapEngine) {
      card.addEventListener('mouseenter', () => this._showGeoPreview(f as GeoFilter));
      card.addEventListener('mouseleave', () => this._hideGeoPreview());
    }

    return card;
  }

  // ── Geo filter hover preview ──────────────────────────────────────────────

  private _showGeoPreview(f: GeoFilter): void {
    if (!this._mapEngine) return;
    this._hideGeoPreview(); // clean up any previous

    const map = this._mapEngine.map;
    const container = map.getContainer();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'geo-hover-overlay');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:11;';
    container.appendChild(svg);
    this._hoverSvg = svg;
    const renderShape = () => {
      if (!this._hoverSvg) return;
      this._hoverSvg.innerHTML = '';

      if (f.mode === 'bbox') {
        const bbox = f.bbox;
        if (!bbox) return;
        // Project corners to screen
        const nw = map.project([bbox.west, bbox.north]);
        const se = map.project([bbox.east, bbox.south]);
        const x = Math.min(nw.x, se.x);
        const y = Math.min(nw.y, se.y);
        const w = Math.abs(se.x - nw.x);
        const h = Math.abs(se.y - nw.y);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        rect.setAttribute('fill', 'rgba(251, 191, 36, 0.15)');
        rect.setAttribute('stroke', '#fbbf24');
        rect.setAttribute('stroke-width', '2.5');
        rect.setAttribute('stroke-dasharray', '8 4');
        this._hoverSvg.appendChild(rect);
      } else if (f.mode === 'polygon' && f.polygon && f.polygon.length >= 3) {
        const screenPts = f.polygon.map(p => {
          const px = map.project(p as [number, number]);
          return `${px.x},${px.y}`;
        });
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', screenPts.join(' '));
        poly.setAttribute('fill', 'rgba(251, 191, 36, 0.15)');
        poly.setAttribute('stroke', '#fbbf24');
        poly.setAttribute('stroke-width', '2.5');
        poly.setAttribute('stroke-dasharray', '8 4');
        this._hoverSvg.appendChild(poly);
      } else if (f.mode === 'country' && f.country) {
        // Look up country bbox from catalogue
        const c = COUNTRIES.find(c => c.code === f.country);
        if (!c) return;
        const nw = map.project([c.bbox.west, c.bbox.north]);
        const se = map.project([c.bbox.east, c.bbox.south]);
        const x = Math.min(nw.x, se.x);
        const y = Math.min(nw.y, se.y);
        const w = Math.abs(se.x - nw.x);
        const h = Math.abs(se.y - nw.y);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        rect.setAttribute('fill', 'rgba(251, 191, 36, 0.15)');
        rect.setAttribute('stroke', '#fbbf24');
        rect.setAttribute('stroke-width', '2.5');
        rect.setAttribute('stroke-dasharray', '8 4');
        this._hoverSvg.appendChild(rect);

        // Country label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(x + w / 2));
        text.setAttribute('y', String(y + h / 2));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', '#fbbf24');
        text.setAttribute('font-size', '13');
        text.setAttribute('font-weight', '600');
        text.setAttribute('font-family', 'Inter, system-ui, sans-serif');
        text.textContent = c.name;
        this._hoverSvg.appendChild(text);
      }
    };

    renderShape();

    // Re-render on map move/zoom
    this._hoverMapMoveHandler = renderShape;
    map.on('move', this._hoverMapMoveHandler);
  }

  private _hideGeoPreview(): void {
    if (this._hoverSvg && this._hoverSvg.parentNode) {
      this._hoverSvg.parentNode.removeChild(this._hoverSvg);
    }
    this._hoverSvg = null;
    if (this._hoverMapMoveHandler && this._mapEngine) {
      this._mapEngine.map.off('move', this._hoverMapMoveHandler);
      this._hoverMapMoveHandler = null;
    }
  }

  private _makeAddArea(): HTMLElement {
    const area = _el('div', { class: 'fp-add-area' });
    if (this._form.step === 'closed') {
      const btn = _el('button', { class: 'fp-add-btn' });
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add filter`;
      btn.addEventListener('click', () => { this._form.step = 'type-pick'; this.render(); });
      area.appendChild(btn);
      return area;
    }
    if (this._form.step === 'type-pick') { area.appendChild(this._makeTypePicker()); return area; }
    area.appendChild(this._makeForm());
    return area;
  }

  private _makeTypePicker(): HTMLElement {
    const wrap = _el('div', { class: 'fp-type-picker' });
    const title = _el('div', { class: 'fp-form-title' });
    title.innerHTML = '<span>Select filter type</span>';
    const cancel = _el('button', { class: 'fp-btn fp-btn--ghost fp-btn--sm' }, 'Cancel');
    cancel.addEventListener('click', () => { this._form.step = 'closed'; this.render(); });
    title.appendChild(cancel);
    wrap.appendChild(title);

    // Time filters are managed via the toolbar Time modal — only geo + value here.
    const types: Array<{ kind: FormStep & ('geo' | 'time' | 'value'); icon: string; label: string; desc: string }> = [
      { kind: 'geo', label: 'Geographic', icon: '<circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 13 8 13s8-7.75 8-13a8 8 0 0 0-8-8z"/>', desc: 'Bounding box, draw polygon, or country' },
      { kind: 'value', label: 'Value', icon: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>', desc: 'Filter by field value on an index' },
    ];

    for (const t of types) {
      const card = _el('div', { class: 'fp-type-card' });
      const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      iconSvg.setAttribute('viewBox', '0 0 24 24');
      iconSvg.setAttribute('fill', 'none');
      iconSvg.setAttribute('stroke', 'currentColor');
      iconSvg.setAttribute('stroke-width', '2');
      iconSvg.setAttribute('width', '20');
      iconSvg.setAttribute('height', '20');
      iconSvg.innerHTML = t.icon;
      const info = _el('div', { class: 'fp-type-info' },
        _el('strong', {}, t.label),
        _el('span', { class: 'fp-type-desc' }, t.desc),
      );
      card.appendChild(iconSvg);
      card.appendChild(info);
      card.addEventListener('click', () => {
        this._form.step = t.kind;
        this._form.scope = [...this._getIndexes()];
        if (t.kind === 'value' && this._getIndexes().length > 0) {
          this._form.valueIndex = this._getIndexes()[0];
          this._loadFields(this._form.valueIndex);
        }
        this.render();
      });
      wrap.appendChild(card);
    }
    return wrap;
  }

  private _makeForm(): HTMLElement {
    const wrap = _el('div', { class: 'fp-form' });
    const header = _el('div', { class: 'fp-form-title' });
    const kindLabel = this._form.step === 'geo' ? 'Geographic' : this._form.step === 'time' ? 'Time' : 'Value';
    header.appendChild(_el('span', {}, `${kindLabel} filter`));
    const back = _el('button', { class: 'fp-btn fp-btn--ghost fp-btn--sm' }, '← Back');
    back.addEventListener('click', () => { this._readDomIntoForm(); this._form.step = 'type-pick'; this.render(); });
    header.appendChild(back);
    wrap.appendChild(header);

    if (this._form.step === 'geo')   wrap.appendChild(this._makeGeoForm());
    if (this._form.step === 'time')  wrap.appendChild(this._makeTimeForm());
    if (this._form.step === 'value') wrap.appendChild(this._makeValueForm());

    if (this._form.step !== 'value') wrap.appendChild(this._makeScopeSelector());

    const actions = _el('div', { class: 'fp-form-actions' });
    const addBtn = _el('button', { class: 'fp-btn fp-btn--primary' }, 'Add Filter');
    addBtn.addEventListener('click', () => this._submit());
    const cancelBtn = _el('button', { class: 'fp-btn fp-btn--ghost' }, 'Cancel');
    cancelBtn.addEventListener('click', () => { this._form.step = 'closed'; this.render(); });
    actions.appendChild(addBtn);
    actions.appendChild(cancelBtn);
    wrap.appendChild(actions);
    return wrap;
  }

  // -- Geo form with icon button mode selector --

  private _makeGeoForm(): HTMLElement {
    const root = _el('div', { class: 'fp-form-body' });

    const modeBar = _el('div', { class: 'fp-icon-bar' });
    const modes: Array<{ mode: 'bbox' | 'polygon' | 'country'; icon: string; label: string }> = [
      { mode: 'bbox', label: 'Bbox', icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>' },
      { mode: 'polygon', label: 'Polygon', icon: '<path d="M12 3l8 5.5v7L12 21l-8-5.5v-7L12 3z"/>' },
      { mode: 'country', label: 'Country', icon: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' },
    ];

    for (const m of modes) {
      const btn = _el('button', {
        class: `fp-icon-btn${this._form.geoMode === m.mode ? ' fp-icon-btn--active' : ''}`,
        title: m.label,
      });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
      svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
      svg.innerHTML = m.icon;
      btn.appendChild(svg);
      btn.appendChild(_el('span', { class: 'fp-icon-btn__label' }, m.label));
      btn.addEventListener('click', () => {
        this._readDomIntoForm();
        this._form.geoMode = m.mode;
        this.render();
      });
      modeBar.appendChild(btn);
    }
    root.appendChild(modeBar);

    if (this._form.geoMode === 'bbox') {
      const drawArea = _el('div', { class: 'fp-draw-area' });
      const drawBtn = _el('button', { class: 'fp-btn fp-btn--primary', style: 'width:100%' });
      drawBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="display:inline;vertical-align:middle;margin-right:6px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg> Draw on map`;
      drawBtn.addEventListener('click', () => { if (this._onStartDrawBbox) this._onStartDrawBbox(); });
      drawArea.appendChild(drawBtn);
      const bboxSet = this._form.bboxNorth !== '' && this._form.bboxSouth !== '' &&
                      this._form.bboxWest  !== '' && this._form.bboxEast  !== '';
      drawArea.appendChild(_el('div', { class: 'fp-hint' },
        bboxSet
          ? `N ${parseFloat(this._form.bboxNorth).toFixed(4)}° · S ${parseFloat(this._form.bboxSouth).toFixed(4)}° · W ${parseFloat(this._form.bboxWest).toFixed(4)}° · E ${parseFloat(this._form.bboxEast).toFixed(4)}°`
          : 'Click two opposite corners on the map.',
      ));
      root.appendChild(drawArea);

      const grid = _el('div', { class: 'fp-bbox-grid' });
      grid.appendChild(this._makeLabeledInput('North °', 'bbox-north', 'number', this._form.bboxNorth, '-90', '90'));
      grid.appendChild(this._makeLabeledInput('South °', 'bbox-south', 'number', this._form.bboxSouth, '-90', '90'));
      grid.appendChild(this._makeLabeledInput('West °',  'bbox-west',  'number', this._form.bboxWest, '-180', '180'));
      grid.appendChild(this._makeLabeledInput('East °',  'bbox-east',  'number', this._form.bboxEast, '-180', '180'));
      root.appendChild(grid);
    }

    if (this._form.geoMode === 'polygon') {
      const drawArea = _el('div', { class: 'fp-draw-area' });
      const drawBtn = _el('button', { class: 'fp-btn fp-btn--primary', style: 'width:100%' });
      drawBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="display:inline;vertical-align:middle;margin-right:6px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/></svg> Draw on map`;
      drawBtn.addEventListener('click', () => { if (this._onStartDrawPolygon) this._onStartDrawPolygon(); });
      drawArea.appendChild(drawBtn);
      if (this._form.polygonPoints.length > 0) {
        drawArea.appendChild(_el('div', { class: 'fp-hint' }, `${this._form.polygonPoints.length} vertices drawn`));
      } else {
        drawArea.appendChild(_el('div', { class: 'fp-hint' }, 'Click points on the map, double-click to finish.'));
      }
      root.appendChild(drawArea);
    }

    if (this._form.geoMode === 'country') {
      const opts = COUNTRIES.map(c => ({ value: c.code, label: c.name }));
      root.appendChild(this._makeField('Country', this._makeSelect('country-code', opts, this._form.country)));
    }

    root.appendChild(this._makeField('Geo field', this._makeInput('geo-field', 'text', this._form.geoField, 'location')));
    return root;
  }

  // -- Time form with tab-like mode selector --

  private _makeTimeForm(): HTMLElement {
    const root = _el('div', { class: 'fp-form-body' });

    const modeBar = _el('div', { class: 'fp-mode-tabs' });
    const timeModes: Array<{ mode: TimeMode; label: string; icon: string }> = [
      { mode: 'last',    label: 'Last',    icon: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>' },
      { mode: 'before',  label: 'Before',  icon: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>' },
      { mode: 'after',   label: 'After',   icon: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>' },
      { mode: 'between', label: 'Range',   icon: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="8 5 5 12 8 19"/><polyline points="16 5 19 12 16 19"/>' },
    ];

    for (const tm of timeModes) {
      const tab = _el('button', {
        class: `fp-mode-tab${this._form.timeMode === tm.mode ? ' fp-mode-tab--active' : ''}`,
      });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
      svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
      svg.innerHTML = tm.icon;
      tab.appendChild(svg);
      tab.appendChild(_el('span', {}, tm.label));
      tab.addEventListener('click', () => {
        this._readDomIntoForm();
        this._form.timeMode = tm.mode;
        this.render();
      });
      modeBar.appendChild(tab);
    }
    root.appendChild(modeBar);

    if (this._form.timeMode === 'last') {
      const row = _el('div', { class: 'fp-row-inline' });
      const inp = this._makeInput('time-last-amount', 'number', this._form.timeLastAmount, '24');
      inp.setAttribute('min', '1');
      row.appendChild(inp);
      row.appendChild(this._makeSelect('time-last-unit', [
        { value: 'minute', label: 'minutes' }, { value: 'hour', label: 'hours' },
        { value: 'day', label: 'days' }, { value: 'week', label: 'weeks' },
      ], this._form.timeLastUnit));
      root.appendChild(this._makeField('Duration', row));
    }

    if (this._form.timeMode === 'before') {
      root.appendChild(this._makeField('Before', this._makeInput('time-before', 'datetime-local', this._form.timeBefore)));
    }
    if (this._form.timeMode === 'after') {
      root.appendChild(this._makeField('After', this._makeInput('time-after', 'datetime-local', this._form.timeAfter)));
    }
    if (this._form.timeMode === 'between') {
      root.appendChild(this._makeField('From', this._makeInput('time-between-from', 'datetime-local', this._form.timeBetweenFrom)));
      root.appendChild(this._makeField('To', this._makeInput('time-between-to', 'datetime-local', this._form.timeBetweenTo)));
    }

    root.appendChild(this._makeField('Field name', this._makeInput('time-field', 'text', this._form.timeField, 'timestamp')));
    return root;
  }

  // -- Value form with enhanced field picker --

  private _makeValueForm(): HTMLElement {
    const root = _el('div', { class: 'fp-form-body' });
    const indexes = this._getIndexes();

    root.appendChild(this._makeField('Index', this._makeSelect('value-index',
      indexes.map(i => ({ value: i, label: i })), this._form.valueIndex,
      val => { this._readDomIntoForm(); this._form.valueIndex = val; this._form.valueField = ''; this._loadFields(val); this.render(); },
    )));

    this._form.scope = this._form.valueIndex ? [this._form.valueIndex] : [];

    const fields = this._getFields(this._form.valueIndex);
    if (fields.length > 0) {
      if (!fields.find(f => f.name === this._form.valueField)) {
        this._form.valueField = fields[0].name;
        this._form.valueFieldType = fields[0].type;
      }

      // Enhanced field picker with type badges
      const fieldPicker = _el('div', { class: 'fp-field-picker' });
      for (const field of fields) {
        const item = _el('div', {
          class: `fp-field-item${field.name === this._form.valueField ? ' fp-field-item--active' : ''}`,
        });
        const typeBadge = _el('span', {
          class: `fp-field-type fp-field-type--${field.type}`,
        }, field.type === 'number' ? '#' : field.type === 'keyword' ? 'K' : field.type === 'date' ? 'D' : 'T');
        item.appendChild(typeBadge);
        item.appendChild(_el('span', { class: 'fp-field-name' }, field.name));
        item.addEventListener('click', () => {
          this._readDomIntoForm();
          this._form.valueField = field.name;
          this._form.valueFieldType = field.type;
          this._form.valueOp = field.type === 'number' ? 'gt' : 'in';
          this._form.valueTerms = [];
          this.render();
        });
        fieldPicker.appendChild(item);
      }
      root.appendChild(this._makeField('Field', fieldPicker));

      const currentField = fields.find(f => f.name === this._form.valueField);
      if (currentField) this._renderValueControls(root, currentField);
    } else {
      root.appendChild(_el('p', { class: 'fp-hint' }, 'No fields found.'));
    }
    return root;
  }

  private _renderValueControls(root: HTMLElement, field: FieldInfo): void {
    if (field.type === 'number') {
      const numOps = [
        { value: 'gt', label: '> greater than' }, { value: 'gte', label: '≥ at least' },
        { value: 'lt', label: '< less than' }, { value: 'lte', label: '≤ at most' },
        { value: 'between', label: '↔ between' }, { value: 'eq', label: '= equals' },
        { value: 'ne', label: '≠ not equals' },
      ];
      root.appendChild(this._makeField('Operator', this._makeSelect('value-op', numOps, this._form.valueOp, val => {
        this._readDomIntoForm(); this._form.valueOp = val as ValueOp; this.render();
      })));
      if (this._form.valueOp === 'between') {
        const row = _el('div', { class: 'fp-row-inline' });
        row.appendChild(this._makeInput('value-input', 'number', this._form.valueInput, 'min'));
        row.appendChild(_el('span', { class: 'fp-row-sep' }, '–'));
        row.appendChild(this._makeInput('value-input-to', 'number', this._form.valueInputTo, 'max'));
        root.appendChild(this._makeField('Range', row));
      } else {
        root.appendChild(this._makeField('Value', this._makeInput('value-input', 'number', this._form.valueInput)));
      }
    } else if (field.type === 'keyword' && field.values && field.values.length > 0) {
      const kwOps = [
        { value: 'in', label: 'is one of' }, { value: 'not_in', label: 'is not one of' },
        { value: 'eq', label: '= equals' }, { value: 'ne', label: '≠ not equals' },
      ];
      root.appendChild(this._makeField('Operator', this._makeSelect('value-op', kwOps, this._form.valueOp, val => {
        this._readDomIntoForm(); this._form.valueOp = val as ValueOp; this.render();
      })));

      if (this._form.valueOp === 'in' || this._form.valueOp === 'not_in') {
        const list = _el('div', { class: 'fp-checklist' });
        for (const v of field.values) {
          const checked = this._form.valueTerms.includes(v);
          const item = _el('label', { class: 'fp-check-item' });
          const cb = _el('input', { type: 'checkbox', 'data-term': v }) as HTMLInputElement;
          cb.checked = checked;
          cb.addEventListener('change', () => {
            if (cb.checked) { if (!this._form.valueTerms.includes(v)) this._form.valueTerms.push(v); }
            else { this._form.valueTerms = this._form.valueTerms.filter(t => t !== v); }
          });
          item.appendChild(cb);
          item.appendChild(_el('span', {}, v));
          list.appendChild(item);
        }
        root.appendChild(this._makeField('Values', list));
      } else {
        root.appendChild(this._makeField('Value', this._makeSelect('value-input',
          field.values.map(v => ({ value: v, label: v })), this._form.valueInput || field.values[0],
        )));
      }
    } else {
      const txtOps = [{ value: 'eq', label: '= equals' }, { value: 'ne', label: '≠ not equals' }];
      root.appendChild(this._makeField('Operator', this._makeSelect('value-op', txtOps, this._form.valueOp, val => {
        this._readDomIntoForm(); this._form.valueOp = val as ValueOp; this.render();
      })));
      root.appendChild(this._makeField('Value', this._makeInput('value-input', 'text', this._form.valueInput)));
    }
  }

  private _makeScopeSelector(): HTMLElement {
    const wrap = _el('div', { class: 'fp-scope-section' });
    wrap.appendChild(_el('div', { class: 'fp-scope-label' }, 'Apply to indexes'));
    const indexes = this._getIndexes();
    if (indexes.length === 0) { wrap.appendChild(_el('p', { class: 'fp-hint' }, 'No active indexes')); return wrap; }

    const list = _el('div', { class: 'fp-checklist' });
    const allItem = _el('label', { class: 'fp-check-item' });
    const allCb = _el('input', { type: 'checkbox', id: 'scope-all' }) as HTMLInputElement;
    allCb.checked = this._form.scope.length === indexes.length;
    allCb.addEventListener('change', () => {
      this._form.scope = allCb.checked ? [...indexes] : [];
      wrap.querySelectorAll<HTMLInputElement>('[data-idx-cb]').forEach(cb => { cb.checked = allCb.checked; });
    });
    allItem.appendChild(allCb);
    allItem.appendChild(_el('span', { class: 'fp-check-all' }, 'All indexes'));
    list.appendChild(allItem);

    for (const idx of indexes) {
      const item = _el('label', { class: 'fp-check-item' });
      const cb = _el('input', { type: 'checkbox', 'data-idx-cb': idx }) as HTMLInputElement;
      cb.checked = this._form.scope.includes(idx);
      cb.addEventListener('change', () => {
        if (cb.checked) { if (!this._form.scope.includes(idx)) this._form.scope.push(idx); }
        else { this._form.scope = this._form.scope.filter(s => s !== idx); }
        allCb.checked = this._form.scope.length === indexes.length;
      });
      item.appendChild(cb);
      item.appendChild(_el('span', {}, idx));
      list.appendChild(item);
    }
    wrap.appendChild(list);
    return wrap;
  }

  private _submit(): void {
    this._readDomIntoForm();
    let filter: ActiveFilter | null = null;
    if (this._form.step === 'geo') filter = this._buildGeoFilter();
    else if (this._form.step === 'time') filter = this._buildTimeFilter();
    else if (this._form.step === 'value') filter = this._buildValueFilter();
    if (!filter) return;
    this._engine.add(filter);
    this._form = defaultForm(this._getIndexes());
    this.render();
  }

  private _buildGeoFilter(): GeoFilter | null {
    const scope = this._form.scope.length > 0 ? this._form.scope : ['*'];
    if (this._form.geoMode === 'bbox') {
      const n = parseFloat(this._form.bboxNorth), s = parseFloat(this._form.bboxSouth);
      const w = parseFloat(this._form.bboxWest), e = parseFloat(this._form.bboxEast);
      if ([n, s, w, e].some(isNaN)) { _showError('Enter valid coordinates.'); return null; }
      if (n <= s) { _showError('North > South required.'); return null; }
      if (e <= w) { _showError('East > West required.'); return null; }
      return { id: newFilterId(), kind: 'geo', enabled: true, scope, mode: 'bbox', geoField: this._form.geoField || 'location', bbox: { north: n, south: s, west: w, east: e }, label: `Bbox ${n.toFixed(1)}°N–${s.toFixed(1)}°N` };
    }
    if (this._form.geoMode === 'polygon') {
      const pts = this._form.polygonPoints;
      if (pts.length < 3) { _showError('Draw at least 3 points.'); return null; }
      return { id: newFilterId(), kind: 'geo', enabled: true, scope, mode: 'polygon', geoField: this._form.geoField || 'location', polygon: pts, label: `Polygon (${pts.length} pts)` };
    }
    if (this._form.geoMode === 'country') {
      const country = COUNTRIES.find(c => c.code === this._form.country);
      if (!country) { _showError('Select a country.'); return null; }
      return { id: newFilterId(), kind: 'geo', enabled: true, scope, mode: 'country', geoField: this._form.geoField || 'location', country: country.code, bbox: country.bbox, label: country.name };
    }
    return null;
  }

  private _buildTimeFilter(): TimeFilter | null {
    const scope = this._form.scope.length > 0 ? this._form.scope : ['*'];
    const field = this._form.timeField || 'timestamp';
    switch (this._form.timeMode) {
      case 'last': {
        const n = parseInt(this._form.timeLastAmount, 10);
        if (isNaN(n) || n < 1) { _showError('Enter positive duration.'); return null; }
        return { id: newFilterId(), kind: 'time', enabled: true, scope, field, mode: 'last', lastAmount: n, lastUnit: this._form.timeLastUnit, label: `Last ${n} ${this._form.timeLastUnit}${n !== 1 ? 's' : ''}` };
      }
      case 'before': {
        if (!this._form.timeBefore) { _showError('Select a date.'); return null; }
        return { id: newFilterId(), kind: 'time', enabled: true, scope, field, mode: 'before', to: this._form.timeBefore, label: `Before ${_fmtDate(this._form.timeBefore)}` };
      }
      case 'after': {
        if (!this._form.timeAfter) { _showError('Select a date.'); return null; }
        return { id: newFilterId(), kind: 'time', enabled: true, scope, field, mode: 'after', from: this._form.timeAfter, label: `After ${_fmtDate(this._form.timeAfter)}` };
      }
      case 'between': {
        if (!this._form.timeBetweenFrom || !this._form.timeBetweenTo) { _showError('Select both dates.'); return null; }
        return { id: newFilterId(), kind: 'time', enabled: true, scope, field, mode: 'between', from: this._form.timeBetweenFrom, to: this._form.timeBetweenTo, label: `${_fmtDate(this._form.timeBetweenFrom)} – ${_fmtDate(this._form.timeBetweenTo)}` };
      }
    }
  }

  private _buildValueFilter(): ValueFilter | null {
    const idx = this._form.valueIndex, field = this._form.valueField;
    const ftype = this._form.valueFieldType, op = this._form.valueOp as ValueOp;
    if (!idx || !field) { _showError('Select index and field.'); return null; }
    const scope: FilterScope = [idx];
    if (op === 'in' || op === 'not_in') {
      const terms = [...document.querySelectorAll<HTMLInputElement>('[data-term]')].filter(cb => cb.checked).map(cb => cb.dataset.term!);
      if (terms.length === 0) { _showError('Select at least one value.'); return null; }
      return { id: newFilterId(), kind: 'value', enabled: true, scope, field, fieldType: ftype, op, terms, label: `${field} ${op === 'in' ? 'in' : 'not in'} [${terms.join(', ')}]` };
    }
    if (op === 'between') {
      const v = parseFloat(this._form.valueInput), v2 = parseFloat(this._form.valueInputTo);
      if (isNaN(v) || isNaN(v2)) { _showError('Enter valid range.'); return null; }
      return { id: newFilterId(), kind: 'value', enabled: true, scope, field, fieldType: ftype, op, value: v, valueTo: v2, label: `${field} ${v} – ${v2}` };
    }
    const raw = this._form.valueInput;
    if (raw === '') { _showError('Enter a value.'); return null; }
    const val: string | number = ftype === 'number' ? parseFloat(raw) : raw;
    const opLabel: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', ne: '≠' };
    return { id: newFilterId(), kind: 'value', enabled: true, scope, field, fieldType: ftype, op, value: val, label: `${field} ${opLabel[op] ?? op} ${val}` };
  }

  private _summary(f: ActiveFilter): string {
    if (f.kind === 'geo') {
      if (f.mode === 'bbox' && f.bbox) { const { north: n, south: s, west: w, east: e } = f.bbox; return `${_dd(n)}N ${_dd(s)}S ${_dd(w)}W ${_dd(e)}E`; }
      if (f.mode === 'polygon' && f.polygon) return `${f.polygon.length} vertices`;
      if (f.mode === 'country') return `Country: ${f.country ?? ''}`;
      return 'Geographic zone';
    }
    if (f.kind === 'time') {
      switch (f.mode) {
        case 'last': return `Last ${f.lastAmount} ${f.lastUnit ?? 'hour'}${(f.lastAmount ?? 1) !== 1 ? 's' : ''}`;
        case 'before': return `Before ${_fmtDate(f.to ?? '')}`;
        case 'after': return `After ${_fmtDate(f.from ?? '')}`;
        case 'between': return `${_fmtDate(f.from ?? '')} → ${_fmtDate(f.to ?? '')}`;
      }
    }
    if (f.kind === 'value') {
      if (f.terms) return `${f.field} ∈ {${f.terms.join(', ')}}`;
      if (f.op === 'between') return `${f.field}: ${f.value} – ${f.valueTo}`;
      const opLabel: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', ne: '≠' };
      return `${f.field} ${opLabel[f.op] ?? f.op} ${f.value ?? ''}`;
    }
    return '';
  }

  private _loadFields(index: string): void {
    if (this._fieldCache.has(index)) return;
    const features = this._getFeatures(index);
    if (features.length === 0) { this._fieldCache.set(index, []); return; }
    const props = features[0].properties ?? {};
    const fields: FieldInfo[] = [];
    for (const [name, val] of Object.entries(props)) {
      if (name === '_id') continue;
      const type = _inferType(name, val, features);
      const info: FieldInfo = { name, type };
      if (type === 'keyword') {
        info.values = [...new Set(features.map(f => String(f.properties?.[name] ?? '')).filter(Boolean))].slice(0, 50);
      }
      fields.push(info);
    }
    this._fieldCache.set(index, fields);
  }

  private _getFields(index: string): FieldInfo[] {
    if (!this._fieldCache.has(index)) this._loadFields(index);
    return this._fieldCache.get(index) ?? [];
  }

  private _readDomIntoForm(): void {
    const get = (name: string): string => {
      const el = this._bodyEl.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-name="${name}"]`);
      return el ? el.value : '';
    };
    const bn = get('bbox-north'); if (bn) this._form.bboxNorth = bn;
    const bs = get('bbox-south'); if (bs) this._form.bboxSouth = bs;
    const bw = get('bbox-west');  if (bw) this._form.bboxWest  = bw;
    const be = get('bbox-east');  if (be) this._form.bboxEast  = be;
    const cc = get('country-code'); if (cc) this._form.country = cc;
    const gf = get('geo-field'); if (gf) this._form.geoField = gf;
    const tf = get('time-field'); if (tf) this._form.timeField = tf;
    const tla = get('time-last-amount'); if (tla) this._form.timeLastAmount = tla;
    const tlu = get('time-last-unit');   if (tlu) this._form.timeLastUnit = tlu as TimeUnit;
    const tb = get('time-before'); if (tb) this._form.timeBefore = tb;
    const ta = get('time-after');  if (ta) this._form.timeAfter = ta;
    const tfrom = get('time-between-from'); if (tfrom) this._form.timeBetweenFrom = tfrom;
    const tto = get('time-between-to');    if (tto)   this._form.timeBetweenTo   = tto;
    const vi = get('value-index'); if (vi) this._form.valueIndex = vi;
    const vf = get('value-field'); if (vf) this._form.valueField = vf;
    const vo = get('value-op');    if (vo) this._form.valueOp = vo as ValueOp;
    const vv = get('value-input');    if (vv) this._form.valueInput = vv;
    const vt = get('value-input-to'); if (vt) this._form.valueInputTo = vt;
    const scopeCbs = this._bodyEl.querySelectorAll<HTMLInputElement>('[data-idx-cb]');
    if (scopeCbs.length > 0) {
      this._form.scope = Array.from(scopeCbs).filter(cb => cb.checked).map(cb => cb.dataset.idxCb!);
    }
  }

  private _makeInput(name: string, type: string, value: string, placeholder = '', min?: string, max?: string): HTMLInputElement {
    const inp = _el('input', { 'data-name': name, type, value, placeholder, class: 'fp-input' }) as HTMLInputElement;
    if (min !== undefined) inp.min = min;
    if (max !== undefined) inp.max = max;
    return inp;
  }

  private _makeLabeledInput(label: string, name: string, type: string, value: string, min?: string, max?: string): HTMLElement {
    const wrap = _el('div', { class: 'fp-labeled-input' });
    wrap.appendChild(_el('span', { class: 'fp-labeled-input__label' }, label));
    wrap.appendChild(this._makeInput(name, type, value, '', min, max));
    return wrap;
  }

  private _makeSelect(name: string, options: Array<{ value: string; label: string }>, selected: string, onChange?: (val: string) => void): HTMLSelectElement {
    const sel = _el('select', { 'data-name': name, class: 'fp-select' }) as HTMLSelectElement;
    for (const opt of options) {
      const o = _el('option', { value: opt.value }, opt.label) as HTMLOptionElement;
      if (opt.value === selected) o.selected = true;
      sel.appendChild(o);
    }
    if (onChange) sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  private _makeField(label: string, control: Node): HTMLElement {
    const wrap = _el('div', { class: 'fp-field' });
    wrap.appendChild(_el('label', { class: 'fp-field-label' }, label));
    wrap.appendChild(control instanceof Node ? control : _el('div', {}, control));
    return wrap;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function _el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'style') node.setAttribute('style', String(v));
    else if (k in node) (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function _inferType(name: string, sample: unknown, features: Feature[]): ValueFieldType {
  if (/time|date|stamp|created|updated/i.test(name)) return 'date';
  if (typeof sample === 'number') return 'number';
  if (typeof sample !== 'string') return 'text';
  const vals = new Set(features.map(f => f.properties?.[name]));
  if (vals.size <= 20) return 'keyword';
  return 'text';
}

function _dd(v: number): string { return `${Math.abs(v).toFixed(1)}°`; }

function _fmtDate(s: string): string {
  if (!s) return '?';
  try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

function _showError(msg: string): void {
  console.warn('[FilterPanel]', msg);
  const btn = document.querySelector<HTMLButtonElement>('.fp-btn--primary');
  if (btn) { btn.style.outline = '2px solid var(--ft-danger)'; btn.title = msg; setTimeout(() => { btn.style.outline = ''; btn.title = ''; }, 2000); }
}
