// ---------------------------------------------------------------------------
// Toolbar – top-center icon buttons for Layers, Filters, Search
// + Edge-hover: panels open when mouse lingers at screen edges.
//
// Layers & Filters are full-height side panels (right / left).
// Search is a lightweight dropdown attached to the toolbar – it never
// touches the side-panel DOM and cannot cause layout conflicts.
// ---------------------------------------------------------------------------

import type { FilterEngine } from '@filters';

export type PanelName = 'layers' | 'filters' | 'search';

const EDGE_ZONE_PX = 6;
const EDGE_DWELL_MS = 400;

/** Side-panel configs (layers + filters only — search is a dropdown). */
const SIDE_PANELS: Record<'layers' | 'filters', { elId: string; bodyClass: string }> = {
  layers:  { elId: 'side-panel',   bodyClass: 'panel-open'  },
  filters: { elId: 'filter-panel', bodyClass: 'filter-open' },
};

const ALL_BODY_CLASSES = Object.values(SIDE_PANELS).map(p => p.bodyClass);

export class Toolbar {
  private _activePanel: PanelName | null = null;
  private _edgeTimerLeft: ReturnType<typeof setTimeout> | null = null;
  private _edgeTimerRight: ReturnType<typeof setTimeout> | null = null;

  constructor(private _filterEngine: FilterEngine) {}

  get activePanel(): PanelName | null {
    return this._activePanel;
  }

  setup(): void {
    document.querySelectorAll<HTMLButtonElement>('.toolbar__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel as PanelName;
        this._activePanel === panel ? this.closeAll() : this.open(panel);
      });
    });

    document.getElementById('sp-close')?.addEventListener('click', () => this.closeAll());
    document.getElementById('fp-close')?.addEventListener('click', () => this.closeAll());
    document.getElementById('fp-clear')?.addEventListener('click', () => this._filterEngine.clear());

    // Close search dropdown when clicking outside it
    document.addEventListener('mousedown', (e: MouseEvent) => {
      if (this._activePanel !== 'search') return;
      const dropdown = document.getElementById('search-dropdown');
      const btn = document.getElementById('tb-search');
      const target = e.target as HTMLElement;
      if (dropdown?.contains(target) || btn?.contains(target)) return;
      this.closeAll();
    });

    this._setupEdgeHover();
  }

  open(panel: PanelName): void {
    // 1. Close everything first
    this._hideAll();
    this._activePanel = panel;

    // 2. Highlight the active toolbar button
    document.querySelectorAll<HTMLButtonElement>('.toolbar__btn').forEach(btn => {
      btn.classList.toggle('toolbar__btn--active', btn.dataset.panel === panel);
    });

    if (panel === 'search') {
      // Search is a dropdown — just toggle its visibility class
      document.getElementById('search-dropdown')?.classList.add('is-open');
      requestAnimationFrame(() => {
        document.getElementById('search-input')?.focus();
      });
    } else {
      // Layers / Filters are side-panels
      const cfg = SIDE_PANELS[panel];
      document.getElementById(cfg.elId)?.classList.add('is-open');
      document.body.classList.add(cfg.bodyClass);
    }
  }

  closeAll(): void {
    this._hideAll();
    this._activePanel = null;
  }

  /** Hide all panels + dropdown, clear body classes, clear toolbar highlights. */
  private _hideAll(): void {
    // Side panels
    for (const cfg of Object.values(SIDE_PANELS)) {
      document.getElementById(cfg.elId)?.classList.remove('is-open');
    }
    document.body.classList.remove(...ALL_BODY_CLASSES);

    // Search dropdown
    document.getElementById('search-dropdown')?.classList.remove('is-open');

    // Toolbar button highlights
    document.querySelectorAll<HTMLButtonElement>('.toolbar__btn').forEach(btn => {
      btn.classList.remove('toolbar__btn--active');
    });
  }

  setupNotches(): void {
    // Notches are hidden, kept for future reuse
    document.getElementById('panel-notch')
      ?.addEventListener('click', () => this.open('layers'));
    document.getElementById('filter-notch')
      ?.addEventListener('click', () => this.open('filters'));
  }

  setupSectionToggles(): void {
    document.querySelectorAll<HTMLElement>('[data-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.sp-section');
        if (section) section.classList.toggle('collapsed');
      });
    });
  }

  setupMapClickClose(): void {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    mapEl.addEventListener('click', (e: MouseEvent) => {
      if (this._activePanel && (e.target as HTMLElement).closest('#map') === mapEl) {
        this.closeAll();
      }
    });
  }

  // ── Edge-hover ───────────────────────────────────────────────────────────

  private _setupEdgeHover(): void {
    document.addEventListener('mousemove', (e: MouseEvent) => {
      const w = window.innerWidth;

      if (e.clientX <= EDGE_ZONE_PX) {
        if (!this._edgeTimerLeft && !this._activePanel) {
          this._edgeTimerLeft = setTimeout(() => {
            this.open('filters');
            this._edgeTimerLeft = null;
          }, EDGE_DWELL_MS);
        }
      } else if (this._edgeTimerLeft) {
        clearTimeout(this._edgeTimerLeft);
        this._edgeTimerLeft = null;
      }

      if (e.clientX >= w - EDGE_ZONE_PX) {
        if (!this._edgeTimerRight && !this._activePanel) {
          this._edgeTimerRight = setTimeout(() => {
            this.open('layers');
            this._edgeTimerRight = null;
          }, EDGE_DWELL_MS);
        }
      } else if (this._edgeTimerRight) {
        clearTimeout(this._edgeTimerRight);
        this._edgeTimerRight = null;
      }
    });

    document.addEventListener('mouseleave', () => {
      if (this._edgeTimerLeft)  { clearTimeout(this._edgeTimerLeft);  this._edgeTimerLeft = null;  }
      if (this._edgeTimerRight) { clearTimeout(this._edgeTimerRight); this._edgeTimerRight = null; }
    });
  }
}
