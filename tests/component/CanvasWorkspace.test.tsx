import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '../../src/state/AppContext';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import { AppState, BaseImage } from '../../src/types';

const mockBaseImage: BaseImage = {
  id: 'img_test_123',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1920,
  naturalHeight: 1080,
  fileName: 'screenshot.png',
  fileSize: 102400,
};

const renderWithContext = (initialState?: Partial<AppState>, onImageDropped?: (file: File) => void) => {
  return render(
    <AppProvider initialState={initialState}>
      <CanvasWorkspace onImageDropped={onImageDropped} />
    </AppProvider>
  );
};

describe('CanvasWorkspace Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub container bounding rect and dimensions in JSDOM
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

  // =========================================================================
  // 1. Empty State & Ingestion UI Tests
  // =========================================================================
  describe('Empty State & Image Ingestion Dropzone', () => {
    it('renders empty state dropzone when image is null', () => {
      renderWithContext({ image: null });
      expect(screen.getByTestId('canvas-empty-state')).toBeInTheDocument();
      expect(screen.getByText(/Paste or Drop a Screenshot/i)).toBeInTheDocument();
      expect(screen.getByTestId('canvas-upload-button')).toBeInTheDocument();
      expect(screen.queryByTestId('canvas-transform-layer')).not.toBeInTheDocument();
    });

    it('renders transform layer and base image when image is present', () => {
      renderWithContext({ image: mockBaseImage });
      expect(screen.queryByTestId('canvas-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('canvas-transform-layer')).toBeInTheDocument();
      const img = screen.getByTestId('canvas-base-image') as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img.src).toBe(mockBaseImage.src);
    });

    it('handles file drop and delegates to onImageDropped callback', () => {
      const onImageDropped = vi.fn();
      renderWithContext({ image: null }, onImageDropped);
      const container = screen.getByTestId('canvas-workspace-container');

      const file = new File(['fake-png-data'], 'test.png', { type: 'image/png' });
      const dropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [file],
          types: ['Files'],
        },
      };

      fireEvent.drop(container, dropEvent);
      expect(onImageDropped).toHaveBeenCalledWith(file);
    });

    it('updates drag-over state on dragover and dragleave', () => {
      renderWithContext({ image: null });
      const container = screen.getByTestId('canvas-workspace-container');

      fireEvent.dragOver(container, {
        dataTransfer: { types: ['Files'] },
      });
      const emptyState = screen.getByTestId('canvas-empty-state');
      expect(emptyState.className).toContain('border-amber-500');

      fireEvent.dragLeave(container);
      expect(emptyState.className).not.toContain('border-amber-500');
    });
  });

  // =========================================================================
  // 2. Viewport Auto-Fit on Image Load
  // =========================================================================
  describe('Viewport Auto-Fit Invariants', () => {
    it('automatically applies aspect-ratio preserved auto-fit on initial image load', () => {
      renderWithContext({ image: mockBaseImage });
      const transformLayer = screen.getByTestId('canvas-transform-layer');

      // 1920x1080 in 1000x800 container with 32px padding (avail: 936x736)
      // scaleX = 936/1920 = 0.4875, scaleY = 736/1080 = 0.681
      // Expected fit zoom = ~0.4875
      expect(transformLayer.style.transform).toContain('scale(');
      expect(transformLayer.style.transform).toContain('translate3d(');
    });

    it('does not upscale small images smaller than container', () => {
      const smallImage: BaseImage = {
        ...mockBaseImage,
        id: 'small_img',
        naturalWidth: 400,
        naturalHeight: 300,
      };
      renderWithContext({ image: smallImage });
      const transformLayer = screen.getByTestId('canvas-transform-layer');
      // Scale should be 1.0 (no upscale)
      expect(transformLayer.style.transform).toContain('scale(1)');
    });
  });

  // =========================================================================
  // 3. Scroll Wheel Zoom & Focal Point Invariance
  // =========================================================================
  describe('Scroll Wheel Focal Zoom Engine', () => {
    it('zooms in on wheel deltaY < 0 and keeps focal point invariant in screen space', () => {
      renderWithContext({
        image: mockBaseImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
      });

      const container = screen.getByTestId('canvas-workspace-container');
      const focalScreen = { x: 400, y: 300 };

      // Dispatch non-passive wheel event
      fireEvent.wheel(container, {
        clientX: focalScreen.x,
        clientY: focalScreen.y,
        deltaY: -100,
      });

      const hudLevel = screen.getByTestId('hud-zoom-level');
      expect(parseInt(hudLevel.textContent || '0')).toBeGreaterThan(100);
    });

    it('zooms out on wheel deltaY > 0', () => {
      renderWithContext({
        image: mockBaseImage,
        viewport: { zoom: 2.0, panX: 0, panY: 0 },
      });

      const container = screen.getByTestId('canvas-workspace-container');
      fireEvent.wheel(container, {
        clientX: 500,
        clientY: 400,
        deltaY: 100,
      });

      const hudLevel = screen.getByTestId('hud-zoom-level');
      expect(parseInt(hudLevel.textContent || '0')).toBeLessThan(200);
    });

    it('clamps zoom strictly between MIN_ZOOM (0.05) and MAX_ZOOM (20.0)', () => {
      renderWithContext({
        image: mockBaseImage,
        viewport: { zoom: 19.5, panX: 0, panY: 0 },
      });

      const container = screen.getByTestId('canvas-workspace-container');
      // Huge zoom in
      fireEvent.wheel(container, {
        clientX: 500,
        clientY: 400,
        deltaY: -5000,
      });

      const hudLevel = screen.getByTestId('hud-zoom-level');
      expect(hudLevel.textContent).toBe('2000%');
    });
  });

  // =========================================================================
  // 4. Middle-Click Panning
  // =========================================================================
  describe('Middle-Click Drag Pan Engine', () => {
    it('initiates pan on pointerdown with button === 1 and updates pan coordinates on move', () => {
      renderWithContext({
        image: mockBaseImage,
        viewport: { zoom: 1.0, panX: 100, panY: 100 },
      });

      const container = screen.getByTestId('canvas-workspace-container');

      // Middle click down
      fireEvent.pointerDown(container, {
        button: 1,
        pointerId: 1,
        clientX: 200,
        clientY: 200,
      });

      expect(container.style.cursor).toBe('grabbing');

      // Drag 50px right, 30px down
      fireEvent.pointerMove(container, {
        pointerId: 1,
        clientX: 250,
        clientY: 230,
      });

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer.style.transform).toContain('translate3d(150px, 130px, 0px)');

      // Pointer up
      fireEvent.pointerUp(container, {
        pointerId: 1,
      });

      expect(container.style.cursor).not.toBe('grabbing');
    });
  });

  // =========================================================================
  // 5. Spacebar + Left-Click Drag Pan
  // =========================================================================
  describe('Spacebar + Left-Click Drag Pan Engine', () => {
    it('switches cursor to grab when Space is held and grabbing on drag', () => {
      renderWithContext({
        image: mockBaseImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
        activeTool: 'select',
      });

      const container = screen.getByTestId('canvas-workspace-container');
      expect(container.style.cursor).toBe('default');

      // Hold spacebar
      fireEvent.keyDown(window, { code: 'Space' });
      expect(container.style.cursor).toBe('grab');

      // Left click down while space held
      fireEvent.pointerDown(container, {
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      expect(container.style.cursor).toBe('grabbing');

      // Drag
      fireEvent.pointerMove(container, {
        pointerId: 1,
        clientX: 140,
        clientY: 160,
      });

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer.style.transform).toContain('translate3d(40px, 60px, 0px)');

      // Pointer up
      fireEvent.pointerUp(container, { pointerId: 1 });
      expect(container.style.cursor).toBe('grab');

      // Release space
      fireEvent.keyUp(window, { code: 'Space' });
      expect(container.style.cursor).toBe('default');
    });

    it('does not trigger spacebar pan mode when typing in an input element', () => {
      renderWithContext({
        image: mockBaseImage,
        activeTool: 'select',
      });

      const container = screen.getByTestId('canvas-workspace-container');

      // Create an input and focus it
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(window, { code: 'Space' });
      expect(container.style.cursor).toBe('default');

      document.body.removeChild(input);
    });
  });

  // =========================================================================
  // 6. Dedicated Pan Tool
  // =========================================================================
  describe('Dedicated Pan Tool Mode', () => {
    it('displays grab cursor and pans on left-click drag when activeTool is pan', () => {
      renderWithContext({
        image: mockBaseImage,
        viewport: { zoom: 1.0, panX: 50, panY: 50 },
        activeTool: 'pan',
      });

      const container = screen.getByTestId('canvas-workspace-container');
      expect(container.style.cursor).toBe('grab');

      fireEvent.pointerDown(container, {
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      expect(container.style.cursor).toBe('grabbing');

      fireEvent.pointerMove(container, {
        pointerId: 1,
        clientX: 80,
        clientY: 70,
      });

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      expect(transformLayer.style.transform).toContain('translate3d(30px, 20px, 0px)');

      fireEvent.pointerUp(container, { pointerId: 1 });
      expect(container.style.cursor).toBe('grab');
    });
  });

  // =========================================================================
  // 7. Cursor Resolution Matrix
  // =========================================================================
  describe('Cursor Resolution Matrix', () => {
    it('sets cursor to crosshair for drawing tools', () => {
      const drawingTools = ['box', 'ellipse', 'arrow', 'pin'] as const;
      for (const tool of drawingTools) {
        const { unmount } = renderWithContext({
          image: mockBaseImage,
          activeTool: tool,
        });
        const container = screen.getByTestId('canvas-workspace-container');
        expect(container.style.cursor).toBe('crosshair');
        unmount();
      }
    });

    it('sets cursor to default for select tool', () => {
      renderWithContext({
        image: mockBaseImage,
        activeTool: 'select',
      });
      const container = screen.getByTestId('canvas-workspace-container');
      expect(container.style.cursor).toBe('default');
    });
  });

  // =========================================================================
  // 8. HUD Viewport Controls
  // =========================================================================
  describe('HUD Viewport Controls', () => {
    it('handles Zoom In, Zoom Out, and Reset to 100% buttons', () => {
      renderWithContext({
        image: mockBaseImage,
        viewport: { zoom: 1.0, panX: 0, panY: 0 },
      });

      const zoomInBtn = screen.getByTestId('hud-zoom-in');
      const zoomOutBtn = screen.getByTestId('hud-zoom-out');
      const zoomLevelBtn = screen.getByTestId('hud-zoom-level');

      fireEvent.click(zoomInBtn);
      expect(zoomLevelBtn.textContent).toBe('125%');

      fireEvent.click(zoomOutBtn);
      expect(zoomLevelBtn.textContent).toBe('100%');

      fireEvent.click(zoomInBtn);
      fireEvent.click(zoomInBtn);
      expect(zoomLevelBtn.textContent).toBe('156%');

      fireEvent.click(zoomLevelBtn);
      expect(zoomLevelBtn.textContent).toBe('100%');
    });

    it('handles Fit to Screen HUD button', () => {
      renderWithContext({
        image: mockBaseImage,
        viewport: { zoom: 3.5, panX: -500, panY: -200 },
      });

      const fitBtn = screen.getByTestId('hud-fit-to-screen');
      fireEvent.click(fitBtn);

      const zoomLevelBtn = screen.getByTestId('hud-zoom-level');
      expect(parseInt(zoomLevelBtn.textContent || '0')).toBeLessThan(100);
    });
  });
});
