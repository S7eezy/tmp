// ---------------------------------------------------------------------------
// TimeModal – toolbar-attached modal for configuring the global time filter.
//
// Two modes:
//   - Relative: "Last N hours/days/months/years" or "Next N ..."
//   - Absolute: custom from/to with DD-MM-YYYY hh:mm inputs
//
// Uses a fixed filter ID ('time-global') so there's always at most one
// time filter active via this modal.
// ---------------------------------------------------------------------------

import type { FilterEngine } from '@filters';
import type { TimeFilter, TimeUnit } from '@filters';
// newFilterId not needed – using fixed TIME_FILTER_ID

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'relative' | 'absolute';
type RelativeDir = 'last' | 'next';

/** Extended time units including months/years (resolved to hours for ES). */
type ExtUnit = 'hour' | 'day' | 'month' | 'year';

const UNIT_LABELS: Record<ExtUnit, string> = {
  hour: 'Hours', day: 'Days', month: 'Months', year: 'Years',
};

// UNIT_SHORT kept for reference but labels use _shortUnit() helper below

/** The fixed filter ID used for the toolbar time filter. */
const TIME_FILTER_ID = 'time-global';

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
  private _dir: RelativeDir = 'last';
  private _amount = 30;
  private _unit: ExtUnit = 'hour';
  private _absFrom = '';
  private _absTo = '';

  // Label element ref
  private _labelEl: HTMLElement | null = null;

  constructor(opts: TimeModalOpts) {
    this._engine = opts.filterEngine;
    this._onApply = opts.onApply;
  }

  // -- Public ---------------------------------------------------------------

  /** Apply the default time filter (last 30 min) and update the toolbar label. */
  applyDefault(): void {
    this._tab = 'relative';
    this._dir = 'last';
    this._amount = 30;
    this._unit = 'hour';
    this._apply();
  }

  /** Bind the toolbar button and label. Call once after DOM is ready. */
  setup(): void {
    this._labelEl = document.getElementById('tb-time-label');
    document.getElementById('tb-time')?.addEventListener('click', () => this.open());
  }

  /** Get the label string for the current time filter state. */
  getLabel(): string {
    const existing = this._engine.filters.find(f => f.id === TIME_FILTER_ID);
    if (!existing) return 'No time filter';
    if (existing.kind !== 'time') return 'Custom';
    const tf = existing as TimeFilter;
    if (tf.mode === 'last') {
      const n = tf.lastAmount ?? 1;
      const u = tf.lastUnit ?? 'hour';
      return `Last ${n} ${_shortUnit(u, n)}`;
    }
    if (tf.mode === 'after') return `Next ${this._amount} ${_shortUnit(this._unit as TimeUnit, this._amount)}`;
    return 'Custom';
  }

  updateLabel(): void {
    if (this._labelEl) {
      const label = this.getLabel();
      this._labelEl.textContent = label;
      this._labelEl.classList.toggle('toolbar__label--muted', label === 'No time filter');
    }
  }

  // -- Open / Close ---------------------------------------------------------

  open(): void {
    // Sync internal state from current filter (if exists)
    this._syncFromEngine();

    const overlay = document.getElementById('settings-overlay')!;
    const titleEl = document.getElementById('settings-title')!;
    const bodyEl = document.getElementById('settings-body')!;

    titleEl.textContent = 'Time Filter';
    bodyEl.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'tm-root';

    // ── Tab bar ────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.className = 'tm-tabs';

    const mkTab = (tab: Tab, label: string) => {
      const btn = document.createElement('button');
      btn.className = 'tm-tab' + (this._tab === tab ? ' tm-tab--active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this._tab = tab;
        this._renderBody(content);
        tabBar.querySelectorAll('.tm-tab').forEach((el, i) => {
          el.classList.toggle('tm-tab--active', i === (tab === 'relative' ? 0 : 1));
        });
      });
      return btn;
    };
    tabBar.append(mkTab('relative', 'Relative'), mkTab('absolute', 'Absolute'));
    root.appendChild(tabBar);

    // ── Content ────────────────────────────────────────────────
    const content = document.createElement('div');
    content.className = 'tm-content';
    this._renderBody(content);
    root.appendChild(content);

    // ── Actions ────────────────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'tm-actions';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'tm-btn tm-btn--ghost';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      this._engine.remove(TIME_FILTER_ID);
      this.updateLabel();
      this._onApply();
      overlay.style.display = 'none';
    });

    const applyBtn = document.createElement('button');
    applyBtn.className = 'tm-btn tm-btn--primary';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
      this._readInputs(content);
      this._apply();
      overlay.style.display = 'none';
    });

    actions.append(clearBtn, applyBtn);
    root.appendChild(actions);

    bodyEl.appendChild(root);
    overlay.style.display = 'flex';

    // Close handlers
    document.getElementById('settings-close')!.onclick = () => { overlay.style.display = 'none'; };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
  }

  // -- Render helpers -------------------------------------------------------

  private _renderBody(container: HTMLElement): void {
    container.innerHTML = '';
    if (this._tab === 'relative') this._renderRelative(container);
    else this._renderAbsolute(container);
  }

  private _renderRelative(container: HTMLElement): void {
    // Direction: Last / Next
    const dirRow = document.createElement('div');
    dirRow.className = 'tm-dir-row';

    for (const dir of ['last', 'next'] as RelativeDir[]) {
      const btn = document.createElement('button');
      btn.className = 'tm-dir-btn' + (this._dir === dir ? ' tm-dir-btn--active' : '');
      btn.textContent = dir === 'last' ? 'Last' : 'Next';
      btn.addEventListener('click', () => {
        this._dir = dir;
        dirRow.querySelectorAll('.tm-dir-btn').forEach(el =>
          el.classList.toggle('tm-dir-btn--active', el === btn),
        );
      });
      dirRow.appendChild(btn);
    }
    container.appendChild(dirRow);

    // Amount input + unit buttons
    const inputRow = document.createElement('div');
    inputRow.className = 'tm-input-row';

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.className = 'tm-amount fp-input';
    amountInput.id = 'tm-amount';
    amountInput.value = String(this._amount);
    amountInput.min = '1';
    inputRow.appendChild(amountInput);

    const unitGroup = document.createElement('div');
    unitGroup.className = 'tm-unit-group';
    for (const unit of ['hour', 'day', 'month', 'year'] as ExtUnit[]) {
      const btn = document.createElement('button');
      btn.className = 'tm-unit-btn' + (this._unit === unit ? ' tm-unit-btn--active' : '');
      btn.textContent = UNIT_LABELS[unit];
      btn.addEventListener('click', () => {
        this._unit = unit;
        unitGroup.querySelectorAll('.tm-unit-btn').forEach(el =>
          el.classList.toggle('tm-unit-btn--active', el === btn),
        );
      });
      unitGroup.appendChild(btn);
    }
    inputRow.appendChild(unitGroup);
    container.appendChild(inputRow);
  }

  private _renderAbsolute(container: HTMLElement): void {
    // Auto-fill defaults if empty
    if (!this._absFrom) {
      const yesterday = new Date(Date.now() - 86_400_000);
      this._absFrom = _toDateTimeLocal(yesterday);
    }
    if (!this._absTo) {
      const tomorrow = new Date(Date.now() + 86_400_000);
      this._absTo = _toDateTimeLocal(tomorrow);
    }

    const fromField = this._makeDateField('From', 'tm-abs-from', this._absFrom);
    const toField = this._makeDateField('To', 'tm-abs-to', this._absTo);
    container.append(fromField, toField);
  }

  private _makeDateField(label: string, id: string, value: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'tm-field';

    const lbl = document.createElement('label');
    lbl.className = 'tm-field-label';
    lbl.textContent = label;
    lbl.htmlFor = id;

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.className = 'fp-input tm-date-input';
    input.id = id;
    input.value = value;

    wrap.append(lbl, input);
    return wrap;
  }

  // -- Input reading --------------------------------------------------------

  private _readInputs(container: HTMLElement): void {
    if (this._tab === 'relative') {
      const amountEl = container.querySelector('#tm-amount') as HTMLInputElement | null;
      if (amountEl) this._amount = Math.max(1, parseInt(amountEl.value, 10) || 1);
    } else {
      const fromEl = container.querySelector('#tm-abs-from') as HTMLInputElement | null;
      const toEl = container.querySelector('#tm-abs-to') as HTMLInputElement | null;
      if (fromEl) this._absFrom = fromEl.value;
      if (toEl) this._absTo = toEl.value;
    }
  }

  // -- Apply filter ---------------------------------------------------------

  private _apply(): void {
    // Remove existing time filter
    this._engine.remove(TIME_FILTER_ID);

    let filter: TimeFilter;

    if (this._tab === 'relative') {
      if (this._dir === 'last') {
        // Convert months/years to the equivalent in smaller units for ES
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
        // "Next" → from: now, to: now + duration
        const ms = _unitToMs(this._amount, this._unit);
        const to = new Date(Date.now() + ms).toISOString();
        const label = `Next ${this._amount} ${_shortUnit(this._unit as TimeUnit, this._amount)}`;
        filter = {
          id: TIME_FILTER_ID,
          kind: 'time',
          label,
          enabled: true,
          scope: ['*'],
          field: 'timestamp',
          mode: 'between',
          from: new Date().toISOString(),
          to,
        };
      }
    } else {
      // Absolute mode
      const from = this._absFrom ? new Date(this._absFrom).toISOString() : undefined;
      const to = this._absTo ? new Date(this._absTo).toISOString() : undefined;
      filter = {
        id: TIME_FILTER_ID,
        kind: 'time',
        label: 'Custom',
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
      this._dir = 'last';
      this._amount = tf.lastAmount ?? 30;
      // Map back from ES unit to ExtUnit
      this._unit = (tf.lastUnit ?? 'hour') as ExtUnit;
    } else if (tf.mode === 'between') {
      // Check if it looks like a "next" filter (from ≈ now)
      if (tf.from && Math.abs(new Date(tf.from).getTime() - Date.now()) < 60_000) {
        this._tab = 'relative';
        this._dir = 'next';
      } else {
        this._tab = 'absolute';
        this._absFrom = tf.from ? _toDateTimeLocal(new Date(tf.from)) : '';
        this._absTo = tf.to ? _toDateTimeLocal(new Date(tf.to)) : '';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Date to `YYYY-MM-DDThh:mm` for datetime-local inputs. */
function _toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Short unit label for the toolbar (e.g. "30 min", "2 days"). */
function _shortUnit(unit: TimeUnit | string, n: number): string {
  const map: Record<string, string> = {
    hour: n === 1 ? 'hour' : 'hours',
    day: n === 1 ? 'day' : 'days',
    month: n === 1 ? 'month' : 'months',
    year: n === 1 ? 'year' : 'years',
    minute: n === 1 ? 'min' : 'min',
    week: n === 1 ? 'week' : 'weeks',
  };
  return map[unit] ?? unit;
}

/**
 * Resolve months/years to days (ES `now-Xd` syntax doesn't support months/years
 * directly). Hours and days pass through unchanged.
 */
function _resolveUnit(amount: number, unit: ExtUnit): { amount: number; unit: TimeUnit } {
  switch (unit) {
    case 'hour':  return { amount, unit: 'hour' };
    case 'day':   return { amount, unit: 'day' };
    case 'month': return { amount: amount * 30, unit: 'day' };
    case 'year':  return { amount: amount * 365, unit: 'day' };
  }
}

/** Convert amount + unit to milliseconds. */
function _unitToMs(amount: number, unit: ExtUnit): number {
  const MS_HOUR  = 3_600_000;
  const MS_DAY   = 86_400_000;
  switch (unit) {
    case 'hour':  return amount * MS_HOUR;
    case 'day':   return amount * MS_DAY;
    case 'month': return amount * 30 * MS_DAY;
    case 'year':  return amount * 365 * MS_DAY;
  }
}
