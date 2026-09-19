import { describe, it, expect } from 'vitest';
import {
  computeResolutionScale,
  getBadgeDimensions,
  getPinDimensions,
  getBadgePositionForShape,
} from '../../src/math/badges';
import { AnnotationGeometry } from '../../src/types';

describe('Resolution Scale & Badges Math Engine (src/math/badges.ts)', () => {
  describe('computeResolutionScale', () => {
    it('returns 1.0 for images with max dimension <= 1440px (backward compatibility)', () => {
      expect(computeResolutionScale(1280, 720)).toBe(1.0);
      expect(computeResolutionScale(800, 600)).toBe(1.0);
      expect(computeResolutionScale(1440, 900)).toBe(1.0);
      expect(computeResolutionScale(1440, 1440)).toBe(1.0);
    });

    it('computes proportional scale for 1080p, 2K, 4K, 8K resolutions', () => {
      // 1080p: max(1920, 1080) / 1440 = 1.333
      expect(computeResolutionScale(1920, 1080)).toBeCloseTo(1.333, 2);
      // 2K QHD: max(2560, 1440) / 1440 = 1.778
      expect(computeResolutionScale(2560, 1440)).toBeCloseTo(1.778, 2);
      // 4K UHD: max(3840, 2160) / 1440 = 2.667
      expect(computeResolutionScale(3840, 2160)).toBeCloseTo(2.667, 2);
      // 8K UHD: max(7680, 4320) / 1440 = 5.333 -> clamped to 4.0
      expect(computeResolutionScale(7680, 4320)).toBe(4.0);
    });

    it('clamps scale to maximum 4.0 for 8K, 16K, and extreme resolutions', () => {
      expect(computeResolutionScale(7680, 4320)).toBe(4.0);
      expect(computeResolutionScale(16384, 16384)).toBe(4.0);
      expect(computeResolutionScale(10000, 100)).toBe(4.0);
    });

    it('handles extreme aspect ratios (ultrawide banner, tall skyscraper) based on max dimension', () => {
      // 10000x50 panoramic banner: max is 10000 -> 4.0
      expect(computeResolutionScale(10000, 50)).toBe(4.0);
      // 50x10000 tall vertical column: max is 10000 -> 4.0
      expect(computeResolutionScale(50, 10000)).toBe(4.0);
      // 1440x50: max is 1440 -> 1.0
      expect(computeResolutionScale(1440, 50)).toBe(1.0);
    });

    it('safely handles non-finite, negative, zero, and missing dimensions by defaulting to 1.0', () => {
      expect(computeResolutionScale(undefined, undefined)).toBe(1.0);
      expect(computeResolutionScale(0, 0)).toBe(1.0);
      expect(computeResolutionScale(-1920, 1080)).toBe(1.0);
      expect(computeResolutionScale(1920, -1080)).toBe(1.0);
      expect(computeResolutionScale(NaN, 1080)).toBe(1.0);
      expect(computeResolutionScale(1920, Infinity)).toBe(1.0);
      expect(computeResolutionScale(-100, -200)).toBe(1.0);
    });
  });

  describe('getBadgeDimensions', () => {
    it('defaults to scale = 1.0 when omitted (100% backward compatibility)', () => {
      const dim = getBadgeDimensions(1);
      expect(dim).toEqual({
        width: 24,
        height: 24,
        radius: 12,
        isPill: false,
        fontSize: 13,
      });
    });

    it('returns 24x24 circle for single digits at scale 1.0', () => {
      for (let i = 1; i <= 9; i++) {
        const dim = getBadgeDimensions(i, 1.0);
        expect(dim.width).toBe(24);
        expect(dim.height).toBe(24);
        expect(dim.radius).toBe(12);
        expect(dim.isPill).toBe(false);
        expect(dim.fontSize).toBe(13);
      }
    });

    it('returns 32x24 pill for double digits at scale 1.0', () => {
      for (let i = 10; i <= 99; i += 10) {
        const dim = getBadgeDimensions(i, 1.0);
        expect(dim.width).toBe(32);
        expect(dim.height).toBe(24);
        expect(dim.radius).toBe(12);
        expect(dim.isPill).toBe(true);
        expect(dim.fontSize).toBe(12);
      }
    });

    it('returns expanded pill for triple digits at scale 1.0', () => {
      const dim100 = getBadgeDimensions(100, 1.0);
      expect(dim100.width).toBe(40);
      expect(dim100.height).toBe(24);
      expect(dim100.radius).toBe(12);
      expect(dim100.isPill).toBe(true);
      expect(dim100.fontSize).toBe(12);

      const dim1000 = getBadgeDimensions(1000, 1.0);
      expect(dim1000.width).toBe(48);
      expect(dim1000.height).toBe(24);
      expect(dim1000.radius).toBe(12);
      expect(dim1000.isPill).toBe(true);
      expect(dim1000.fontSize).toBe(12);
    });

    it('scales dimensions proportionally at 2K (1.778x), 4K (2.667x), and 8K (4.0x)', () => {
      const scale4k = computeResolutionScale(3840, 2160);
      const dim4k = getBadgeDimensions(1, scale4k);
      expect(dim4k.width).toBe(Math.round(24 * scale4k));
      expect(dim4k.height).toBe(Math.round(24 * scale4k));
      expect(dim4k.radius).toBe(Math.round(12 * scale4k));
      expect(dim4k.fontSize).toBe(Math.round(13 * scale4k));

      const dim8k = getBadgeDimensions(1, 4.0);
      expect(dim8k.width).toBe(96);
      expect(dim8k.height).toBe(96);
      expect(dim8k.radius).toBe(48);
      expect(dim8k.fontSize).toBe(52);
    });

    it('ensures all returned dimensions (width, height, radius, fontSize) are rounded integers', () => {
      const arbitraryScales = [1.333, 1.778, 2.333, 3.1415, 3.888];
      for (const s of arbitraryScales) {
        const dim = getBadgeDimensions(7, s);
        expect(Number.isInteger(dim.width)).toBe(true);
        expect(Number.isInteger(dim.height)).toBe(true);
        expect(Number.isInteger(dim.radius)).toBe(true);
        expect(Number.isInteger(dim.fontSize)).toBe(true);
      }
    });

    it('clamps negative or zero scale to minimum safe 1.0', () => {
      expect(getBadgeDimensions(1, 0)).toEqual(getBadgeDimensions(1, 1.0));
      expect(getBadgeDimensions(1, -2.5)).toEqual(getBadgeDimensions(1, 1.0));
      expect(getBadgeDimensions(1, NaN)).toEqual(getBadgeDimensions(1, 1.0));
    });
  });

  describe('getPinDimensions', () => {
    it('returns base pin dimensions (headRadius 14, pointerHeight 20, fontSize 12) at scale 1.0', () => {
      const pin = getPinDimensions(1.0);
      expect(pin).toEqual({
        headRadius: 14,
        pointerHeight: 20,
        width: 28,
        height: 34,
        fontSize: 12,
        anchorOffset: 20,
      });
    });

    it('scales pin head radius and pointer height proportionally at scale 2.0 and 4K', () => {
      const pin2x = getPinDimensions(2.0);
      expect(pin2x.headRadius).toBe(28);
      expect(pin2x.pointerHeight).toBe(40);
      expect(pin2x.width).toBe(56);
      expect(pin2x.height).toBe(68);
      expect(pin2x.fontSize).toBe(24);
      expect(pin2x.anchorOffset).toBe(40);

      const scale4k = computeResolutionScale(3840, 2160);
      const pin4k = getPinDimensions(scale4k);
      expect(pin4k.headRadius).toBe(Math.round(14 * scale4k));
      expect(pin4k.pointerHeight).toBe(Math.round(20 * scale4k));
      expect(pin4k.fontSize).toBe(Math.round(12 * scale4k));
    });

    it('computes exact anchorOffset equal to pointerHeight', () => {
      for (const s of [1.0, 1.5, 2.0, 3.0, 4.0]) {
        const pin = getPinDimensions(s);
        expect(pin.anchorOffset).toBe(pin.pointerHeight);
      }
    });

    it('clamps negative or zero scale to minimum safe 1.0', () => {
      expect(getPinDimensions(0)).toEqual(getPinDimensions(1.0));
      expect(getPinDimensions(-3)).toEqual(getPinDimensions(1.0));
      expect(getPinDimensions(NaN)).toEqual(getPinDimensions(1.0));
    });
  });

  describe('getBadgePositionForShape with Resolution Scale', () => {
    it('anchors box, highlight, blur at top-left (x, y) invariant to scale', () => {
      const box: AnnotationGeometry = { type: 'box', x: 50, y: 75, width: 100, height: 100 };
      expect(getBadgePositionForShape(box, 1.0)).toEqual({ x: 50, y: 75 });
      expect(getBadgePositionForShape(box, 2.5)).toEqual({ x: 50, y: 75 });

      const hl: AnnotationGeometry = { type: 'highlight', x: 200, y: 150, width: 300, height: 200 };
      expect(getBadgePositionForShape(hl, 1.0)).toEqual({ x: 200, y: 150 });
      expect(getBadgePositionForShape(hl, 3.0)).toEqual({ x: 200, y: 150 });

      const blur: AnnotationGeometry = { type: 'blur', x: 80, y: 90, width: 120, height: 40 };
      expect(getBadgePositionForShape(blur, 1.0)).toEqual({ x: 80, y: 90 });
      expect(getBadgePositionForShape(blur, 4.0)).toEqual({ x: 80, y: 90 });
    });

    it('anchors arrow at tail (startX, startY) invariant to scale', () => {
      const arrow: AnnotationGeometry = { type: 'arrow', startX: 100, startY: 200, endX: 400, endY: 500 };
      expect(getBadgePositionForShape(arrow, 1.0)).toEqual({ x: 100, y: 200 });
      expect(getBadgePositionForShape(arrow, 2.0)).toEqual({ x: 100, y: 200 });
      expect(getBadgePositionForShape(arrow, 4.0)).toEqual({ x: 100, y: 200 });
    });

    it('anchors ellipse at 225° apex invariant to scale', () => {
      const ellipse: AnnotationGeometry = { type: 'ellipse', cx: 300, cy: 300, rx: 100, ry: 50 };
      const pos1x = getBadgePositionForShape(ellipse, 1.0);
      const pos2x = getBadgePositionForShape(ellipse, 2.0);
      expect(pos1x).toEqual(pos2x);
      expect(pos1x.x).toBeCloseTo(300 - 100 * Math.SQRT1_2, 3);
      expect(pos1x.y).toBeCloseTo(300 - 50 * Math.SQRT1_2, 3);
    });

    it('anchors pin at pin head center (x, y - pointerHeight) scaling with resolution', () => {
      const pin: AnnotationGeometry = { type: 'pin', x: 500, y: 600 };
      expect(getBadgePositionForShape(pin, 1.0)).toEqual({ x: 500, y: 580 });
      expect(getBadgePositionForShape(pin, 2.0)).toEqual({ x: 500, y: 560 });
      expect(getBadgePositionForShape(pin, 3.0)).toEqual({ x: 500, y: 540 });
    });
  });
});
