// ---------------------------------------------------------------------------
// SVG icon factories
// ---------------------------------------------------------------------------

import type { GeoType } from '@core/layers';
import type { TileKind } from '@core/layers';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgIcon(paths: string, color: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = paths;
  return svg;
}

export function geoIcon(type: GeoType, color = 'currentColor'): SVGSVGElement {
  switch (type) {
    case 'point':
      return svgIcon('<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9" opacity="0.3"/>', color);
    case 'line':
      return svgIcon('<polyline points="4 18 10 8 14 14 20 4"/>', color);
    case 'polygon':
      return svgIcon('<polygon points="12 3 21 10 18 20 6 20 3 10"/>', color);
  }
}

export function tileIcon(kind: TileKind, color = 'currentColor'): SVGSVGElement {
  switch (kind) {
    case 'satellite':
      return svgIcon('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', color);
    case 'vector':
      return svgIcon('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>', color);
    case 'raster':
      return svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>', color);
  }
}
