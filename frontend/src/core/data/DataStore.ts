// ---------------------------------------------------------------------------
// DataStore – reactive in-memory feature cache.
//
// Each "source" (keyed by an arbitrary string, usually the ES index name)
// holds a GeoJSON FeatureCollection. When data changes the store dispatches
// a typed event so the layer system can pick it up without polling.
//
// PERFORMANCE
//  • Stores raw Feature[] arrays – no deep copies.
//  • Consumers should treat the arrays as immutable (replace, never mutate).
//  • Emits granular per-source events so unrelated layers don't re-render.
// ---------------------------------------------------------------------------

import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface DataChangeDetail {
  sourceId: string;
  featureCount: number;
}

export class DataChangeEvent extends CustomEvent<DataChangeDetail> {
  constructor(detail: DataChangeDetail) {
    super('data-change', { detail });
  }
}

// ---------------------------------------------------------------------------
// DataStore
// ---------------------------------------------------------------------------

export class DataStore extends EventTarget {
  private _sources = new Map<string, Feature<Geometry, GeoJsonProperties>[]>();

  /** Number of registered sources. */
  get size(): number {
    return this._sources.size;
  }

  /** Replace all features for a given source. */
  set(sourceId: string, features: Feature<Geometry, GeoJsonProperties>[]): void {
    this._sources.set(sourceId, features);
    this.dispatchEvent(
      new DataChangeEvent({ sourceId, featureCount: features.length }),
    );
  }

  /** Append features to an existing source (useful for streaming). */
  append(sourceId: string, features: Feature<Geometry, GeoJsonProperties>[]): void {
    const existing = this._sources.get(sourceId) ?? [];
    const merged = [...existing, ...features];
    this._sources.set(sourceId, merged);
    this.dispatchEvent(
      new DataChangeEvent({ sourceId, featureCount: merged.length }),
    );
  }

  /** Get the feature array for a source (empty array if missing). */
  get(sourceId: string): Feature<Geometry, GeoJsonProperties>[] {
    return this._sources.get(sourceId) ?? [];
  }

  /** Get as a full FeatureCollection (convenience for serialisation). */
  getCollection(sourceId: string): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.get(sourceId),
    };
  }

  /** All registered source IDs. */
  allSourceIds(): string[] {
    return [...this._sources.keys()];
  }

  /** Total features across all sources. */
  totalFeatures(): number {
    let n = 0;
    for (const arr of this._sources.values()) n += arr.length;
    return n;
  }

  /** Remove a source entirely. */
  remove(sourceId: string): void {
    if (this._sources.delete(sourceId)) {
      this.dispatchEvent(
        new DataChangeEvent({ sourceId, featureCount: 0 }),
      );
    }
  }

  /** Wipe everything. */
  clear(): void {
    const ids = [...this._sources.keys()];
    this._sources.clear();
    for (const id of ids) {
      this.dispatchEvent(new DataChangeEvent({ sourceId: id, featureCount: 0 }));
    }
  }
}
