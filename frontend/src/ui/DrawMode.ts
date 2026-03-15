// ---------------------------------------------------------------------------
// DrawMode – draw a polygon or bounding box on the map for geo filters.
//
// Visual feedback uses an absolutely-positioned SVG overlay on top of the map
// container. This guarantees visibility regardless of deck.gl's interleaved
// rendering which can hide MapLibre native layers.
//
// Input uses direct DOM pointer events on the map container with
// { capture: true } so they fire BEFORE deck.gl's event manager.
// ---------------------------------------------------------------------------

import type { MapEngine } from '@core/map';
import type { FilterPanel } from '@filters';

export type DrawModeType = 'polygon' | 'bbox';

export class DrawMode {
  private _active = false;
  private _mode: DrawModeType = 'polygon';
  private _points: Array<[number, number]> = [];
  private _engine: MapEngine;
  private _getFilterPanel: () => FilterPanel | null;

  // SVG overlay for drawing feedback
  private _svg: SVGSVGElement | null = null;

  // Bound handlers for cleanup
  private _onPointerDown: ((e: PointerEvent) => void) | null = null;
  private _onPointerMove: ((e: PointerEvent) => void) | null = null;
  private _onDblClick:    ((e: MouseEvent)   => void) | null = null;
  private _onKeyDown:     ((e: KeyboardEvent) => void) | null = null;
  private _onMapMove:     (() => void) | null = null;

  // Current cursor position for live preview
  private _cursor: [number, number] | null = null;

  constructor(engine: MapEngine, getFilterPanel: () => FilterPanel | null) {
    this._engine = engine;
    this._getFilterPanel = getFilterPanel;
  }

  get isActive(): boolean {
    return this._active;
  }

  start(mode: DrawModeType = 'polygon'): void {
    if (this._active) this.finish();

    this._active = true;
    this._mode = mode;
    this._points = [];
    this._cursor = null;
    document.body.classList.add('draw-mode');

    // Disable conflicting map interactions
    try {
      this._engine.map.doubleClickZoom.disable();
      this._engine.map.dragRotate.disable();
    } catch { /* ignore */ }

    this._createSvgOverlay();
    this._attachCanvasEvents();
  }

  finish(): void {
    if (!this._active) return;
    this._active = false;
    document.body.classList.remove('draw-mode');

    this._detachCanvasEvents();
    this._removeSvgOverlay();

    // Re-enable map interactions
    try {
      this._engine.map.doubleClickZoom.enable();
      this._engine.map.dragRotate.enable();
    } catch { /* ignore */ }

    const panel = this._getFilterPanel();

    if (this._mode === 'bbox' && this._points.length === 2) {
      if (panel) panel.setBboxPoints(this._points[0], this._points[1]);
    } else if (this._mode === 'polygon') {
      const pts = this._points;
      // Remove trailing duplicate from double-click
      if (pts.length >= 2) {
        const [ax, ay] = pts[pts.length - 2];
        const [bx, by] = pts[pts.length - 1];
        if (ax === bx && ay === by) pts.pop();
      }
      if (pts.length >= 3 && panel) panel.setPolygonPoints([...pts]);
    }
  }

  /** Kept for backwards compat – events are per-session now. */
  setupEvents(): void {}

  // ── SVG Overlay ─────────────────────────────────────────────────────────

