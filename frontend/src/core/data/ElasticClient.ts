// ---------------------------------------------------------------------------
// ElasticClient – thin wrapper around the Elasticsearch REST API.
//
// Builds _search and _mvt requests, returns typed results.
// Never touches the DOM – pure data fetching.
//
// All requests go through the Vite dev proxy (/api/es → ES container).
// ---------------------------------------------------------------------------

import type {
  Feature,
  Point,
  Geometry,
  GeoJsonProperties,
} from 'geojson';
import { Config } from '../../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EsSearchOptions {
  index: string;
  query?: Record<string, unknown>;
  geoField?: string;
  size?: number;
  sort?: Record<string, unknown>[];
  _source?: string[];
  /** Optional AbortSignal to cancel the request. */
  signal?: AbortSignal;
}

export interface EsHit {
  _index: string;
  _id: string;
  _source: Record<string, unknown>;
}

export interface EsSearchResponse {
  hits: {
    total: { value: number };
    hits: EsHit[];
  };
}

export interface EsIndexInfo {
  index: string;
  docsCount: number;
  health: 'green' | 'yellow' | 'red';
  status: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ElasticClient {
  private _base: string;
  private _apiKey: string | undefined;

  constructor(baseUrl = Config.esBaseUrl, apiKey = Config.esApiKey) {
    this._base = baseUrl.replace(/\/$/, '');
    this._apiKey = apiKey;
  }

  /** Public accessor for the base URL. */
  get baseUrl(): string {
    return this._base;
  }

  /** Build common headers, including Authorization when an API key is set. */
  headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this._apiKey) {
      h['Authorization'] = `ApiKey ${this._apiKey}`;
    }
    return h;
  }

  // -- Raw search ---------------------------------------------------------

  async search(opts: EsSearchOptions): Promise<EsSearchResponse> {
    const { index, query, size = Config.esMaxHits, sort, _source, signal } = opts;

    const body: Record<string, unknown> = {
      size,
      query: query ?? { match_all: {} },
    };
    if (sort) body.sort = sort;
    if (_source) body._source = _source;

    const res = await fetch(`${this._base}/${index}/_search`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      throw new Error(`ES search failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  // -- Count --------------------------------------------------------------

  /**
   * Lightweight document count (uses _count endpoint).
   * Accepts an optional query so the count respects active filters.
   */
  async count(
    index: string,
    query?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<number> {
    const body: Record<string, unknown> = {
      query: query ?? { match_all: {} },
    };
    const res = await fetch(`${this._base}/${index}/_count`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`ES count failed: ${res.status}`);
    const json = await res.json();
    return json.count as number;
  }

  // -- GeoJSON helper -----------------------------------------------------

  /**
   * Run a search and convert hits → GeoJSON Features.
   *
   * Supports both `geo_point` fields (→ Point) and `geo_shape` fields.
   * Falls back to raw _source as properties.
   */
  async searchAsGeoJSON(
    opts: EsSearchOptions,
  ): Promise<Feature<Geometry, GeoJsonProperties>[]> {
    const geoField = opts.geoField ?? 'location';
    const resp = await this.search(opts);
    const features: Feature<Geometry, GeoJsonProperties>[] = [];

    for (const hit of resp.hits.hits) {
      const src = hit._source;
      const geo = src[geoField];
      if (!geo) continue;

      let geometry: Geometry;

      // geo_point stored as { lat, lon }
      if (
        typeof geo === 'object' &&
        geo !== null &&
        'lat' in geo &&
        'lon' in geo
      ) {
        const g = geo as { lat: number; lon: number };
        geometry = { type: 'Point', coordinates: [g.lon, g.lat] } as Point;
      }
      // geo_point stored as [lon, lat]
      else if (Array.isArray(geo) && geo.length === 2 && typeof geo[0] === 'number') {
        geometry = { type: 'Point', coordinates: [geo[0], geo[1]] } as Point;
      }
      // geo_shape (already GeoJSON geometry)
      else if (typeof geo === 'object' && geo !== null && 'type' in geo) {
        geometry = geo as Geometry;
      } else {
        continue; // skip unrecognised formats
      }

      // Strip the geo field from properties to avoid duplication.
      const props: GeoJsonProperties = { _id: hit._id, _index: hit._index };
      for (const [k, v] of Object.entries(src)) {
        if (k !== geoField) props[k] = v as string | number | boolean | null;
      }

      features.push({ type: 'Feature', geometry, properties: props });
    }

    return features;
  }

  // -- Vector tile endpoint -----------------------------------------------

  /**
   * Fetch an MVT tile from the ES vector tile API.
   * Returns the raw ArrayBuffer.
   */
  async fetchVectorTile(
    index: string,
    field: string,
    z: number,
    x: number,
    y: number,
    query?: Record<string, unknown>,
  ): Promise<ArrayBuffer> {
    const url = `${this._base}/${index}/_mvt/${field}/${z}/${x}/${y}`;
    const body: Record<string, unknown> = {};
    if (query) body.query = query;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`ES MVT failed: ${res.status}`);
    }
    return res.arrayBuffer();
  }

  // -- List indices -------------------------------------------------------

  /**
   * List all non-system indices from the cluster.
   * Returns an array of { index, docsCount, geoFields } objects.
   */
  async listIndices(): Promise<EsIndexInfo[]> {
    const res = await fetch(`${this._base}/_cat/indices?format=json&h=index,docs.count,health,status`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`ES _cat/indices failed: ${res.status}`);
    const rows: Array<{ index: string; 'docs.count': string; health: string; status: string }> = await res.json();

    // Filter out system/internal indices (those starting with '.')
    return rows
      .filter(r => !r.index.startsWith('.'))
      .map(r => ({
        index: r.index,
        docsCount: parseInt(r['docs.count'] || '0', 10),
        health: r.health as 'green' | 'yellow' | 'red',
        status: r.status,
      }));
  }

  // -- Detect geo fields --------------------------------------------------

  /**
   * Inspect the mapping of an index and return the names of all
   * geo_point / geo_shape fields (used to auto-detect the geo field).
   */
  async detectGeoFields(index: string, signal?: AbortSignal): Promise<string[]> {
    const mapping = await this.getMapping(index, signal);
    const geoFields: string[] = [];
    for (const [field, meta] of Object.entries(mapping)) {
      if (meta.type === 'geo_point' || meta.type === 'geo_shape') {
        geoFields.push(field);
      }
    }
    return geoFields;
  }

  // -- Detect geometry type from a sample ---------------------------------

  /**
   * Fetch a small sample from an index to determine the dominant geometry type.
   * Returns 'point' | 'line' | 'polygon' or null if not determinable.
   */
  async detectGeoType(index: string, geoField: string): Promise<'point' | 'line' | 'polygon' | null> {
    const features = await this.searchAsGeoJSON({ index, geoField, size: 10 });
    if (features.length === 0) return null;

    // Tally geometry types across the whole sample and return the dominant one.
    const tally = new Map<string, number>();
    for (const f of features) {
      const t = f.geometry.type;
      tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    const dominant = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];

    if (dominant === 'Point' || dominant === 'MultiPoint') return 'point';
    if (dominant === 'LineString' || dominant === 'MultiLineString') return 'line';
    if (dominant === 'Polygon' || dominant === 'MultiPolygon') return 'polygon';
    return null;
  }

  // -- Index mapping (for dynamic filter UI) ------------------------------

  async getMapping(
    index: string,
    signal?: AbortSignal,
  ): Promise<Record<string, { type: string; fields?: Record<string, unknown> }>> {
    const res = await fetch(`${this._base}/${index}/_mapping`, {
      headers: this.headers(),
      signal,
    });
    if (!res.ok) throw new Error(`ES mapping failed: ${res.status}`);
    const json = await res.json();
    const firstIndex = Object.keys(json)[0];
    return json[firstIndex]?.mappings?.properties ?? {};
  }
}
