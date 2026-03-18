// ---------------------------------------------------------------------------
// TimeModal – Elastic-inspired time picker for the toolbar.
//
// Two tabs:
//   - Relative: "Last N <unit>" with a custom input + preset quick-select grid
//   - Absolute: date-time from/to pickers
//
// Uses a fixed filter ID ('time-global') so there's always at most one
// time filter active via this modal.
// ---------------------------------------------------------------------------

import type { FilterEngine } from '@filters';
import type { TimeFilter, TimeUnit } from '@filters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'relative' | 'absolute';

/** Extended time units including months/years (resolved to days for ES). */
type ExtUnit = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

const UNIT_OPTIONS: { value: ExtUnit; label: string }[] = [
  { value: 'second', label: 'Seconds' },
  { value: 'minute', label: 'Minutes' },
  { value: 'hour',   label: 'Hours' },
  { value: 'day',    label: 'Days' },
  { value: 'month',  label: 'Months' },
  { value: 'year',   label: 'Years' },
];

/** Preset quick-select options (two columns) */
const PRESETS: { amount: number; unit: ExtUnit; label: string }[][] = [
  // Column 1
  [
    { amount: 1,  unit: 'year',  label: '1 year' },
    { amount: 6,  unit: 'month', label: '6 months' },
    { amount: 1,  unit: 'month', label: '1 month' },
    { amount: 7,  unit: 'day',   label: '7 days' },
  ],
  // Column 2
  [
    { amount: 24, unit: 'hour',  label: '24 hours' },
    { amount: 12, unit: 'hour',  label: '12 hours' },
    { amount: 6,  unit: 'hour',  label: '6 hours' },
    { amount: 1,  unit: 'hour',  label: '1 hour' },
  ],
];

/** The fixed filter ID used for the toolbar time filter. */
const TIME_FILTER_ID = 'time-global';

// SVG icons (inline, 16×16)
const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';

// ---------------------------------------------------------------------------
// TimeModal
// ---------------------------------------------------------------------------

export interface TimeModalOpts {
  filterEngine: FilterEngine;
  onApply: () => void;
}

export class TimeModal {
  private _engine: FilterEngine;
  private _onApply: () => void;

  // Internal state
  private _tab: Tab = 'relative';
  private _amount = 30;
  private _unit: ExtUnit = 'hour';
  private _absFrom = '';
  private _absTo = '';

  // DOM refs
  private _labelEl: HTMLElement | null = null;
  private _popover: HTMLElement | null = null;

  constructor(opts: TimeModalOpts) {
    this._engine = opts.filterEngine;
    this._onApply = opts.onApply;
  }

  // -- Public ---------------------------------------------------------------

  /** Apply the default time filter (last 30 hours) and update the toolbar label. */
  applyDefault(): void {
    this._tab = 'relative';
    this._amount = 30;
    this._unit = 'hour';
    this._apply();
  }

