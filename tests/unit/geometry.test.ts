import { describe, it, expect } from 'vitest';
import {
  normalizeBox,
  calculateEllipseBounds,
  calculateArrowhead,
  getResizeHandlePositions,
  hitTestAnnotation,
  hitTestHandle,
  applyHandleResize,
} from '../../src/math/geometry';
import { getBadgePositionForShape, getBadgeDimensions } from '../../src/math/badges';
import { Annotation } from '../../src/types';

describe('geometry math engine', () => {
  describe('normalizeBox', () => {
    it('normalizes standard top-left to bottom-right drag', () => {
      const box = normalizeBox({ x: 10, y: 20 }, { x: 110, y: 120 });
      expect(box).toEqual({ type: 'box', x: 10, y: 20, width: 100, height: 100 });
    });

    it('normalizes bottom-right to top-left inverted drag', () => {
      const box = normalizeBox({ x: 110, y: 120 }, { x: 10, y: 20 });
      expect(box).toEqual({ type: 'box', x: 10, y: 20, width: 100, height: 100 });
    });

    it('normalizes top-right to bottom-left drag', () => {
      const box = normalizeBox({ x: 110, y: 20 }, { x: 10, y: 120 });
      expect(box).toEqual({ type: 'box', x: 10, y: 20, width: 100, height: 100 });
    });
  });

  describe('calculateEllipseBounds', () => {
    it('calculates unconstrained ellipse center and radii', () => {
      const ellipse = calculateEllipseBounds({ x: 100, y: 100 }, { x: 300, y: 200 }, false);
      expect(ellipse.cx).toBe(200);
      expect(ellipse.cy).toBe(150);
      expect(ellipse.rx).toBe(100);
      expect(ellipse.ry).toBe(50);
    });

    it('calculates constrained circle when shift is active', () => {
      const circle = calculateEllipseBounds({ x: 100, y: 100 }, { x: 300, y: 200 }, true);
      expect(circle.rx).toBe(100);
      expect(circle.ry).toBe(100);
      expect(circle.cx).toBe(200);
      expect(circle.cy).toBe(200);
    });
  });

  describe('calculateArrowhead (30-degree aerodynamic wings)', () => {
    it('calculates horizontal arrow pointing right (0 rad)', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 300, y: 100 };
      const head = calculateArrowhead(start, end, 3);

      expect(head.headingRad).toBeCloseTo(0, 5);
      expect(head.tip).toEqual(end);

      // Wing Left should be above the axis (y < 100) and Wing Right below (y > 100)
      expect(head.wingLeft.y).toBeLessThan(100);
      expect(head.wingRight.y).toBeGreaterThan(100);
      expect(head.wingLeft.x).toBeLessThan(300);
      expect(head.wingRight.x).toBeLessThan(300);

      // Notch should be recessed along shaft axis (y = 100, x < 300)
      expect(head.notch.y).toBeCloseTo(100, 5);
      expect(head.notch.x).toBeLessThan(300);
      expect(head.notch.x).toBeGreaterThan(head.wingLeft.x);

      // Wing angle verification: 30 degrees (pi / 6)
      const dyLeft = head.tip.y - head.wingLeft.y;
      const dxLeft = head.tip.x - head.wingLeft.x;
      const angleLeft = Math.atan2(dyLeft, dxLeft);
      expect(angleLeft).toBeCloseTo(Math.PI / 6, 5);
    });

    it('calculates vertical arrow pointing down (pi / 2 rad)', () => {
      const start = { x: 200, y: 100 };
      const end = { x: 200, y: 300 };
      const head = calculateArrowhead(start, end, 3);

      expect(head.headingRad).toBeCloseTo(Math.PI / 2, 5);
      expect(head.notch.x).toBeCloseTo(200, 5);
      expect(head.notch.y).toBeLessThan(300);
    });

    it('clamps head length on very short arrows to prevent inversion', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 110, y: 100 }; // 10px long arrow
      const head = calculateArrowhead(start, end, 3);

      expect(head.headLength).toBeLessThanOrEqual(5); // 10 * 0.45 = 4.5
      expect(head.notch.x).toBeGreaterThan(start.x);
    });
  });

  describe('getResizeHandlePositions', () => {
    it('returns 8 handles for box with standard cursors', () => {
      const handles = getResizeHandlePositions({
        type: 'box',
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });
      expect(handles).toHaveLength(8);
      expect(handles.map((h) => h.id)).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
      expect(handles.find((h) => h.id === 'nw')?.cursor).toBe('nwse-resize');
      expect(handles.find((h) => h.id === 'e')?.x).toBe(300);
      expect(handles.find((h) => h.id === 'e')?.y).toBe(150);
    });

    it('returns 2 handles for arrow (start and end)', () => {
      const handles = getResizeHandlePositions({
        type: 'arrow',
        startX: 50,
        startY: 50,
        endX: 250,
        endY: 150,
      });
      expect(handles).toHaveLength(2);
      expect(handles[0]).toEqual({ id: 'start', x: 50, y: 50, cursor: 'move' });
      expect(handles[1]).toEqual({ id: 'end', x: 250, y: 150, cursor: 'crosshair' });
    });
  });

  describe('hitTestAnnotation', () => {
    const boxAnno: Annotation = {
      id: 'b1',
      index: 1,
      geometry: { type: 'box', x: 100, y: 100, width: 200, height: 150 },
      style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
      note: '',
      createdAt: 0,
      updatedAt: 0,
    };

    it('detects point inside box', () => {
      expect(hitTestAnnotation({ x: 150, y: 150 }, boxAnno)).toBe(true);
    });

    it('rejects point outside box', () => {
      expect(hitTestAnnotation({ x: 50, y: 50 }, boxAnno)).toBe(false);
    });

    it('detects point within tolerance on box border', () => {
      expect(hitTestAnnotation({ x: 96, y: 150 }, boxAnno, 6)).toBe(true);
    });

    const arrowAnno: Annotation = {
      id: 'a1',
      index: 2,
      geometry: { type: 'arrow', startX: 100, startY: 100, endX: 300, endY: 100 },
      style: { color: 'cyan', strokeWidth: 3, fillOpacity: 1 },
      note: '',
      createdAt: 0,
      updatedAt: 0,
    };

    it('detects point on arrow shaft', () => {
      expect(hitTestAnnotation({ x: 200, y: 102 }, arrowAnno, 6)).toBe(true);
    });

    it('rejects point far from arrow shaft', () => {
      expect(hitTestAnnotation({ x: 200, y: 150 }, arrowAnno, 6)).toBe(false);
    });
  });

  describe('getBadgePositionForShape (Badges Math)', () => {
    it('places badge at box top-left corner', () => {
      const pos = getBadgePositionForShape({ type: 'box', x: 150, y: 220, width: 100, height: 80 });
      expect(pos).toEqual({ x: 150, y: 220 });
    });

    it('places badge strictly at arrow tail (startX, startY), NOT at head', () => {
      const pos = getBadgePositionForShape({
        type: 'arrow',
        startX: 45,
        startY: 90,
        endX: 400,
        endY: 300,
      });
      expect(pos).toEqual({ x: 45, y: 90 });
    });

    it('places badge at ellipse top-left apex curve', () => {
      const pos = getBadgePositionForShape({
        type: 'ellipse',
        cx: 200,
        cy: 200,
        rx: 100,
        ry: 100,
      });
      expect(pos.x).toBeCloseTo(200 - 100 * Math.SQRT1_2, 3);
      expect(pos.y).toBeCloseTo(200 - 100 * Math.SQRT1_2, 3);
    });

    it('places badge at pin head center', () => {
      const pos = getBadgePositionForShape({ type: 'pin', x: 300, y: 400 });
      expect(pos).toEqual({ x: 300, y: 380 });
    });
  });

  describe('getBadgeDimensions', () => {
    it('returns 24x24 circle for single digits (1..9)', () => {
      const dim = getBadgeDimensions(1);
      expect(dim.width).toBe(24);
      expect(dim.height).toBe(24);
      expect(dim.isPill).toBe(false);
    });

    it('returns 32x24 pill for double digits (10..99)', () => {
      const dim = getBadgeDimensions(15);
      expect(dim.width).toBe(32);
      expect(dim.height).toBe(24);
      expect(dim.isPill).toBe(true);
    });

    it('returns expanded pill for triple digits (100+)', () => {
      const dim = getBadgeDimensions(123);
      expect(dim.width).toBe(40);
      expect(dim.isPill).toBe(true);
    });
  });

  describe('hitTestHandle', () => {
    const handles = getResizeHandlePositions({
      type: 'box',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

    it('identifies handle when clicking within radius', () => {
      expect(hitTestHandle({ x: 102, y: 101 }, handles, 8)).toBe('nw');
      expect(hitTestHandle({ x: 300, y: 150 }, handles, 8)).toBe('e');
    });

    it('returns null when clicking away from handles', () => {
      expect(hitTestHandle({ x: 150, y: 150 }, handles, 8)).toBeNull();
    });
  });

  describe('applyHandleResize', () => {
    it('resizes box via bottom-right handle (se)', () => {
      const box = { type: 'box' as const, x: 100, y: 100, width: 100, height: 100 };
      const resized = applyHandleResize(box, 'se', { x: 250, y: 250 });
      expect(resized).toEqual({ type: 'box', x: 100, y: 100, width: 150, height: 150 });
    });

    it('resizes arrow via end handle', () => {
      const arrow = { type: 'arrow' as const, startX: 50, startY: 50, endX: 200, endY: 200 };
      const resized = applyHandleResize(arrow, 'end', { x: 300, y: 350 });
      expect(resized).toEqual({ type: 'arrow', startX: 50, startY: 50, endX: 300, endY: 350 });
    });

    it('moves pin via pin handle', () => {
      const pin = { type: 'pin' as const, x: 100, y: 100 };
      const resized = applyHandleResize(pin, 'pin', { x: 200, y: 300 });
      expect(resized).toEqual({ type: 'pin', x: 200, y: 300 });
    });
  });
});
