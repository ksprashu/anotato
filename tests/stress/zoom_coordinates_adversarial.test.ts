import { describe, it, expect } from 'vitest';
import {
  clamp,
  screenToImage,
  imageToScreen,
  computeZoomTransform,
  computeZoomDelta,
  quantizeWheelZoom,
  ZOOM_PRESETS,
  getFitToViewportTransform,
  applyPanDelta,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../../src/math/coordinates';
import { Point, ViewportState } from '../../src/types';

describe('Adversarial Coordinate & Zoom Math Stress Tests', () => {
  describe('clamp() adversarial bounds', () => {
    it('throws when min > max', () => {
      expect(() => clamp(10, 20, 10)).toThrow(/Invalid clamp range/);
      expect(() => clamp(0, 100, -100)).toThrow();
    });

    it('handles negative, zero, and extreme values safely', () => {
      expect(clamp(-1000, -500, 500)).toBe(-500);
      expect(clamp(1000, -500, 500)).toBe(500);
      expect(clamp(0, -500, 500)).toBe(0);
      expect(clamp(-Infinity, -100, 100)).toBe(-100);
      expect(clamp(Infinity, -100, 100)).toBe(100);
      expect(clamp(50, 50, 50)).toBe(50);
    });
  });

  describe('screenToImage & imageToScreen bijection and round-trip invariance', () => {
    it('satisfies imageToScreen(screenToImage(p)) == p across 5,000 random points and viewports', () => {
      for (let i = 0; i < 5000; i++) {
        const viewport: ViewportState = {
          zoom: 0.05 + Math.random() * 19.95, // [0.05, 20.0]
          panX: (Math.random() - 0.5) * 20000,
          panY: (Math.random() - 0.5) * 20000,
        };

        const screenPt: Point = {
          x: (Math.random() - 0.5) * 10000,
          y: (Math.random() - 0.5) * 10000,
        };

        const imagePt = screenToImage(screenPt, viewport);
        const roundTripScreen = imageToScreen(imagePt, viewport);

        expect(Number.isFinite(imagePt.x)).toBe(true);
        expect(Number.isFinite(imagePt.y)).toBe(true);
        expect(roundTripScreen.x).toBeCloseTo(screenPt.x, 5);
        expect(roundTripScreen.y).toBeCloseTo(screenPt.y, 5);
      }
    });

    it('handles zero zoom gracefully without crashing', () => {
      const zeroVp: ViewportState = { zoom: 0, panX: 150, panY: 250 };
      const pt: Point = { x: 500, y: 600 };
      const imgPt = screenToImage(pt, zeroVp);
      expect(imgPt.x).toBe(350);
      expect(imgPt.y).toBe(350);
      const scrPt = imageToScreen(imgPt, zeroVp);
      expect(scrPt.x).toBe(150); // 0 * 350 + 150
      expect(scrPt.y).toBe(250);
    });

    it('handles negative screen coordinates and negative viewport pans', () => {
      const vp: ViewportState = { zoom: 2.5, panX: -500, panY: -800 };
      const pt: Point = { x: -250, y: -400 };
      const imgPt = screenToImage(pt, vp);
      expect(imgPt.x).toBe((-250 - -500) / 2.5); // 250 / 2.5 = 100
      expect(imgPt.y).toBe((-400 - -800) / 2.5); // 400 / 2.5 = 160
    });
  });

  describe('computeZoomTransform focal point invariance under extreme stress', () => {
    it('maintains strict focal point pixel invariance across extreme scales (0.01x to 100x)', () => {
      const testZooms = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0];
      const focalPoints: Point[] = [
        { x: 0, y: 0 },
        { x: 960, y: 540 },
        { x: -500, y: -300 }, // Off-screen negative cursor
        { x: 10000, y: 8000 }, // Deeply off-screen positive cursor
        { x: 123.456, y: 789.012 }, // Subpixel cursor
      ];

      let currentVp: ViewportState = { zoom: 1.0, panX: 100, panY: 50 };

      for (const focal of focalPoints) {
        for (const targetZoom of testZooms) {
          const imagePixelBefore = screenToImage(focal, currentVp);
          const nextVp = computeZoomTransform(currentVp, focal, targetZoom);

          // Zoom should be clamped between MIN_ZOOM (0.05) and MAX_ZOOM (20.0)
          expect(nextVp.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
          expect(nextVp.zoom).toBeLessThanOrEqual(MAX_ZOOM);

          const screenPixelAfter = imageToScreen(imagePixelBefore, nextVp);

          expect(screenPixelAfter.x).toBeCloseTo(focal.x, 4);
          expect(screenPixelAfter.y).toBeCloseTo(focal.y, 4);

          currentVp = nextVp;
        }
      }
    });

    it('survives 1,000 continuous rapid random zoom oscillations around moving cursor', () => {
      let vp: ViewportState = { zoom: 1.0, panX: 0, panY: 0 };

      for (let i = 0; i < 1000; i++) {
        const focal: Point = {
          x: (Math.random() - 0.5) * 4000,
          y: (Math.random() - 0.5) * 4000,
        };
        const randomTarget = Math.exp((Math.random() - 0.5) * 8); // extreme range: ~0.018 to ~54.6

        const imgBefore = screenToImage(focal, vp);
        vp = computeZoomTransform(vp, focal, randomTarget);

        expect(Number.isFinite(vp.zoom)).toBe(true);
        expect(Number.isFinite(vp.panX)).toBe(true);
        expect(Number.isFinite(vp.panY)).toBe(true);
        expect(vp.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(vp.zoom).toBeLessThanOrEqual(MAX_ZOOM);

        const screenAfter = imageToScreen(imgBefore, vp);
        expect(screenAfter.x).toBeCloseTo(focal.x, 3);
        expect(screenAfter.y).toBeCloseTo(focal.y, 3);
      }
    });

    it('returns identical viewport when target zoom equals current zoom', () => {
      const vp: ViewportState = { zoom: 2.0, panX: 120, panY: -80 };
      const focal: Point = { x: 300, y: 400 };
      const result = computeZoomTransform(vp, focal, 2.0);
      expect(result.zoom).toBe(2.0);
      expect(result.panX).toBe(120);
      expect(result.panY).toBe(-80);
    });
  });

  describe('computeZoomDelta scroll wheel exponential sensitivity', () => {
    it('is strictly monotonic: negative deltaY always increases zoom, positive deltaY always decreases zoom', () => {
      const initialZoom = 1.0;
      const zoomIn = computeZoomDelta(initialZoom, -100);
      const zoomOut = computeZoomDelta(initialZoom, 100);

      expect(zoomIn).toBeGreaterThan(initialZoom);
      expect(zoomOut).toBeLessThan(initialZoom);
    });

    it('handles giant wheel events (deltaY = ±100,000) by clamping to bounds without NaN or Infinity', () => {
      const hugeIn = computeZoomDelta(1.0, -100000);
      const hugeOut = computeZoomDelta(1.0, 100000);

      expect(hugeIn).toBe(MAX_ZOOM);
      expect(hugeOut).toBe(MIN_ZOOM);
      expect(Number.isFinite(hugeIn)).toBe(true);
      expect(Number.isFinite(hugeOut)).toBe(true);
    });

    it('deltaY of 0 produces exactly unchanged zoom', () => {
      expect(computeZoomDelta(1.5, 0)).toBe(1.5);
    });
  });

  describe('getFitToViewportTransform edge and stress cases', () => {
    it('handles extreme panoramic aspect ratio (100,000 x 100) centering correctly', () => {
      const fit = getFitToViewportTransform(100000, 100, 1000, 600, 20);
      expect(fit.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(fit.zoom).toBeLessThanOrEqual(MAX_ZOOM);
      expect(Number.isFinite(fit.panX)).toBe(true);
      expect(Number.isFinite(fit.panY)).toBe(true);
      // Image center in screen coordinates should align with viewport center
      const imgCenter: Point = { x: 50000, y: 50 };
      const screenCenter = imageToScreen(imgCenter, fit);
      expect(screenCenter.x).toBeCloseTo(500, 1);
      expect(screenCenter.y).toBeCloseTo(300, 1);
    });

    it('handles extreme tall aspect ratio (100 x 100,000) centering correctly', () => {
      const fit = getFitToViewportTransform(100, 100000, 800, 1000, 20);
      expect(fit.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(fit.zoom).toBeLessThanOrEqual(MAX_ZOOM);
      const imgCenter: Point = { x: 50, y: 50000 };
      const screenCenter = imageToScreen(imgCenter, fit);
      expect(screenCenter.x).toBeCloseTo(400, 1);
      expect(screenCenter.y).toBeCloseTo(500, 1);
    });

    it('handles zero or negative dimensions safely without throwing or NaN', () => {
      expect(getFitToViewportTransform(0, 500, 1000, 800)).toEqual({ zoom: 1, panX: 0, panY: 0 });
      expect(getFitToViewportTransform(500, 0, 1000, 800)).toEqual({ zoom: 1, panX: 0, panY: 0 });
      expect(getFitToViewportTransform(500, 500, 0, 800)).toEqual({ zoom: 1, panX: 0, panY: 0 });
      expect(getFitToViewportTransform(500, 500, 1000, 0)).toEqual({ zoom: 1, panX: 0, panY: 0 });
      expect(getFitToViewportTransform(-100, -100, -500, -500)).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });

    it('respects allowUpscale=false constraint by never exceeding zoom 1.0 for tiny images', () => {
      const fit = getFitToViewportTransform(50, 50, 1000, 1000, 32, false);
      expect(fit.zoom).toBe(1.0);
    });

    it('allows upscaling when allowUpscale=true', () => {
      const fit = getFitToViewportTransform(50, 50, 1000, 1000, 0, true);
      expect(fit.zoom).toBe(20.0); // 1000/50 = 20
    });
  });

  describe('applyPanDelta stress testing', () => {
    it('applies successive pan translations accurately without drift', () => {
      let vp: ViewportState = { zoom: 2.0, panX: 0, panY: 0 };
      for (let i = 0; i < 1000; i++) {
        vp = applyPanDelta(vp, 10.5, -5.25);
      }
      expect(vp.panX).toBeCloseTo(10500, 3);
      expect(vp.panY).toBeCloseTo(-5250, 3);
      expect(vp.zoom).toBe(2.0);
    });
  });

  describe('quantizeWheelZoom & ZOOM_PRESETS adversarial stress & focal point invariance', () => {
    it('defines exactly 10 strictly increasing presets from 0.10 to 2.00', () => {
      expect(ZOOM_PRESETS).toHaveLength(10);
      expect(ZOOM_PRESETS).toEqual([0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00]);
      for (let i = 1; i < ZOOM_PRESETS.length; i++) {
        expect(ZOOM_PRESETS[i]).toBeGreaterThan(ZOOM_PRESETS[i - 1]);
      }
    });

    it('steps up monotonically by 1 preset on negative deltaY and clamps at 2.00', () => {
      let z = 0.10;
      const expectedSteps = [0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00];
      for (const expected of expectedSteps) {
        z = quantizeWheelZoom(z, -120);
        expect(z).toBe(expected);
      }
      // Clamping at 2.00
      expect(quantizeWheelZoom(z, -120)).toBe(2.00);
      expect(quantizeWheelZoom(z, -5000)).toBe(2.00);
    });

    it('steps down monotonically by 1 preset on positive deltaY and clamps at 0.10', () => {
      let z = 2.00;
      const expectedSteps = [1.50, 1.25, 1.00, 0.75, 0.67, 0.50, 0.33, 0.25, 0.10];
      for (const expected of expectedSteps) {
        z = quantizeWheelZoom(z, 120);
        expect(z).toBe(expected);
      }
      // Clamping at 0.10
      expect(quantizeWheelZoom(z, 120)).toBe(0.10);
      expect(quantizeWheelZoom(z, 5000)).toBe(0.10);
    });

    it('leaves zoom unchanged when deltaY is 0', () => {
      for (const preset of ZOOM_PRESETS) {
        expect(quantizeWheelZoom(preset, 0)).toBe(preset);
      }
      expect(quantizeWheelZoom(0.42, 0)).toBe(0.42);
    });

    it('snaps arbitrary fractional zoom (e.g. 13.4% or 48.75%) to adjacent preset without multi-tier leap', () => {
      // 13.4% zoom
      expect(quantizeWheelZoom(0.134, -100)).toBe(0.25);
      expect(quantizeWheelZoom(0.134, 100)).toBe(0.10);

      // 48.75% zoom
      expect(quantizeWheelZoom(0.4875, -100)).toBe(0.50);
      expect(quantizeWheelZoom(0.4875, 100)).toBe(0.33);
    });

    it('handles extreme delta bursts (deltaY = ±10,000) with single-step advance', () => {
      expect(quantizeWheelZoom(0.25, -10000)).toBe(0.33);
      expect(quantizeWheelZoom(1.00, 10000)).toBe(0.75);
      expect(quantizeWheelZoom(0.50, -50000)).toBe(0.67);
      expect(quantizeWheelZoom(0.50, 50000)).toBe(0.33);
    });

    it('tolerates IEEE 754 subpixel precision drift without jumping or sticking', () => {
      expect(quantizeWheelZoom(0.3300000001, -120)).toBe(0.50);
      expect(quantizeWheelZoom(0.3300000001, 120)).toBe(0.25);
      expect(quantizeWheelZoom(0.6699999999, -120)).toBe(0.75);
      expect(quantizeWheelZoom(0.6699999999, 120)).toBe(0.50);
    });

    it('survives 10,000 random wheel delta burst transitions while maintaining cursor focal point invariance', () => {
      let vp: ViewportState = { zoom: 1.0, panX: 100, panY: 50 };

      for (let i = 0; i < 10000; i++) {
        const focalScreen: Point = {
          x: (Math.random() - 0.5) * 4000,
          y: (Math.random() - 0.5) * 4000,
        };
        const randomDeltaY = (Math.random() - 0.5) * 20000; // [-10,000, +10,000]

        const imgBefore = screenToImage(focalScreen, vp);
        const nextZoom = quantizeWheelZoom(vp.zoom, randomDeltaY);

        expect(nextZoom).toBeGreaterThanOrEqual(0.10);
        expect(nextZoom).toBeLessThanOrEqual(2.00);

        vp = computeZoomTransform(vp, focalScreen, nextZoom);

        const screenAfter = imageToScreen(imgBefore, vp);
        expect(screenAfter.x).toBeCloseTo(focalScreen.x, 3);
        expect(screenAfter.y).toBeCloseTo(focalScreen.y, 3);
      }
    });
  });
});

