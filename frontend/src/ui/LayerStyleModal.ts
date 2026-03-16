// ---------------------------------------------------------------------------
// LayerStyleModal – per-layer visual style editor.
// Allows selecting icon, color (static/field), size, orientation, labels.
// ---------------------------------------------------------------------------

import type { DeckLayerAdapter, LayerStyleConfig, LabelConfig } from '@core/layers';
import { getIconsByCategory, CATEGORY_LABELS } from '@core/layers';
import type { LayerRegistry } from '@core/layers';
import type { DataStore } from '@core/data';
import type { ElasticClient } from '@core/data';
import { saveLayerStyles, loadLayerStyles } from '@core/layers';
import { Config } from '../config';

// ---------------------------------------------------------------------------
// LayerStyleModal
// ---------------------------------------------------------------------------

export class LayerStyleModal {
  private _reg: LayerRegistry;
  private _store: DataStore;
  private _styles = new Map<string, LayerStyleConfig>();
  private _onStyleChange: () => void;

  constructor(opts: {
    layerRegistry: LayerRegistry;
    dataStore: DataStore;
    esClient: ElasticClient;
    onStyleChange: () => void;
  }) {
    this._reg = opts.layerRegistry;
    this._store = opts.dataStore;
    this._onStyleChange = opts.onStyleChange;
  }

  /** Load styles from ES on startup. */
  async loadFromES(): Promise<void> {
    this._styles = await loadLayerStyles(Config.esBaseUrl);
    // Apply loaded styles to existing layers
    for (const [id, style] of this._styles) {
      const layer = this._reg.get<DeckLayerAdapter>(id);
      if (layer && 'setStyle' in layer) {
        (layer as DeckLayerAdapter).setStyle(style);
      }
    }
    this._onStyleChange();
  }

  /** Apply a previously-saved style to a single layer (if one exists). */
  applyStyleFor(layerId: string): void {
    const style = this._styles.get(layerId);
    if (!style) return;
    const layer = this._reg.get<DeckLayerAdapter>(layerId);
    if (layer && 'setStyle' in layer) {
      (layer as DeckLayerAdapter).setStyle(style);
      this._onStyleChange();
    }
  }