  private _createSvgOverlay(): void {
    this._removeSvgOverlay();

    const container = this._engine.map.getContainer();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'draw-overlay');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
    container.appendChild(svg);
    this._svg = svg;
  }

  private _removeSvgOverlay(): void {
    if (this._svg && this._svg.parentNode) {
      this._svg.parentNode.removeChild(this._svg);
    }
    this._svg = null;
  }

  /**
   * Re-render the SVG overlay with current points + cursor.
   * Projects lng/lat → screen pixels via map.project().
   */
  private _renderOverlay(): void {
    if (!this._svg) return;
    const map = this._engine.map;
    this._svg.innerHTML = '';

    // Build the list of screen-projected points
    const screenPts = this._points.map(p => {
      const px = map.project(p as [number, number]);
      return [px.x, px.y] as [number, number];
    });

    const cursorScreen = this._cursor
      ? (() => { const px = map.project(this._cursor!); return [px.x, px.y] as [number, number]; })()
      : null;

    if (this._mode === 'bbox') {
      this._renderBbox(screenPts, cursorScreen);
    } else {
      this._renderPolygon(screenPts, cursorScreen);
    }
  }

  private _renderBbox(pts: [number, number][], cursor: [number, number] | null): void {
    if (!this._svg) return;

    // Draw rectangle between first point and cursor (or second point)
    const a = pts[0];
    const b = pts.length >= 2 ? pts[1] : cursor;
    if (a && b) {
      const x = Math.min(a[0], b[0]);
      const y = Math.min(a[1], b[1]);
      const w = Math.abs(b[0] - a[0]);
      const h = Math.abs(b[1] - a[1]);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.setAttribute('fill', 'rgba(34, 211, 238, 0.2)');
      rect.setAttribute('stroke', '#22d3ee');
      rect.setAttribute('stroke-width', '2.5');
      rect.setAttribute('stroke-dasharray', '8 4');
      this._svg.appendChild(rect);
    }

    // Draw vertex dots
    for (const pt of pts) {
      this._svg.appendChild(this._makeCircle(pt));
    }
    if (pts.length === 1 && cursor) {
      this._svg.appendChild(this._makeCircle(cursor, true));
    }
  }

  private _renderPolygon(pts: [number, number][], cursor: [number, number] | null): void {
    if (!this._svg) return;

    const allPts = cursor ? [...pts, cursor] : [...pts];

    // Draw polygon / line
    if (allPts.length >= 3) {
      const pointsStr = allPts.map(p => `${p[0]},${p[1]}`).join(' ');
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', pointsStr);
      polygon.setAttribute('fill', 'rgba(34, 211, 238, 0.2)');
      polygon.setAttribute('stroke', '#22d3ee');
      polygon.setAttribute('stroke-width', '2.5');
      polygon.setAttribute('stroke-dasharray', '8 4');
      this._svg.appendChild(polygon);
    } else if (allPts.length === 2) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(allPts[0][0]));
      line.setAttribute('y1', String(allPts[0][1]));
      line.setAttribute('x2', String(allPts[1][0]));
      line.setAttribute('y2', String(allPts[1][1]));
      line.setAttribute('stroke', '#22d3ee');
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('stroke-dasharray', '8 4');
      this._svg.appendChild(line);
    }

    // Draw vertex dots
    for (const pt of pts) {
      this._svg.appendChild(this._makeCircle(pt));
    }
    if (cursor) {
      this._svg.appendChild(this._makeCircle(cursor, true));
    }
  }

  private _makeCircle(pt: [number, number], isCursor = false): SVGCircleElement {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(pt[0]));
    c.setAttribute('cy', String(pt[1]));
    c.setAttribute('r', isCursor ? '5' : '7');
    c.setAttribute('fill', isCursor ? 'rgba(34, 211, 238, 0.5)' : '#22d3ee');
    c.setAttribute('stroke', '#ffffff');
    c.setAttribute('stroke-width', '2');
    return c;
  }

  // ── Canvas event handlers ───────────────────────────────────────────────

  private _attachCanvasEvents(): void {
    const canvas = this._engine.map.getCanvas();
    const container = this._engine.map.getContainer();
    let lastClickTime = 0;

    this._onPointerDown = (e: PointerEvent) => {
      if (!this._active) return;
      if (e.button !== 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lngLat = this._engine.map.unproject([x, y]);
      const coord: [number, number] = [lngLat.lng, lngLat.lat];

      // Double-click detection
      const now = performance.now();
      if (now - lastClickTime < 300 && this._mode === 'polygon') {
        lastClickTime = 0;
        e.stopPropagation();
        e.preventDefault();
        this.finish();
        return;
      }
      lastClickTime = now;

      e.stopPropagation();
      this._points.push(coord);

      if (this._mode === 'bbox' && this._points.length === 2) {
        this.finish();
      } else {
        this._renderOverlay();
      }
    };

    this._onPointerMove = (e: PointerEvent) => {
      if (!this._active) return;
      if (this._points.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lngLat = this._engine.map.unproject([x, y]);
      this._cursor = [lngLat.lng, lngLat.lat];
      this._renderOverlay();
    };

    this._onDblClick = (e: MouseEvent) => {
      if (!this._active) return;
      e.stopPropagation();
      e.preventDefault();
    };

    this._onKeyDown = (e: KeyboardEvent) => {
      if (!this._active) return;
      if (e.key === 'Escape') {
        this._points = [];
        this.finish();
      }
    };

    // Re-render overlay when map moves/zooms (projected coords change)
    this._onMapMove = () => {
      if (this._active) this._renderOverlay();
    };

    container.addEventListener('pointerdown', this._onPointerDown, { capture: true });
    container.addEventListener('pointermove', this._onPointerMove, { capture: true });
    container.addEventListener('dblclick', this._onDblClick, { capture: true });
    document.addEventListener('keydown', this._onKeyDown);
    this._engine.map.on('move', this._onMapMove);

    canvas.style.cursor = 'crosshair';
  }

  private _detachCanvasEvents(): void {
    const container = this._engine.map.getContainer();
    const canvas = this._engine.map.getCanvas();

    if (this._onPointerDown) container.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
    if (this._onPointerMove) container.removeEventListener('pointermove', this._onPointerMove, { capture: true });
    if (this._onDblClick)    container.removeEventListener('dblclick', this._onDblClick, { capture: true });
    if (this._onKeyDown)     document.removeEventListener('keydown', this._onKeyDown);
    if (this._onMapMove)     this._engine.map.off('move', this._onMapMove);

    this._onPointerDown = null;
    this._onPointerMove = null;
    this._onDblClick = null;
    this._onKeyDown = null;
    this._onMapMove = null;

    canvas.style.cursor = '';
  }
}
