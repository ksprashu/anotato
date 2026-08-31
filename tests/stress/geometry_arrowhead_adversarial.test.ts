import { describe, it, expect } from 'vitest';
import {
  calculateArrowhead,
  normalizeBox,
  calculateEllipseBounds,
  pointToSegmentDistance,
  hitTestAnnotation,
  applyHandleResize,
  HandleType,
} from '../../src/math/geometry';
import { getBadgePositionForShape, getBadgeDimensions } from '../../src/math/badges';
import { Point, BoxGeometry, EllipseGeometry, ArrowGeometry, PinGeometry } from '../../src/types';

describe('Adversarial Geometry & Arrowhead Math Stress Tests', () => {
  describe('calculateArrowhead() zero-length, micro-length & adversarial vectors', () => {
    it('handles zero-length arrows (start == end) without NaN, Infinity, or broken pathString', () => {
      const zeroArrows: [Point, Point][] = [
        [{ x: 0, y: 0 }, { x: 0, y: 0 }],
        [{ x: 500, y: 500 }, { x: 500, y: 500 }],
        [{ x: -123.456, y: -789.012 }, { x: -123.456, y: -789.012 }],
        [{ x: 10000, y: -20000 }, { x: 10000, y: -20000 }],
      ];

      for (const [start, end] of zeroArrows) {
        const arrow = calculateArrowhead(start, end, 3);

        expect(Number.isFinite(arrow.tip.x)).toBe(true);
        expect(Number.isFinite(arrow.tip.y)).toBe(true);
        expect(Number.isFinite(arrow.wingLeft.x)).toBe(true);
        expect(Number.isFinite(arrow.wingLeft.y)).toBe(true);
        expect(Number.isFinite(arrow.wingRight.x)).toBe(true);
        expect(Number.isFinite(arrow.wingRight.y)).toBe(true);
        expect(Number.isFinite(arrow.notch.x)).toBe(true);
        expect(Number.isFinite(arrow.notch.y)).toBe(true);
        expect(Number.isFinite(arrow.shaftEnd.x)).toBe(true);
        expect(Number.isFinite(arrow.shaftEnd.y)).toBe(true);
        expect(Number.isFinite(arrow.headingRad)).toBe(true);
        expect(Number.isFinite(arrow.headLength)).toBe(true);

        expect(arrow.pathString).not.toContain('NaN');
        expect(arrow.pathString).not.toContain('undefined');
        expect(arrow.pathString).toMatch(/^M\s+[-0-9.]+\s+[-0-9.]+\s+L\s+[-0-9.]+\s+[-0-9.]+\s+L\s+[-0-9.]+\s+[-0-9.]+\s+L\s+[-0-9.]+\s+[-0-9.]+\s+Z$/);
      }
    });

    it('prevents arrow inversion on micro-length arrows (length 0.001 to 10px)', () => {
      const lengths = [1e-6, 0.001, 0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0];

      for (const len of lengths) {
        const start: Point = { x: 100, y: 100 };
        const end: Point = { x: 100 + len, y: 100 };
        const arrow = calculateArrowhead(start, end, 3);

        expect(Number.isFinite(arrow.headLength)).toBe(true);
        expect(arrow.headLength).toBeLessThanOrEqual(len * 0.45 + 1e-9);
        expect(arrow.pathString).not.toContain('NaN');
      }
    });

    it('correctly computes heading angle for all 8 cardinal and intercardinal orientations', () => {
      const start: Point = { x: 200, y: 200 };
      const testCases: { end: Point; expectedHeading: number }[] = [
        { end: { x: 300, y: 200 }, expectedHeading: 0 }, // Right (0)
        { end: { x: 300, y: 300 }, expectedHeading: Math.PI / 4 }, // Down-Right (45 deg)
        { end: { x: 200, y: 300 }, expectedHeading: Math.PI / 2 }, // Down (90 deg)
        { end: { x: 100, y: 300 }, expectedHeading: (3 * Math.PI) / 4 }, // Down-Left (135 deg)
        { end: { x: 100, y: 200 }, expectedHeading: Math.PI }, // Left (180 deg)
        { end: { x: 100, y: 100 }, expectedHeading: (-3 * Math.PI) / 4 }, // Up-Left (-135 deg)
        { end: { x: 200, y: 100 }, expectedHeading: -Math.PI / 2 }, // Up (-90 deg)
        { end: { x: 300, y: 100 }, expectedHeading: -Math.PI / 4 }, // Up-Right (-45 deg)
      ];

      for (const { end, expectedHeading } of testCases) {
        const arrow = calculateArrowhead(start, end, 3);
        if (Math.abs(expectedHeading) === Math.PI) {
          expect(Math.abs(arrow.headingRad)).toBeCloseTo(Math.PI, 4);
        } else {
          expect(arrow.headingRad).toBeCloseTo(expectedHeading, 4);
        }
      }
    });

    it('handles 2,000 random arrows spanning extreme coordinate spaces without numerical instability', () => {
      for (let i = 0; i < 2000; i++) {
        const start: Point = {
          x: (Math.random() - 0.5) * 50000,
          y: (Math.random() - 0.5) * 50000,
        };
        const end: Point = {
          x: (Math.random() - 0.5) * 50000,
          y: (Math.random() - 0.5) * 50000,
        };
        const strokeWidth = Math.random() * 32;

        const arrow = calculateArrowhead(start, end, strokeWidth);

        expect(Number.isFinite(arrow.tip.x)).toBe(true);
        expect(Number.isFinite(arrow.tip.y)).toBe(true);
        expect(Number.isFinite(arrow.wingLeft.x)).toBe(true);
        expect(Number.isFinite(arrow.wingLeft.y)).toBe(true);
        expect(Number.isFinite(arrow.wingRight.x)).toBe(true);
        expect(Number.isFinite(arrow.wingRight.y)).toBe(true);
        expect(Number.isFinite(arrow.notch.x)).toBe(true);
        expect(Number.isFinite(arrow.notch.y)).toBe(true);
        expect(arrow.pathString).not.toContain('NaN');
      }
    });
  });

  describe('normalizeBox() and calculateEllipseBounds() invertibility and bounds', () => {
    it('normalizes box correctly regardless of drag direction (4 quadrants)', () => {
      // Drag Down-Right
      expect(normalizeBox({ x: 10, y: 10 }, { x: 50, y: 60 })).toEqual({
        type: 'box',
        x: 10,
        y: 10,
        width: 40,
        height: 50,
      });

      // Drag Up-Left
      expect(normalizeBox({ x: 50, y: 60 }, { x: 10, y: 10 })).toEqual({
        type: 'box',
        x: 10,
        y: 10,
        width: 40,
        height: 50,
      });

      // Drag Down-Left
      expect(normalizeBox({ x: 50, y: 10 }, { x: 10, y: 60 })).toEqual({
        type: 'box',
        x: 10,
        y: 10,
        width: 40,
        height: 50,
      });

      // Drag Up-Right
      expect(normalizeBox({ x: 10, y: 60 }, { x: 50, y: 10 })).toEqual({
        type: 'box',
        x: 10,
        y: 10,
        width: 40,
        height: 50,
      });
    });

    it('calculateEllipseBounds normalizes rx, ry to strictly non-negative values', () => {
      const e1 = calculateEllipseBounds({ x: 100, y: 100 }, { x: 200, y: 150 }, false);
      expect(e1.rx).toBe(50);
      expect(e1.ry).toBe(25);
      expect(e1.cx).toBe(150);
      expect(e1.cy).toBe(125);

      const e2 = calculateEllipseBounds({ x: 200, y: 150 }, { x: 100, y: 100 }, false);
      expect(e2.rx).toBe(50);
      expect(e2.ry).toBe(25);
      expect(e2.cx).toBe(150);
      expect(e2.cy).toBe(125);
    });

    it('calculateEllipseBounds with constrainToCircle=true produces equal rx and ry', () => {
      const c = calculateEllipseBounds({ x: 100, y: 100 }, { x: 200, y: 150 }, true);
      expect(c.rx).toBe(50); // diameter = max(100, 50) = 100 -> radius = 50
      expect(c.ry).toBe(50);
      expect(c.cx).toBe(150);
      expect(c.cy).toBe(150);
    });
  });

  describe('8-Point Handle Resize & Flipping Stress', () => {
    const initialBox: BoxGeometry = { type: 'box', x: 100, y: 100, width: 200, height: 100 };

    it('flips cleanly across all 8 handles when dragged past opposite edge', () => {
      const handles: HandleType[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

      for (const h of handles) {
        // Drag far beyond opposite boundary
        const flipped = applyHandleResize(initialBox, h, { x: -500, y: -500 }, false) as BoxGeometry;
        expect(flipped.type).toBe('box');
        expect(flipped.width).toBeGreaterThanOrEqual(2);
        expect(flipped.height).toBeGreaterThanOrEqual(2);
        expect(Number.isFinite(flipped.x)).toBe(true);
        expect(Number.isFinite(flipped.y)).toBe(true);
      }
    });

    it('maintains square 1:1 aspect ratio when constrainAspect=true on box resize', () => {
      const resized = applyHandleResize(initialBox, 'se', { x: 500, y: 250 }, true) as BoxGeometry;
      expect(resized.width).toBe(resized.height);
      expect(resized.width).toBe(400); // Math.max(400, 150) = 400
    });

    it('arrow start and end handle dragging updates respective endpoints', () => {
      const arrow: ArrowGeometry = { type: 'arrow', startX: 10, startY: 20, endX: 100, endY: 200 };

      const movedStart = applyHandleResize(arrow, 'start', { x: 55, y: 65 }) as ArrowGeometry;
      expect(movedStart.startX).toBe(55);
      expect(movedStart.startY).toBe(65);
      expect(movedStart.endX).toBe(100);
      expect(movedStart.endY).toBe(200);

      const movedEnd = applyHandleResize(arrow, 'end', { x: 999, y: 888 }) as ArrowGeometry;
      expect(movedEnd.startX).toBe(10);
      expect(movedEnd.startY).toBe(20);
      expect(movedEnd.endX).toBe(999);
      expect(movedEnd.endY).toBe(888);
    });

    it('pin handle dragging updates position', () => {
      const pin: PinGeometry = { type: 'pin', x: 50, y: 70 };
      const moved = applyHandleResize(pin, 'pin', { x: 120, y: 240 }) as PinGeometry;
      expect(moved.x).toBe(120);
      expect(moved.y).toBe(240);
    });
  });

  describe('pointToSegmentDistance and hitTestAnnotation precision', () => {
    it('pointToSegmentDistance handles zero-length segment accurately', () => {
      const d = pointToSegmentDistance({ x: 13, y: 14 }, { x: 10, y: 10 }, { x: 10, y: 10 });
      expect(d).toBe(5); // 3-4-5 triangle
    });

    it('pointToSegmentDistance clamps projection to segment endpoints', () => {
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 100, y: 0 };

      // Point directly above segment interior
      expect(pointToSegmentDistance({ x: 50, y: 20 }, start, end)).toBe(20);
      // Point before start
      expect(pointToSegmentDistance({ x: -30, y: 40 }, start, end)).toBe(50); // hypot(-30, 40)
      // Point after end
      expect(pointToSegmentDistance({ x: 130, y: 40 }, start, end)).toBe(50); // hypot(30, 40)
    });

    it('hitTestAnnotation returns true for inside/near points and false for distant points', () => {
      const box: BoxGeometry = { type: 'box', x: 100, y: 100, width: 200, height: 100 };
      expect(hitTestAnnotation({ x: 150, y: 150 }, box, 6)).toBe(true);
      expect(hitTestAnnotation({ x: 95, y: 100 }, box, 6)).toBe(true); // Within tolerance
      expect(hitTestAnnotation({ x: 90, y: 100 }, box, 6)).toBe(false); // Outside tolerance

      const ellipse: EllipseGeometry = { type: 'ellipse', cx: 200, cy: 200, rx: 50, ry: 30 };
      expect(hitTestAnnotation({ x: 200, y: 200 }, ellipse, 6)).toBe(true);
      expect(hitTestAnnotation({ x: 255, y: 200 }, ellipse, 6)).toBe(true);
      expect(hitTestAnnotation({ x: 270, y: 200 }, ellipse, 6)).toBe(false);

      const pin: PinGeometry = { type: 'pin', x: 300, y: 400 };
      expect(hitTestAnnotation({ x: 300, y: 380 }, pin, 6)).toBe(true); // Head circle
      expect(hitTestAnnotation({ x: 300, y: 400 }, pin, 6)).toBe(true); // Anchor tip
      expect(hitTestAnnotation({ x: 300, y: 350 }, pin, 6)).toBe(false);
    });
  });

  describe('Badge anchor placement and responsive pill dimensions', () => {
    it('always anchors arrow badge at tail (startX, startY), leaving arrowhead tip clean', () => {
      const arrows: ArrowGeometry[] = [
        { type: 'arrow', startX: 10, startY: 20, endX: 100, endY: 200 },
        { type: 'arrow', startX: 500, startY: 800, endX: 20, endY: 30 },
      ];

      for (const a of arrows) {
        const badge = getBadgePositionForShape(a);
        expect(badge.x).toBe(a.startX);
        expect(badge.y).toBe(a.startY);
      }
    });

    it('anchors box badge at top-left (x, y)', () => {
      const box: BoxGeometry = { type: 'box', x: 250, y: 350, width: 100, height: 80 };
      expect(getBadgePositionForShape(box)).toEqual({ x: 250, y: 350 });
    });

    it('anchors ellipse badge at top-left diagonal apex (cx - rx*sqrt(2)/2, cy - ry*sqrt(2)/2)', () => {
      const ellipse: EllipseGeometry = { type: 'ellipse', cx: 200, cy: 300, rx: 100, ry: 50 };
      const badge = getBadgePositionForShape(ellipse);
      expect(badge.x).toBeCloseTo(200 - 100 * Math.SQRT1_2, 3);
      expect(badge.y).toBeCloseTo(300 - 50 * Math.SQRT1_2, 3);
    });

    it('computes responsive pill width and font size across multi-digit index thresholds', () => {
      // 1-digit: circle (24x24)
      for (let i = 1; i <= 9; i++) {
        const d = getBadgeDimensions(i);
        expect(d.isPill).toBe(false);
        expect(d.width).toBe(24);
        expect(d.height).toBe(24);
        expect(d.fontSize).toBe(13);
      }

      // 2-digit: pill (32x24)
      const d10 = getBadgeDimensions(10);
      expect(d10.isPill).toBe(true);
      expect(d10.width).toBe(32);
      expect(d10.height).toBe(24);
      expect(d10.fontSize).toBe(12);

      // 3-digit: pill (40x24)
      const d100 = getBadgeDimensions(100);
      expect(d100.isPill).toBe(true);
      expect(d100.width).toBe(40);

      // 4-digit: pill (48x24)
      const d1000 = getBadgeDimensions(1000);
      expect(d1000.isPill).toBe(true);
      expect(d1000.width).toBe(48);

      // Negative or zero fallback
      expect(getBadgeDimensions(0).isPill).toBe(false);
      expect(getBadgeDimensions(-5).isPill).toBe(false);
    });
  });
});