  /** Open the style editor for a specific layer. */
  open(layerId: string): void {
    const layer = this._reg.get<DeckLayerAdapter>(layerId);
    if (!layer) {
      console.warn(`[LayerStyleModal] No layer found for "${layerId}"`);
      return;
    }

    const overlay = document.getElementById('settings-overlay');
    const titleEl = document.getElementById('settings-title');
    const bodyEl  = document.getElementById('settings-body');
    if (!overlay || !titleEl || !bodyEl) {
      console.error('[LayerStyleModal] Missing DOM elements for settings overlay');
      return;
    }

    titleEl.textContent = `Style: ${layerId}`;
    bodyEl.innerHTML = '';

    // Working copy of the style config
    const style: LayerStyleConfig = this._styles.get(layerId)
      ? JSON.parse(JSON.stringify(this._styles.get(layerId)))
      : { layerId };

    // Discover available fields from data
    const features = this._store.get(layerId);
    const fields = this._discoverFields(features);

    // ── Sections ─────────────────────────────────────────────────────────
    try {
      bodyEl.appendChild(this._buildIconSection(style, layer));
      bodyEl.appendChild(this._buildColorSection(style, fields));
      bodyEl.appendChild(this._buildSizeSection(style, layer));
      if (layer.geoType === 'point') {
        bodyEl.appendChild(this._buildOrientationSection(style, fields));
        bodyEl.appendChild(this._buildLabelSection(style, fields));
      }
    } catch (err) {
      console.error('[LayerStyleModal] Error building sections:', err);
      bodyEl.innerHTML = '<div class="lsm-hint" style="color:var(--ft-danger)">Error building style editor. Check console.</div>';
    }

    // ── Actions ──────────────────────────────────────────────────────────
    const actions = _el('div', 'lsm-actions');
    const cancelBtn = _el('button', 'lsm-btn lsm-btn--ghost');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overlay.style.display = 'none'; });

    const resetBtn = _el('button', 'lsm-btn lsm-btn--ghost');
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      this._styles.delete(layerId);
      layer.setStyle(null);
      this._onStyleChange();
      this._saveToES();
      overlay.style.display = 'none';
    });

    const saveBtn = _el('button', 'lsm-btn lsm-btn--primary');
    saveBtn.textContent = 'Apply & Save';
    saveBtn.addEventListener('click', () => {
      this._styles.set(layerId, style);
      layer.setStyle(style);
      this._onStyleChange();
      this._saveToES();
      overlay.style.display = 'none';
    });

    actions.append(resetBtn, cancelBtn, saveBtn);
    bodyEl.appendChild(actions);

    // Show overlay
    overlay.style.display = 'flex';

    const closeBtn = document.getElementById('settings-close');
    if (closeBtn) closeBtn.onclick = () => { overlay.style.display = 'none'; };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
  }

  // ── Icon section ────────────────────────────────────────────────────────

  private _buildIconSection(style: LayerStyleConfig, layer: DeckLayerAdapter): HTMLElement {
    const section = _el('div', 'lsm-section');
    section.appendChild(_sectionTitle('Icon'));

    if (layer.geoType !== 'point') {
      const hint = _el('div', 'lsm-hint');
      hint.textContent = 'Icons are only available for point layers.';
      section.appendChild(hint);
      return section;
    }

    // Current selection display
    const current = _el('div', 'lsm-current-icon');
    const updateCurrent = () => {
      current.innerHTML = style.icon
        ? `<span class="lsm-icon-name">${style.icon}</span>`
        : '<span class="lsm-icon-name">Default (circle)</span>';
    };
    updateCurrent();
    section.appendChild(current);

    // Icon grid (collapsible)
    const gridWrap = _el('div', 'lsm-icon-grid-wrap');
    const categories = getIconsByCategory();

    let isFirst = true;
    for (const [cat, icons] of categories) {
      const catTitle = _el('div', 'lsm-icon-cat');
      catTitle.textContent = (CATEGORY_LABELS as Record<string, string>)[cat] ?? (cat.charAt(0).toUpperCase() + cat.slice(1));
      gridWrap.appendChild(catTitle);

      const grid = _el('div', 'lsm-icon-grid');
      // Add "none" option at start of first category
      if (isFirst) {
        isFirst = false;
        const noneBtn = _el('button', `lsm-icon-btn${!style.icon ? ' lsm-icon-btn--active' : ''}`);
        noneBtn.title = 'Default (circle)';
        noneBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>';
        noneBtn.addEventListener('click', () => {
          style.icon = undefined;
          gridWrap.querySelectorAll('.lsm-icon-btn').forEach(b => b.classList.remove('lsm-icon-btn--active'));
          noneBtn.classList.add('lsm-icon-btn--active');
          updateCurrent();
        });
        grid.appendChild(noneBtn);
      }

      for (const icon of icons) {
        const btn = _el('button', `lsm-icon-btn${style.icon === icon.name ? ' lsm-icon-btn--active' : ''}`);
        btn.title = icon.label;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.paths}</svg>`;
        btn.addEventListener('click', () => {
          style.icon = icon.name;
          gridWrap.querySelectorAll('.lsm-icon-btn').forEach(b => b.classList.remove('lsm-icon-btn--active'));
          btn.classList.add('lsm-icon-btn--active');
          updateCurrent();
        });
        grid.appendChild(btn);
      }
      gridWrap.appendChild(grid);
    }

    section.appendChild(gridWrap);
    return section;
  }

  // ── Color section ───────────────────────────────────────────────────────

  private _buildColorSection(style: LayerStyleConfig, fields: FieldInfo[]): HTMLElement {
    const section = _el('div', 'lsm-section');
    section.appendChild(_sectionTitle('Color'));

    if (!style.color) style.color = { mode: 'static' };

    // Mode toggle: static / field
    const modeBar = _el('div', 'lsm-mode-bar');
    const staticBtn = _el('button', `lsm-mode-btn${style.color.mode === 'static' ? ' lsm-mode-btn--active' : ''}`);
    staticBtn.textContent = 'Static';
    const fieldBtn = _el('button', `lsm-mode-btn${style.color.mode === 'field' ? ' lsm-mode-btn--active' : ''}`);
    fieldBtn.textContent = 'By field';
    modeBar.append(staticBtn, fieldBtn);
    section.appendChild(modeBar);

    const dynamicArea = _el('div', 'lsm-dynamic');

    const renderStatic = () => {
      dynamicArea.innerHTML = '';
      const c = style.color!.staticColor ?? [59, 130, 246, 200];
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'lsm-color-input';
      colorInput.value = rgbaToHex(c);
      colorInput.addEventListener('input', () => {
        style.color!.staticColor = hexToRgba(colorInput.value, c[3]);
      });

      const alphaLabel = _el('span', 'lsm-label-sm');
      alphaLabel.textContent = 'Opacity:';
      const alphaInput = document.createElement('input');
      alphaInput.type = 'range';
      alphaInput.className = 'lsm-range';
      alphaInput.min = '0'; alphaInput.max = '255'; alphaInput.step = '1';
      alphaInput.value = String(c[3]);
      alphaInput.addEventListener('input', () => {
        if (style.color!.staticColor) style.color!.staticColor[3] = Number(alphaInput.value);
      });

      const row = _el('div', 'lsm-row');
      row.append(colorInput, alphaLabel, alphaInput);
      dynamicArea.appendChild(row);
    };

    const renderField = () => {
      dynamicArea.innerHTML = '';
      const sel = this._buildFieldSelect(fields, style.color!.field, (f) => {
        style.color!.field = f;
      });
      dynamicArea.appendChild(sel);

      const hint = _el('div', 'lsm-hint');
      hint.textContent = 'Colors will be auto-assigned from palette. Numeric fields use a gradient.';
      dynamicArea.appendChild(hint);

      // Gradient config for numeric fields
      const gradRow = _el('div', 'lsm-row');
      const minColorInput = document.createElement('input');
      minColorInput.type = 'color';
      minColorInput.className = 'lsm-color-input';
      minColorInput.value = style.color!.gradient ? rgbaToHex(style.color!.gradient.min) : '#3b82f6';
      const maxColorInput = document.createElement('input');
      maxColorInput.type = 'color';
      maxColorInput.className = 'lsm-color-input';
      maxColorInput.value = style.color!.gradient ? rgbaToHex(style.color!.gradient.max) : '#ef4444';

      const applyGrad = () => {
        style.color!.gradient = {
          min: hexToRgba(minColorInput.value, 200),
          max: hexToRgba(maxColorInput.value, 200),
        };
      };
      minColorInput.addEventListener('input', applyGrad);
      maxColorInput.addEventListener('input', applyGrad);

      const gradLabel = _el('span', 'lsm-label-sm');
      gradLabel.textContent = 'Gradient (for numeric):';
      gradRow.append(gradLabel, minColorInput, _el('span', 'lsm-label-sm', '→'), maxColorInput);
      dynamicArea.appendChild(gradRow);
    };

    staticBtn.addEventListener('click', () => {
      style.color!.mode = 'static';
      staticBtn.classList.add('lsm-mode-btn--active');
      fieldBtn.classList.remove('lsm-mode-btn--active');
      renderStatic();
    });

    fieldBtn.addEventListener('click', () => {
      style.color!.mode = 'field';
      fieldBtn.classList.add('lsm-mode-btn--active');
      staticBtn.classList.remove('lsm-mode-btn--active');
      renderField();
    });

    section.appendChild(dynamicArea);
    if (style.color.mode === 'static') renderStatic(); else renderField();

    return section;
  }

  // ── Size section ────────────────────────────────────────────────────────

  private _buildSizeSection(style: LayerStyleConfig, layer: DeckLayerAdapter): HTMLElement {
    const section = _el('div', 'lsm-section');
    const isPoint = layer.geoType === 'point';
    section.appendChild(_sectionTitle(isPoint ? 'Icon Size' : 'Width'));

    const defaultSize = isPoint ? (style.icon ? 24 : 4) : 1;
    const maxSize = isPoint ? 256 : 20;
    const val = style.iconSize ?? defaultSize;

    const row = _el('div', 'lsm-row');
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'lsm-range lsm-range--wide';
    range.min = '1'; range.max = String(maxSize); range.step = '1';
    range.value = String(val);

    const valLabel = _el('span', 'lsm-val-label');
    valLabel.textContent = `${val}px`;

    range.addEventListener('input', () => {
      style.iconSize = Number(range.value);
      valLabel.textContent = `${range.value}px`;
    });

    row.append(range, valLabel);
    section.appendChild(row);
    return section;
  }

  // ── Orientation section ─────────────────────────────────────────────────

  private _buildOrientationSection(style: LayerStyleConfig, fields: FieldInfo[]): HTMLElement {
    const section = _el('div', 'lsm-section');
    section.appendChild(_sectionTitle('Orientation'));

    if (!style.orientation) style.orientation = { mode: 'static', staticAngle: 0 };

    const modeBar = _el('div', 'lsm-mode-bar');
    const staticBtn = _el('button', `lsm-mode-btn${style.orientation.mode === 'static' ? ' lsm-mode-btn--active' : ''}`);
    staticBtn.textContent = 'Static';
    const fieldBtn = _el('button', `lsm-mode-btn${style.orientation.mode === 'field' ? ' lsm-mode-btn--active' : ''}`);
    fieldBtn.textContent = 'By field';
    modeBar.append(staticBtn, fieldBtn);
    section.appendChild(modeBar);

    const dynamicArea = _el('div', 'lsm-dynamic');

    const renderStatic = () => {
      dynamicArea.innerHTML = '';
      const row = _el('div', 'lsm-row');
      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'lsm-range lsm-range--wide';
      range.min = '0'; range.max = '360'; range.step = '1';
      range.value = String(style.orientation!.staticAngle ?? 0);
      const valLabel = _el('span', 'lsm-val-label');
      valLabel.textContent = `${range.value}°`;
      range.addEventListener('input', () => {
        style.orientation!.staticAngle = Number(range.value);
        valLabel.textContent = `${range.value}°`;
      });
      row.append(range, valLabel);
      dynamicArea.appendChild(row);

      const hint = _el('div', 'lsm-hint');
      hint.textContent = '0° = North, 90° = East, 180° = South, 270° = West';
      dynamicArea.appendChild(hint);
    };

    const renderField = () => {
      dynamicArea.innerHTML = '';
      const numericFields = fields.filter(f => f.type === 'number');
      const sel = this._buildFieldSelect(numericFields, style.orientation!.field, (f) => {
        style.orientation!.field = f;
      });
      dynamicArea.appendChild(sel);
      const hint = _el('div', 'lsm-hint');
      hint.textContent = 'Field value is used as rotation angle in degrees (0-360).';
      dynamicArea.appendChild(hint);
    };

    staticBtn.addEventListener('click', () => {
      style.orientation!.mode = 'static';
      staticBtn.classList.add('lsm-mode-btn--active');
      fieldBtn.classList.remove('lsm-mode-btn--active');
      renderStatic();
    });
    fieldBtn.addEventListener('click', () => {
      style.orientation!.mode = 'field';
      fieldBtn.classList.add('lsm-mode-btn--active');
      staticBtn.classList.remove('lsm-mode-btn--active');
      renderField();
    });

    section.appendChild(dynamicArea);
    if (style.orientation.mode === 'static') renderStatic(); else renderField();

    return section;
  }

  // ── Label section ───────────────────────────────────────────────────────

  private _buildLabelSection(style: LayerStyleConfig, fields: FieldInfo[]): HTMLElement {
    const section = _el('div', 'lsm-section');
    section.appendChild(_sectionTitle('Label'));

    if (!style.label) style.label = { mode: 'none' };

    const modeBar = _el('div', 'lsm-mode-bar');
    const noneBtn = _el('button', `lsm-mode-btn${style.label.mode === 'none' ? ' lsm-mode-btn--active' : ''}`);
    noneBtn.textContent = 'None';
    const staticBtn = _el('button', `lsm-mode-btn${style.label.mode === 'static' ? ' lsm-mode-btn--active' : ''}`);
    staticBtn.textContent = 'Static';
    const fieldBtn = _el('button', `lsm-mode-btn${style.label.mode === 'field' ? ' lsm-mode-btn--active' : ''}`);
    fieldBtn.textContent = 'By field';
    modeBar.append(noneBtn, staticBtn, fieldBtn);
    section.appendChild(modeBar);

    const dynamicArea = _el('div', 'lsm-dynamic');

    const setActive = (active: HTMLElement) => {
      [noneBtn, staticBtn, fieldBtn].forEach(b => b.classList.remove('lsm-mode-btn--active'));
      active.classList.add('lsm-mode-btn--active');
    };

    const renderNone = () => { dynamicArea.innerHTML = ''; };

    const renderStatic = () => {
      dynamicArea.innerHTML = '';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'lsm-input';
      input.placeholder = 'Label text...';
      input.value = style.label!.staticText ?? '';
      input.addEventListener('input', () => { style.label!.staticText = input.value; });
      dynamicArea.appendChild(input);
      dynamicArea.appendChild(this._buildFontSizeRow(style.label!));
    };

    const renderField = () => {
      dynamicArea.innerHTML = '';
      const sel = this._buildFieldSelect(fields, style.label!.field, (f) => {
        style.label!.field = f;
      });
      dynamicArea.appendChild(sel);
      dynamicArea.appendChild(this._buildFontSizeRow(style.label!));
    };

    noneBtn.addEventListener('click', () => { style.label!.mode = 'none'; setActive(noneBtn); renderNone(); });
    staticBtn.addEventListener('click', () => { style.label!.mode = 'static'; setActive(staticBtn); renderStatic(); });
    fieldBtn.addEventListener('click', () => { style.label!.mode = 'field'; setActive(fieldBtn); renderField(); });

    section.appendChild(dynamicArea);
    if (style.label.mode === 'static') renderStatic();
    else if (style.label.mode === 'field') renderField();

    return section;
  }

  private _buildFontSizeRow(label: LabelConfig): HTMLElement {
    const row = _el('div', 'lsm-row');
    const sizeLabel = _el('span', 'lsm-label-sm');
    sizeLabel.textContent = 'Font size:';
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'lsm-range';
    range.min = '8'; range.max = '24'; range.step = '1';
    range.value = String(label.fontSize ?? 12);
    const valLabel = _el('span', 'lsm-val-label');
    valLabel.textContent = `${range.value}px`;
    range.addEventListener('input', () => {
      label.fontSize = Number(range.value);
      valLabel.textContent = `${range.value}px`;
    });
    row.append(sizeLabel, range, valLabel);
    return row;
  }

  // ── Shared helpers ──────────────────────────────────────────────────────

  private _buildFieldSelect(
    fields: FieldInfo[],
    current: string | undefined,
    onChange: (field: string) => void,
  ): HTMLElement {
    const sel = document.createElement('select');
    sel.className = 'lsm-select';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = ''; emptyOpt.textContent = '— Select field —';
    sel.appendChild(emptyOpt);

    for (const f of fields) {
      const opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = `${f.name} (${f.type})`;
      if (f.name === current) opt.selected = true;
      sel.appendChild(opt);
    }

    sel.addEventListener('change', () => { if (sel.value) onChange(sel.value); });
    return sel;
  }

  private _discoverFields(features: import('geojson').Feature[]): FieldInfo[] {
    const fields: FieldInfo[] = [];
    if (features.length === 0) return fields;
    const sample = features[0].properties ?? {};
    for (const [key, val] of Object.entries(sample)) {
      if (key.startsWith('_')) continue;
      const type = typeof val === 'number' ? 'number'
        : typeof val === 'boolean' ? 'boolean'
        : (typeof val === 'string' && !isNaN(Date.parse(val)) && val.length > 8) ? 'date'
        : 'text';
      fields.push({ name: key, type });
    }
    return fields;
  }

  private async _saveToES(): Promise<void> {
    try {
      await saveLayerStyles(Config.esBaseUrl, this._styles);
    } catch (err) {
      console.error('[LayerStyleModal] Failed to save styles:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

interface FieldInfo {
  name: string;
  type: 'number' | 'text' | 'date' | 'boolean';
}

function _el(tag: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function _sectionTitle(text: string): HTMLElement {
  const t = _el('div', 'lsm-section-title');
  t.textContent = text;
  return t;
}

function rgbaToHex(c: [number, number, number, number]): string {
  return '#' + [c[0], c[1], c[2]].map(n => n.toString(16).padStart(2, '0')).join('');
}

function hexToRgba(hex: string, alpha = 200): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, alpha];
}
