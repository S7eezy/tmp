// ---------------------------------------------------------------------------
// ViewsModal – toolbar-triggered modal for managing saved views.
// ---------------------------------------------------------------------------

import type { FilterEngine } from '@filters';
import type { FilterView } from '@filters/types';

export interface ViewsModalOpts {
  filterEngine: FilterEngine;
  /** Returns current UI state to save with a view. */
  getViewExtraState: () => {
    enabledIndexes?: string[];
    loadedIndexes?: string[];
    layerVisibility?: Record<string, boolean>;
    activeMapStyle?: string | null;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v);
  }
  if (text) el.textContent = text;
  return el;
}

const STAR_FILLED = '<svg viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="2" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const STAR_EMPTY  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

// ---------------------------------------------------------------------------

export class ViewsModal {
  private _engine: FilterEngine;
  private _getExtraState: ViewsModalOpts['getViewExtraState'];
  private _overlay!: HTMLElement;
  private _body!: HTMLElement;
  private _showNewForm = false;
  /** Track which sections are collapsed (none by default). */
  private _collapsedSections = new Set<string>();

  constructor(opts: ViewsModalOpts) {
    this._engine = opts.filterEngine;
    this._getExtraState = opts.getViewExtraState;
  }

  setup(): void {
    this._overlay = document.getElementById('views-overlay')!;
    this._body = document.getElementById('views-body')!;

    document.getElementById('views-close')?.addEventListener('click', () => this.close());

    // Close on overlay click (not modal itself)
    this._overlay.addEventListener('mousedown', (e) => {
      if (e.target === this._overlay) this.close();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._overlay.style.display !== 'none') {
        this.close();
      }
    });

