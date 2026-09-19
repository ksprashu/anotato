import { describe, it, expect } from 'vitest';
import {
  computeResolutionScale,
  getBadgeDimensions,
  getPinDimensions,
  getBadgePositionForShape,
} from '../../src/math/badges';
import {
  getPinBoundingBox,
  getGeometryBoundingBox,
  hitTestAnnotation,
  pointToSegmentDistance,
} from '../../src/math/geometry';
import { Point, PinGeometry, AnnotationGeometry, Annotation } from '../../src/types';

describe('M4 Resolution Scale Math & Boundary Stress Challenger Suite', () => {
  // =========================================================================
  // SECTION 1: Resolution Scale Factor Computation (computeResolutionScale)
  // =========================================================================
  describe('1. Resolution Scale Factor Computation (computeResolutionScale)', () => {
    describe('1.1 Extreme Standard & High-DPI Resolutions', () => {
      it('returns baseline 1.0 for small and sub-baseline resolutions (1x1, 10x10, 50x50, 720p)', () => {
        expect(computeResolutionScale(1, 1)).toBe(1.0);
        expect(computeResolutionScale(10, 10)).toBe(1.0);
        expect(computeResolutionScale(50, 50)).toBe(1.0);
        expect(computeResolutionScale(640, 480)).toBe(1.0);
        expect(computeResolutionScale(800, 600)).toBe(1.0);
        expect(computeResolutionScale(1024, 768)).toBe(1.0);
        expect(computeResolutionScale(1280, 720)).toBe(1.0); // 720p
        expect(computeResolutionScale(1280, 800)).toBe(1.0);
        expect(computeResolutionScale(1366, 768)).toBe(1.0);
      });

      it('preserves exact 1.0 boundary at 1440px major axis reference', () => {
        expect(computeResolutionScale(1440, 900)).toBe(1.0);
        expect(computeResolutionScale(900, 1440)).toBe(1.0); // portrait
        expect(computeResolutionScale(1440, 1440)).toBe(1.0); // 1:1 square
        expect(computeResolutionScale(1440, 1)).toBe(1.0);
        expect(computeResolutionScale(1, 1440)).toBe(1.0);
        expect(computeResolutionScale(1439.99, 1439.99)).toBe(1.0);
      });

      it('computes proportional scale above 1440px (1080p, 2K, 3K, 4K, 5K)', () => {
        // 1080p: max(1920, 1080) / 1440 = 1.33333...
        expect(computeResolutionScale(1920, 1080)).toBeCloseTo(1920 / 1440, 5);
        expect(computeResolutionScale(1080, 1920)).toBeCloseTo(1920 / 1440, 5); // portrait 1080p

        // 2K QHD: max(2560, 1440) / 1440 = 1.77777...
        expect(computeResolutionScale(2560, 1440)).toBeCloseTo(2560 / 1440, 5);
        expect(computeResolutionScale(1440, 2560)).toBeCloseTo(2560 / 1440, 5); // portrait 2K

        // 3K Retina (MacBook Pro 15"): 2880x1800 -> 2.0
        expect(computeResolutionScale(2880, 1800)).toBe(2.0);

        // 4K UHD: max(3840, 2160) / 1440 = 2.66666...
        expect(computeResolutionScale(3840, 2160)).toBeCloseTo(3840 / 1440, 5);
        expect(computeResolutionScale(2160, 3840)).toBeCloseTo(3840 / 1440, 5);

        // 4K DCI: max(4096, 2160) / 1440 = 2.84444...
        expect(computeResolutionScale(4096, 2160)).toBeCloseTo(4096 / 1440, 5);

        // 5K: max(5120, 2880) / 1440 = 3.55555...
        expect(computeResolutionScale(5120, 2880)).toBeCloseTo(5120 / 1440, 5);
      });

      it('clamps to upper bound 4.0 for 6K, 8K, and extreme gigapixel resolutions (30000x20000)', () => {
        // 6K: 6016x3384 -> 6016 / 1440 = 4.177... clamped to 4.0
        expect(computeResolutionScale(6016, 3384)).toBe(4.0);

        // 8K UHD: 7680x4320 -> 7680 / 1440 = 5.333... clamped to 4.0
        expect(computeResolutionScale(7680, 4320)).toBe(4.0);
        expect(computeResolutionScale(4320, 7680)).toBe(4.0);

        // 16K: 15360x8640 -> clamped to 4.0
        expect(computeResolutionScale(15360, 8640)).toBe(4.0);

        // Gigapixel 30000x20000 -> clamped to 4.0
        expect(computeResolutionScale(30000, 20000)).toBe(4.0);
        expect(computeResolutionScale(20000, 30000)).toBe(4.0);
      });
    });

    describe('1.2 Extreme Aspect Ratios', () => {
      it('correctly uses major axis for 200:1 ultrawide ribbon and 1:200 skyscraper', () => {
        // Ultrawide ribbon 10000x50 (ratio 200:1)
        expect(computeResolutionScale(10000, 50)).toBe(4.0);

        // Skyscraper column 50x10000 (ratio 1:200)
        expect(computeResolutionScale(50, 10000)).toBe(4.0);

        // Extreme single-pixel 100000x1 ribbon
        expect(computeResolutionScale(100000, 1)).toBe(4.0);
        expect(computeResolutionScale(1, 100000)).toBe(4.0);

        // 32:9 Super Ultrawide (5120x1440) -> 5120 / 1440 = 3.5555...
        expect(computeResolutionScale(5120, 1440)).toBeCloseTo(5120 / 1440, 5);

        // 21:9 Ultrawide (3440x1440) -> 3440 / 1440 = 2.3888...
        expect(computeResolutionScale(3440, 1440)).toBeCloseTo(3440 / 1440, 5);

        // Just over 1440 threshold on extreme aspect ratio
        expect(computeResolutionScale(1441, 1)).toBeCloseTo(1441 / 1440, 5);
        expect(computeResolutionScale(1, 1441)).toBeCloseTo(1441 / 1440, 5);
      });
    });

    describe('1.3 Hostile and Degenerate Inputs', () => {
      it('safely defaults to 1.0 for zero dimensions (0x0, 0x1080, 1920x0)', () => {
        expect(computeResolutionScale(0, 0)).toBe(1.0);
        expect(computeResolutionScale(0, 1080)).toBe(1.0);
        expect(computeResolutionScale(1920, 0)).toBe(1.0);
        expect(computeResolutionScale(-0, 0)).toBe(1.0);
      });

      it('safely defaults to 1.0 for negative dimensions (-1920x-1080, -1x-1, etc.)', () => {
        expect(computeResolutionScale(-1920, -1080)).toBe(1.0);
        expect(computeResolutionScale(-1920, 1080)).toBe(1.0);
        expect(computeResolutionScale(1920, -1080)).toBe(1.0);
        expect(computeResolutionScale(-1, -1)).toBe(1.0);
        expect(computeResolutionScale(-10000, 50)).toBe(1.0);
      });

      it('safely defaults to 1.0 for NaN, Infinity, and -Infinity', () => {
        expect(computeResolutionScale(NaN, 1080)).toBe(1.0);
        expect(computeResolutionScale(1920, NaN)).toBe(1.0);
        expect(computeResolutionScale(NaN, NaN)).toBe(1.0);
        expect(computeResolutionScale(Infinity, 1080)).toBe(1.0);
        expect(computeResolutionScale(1920, Infinity)).toBe(1.0);
        expect(computeResolutionScale(Infinity, Infinity)).toBe(1.0);
        expect(computeResolutionScale(-Infinity, 1080)).toBe(1.0);
        expect(computeResolutionScale(1920, -Infinity)).toBe(1.0);
        expect(computeResolutionScale(-Infinity, -Infinity)).toBe(1.0);
        expect(computeResolutionScale(Infinity, NaN)).toBe(1.0);
      });

      it('safely defaults to 1.0 for undefined, null, and non-numeric types', () => {
        expect(computeResolutionScale(undefined, undefined)).toBe(1.0);
        expect(computeResolutionScale(undefined, 1080)).toBe(1.0);
        expect(computeResolutionScale(1920, undefined)).toBe(1.0);
        expect(computeResolutionScale(null as unknown as number, null as unknown as number)).toBe(1.0);
        expect(computeResolutionScale(null as unknown as number, 1080)).toBe(1.0);
        expect(computeResolutionScale('3840' as unknown as number, 2160)).toBe(1.0);
        expect(computeResolutionScale({} as unknown as number, [] as unknown as number)).toBe(1.0);
        expect(computeResolutionScale(true as unknown as number, false as unknown as number)).toBe(1.0);
      });

      it('safely handles non-integer floats without error or overflow', () => {
        const floatScale = computeResolutionScale(1920.735, 1080.412);
        expect(Number.isFinite(floatScale)).toBe(true);
        expect(floatScale).toBeCloseTo(1920.735 / 1440, 5);

        const boundaryFloat = computeResolutionScale(1440.001, 899.999);
        expect(boundaryFloat).toBeCloseTo(1440.001 / 1440, 5);
        expect(boundaryFloat).toBeGreaterThan(1.0);
      });
    });
  });

  // =========================================================================
  // SECTION 2: Scalable Pin Dimensions & Bounding Box (getPinDimensions & getPinBoundingBox)
  // =========================================================================
  describe('2. Scalable Pin Dimensions & Bounding Box (getPinDimensions & getPinBoundingBox)', () => {
    describe('2.1 getPinDimensions scaling invariants', () => {
      it('returns baseline pin dimensions for scale = 1.0', () => {
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

      it('preserves geometric invariants across arbitrary continuous scales [1.0, 4.0]', () => {
        for (let s = 1.0; s <= 4.0; s += 0.1) {
          const pin = getPinDimensions(s);

          // All values must be positive integers
          expect(Number.isInteger(pin.headRadius)).toBe(true);
          expect(Number.isInteger(pin.pointerHeight)).toBe(true);
          expect(Number.isInteger(pin.width)).toBe(true);
          expect(Number.isInteger(pin.height)).toBe(true);
          expect(Number.isInteger(pin.fontSize)).toBe(true);
          expect(Number.isInteger(pin.anchorOffset)).toBe(true);

          expect(pin.headRadius).toBeGreaterThan(0);
          expect(pin.pointerHeight).toBeGreaterThan(0);
          expect(pin.width).toBeGreaterThan(0);
          expect(pin.height).toBeGreaterThan(0);
          expect(pin.fontSize).toBeGreaterThanOrEqual(12);

          // Invariant: width is Math.round(28 * s), which matches 2 * headRadius within 1px rounding tolerance
          expect(pin.width).toBe(Math.round(28 * s));
          expect(Math.abs(pin.width - 2 * pin.headRadius)).toBeLessThanOrEqual(1);
          // At integer scales, width strictly equals 2 * headRadius
          if (Number.isInteger(s)) {
            expect(pin.width).toBe(2 * pin.headRadius);
          }

          // Invariant: height is headRadius + pointerHeight (distance from tip to top of head)
          expect(pin.height).toBe(pin.headRadius + pin.pointerHeight);

          // Invariant: anchorOffset is pointerHeight
          expect(pin.anchorOffset).toBe(pin.pointerHeight);
        }
      });

      it('scales proportionally at key display resolutions', () => {
        // 2K QHD (scale = 1.77777...)
        const scale2k = computeResolutionScale(2560, 1440);
        const pin2k = getPinDimensions(scale2k);
        expect(pin2k.headRadius).toBe(Math.round(14 * scale2k));
        expect(pin2k.pointerHeight).toBe(Math.round(20 * scale2k));
        expect(pin2k.fontSize).toBe(Math.round(12 * scale2k));

        // 4K UHD (scale = 2.66666...)
        const scale4k = computeResolutionScale(3840, 2160);
        const pin4k = getPinDimensions(scale4k);
        expect(pin4k.headRadius).toBe(Math.round(14 * scale4k));
        expect(pin4k.pointerHeight).toBe(Math.round(20 * scale4k));
        expect(pin4k.fontSize).toBe(Math.round(12 * scale4k));

        // 8K UHD (scale = 4.0)
        const pin8k = getPinDimensions(4.0);
        expect(pin8k.headRadius).toBe(56);
        expect(pin8k.pointerHeight).toBe(80);
        expect(pin8k.width).toBe(112);
        expect(pin8k.height).toBe(136);
        expect(pin8k.fontSize).toBe(48);
        expect(pin8k.anchorOffset).toBe(80);
      });

      it('defensively handles hostile/degenerate scale arguments', () => {
        const baseline = getPinDimensions(1.0);
        expect(getPinDimensions(0)).toEqual(baseline);
        expect(getPinDimensions(-2.5)).toEqual(baseline);
        expect(getPinDimensions(NaN)).toEqual(baseline);
        expect(getPinDimensions(Infinity)).toEqual(baseline);
        expect(getPinDimensions(-Infinity)).toEqual(baseline);
        expect(getPinDimensions(undefined)).toEqual(baseline);
        expect(getPinDimensions('invalid' as unknown as number)).toEqual(baseline);
      });
    });

    describe('2.2 getPinBoundingBox & getGeometryBoundingBox', () => {
      it('computes exact AABB enclosing needle tip and head circle across scales', () => {
        const pin: PinGeometry = { type: 'pin', x: 500, y: 600 };

        const testScales = [1.0, 1.333, 1.778, 2.0, 2.667, 3.556, 4.0];
        for (const scale of testScales) {
          const dims = getPinDimensions(scale);
          const bbox = getPinBoundingBox(pin, scale);
          const geomBbox = getGeometryBoundingBox(pin, scale);

          // getGeometryBoundingBox must delegate identically
          expect(bbox).toEqual(geomBbox);

          // Coordinates: bbox.width is strictly 2 * headRadius (exact circle diameter)
          expect(bbox.x).toBe(pin.x - dims.headRadius);
          expect(bbox.y).toBe(pin.y - dims.height);
          expect(bbox.width).toBe(2 * dims.headRadius);
          expect(Math.abs(bbox.width - dims.width)).toBeLessThanOrEqual(1);
          expect(bbox.height).toBe(dims.height);

          // Top, bottom, left, right extents
          const left = bbox.x;
          const right = bbox.x + bbox.width;
          const top = bbox.y;
          const bottom = bbox.y + bbox.height;

          expect(left).toBe(pin.x - dims.headRadius);
          expect(right).toBe(pin.x + dims.headRadius);
          expect(top).toBe(pin.y - dims.pointerHeight - dims.headRadius);
          expect(bottom).toBe(pin.y); // Needle tip is exactly at bottom center!
        }
      });

      it('handles negative and extreme coordinates without precision loss or NaN', () => {
        const extremePins: PinGeometry[] = [
          { type: 'pin', x: 0, y: 0 },
          { type: 'pin', x: -500, y: -800 },
          { type: 'pin', x: 1_000_000, y: 2_000_000 },
          { type: 'pin', x: -999_999.5, y: 888_888.25 },
        ];

        for (const pin of extremePins) {
          const bbox = getPinBoundingBox(pin, 2.0);
          expect(Number.isFinite(bbox.x)).toBe(true);
          expect(Number.isFinite(bbox.y)).toBe(true);
          expect(Number.isFinite(bbox.width)).toBe(true);
          expect(Number.isFinite(bbox.height)).toBe(true);
          expect(bbox.width).toBe(56);
          expect(bbox.height).toBe(68);
        }
      });
    });
  });

  // =========================================================================
  // SECTION 3: High-Index Badges & Readability Oracle (getBadgeDimensions)
  // =========================================================================
  describe('3. High-Index Badges & Readability Oracle (getBadgeDimensions)', () => {
    const testIndices = [1, 9, 10, 99, 100, 999, 10000];
    const testScales = [1.0, 1.333, 1.778, 2.0, 2.667, 3.556, 4.0];

    it('distinguishes single-digit circles (isPill = false) and multi-digit pills (isPill = true)', () => {
      for (const scale of testScales) {
        expect(getBadgeDimensions(1, scale).isPill).toBe(false);
        expect(getBadgeDimensions(9, scale).isPill).toBe(false);
        expect(getBadgeDimensions(10, scale).isPill).toBe(true);
        expect(getBadgeDimensions(99, scale).isPill).toBe(true);
        expect(getBadgeDimensions(100, scale).isPill).toBe(true);
        expect(getBadgeDimensions(999, scale).isPill).toBe(true);
        expect(getBadgeDimensions(10000, scale).isPill).toBe(true);
      }
    });

    it('enforces non-overlapping pill borders (width >= 2 * radius) for all multi-digit pills', () => {
      // If width < 2 * radius, rounded caps overlap and invert, distorting the pill geometry.
      for (const idx of [10, 99, 100, 999, 10000, 99999]) {
        for (let s = 1.0; s <= 4.0; s += 0.05) {
          const dims = getBadgeDimensions(idx, s);
          expect(dims.isPill).toBe(true);
          expect(
            dims.width,
            `Index ${idx} at scale ${s.toFixed(2)}: width (${dims.width}) must be >= 2 * radius (${2 * dims.radius})`
          ).toBeGreaterThanOrEqual(2 * dims.radius);
        }
      }
    });

    it('enforces positive radius and readable font sizes (fontSize >= 11) across all indices and scales', () => {
      for (const idx of testIndices) {
        for (const scale of testScales) {
          const dims = getBadgeDimensions(idx, scale);
          expect(dims.radius, `Index ${idx}, scale ${scale}: radius positive`).toBeGreaterThan(0);
          expect(dims.fontSize, `Index ${idx}, scale ${scale}: fontSize >= 11`).toBeGreaterThanOrEqual(11);
          expect(dims.width, `Index ${idx}, scale ${scale}: width >= 20`).toBeGreaterThanOrEqual(20);
          expect(dims.height, `Index ${idx}, scale ${scale}: height >= 20`).toBeGreaterThanOrEqual(20);
        }
      }
    });

    it('returns strictly integer dimensions for crisp pixel rendering', () => {
      const arbitraryScales = [1.0, 1.234, 1.5, 1.777, 2.1415, 2.666, 3.14159, 3.8888, 4.0];
      for (const idx of testIndices) {
        for (const s of arbitraryScales) {
          const dims = getBadgeDimensions(idx, s);
          expect(Number.isInteger(dims.width), `width int at scale ${s}`).toBe(true);
          expect(Number.isInteger(dims.height), `height int at scale ${s}`).toBe(true);
          expect(Number.isInteger(dims.radius), `radius int at scale ${s}`).toBe(true);
          expect(Number.isInteger(dims.fontSize), `fontSize int at scale ${s}`).toBe(true);
        }
      }
    });

    it('monotonically expands pill width as digits increase (10 -> 100 -> 1000 -> 10000)', () => {
      for (const scale of testScales) {
        const w1 = getBadgeDimensions(1, scale).width;
        const w2 = getBadgeDimensions(10, scale).width;
        const w3 = getBadgeDimensions(100, scale).width;
        const w4 = getBadgeDimensions(1000, scale).width;
        const w5 = getBadgeDimensions(10000, scale).width;

        expect(w2).toBeGreaterThanOrEqual(w1);
        expect(w3).toBeGreaterThan(w2);
        expect(w4).toBeGreaterThan(w3);
        expect(w5).toBeGreaterThan(w4);
      }
    });

    it('defensively clamps degenerate indices (0, negative) to index 1 without throwing', () => {
      const dimZero = getBadgeDimensions(0, 1.0);
      const dimNeg = getBadgeDimensions(-99, 1.0);
      const dimOne = getBadgeDimensions(1, 1.0);

      expect(dimZero).toEqual(dimOne);
      expect(dimNeg).toEqual(dimOne);
    });

    it('defensively clamps degenerate scales (0, negative, NaN, Infinity) to scale 1.0', () => {
      const baseline = getBadgeDimensions(42, 1.0);
      expect(getBadgeDimensions(42, 0)).toEqual(baseline);
      expect(getBadgeDimensions(42, -3.5)).toEqual(baseline);
      expect(getBadgeDimensions(42, NaN)).toEqual(baseline);
      expect(getBadgeDimensions(42, Infinity)).toEqual(baseline);
      expect(getBadgeDimensions(42, -Infinity)).toEqual(baseline);
    });
  });

  // =========================================================================
  // SECTION 4: Shape Badge Positioning Contract (getBadgePositionForShape)
  // =========================================================================
  describe('4. Shape Badge Positioning Contract (getBadgePositionForShape)', () => {
    it('anchors box, highlight, and blur shapes at top-left invariant to resolution scale', () => {
      const shapes: AnnotationGeometry[] = [
        { type: 'box', x: 120, y: 240, width: 300, height: 150 },
        { type: 'highlight', x: 200, y: 350, width: 400, height: 250 },
        { type: 'blur', x: 50, y: 75, width: 180, height: 90 },
      ];

      for (const geom of shapes) {
        for (const scale of [1.0, 1.778, 2.667, 4.0]) {
          const pos = getBadgePositionForShape(geom, scale);
          expect(pos).toEqual({ x: (geom as { x: number }).x, y: (geom as { y: number }).y });
        }
      }
    });

    it('anchors arrow at tail (startX, startY) invariant to resolution scale', () => {
      const arrow: AnnotationGeometry = {
        type: 'arrow',
        startX: 450,
        startY: 600,
        endX: 850,
        endY: 900,
      };

      for (const scale of [1.0, 1.5, 2.0, 3.0, 4.0]) {
        const pos = getBadgePositionForShape(arrow, scale);
        expect(pos).toEqual({ x: 450, y: 600 });
      }
    });

    it('anchors ellipse at 225° apex invariant to resolution scale', () => {
      const ellipse: AnnotationGeometry = {
        type: 'ellipse',
        cx: 500,
        cy: 500,
        rx: 150,
        ry: 80,
      };

      const expectedX = 500 - 150 * Math.SQRT1_2;
      const expectedY = 500 - 80 * Math.SQRT1_2;

      for (const scale of [1.0, 2.0, 4.0]) {
        const pos = getBadgePositionForShape(ellipse, scale);
        expect(pos.x).toBeCloseTo(expectedX, 4);
        expect(pos.y).toBeCloseTo(expectedY, 4);
      }
    });

    it('anchors pin at pin head center (x, y - pointerHeight) scaling dynamically with resolution', () => {
      const pin: AnnotationGeometry = { type: 'pin', x: 800, y: 1000 };

      // Scale 1.0: pointerHeight = 20 -> y = 980
      expect(getBadgePositionForShape(pin, 1.0)).toEqual({ x: 800, y: 980 });

      // Scale 2.0: pointerHeight = 40 -> y = 960
      expect(getBadgePositionForShape(pin, 2.0)).toEqual({ x: 800, y: 960 });

      // Scale 4.0: pointerHeight = 80 -> y = 920
      expect(getBadgePositionForShape(pin, 4.0)).toEqual({ x: 800, y: 920 });

      // Scale 2.667 (4K): pointerHeight = round(20 * 2.66666...) = round(53.333...) = 53
      const scale4k = computeResolutionScale(3840, 2160);
      const expectedOffset4k = Math.round(20 * scale4k);
      expect(getBadgePositionForShape(pin, scale4k)).toEqual({ x: 800, y: 1000 - expectedOffset4k });
    });
  });

  // =========================================================================
  // SECTION 5: Pin Geometry & Hit-Test Adversarial Stress Suite (hitTestAnnotation)
  // =========================================================================
  describe('5. Pin Geometry & Hit-Test Adversarial Stress Suite (hitTestAnnotation)', () => {
    const pinGeom: PinGeometry = { type: 'pin', x: 500, y: 600 };
    const pinAnnotation: Annotation = {
      id: 'pin-adversarial-test',
      index: 1,
      geometry: pinGeom,
      style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.2 },
      note: 'Challenger pin',
      createdAt: 0,
      updatedAt: 0,
    };

    const testScales = [1.0, 1.5, 2.0, 2.667, 3.0, 4.0];

    describe('5.1 Head Circle Hit Coverage Across Scales', () => {
      it('accurately hits pin head center across all scale factors', () => {
        for (const scale of testScales) {
          const dims = getPinDimensions(scale);
          const headCenter: Point = { x: pinGeom.x, y: pinGeom.y - dims.pointerHeight };

          // Center point must always be detected
          expect(
            hitTestAnnotation(headCenter, pinAnnotation, 6, scale),
            `Scale ${scale}: pin head center hit`
          ).toBe(true);

          // Tolerance 0 must still hit center
          expect(
            hitTestAnnotation(headCenter, pinAnnotation, 0, scale),
            `Scale ${scale}: pin head center hit with tolerance 0`
          ).toBe(true);
        }
      });

      it('accurately hits all radial points within head circle across full 360-degree sweep', () => {
        for (const scale of testScales) {
          const dims = getPinDimensions(scale);
          const headCenter: Point = { x: pinGeom.x, y: pinGeom.y - dims.pointerHeight };

          // Sweep angles every 15 degrees
          for (let deg = 0; deg < 360; deg += 15) {
            const rad = (deg * Math.PI) / 180;

            // Interior point (50% radius)
            const pInterior: Point = {
              x: headCenter.x + dims.headRadius * 0.5 * Math.cos(rad),
              y: headCenter.y + dims.headRadius * 0.5 * Math.sin(rad),
            };
            expect(
              hitTestAnnotation(pInterior, pinAnnotation, 6, scale),
              `Scale ${scale}, deg ${deg}: interior head point`
            ).toBe(true);

            // Perimeter point (exact headRadius)
            const pPerimeter: Point = {
              x: headCenter.x + dims.headRadius * Math.cos(rad),
              y: headCenter.y + dims.headRadius * Math.sin(rad),
            };
            expect(
              hitTestAnnotation(pPerimeter, pinAnnotation, 6, scale),
              `Scale ${scale}, deg ${deg}: perimeter head point`
            ).toBe(true);

            // Boundary point within tolerance (headRadius + tolerance * 0.8)
            const tolerance = 6;
            const pNearBoundary: Point = {
              x: headCenter.x + (dims.headRadius + tolerance * 0.8) * Math.cos(rad),
              y: headCenter.y + (dims.headRadius + tolerance * 0.8) * Math.sin(rad),
            };
            expect(
              hitTestAnnotation(pNearBoundary, pinAnnotation, tolerance, scale),
              `Scale ${scale}, deg ${deg}: near boundary head point`
            ).toBe(true);
          }
        }
      });
    });

    describe('5.2 Stem Corridor & Needle Tip Hit Coverage Across Scales', () => {
      it('accurately hits along the entire vertical stem corridor from head to tip', () => {
        for (const scale of testScales) {
          const dims = getPinDimensions(scale);
          const headCenterY = pinGeom.y - dims.pointerHeight;

          // Sample points along the vertical stem axis
          const stepCount = 10;
          for (let i = 0; i <= stepCount; i++) {
            const fraction = i / stepCount;
            const stemPoint: Point = {
              x: pinGeom.x,
              y: headCenterY + fraction * dims.pointerHeight,
            };

            expect(
              hitTestAnnotation(stemPoint, pinAnnotation, 6, scale),
              `Scale ${scale}, fraction ${fraction}: stem axis point`
            ).toBe(true);
          }
        }
      });

      it('accurately hits needle tip anchor (x, y) and within tolerance halo', () => {
        for (const scale of testScales) {
          const tip: Point = { x: pinGeom.x, y: pinGeom.y };

          // Tip itself
          expect(hitTestAnnotation(tip, pinAnnotation, 6, scale)).toBe(true);
          expect(hitTestAnnotation(tip, pinAnnotation, 0, scale)).toBe(true);

          // Points within tolerance circle around tip
          const tolerance = 6;
          for (let deg = 0; deg < 360; deg += 45) {
            const rad = (deg * Math.PI) / 180;
            const nearTip: Point = {
              x: tip.x + (tolerance * 0.8) * Math.cos(rad),
              y: tip.y + (tolerance * 0.8) * Math.sin(rad),
            };
            expect(
              hitTestAnnotation(nearTip, pinAnnotation, tolerance, scale),
              `Scale ${scale}, deg ${deg}: near tip point`
            ).toBe(true);
          }
        }
      });
    });

    describe('5.3 Zero False Positives Outside Bounding Box + Tolerance', () => {
      it('strictly returns false for all perimeter points outside bbox + tolerance across scales', () => {
        const tolerance = 6;

        for (const scale of testScales) {
          const bbox = getPinBoundingBox(pinGeom, scale);

          // Perimeter probe distances outside the bounding box + tolerance
          const probeDistances = [1, 5, 10, 25, 50, 100, 500];

          for (const d of probeDistances) {
            // Strictly Left
            const pLeft: Point = { x: bbox.x - tolerance - d, y: bbox.y + bbox.height / 2 };
            expect(
              hitTestAnnotation(pLeft, pinAnnotation, tolerance, scale),
              `Scale ${scale}, dist ${d}: outside left`
            ).toBe(false);

            // Strictly Right
            const pRight: Point = { x: bbox.x + bbox.width + tolerance + d, y: bbox.y + bbox.height / 2 };
            expect(
              hitTestAnnotation(pRight, pinAnnotation, tolerance, scale),
              `Scale ${scale}, dist ${d}: outside right`
            ).toBe(false);

            // Strictly Above
            const pAbove: Point = { x: bbox.x + bbox.width / 2, y: bbox.y - tolerance - d };
            expect(
              hitTestAnnotation(pAbove, pinAnnotation, tolerance, scale),
              `Scale ${scale}, dist ${d}: outside top`
            ).toBe(false);

            // Strictly Below needle tip
            const pBelow: Point = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height + tolerance + d };
            expect(
              hitTestAnnotation(pBelow, pinAnnotation, tolerance, scale),
              `Scale ${scale}, dist ${d}: outside bottom`
            ).toBe(false);
          }
        }
      });

      it('correctly discriminates tapered stem cutouts in lower corners of bounding box', () => {
        // The pin tapers from the head circle down to the needle tip.
        // The bottom-left and bottom-right corners of the bounding box (at y = pin.y)
        // are far from both the needle tip (distance = headRadius) and the stem.
        // For scale >= 1.0, headRadius >= 14, which is well above default tolerance 6.
        for (const scale of testScales) {
          const bbox = getPinBoundingBox(pinGeom, scale);

          // Bottom-left corner of AABB: (bbox.x, pin.y)
          const blCorner: Point = { x: bbox.x, y: pinGeom.y };
          expect(
            hitTestAnnotation(blCorner, pinAnnotation, 6, scale),
            `Scale ${scale}: bottom-left corner of AABB must be false`
          ).toBe(false);

          // Bottom-right corner of AABB: (bbox.x + bbox.width, pin.y)
          const brCorner: Point = { x: bbox.x + bbox.width, y: pinGeom.y };
          expect(
            hitTestAnnotation(brCorner, pinAnnotation, 6, scale),
            `Scale ${scale}: bottom-right corner of AABB must be false`
          ).toBe(false);
        }
      });

      it('conducts dense Monte Carlo sampling (1,000 points) proving 0 false positives outside AABB + tolerance', () => {
        const tolerance = 6;

        for (const scale of [1.0, 2.0, 4.0]) {
          const bbox = getPinBoundingBox(pinGeom, scale);
          const dims = getPinDimensions(scale);
          const headCenterY = pinGeom.y - dims.pointerHeight;

          // Bounding box extended by tolerance
          const minX = bbox.x - tolerance;
          const maxX = bbox.x + bbox.width + tolerance;
          const minY = bbox.y - tolerance;
          const maxY = bbox.y + bbox.height + tolerance;

          // Probe space: 400x400 window centered on the pin
          const probeMinX = pinGeom.x - 200;
          const probeMaxX = pinGeom.x + 200;
          const probeMinY = pinGeom.y - 200;
          const probeMaxY = pinGeom.y + 200;

          // Deterministic pseudo-random seed generator for reproducible empirical proof
          let seed = 42 + Math.round(scale * 100);
          const lcg = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
          };

          let positiveCount = 0;
          let negativeCount = 0;

          for (let n = 0; n < 1000; n++) {
            const px = probeMinX + lcg() * (probeMaxX - probeMinX);
            const py = probeMinY + lcg() * (probeMaxY - probeMinY);
            const point: Point = { x: px, y: py };

            const isHit = hitTestAnnotation(point, pinAnnotation, tolerance, scale);

            if (isHit) {
              positiveCount++;
              // INVARIANT 1: Every hit MUST be inside AABB + tolerance
              expect(
                point.x,
                `Hit point X (${point.x}) must be >= minX (${minX}) at scale ${scale}`
              ).toBeGreaterThanOrEqual(minX - 1e-6);
              expect(
                point.x,
                `Hit point X (${point.x}) must be <= maxX (${maxX}) at scale ${scale}`
              ).toBeLessThanOrEqual(maxX + 1e-6);
              expect(
                point.y,
                `Hit point Y (${point.y}) must be >= minY (${minY}) at scale ${scale}`
              ).toBeGreaterThanOrEqual(minY - 1e-6);
              expect(
                point.y,
                `Hit point Y (${point.y}) must be <= maxY (${maxY}) at scale ${scale}`
              ).toBeLessThanOrEqual(maxY + 1e-6);

              // INVARIANT 2: Mathematical distance oracle check
              const distHead = Math.hypot(point.x - pinGeom.x, point.y - headCenterY);
              const distAnchor = Math.hypot(point.x - pinGeom.x, point.y - pinGeom.y);
              const distStem = pointToSegmentDistance(
                point,
                { x: pinGeom.x, y: pinGeom.y },
                { x: pinGeom.x, y: headCenterY }
              );

              const satisfiesGeometry =
                distHead <= dims.headRadius + tolerance ||
                distAnchor <= tolerance ||
                distStem <= tolerance;

              expect(
                satisfiesGeometry,
                `Hit at (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) must satisfy head, stem, or tip distance`
              ).toBe(true);
            } else {
              negativeCount++;
            }
          }

          expect(positiveCount).toBeGreaterThan(0);
          expect(negativeCount).toBeGreaterThan(0);
        }
      });

      it('defensively handles hostile scale inputs in hitTestAnnotation', () => {
        const headCenter1x: Point = { x: pinGeom.x, y: pinGeom.y - 20 };

        // Scale fallback: NaN, negative, Infinity should fallback to scale 1.0
        expect(hitTestAnnotation(headCenter1x, pinAnnotation, 6, NaN)).toBe(true);
        expect(hitTestAnnotation(headCenter1x, pinAnnotation, 6, -2)).toBe(true);
        expect(hitTestAnnotation(headCenter1x, pinAnnotation, 6, 0)).toBe(true);
        expect(hitTestAnnotation(headCenter1x, pinAnnotation, 6, Infinity)).toBe(true);
      });
    });
  });
});