  /** Bind the toolbar button. Call once after DOM is ready. */
  setup(): void {
    this._labelEl = document.getElementById('tb-time-label');
    const btn = document.getElementById('tb-time');
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggle();
    });

    // Close popover on outside click
    document.addEventListener('click', (e) => {
      if (this._popover && !this._popover.contains(e.target as Node) &&
          !(e.target as HTMLElement).closest('#tb-time')) {
        this._close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._popover) this._close();
    });
  }

  /** Get the label string for the current time filter state. */
  getLabel(): string {
    const existing = this._engine.filters.find(f => f.id === TIME_FILTER_ID);
    if (!existing) return 'No filter';
    if (existing.kind !== 'time') return 'Custom';
    const tf = existing as TimeFilter;
    if (tf.mode === 'last') {
      const n = tf.lastAmount ?? 1;
      const u = tf.lastUnit ?? 'hour';
      return `Last ${n} ${_shortUnit(u, n)}`;
    }
    if (tf.mode === 'between' && tf.from && tf.to) {
      // Check if it's a "relative future" filter
      if (Math.abs(new Date(tf.from).getTime() - Date.now()) < 60_000) {
        return `Next ${this._amount} ${_shortUnit(this._unit as TimeUnit, this._amount)}`;
      }
      return _formatRange(tf.from, tf.to);
    }
    return 'Custom';
  }

  updateLabel(): void {
    if (this._labelEl) {
      const label = this.getLabel();
      this._labelEl.textContent = label;
      this._labelEl.classList.toggle('toolbar__time-label--muted', label === 'No filter');
    }
  }

  // -- Popover management ---------------------------------------------------

  private _toggle(): void {
    if (this._popover) {
      this._close();
    } else {
      this._open();
    }
  }

  private _close(): void {
    if (this._popover) {
      this._popover.remove();
      this._popover = null;
    }
    document.getElementById('tb-time')?.classList.remove('toolbar__btn--active');
  }

  private _open(): void {
    this._close();
    this._syncFromEngine();

    const btn = document.getElementById('tb-time')!;
    btn.classList.add('toolbar__btn--active');
    const rect = btn.getBoundingClientRect();

    const popover = document.createElement('div');
    popover.className = 'tm-popover';
    // Position below the button, right-aligned
    popover.style.top = `${rect.bottom + 8}px`;
    popover.style.right = `${window.innerWidth - rect.right}px`;

    this._buildContent(popover);
    document.body.appendChild(popover);
    this._popover = popover;

    // Animate in
    requestAnimationFrame(() => popover.classList.add('tm-popover--visible'));
  }

  // -- Build UI -------------------------------------------------------------

  private _buildContent(container: HTMLElement): void {
    container.innerHTML = '';

    // ── Header ──────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'tm-header';
    const title = document.createElement('span');
    title.className = 'tm-header__title';
    title.innerHTML = `${ICON_CLOCK} Time range`;
    header.appendChild(title);
    container.appendChild(header);

    // ── Tab bar ────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.className = 'tm-tabs';

    const tabs: { id: Tab; label: string; icon: string }[] = [
      { id: 'relative', label: 'Relative', icon: ICON_REFRESH },
      { id: 'absolute', label: 'Absolute', icon: ICON_CALENDAR },
    ];

    for (const t of tabs) {
      const tab = document.createElement('button');
      tab.className = 'tm-tab' + (this._tab === t.id ? ' tm-tab--active' : '');
      tab.innerHTML = `${t.icon}<span>${t.label}</span>`;
      tab.addEventListener('click', (e) => {
        e.stopPropagation();         // prevent outside-click handler from closing popover
        this._tab = t.id;
        this._buildContent(container);
      });
      tabBar.appendChild(tab);
    }
    container.appendChild(tabBar);

    // ── Content ─────────────────────────────────────────────────
    const content = document.createElement('div');
    content.className = 'tm-content';
    if (this._tab === 'relative') this._buildRelative(content);
    else this._buildAbsolute(content);
    container.appendChild(content);

    // ── Footer ─────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'tm-footer';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'tm-btn tm-btn--ghost';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      this._engine.remove(TIME_FILTER_ID);
      this.updateLabel();
      this._onApply();
      this._close();
    });

    const applyBtn = document.createElement('button');
    applyBtn.className = 'tm-btn tm-btn--primary';
    applyBtn.innerHTML = 'Apply';
    applyBtn.addEventListener('click', () => {
      this._readInputs(content);
      this._apply();
      this._close();
    });

    footer.append(clearBtn, applyBtn);
    container.appendChild(footer);
  }

  // -- Relative tab ---------------------------------------------------------

  private _buildRelative(container: HTMLElement): void {
    // ── Custom input row ──────────────────────────────────────
    const customSection = document.createElement('div');
    customSection.className = 'tm-custom-row';

    const label = document.createElement('span');
    label.className = 'tm-custom-label';
    label.textContent = 'Last';

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.className = 'tm-input';
    amountInput.id = 'tm-amount';
    amountInput.value = String(this._amount);
    amountInput.min = '1';

    const unitSelect = document.createElement('select');
    unitSelect.className = 'tm-select';
    unitSelect.id = 'tm-unit';
    for (const opt of UNIT_OPTIONS) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === this._unit) option.selected = true;
      unitSelect.appendChild(option);
    }

    customSection.append(label, amountInput, unitSelect);
    container.appendChild(customSection);

    // ── Separator ──────────────────────────────────────────────
    const sep = document.createElement('div');
    sep.className = 'tm-separator';
    const sepLabel = document.createElement('span');
    sepLabel.className = 'tm-separator__text';
    sepLabel.textContent = 'Quick select';
    sep.appendChild(sepLabel);
    container.appendChild(sep);

    // ── Preset grid (2 columns) ───────────────────────────────
    const grid = document.createElement('div');
    grid.className = 'tm-presets';

    for (const col of PRESETS) {
      const colEl = document.createElement('div');
      colEl.className = 'tm-presets__col';
      for (const preset of col) {
        const btn = document.createElement('button');
        btn.className = 'tm-preset';
        const isActive = this._amount === preset.amount && this._unit === preset.unit;
        if (isActive) btn.classList.add('tm-preset--active');
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
          this._amount = preset.amount;
          this._unit = preset.unit;
          this._apply();
          this._close();
        });
        colEl.appendChild(btn);
      }
      grid.appendChild(colEl);
    }
    container.appendChild(grid);
  }

  // -- Absolute tab ---------------------------------------------------------

  private _buildAbsolute(container: HTMLElement): void {
    if (!this._absFrom) {
      const yesterday = new Date(Date.now() - 86_400_000);
      this._absFrom = _toDateTimeLocal(yesterday);
    }
    if (!this._absTo) {
      this._absTo = _toDateTimeLocal(new Date());
    }

    const fromField = this._makeDateField('From', 'tm-abs-from', this._absFrom);
    const toField = this._makeDateField('To', 'tm-abs-to', this._absTo);
    container.append(fromField, toField);
  }

  private _makeDateField(label: string, id: string, value: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'tm-date-field';

    const lbl = document.createElement('label');
    lbl.className = 'tm-date-field__label';
    lbl.textContent = label;
    lbl.htmlFor = id;

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.className = 'tm-input tm-input--date';
    input.id = id;
    input.value = value;

    wrap.append(lbl, input);
    return wrap;
  }

  // -- Input reading --------------------------------------------------------

  private _readInputs(container: HTMLElement): void {
    if (this._tab === 'relative') {
      const amountEl = container.querySelector('#tm-amount') as HTMLInputElement | null;
      const unitEl = container.querySelector('#tm-unit') as HTMLSelectElement | null;
      if (amountEl) this._amount = Math.max(1, parseInt(amountEl.value, 10) || 1);
      if (unitEl) this._unit = unitEl.value as ExtUnit;
    } else {
      const fromEl = container.querySelector('#tm-abs-from') as HTMLInputElement | null;
      const toEl = container.querySelector('#tm-abs-to') as HTMLInputElement | null;
      if (fromEl) this._absFrom = fromEl.value;
      if (toEl) this._absTo = toEl.value;
    }
  }

  // -- Apply filter ---------------------------------------------------------

  private _apply(): void {
    this._engine.remove(TIME_FILTER_ID);

    let filter: TimeFilter;

    if (this._tab === 'relative') {
      const { amount, unit } = _resolveUnit(this._amount, this._unit);
      const label = `Last ${this._amount} ${_shortUnit(this._unit as TimeUnit, this._amount)}`;
      filter = {
        id: TIME_FILTER_ID,
        kind: 'time',
        label,
        enabled: true,
        scope: ['*'],
        field: 'timestamp',
        mode: 'last',
        lastAmount: amount,
        lastUnit: unit,
      };
    } else {
      const from = this._absFrom ? new Date(this._absFrom).toISOString() : undefined;
      const to = this._absTo ? new Date(this._absTo).toISOString() : undefined;
      filter = {
        id: TIME_FILTER_ID,
        kind: 'time',
        label: _formatRange(from, to),
        enabled: true,
        scope: ['*'],
        field: 'timestamp',
        mode: 'between',
        from,
        to,
      };
    }

    this._engine.add(filter);
    this.updateLabel();
    this._onApply();
  }

  // -- Sync state from existing filter --------------------------------------

  private _syncFromEngine(): void {
    const existing = this._engine.filters.find(f => f.id === TIME_FILTER_ID);
    if (!existing || existing.kind !== 'time') return;
    const tf = existing as TimeFilter;

    if (tf.mode === 'last') {
      this._tab = 'relative';
      this._amount = tf.lastAmount ?? 30;
      this._unit = (tf.lastUnit ?? 'hour') as ExtUnit;
    } else if (tf.mode === 'between') {
      this._tab = 'absolute';
      this._absFrom = tf.from ? _toDateTimeLocal(new Date(tf.from)) : '';
      this._absTo = tf.to ? _toDateTimeLocal(new Date(tf.to)) : '';
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _shortUnit(unit: TimeUnit | string, n: number): string {
  const map: Record<string, string> = {
    second: n === 1 ? 'sec' : 'sec',
    minute: n === 1 ? 'min' : 'min',
    hour: n === 1 ? 'hour' : 'hours',
    day: n === 1 ? 'day' : 'days',
    month: n === 1 ? 'month' : 'months',
    year: n === 1 ? 'year' : 'years',
    week: n === 1 ? 'week' : 'weeks',
  };
  return map[unit] ?? unit;
}

function _formatRange(from?: string, to?: string): string {
  if (!from && !to) return 'Custom';
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  if (from && to) return `${fmtDate(from)} → ${fmtDate(to)}`;
  if (from) return `After ${fmtDate(from)}`;
  return `Before ${fmtDate(to!)}`;
}

function _resolveUnit(amount: number, unit: ExtUnit): { amount: number; unit: TimeUnit } {
  switch (unit) {
    case 'second': return { amount: amount, unit: 'minute' }; // ES minimum
    case 'minute': return { amount, unit: 'minute' };
    case 'hour':   return { amount, unit: 'hour' };
    case 'day':    return { amount, unit: 'day' };
    case 'month':  return { amount: amount * 30, unit: 'day' };
    case 'year':   return { amount: amount * 365, unit: 'day' };
  }
}
