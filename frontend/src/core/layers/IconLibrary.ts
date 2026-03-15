// ---------------------------------------------------------------------------
// IconLibrary – SVG icon definitions for map feature rendering.
// Each icon is a 32×32 SVG path that can be rendered in the UI picker
// and converted to data URIs for deck.gl IconLayer.
// ---------------------------------------------------------------------------

export interface IconDef {
  /** Unique key (e.g. 'vessel', 'anchor'). */
  name: string;
  /** Human-readable label for the picker. */
  label: string;
  /** Category for grouping in the picker. */
  category: 'vessel' | 'navigation' | 'transport' | 'shape' | 'marker';
  /** SVG path data (viewBox 0 0 24 24). */
  paths: string;
}

// ---------------------------------------------------------------------------
// Icon definitions
// ---------------------------------------------------------------------------

export const ICON_LIBRARY: IconDef[] = [
  // ── Vessels ──
  { name: 'vessel',       label: 'Vessel',        category: 'vessel',
    paths: '<path d="M2 20l2-4h16l2 4H2z"/><path d="M4 16V8l8-4 8 4v8"/><line x1="12" y1="4" x2="12" y2="16"/>' },
  { name: 'cargo',        label: 'Cargo Ship',    category: 'vessel',
    paths: '<path d="M2 20l2-4h16l2 4H2z"/><rect x="6" y="8" width="12" height="8"/><rect x="8" y="10" width="3" height="3"/><rect x="13" y="10" width="3" height="3"/>' },
  { name: 'tanker',       label: 'Tanker',        category: 'vessel',
    paths: '<path d="M2 20l2-4h16l2 4H2z"/><ellipse cx="12" cy="12" rx="8" ry="4"/><line x1="12" y1="8" x2="12" y2="4"/>' },
  { name: 'sailboat',     label: 'Sailboat',      category: 'vessel',
    paths: '<path d="M2 20l2-4h16l2 4H2z"/><path d="M12 4v12"/><path d="M12 4L6 16"/><path d="M12 6l6 10"/>' },
  { name: 'speedboat',    label: 'Speedboat',     category: 'vessel',
    paths: '<path d="M3 18l1-3h16l1 3H3z"/><path d="M5 15l2-5h10l2 5"/><path d="M8 10l4-6 4 6"/>' },
  { name: 'submarine',    label: 'Submarine',     category: 'vessel',
    paths: '<ellipse cx="12" cy="14" rx="9" ry="4"/><path d="M12 10V6"/><path d="M10 6h4"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="14" r="1"/>' },
  { name: 'fishing',      label: 'Fishing Boat',  category: 'vessel',
    paths: '<path d="M2 20l2-4h16l2 4H2z"/><path d="M10 16V6"/><path d="M10 6l8 4"/><path d="M10 10l6 2"/>' },

  // ── Navigation ──
  { name: 'anchor',       label: 'Anchor',        category: 'navigation',
    paths: '<circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="21"/><path d="M5 13l7 8 7-8"/><line x1="5" y1="13" x2="5" y2="17"/><line x1="19" y1="13" x2="19" y2="17"/>' },
  { name: 'buoy',         label: 'Buoy',          category: 'navigation',
    paths: '<circle cx="12" cy="8" r="4"/><path d="M12 12v6"/><path d="M8 18h8"/><line x1="8" y1="8" x2="16" y2="8"/>' },
  { name: 'lighthouse',   label: 'Lighthouse',    category: 'navigation',
    paths: '<path d="M10 22l-2-14h8l-2 14"/><path d="M6 8h12"/><path d="M9 4h6v4H9z"/><path d="M12 4V2"/><circle cx="12" cy="1" r="1" fill="currentColor"/>' },
  { name: 'compass',      label: 'Compass',       category: 'navigation',
    paths: '<circle cx="12" cy="12" r="9"/><polygon points="12 3 14 12 12 21 10 12" fill="currentColor" opacity="0.3"/><polygon points="12 3 14 12 12 9"/>' },
  { name: 'flag',         label: 'Flag',          category: 'navigation',
    paths: '<line x1="4" y1="3" x2="4" y2="21"/><path d="M4 3h12l-3 4 3 4H4"/>' },
  { name: 'port',         label: 'Port',          category: 'navigation',
    paths: '<path d="M3 21h18"/><rect x="5" y="11" width="14" height="10"/><path d="M5 11l7-8 7 8"/><rect x="9" y="15" width="6" height="6"/>' },

  // ── Transport ──
  { name: 'aircraft',     label: 'Aircraft',      category: 'transport',
    paths: '<path d="M12 2l2 8h6l-2 3h-4l-2 9-2-9H6L4 10h6z"/>' },
  { name: 'helicopter',   label: 'Helicopter',    category: 'transport',
    paths: '<circle cx="12" cy="14" r="4"/><line x1="4" y1="8" x2="20" y2="8"/><line x1="12" y1="8" x2="12" y2="10"/><path d="M16 18l4 2"/><line x1="20" y1="20" x2="22" y2="19"/>' },
  { name: 'truck',        label: 'Truck',         category: 'transport',
    paths: '<rect x="1" y="10" width="15" height="7"/><path d="M16 13h4l2 4v3h-6"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>' },
  { name: 'train',        label: 'Train',         category: 'transport',
    paths: '<rect x="4" y="3" width="16" height="14" rx="2"/><line x1="4" y1="11" x2="20" y2="11"/><line x1="12" y1="3" x2="12" y2="11"/><circle cx="8" cy="19" r="2"/><circle cx="16" cy="19" r="2"/>' },
  { name: 'container',    label: 'Container',     category: 'transport',
    paths: '<rect x="2" y="6" width="20" height="12" rx="1"/><line x1="7" y1="6" x2="7" y2="18"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="17" y1="6" x2="17" y2="18"/>' },
  { name: 'crane',        label: 'Crane',         category: 'transport',
    paths: '<line x1="6" y1="22" x2="6" y2="4"/><line x1="6" y1="4" x2="20" y2="4"/><line x1="20" y1="4" x2="20" y2="10"/><line x1="10" y1="22" x2="10" y2="16"/><path d="M4 22h8"/>' },

  // ── Shapes ──
  { name: 'circle',       label: 'Circle',        category: 'shape',
    paths: '<circle cx="12" cy="12" r="8"/>' },
  { name: 'circle-filled',label: 'Circle (filled)',category: 'shape',
    paths: '<circle cx="12" cy="12" r="8" fill="currentColor"/>' },
  { name: 'square',       label: 'Square',        category: 'shape',
    paths: '<rect x="4" y="4" width="16" height="16" rx="1"/>' },
  { name: 'diamond',      label: 'Diamond',       category: 'shape',
    paths: '<polygon points="12 2 22 12 12 22 2 12"/>' },
  { name: 'triangle',     label: 'Triangle',      category: 'shape',
    paths: '<polygon points="12 3 22 20 2 20"/>' },
  { name: 'star',         label: 'Star',          category: 'shape',
    paths: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>' },
  { name: 'hexagon',      label: 'Hexagon',       category: 'shape',
    paths: '<polygon points="12 2 21 7 21 17 12 22 3 17 3 7"/>' },
  { name: 'cross',        label: 'Cross',         category: 'shape',
    paths: '<line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>' },

  // ── Markers ──
  { name: 'pin',          label: 'Pin',           category: 'marker',
    paths: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>' },
  { name: 'target',       label: 'Target',        category: 'marker',
    paths: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>' },
  { name: 'arrow-up',     label: 'Arrow Up',      category: 'marker',
    paths: '<path d="M12 3l8 14H4z" fill="currentColor" opacity="0.3"/><path d="M12 3l8 14H4z"/>' },
  { name: 'arrow-right',  label: 'Arrow Right',   category: 'marker',
    paths: '<path d="M3 12l14-8v16z" fill="currentColor" opacity="0.3"/><path d="M3 12l14-8v16z"/>' },
  { name: 'warning',      label: 'Warning',       category: 'marker',
    paths: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>' },
  { name: 'info',         label: 'Info',          category: 'marker',
    paths: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/>' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get an icon definition by name. */
export function getIconDef(name: string): IconDef | undefined {
  return ICON_LIBRARY.find(i => i.name === name);
}

/** Get all icons grouped by category. */
export function getIconsByCategory(): Map<string, IconDef[]> {
  const map = new Map<string, IconDef[]>();
  for (const icon of ICON_LIBRARY) {
    if (!map.has(icon.category)) map.set(icon.category, []);
    map.get(icon.category)!.push(icon);
  }
  return map;
}

/**
 * Generate an SVG data URI for an icon, suitable for deck.gl IconLayer.
 * The icon is rendered as a white stroke on transparent background at the given size.
 */
export function iconToDataUrl(
  icon: IconDef,
  size = 48,
  color = '#ffffff',
  strokeWidth = 1.5,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${icon.paths}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Build a deck.gl-compatible icon mapping from a set of icon names.
 * Returns { atlas: HTMLCanvasElement, mapping: Record<name, {x,y,width,height,mask}> }
 */
export function buildIconAtlas(
  iconNames: string[],
  iconSize = 48,
): { atlas: HTMLCanvasElement; mapping: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }> } {
  const cols = Math.ceil(Math.sqrt(iconNames.length));
  const rows = Math.ceil(iconNames.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * iconSize;
  canvas.height = rows * iconSize;
  const ctx = canvas.getContext('2d')!;

  const mapping: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }> = {};

  const promises = iconNames.map((name, idx) => {
    const icon = getIconDef(name);
    if (!icon) return Promise.resolve();

    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = col * iconSize;
    const y = row * iconSize;

    mapping[name] = { x, y, width: iconSize, height: iconSize, mask: true };

    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, x, y, iconSize, iconSize);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = iconToDataUrl(icon, iconSize, '#ffffff', 1.5);
    });
  });

  // Note: atlas is built async; caller should await this if needed
  Promise.all(promises);

  return { atlas: canvas, mapping };
}

/**
 * Async version of buildIconAtlas that waits for all icons to render.
 */
export async function buildIconAtlasAsync(
  iconNames: string[],
  iconSize = 48,
): Promise<{ atlas: HTMLCanvasElement; mapping: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }> }> {
  const cols = Math.ceil(Math.sqrt(iconNames.length));
  const rows = Math.ceil(iconNames.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * iconSize;
  canvas.height = rows * iconSize;
  const ctx = canvas.getContext('2d')!;

  const mapping: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }> = {};

  await Promise.all(iconNames.map((name, idx) => {
    const icon = getIconDef(name);
    if (!icon) return Promise.resolve();

    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = col * iconSize;
    const y = row * iconSize;

    mapping[name] = { x, y, width: iconSize, height: iconSize, mask: true };

    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, x, y, iconSize, iconSize);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = iconToDataUrl(icon, iconSize, '#ffffff', 1.5);
    });
  }));

  return { atlas: canvas, mapping };
}
