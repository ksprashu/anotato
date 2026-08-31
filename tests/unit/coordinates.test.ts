import { describe, it, expect } from 'vitest';
import {
  screenToImage,
  imageToScreen,
  computeZoomTransform,
  computeZoomDelta,
  getFitToViewportTransform,
  clamp,
} from '../../src/math/coordinates';

describe('coordinates math engine', () => {
  describe('clamp', () => {
    it('clamps values correctly within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('throws error if min > max', () => {
      expect(() => clamp(5, 10, 0)).toThrow();
    });
  });

  describe('screenToImage & imageToScreen bijection', () => {
    const testCases = [
      {
        name: 'identity transform (1x zoom, 0 pan)',
        viewport: { zoom: 1, panX: 0, panY: 0 },
        imgPoint: { x: 150, y: 250 },
        scrPoint: { x: 150, y: 250 },
      },
      {
        name: '2x zoom with pan offset',
        viewport: { zoom: 2, panX: 100, panY: 50 },
        imgPoint: { x: 200, y: 300 },
        scrPoint: { x: 500, y: 650 },
      },
      {
        name: '0.5x zoom with negative pan offset',
        viewport: { zoom: 0.5, panX: -50, panY: -25 },
        imgPoint: { x: 400, y: 600 },
        scrPoint: { x: 150, y: 275 },
      },
    ];

    testCases.forEach(({ name, viewport, imgPoint, scrPoint }) => {
      it(`imageToScreen correctly maps for ${name}`, () => {
        const result = imageToScreen(imgPoint, viewport);
        expect(result.x).toBeCloseTo(scrPoint.x, 5);
        expect(result.y).toBeCloseTo(scrPoint.y, 5);
      });

      it(`screenToImage correctly inverts for ${name}`, () => {
        const result = screenToImage(scrPoint, viewport);
        expect(result.x).toBeCloseTo(imgPoint.x, 5);
        expect(result.y).toBeCloseTo(imgPoint.y, 5);
      });

      it(`roundtrip bijection holds for ${name}`, () => {
        const screen = imageToScreen(imgPoint, viewport);
        const backToImage = screenToImage(screen, viewport);
        expect(backToImage.x).toBeCloseTo(imgPoint.x, 5);
        expect(backToImage.y).toBeCloseTo(imgPoint.y, 5);
      });
    });
  });

  describe('computeZoomTransform (Focal Point Invariance)', () => {
    it('maintains exact image coordinate under mouse cursor during zoom in', () => {
      const initialViewport = { zoom: 1.0, panX: 50, panY: 30 };
      const focalScreen = { x: 300, y: 200 };

      // Point in image space before zoom
      const imgPointBefore = screenToImage(focalScreen, initialViewport);

      // Perform zoom to 2.5x
      const newViewport = computeZoomTransform(initialViewport, focalScreen, 2.5);

      // Point in image space after zoom at same screen focal point
      const imgPointAfter = screenToImage(focalScreen, newViewport);

      expect(newViewport.zoom).toBe(2.5);
      expect(imgPointAfter.x).toBeCloseTo(imgPointBefore.x, 5);
      expect(imgPointAfter.y).toBeCloseTo(imgPointBefore.y, 5);
    });

    it('maintains exact image coordinate during zoom out', () => {
      const initialViewport = { zoom: 3.0, panX: -120, panY: -80 };
      const focalScreen = { x: 450, y: 350 };

      const imgPointBefore = screenToImage(focalScreen, initialViewport);
      const newViewport = computeZoomTransform(initialViewport, focalScreen, 0.75);
      const imgPointAfter = screenToImage(focalScreen, newViewport);

      expect(newViewport.zoom).toBe(0.75);
      expect(imgPointAfter.x).toBeCloseTo(imgPointBefore.x, 5);
      expect(imgPointAfter.y).toBeCloseTo(imgPointBefore.y, 5);
    });

    it('enforces min and max zoom clamping', () => {
      const initialViewport = { zoom: 1.0, panX: 0, panY: 0 };
      const focalScreen = { x: 100, y: 100 };

      const clampedLow = computeZoomTransform(initialViewport, focalScreen, 0.001);
      expect(clampedLow.zoom).toBe(0.05);

      const clampedHigh = computeZoomTransform(initialViewport, focalScreen, 50.0);
      expect(clampedHigh.zoom).toBe(20.0);
    });
  });

  describe('computeZoomDelta', () => {
    it('increases zoom on negative deltaY (scroll up / zoom in)', () => {
      const zoom = computeZoomDelta(1.0, -100);
      expect(zoom).toBeGreaterThan(1.0);
    });

    it('decreases zoom on positive deltaY (scroll down / zoom out)', () => {
      const zoom = computeZoomDelta(1.0, 100);
      expect(zoom).toBeLessThan(1.0);
    });
  });

  describe('getFitToViewportTransform', () => {
    it('fits and centers 1920x1080 image inside 1000x800 viewport with 32px padding', () => {
      const imgW = 1920;
      const imgH = 1080;
      const vpW = 1000;
      const vpH = 800;
      const pad = 32;

      const availW = vpW - 2 * pad; // 936
      const availH = vpH - 2 * pad; // 736

      const expectedScale = Math.min(availW / imgW, availH / imgH, 1.0); // 936 / 1920 = 0.4875
      const transform = getFitToViewportTransform(imgW, imgH, vpW, vpH, pad);

      expect(transform.zoom).toBeCloseTo(expectedScale, 5);
      // Image should be horizontally and vertically centered
      const renderedW = imgW * transform.zoom;
      const renderedH = imgH * transform.zoom;
      expect(transform.panX).toBeCloseTo((vpW - renderedW) / 2, 5);
      expect(transform.panY).toBeCloseTo((vpH - renderedH) / 2, 5);

      // Verify center of image maps to center of viewport
      const centerScreen = imageToScreen({ x: imgW / 2, y: imgH / 2 }, transform);
      expect(centerScreen.x).toBeCloseTo(vpW / 2, 5);
      expect(centerScreen.y).toBeCloseTo(vpH / 2, 5);
    });

    it('does not upscale small images by default (allowUpscale = false)', () => {
      const transform = getFitToViewportTransform(200, 100, 1000, 800, 32, false);
      expect(transform.zoom).toBe(1.0);
      expect(transform.panX).toBe((1000 - 200) / 2);
      expect(transform.panY).toBe((800 - 100) / 2);
    });

    it('upscales small images when allowUpscale = true', () => {
      const transform = getFitToViewportTransform(200, 100, 1000, 800, 0, true);
      expect(transform.zoom).toBe(5.0); // min(1000/200=5, 800/100=8)
      expect(transform.panX).toBe(0);
      expect(transform.panY).toBe((800 - 100 * 5) / 2);
    });
  });
});
