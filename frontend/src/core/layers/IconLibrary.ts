// ---------------------------------------------------------------------------
// IconLibrary – SVG icon definitions for map feature rendering.
// Each icon is a 24×24 SVG path that can be rendered in the UI picker
// and converted to data URIs for deck.gl IconLayer.
//
// Categories: maritime, aircraft, landcraft, shapes, weather, ballistic
// Icons: Material Design-quality stroked SVGs, optimised for small sizes.
// ---------------------------------------------------------------------------

export type IconCategory =
  | 'maritime'
  | 'aircraft'
  | 'landcraft'
  | 'shapes'
  | 'weather'
  | 'ballistic';

export interface IconDef {
  /** Unique key (e.g. 'vessel', 'anchor'). */
  name: string;
  /** Human-readable label for the picker. */
  label: string;
  /** Category for grouping in the picker. */
  category: IconCategory;
  /** SVG path data (viewBox 0 0 24 24). */
  paths: string;
}

/** Display labels for categories in the picker UI. */
export const CATEGORY_LABELS: Record<IconCategory, string> = {
  maritime:   'Maritime',
  aircraft:   'Aircraft',
  landcraft:  'Land Vehicles',
  shapes:     'Shapes',
  weather:    'Weather',
  ballistic:  'Ballistic',
};

/** Sort order for categories in picker. */
export const CATEGORY_ORDER: IconCategory[] = [
  'maritime', 'aircraft', 'landcraft', 'shapes', 'weather', 'ballistic',
];

// ---------------------------------------------------------------------------
// Icon definitions — Material Design style, clean stroked SVGs
// ---------------------------------------------------------------------------

