// ---------------------------------------------------------------------------
// Toolbar – top-center icon buttons for Layers, Filters, Search
// ---------------------------------------------------------------------------

import type { FilterEngine } from '@filters';

export type PanelName = 'layers' | 'filters' | 'search';

export class Toolbar {
  private _activePanel: PanelName | null = null;

  constructor(private _filterEngine: FilterEngine) {}

  get activePanel(): PanelName | null {
    return this._activePanel;
  }

  setup(): void {
    const btns = document.querySelectorAll<HTMLButtonElement>('.toolbar__btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel as PanelName;
        if (this._activePanel === panel) {
          this.closeAll();
        } else {
          this.open(panel);
        }
      });
    });

    document.getElementById('sp-close')?.addEventListener('click', () => this.closeAll());
    document.getElementById('fp-close')?.addEventListener('click', () => this.closeAll());
    document.getElementById('search-close')?.addEventListener('click', () => this.closeAll());
    document.getElementById('fp-clear')?.addEventListener('click', () => this._filterEngine.clear());
  }

  open(panel: PanelName): void {
    this.closeAll();
    this._activePanel = panel;

    document.querySelectorAll<HTMLButtonElement>('.toolbar__btn').forEach(btn => {
      btn.classList.toggle('toolbar__btn--active', btn.dataset.panel === panel);
    });

    switch (panel) {
      case 'layers':  document.body.classList.add('panel-open'); break;
      case 'filters': document.body.classList.add('filter-open'); break;
      case 'search':  document.body.classList.add('search-open'); break;
    }
  }

  closeAll(): void {
    this._activePanel = null;
    document.body.classList.remove('panel-open', 'filter-open', 'search-open');
    document.querySelectorAll<HTMLButtonElement>('.toolbar__btn').forEach(btn => {
      btn.classList.remove('toolbar__btn--active');
    });
  }

  /** Wire notch toggles (kept for future reuse). */
  setupNotches(): void {
    document.getElementById('panel-notch')
      ?.addEventListener('click', () => document.body.classList.toggle('panel-open'));
    document.getElementById('filter-notch')
      ?.addEventListener('click', () => document.body.classList.toggle('filter-open'));
  }

  /** Wire collapsible section headers. */
  setupSectionToggles(): void {
    document.querySelectorAll<HTMLElement>('[data-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.sp-section');
        if (section) section.classList.toggle('collapsed');
      });
    });
  }
}
