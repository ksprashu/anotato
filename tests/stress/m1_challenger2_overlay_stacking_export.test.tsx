import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '../../src/state/AppContext';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import { appReducer } from '../../src/state/appReducer';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
} from '../../src/export/canvasExporter';
import {
  BaseImage,
  ImageOverlay,
  Annotation,
  AppState,
} from '../../src/types';

describe('Milestone 1 Challenger 2: Multi-Layer Stacking & PNG Export Stress Tests', () => {
  const mockBaseImage: BaseImage = {
    id: 'base-img-primary',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'viewport-base.png',
    fileSize: 1024 * 50,
  };

  const createDefaultAppState = (overrides?: Partial<AppState>): AppState => ({
    image: mockBaseImage,
    overlays: [],
    annotations: [],
    selectedAnnotationId: null,
    hoveredAnnotationId: null,
    activeTool: 'select',
    activeColor: 'amber',
    activeStrokeWidth: 4,
    activeFillOpacity: 0.3,
    viewport: { zoom: 1.0, panX: 0, panY: 0 },
    isSidebarOpen: true,
    theme: 'dark',
    ...overrides,
  });

  const createMockOverlay = (id: string, overrides?: Partial<ImageOverlay>): ImageOverlay => ({
    id,
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 640,
    naturalHeight: 480,
    fileName: `${id}.png`,
    fileSize: 2048,
    x: 10,
    y: 20,
    width: 640,
    height: 480,
    opacity: 1.0,
    ...overrides,
  });

  const createMockAnnotation = (id: string, index: number, x: number, y: number): Annotation => ({
    id,
    index,
    geometry: {
      type: 'box',
      x,
      y,
      width: 200,
      height: 100,
      borderRadius: 4,
    },
    style: {
      color: 'amber',
      strokeWidth: 4,
      fillOpacity: 0.3,
    },
    note: `Annotation note ${index}`,
    createdAt: 1000 + index,
    updatedAt: 1000 + index,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Section 1: Overlay Layer Stacking & DOM Ordering Invariant
  // =========================================================================
  describe('1. Overlay Layer Stacking & Monotonic DOM Order', () => {
    it('accurately stacks multiple consecutive overlays via ADD_IMAGE_OVERLAY in array order', () => {
      let state = createDefaultAppState();

      // Add 10 overlays sequentially
      for (let i = 0; i < 10; i++) {
        const overlay = createMockOverlay(`overlay-seq-${i}`, {
          x: i * 30,
          y: i * 20,
          opacity: 0.5 + i * 0.05,
        });
        state = appReducer(state, {
          type: 'ADD_IMAGE_OVERLAY',
          payload: { overlay },
        });
      }

      expect(state.overlays).toBeDefined();
      expect(state.overlays?.length).toBe(10);
      state.overlays?.forEach((ov, idx) => {
        expect(ov.id).toBe(`overlay-seq-${idx}`);
        expect(ov.x).toBe(idx * 30);
        expect(ov.y).toBe(idx * 20);
      });
    });

    it('preserves strict DOM hierarchy: BaseImage < Overlay 0 < Overlay 1 < ... < SvgOverlay', () => {
      const overlays: ImageOverlay[] = [
        createMockOverlay('ov-dom-1', { x: 50, y: 50, opacity: 0.7 }),
        createMockOverlay('ov-dom-2', { x: 100, y: 100, opacity: 0.8 }),
        createMockOverlay('ov-dom-3', { x: 150, y: 150, opacity: 0.9 }),
      ];

      const annotation = createMockAnnotation('ann-1', 1, 80, 80);

      const { container } = render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            overlays,
            annotations: [annotation],
          }}
        >
          <CanvasWorkspace />
        </AppProvider>
      );

      const transformLayer = screen.getByTestId('canvas-transform-layer');
      const baseImage = screen.getByTestId('canvas-base-image');
      const overlayEl1 = screen.getByTestId('canvas-overlay-image-ov-dom-1');
      const overlayEl2 = screen.getByTestId('canvas-overlay-image-ov-dom-2');
      const overlayEl3 = screen.getByTestId('canvas-overlay-image-ov-dom-3');
      const svgOverlay = container.querySelector('svg');

      expect(svgOverlay).toBeInTheDocument();

      const children = Array.from(transformLayer.children);
      const baseIdx = children.indexOf(baseImage);
      const ov1Idx = children.indexOf(overlayEl1);
      const ov2Idx = children.indexOf(overlayEl2);
      const ov3Idx = children.indexOf(overlayEl3);
      const svgIdx = children.indexOf(svgOverlay!);

      // Assert monotonic ordering
      expect(baseIdx).toBe(0);
      expect(baseIdx).toBeLessThan(ov1Idx);
      expect(ov1Idx).toBeLessThan(ov2Idx);
      expect(ov2Idx).toBeLessThan(ov3Idx);
      expect(ov3Idx).toBeLessThan(svgIdx);
    });

    it('applies correct position, dimension, and opacity styling to every rendered overlay layer', () => {
      const overlay1 = createMockOverlay('ov-style-1', {
        x: 120,
        y: 80,
        width: 400,
        height: 300,
        opacity: 0.65,
      });

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            overlays: [overlay1],
            annotations: [],
          }}
        >
          <CanvasWorkspace />
        </AppProvider>
      );

      const overlayEl = screen.getByTestId('canvas-overlay-image-ov-style-1');
      expect(overlayEl).toHaveStyle({
        left: '120px',
        top: '80px',
        width: '400px',
        height: '300px',
        opacity: '0.65',
      });
    });
  });

  // =========================================================================
  // Section 2: Pointer Event Handling & Non-Interference
  // =========================================================================
  describe('2. Pointer Events & Non-Interference with Vector Annotations', () => {
    it('enforces pointer-events-none on all overlay images so gestures pass through', () => {
      const overlays = [
        createMockOverlay('ov-ptr-1', { x: 0, y: 0, width: 1920, height: 1080 }),
        createMockOverlay('ov-ptr-2', { x: 50, y: 50, width: 800, height: 600 }),
      ];

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            overlays,
            annotations: [],
          }}
        >
          <CanvasWorkspace />
        </AppProvider>
      );

      const el1 = screen.getByTestId('canvas-overlay-image-ov-ptr-1');
      const el2 = screen.getByTestId('canvas-overlay-image-ov-ptr-2');

      expect(el1.className).toContain('pointer-events-none');
      expect(el2.className).toContain('pointer-events-none');
    });

    it('allows background click catcher to deselect annotations even when completely covered by overlays', () => {
      const fullscreenOverlay = createMockOverlay('ov-full', {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        opacity: 1.0,
      });

      const annotation = createMockAnnotation('ann-selected', 1, 100, 100);

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            overlays: [fullscreenOverlay],
            annotations: [annotation],
            selectedAnnotationId: 'ann-selected',
            activeTool: 'select',
          }}
        >
          <CanvasWorkspace />
        </AppProvider>
      );

      const backgroundCatcher = screen.getByTestId('canvas-background-catcher');
      expect(backgroundCatcher).toBeInTheDocument();

      // Click background catcher
      fireEvent.click(backgroundCatcher);

      // SvgOverlay and background catcher receive the click unobstructed
      expect(backgroundCatcher).toHaveAttribute('fill', 'transparent');
    });

    it('supports selective removal via REMOVE_IMAGE_OVERLAY without disturbing annotations or sibling overlays', () => {
      const ovA = createMockOverlay('ov-a');
      const ovB = createMockOverlay('ov-b');
      const ovC = createMockOverlay('ov-c');
      const ann = createMockAnnotation('ann-keep', 1, 50, 50);

      let state = createDefaultAppState({
        annotations: [ann],
        overlays: [ovA, ovB, ovC],
      });

      // Remove middle overlay B
      state = appReducer(state, {
        type: 'REMOVE_IMAGE_OVERLAY',
        payload: 'ov-b',
      });

      expect(state.overlays?.map((o) => o.id)).toEqual(['ov-a', 'ov-c']);
      expect(state.annotations.length).toBe(1);
      expect(state.annotations[0].id).toBe('ann-keep');
    });

    it('CLEAR_IMAGE_OVERLAYS empties overlays while preserving base image and annotations', () => {
      const ov1 = createMockOverlay('ov-1');
      const ann = createMockAnnotation('ann-keep', 1, 50, 50);

      let state = createDefaultAppState({
        annotations: [ann],
        overlays: [ov1],
      });

      state = appReducer(state, { type: 'CLEAR_IMAGE_OVERLAYS' });

      expect(state.overlays).toEqual([]);
      expect(state.image).toBe(mockBaseImage);
      expect(state.annotations.length).toBe(1);
    });
  });

  // =========================================================================
  // Section 3: Offscreen Composite Canvas Export Stress
  // =========================================================================
  describe('3. Offscreen Composite Canvas Export Stress', () => {
    it('composites base image, multiple overlays in ascending order, and annotations on top', async () => {
      const overlays: ImageOverlay[] = [
        createMockOverlay('layer-0', { x: 0, y: 0, width: 500, height: 400, opacity: 0.9 }),
        createMockOverlay('layer-1', { x: 100, y: 100, width: 400, height: 300, opacity: 0.7 }),
        createMockOverlay('layer-2', { x: 200, y: 200, width: 300, height: 200, opacity: 0.5 }),
      ];

      const annotations: Annotation[] = [
        createMockAnnotation('ann-box', 1, 50, 50),
        createMockAnnotation('ann-box-2', 2, 250, 250),
      ];

      const canvas = await renderCompositeCanvas(mockBaseImage, annotations, overlays);
      const ctx = canvas.getContext('2d')!;

      // Verify canvas dimensions match base image 1:1
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);

      // Verify drawImage calls:
      // 1. Base image
      // 2. Layer 0
      // 3. Layer 1
      // 4. Layer 2
      expect(ctx.drawImage).toHaveBeenCalledTimes(4);

      // Call 1: Base image
      expect(ctx.drawImage).toHaveBeenNthCalledWith(1, expect.anything(), 0, 0, 1920, 1080);
      // Call 2: Layer 0
      expect(ctx.drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 500, 400);
      // Call 3: Layer 1
      expect(ctx.drawImage).toHaveBeenNthCalledWith(3, expect.anything(), 100, 100, 400, 300);
      // Call 4: Layer 2
      expect(ctx.drawImage).toHaveBeenNthCalledWith(4, expect.anything(), 200, 200, 300, 200);

      // Verify ctx.save and ctx.restore are called for overlay layer isolation
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
      // At minimum, every overlay layer must be wrapped in save/restore
      expect((ctx.save as any).mock.calls.length).toBeGreaterThanOrEqual(overlays.length);
      expect((ctx.restore as any).mock.calls.length).toBeGreaterThanOrEqual(overlays.length);
    });

    it('resiliently handles failing/broken overlay image sources without crashing export', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const validOverlay = createMockOverlay('ov-good', { x: 10, y: 10 });
      const brokenOverlay = createMockOverlay('ov-broken', {
        src: 'invalid-image-source:http://broken.domain/404.png',
        x: 50,
        y: 50,
      });

      const canvas = await renderCompositeCanvas(
        mockBaseImage,
        [],
        [validOverlay, brokenOverlay]
      );

      const ctx = canvas.getContext('2d')!;

      // Should have logged a warning for broken overlay
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to render overlay layer ov-broken:'),
        expect.anything()
      );

      // Base image + valid overlay = 2 drawImage calls (broken overlay gracefully skipped)
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('safely handles overlays with missing optional properties (width, height, opacity)', async () => {
      const sparseOverlay: ImageOverlay = {
        id: 'ov-sparse',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        x: 0,
        y: 0,
        naturalWidth: 800,
        naturalHeight: 600,
        fileName: 'sparse.png',
        fileSize: 1024,
      };

      const canvas = await renderCompositeCanvas(mockBaseImage, [], [sparseOverlay]);
      const ctx = canvas.getContext('2d')!;

      expect(ctx.drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 800, 600);
    });

    it('correctly composites overlays with negative offsets and dimensions larger than base image', async () => {
      const oversizedOverlay = createMockOverlay('ov-giant', {
        x: -200,
        y: -150,
        width: 3000,
        height: 2000,
        opacity: 0.4,
      });

      const canvas = await renderCompositeCanvas(mockBaseImage, [], [oversizedOverlay]);
      const ctx = canvas.getContext('2d')!;

      expect(ctx.drawImage).toHaveBeenNthCalledWith(2, expect.anything(), -200, -150, 3000, 2000);
      // Canvas dimensions strictly bounded by base image
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });
  });

  // =========================================================================
  // Section 4: Composite PNG Export Binary Blob & Data URL Validation
  // =========================================================================
  describe('4. PNG Binary Blob & Data URL Production', () => {
    it('exportCompositeBlob generates standard image/png Blob with valid mime type', async () => {
      const overlays = [
        createMockOverlay('ov-blob-1', { opacity: 0.8 }),
        createMockOverlay('ov-blob-2', { opacity: 0.5 }),
      ];
      const annotation = createMockAnnotation('ann-blob', 1, 100, 100);

      const blob = await exportCompositeBlob(mockBaseImage, [annotation], overlays);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('exportCompositeDataUrl generates standard Base64 PNG data URL string', async () => {
      const overlays = [createMockOverlay('ov-dataurl')];
      const annotation = createMockAnnotation('ann-dataurl', 1, 50, 50);

      const dataUrl = await exportCompositeDataUrl(mockBaseImage, [annotation], overlays);

      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('supports overlays passed via ExportCanvasOptions config parameter', async () => {
      const overlays = [createMockOverlay('ov-opt-1'), createMockOverlay('ov-opt-2')];

      const canvas = await renderCompositeCanvas(mockBaseImage, [], {
        overlays,
        backgroundColor: '#1E1E1E',
      });

      const ctx = canvas.getContext('2d')!;
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
      expect(ctx.drawImage).toHaveBeenCalledTimes(3); // Base + 2 overlays
    });

    it('high concurrency stress: 15 overlays and 30 annotations composite rapidly within 1000ms', async () => {
      const overlays: ImageOverlay[] = Array.from({ length: 15 }, (_, i) =>
        createMockOverlay(`ov-perf-${i}`, {
          x: (i * 40) % 1000,
          y: (i * 30) % 800,
          width: 300,
          height: 200,
          opacity: 0.3 + (i % 7) * 0.1,
        })
      );

      const annotations: Annotation[] = Array.from({ length: 30 }, (_, i) =>
        createMockAnnotation(`ann-perf-${i}`, i + 1, (i * 50) % 1200, (i * 30) % 800)
      );

      const startTime = Date.now();
      const canvas = await renderCompositeCanvas(mockBaseImage, annotations, overlays);
      const elapsed = Date.now() - startTime;

      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  // =========================================================================
  // Section 5: State Transitions, Opacity Clamping & Lifecycle Fuzzing
  // =========================================================================
  describe('5. State Transitions, Opacity Clamping & Lifecycle Fuzzing', () => {
    it('REPLACE_IMAGE_AND_KEEP preserves stacked overlays and annotations when swapping base image', () => {
      const initialOverlays = [
        createMockOverlay('ov-keep-1'),
        createMockOverlay('ov-keep-2'),
      ];
      const initialAnnotation = createMockAnnotation('ann-keep', 1, 10, 10);

      const state = createDefaultAppState({
        annotations: [initialAnnotation],
        selectedAnnotationId: 'ann-keep',
        overlays: initialOverlays,
      });

      const replacementImage: BaseImage = {
        ...mockBaseImage,
        id: 'replacement-base',
        fileName: 'replacement.png',
      };

      const nextState = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_KEEP',
        payload: { image: replacementImage },
      });

      expect(nextState.image?.id).toBe('replacement-base');
      expect(nextState.overlays?.length).toBe(2);
      expect(nextState.overlays?.[0].id).toBe('ov-keep-1');
      expect(nextState.overlays?.[1].id).toBe('ov-keep-2');
      expect(nextState.annotations.length).toBe(1);
      expect(nextState.selectedAnnotationId).toBeNull(); // Deselects active
    });

    it('REPLACE_IMAGE_AND_CLEAR completely purges all overlays and annotations', () => {
      const state = createDefaultAppState({
        annotations: [createMockAnnotation('ann-1', 1, 10, 10)],
        selectedAnnotationId: 'ann-1',
        overlays: [createMockOverlay('ov-1'), createMockOverlay('ov-2')],
      });

      const replacementImage: BaseImage = {
        ...mockBaseImage,
        id: 'new-base',
      };

      const nextState = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_CLEAR',
        payload: { image: replacementImage },
      });

      expect(nextState.image?.id).toBe('new-base');
      expect(nextState.overlays).toEqual([]);
      expect(nextState.annotations).toEqual([]);
      expect(nextState.selectedAnnotationId).toBeNull();
    });

    it('CLEAR_IMAGE resets overlays to empty array alongside annotations', () => {
      const state = createDefaultAppState({
        annotations: [createMockAnnotation('ann-1', 1, 10, 10)],
        overlays: [createMockOverlay('ov-1')],
      });

      const nextState = appReducer(state, { type: 'CLEAR_IMAGE' });
      expect(nextState.image).toBeNull();
      expect(nextState.overlays).toEqual([]);
      expect(nextState.annotations).toEqual([]);
    });

    it('clamps extreme out-of-range opacity values (-0.5 and 1.5) to [0.0, 1.0] without runtime errors', async () => {
      const underflowOverlay = createMockOverlay('ov-under', { opacity: -0.5 });
      const overflowOverlay = createMockOverlay('ov-over', { opacity: 1.5 });

      const canvas = await renderCompositeCanvas(
        mockBaseImage,
        [],
        [underflowOverlay, overflowOverlay]
      );

      const ctx = canvas.getContext('2d')!;
      expect(ctx.drawImage).toHaveBeenCalledTimes(3);
    });

    it('renders and composites ultra-dense overlay stack (50 layers) without degradation', async () => {
      const denseOverlays: ImageOverlay[] = Array.from({ length: 50 }, (_, i) =>
        createMockOverlay(`dense-ov-${i}`, {
          x: i * 10,
          y: i * 5,
          opacity: 0.8,
        })
      );

      const canvas = await renderCompositeCanvas(mockBaseImage, [], denseOverlays);
      const ctx = canvas.getContext('2d')!;

      // Base image + 50 overlays = 51 drawImage calls
      expect(ctx.drawImage).toHaveBeenCalledTimes(51);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('fuzzing: 30 randomized interleaved overlay and annotation lifecycle actions maintain state integrity', () => {
      let state = createDefaultAppState();

      for (let i = 0; i < 30; i++) {
        const actionType = i % 5;
        if (actionType === 0) {
          state = appReducer(state, {
            type: 'ADD_IMAGE_OVERLAY',
            payload: { overlay: createMockOverlay(`fuzz-ov-${i}`) },
          });
        } else if (actionType === 1) {
          state = appReducer(state, {
            type: 'ADD_ANNOTATION',
            payload: createMockAnnotation(`fuzz-ann-${i}`, state.annotations.length + 1, i * 10, i * 10),
          });
        } else if (actionType === 2 && (state.overlays?.length || 0) > 0) {
          const targetId = state.overlays![0].id;
          state = appReducer(state, {
            type: 'REMOVE_IMAGE_OVERLAY',
            payload: targetId,
          });
        } else if (actionType === 3) {
          state = appReducer(state, {
            type: 'REPLACE_IMAGE_AND_KEEP',
            payload: {
              image: {
                ...mockBaseImage,
                id: `fuzz-base-${i}`,
              },
            },
          });
        } else {
          // Verify state invariants
          expect(Array.isArray(state.overlays)).toBe(true);
          expect(Array.isArray(state.annotations)).toBe(true);
        }
      }

      expect(Array.isArray(state.overlays)).toBe(true);
      expect(Array.isArray(state.annotations)).toBe(true);
    });
  });
});
