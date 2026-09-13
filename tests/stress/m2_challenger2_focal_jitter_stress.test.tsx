import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { act } from 'react';
import { AppProvider } from '../../src/state/AppContext';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import {
  screenToImage,
  imageToScreen,
  computeZoomTransform,
  quantizeWheelZoom,
  ZOOM_PRESETS,
  getFitToViewportTransform,
} from '../../src/math/coordinates';
import { AppState, BaseImage, Point, ViewportState } from '../../src/types';

// ---------------------------------------------------------------------------
// Mock Helpers and Fixtures
// ---------------------------------------------------------------------------

const mockBaseImage: BaseImage = {
  id: 'img-adversarial-m2',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1920,
  naturalHeight: 1080,
  fileName: 'screenshot-m2.png',
  fileSize: 204800,
};

const renderCanvas = (initialState?: Partial<AppState>) => {
  return render(
    <AppProvider initialState={initialState}>
      <CanvasWorkspace />
    </AppProvider>
  );
};

describe('Milestone 2 Challenger 2: Cursor Focal Centering & Viewport Jitter Stress Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
  });

  afterEach(() => {
    cleanup();
  });

  // =========================================================================
  // 1. Cursor Focal Point Centering Invariance Under Extreme Stress
  // =========================================================================
  describe('1. Focal Point Centering Invariance Stress', () => {
    it('C1.1: guarantees pixel under cursor remains strictly invariant across 10,000 random zooms and viewports', () => {
      let maxDrift = 0;

      for (let i = 0; i < 10000; i++) {
        const vp: ViewportState = {
          zoom: ZOOM_PRESETS[Math.floor(Math.random() * ZOOM_PRESETS.length)],
          panX: (Math.random() - 0.5) * 10000,
          panY: (Math.random() - 0.5) * 10000,
        };

        const cursorScreen: Point = {
          x: (Math.random() - 0.5) * 5000,
          y: (Math.random() - 0.5) * 5000,
        };

        const targetZoom = ZOOM_PRESETS[Math.floor(Math.random() * ZOOM_PRESETS.length)];
        const imgCoordBefore = screenToImage(cursorScreen, vp);
        const nextVp = computeZoomTransform(vp, cursorScreen, targetZoom);
        const screenCoordAfter = imageToScreen(imgCoordBefore, nextVp);

        const driftX = Math.abs(screenCoordAfter.x - cursorScreen.x);
        const driftY = Math.abs(screenCoordAfter.y - cursorScreen.y);
        const drift = Math.max(driftX, driftY);
        if (drift > maxDrift) maxDrift = drift;

        expect(drift).toBeLessThan(1e-5);
      }

      expect(maxDrift).toBeLessThan(1e-7);
    });

    it('C1.2: maintains focal centering on extreme subpixel and floating-point boundary coordinates', () => {
      const subpixelPoints: Point[] = [
        { x: 0.0000001, y: 0.0000001 },
        { x: 999.9999999, y: 799.9999999 },
        { x: Math.PI * 100, y: Math.E * 100 },
        { x: -12345.6789, y: -9876.5432 },
        { x: 1e5, y: 1e5 },
      ];

      for (const pt of subpixelPoints) {
        for (let i = 0; i < ZOOM_PRESETS.length - 1; i++) {
          const fromZoom = ZOOM_PRESETS[i];
          const toZoom = ZOOM_PRESETS[i + 1];

          const vp: ViewportState = { zoom: fromZoom, panX: 123.456, panY: -789.012 };
          const imgPt = screenToImage(pt, vp);
          const nextVp = computeZoomTransform(vp, pt, toZoom);
          const screenPtAfter = imageToScreen(imgPt, nextVp);

          expect(screenPtAfter.x).toBeCloseTo(pt.x, 5);
          expect(screenPtAfter.y).toBeCloseTo(pt.y, 5);
        }
      }
    });

    it('C1.3: preserves focal stability when zooming directly from non-preset auto-fit zoom', () => {
      // Auto-fit 1920x1080 into 1000x800 container (zoom ~ 0.4875)
      const autoFit = getFitToViewportTransform(1920, 1080, 1000, 800, 32);
      expect(autoFit.zoom).toBeCloseTo(0.4875, 3);

      const focalPt: Point = { x: 500, y: 400 };
      const imgPt = screenToImage(focalPt, autoFit);

      // Scroll in: snaps to 0.50
      const nextZoomIn = quantizeWheelZoom(autoFit.zoom, -100);
      expect(nextZoomIn).toBe(0.50);

      const vpZoomIn = computeZoomTransform(autoFit, focalPt, nextZoomIn);
      const screenAfterIn = imageToScreen(imgPt, vpZoomIn);
      expect(screenAfterIn.x).toBeCloseTo(focalPt.x, 5);
      expect(screenAfterIn.y).toBeCloseTo(focalPt.y, 5);

      // Scroll out: snaps to 0.33
      const nextZoomOut = quantizeWheelZoom(autoFit.zoom, 100);
      expect(nextZoomOut).toBe(0.33);

      const vpZoomOut = computeZoomTransform(autoFit, focalPt, nextZoomOut);
      const screenAfterOut = imageToScreen(imgPt, vpZoomOut);
      expect(screenAfterOut.x).toBeCloseTo(focalPt.x, 5);
      expect(screenAfterOut.y).toBeCloseTo(focalPt.y, 5);
    });
  });

  // =========================================================================
  // 2. Rapid Wheel Jitter & Oscillation Stability
  // =========================================================================
  describe('2. Rapid Wheel Jitter & Numerical Drift Elimination', () => {
    it('C2.1: produces EXACT zero drift under 50,000 rapid direction reversals (-120 / +120)', () => {
      const focal: Point = { x: 480, y: 360 };
      let vp: ViewportState = { zoom: 1.00, panX: 150, panY: 200 };
      const initialPanX = vp.panX;
      const initialPanY = vp.panY;

      for (let i = 0; i < 50000; i++) {
        const zIn = quantizeWheelZoom(vp.zoom, -120);
        vp = computeZoomTransform(vp, focal, zIn);

        const zOut = quantizeWheelZoom(vp.zoom, 120);
        vp = computeZoomTransform(vp, focal, zOut);
      }

      expect(vp.zoom).toBe(1.00);
      expect(Math.abs(vp.panX - initialPanX)).toBeLessThan(1e-10);
      expect(Math.abs(vp.panY - initialPanY)).toBeLessThan(1e-10);
    });

    it('C2.2: survives 5,000 full-ladder sweeps (0.10 <-> 2.00) without drift accumulation', () => {
      const focal: Point = { x: 720, y: 450 };
      let vp: ViewportState = { zoom: 0.10, panX: -100, panY: 50 };
      const initialPanX = vp.panX;
      const initialPanY = vp.panY;

      for (let sweep = 0; sweep < 5000; sweep++) {
        // Zoom all the way up (9 steps)
        for (let step = 0; step < 9; step++) {
          const z = quantizeWheelZoom(vp.zoom, -120);
          vp = computeZoomTransform(vp, focal, z);
        }
        // Zoom all the way down (9 steps)
        for (let step = 0; step < 9; step++) {
          const z = quantizeWheelZoom(vp.zoom, 120);
          vp = computeZoomTransform(vp, focal, z);
        }
      }

      expect(vp.zoom).toBe(0.10);
      expect(Math.abs(vp.panX - initialPanX)).toBeLessThan(1e-9);
      expect(Math.abs(vp.panY - initialPanY)).toBeLessThan(1e-9);
    });

    it('C2.3: produces strict zero pan mutation when over-scrolling at ladder boundaries', () => {
      const focal: Point = { x: 300, y: 200 };

      // At top boundary 2.00
      let vpTop: ViewportState = { zoom: 2.00, panX: 50, panY: 100 };
      for (let i = 0; i < 2000; i++) {
        const nextZoom = quantizeWheelZoom(vpTop.zoom, -120);
        expect(nextZoom).toBe(2.00);
        vpTop = computeZoomTransform(vpTop, focal, nextZoom);
      }
      expect(vpTop).toEqual({ zoom: 2.00, panX: 50, panY: 100 });

      // At bottom boundary 0.10
      let vpBottom: ViewportState = { zoom: 0.10, panX: -20, panY: -40 };
      for (let i = 0; i < 2000; i++) {
        const nextZoom = quantizeWheelZoom(vpBottom.zoom, 120);
        expect(nextZoom).toBe(0.10);
        vpBottom = computeZoomTransform(vpBottom, focal, nextZoom);
      }
      expect(vpBottom).toEqual({ zoom: 0.10, panX: -20, panY: -40 });
    });

    it('C2.4: simulates Brownian cursor tremor during wheel zooming without divergence or NaN', () => {
      let vp: ViewportState = { zoom: 1.00, panX: 0, panY: 0 };
      const cursor: Point = { x: 500, y: 400 };

      for (let i = 0; i < 10000; i++) {
        // Tremor jitter: small random displacement ±2px
        cursor.x += (Math.random() - 0.5) * 4;
        cursor.y += (Math.random() - 0.5) * 4;

        const deltaY = (Math.random() - 0.5) * 800;
        const targetZoom = quantizeWheelZoom(vp.zoom, deltaY);

        const imgBefore = screenToImage(cursor, vp);
        vp = computeZoomTransform(vp, cursor, targetZoom);
        const screenAfter = imageToScreen(imgBefore, vp);

        expect(Number.isFinite(vp.zoom)).toBe(true);
        expect(Number.isFinite(vp.panX)).toBe(true);
        expect(Number.isFinite(vp.panY)).toBe(true);
        expect(screenAfter.x).toBeCloseTo(cursor.x, 4);
        expect(screenAfter.y).toBeCloseTo(cursor.y, 4);
      }
    });
  });

  // =========================================================================
  // 3. Live CanvasWorkspace Component Intra-Frame Storming & Jitter
  // =========================================================================
  describe('3. Live CanvasWorkspace Component Jitter & Event Storming', () => {
    it('C3.1: correctly steps through full ladder on synchronous intra-frame wheel storming', () => {
      renderCanvas({
        image: mockBaseImage,
        viewport: { zoom: 0.10, panX: 0, panY: 0 },
      });

      const container = screen.getByTestId('canvas-workspace-container');
      const focalScreen = { clientX: 500, clientY: 400 };

      // Dispatch 9 consecutive synchronous wheel zoom-in events in a burst
      act(() => {
        for (let i = 0; i < 9; i++) {
          fireEvent.wheel(container, {
            ...focalScreen,
            deltaY: -120,
          });
        }
      });

      // HUD should show 200% (the top of the ladder)
      const hudLevel = screen.getByTestId('hud-zoom-level');
      expect(hudLevel.textContent).toBe('200%');

      // Dispatch 9 consecutive synchronous wheel zoom-out events in a burst
      act(() => {
        for (let i = 0; i < 9; i++) {
          fireEvent.wheel(container, {
            ...focalScreen,
            deltaY: 120,
          });
        }
      });

      expect(hudLevel.textContent).toBe('10%');
    });

    it('C3.2: withstands 200 rapid alternating wheel ticks in live component with zero focal drift', () => {
      renderCanvas({
        image: mockBaseImage,
        viewport: { zoom: 1.00, panX: 100, panY: 80 },
      });

      const container = screen.getByTestId('canvas-workspace-container');
      const focalPoint = { clientX: 600, clientY: 450 };

      act(() => {
        for (let i = 0; i < 200; i++) {
          fireEvent.wheel(container, {
            ...focalPoint,
            deltaY: i % 2 === 0 ? -120 : 120,
          });
        }
      });

      const hudLevel = screen.getByTestId('hud-zoom-level');
      expect(hudLevel.textContent).toBe('100%');

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      // Should return to exactly scale(1) and original pan
      expect(transformLayer.style.transform).toContain('scale(1)');
      expect(transformLayer.style.transform).toContain('100px, 80px');
    });

    it('C3.3: ignores pure horizontal scroll (deltaY = 0) without triggering viewport updates', () => {
      renderCanvas({
        image: mockBaseImage,
        viewport: { zoom: 1.00, panX: 150, panY: 100 },
      });

      const container = screen.getByTestId('canvas-workspace-container');
      const transformLayer = screen.getByTestId('canvas-transform-layer');
      const originalTransform = transformLayer.style.transform;

      act(() => {
        // Horizontal scroll: deltaX = 50, deltaY = 0
        fireEvent.wheel(container, {
          clientX: 400,
          clientY: 300,
          deltaX: 50,
          deltaY: 0,
        });
      });

      expect(transformLayer.style.transform).toBe(originalTransform);
    });

    it('C3.4: handles saturated wheeling past ladder limits (200% and 10%) without state corruption', () => {
      renderCanvas({
        image: mockBaseImage,
        viewport: { zoom: 2.00, panX: 250, panY: 150 },
      });

      const container = screen.getByTestId('canvas-workspace-container');
      const transformLayer = screen.getByTestId('canvas-transform-layer');
      const initialTransform = transformLayer.style.transform;

      act(() => {
        for (let i = 0; i < 50; i++) {
          fireEvent.wheel(container, {
            clientX: 500,
            clientY: 400,
            deltaY: -500, // over-scroll in
          });
        }
      });

      // Layer transform must remain identical
      expect(transformLayer.style.transform).toBe(initialTransform);
      expect(screen.getByTestId('hud-zoom-level').textContent).toBe('200%');
    });

    it('C3.5: handles off-canvas cursor coordinates during wheel events gracefully', () => {
      renderCanvas({
        image: mockBaseImage,
        viewport: { zoom: 1.00, panX: 0, panY: 0 },
      });

      const container = screen.getByTestId('canvas-workspace-container');

      // Cursor outside container (e.g. -500, -200)
      act(() => {
        fireEvent.wheel(container, {
          clientX: -500,
          clientY: -200,
          deltaY: -100,
        });
      });

      const hudLevel = screen.getByTestId('hud-zoom-level');
      expect(hudLevel.textContent).toBe('125%');

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer.style.transform).toContain('scale(1.25)');
    });
  });

  // =========================================================================
  // 4. Quantization Ladder Monotonicity & Step Integrity
  // =========================================================================
  describe('4. Ladder Monotonicity & Step Integrity', () => {
    it('C4.1: single wheel burst never advances more than one preset tier', () => {
      const extremeDeltas = [-10, -50, -100, -120, -500, -10000, -999999];

      for (const delta of extremeDeltas) {
        expect(quantizeWheelZoom(1.00, delta)).toBe(1.25);
        expect(quantizeWheelZoom(0.50, delta)).toBe(0.67);
        expect(quantizeWheelZoom(0.10, delta)).toBe(0.25);
      }

      const extremeOutDeltas = [10, 50, 100, 120, 500, 10000, 999999];
      for (const delta of extremeOutDeltas) {
        expect(quantizeWheelZoom(1.00, delta)).toBe(0.75);
        expect(quantizeWheelZoom(0.50, delta)).toBe(0.33);
        expect(quantizeWheelZoom(2.00, delta)).toBe(1.50);
      }
    });

    it('C4.2: preserves strict monotonicity across entire ladder up and down', () => {
      let current = 0.10;
      const ladderUp: number[] = [current];

      while (current < 2.00) {
        const next = quantizeWheelZoom(current, -120);
        expect(next).toBeGreaterThan(current);
        current = next;
        ladderUp.push(current);
      }

      expect(ladderUp).toEqual([0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00]);

      const ladderDown: number[] = [current];
      while (current > 0.10) {
        const next = quantizeWheelZoom(current, 120);
        expect(next).toBeLessThan(current);
        current = next;
        ladderDown.push(current);
      }

      expect(ladderDown).toEqual([2.00, 1.50, 1.25, 1.00, 0.75, 0.67, 0.50, 0.33, 0.25, 0.10]);
    });
  });
});
