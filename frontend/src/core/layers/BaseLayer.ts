// ---------------------------------------------------------------------------
// BaseLayer – abstract interface that every layer type implements.
//
// A "layer" in FleetTracker can be either:
//   • A deck.gl layer  → renders via GPU (points, lines, polygons from ES)
//   • A MapLibre layer → renders via the tile pipeline (WMS raster overlays)
//
// The LayerRegistry treats them uniformly through this interface.
// ---------------------------------------------------------------------------

import type { Layer as DeckGLLayer } from '@deck.gl/core';

export type LayerKind = 'deck' | 'maplibre';

export interface LayerMeta {
  /** Unique layer id (must be stable across re-renders). */
  id: string;
  /** Human-readable label for the layer panel. */
  label: string;
  /** Whether the layer renders through deck.gl or MapLibre. */
  kind: LayerKind;
  /** Is the layer currently visible? */
  visible: boolean;
  /** Rendering order hint (higher = on top). */
  zIndex: number;
  /** Opacity 0-1. */
  opacity: number;
}

export interface BaseLayer {
  readonly meta: LayerMeta;

  /** Set visibility. Returns true if the state changed. */
  setVisible(visible: boolean): boolean;

  /** Set opacity 0-1. Returns true if the value changed. */
  setOpacity(opacity: number): boolean;

  /**
   * For deck.gl layers: return the current deck.gl Layer instance.
   * For MapLibre layers: return null (they are managed on the map directly).
   */
  toDeckLayer(): DeckGLLayer | null;

  /** Clean up any resources (remove MapLibre sources, abort pending fetches…). */
  dispose(): void;
}