    // Re-render when views change (while open)
    this._engine.addEventListener('views-change', () => {
      if (this._overlay.style.display !== 'none') this._render();
    });
  }

  open(): void {
    this._showNewForm = false;
    this._overlay.style.display = 'flex';
    document.getElementById('tb-views')?.classList.add('toolbar__btn--active');
    this._render();
  }

  close(): void {
    this._overlay.style.display = 'none';
    document.getElementById('tb-views')?.classList.remove('toolbar__btn--active');
  }

  // ── Render ────────────────────────────────────────────────────────────

  private _render(): void {
    const body = this._body;
    body.innerHTML = '';

    const views = this._engine.views;
    const favs = views.filter(v => v.favourite);
    const all = views;

    // ── New View button / form ──
    if (this._showNewForm) {
      body.appendChild(this._buildNewViewForm());
    } else {
      const newBtn = _el('button', { class: 'vm-new-btn' });
      newBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New View';
      newBtn.addEventListener('click', () => {
        this._showNewForm = true;
        this._render();
      });
      body.appendChild(newBtn);
    }

    // ── Favourites section ──
    if (favs.length > 0) {
      body.appendChild(this._buildSection('favourites', 'Favourites', favs));
    }

    // ── All Views section ──
    if (all.length > 0) {
      body.appendChild(this._buildSection('all', 'All Views', all));
    } else if (!this._showNewForm) {
      body.appendChild(_el('div', { class: 'vm-empty' }, 'No saved views yet'));
    }
  }

  private _buildSection(id: string, title: string, views: FilterView[]): HTMLElement {
    const section = _el('div', { class: 'vm-section' });
    const isCollapsed = this._collapsedSections.has(id);

    const header = _el('div', { class: 'vm-section__header' });
    const arrow = _el('span', { class: `vm-section__arrow${isCollapsed ? '' : ' vm-section__arrow--open'}` });
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg>';
    const label = _el('span', { class: 'vm-section__title' }, title);
    const count = _el('span', { class: 'vm-section__count' }, String(views.length));
    header.append(arrow, label, count);

    header.addEventListener('click', () => {
      if (this._collapsedSections.has(id)) this._collapsedSections.delete(id);
      else this._collapsedSections.add(id);
      this._render();
    });
    section.appendChild(header);

    if (!isCollapsed) {
      const list = _el('div', { class: 'vm-section__list' });
      for (const view of views) {
        list.appendChild(this._buildCard(view));
      }
      section.appendChild(list);
    }

    return section;
  }

  private _buildCard(view: FilterView): HTMLElement {
    const card = _el('div', { class: `vm-card${view.active ? ' vm-card--active' : ''}` });

    // Left: info
    const info = _el('div', { class: 'vm-card__info' });
    const name = _el('div', { class: 'vm-card__name' }, view.name);
    info.appendChild(name);

    // Subtitle: filters + layers + date
    const parts: string[] = [];
    const fc = view.filters.length;
    parts.push(`${fc} filter${fc !== 1 ? 's' : ''}`);
    const lc = view.loadedIndexes?.length ?? view.enabledIndexes?.length ?? 0;
    parts.push(`${lc} layer${lc !== 1 ? 's' : ''}`);
    const date = new Date(view.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    parts.push(date);
    const subtitle = _el('div', { class: 'vm-card__subtitle' }, parts.join(' · '));
    info.appendChild(subtitle);

    // Filter names (truncated)
    if (view.filters.length > 0) {
      const filterNames = view.filters.map(f => f.label).join(', ');
      const filtersEl = _el('div', { class: 'vm-card__filters' });
      filtersEl.textContent = filterNames.length > 60 ? filterNames.slice(0, 57) + '...' : filterNames;
      info.appendChild(filtersEl);
    }

    // Layer names
    if (view.enabledIndexes && view.enabledIndexes.length > 0) {
      const layerNames = view.enabledIndexes.join(', ');
      const layersEl = _el('div', { class: 'vm-card__layers' });
      layersEl.textContent = layerNames.length > 60 ? layerNames.slice(0, 57) + '...' : layerNames;
      info.appendChild(layersEl);
    }

    card.appendChild(info);

    // Right: actions
    const actions = _el('div', { class: 'vm-card__actions' });

    // Star toggle
    const star = _el('button', {
      class: `vm-star${view.favourite ? ' vm-star--on' : ''}`,
      title: view.favourite ? 'Remove from favourites' : 'Add to favourites',
    });
    star.innerHTML = view.favourite ? STAR_FILLED : STAR_EMPTY;
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      this._engine.toggleFavourite(view.name);
    });
    actions.appendChild(star);

    // Activate toggle
    const toggle = _el('div', {
      class: `vm-toggle${view.active ? ' vm-toggle--on' : ''}`,
      title: view.active ? 'Deactivate view' : 'Activate view',
    });
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this._engine.toggleView(view.name);
    });
    actions.appendChild(toggle);

    // Delete
    const del = _el('button', { class: 'vm-delete', title: 'Delete view' });
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      this._engine.removeView(view.name);
    });
    actions.appendChild(del);

    card.appendChild(actions);

    // Card click = toggle view
    card.addEventListener('click', () => {
      this._engine.toggleView(view.name);
    });

    return card;
  }

  private _buildNewViewForm(): HTMLElement {
    const form = _el('div', { class: 'vm-new-form' });

    const title = _el('div', { class: 'vm-new-form__title' }, 'Create New View');

    const nameInput = _el('input', {
      class: 'vm-input',
      placeholder: 'View name...',
    }) as HTMLInputElement;
    nameInput.type = 'text';

    const descInput = _el('input', {
      class: 'vm-input',
      placeholder: 'Description (optional)',
      style: 'margin-top: 6px;',
    }) as HTMLInputElement;
    descInput.type = 'text';

    const actions = _el('div', { class: 'vm-new-form__actions' });

    const saveBtn = _el('button', { class: 'vm-btn vm-btn--primary' }, 'Save');
    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      const extraState = this._getExtraState();
      this._engine.saveView(name, descInput.value.trim() || undefined, extraState);
      this._showNewForm = false;
      this._render();
    });

    const cancelBtn = _el('button', { class: 'vm-btn vm-btn--ghost' }, 'Cancel');
    cancelBtn.addEventListener('click', () => {
      this._showNewForm = false;
      this._render();
    });

    actions.append(cancelBtn, saveBtn);
    form.append(title, nameInput, descInput, actions);

    // Auto-focus after DOM insert
    requestAnimationFrame(() => nameInput.focus());

    return form;
  }
}
