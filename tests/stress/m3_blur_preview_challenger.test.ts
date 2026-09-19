import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../../src/state/AppContext';
import { SvgOverlay } from '../../src/components/canvas/SvgOverlay';
import {
  appReducer,
  normalizeBlurGeometry,
  normalizeGeometry,
  createInitialState,
} from '../../src/state/appReducer';
import {
  createInitialHistory,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  isSnapshotEqual,
  TransactionManager,
  MAX_HISTORY_STEPS,
} from '../../src/state/historyManager';
import {
  renderCompositeCanvas,
  bakeBlurFallback,
} from '../../src/export/canvasExporter';
import {
  getResizeHandlePositions,
  hitTestAnnotation,
  applyHandleResize,
  translateGeometry,
} from '../../src/math/geometry';
import { getBadgePositionForShape } from '../../src/math/badges';
import {
  Annotation,
  AnnotationGeometry,
  BaseImage,
  BlurGeometry,
  PresetColor,
  AppState,
  HistorySnapshot,
} from '../../src/types';

const mockScreenshot: BaseImage = {
  id: 'img-stress-blur-4k',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 3840,
  naturalHeight: 2160,
  fileName: 'screenshot-4k.png',
  fileSize: 3840 * 2160 * 4,
};

const PRESET_COLORS_LIST: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];

const renderOverlay = (initialState?: Partial<AppState>) => {
  return render(
    React.createElement(
      AppProvider,
      { initialState },
      React.createElement(SvgOverlay, null)
    )
  );
};

