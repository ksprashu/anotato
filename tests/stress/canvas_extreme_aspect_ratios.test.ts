import { describe, it, expect } from 'vitest';
import {
  screenToImage,
  imageToScreen,
  computeZoomTransform,
  computeZoomDelta,
  getFitToViewportTransform,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../../src/math/coordinates';
import { Point, ViewportState } from '../../src/types';

describe('Extreme Aspect Ratios & High-Frequency Zoom Oscillations (Milestone 2 Challenge)', () => {
  // =========================================================================
  // 1. High-Frequency Zoom Oscillations Across Extreme Zoom Factors (0.05x to 50x)
  // =========================================================================
  describe('High-Frequency Wheel Zoom Invariant Stress', () => {
    it('preserves exact screen focal coordinates across 2,500 rapid zoom oscillations (0.05x - 50x)', () => {
      let viewport: ViewportState = { zoom: 1.0, panX: 250, panY: 180 };
      const focalScreen: Point = { x: 482.35, y: 319.87 };

      // Record intrinsic image point under the focal cursor
      const initialImagePixel = screenToImage(focalScreen, viewport);

      for (let i = 0; i < 2500; i++) {
        // Generate extreme target zooms spanning 0.01x up to 100x (clamped to [0.05, 20.0])
        const rawTargetZoom = Math.pow(10, (Math.random() - 0.5) * 4); // ~0.01x to 100x
        viewport = computeZoomTransform(viewport, focalScreen, rawTargetZoom, MIN_ZOOM, MAX_ZOOM);

        expect(viewport.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(viewport.zoom).toBeLessThanOrEqual(MAX_ZOOM);
        expect(Number.isFinite(viewport.panX)).toBe(true);
        expect(Number.isFinite(viewport.panY)).toBe(true);

        // Verify that the original image pixel still maps back to focalScreen
        const screenAfter = imageToScreen(initialImagePixel, viewport);
        expect(screenAfter.x).toBeCloseTo(focalScreen.x, 3);
        expect(screenAfter.y).toBeCloseTo(focalScreen.y, 3);
      }
    });

    it('simulates 2,000 continuous mouse wheel tick deltas with variable sensitivities', () => {
      let viewport: ViewportState = { zoom: 1.0, panX: 0, panY: 0 };
      const testFocals: Point[] = [
        { x: 0, y: 0 },
        { x: 1920, y: 1080 },
        { x: -300, y: -450 }, // Offscreen negative
        { x: 5000, y: 3000 }, // Deeply offscreen positive
      ];

      for (let i = 0; i < 2000; i++) {
        const focal = testFocals[i % testFocals.length];
        const deltaY = (Math.random() - 0.5) * 800; // rapid wheel jerks
        const isCtrlKey = i % 3 === 0; // Simulate pinch / ctrl-wheel
        const sensitivity = isCtrlKey ? 0.01 : 0.0015;

        const targetZoom = computeZoomDelta(viewport.zoom, deltaY, sensitivity, MIN_ZOOM, MAX_ZOOM);
        const imagePixelBefore = screenToImage(focal, viewport);
        viewport = computeZoomTransform(viewport, focal, targetZoom, MIN_ZOOM, MAX_ZOOM);

        const screenPixelAfter = imageToScreen(imagePixelBefore, viewport);
        expect(screenPixelAfter.x).toBeCloseTo(focal.x, 4);
        expect(screenPixelAfter.y).toBeCloseTo(focal.y, 4);
      }
    });

    it('handles alternating extreme zoom bounce between 0.05x and 50x clamped', () => {
      let viewport: ViewportState = { zoom: 1.0, panX: 100, panY: 100 };
      const focalScreen: Point = { x: 600, y: 400 };
      const basePixel = screenToImage(focalScreen, viewport);

      for (let i = 0; i < 200; i++) {
        // Alternating extreme min (0.01) and extreme max (50.0)
        const targetZoom = i % 2 === 0 ? 0.01 : 50.0;
        viewport = computeZoomTransform(viewport, focalScreen, targetZoom, MIN_ZOOM, MAX_ZOOM);

        if (i % 2 === 0) {
          expect(viewport.zoom).toBe(MIN_ZOOM);
        } else {
          expect(viewport.zoom).toBe(MAX_ZOOM);
        }

        const remapped = imageToScreen(basePixel, viewport);
        expect(remapped.x).toBeCloseTo(focalScreen.x, 4);
        expect(remapped.y).toBeCloseTo(focalScreen.y, 4);
      }
    });
  });

  // =========================================================================
  // 2. Extreme Aspect Ratios: Panoramic, Column, Retina, Micro
  // =========================================================================
  describe('Extreme Image Aspect Ratios Auto-Fit & Navigation', () => {
    const containerWidth = 1200;
    const containerHeight = 800;
    const padding = 32;

    it('handles 10,000x100 ultra-wide panoramic strip', () => {
      const imgWidth = 10000;
      const imgHeight = 100;
      const fit = getFitToViewportTransform(imgWidth, imgHeight, containerWidth, containerHeight, padding);

      // Avail width = 1200 - 64 = 1136. scaleX = 1136 / 10000 = 0.1136. scaleY = (800 - 64) / 100 = 7.36.
      // Fit zoom should be min(scaleX, scaleY, 1.0) = 0.1136
      expect(fit.zoom).toBeCloseTo(1136 / 10000, 4);

      // Center alignment check
      const imageCenter: Point = { x: imgWidth / 2, y: imgHeight / 2 };
      const screenCenter = imageToScreen(imageCenter, fit);
      expect(screenCenter.x).toBeCloseTo(containerWidth / 2, 2);
      expect(screenCenter.y).toBeCloseTo(containerHeight / 2, 2);

      // Verify zoom invariance at extreme left and extreme right of strip
      const leftEdgeScreen = imageToScreen({ x: 0, y: 50 }, fit);
      const zoomAtLeft = computeZoomTransform(fit, leftEdgeScreen, 4.0, MIN_ZOOM, MAX_ZOOM);
      const leftEdgeAfter = imageToScreen({ x: 0, y: 50 }, zoomAtLeft);
      expect(leftEdgeAfter.x).toBeCloseTo(leftEdgeScreen.x, 3);
      expect(leftEdgeAfter.y).toBeCloseTo(leftEdgeScreen.y, 3);

      const rightEdgeScreen = imageToScreen({ x: 10000, y: 50 }, fit);
      const zoomAtRight = computeZoomTransform(fit, rightEdgeScreen, 5.0, MIN_ZOOM, MAX_ZOOM);
      const rightEdgeAfter = imageToScreen({ x: 10000, y: 50 }, zoomAtRight);
      expect(rightEdgeAfter.x).toBeCloseTo(rightEdgeScreen.x, 3);
      expect(rightEdgeAfter.y).toBeCloseTo(rightEdgeScreen.y, 3);
    });

    it('handles 50x5,000 ultra-tall vertical column', () => {
      const imgWidth = 50;
      const imgHeight = 5000;
      const fit = getFitToViewportTransform(imgWidth, imgHeight, containerWidth, containerHeight, padding);

      // Avail height = 800 - 64 = 736. scaleY = 736 / 5000 = 0.1472. scaleX = 1136 / 50 = 22.72.
      // Fit zoom should be min(scaleX, scaleY, 1.0) = 0.1472
      expect(fit.zoom).toBeCloseTo(736 / 5000, 4);

      // Centering check
      const imageCenter: Point = { x: imgWidth / 2, y: imgHeight / 2 };
      const screenCenter = imageToScreen(imageCenter, fit);
      expect(screenCenter.x).toBeCloseTo(containerWidth / 2, 2);
      expect(screenCenter.y).toBeCloseTo(containerHeight / 2, 2);

      // Zoom invariance at bottom edge
      const bottomEdgeScreen = imageToScreen({ x: 25, y: 5000 }, fit);
      const zoomedVp = computeZoomTransform(fit, bottomEdgeScreen, 10.0, MIN_ZOOM, MAX_ZOOM);
      const bottomAfter = imageToScreen({ x: 25, y: 5000 }, zoomedVp);
      expect(bottomAfter.x).toBeCloseTo(bottomEdgeScreen.x, 3);
      expect(bottomAfter.y).toBeCloseTo(bottomEdgeScreen.y, 3);
    });

    it('handles 8K 7,680x4,320 Retina display screenshot', () => {
      const imgWidth = 7680;
      const imgHeight = 4320;
      const fit = getFitToViewportTransform(imgWidth, imgHeight, containerWidth, containerHeight, padding);

      // scaleX = 1136 / 7680 = 0.1479, scaleY = 736 / 4320 = 0.1703
      // fit.zoom should be 1136 / 7680 = 0.1479166...
      expect(fit.zoom).toBeCloseTo(1136 / 7680, 4);

      const imageCenter: Point = { x: 3840, y: 2160 };
      const screenCenter = imageToScreen(imageCenter, fit);
      expect(screenCenter.x).toBeCloseTo(containerWidth / 2, 2);
      expect(screenCenter.y).toBeCloseTo(containerHeight / 2, 2);
    });

    it('handles 1x1 micro-pixel image with and without upscaling', () => {
      const fitNoUpscale = getFitToViewportTransform(1, 1, 1000, 800, 32, false);
      expect(fitNoUpscale.zoom).toBe(1.0); // Never upscale beyond 1.0
      expect(fitNoUpscale.panX).toBeCloseTo(499.5, 1);
      expect(fitNoUpscale.panY).toBeCloseTo(399.5, 1);

      const fitWithUpscale = getFitToViewportTransform(1, 1, 1000, 800, 0, true);
      expect(fitWithUpscale.zoom).toBe(MAX_ZOOM); // Clamped at MAX_ZOOM (20.0)
    });

    it('handles massive 50,000x50,000 square image with MIN_ZOOM clamping', () => {
      const fit = getFitToViewportTransform(50000, 50000, 1000, 1000, 0);
      // 1000 / 50000 = 0.02, which clamps to MIN_ZOOM (0.05)
      expect(fit.zoom).toBe(MIN_ZOOM);
      expect(fit.panX).toBeCloseTo((1000 - 50000 * 0.05) / 2, 2);
      expect(fit.panY).toBeCloseTo((1000 - 50000 * 0.05) / 2, 2);
    });
  });
});
