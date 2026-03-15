// ---------------------------------------------------------------------------
// LayerRegistry – central catalogue of all layers in the application.
//
// Holds both deck.gl and MapLibre-managed layers behind the BaseLayer
// interface. When any layer changes (visibility, opacity, data) the registry
// emits a "change" event so consumers can re-render.
//
// It also produces the merged deck.gl layer array that MapEngine needs.
// ---------------------------------------------------------------------------

import type { Layer as DeckGLLayer } from '@deck.gl/core';
import type { BaseLayer } from './BaseLayer';

export class LayerRegistry extends EventTarget {
  private _layers = new Map<string, BaseLayer>();

  /** Register a layer (or replace one with the same id). */
  add(layer: BaseLayer): void {
    this._layers.set(layer.meta.id, layer);
    this._emit();
  }

  /** Remove a layer by id. Calls dispose() on it. */
  remove(id: string): void {
    const layer = this._layers.get(id);
    if (layer) {
      layer.dispose();
      this._layers.delete(id);
      this._emit();
    }
  }

  /** Get a layer by id (typed convenience). */
  get<T extends BaseLayer = BaseLayer>(id: string): T | undefined {
    return this._layers.get(id) as T | undefined;
  }

  /** Iterate all layers ordered by zIndex. */
  all(): BaseLayer[] {
    return [...this._layers.values()].sort(
      (a, b) => a.meta.zIndex - b.meta.zIndex,
    );
  }

  /** Toggle visibility for a layer. */
  setVisible(id: string, visible: boolean): void {
    const layer = this._layers.get(id);
    if (layer?.setVisible(visible)) {
      this._emit();
    }
  }

  /** Set opacity for a layer. */
  setOpacity(id: string, opacity: number): void {
    const layer = this._layers.get(id);
    if (layer?.setOpacity(opacity)) {
      this._emit();
    }
  }

  /**
   * Build the merged deck.gl layer array from all visible deck-kind layers.
   * This is what gets passed to MapEngine.setDeckLayers().
   */
  buildDeckLayers(): DeckGLLayer[] {
    const result: DeckGLLayer[] = [];
    for (const layer of this.all()) {
      if (layer.meta.kind === 'deck') {
        try {
          // Support both single-layer and multi-layer adapters
          if ('toDeckLayers' in layer && typeof (layer as any).toDeckLayers === 'function') {
            const layers = (layer as any).toDeckLayers() as DeckGLLayer[];
            result.push(...layers);
          } else {
            const dl = layer.toDeckLayer();
            if (dl) result.push(dl);
          }
        } catch (err) {
          console.error(`[LayerRegistry] Error building layer "${layer.meta.id}":`, err);
        }
      }
    }
    return result;
  }

  /** Notify listeners that the layer stack changed. */
  private _emit(): void {
    this.dispatchEvent(new Event('change'));
  }
}