export const ICON_LIBRARY: IconDef[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // MARITIME
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'vessel', label: 'Vessel', category: 'maritime',
    paths: '<path d="M3 18l2 3h14l2-3"/><path d="M5 18V10l7-6 7 6v8"/><line x1="12" y1="4" x2="12" y2="18"/>' },

  { name: 'cargo', label: 'Cargo Ship', category: 'maritime',
    paths: '<path d="M2 20l2-4h16l2 4"/><rect x="5" y="9" width="14" height="7" rx="1"/><rect x="7" y="11" width="3" height="3"/><rect x="14" y="11" width="3" height="3"/><path d="M10 9V6h4v3"/>' },

  { name: 'tanker', label: 'Tanker', category: 'maritime',
    paths: '<path d="M2 20l2-4h16l2 4"/><ellipse cx="12" cy="13" rx="8" ry="3"/><path d="M12 10V6"/><circle cx="12" cy="5" r="1.5"/>' },

  { name: 'sailboat', label: 'Sailboat', category: 'maritime',
    paths: '<path d="M3 20l2-4h14l2 4"/><line x1="12" y1="16" x2="12" y2="3"/><path d="M12 3l-6 11h6"/><path d="M12 5l5 9h-5"/>' },

  { name: 'speedboat', label: 'Speedboat', category: 'maritime',
    paths: '<path d="M3 18l1-3h16l1 3"/><path d="M5 15l3-5h8l3 5"/><path d="M9 10l3-5 3 5"/>' },

  { name: 'submarine', label: 'Submarine', category: 'maritime',
    paths: '<ellipse cx="12" cy="14" rx="9" ry="4"/><path d="M12 10V7"/><rect x="10" y="5" width="4" height="2" rx="1"/><circle cx="7" cy="14" r="1.2" fill="currentColor"/><circle cx="17" cy="14" r="1.2" fill="currentColor"/>' },

  { name: 'fishing', label: 'Fishing Boat', category: 'maritime',
    paths: '<path d="M2 20l2-4h16l2 4"/><path d="M10 16V5"/><path d="M10 5l9 5"/><path d="M10 9l7 3"/><circle cx="16" cy="14" r="1.2"/>' },

  { name: 'anchor', label: 'Anchor', category: 'maritime',
    paths: '<circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="21"/><path d="M5 12a7 7 0 0 0 14 0"/><line x1="9" y1="7" x2="15" y2="7"/>' },

  { name: 'buoy', label: 'Buoy', category: 'maritime',
    paths: '<circle cx="12" cy="8" r="4"/><line x1="8" y1="8" x2="16" y2="8"/><path d="M10 12l-2 8h8l-2-8"/>' },

  { name: 'lighthouse', label: 'Lighthouse', category: 'maritime',
    paths: '<path d="M10 21l-1.5-13h7L14 21"/><rect x="9" y="5" width="6" height="3" rx="1"/><circle cx="12" cy="3.5" r="1.5" fill="currentColor"/><line x1="5" y1="6" x2="8" y2="6"/><line x1="16" y1="6" x2="19" y2="6"/>' },

  { name: 'compass', label: 'Compass', category: 'maritime',
    paths: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><polygon points="12,3 13.5,10.5 12,9" fill="currentColor"/><polygon points="12,21 10.5,13.5 12,15" fill="currentColor" opacity="0.4"/>' },

  { name: 'port', label: 'Port / Harbor', category: 'maritime',
    paths: '<line x1="3" y1="21" x2="21" y2="21"/><rect x="6" y="12" width="12" height="9" rx="1"/><path d="M6 12l6-7 6 7"/><rect x="9" y="16" width="6" height="5"/>' },

  { name: 'ferry', label: 'Ferry', category: 'maritime',
    paths: '<path d="M2 20l2-4h16l2 4"/><rect x="5" y="8" width="14" height="8" rx="2"/><rect x="7" y="10" width="2.5" height="2.5" rx="0.5"/><rect x="10.75" y="10" width="2.5" height="2.5" rx="0.5"/><rect x="14.5" y="10" width="2.5" height="2.5" rx="0.5"/><path d="M9 8V6h6v2"/>' },

  { name: 'kayak', label: 'Kayak', category: 'maritime',
    paths: '<ellipse cx="12" cy="14" rx="10" ry="2.5"/><line x1="12" y1="11.5" x2="12" y2="9"/><path d="M8 7l4 4 4-4"/>' },

  { name: 'trawler', label: 'Trawler', category: 'maritime',
    paths: '<path d="M2 20l2-4h16l2 4"/><path d="M6 16V10h12v6"/><path d="M12 10V6l6 4"/><path d="M8 13h8"/>' },

  { name: 'tugboat', label: 'Tugboat', category: 'maritime',
    paths: '<path d="M3 19l1-3h16l1 3"/><rect x="6" y="10" width="12" height="6" rx="2"/><path d="M9 10V7h6v3"/><circle cx="12" cy="13" r="1.5"/>' },

  // ═══════════════════════════════════════════════════════════════════════════
  // AIRCRAFT
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'aircraft', label: 'Airplane', category: 'aircraft',
    paths: '<path d="M12 2L10 10H4l-2 2h8l-2 8h4l4-8h6l2-2h-8z"/>' },

  { name: 'jet', label: 'Fighter Jet', category: 'aircraft',
    paths: '<path d="M12 2v20"/><path d="M12 6l-7 9h7"/><path d="M12 6l7 9h-7"/><path d="M10 20l-3 2"/><path d="M14 20l3 2"/><circle cx="12" cy="4" r="1.5"/>' },

  { name: 'helicopter', label: 'Helicopter', category: 'aircraft',
    paths: '<circle cx="10" cy="14" r="4"/><line x1="4" y1="8" x2="16" y2="8"/><line x1="10" y1="8" x2="10" y2="10"/><path d="M14 14h5l2 2"/><path d="M14 13h5l2-1"/>' },

  { name: 'drone', label: 'Drone / UAV', category: 'aircraft',
    paths: '<rect x="9" y="9" width="6" height="6" rx="1"/><line x1="9" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="15"/><circle cx="4" cy="12" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="20" r="2"/>' },

  { name: 'glider', label: 'Glider', category: 'aircraft',
    paths: '<path d="M12 4L10 12H3l9 8 9-8h-7z"/>' },

  { name: 'balloon', label: 'Hot Air Balloon', category: 'aircraft',
    paths: '<path d="M12 2C8 2 5 5.6 5 10c0 3 2.5 5.5 4 7h6c1.5-1.5 4-4 4-7 0-4.4-3-8-7-8z"/><rect x="9" y="18" width="6" height="3" rx="1"/><line x1="9" y1="17" x2="15" y2="17"/>' },

  { name: 'parachute', label: 'Parachute', category: 'aircraft',
    paths: '<path d="M4 8c0-4 3.6-6 8-6s8 2 8 6"/><path d="M4 8l8 10 8-10"/><line x1="8" y1="8" x2="12" y2="18"/><line x1="16" y1="8" x2="12" y2="18"/><circle cx="12" cy="20" r="2"/>' },

  { name: 'airship', label: 'Airship / Blimp', category: 'aircraft',
    paths: '<ellipse cx="12" cy="10" rx="9" ry="5"/><path d="M8 15l-1 4h10l-1-4"/><line x1="19" y1="7" x2="22" y2="5"/><line x1="19" y1="13" x2="22" y2="15"/>' },

  { name: 'seaplane', label: 'Seaplane', category: 'aircraft',
    paths: '<path d="M12 3L10 10H5l-2 2h8l-1 4h4l-1-4h8l-2-2h-5z"/><path d="M6 20c2-1 4-1 6 0s4 1 6 0"/>' },

  { name: 'uav-wing', label: 'Flying Wing', category: 'aircraft',
    paths: '<path d="M12 6L2 16h8l2 2 2-2h8z"/><line x1="12" y1="6" x2="12" y2="14"/>' },

  // ═══════════════════════════════════════════════════════════════════════════
  // LAND VEHICLES
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'truck', label: 'Truck', category: 'landcraft',
    paths: '<rect x="1" y="9" width="15" height="8" rx="1"/><path d="M16 12h4l2 3v2h-6"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>' },

  { name: 'car', label: 'Car', category: 'landcraft',
    paths: '<path d="M6 17V12l2-4h8l2 4v5"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/><rect x="7" y="10" width="3" height="2.5" rx="0.5"/><rect x="14" y="10" width="3" height="2.5" rx="0.5"/>' },

  { name: 'train', label: 'Train', category: 'landcraft',
    paths: '<rect x="4" y="3" width="16" height="14" rx="2"/><line x1="4" y1="11" x2="20" y2="11"/><line x1="12" y1="3" x2="12" y2="11"/><circle cx="8" cy="19.5" r="1.5"/><circle cx="16" cy="19.5" r="1.5"/><line x1="8" y1="17" x2="8" y2="18"/><line x1="16" y1="17" x2="16" y2="18"/>' },

  { name: 'tank', label: 'Tank', category: 'landcraft',
    paths: '<rect x="3" y="12" width="18" height="6" rx="3"/><rect x="7" y="8" width="10" height="4" rx="1"/><line x1="17" y1="10" x2="22" y2="10"/><circle cx="6" cy="15" r="1.5" fill="currentColor"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/><circle cx="18" cy="15" r="1.5" fill="currentColor"/>' },

  { name: 'apc', label: 'APC', category: 'landcraft',
    paths: '<rect x="3" y="10" width="18" height="7" rx="2"/><path d="M5 10l3-4h8l3 4"/><circle cx="6" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>' },

  { name: 'motorcycle', label: 'Motorcycle', category: 'landcraft',
    paths: '<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M8 17l3-7h2l1 3h3"/><path d="M11 10l2-4"/>' },

  { name: 'container', label: 'Container', category: 'landcraft',
    paths: '<rect x="2" y="6" width="20" height="12" rx="1"/><line x1="7" y1="6" x2="7" y2="18"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="17" y1="6" x2="17" y2="18"/>' },

  { name: 'crane', label: 'Crane', category: 'landcraft',
    paths: '<line x1="6" y1="22" x2="6" y2="4"/><line x1="6" y1="4" x2="20" y2="4"/><line x1="20" y1="4" x2="20" y2="10"/><line x1="4" y1="22" x2="8" y2="22"/><line x1="10" y1="22" x2="10" y2="16"/><line x1="8" y1="22" x2="12" y2="22"/>' },

  { name: 'person', label: 'Person', category: 'landcraft',
    paths: '<circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="14"/><path d="M8 21l4-7 4 7"/><line x1="7" y1="12" x2="17" y2="12"/>' },

  { name: 'bus', label: 'Bus', category: 'landcraft',
    paths: '<rect x="4" y="4" width="16" height="14" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><rect x="6" y="5.5" width="4" height="3.5" rx="0.5"/><rect x="14" y="5.5" width="4" height="3.5" rx="0.5"/><circle cx="7.5" cy="20" r="1.5"/><circle cx="16.5" cy="20" r="1.5"/>' },

  { name: 'bicycle', label: 'Bicycle', category: 'landcraft',
    paths: '<circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M5.5 17l4-8h4l2 4"/><line x1="15.5" y1="13" x2="18.5" y2="17"/><line x1="9.5" y1="9" x2="12" y2="4"/>' },

  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC SHAPES
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'circle', label: 'Circle', category: 'shapes',
    paths: '<circle cx="12" cy="12" r="8"/>' },

  { name: 'circle-filled', label: 'Circle (filled)', category: 'shapes',
    paths: '<circle cx="12" cy="12" r="8" fill="currentColor"/>' },

  { name: 'circle-dot', label: 'Circle Dot', category: 'shapes',
    paths: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor"/>' },

  { name: 'square', label: 'Square', category: 'shapes',
    paths: '<rect x="4" y="4" width="16" height="16" rx="1"/>' },

  { name: 'square-filled', label: 'Square (filled)', category: 'shapes',
    paths: '<rect x="4" y="4" width="16" height="16" rx="1" fill="currentColor"/>' },

  { name: 'diamond', label: 'Diamond', category: 'shapes',
    paths: '<polygon points="12 2 22 12 12 22 2 12"/>' },

  { name: 'triangle', label: 'Triangle', category: 'shapes',
    paths: '<polygon points="12 3 22 20 2 20"/>' },

  { name: 'triangle-down', label: 'Triangle Down', category: 'shapes',
    paths: '<polygon points="12 21 22 4 2 4"/>' },

  { name: 'star', label: 'Star', category: 'shapes',
    paths: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>' },

  { name: 'hexagon', label: 'Hexagon', category: 'shapes',
    paths: '<polygon points="12 2 21 7 21 17 12 22 3 17 3 7"/>' },

  { name: 'cross', label: 'Cross / Plus', category: 'shapes',
    paths: '<line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>' },

  { name: 'x-mark', label: 'X Mark', category: 'shapes',
    paths: '<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>' },

  { name: 'pin', label: 'Map Pin', category: 'shapes',
    paths: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>' },

  { name: 'arrow-up', label: 'Arrow Up', category: 'shapes',
    paths: '<path d="M12 3l8 14H4z" fill="currentColor" opacity="0.3"/><path d="M12 3l8 14H4z"/>' },

  { name: 'arrow-right', label: 'Arrow Right', category: 'shapes',
    paths: '<path d="M3 12l14-8v16z" fill="currentColor" opacity="0.3"/><path d="M3 12l14-8v16z"/>' },

  { name: 'target', label: 'Target', category: 'shapes',
    paths: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>' },

  { name: 'pentagon', label: 'Pentagon', category: 'shapes',
    paths: '<polygon points="12 2 22 9 19 20 5 20 2 9"/>' },

  { name: 'ring', label: 'Ring', category: 'shapes',
    paths: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>' },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'cloud', label: 'Cloud', category: 'weather',
    paths: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>' },

  { name: 'sun', label: 'Sun', category: 'weather',
    paths: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>' },

  { name: 'rain', label: 'Rain', category: 'weather',
    paths: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><line x1="8" y1="21" x2="7" y2="24"/><line x1="12" y1="21" x2="11" y2="24"/><line x1="16" y1="21" x2="15" y2="24"/>' },

  { name: 'storm', label: 'Storm', category: 'weather',
    paths: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M13 12l-3 5h4l-3 5"/>' },

  { name: 'wind', label: 'Wind', category: 'weather',
    paths: '<path d="M9.59 4.59A2 2 0 1 1 11 8H2"/><path d="M12.59 19.41A2 2 0 1 0 14 16H2"/><path d="M15.73 7.27A2.5 2.5 0 1 1 17.5 12H2"/>' },

  { name: 'snow', label: 'Snow', category: 'weather',
    paths: '<line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/><circle cx="12" cy="12" r="3"/>' },

  { name: 'fog', label: 'Fog', category: 'weather',
    paths: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="6" y1="18" x2="18" y2="18"/>' },

  { name: 'thermometer', label: 'Thermometer', category: 'weather',
    paths: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/><circle cx="11.5" cy="17.5" r="2" fill="currentColor"/><line x1="11.5" y1="15.5" x2="11.5" y2="6"/>' },

  { name: 'wave', label: 'Ocean Wave', category: 'weather',
    paths: '<path d="M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>' },

  { name: 'hurricane', label: 'Hurricane', category: 'weather',
    paths: '<circle cx="12" cy="12" r="3"/><path d="M12 2c3 2 4 5 2 8"/><path d="M22 12c-2 3-5 4-8 2"/><path d="M12 22c-3-2-4-5-2-8"/><path d="M2 12c2-3 5-4 8-2"/>' },

  { name: 'tide', label: 'Tide', category: 'weather',
    paths: '<path d="M2 10c3-4 6-4 10 0s7 4 10 0"/><path d="M2 16c3-4 6-4 10 0s7 4 10 0"/><line x1="12" y1="2" x2="12" y2="6" stroke-dasharray="1 2"/><line x1="12" y1="20" x2="12" y2="22"/>' },

  // ═══════════════════════════════════════════════════════════════════════════
  // BALLISTIC / MILITARY / TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'missile', label: 'Missile', category: 'ballistic',
    paths: '<path d="M12 2l3 8-3 2-3-2z"/><path d="M9 10l-3 3v2l3-1"/><path d="M15 10l3 3v2l-3-1"/><line x1="12" y1="12" x2="12" y2="19"/><path d="M10 19l2 3 2-3"/>' },

  { name: 'rocket', label: 'Rocket', category: 'ballistic',
    paths: '<path d="M12 2C9 7 9 12 12 17c3-5 3-10 0-15z"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="15" x2="5" y2="18"/><line x1="16" y1="15" x2="19" y2="18"/><circle cx="12" cy="9" r="1.5"/>' },

  { name: 'radar', label: 'Radar', category: 'ballistic',
    paths: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="12" x2="18" y2="6"/>' },

  { name: 'satellite', label: 'Satellite', category: 'ballistic',
    paths: '<rect x="8" y="8" width="8" height="8" rx="1" transform="rotate(45 12 12)"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>' },

  { name: 'crosshair', label: 'Crosshair', category: 'ballistic',
    paths: '<circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>' },

  { name: 'explosion', label: 'Explosion', category: 'ballistic',
    paths: '<polygon points="12 2 14 8 20 6 16 11 22 12 16 14 18 20 12 16 6 20 8 14 2 12 8 10 6 4 10 8"/>' },

  { name: 'shield', label: 'Shield', category: 'ballistic',
    paths: '<path d="M12 2l8 4v6c0 5.5-3.5 9-8 11-4.5-2-8-5.5-8-11V6z"/>' },

  { name: 'flag', label: 'Flag', category: 'ballistic',
    paths: '<line x1="4" y1="3" x2="4" y2="21"/><path d="M4 3h12l-3 4 3 4H4"/>' },

  { name: 'warning', label: 'Warning', category: 'ballistic',
    paths: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>' },

  { name: 'torpedo', label: 'Torpedo', category: 'ballistic',
    paths: '<ellipse cx="12" cy="12" rx="9" ry="3"/><line x1="21" y1="12" x2="18" y2="12"/><path d="M3 12l2-2v4z" fill="currentColor"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="19" y1="10" x2="21" y2="9"/><line x1="19" y1="14" x2="21" y2="15"/>' },

  { name: 'nuclear', label: 'Nuclear', category: 'ballistic',
    paths: '<circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 0 1 5 4l-5 6"/><path d="M22 12a10 10 0 0 1-4 5l-6-5"/><path d="M12 22a10 10 0 0 1-5-4l5-6"/><path d="M2 12a10 10 0 0 1 4-5l6 5"/>' },

  { name: 'scope', label: 'Scope', category: 'ballistic',
    paths: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="1" fill="currentColor"/>' },

  { name: 'trajectory', label: 'Trajectory', category: 'ballistic',
    paths: '<path d="M3 20Q12 4 21 8" fill="none"/><polygon points="21 8 18 4 17 9" fill="currentColor"/><circle cx="3" cy="20" r="2"/>' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get an icon definition by name. */
export function getIconDef(name: string): IconDef | undefined {
  return ICON_LIBRARY.find(i => i.name === name);
}

/** Get all icons grouped by category, in display order. */
export function getIconsByCategory(): Map<string, IconDef[]> {
  const map = new Map<string, IconDef[]>();
  // Initialize in order
  for (const cat of CATEGORY_ORDER) {
    map.set(cat, []);
  }
  for (const icon of ICON_LIBRARY) {
    const arr = map.get(icon.category);
    if (arr) arr.push(icon);
    else map.set(icon.category, [icon]);
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