describe('Milestone M3 Empirical Adversarial Challenger: Live Blur Mask & Interactive Preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 3840,
      bottom: 2160,
      width: 3840,
      height: 2160,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  });

  // =========================================================================
  // Suite 1: 50+ Overlapping & Non-Overlapping Blur Annotations Stress
  // =========================================================================
  describe('1. 50+ Overlapping & Non-Overlapping Blur Annotations Stress', () => {
    it('C1.1: Sequentially adds 60 blur annotations spanning disjoint grids and dense clusters with strict continuous 1..N re-indexing', () => {
      let state = createInitialState({ image: mockScreenshot });
      const count = 60;
      const startTime = performance.now();

      for (let i = 1; i <= count; i++) {
        const isCluster = i % 2 === 0;
        const x = isCluster ? 600 + (i % 8) * 20 : 100 + ((i * 59) % 3000);
        const y = isCluster ? 450 + (i % 8) * 20 : 100 + ((i * 37) % 1800);
        const width = 120 + (i % 6) * 15;
        const height = 90 + (i % 5) * 15;
        const color = PRESET_COLORS_LIST[i % PRESET_COLORS_LIST.length];

        state = appReducer(state, {
          type: 'ADD_ANNOTATION',
          payload: {
            id: `blur-stress-${i}`,
            geometry: {
              type: 'blur',
              x,
              y,
              width,
              height,
              borderRadius: 2,
            },
            style: { color, strokeWidth: 3, fillOpacity: 0.15 },
            note: `Confidential Field #${i}`,
          },
        });
      }

      const elapsedMs = performance.now() - startTime;
      expect(elapsedMs).toBeLessThan(500); // Fast sub-500ms state updates

      expect(state.annotations).toHaveLength(count);

      // Verify continuous 1..60 sequence
      for (let i = 0; i < count; i++) {
        expect(state.annotations[i].index).toBe(i + 1);
        expect(state.annotations[i].geometry.type).toBe('blur');
        const geom = state.annotations[i].geometry as BlurGeometry;
        expect(geom.width).toBeGreaterThanOrEqual(0);
        expect(geom.height).toBeGreaterThanOrEqual(0);
      }

      // Delete 20 annotations (every 3rd annotation)
      for (let i = 1; i <= 20; i++) {
        state = appReducer(state, {
          type: 'DELETE_ANNOTATION',
          payload: { id: `blur-stress-${i * 3}` },
        });
      }

      expect(state.annotations).toHaveLength(40);
      for (let i = 0; i < 40; i++) {
        expect(state.annotations[i].index).toBe(i + 1);
      }

      // Reorder: move last annotation (index 40) to index 5
      state = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 39, toIndex: 4 },
      });

      expect(state.annotations).toHaveLength(40);
      for (let i = 0; i < 40; i++) {
        expect(state.annotations[i].index).toBe(i + 1);
      }
    });

    it('C1.2: SvgOverlay component renders 60 blur annotations with individual clipPaths and blurred image slices without desync or missing references', () => {
      const annotations: Annotation[] = Array.from({ length: 60 }, (_, i) => {
        const idx = i + 1;
        return {
          id: `blur-svg-${idx}`,
          index: idx,
          geometry: {
            type: 'blur',
            x: 150 + ((idx * 43) % 3000),
            y: 100 + ((idx * 31) % 1800),
            width: 140,
            height: 90,
            borderRadius: 2,
          },
          style: {
            color: PRESET_COLORS_LIST[idx % PRESET_COLORS_LIST.length],
            strokeWidth: 3,
            fillOpacity: 0.15,
          },
          note: `Sensitive data ${idx}`,
          createdAt: 2000 + idx,
          updatedAt: 2000 + idx,
        };
      });

      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'select',
        annotations,
      });

      // 1. Filter definition
      const filter = container.querySelector('#gaussian-blur');
      expect(filter).not.toBeNull();
      const feBlur = filter?.querySelector('feGaussianBlur');
      expect(feBlur?.getAttribute('stdDeviation')).toBe('10');
      expect(feBlur?.getAttribute('edgeMode')).toBe('duplicate');

      // 2. 60 clipPaths
      const clipPaths = container.querySelectorAll('defs clipPath[id^="blur-clip-blur-svg-"]');
      expect(clipPaths).toHaveLength(60);

      // Verify each clipPath contains rect with non-negative dimensions
      clipPaths.forEach((cp) => {
        const rect = cp.querySelector('rect');
        expect(rect).not.toBeNull();
        expect(Number(rect?.getAttribute('width'))).toBe(140);
        expect(Number(rect?.getAttribute('height'))).toBe(90);
        expect(Number(rect?.getAttribute('rx'))).toBe(2);
      });

      // 3. 60 image slices
      const imageSlices = container.querySelectorAll('image[data-testid^="blur-slice-"]');
      expect(imageSlices).toHaveLength(60);

      imageSlices.forEach((slice, idx) => {
        const annId = `blur-svg-${idx + 1}`;
        expect(slice.getAttribute('filter')).toBe('url(#gaussian-blur)');
        expect(slice.getAttribute('clip-path') || slice.getAttribute('clipPath')).toBe(`url(#blur-clip-${annId})`);
        expect(slice.getAttribute('pointer-events') || slice.getAttribute('pointerEvents')).toBe('none');
        expect(slice.getAttribute('width')).toBe(String(mockScreenshot.naturalWidth));
        expect(slice.getAttribute('height')).toBe(String(mockScreenshot.naturalHeight));
      });

      // 4. 60 vector shape groups
      const shapeGroups = container.querySelectorAll('g[data-testid="shape-blur"]');
      expect(shapeGroups).toHaveLength(60);
    });

    it('C1.3: 2D Canvas Exporter destructively bakes 60 blur regions with strict save/restore stack balance and zero coordinate leaks', async () => {
      const annotations: Annotation[] = Array.from({ length: 60 }, (_, i) => {
        const idx = i + 1;
        return {
          id: `blur-bake-${idx}`,
          index: idx,
          geometry: {
            type: 'blur',
            x: 200 + ((idx * 51) % 3000),
            y: 150 + ((idx * 39) % 1800),
            width: 160,
            height: 110,
            borderRadius: 2,
          },
          style: {
            color: PRESET_COLORS_LIST[idx % PRESET_COLORS_LIST.length],
            strokeWidth: 3,
            fillOpacity: 0.15,
          },
          note: `Secret #${idx}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });

      const canvas = await renderCompositeCanvas(mockScreenshot, annotations);
      const ctx = canvas.getContext('2d')!;

      // Verify save and restore calls balance exactly
      const saveCount = vi.mocked(ctx.save).mock.calls.length;
      const restoreCount = vi.mocked(ctx.restore).mock.calls.length;
      expect(saveCount).toBeGreaterThanOrEqual(60);
      expect(saveCount).toBe(restoreCount);

      // Verify clip called for all 60 blur annotations
      expect(vi.mocked(ctx.clip)).toHaveBeenCalledTimes(60);

      // Base image draw + 60 blur baking drawImage calls
      expect(vi.mocked(ctx.drawImage).mock.calls.length).toBeGreaterThanOrEqual(61);
    });

    it('C1.4: Fallback pixel diffusion bakeBlurFallback handles 60 blur annotations safely without throwing or NaN', () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const mockImg = {
        width: 1920,
        height: 1080,
      } as unknown as HTMLImageElement;

      for (let i = 1; i <= 60; i++) {
        const x = 50 + (i % 10) * 150;
        const y = 50 + (i % 8) * 100;
        const w = 120;
        const h = 80;

        expect(() => {
          bakeBlurFallback(ctx, mockImg, x, y, w, h);
        }).not.toThrow();
      }

      // Verify drawImage was invoked for downscale and upscale
      expect(vi.mocked(ctx.drawImage).mock.calls.length).toBeGreaterThanOrEqual(60);
    });
  });

  // =========================================================================
  // Suite 2: Combined Blur Regions with Spotlight Highlight (Optical Parity)
  // =========================================================================
  describe('2. Combined Blur Regions with Spotlight Highlight Annotations (Optical Parity)', () => {
    it('C2.1: SvgOverlay preserves strict DOM z-index layer ordering: Background (1) -> Blur (1.2) -> Spotlight (1.5) -> Vector Shapes (2)', () => {
      const blurAnn: Annotation = {
        id: 'blur-layer-test',
        index: 1,
        geometry: { type: 'blur', x: 200, y: 200, width: 200, height: 100 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blur note',
        createdAt: 1,
        updatedAt: 1,
      };

      const highlightAnn: Annotation = {
        id: 'hl-layer-test',
        index: 2,
        geometry: { type: 'highlight', x: 500, y: 500, width: 300, height: 200 },
        style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Highlight note',
        createdAt: 2,
        updatedAt: 2,
      };

      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'select',
        annotations: [blurAnn, highlightAnn],
      });

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();

      const bgCatcher = svg?.querySelector('[data-testid="canvas-background-catcher"]');
      const blurSlice = svg?.querySelector('[data-testid="blur-slice-blur-layer-test"]');
      const spotlightBackdrop = svg?.querySelector('[data-testid="spotlight-backdrop"]');
      const blurShape = svg?.querySelector('[data-testid="shape-blur"]');
      const highlightShape = svg?.querySelector('[data-testid="shape-highlight"]');

      expect(bgCatcher).not.toBeNull();
      expect(blurSlice).not.toBeNull();
      expect(spotlightBackdrop).not.toBeNull();
      expect(blurShape).not.toBeNull();
      expect(highlightShape).not.toBeNull();

      // Check document order using compareDocumentPosition
      // Node.DOCUMENT_POSITION_FOLLOWING is 4
      const bgToBlur = bgCatcher!.compareDocumentPosition(blurSlice!);
      expect(bgToBlur & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const blurToSpotlight = blurSlice!.compareDocumentPosition(spotlightBackdrop!);
      expect(blurToSpotlight & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const spotlightToBlurShape = spotlightBackdrop!.compareDocumentPosition(blurShape!);
      expect(spotlightToBlurShape & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const blurShapeToHlShape = blurShape!.compareDocumentPosition(highlightShape!);
      expect(blurShapeToHlShape & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('C2.2: Optical Parity Oracle: Blur region enclosed inside Spotlight Highlight remains undimmed on canvas and in export', async () => {
      // Blur 1 is INSIDE Highlight 1
      const blurInside: Annotation = {
        id: 'blur-inside',
        index: 1,
        geometry: { type: 'blur', x: 300, y: 300, width: 100, height: 80 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Inside highlight focus',
        createdAt: 1,
        updatedAt: 1,
      };

      // Blur 2 is OUTSIDE any highlight
      const blurOutside: Annotation = {
        id: 'blur-outside',
        index: 2,
        geometry: { type: 'blur', x: 800, y: 800, width: 100, height: 80 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Outside in darkened backdrop',
        createdAt: 2,
        updatedAt: 2,
      };

      const highlightSurrounding: Annotation = {
        id: 'hl-surrounding',
        index: 3,
        geometry: { type: 'highlight', x: 200, y: 200, width: 400, height: 300 },
        style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Focus window',
        createdAt: 3,
        updatedAt: 3,
      };

      // 1. Verify SVG Live DOM Parity
      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'select',
        annotations: [blurInside, blurOutside, highlightSurrounding],
      });

      const spotlightMask = container.querySelector('#spotlight-mask');
      expect(spotlightMask).not.toBeNull();

      // Spotlight mask base is white (dimming everything)
      const baseRect = spotlightMask?.querySelector('rect[fill="white"]');
      expect(baseRect).not.toBeNull();

      // Spotlight mask has cutout rect for highlightSurrounding with fill="black"
      const cutoutRect = spotlightMask?.querySelector(`rect[x="200"][y="200"][width="400"][height="300"]`);
      expect(cutoutRect).not.toBeNull();
      expect(cutoutRect?.getAttribute('fill')).toBe('black');

      // 2. Verify 2D Canvas Export Parity
      const canvas = await renderCompositeCanvas(mockScreenshot, [blurInside, blurOutside, highlightSurrounding]);
      const ctx = canvas.getContext('2d')!;

      // Verify sequence: blur clip baking happens at Stage 1.2, then highlight backdrop composited at Stage 1.5
      expect(vi.mocked(ctx.clip)).toHaveBeenCalledTimes(2);
      const saveCount = vi.mocked(ctx.save).mock.calls.length;
      const restoreCount = vi.mocked(ctx.restore).mock.calls.length;
      expect(saveCount).toBe(restoreCount);
    });

    it('C2.3: Multi-modal composite with 50 annotations across all 5 shape types (blur, highlight, box, arrow, pin)', async () => {
      const annotations: Annotation[] = [];
      const types: ('blur' | 'highlight' | 'box' | 'arrow' | 'pin')[] = [
        'blur',
        'highlight',
        'box',
        'arrow',
        'pin',
      ];

      for (let i = 1; i <= 50; i++) {
        const type = types[(i - 1) % 5];
        const color = PRESET_COLORS_LIST[i % PRESET_COLORS_LIST.length];
        let geometry: AnnotationGeometry;

        switch (type) {
          case 'blur':
            geometry = { type: 'blur', x: 50 + i * 20, y: 50 + i * 15, width: 100, height: 60 };
            break;
          case 'highlight':
            geometry = { type: 'highlight', x: 60 + i * 20, y: 60 + i * 15, width: 120, height: 70 };
            break;
          case 'box':
            geometry = { type: 'box', x: 70 + i * 20, y: 70 + i * 15, width: 80, height: 50 };
            break;
          case 'arrow':
            geometry = {
              type: 'arrow',
              startX: 80 + i * 20,
              startY: 80 + i * 15,
              endX: 150 + i * 20,
              endY: 150 + i * 15,
            };
            break;
          case 'pin':
            geometry = { type: 'pin', x: 100 + i * 20, y: 100 + i * 15 };
            break;
        }

        annotations.push({
          id: `multi-modal-${i}`,
          index: i,
          geometry,
          style: { color, strokeWidth: 3, fillOpacity: 0.15 },
          note: `Annotation #${i} (${type})`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        });
      }

      // 1. SvgOverlay mount
      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'select',
        annotations,
      });

      expect(container.querySelectorAll('defs clipPath[id^="blur-clip-"]')).toHaveLength(10);
      expect(container.querySelectorAll('image[data-testid^="blur-slice-"]')).toHaveLength(10);
      expect(container.querySelectorAll('#spotlight-mask rect[fill="black"]')).toHaveLength(10);

      // 2. Export composite
      const canvas = await renderCompositeCanvas(mockScreenshot, annotations);
      const ctx = canvas.getContext('2d')!;
      expect(vi.mocked(ctx.save).mock.calls.length).toBe(vi.mocked(ctx.restore).mock.calls.length);
    });
  });

  // =========================================================================
  // Suite 3: Inverted Drags, Sub-pixel, Zero-size & Extreme Coordinates
  // =========================================================================
  describe('3. Inverted Coordinate Drags, Sub-pixel Dimensions, Zero-size Drafts & Extreme Coordinates', () => {
    it('C3.1: Normalizes 4 quadrants of inverted drag vectors in normalizeBlurGeometry and universal dispatcher', () => {
      // Quadrant 1: SE (positive, positive)
      const q1 = normalizeBlurGeometry({ type: 'blur', x: 100, y: 100, width: 200, height: 150 });
      expect(q1).toEqual({ type: 'blur', x: 100, y: 100, width: 200, height: 150 });

      // Quadrant 2: SW (negative width, positive height)
      const q2 = normalizeBlurGeometry({ type: 'blur', x: 300, y: 100, width: -200, height: 150 });
      expect(q2).toEqual({ type: 'blur', x: 100, y: 100, width: 200, height: 150 });

      // Quadrant 3: NW (negative width, negative height)
      const q3 = normalizeBlurGeometry({ type: 'blur', x: 300, y: 250, width: -200, height: -150 });
      expect(q3).toEqual({ type: 'blur', x: 100, y: 100, width: 200, height: 150 });

      // Quadrant 4: NE (positive width, negative height)
      const q4 = normalizeBlurGeometry({ type: 'blur', x: 100, y: 250, width: 200, height: -150 });
      expect(q4).toEqual({ type: 'blur', x: 100, y: 100, width: 200, height: 150 });

      // Dispatcher check via normalizeGeometry
      const viaDispatcher = normalizeGeometry({
        type: 'blur',
        x: 400,
        y: 500,
        width: -150,
        height: -250,
        borderRadius: 4,
      }) as BlurGeometry;

      expect(viaDispatcher).toEqual({
        type: 'blur',
        x: 250,
        y: 250,
        width: 150,
        height: 250,
        borderRadius: 4,
      });
    });

    it('C3.2: Interactive backward drag in SvgOverlay creates correctly normalized blur annotation', () => {
      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'blur',
        annotations: [],
      });

      const svg = container.querySelector('svg[data-testid="svg-overlay"]');
      expect(svg).not.toBeNull();

      // Drag backwards from (400, 400) to (150, 120)
      fireEvent.pointerDown(svg!, { button: 0, clientX: 400, clientY: 400, pointerId: 1 });
      fireEvent.pointerMove(svg!, { clientX: 150, clientY: 120, pointerId: 1 });

      // Verify draft clipPath exists and has normalized positive dimensions
      const draftClip = container.querySelector('#blur-clip-draft');
      expect(draftClip).not.toBeNull();
      const draftRect = draftClip?.querySelector('rect');
      expect(Number(draftRect?.getAttribute('x'))).toBe(150);
      expect(Number(draftRect?.getAttribute('y'))).toBe(120);
      expect(Number(draftRect?.getAttribute('width'))).toBe(250);
      expect(Number(draftRect?.getAttribute('height'))).toBe(280);

      // Finalize drag
      fireEvent.pointerUp(svg!, { pointerId: 1 });

      // Shape is committed to state and draft is cleared
      expect(container.querySelector('#blur-clip-draft')).toBeNull();
      expect(container.querySelectorAll('g[data-testid="shape-blur"]')).toHaveLength(1);
    });

    it('C3.3: Aspect-ratio locked Shift-drag backwards creates equilateral square blur annotation', () => {
      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'blur',
        annotations: [],
      });

      const svg = container.querySelector('svg[data-testid="svg-overlay"]');

      // Drag backwards with shiftKey: start at (500, 500), drag to (300, 400) -> dx=200, dy=100 -> side=200
      fireEvent.pointerDown(svg!, { button: 0, clientX: 500, clientY: 500, pointerId: 2 });
      fireEvent.pointerMove(svg!, { clientX: 300, clientY: 400, shiftKey: true, pointerId: 2 });

      const draftClip = container.querySelector('#blur-clip-draft');
      expect(draftClip).not.toBeNull();
      const draftRect = draftClip?.querySelector('rect');
      expect(Number(draftRect?.getAttribute('width'))).toBe(200);
      expect(Number(draftRect?.getAttribute('height'))).toBe(200);
      expect(Number(draftRect?.getAttribute('x'))).toBe(300); // 500 - 200
      expect(Number(draftRect?.getAttribute('y'))).toBe(300); // 500 - 200

      fireEvent.pointerUp(svg!, { pointerId: 2 });
      expect(container.querySelectorAll('g[data-testid="shape-blur"]')).toHaveLength(1);
    });

    it('C3.4: Sub-pixel float precision and fractional coordinates survive state normalization and export rasterization', async () => {
      const subpixelGeom: BlurGeometry = {
        type: 'blur',
        x: 10.333,
        y: 20.666,
        width: 45.125,
        height: 80.875,
        borderRadius: 2.5,
      };

      const normalized = normalizeBlurGeometry(subpixelGeom);
      expect(normalized.x).toBe(10.333);
      expect(normalized.y).toBe(20.666);
      expect(normalized.width).toBe(45.125);
      expect(normalized.height).toBe(80.875);

      const badgePos = getBadgePositionForShape(normalized);
      expect(badgePos).toEqual({ x: 10.333, y: 20.666 });

      const ann: Annotation = {
        id: 'blur-subpixel',
        index: 1,
        geometry: normalized,
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Subpixel text',
        createdAt: 1,
        updatedAt: 1,
      };

      const canvas = await renderCompositeCanvas(mockScreenshot, [ann]);
      const ctx = canvas.getContext('2d')!;
      expect(vi.mocked(ctx.save)).toHaveBeenCalled();
    });

    it('C3.5: Zero-size drafts and micro-jitter (< 4px) rejection oracle', () => {
      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'blur',
        annotations: [],
      });

      const svg = container.querySelector('svg[data-testid="svg-overlay"]');

      // 1. In-place click (0 movement)
      fireEvent.pointerDown(svg!, { button: 0, clientX: 200, clientY: 200, pointerId: 10 });
      fireEvent.pointerUp(svg!, { pointerId: 10 });
      expect(container.querySelectorAll('g[data-testid="shape-blur"]')).toHaveLength(0);

      // 2. Micro-jitter: 2px x 2px drag
      fireEvent.pointerDown(svg!, { button: 0, clientX: 200, clientY: 200, pointerId: 11 });
      fireEvent.pointerMove(svg!, { clientX: 202, clientY: 202, pointerId: 11 });
      fireEvent.pointerUp(svg!, { pointerId: 11 });
      expect(container.querySelectorAll('g[data-testid="shape-blur"]')).toHaveLength(0);

      // 3. Valid drag: 4px x 1px drag (width >= 4 threshold)
      fireEvent.pointerDown(svg!, { button: 0, clientX: 200, clientY: 200, pointerId: 12 });
      fireEvent.pointerMove(svg!, { clientX: 204, clientY: 201, pointerId: 12 });
      fireEvent.pointerUp(svg!, { pointerId: 12 });
      expect(container.querySelectorAll('g[data-testid="shape-blur"]')).toHaveLength(1);

      // 4. Reducer handles zero-size blur safely without -0
      const zeroBlur = normalizeBlurGeometry({ type: 'blur', x: 100, y: 100, width: 0, height: 0 });
      expect(Object.is(zeroBlur.width, 0)).toBe(true);
      expect(Object.is(zeroBlur.height, 0)).toBe(true);

      // 5. bakeBlurFallback early-returns on non-positive dimensions
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      vi.mocked(ctx.drawImage).mockClear();
      bakeBlurFallback(ctx, {} as unknown as HTMLImageElement, 100, 100, 0, 0);
      bakeBlurFallback(ctx, {} as unknown as HTMLImageElement, 100, 100, -10, 50);
      expect(vi.mocked(ctx.drawImage)).not.toHaveBeenCalled();
    });

    it('C3.6: Extreme coordinates (+-1,000,000) adversarial stress', () => {
      const extremeGeom: BlurGeometry = {
        type: 'blur',
        x: 1_000_000,
        y: -1_000_000,
        width: 500_000,
        height: 500_000,
      };

      // 1. hitTestAnnotation
      expect(hitTestAnnotation({ x: 1_250_000, y: -750_000 }, extremeGeom)).toBe(true);
      expect(hitTestAnnotation({ x: 0, y: 0 }, extremeGeom)).toBe(false);

      // 2. getResizeHandlePositions
      const handles = getResizeHandlePositions(extremeGeom);
      expect(handles).toHaveLength(8);
      handles.forEach((h) => {
        expect(Number.isFinite(h.x)).toBe(true);
        expect(Number.isFinite(h.y)).toBe(true);
      });

      // 3. applyHandleResize
      const resized = applyHandleResize(extremeGeom, 'se', { x: 500_000, y: -1_500_000 }) as BlurGeometry;
      expect(resized.type).toBe('blur');
      expect(Number.isFinite(resized.x)).toBe(true);
      expect(Number.isFinite(resized.y)).toBe(true);
      expect(resized.width).toBeGreaterThanOrEqual(2);
      expect(resized.height).toBeGreaterThanOrEqual(2);

      // 4. translateGeometry
      const translated = translateGeometry(extremeGeom, -250_000, 250_000) as BlurGeometry;
      expect(translated.x).toBe(750_000);
      expect(translated.y).toBe(-750_000);
    });
  });

  // =========================================================================
  // Suite 4: Boundary Conditions & `edgeMode="duplicate"` Halo Prevention
  // =========================================================================
  describe('4. Boundary Conditions & edgeMode="duplicate" Halo Prevention', () => {
    it('C4.1: SVG gaussian-blur filter strictly defines edgeMode="duplicate" with extended filter region to prevent transparent black border bleed', () => {
      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'select',
        annotations: [],
      });

      const filter = container.querySelector('#gaussian-blur');
      expect(filter).not.toBeNull();

      // Ensure filter extent is padded by at least 20% on each side to prevent clipping convolution tail
      expect(filter?.getAttribute('x')).toBe('-20%');
      expect(filter?.getAttribute('y')).toBe('-20%');
      expect(filter?.getAttribute('width')).toBe('140%');
      expect(filter?.getAttribute('height')).toBe('140%');

      const feBlur = filter?.querySelector('feGaussianBlur');
      expect(feBlur).not.toBeNull();
      expect(feBlur?.getAttribute('stdDeviation')).toBe('10');

      // CRITICAL: edgeMode="duplicate" replicates border pixels into filter extent, preventing dark transparent border halo
      expect(feBlur?.getAttribute('edgeMode')).toBe('duplicate');
    });

    it('C4.2: Blur annotations positioned on screenshot boundaries and corners render without clipping or error', async () => {
      const W = mockScreenshot.naturalWidth;
      const H = mockScreenshot.naturalHeight;

      const boundaryAnnotations: Annotation[] = [
        // Top-Left corner
        {
          id: 'blur-top-left',
          index: 1,
          geometry: { type: 'blur', x: 0, y: 0, width: 200, height: 150 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Top left corner',
          createdAt: 1,
          updatedAt: 1,
        },
        // Top-Right corner
        {
          id: 'blur-top-right',
          index: 2,
          geometry: { type: 'blur', x: W - 200, y: 0, width: 200, height: 150 },
          style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Top right corner',
          createdAt: 2,
          updatedAt: 2,
        },
        // Bottom-Left corner
        {
          id: 'blur-bottom-left',
          index: 3,
          geometry: { type: 'blur', x: 0, y: H - 150, width: 200, height: 150 },
          style: { color: 'green', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Bottom left corner',
          createdAt: 3,
          updatedAt: 3,
        },
        // Bottom-Right corner
        {
          id: 'blur-bottom-right',
          index: 4,
          geometry: { type: 'blur', x: W - 200, y: H - 150, width: 200, height: 150 },
          style: { color: 'purple', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Bottom right corner',
          createdAt: 4,
          updatedAt: 4,
        },
        // Full screenshot blur
        {
          id: 'blur-full-canvas',
          index: 5,
          geometry: { type: 'blur', x: 0, y: 0, width: W, height: H },
          style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Full canvas redact',
          createdAt: 5,
          updatedAt: 5,
        },
      ];

      // 1. SvgOverlay renders all 5 clipPaths and image slices
      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'select',
        annotations: boundaryAnnotations,
      });

      expect(container.querySelectorAll('defs clipPath[id^="blur-clip-"]')).toHaveLength(5);
      expect(container.querySelectorAll('image[data-testid^="blur-slice-"]')).toHaveLength(5);

      // 2. CanvasExporter executes without coordinate violation
      const canvas = await renderCompositeCanvas(mockScreenshot, boundaryAnnotations);
      const ctx = canvas.getContext('2d')!;
      expect(vi.mocked(ctx.save).mock.calls.length).toBe(vi.mocked(ctx.restore).mock.calls.length);
      expect(vi.mocked(ctx.clip)).toHaveBeenCalledTimes(5);
    });

    it('C4.3: Blur annotation straddling canvas boundary and out-of-bounds coordinates handled cleanly', async () => {
      const straddling: Annotation = {
        id: 'blur-straddle',
        index: 1,
        geometry: { type: 'blur', x: -50, y: -50, width: 200, height: 200 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Straddling canvas edge',
        createdAt: 1,
        updatedAt: 1,
      };

      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'select',
        annotations: [straddling],
      });

      const clipPath = container.querySelector('#blur-clip-blur-straddle');
      expect(clipPath).not.toBeNull();
      const rect = clipPath?.querySelector('rect');
      expect(Number(rect?.getAttribute('x'))).toBe(-50);
      expect(Number(rect?.getAttribute('y'))).toBe(-50);
      expect(Number(rect?.getAttribute('width'))).toBe(200);
      expect(Number(rect?.getAttribute('height'))).toBe(200);

      const canvas = await renderCompositeCanvas(mockScreenshot, [straddling]);
      const ctx = canvas.getContext('2d')!;
      expect(vi.mocked(ctx.save).mock.calls.length).toBe(vi.mocked(ctx.restore).mock.calls.length);
      expect(vi.mocked(ctx.clip)).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Suite 5: Rapid Undo/Redo & Transaction Manager Stress
  // =========================================================================
  describe('5. Rapid Undo/Redo & Transaction Manager Stress with Blur Annotations', () => {
    it('C5.1: 100 rapid sequential undo/redo operations with blur annotations preserve state invariants and cap history stack', () => {
      let history = createInitialHistory([], null);

      const snapshotCount = 60;

      // Push 60 snapshots
      for (let i = 1; i <= snapshotCount; i++) {
        const newAnn: Annotation = {
          id: `blur-snap-${i}`,
          index: i,
          geometry: { type: 'blur', x: 100 + i * 5, y: 100 + i * 5, width: 100, height: 80 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: `Step ${i}`,
          createdAt: i,
          updatedAt: i,
        };

        const nextSnapshot: HistorySnapshot = {
          annotations: [...history.present.annotations, newAnn],
          selectedAnnotationId: newAnn.id,
        };

        history = pushHistory(history, nextSnapshot);
      }

      // Past history capped at MAX_HISTORY_STEPS (50)
      expect(history.past.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
      expect(history.present.annotations).toHaveLength(snapshotCount);
      expect(history.future).toHaveLength(0);

      // Perform 50 consecutive undos
      const undosPerformed = Math.min(snapshotCount, MAX_HISTORY_STEPS);
      for (let u = 0; u < undosPerformed; u++) {
        expect(canUndo(history)).toBe(true);
        history = undo(history);
      }

      // At limit of undo stack
      expect(canUndo(history)).toBe(false);
      expect(history.past).toHaveLength(0);
      expect(history.future).toHaveLength(undosPerformed);

      // Redo all back to original
      for (let r = 0; r < undosPerformed; r++) {
        expect(canRedo(history)).toBe(true);
        history = redo(history);
      }

      expect(canRedo(history)).toBe(false);
      expect(history.future).toHaveLength(0);
      expect(history.present.annotations).toHaveLength(snapshotCount);
    });

    it('C5.2: Blur snapshot equality detection in isSnapshotEqual prevents dropped or phantom history steps', () => {
      const baseSnapshot: HistorySnapshot = {
        annotations: [
          {
            id: 'blur-eq-1',
            index: 1,
            geometry: { type: 'blur', x: 100, y: 100, width: 200, height: 150 },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: 'Original note',
            createdAt: 100,
            updatedAt: 100,
          },
        ],
        selectedAnnotationId: 'blur-eq-1',
      };

      // 1. Identical snapshot -> equal
      const identicalSnapshot: HistorySnapshot = {
        annotations: [
          {
            id: 'blur-eq-1',
            index: 1,
            geometry: { type: 'blur', x: 100, y: 100, width: 200, height: 150 },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: 'Original note',
            createdAt: 100,
            updatedAt: 100,
          },
        ],
        selectedAnnotationId: 'blur-eq-1',
      };
      expect(isSnapshotEqual(baseSnapshot, identicalSnapshot)).toBe(true);

      // 2. Changed x -> unequal
      const changedX: HistorySnapshot = {
        ...baseSnapshot,
        annotations: [{ ...baseSnapshot.annotations[0], geometry: { type: 'blur', x: 101, y: 100, width: 200, height: 150 } }],
      };
      expect(isSnapshotEqual(baseSnapshot, changedX)).toBe(false);

      // 3. Changed width -> unequal
      const changedW: HistorySnapshot = {
        ...baseSnapshot,
        annotations: [{ ...baseSnapshot.annotations[0], geometry: { type: 'blur', x: 100, y: 100, width: 205, height: 150 } }],
      };
      expect(isSnapshotEqual(baseSnapshot, changedW)).toBe(false);

      // 4. Changed note -> unequal
      const changedNote: HistorySnapshot = {
        ...baseSnapshot,
        annotations: [{ ...baseSnapshot.annotations[0], note: 'Edited note' }],
      };
      expect(isSnapshotEqual(baseSnapshot, changedNote)).toBe(false);
    });

    it('C5.3: Coalesced gesture drag transaction with TransactionManager records exactly one history entry for 50 continuous move dispatches', () => {
      let currentHistory = createInitialHistory(
        [
          {
            id: 'blur-drag-ann',
            index: 1,
            geometry: { type: 'blur', x: 100, y: 100, width: 200, height: 150 },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: 'To drag',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        'blur-drag-ann'
      );

      const txManager = new TransactionManager();

      // Begin drag transaction
      txManager.beginTransaction(currentHistory.present);

      let currentState: AppState = createInitialState({
        image: mockScreenshot,
        annotations: currentHistory.present.annotations,
        selectedAnnotationId: 'blur-drag-ann',
      });

      // 50 rapid mouse move translation dispatches
      for (let step = 1; step <= 50; step++) {
        currentState = appReducer(currentState, {
          type: 'UPDATE_ANNOTATION_GEOMETRY',
          payload: {
            id: 'blur-drag-ann',
            geometry: { type: 'blur', x: 100 + step * 2, y: 100 + step * 2, width: 200, height: 150 },
          },
        });
      }

      expect(txManager.isTransactionActive()).toBe(true);
      // History should not have pushed 50 intermediate steps
      expect(currentHistory.past).toHaveLength(0);

      // Finalize gesture
      currentHistory = txManager.commitTransaction(currentHistory, {
        annotations: currentState.annotations,
        selectedAnnotationId: currentState.selectedAnnotationId,
      });

      expect(txManager.isTransactionActive()).toBe(false);
      // Exactly ONE history snapshot was recorded for the whole gesture
      expect(currentHistory.past).toHaveLength(1);
      expect(currentHistory.present.annotations[0].geometry).toEqual({
        type: 'blur',
        x: 200,
        y: 200,
        width: 200,
        height: 150,
      });

      // Single undo reverts all the way back to (100, 100)
      const reverted = undo(currentHistory);
      expect(reverted.present.annotations[0].geometry).toEqual({
        type: 'blur',
        x: 100,
        y: 100,
        width: 200,
        height: 150,
      });
    });
  });
});
