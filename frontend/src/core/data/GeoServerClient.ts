// ---------------------------------------------------------------------------
// GeoServerClient – queries GeoServer REST/OWS endpoints to discover
// available WMS layers and tile layers.
// ---------------------------------------------------------------------------

import { Config } from '../../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeoServerLayerInfo {
  /** Layer name (workspace:layer or just layer). */
  name: string;
  /** Human-readable title. */
  title: string;
  /** Abstract / description (may be empty). */
  abstract: string;
  /** Bounding box in EPSG:4326 [west, south, east, north]. */
  bbox?: [number, number, number, number];
  /** Available SRS / CRS codes. */
  srs: string[];
  /** Whether this is queryable. */
  queryable: boolean;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class GeoServerClient {
  private _base: string;

  constructor(baseUrl = Config.geoserverBaseUrl) {
    this._base = baseUrl.replace(/\/$/, '');
  }

  // -- WMS GetCapabilities ------------------------------------------------

  /**
   * Fetch the WMS GetCapabilities document and parse available layers.
   * Returns an array of layer info objects.
   */
  async listWmsLayers(signal?: AbortSignal): Promise<GeoServerLayerInfo[]> {
    const url = `${this._base}/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`GeoServer GetCapabilities failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    return this._parseCapabilities(text);
  }

  // -- WMTS GetCapabilities -----------------------------------------------

  /**
   * Fetch the WMTS GetCapabilities document and parse available tile layers.
   * Returns an array of layer info objects.
   */
  async listWmtsLayers(signal?: AbortSignal): Promise<GeoServerLayerInfo[]> {
    const url = `${this._base}/gwc/service/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`GeoServer WMTS GetCapabilities failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    return this._parseWmtsCapabilities(text);
  }

  // -- Combined listing ---------------------------------------------------

  /**
   * Discover all available layers from GeoServer (WMS + WMTS).
   * Returns deduplicated list of layers.
   */
  async listAllLayers(signal?: AbortSignal): Promise<{
    wmsLayers: GeoServerLayerInfo[];
    wmtsLayers: GeoServerLayerInfo[];
  }> {
    const [wmsLayers, wmtsLayers] = await Promise.allSettled([
      this.listWmsLayers(signal),
      this.listWmtsLayers(signal),
    ]);
    return {
      wmsLayers: wmsLayers.status === 'fulfilled' ? wmsLayers.value : [],
      wmtsLayers: wmtsLayers.status === 'fulfilled' ? wmtsLayers.value : [],
    };
  }

  // -- XML parsing --------------------------------------------------------

  private _parseCapabilities(xml: string): GeoServerLayerInfo[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const layers: GeoServerLayerInfo[] = [];

    // WMS 1.1.1: <Layer queryable="1"><Name>...</Name><Title>...</Title>
    const layerEls = doc.querySelectorAll('Layer > Name');
    for (const nameEl of layerEls) {
      const parent = nameEl.parentElement;
      if (!parent) continue;

      const name = nameEl.textContent?.trim() ?? '';
      if (!name) continue;

      const title = parent.querySelector(':scope > Title')?.textContent?.trim() ?? name;
      const abstract = parent.querySelector(':scope > Abstract')?.textContent?.trim() ?? '';
      const queryable = parent.getAttribute('queryable') === '1';

      // Extract LatLonBoundingBox
      let bbox: [number, number, number, number] | undefined;
      const bbEl = parent.querySelector(':scope > LatLonBoundingBox');
      if (bbEl) {
        bbox = [
          parseFloat(bbEl.getAttribute('minx') ?? '0'),
          parseFloat(bbEl.getAttribute('miny') ?? '0'),
          parseFloat(bbEl.getAttribute('maxx') ?? '0'),
          parseFloat(bbEl.getAttribute('maxy') ?? '0'),
        ];
      }

      // Extract SRS
      const srs: string[] = [];
      parent.querySelectorAll(':scope > SRS').forEach(el => {
        const s = el.textContent?.trim();
        if (s) srs.push(s);
      });

      layers.push({ name, title, abstract, bbox, srs, queryable });
    }

    return layers;
  }

  private _parseWmtsCapabilities(xml: string): GeoServerLayerInfo[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const layers: GeoServerLayerInfo[] = [];

    // WMTS uses ows namespace; query by local name
    const layerEls = doc.querySelectorAll('Layer');
    for (const el of layerEls) {
      // WMTS Layer has ows:Identifier, ows:Title
      const name =
        el.querySelector('Identifier')?.textContent?.trim() ?? '';
      if (!name) continue;

      const title =
        el.querySelector('Title')?.textContent?.trim() ?? name;
      const abstract =
        el.querySelector('Abstract')?.textContent?.trim() ?? '';

      // WGS84BoundingBox
      let bbox: [number, number, number, number] | undefined;
      const bbEl = el.querySelector('WGS84BoundingBox');
      if (bbEl) {
        const lower = bbEl.querySelector('LowerCorner')?.textContent?.trim().split(/\s+/);
        const upper = bbEl.querySelector('UpperCorner')?.textContent?.trim().split(/\s+/);
        if (lower && upper && lower.length >= 2 && upper.length >= 2) {
          bbox = [
            parseFloat(lower[0]),
            parseFloat(lower[1]),
            parseFloat(upper[0]),
            parseFloat(upper[1]),
          ];
        }
      }

      layers.push({ name, title, abstract, bbox, srs: [], queryable: false });
    }

    return layers;
  }
}
