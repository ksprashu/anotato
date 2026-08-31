import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '../../src/state/AppContext';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import { AppState, BaseImage } from '../../src/types';

const mockPanoramicImage: BaseImage = {
  id: 'img_pano_10000_100',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 10000,
  naturalHeight: 100,
  fileName: 'panoramic.png',
  fileSize: 500000,
};

const mockVerticalImage: BaseImage = {
  id: 'img_tall_50_5000',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 50,
  naturalHeight: 5000,
  fileName: 'vertical.png',
  fileSize: 400000,
};

const mockRetina8KImage: BaseImage = {
  id: 'img_retina_8k',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 7680,
  naturalHeight: 4320,
  fileName: 'retina8k.png',
  fileSize: 10485760,
};

const renderWithContext = (initialState?: Partial<AppState>, onImageDropped?: (file: File) => void) => {
  return render(
    <AppProvider initialState={initialState}>
      <CanvasWorkspace onImageDropped={onImageDropped} />
    </AppProvider>
  );
};

describe('CanvasWorkspace Adversarial & Modeless Panning Stress Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 800 });
  });

  // =========================================================================
  // 1. Modeless Panning Combinations & Rapid Pointer Trajectories
  // =========================================================================
  describe('Modeless Panning Multiplexing & Out-of-Bounds Pointer Lifecycles', () => {
    it('handles rapid middle-click drag with 100 fast pointer movements and releases safely', () => {
      renderWithContext({
        image: mockPanoramicImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
      });

      const container = screen.getByTestId('canvas-workspace-container');

      // Pointer down with Middle Click (button = 1)
      fireEvent.pointerDown(container, {
        button: 1,
        pointerId: 42,
        clientX: 500,
        clientY: 400,
      });

      expect(container.style.cursor).toBe('grabbing');

      // Rapidly drag across 100 random subpixel steps
      let currentX = 500;
      let currentY = 400;
      for (let i = 0; i < 100; i++) {
        currentX += (Math.random() - 0.5) * 50;
        currentY += (Math.random() - 0.5) * 50;
        fireEvent.pointerMove(container, {
          pointerId: 42,
          clientX: currentX,
          clientY: currentY,
        });
      }

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer.style.transform).toContain('translate3d(');

      // Pointer Up
      fireEvent.pointerUp(container, { pointerId: 42 });
      expect(container.style.cursor).not.toBe('grabbing');
    });

    it('handles out-of-bounds pointer release via pointercancel and lostpointercapture', () => {
      renderWithContext({
        image: mockPanoramicImage,
        viewport: { zoom: 1.0, panX: 100, panY: 100 },
        activeTool: 'pan',
      });

      const container = screen.getByTestId('canvas-workspace-container');

      // 1. Start pan and cancel via pointerCancel
      fireEvent.pointerDown(container, {
        button: 0,
        pointerId: 99,
        clientX: 200,
        clientY: 200,
      });
      expect(container.style.cursor).toBe('grabbing');

      // Move deeply out of window bounds
      fireEvent.pointerMove(container, {
        pointerId: 99,
        clientX: -9999,
        clientY: -9999,
      });

      // Browser fires pointercancel when cursor exits window
      fireEvent.pointerCancel(container, { pointerId: 99 });
      expect(container.style.cursor).toBe('grab');

      // 2. Start another pan and cancel via lostPointerCapture
      fireEvent.pointerDown(container, {
        button: 0,
        pointerId: 100,
        clientX: 300,
        clientY: 300,
      });
      expect(container.style.cursor).toBe('grabbing');

      // Lost pointer capture event via React Testing Library helper
      fireEvent.lostPointerCapture(container, { pointerId: 100 });
      expect(container.style.cursor).toBe('grab');
    });

    it('seamlessly transitions between Spacebar holding and active middle click without deadlock', () => {
      renderWithContext({
        image: mockVerticalImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
        activeTool: 'box',
      });

      const container = screen.getByTestId('canvas-workspace-container');
      expect(container.style.cursor).toBe('crosshair');

      // 1. Press Space -> cursor becomes grab
      fireEvent.keyDown(window, { code: 'Space' });
      expect(container.style.cursor).toBe('grab');

      // 2. Start Space+LeftClick drag -> cursor becomes grabbing
      fireEvent.pointerDown(container, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      expect(container.style.cursor).toBe('grabbing');

      fireEvent.pointerMove(container, { pointerId: 1, clientX: 150, clientY: 120 });
      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer.style.transform).toContain('translate3d(50px, 20px, 0px)');

      // 3. User releases Space while pointer is still down
      fireEvent.keyUp(window, { code: 'Space' });
      // Still dragging since pointer is down
      expect(container.style.cursor).toBe('grabbing');

      // Move more
      fireEvent.pointerMove(container, { pointerId: 1, clientX: 200, clientY: 160 });
      expect(transformLayer.style.transform).toContain('translate3d(100px, 60px, 0px)');

      // 4. Pointer up -> cursor reverts to tool (crosshair)
      fireEvent.pointerUp(container, { pointerId: 1 });
      expect(container.style.cursor).toBe('crosshair');
    });

    it('defends against spacebar hijacking when typing inside input and textarea elements', () => {
      renderWithContext({
        image: mockVerticalImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
        activeTool: 'select',
      });

      const container = screen.getByTestId('canvas-workspace-container');

      // 1. Input element
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      expect(document.activeElement).toBe(input);

      fireEvent.keyDown(window, { code: 'Space' });
      expect(container.style.cursor).toBe('default');
      document.body.removeChild(input);

      // 2. Textarea element
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      expect(document.activeElement).toBe(textarea);

      fireEvent.keyDown(window, { code: 'Space' });
      expect(container.style.cursor).toBe('default');
      document.body.removeChild(textarea);
    });

    it('resets spacebar state on window blur', () => {
      renderWithContext({
        image: mockVerticalImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
        activeTool: 'select',
      });

      const container = screen.getByTestId('canvas-workspace-container');

      fireEvent.keyDown(window, { code: 'Space' });
      expect(container.style.cursor).toBe('grab');

      // Window blur (e.g. Alt-Tab or clicking out)
      fireEvent.blur(window);
      expect(container.style.cursor).toBe('default');
    });

    it('simulates multi-touch pinch gesture with 2 fingers zooming dynamically', () => {
      renderWithContext({
        image: mockRetina8KImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
      });

      const container = screen.getByTestId('canvas-workspace-container');

      // Finger 1 down at (400, 300)
      fireEvent.pointerDown(container, { pointerId: 10, clientX: 400, clientY: 300 });
      // Finger 2 down at (600, 300) -> Initial distance = 200px
      fireEvent.pointerDown(container, { pointerId: 11, clientX: 600, clientY: 300 });

      // Move fingers apart (pinch zoom out / enlarge) -> distance = 400px (2x ratio)
      fireEvent.pointerMove(container, { pointerId: 10, clientX: 300, clientY: 300 });
      fireEvent.pointerMove(container, { pointerId: 11, clientX: 700, clientY: 300 });

      const hudLevel = screen.getByTestId('hud-zoom-level');
      expect(parseInt(hudLevel.textContent || '0')).toBeGreaterThan(100);

      // Release finger 1
      fireEvent.pointerUp(container, { pointerId: 10 });
      // Release finger 2
      fireEvent.pointerUp(container, { pointerId: 11 });
    });
  });

  // =========================================================================
  // 2. High Frequency Wheel Zoom Oscillations in Component Environment
  // =========================================================================
  describe('High Frequency Wheel Zoom Oscillations in Component Environment', () => {
    it('survives 200 rapid non-passive wheel events without throwing or entering invalid state', () => {
      renderWithContext({
        image: mockPanoramicImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
      });

      const container = screen.getByTestId('canvas-workspace-container');

      for (let i = 0; i < 200; i++) {
        const deltaY = i % 2 === 0 ? -120 : 120;
        fireEvent.wheel(container, {
          clientX: 600,
          clientY: 400,
          deltaY,
          ctrlKey: i % 4 === 0,
        });
      }

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer).toBeInTheDocument();
      expect(transformLayer.style.transform).toContain('scale(');
      expect(transformLayer.style.transform).toContain('translate3d(');
    });
  });

  // =========================================================================
  // 3. Extreme Aspect Ratio Rendering & HUD Buttons
  // =========================================================================
  describe('Extreme Aspect Ratio Component Rendering & HUD Interaction', () => {
    it('renders 10,000x100 panoramic strip with correct transform dimensions', () => {
      renderWithContext({ image: mockPanoramicImage });

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer.style.width).toBe('10000px');
      expect(transformLayer.style.height).toBe('100px');

      const img = screen.getByTestId('canvas-base-image') as HTMLImageElement;
      expect(img.width).toBe(10000);
      expect(img.height).toBe(100);
    });

    it('renders 50x5,000 vertical column with correct transform dimensions', () => {
      renderWithContext({ image: mockVerticalImage });

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer.style.width).toBe('50px');
      expect(transformLayer.style.height).toBe('5000px');
    });

    it('renders 8K 7,680x4,320 retina screenshot and toggles pixelated mode at zoom >= 3.0', () => {
      renderWithContext({
        image: mockRetina8KImage,
        viewport: { zoom: 3.5, panX: 0, panY: 0 },
      });

      const img = screen.getByTestId('canvas-base-image') as HTMLImageElement;
      expect(img.style.imageRendering).toBe('pixelated');
    });

    it('HUD Fit to Screen and Reset 1:1 correctly update extreme aspect ratio viewports', () => {
      renderWithContext({
        image: mockPanoramicImage,
        viewport: { zoom: 5.0, panX: -2000, panY: 100 },
      });

      const fitBtn = screen.getByTestId('hud-fit-to-screen');
      fireEvent.click(fitBtn);

      const zoomLevelBtn = screen.getByTestId('hud-zoom-level');
      // For panoramic 10000x100 in 1200x800, fit zoom is ~0.11 -> 11%
      expect(parseInt(zoomLevelBtn.textContent || '0')).toBeLessThan(50);

      const reset100Btn = screen.getByTestId('hud-reset-100');
      fireEvent.click(reset100Btn);
      expect(zoomLevelBtn.textContent).toBe('100%');
    });
  });
});
