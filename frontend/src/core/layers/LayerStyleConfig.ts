// ---------------------------------------------------------------------------
// LayerStyleConfig – types for per-layer visual configuration + ES persistence.
// ---------------------------------------------------------------------------

export interface ColorConfig {
  mode: 'static' | 'field';
  /** RGBA tuple for static mode. */
  staticColor?: [number, number, number, number];
  /** Field name for field-based coloring. */
  field?: string;
  /** Categorical: field value → RGBA color. */
  colorMap?: Record<string, [number, number, number, number]>;
  /** Numeric gradient: maps min→max field values to a color range. */
  gradient?: {
    min: [number, number, number, number];
    max: [number, number, number, number];
    minVal?: number;
    maxVal?: number;
  };
}

export interface OrientationConfig {
  mode: 'static' | 'field';
  /** Degrees (0=north, clockwise) for static mode. */
  staticAngle?: number;
  /** Field name whose numeric value provides the angle. */
  field?: string;
}

export interface LabelConfig {
  mode: 'none' | 'static' | 'field';
  /** Static text when mode='static'. */
  staticText?: string;
  /** Field name when mode='field'. */
  field?: string;
  /** Font size in pixels (default 12). */
  fontSize?: number;
}

export interface LayerStyleConfig {
  /** Layer / index ID this style applies to. */
  layerId: string;
  /** Icon name from IconLibrary (undefined = default circle/line/polygon). */
  icon?: string;
  /** Icon size in pixels (default ~16). */
  iconSize?: number;
  /** Color configuration. */
  color?: ColorConfig;
  /** Orientation / rotation angle. */
  orientation?: OrientationConfig;
  /** Feature labels. */
  label?: LabelConfig;
}

// ---------------------------------------------------------------------------
// Backend API persistence
// ---------------------------------------------------------------------------

const CONFIG_DOC_ID = 'layer-styles';

export interface LayerStylesDoc {
  styles: LayerStyleConfig[];
}

/** Load all layer styles from backend API. */
export async function loadLayerStyles(apiBaseUrl: string): Promise<Map<string, LayerStyleConfig>> {
  const map = new Map<string, LayerStyleConfig>();
  try {
    const res = await fetch(`${apiBaseUrl}/config/${CONFIG_DOC_ID}`);
    if (res.ok) {
      const doc = await res.json();
      for (const s of (doc as LayerStylesDoc).styles ?? []) {
        map.set(s.layerId, s);
      }
    }
  } catch {
    // Config doesn't exist yet – fine
  }
  return map;
}

/** Save all layer styles to backend API. */
export async function saveLayerStyles(
  apiBaseUrl: string,
  styles: Map<string, LayerStyleConfig>,
): Promise<void> {
  const body: LayerStylesDoc = { styles: [...styles.values()] };
  await fetch(`${apiBaseUrl}/config/${CONFIG_DOC_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Pre-defined categorical palette (10 distinct colors). */
export const CATEGORICAL_PALETTE: [number, number, number, number][] = [
  [59, 130, 246, 200],   // blue
  [239, 68, 68, 200],    // red
  [34, 197, 94, 200],    // green
  [234, 179, 8, 200],    // yellow
  [168, 85, 247, 200],   // purple
  [249, 115, 22, 200],   // orange
  [20, 184, 166, 200],   // teal
  [236, 72, 153, 200],   // pink
  [99, 102, 241, 200],   // indigo
  [132, 204, 22, 200],   // lime
];

/** Interpolate between two RGBA colors. `t` is 0..1. */
export function lerpColor(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}
