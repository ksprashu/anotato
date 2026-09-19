import { describe, it, expect } from 'vitest';
import {
  normalizeBox,
  calculateEllipseBounds,
  calculateArrowhead,
  getResizeHandlePositions,
  hitTestAnnotation,
  hitTestHandle,
  applyHandleResize,
  getPinBoundingBox,
  getGeometryBoundingBox,
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

    it('defaults to strokeWidth = 6 and computes headLength and headWidth as 28px', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 200, y: 0 };
      const head = calculateArrowhead(start, end);

      expect(head.headLength).toBe(28);
      expect(head.headWidth).toBe(28);
      expect(head.casingStrokeWidth).toBe(9.5);
    });

    it('returns backward-compatible left and right aliases for wingLeft and wingRight', () => {
      const start = { x: 50, y: 50 };
      const end = { x: 150, y: 150 };
      const head = calculateArrowhead(start, end, 6);

      expect(head.left).toEqual(head.wingLeft);
      expect(head.right).toEqual(head.wingRight);
      expect(head.headWidth).toBe(head.headLength);
    });

    it('recesses shaftEnd by strokeWidth * 0.5 from notch so round linecap touches notch apex exactly', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 100, y: 0 };
      const strokeWidth = 6;
      const head = calculateArrowhead(start, end, strokeWidth);

      // headLength = 28
      // notch.x = 100 - 28 * 0.75 = 79
      expect(head.notch.x).toBeCloseTo(79, 5);
      expect(head.notch.y).toBeCloseTo(0, 5);

      // shaftEnd.x = 79 - (6 * 0.5) = 76
      expect(head.shaftEnd.x).toBeCloseTo(76, 5);
      expect(head.shaftEnd.y).toBeCloseTo(0, 5);

      // Semicircular round cap extension: shaftEnd + strokeWidth * 0.5 = 76 + 3 = 79 === notch.x
      const capApex = head.shaftEnd.x + strokeWidth * 0.5;
      expect(capApex).toBeCloseTo(head.notch.x, 5);
    });

    it('clamps shaftEnd to start on micro vectors (length <= 4.5px for strokeWidth 6) to prevent inverted linecaps', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 103, y: 100 }; // 3px vector, below 4.53px inversion threshold
      const head = calculateArrowhead(start, end, 6);

      expect(head.shaftEnd.x).toBe(start.x);
      expect(head.shaftEnd.y).toBe(start.y);
    });

    it('handles zero-length arrows without NaN and clamps shaftEnd to start', () => {
      const point = { x: 123.4, y: 567.8 };
      const head = calculateArrowhead(point, point, 6);

      expect(Number.isFinite(head.tip.x)).toBe(true);
      expect(Number.isFinite(head.tip.y)).toBe(true);
      expect(Number.isFinite(head.notch.x)).toBe(true);
      expect(Number.isFinite(head.shaftEnd.x)).toBe(true);
      expect(head.shaftEnd).toEqual(point);
      expect(head.pathString).not.toContain('NaN');
    });

    it('clamps base headLength within [14, 36] for extreme stroke widths', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 500, y: 0 };
      // Thin stroke (1px): 16 + 2 = 18 clamped within [14, 36] => 18
      const headThin = calculateArrowhead(start, end, 1);
      expect(headThin.headLength).toBe(18);

      // Thick stroke (20px): 16 + 40 = 56 clamped to 36
      const headThick = calculateArrowhead(start, end, 20);
      expect(headThick.headLength).toBe(36);
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

  describe('getPinBoundingBox and getGeometryBoundingBox with Resolution Scaling', () => {
    it('computes pin bounding box at scale 1.0 (headRadius 14, pointerHeight 20)', () => {
      const pin = { type: 'pin' as const, x: 500, y: 600 };
      const bbox = getPinBoundingBox(pin, 1.0);
      expect(bbox).toEqual({
        x: 500 - 14,
        y: 600 - (14 + 20),
        width: 28,
        height: 34,
      });
    });

    it('computes scaled pin bounding box at scale 2.0 (headRadius 28, pointerHeight 40)', () => {
      const pin = { type: 'pin' as const, x: 500, y: 600 };
      const bbox = getPinBoundingBox(pin, 2.0);
      expect(bbox).toEqual({
        x: 500 - 28,
        y: 600 - (28 + 40),
        width: 56,
        height: 68,
      });
    });

    it('getGeometryBoundingBox delegates pin calculation with scale', () => {
      const pin = { type: 'pin' as const, x: 200, y: 300 };
      const bbox1x = getGeometryBoundingBox(pin, 1.0);
      expect(bbox1x.width).toBe(28);
      expect(bbox1x.height).toBe(34);

      const bbox2x = getGeometryBoundingBox(pin, 2.0);
      expect(bbox2x.width).toBe(56);
      expect(bbox2x.height).toBe(68);
    });

    it('hitTestAnnotation detects pin head center, stem, and tip with scale support', () => {
      const pinAnnotation: Annotation = {
        id: 'pin-hit',
        index: 1,
        geometry: { type: 'pin', x: 500, y: 600 },
        style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Pin hit test',
        createdAt: 0,
        updatedAt: 0,
      };

      // Scale 1.0: head center is at (500, 580) with radius 14
      expect(hitTestAnnotation({ x: 500, y: 580 }, pinAnnotation, 6, 1.0)).toBe(true);
      // Anchor tip is at (500, 600)
      expect(hitTestAnnotation({ x: 500, y: 600 }, pinAnnotation, 6, 1.0)).toBe(true);
      // Stem mid-point at (500, 590)
      expect(hitTestAnnotation({ x: 500, y: 590 }, pinAnnotation, 6, 1.0)).toBe(true);
      // Far outside
      expect(hitTestAnnotation({ x: 500, y: 500 }, pinAnnotation, 6, 1.0)).toBe(false);

      // Scale 2.0: head center is at (500, 560) with radius 28
      expect(hitTestAnnotation({ x: 500, y: 560 }, pinAnnotation, 6, 2.0)).toBe(true);
      expect(hitTestAnnotation({ x: 520, y: 560 }, pinAnnotation, 6, 2.0)).toBe(true);
    });
  });
});
