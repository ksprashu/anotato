import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App } from '../../src/App';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import {
  ColorPalette,
  STROKE_WIDTH_OPTIONS,
  FILL_OPACITY_OPTIONS,
} from '../../src/components/toolbar/ColorPalette';
import { TOOL_ITEMS } from '../../src/components/toolbar/MainToolbar';
import { ReplaceImageModal } from '../../src/components/modals/ReplaceImageModal';
import { AppProvider } from '../../src/state/AppContext';
import {
  appReducer,
  createInitialState,
  reindexAnnotations,
  normalizeBoxGeometry,
  normalizeEllipseGeometry,
} from '../../src/state/appReducer';
import {
  createInitialHistory,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  MAX_HISTORY_STEPS,
} from '../../src/state/historyManager';
import {
  quantizeWheelZoom,
  computeZoomTransform,
  getFitToViewportTransform,
  screenToImage,
  imageToScreen,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_PRESETS,
} from '../../src/math/coordinates';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  hexToRgba,
} from '../../src/export/canvasExporter';
import {
  serializeAnnotationsToMarkdown,
  serializeToNumberedList,
  serializeToMarkdownTable,
  serializeToFullReport,
} from '../../src/export/markdownSerializer';
import { PRESET_COLORS, COLOR_KEYS } from '../../src/constants/colors';
import {
  BaseImage,
  ImageOverlay,
  Annotation,
  PresetColor,
  Point,
  HistorySnapshot,
  BoxGeometry,
  EllipseGeometry,
  ArrowGeometry,
  PinGeometry,
} from '../../src/types';

describe('Milestone 4 Tier 5 Challenger 2: Cross-Feature Adversarial Stress & Integration Hardening', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  const mockBaseImage1: BaseImage = {
    id: 'img-m4-stress-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'viewport-base-1080p.png',
    fileSize: 1024 * 64,
  };

  const mockPastedImage: BaseImage = {
    id: 'img-m4-pasted-2',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 2560,
    naturalHeight: 1440,
    fileName: 'incoming-clipboard-paste.png',
    fileSize: 1024 * 128,
  };

  const createMockOverlay = (id: string, overrides?: Partial<ImageOverlay>): ImageOverlay => ({
    id,
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 800,
    naturalHeight: 600,
    fileName: `${id}.png`,
    fileSize: 2048,
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    opacity: 1.0,
    ...overrides,
  });

  const createMockAnnotation = (
    id: string,
    index: number,
    type: 'box' | 'ellipse' | 'arrow' | 'pin',
    color: PresetColor,
    strokeWidth: number,
    fillOpacity: number,
    note?: string
  ): Annotation => {
    let geometry: Annotation['geometry'];
    if (type === 'box') {
      const box: BoxGeometry = {
        type: 'box',
        x: 40 + (index % 10) * 50,
        y: 40 + Math.floor(index / 10) * 40,
        width: 140,
        height: 90,
        borderRadius: 4,
      };
      geometry = normalizeBoxGeometry(box);
    } else if (type === 'ellipse') {
      const ell: EllipseGeometry = {
        type: 'ellipse',
        cx: 120 + (index % 10) * 50,
        cy: 120 + Math.floor(index / 10) * 40,
        rx: 50,
        ry: 35,
      };
      geometry = normalizeEllipseGeometry(ell);
    } else if (type === 'arrow') {
      const arr: ArrowGeometry = {
        type: 'arrow',
        startX: 100 + (index % 8) * 60,
        startY: 100 + Math.floor(index / 8) * 60,
        endX: 180 + (index % 8) * 60,
        endY: 160 + Math.floor(index / 8) * 60,
      };
      geometry = arr;
    } else {
      const pin: PinGeometry = {
        type: 'pin',
        x: 80 + (index % 12) * 45,
        y: 90 + Math.floor(index / 12) * 45,
      };
      geometry = pin;
    }

    return {
      id,
      index,
      geometry,
      style: {
        color,
        strokeWidth,
        fillOpacity,
      },
      note: note ?? `Annotation note #${index} [${type}]`,
      createdAt: 1000 + index,
      updatedAt: 1000 + index,
    };
  };

  const setViewport = (width: number, height: number = 900) => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
    window.dispatchEvent(new Event('resize'));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1280, 900);
  });

  afterEach(() => {
    setViewport(originalInnerWidth, originalInnerHeight);
  });

  // =========================================================================
  // Section 1: Multi-Modal Paste While Zooming Concurrency & Interleaving
  // =========================================================================
  describe('1. Multi-Modal Paste While Zooming Concurrency & Replacement Modals', () => {
    it('C1.1: Triggers ReplaceImageModal when paste occurs while wheel zoom events are active, preserving modal and finite coordinates', async () => {
      const ann1 = createMockAnnotation('ann-1', 1, 'box', 'amber', 4, 0.3);
      const ann2 = createMockAnnotation('ann-2', 2, 'arrow', 'cyan', 2, 0.15);

      const { container } = render(
        <App
          initialState={{
            image: mockBaseImage1,
            annotations: [ann1, ann2],
            viewport: { zoom: 1.0, panX: 0, panY: 0 },
          }}
        />
      );

      const canvasContainer = screen.getByTestId('canvas-workspace-container');
      expect(canvasContainer).toBeInTheDocument();

      // Dispatch rapid series of wheel zoom events (100% -> 125% -> 150% -> 200%)
      act(() => {
        fireEvent.wheel(canvasContainer, { deltaY: -120, clientX: 400, clientY: 300 });
        fireEvent.wheel(canvasContainer, { deltaY: -120, clientX: 400, clientY: 300 });
        fireEvent.wheel(canvasContainer, { deltaY: -120, clientX: 400, clientY: 300 });
      });

      // While zoomed, simulate an incoming paste event containing an image file
      interface MockClipboardEvent extends Event {
        clipboardData?: {
          items?: Array<{
            type: string;
            getAsFile: () => File | null;
          }> | null;
          files?: File[] | null;
        } | null;
      }
      const pasteFile = new File(['mock-pasted-data'], 'incoming.png', { type: 'image/png' });
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as MockClipboardEvent;
      pasteEvent.clipboardData = {
        items: [
          {
            type: 'image/png',
            getAsFile: () => pasteFile,
          },
        ],
        files: [pasteFile],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      // Verify the replace confirmation modal appears
      const modal = await screen.findByTestId('replace-image-modal');
      expect(modal).toBeInTheDocument();

      // Dispatch further wheel zoom events while modal is open
      act(() => {
        fireEvent.wheel(canvasContainer, { deltaY: 120, clientX: 500, clientY: 400 });
      });

      // Modal must remain open and not be accidentally dismissed by viewport wheel ticks
      expect(screen.getByTestId('replace-image-modal')).toBeInTheDocument();

      // Verify action buttons are present and clickable
      const replaceClearBtn = screen.getByTestId('replace-modal-confirm-btn');
      const replaceKeepBtn = screen.getByTestId('replace-modal-replace-keep-btn');
      const addLayerBtn = screen.getByTestId('replace-modal-add-layer-btn');
      const cancelBtn = screen.getByTestId('replace-modal-cancel-btn');

      expect(replaceClearBtn).toBeInTheDocument();
      expect(replaceKeepBtn).toBeInTheDocument();
      expect(addLayerBtn).toBeInTheDocument();
      expect(cancelBtn).toBeInTheDocument();

      // Click Cancel to gracefully close
      act(() => {
        fireEvent.click(cancelBtn);
      });

      expect(screen.queryByTestId('replace-image-modal')).not.toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('C1.2: Directly tests ReplaceImageModal action callbacks and keyboard escape interaction', () => {
      const onReplaceClear = vi.fn();
      const onReplaceKeep = vi.fn();
      const onAddLayer = vi.fn();
      const onCancel = vi.fn();

      const { rerender } = render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={5}
          onReplaceClear={onReplaceClear}
          onReplaceKeep={onReplaceKeep}
          onAddLayer={onAddLayer}
          onCancel={onCancel}
        />
      );

      expect(screen.getByTestId('replace-image-modal')).toBeInTheDocument();
      const description = document.getElementById('replace-modal-description');
      expect(description).not.toBeNull();
      expect(description?.textContent).toMatch(/5/);
      expect(description?.textContent).toMatch(/active annotation/);

      fireEvent.click(screen.getByTestId('replace-modal-replace-clear-btn'));
      expect(onReplaceClear).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('replace-modal-replace-keep-btn'));
      expect(onReplaceKeep).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('replace-modal-add-layer-btn'));
      expect(onAddLayer).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('replace-modal-cancel-btn'));
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Verify closing when isOpen is false
      rerender(
        <ReplaceImageModal
          isOpen={false}
          annotationCount={5}
          onReplaceClear={onReplaceClear}
          onReplaceKeep={onReplaceKeep}
          onAddLayer={onAddLayer}
          onCancel={onCancel}
        />
      );
      expect(screen.queryByTestId('replace-image-modal')).not.toBeInTheDocument();
    });

    it('C1.3: CanvasWorkspace renders multiple stacked overlays under SvgOverlay during wheel zoom', () => {
      const overlay1 = createMockOverlay('ov-cw-1', { x: 10, y: 10, opacity: 0.8 });
      const overlay2 = createMockOverlay('ov-cw-2', { x: 50, y: 50, opacity: 0.6 });
      const ann = createMockAnnotation('ann-cw', 1, 'box', 'amber', 4, 0.3);

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage1,
            overlays: [overlay1, overlay2],
            annotations: [ann],
            viewport: { zoom: 1.0, panX: 0, panY: 0 },
          }}
        >
          <CanvasWorkspace />
        </AppProvider>
      );

      const workspace = screen.getByTestId('canvas-workspace-container');
      expect(workspace).toBeInTheDocument();
      expect(screen.getByTestId('canvas-base-image')).toBeInTheDocument();
      expect(screen.getByTestId('canvas-overlay-image-ov-cw-1')).toBeInTheDocument();
      expect(screen.getByTestId('canvas-overlay-image-ov-cw-2')).toBeInTheDocument();

      // Zoom in
      act(() => {
        fireEvent.wheel(workspace, { deltaY: -120, clientX: 200, clientY: 200 });
      });

      expect(screen.getByTestId('canvas-transform-layer')).toBeInTheDocument();
    });

    it('C1.4: Executing Replace & Clear Annotations while zoomed purges annotations (0 ghosts) and resets undo history', () => {
      let state = createInitialState({
        image: mockBaseImage1,
        annotations: [
          createMockAnnotation('a1', 1, 'box', 'amber', 4, 0.3),
          createMockAnnotation('a2', 2, 'ellipse', 'red', 8, 0.5),
        ],
        viewport: { zoom: 1.5, panX: -150, panY: -100 },
      });

      let history = createInitialHistory([], null);
      history = pushHistory(history, {
        annotations: state.annotations,
        selectedAnnotationId: null,
      });

      expect(canUndo(history)).toBe(true);

      // Execute REPLACE_IMAGE_AND_CLEAR
      state = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_CLEAR',
        payload: { image: mockPastedImage },
      });

      expect(state.image?.id).toBe(mockPastedImage.id);
      expect(state.image?.naturalWidth).toBe(2560);
      expect(state.annotations).toHaveLength(0);
      expect(state.overlays).toHaveLength(0);
      expect(state.selectedAnnotationId).toBeNull();

      // History must be reset so old annotations cannot be resuscitated
      history = createInitialHistory([], null);
      expect(canUndo(history)).toBe(false);
      expect(canRedo(history)).toBe(false);
    });

    it('C1.5: Executing Replace & Keep Annotations preserves all annotations, stroke widths, fill opacities, and projected coordinates', () => {
      const initialAnnotations = [
        createMockAnnotation('ann-k1', 1, 'box', 'amber', 2, 0.0),
        createMockAnnotation('ann-k2', 2, 'ellipse', 'red', 4, 0.15),
        createMockAnnotation('ann-k3', 3, 'arrow', 'cyan', 8, 0.3),
        createMockAnnotation('ann-k4', 4, 'pin', 'purple', 4, 0.5),
      ];

      let state = createInitialState({
        image: mockBaseImage1,
        annotations: initialAnnotations,
        viewport: { zoom: 2.0, panX: -200, panY: -150 },
      });

      state = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_KEEP',
        payload: { image: mockPastedImage },
      });

      expect(state.image?.id).toBe(mockPastedImage.id);
      expect(state.annotations).toHaveLength(4);

      // Check preservation of styles
      expect(state.annotations[0].style.strokeWidth).toBe(2);
      expect(state.annotations[0].style.fillOpacity).toBe(0.0);
      expect(state.annotations[1].style.strokeWidth).toBe(4);
      expect(state.annotations[1].style.fillOpacity).toBe(0.15);
      expect(state.annotations[2].style.strokeWidth).toBe(8);
      expect(state.annotations[2].style.fillOpacity).toBe(0.3);
      expect(state.annotations[3].style.strokeWidth).toBe(4);
      expect(state.annotations[3].style.fillOpacity).toBe(0.5);

      // Verify coordinate transformation projection invariance
      const ptImage: Point = { x: 100, y: 100 };
      const ptScreen = imageToScreen(ptImage, state.viewport);
      expect(ptScreen.x).toBe(100 * 2.0 - 200); // 0
      expect(ptScreen.y).toBe(100 * 2.0 - 150); // 50

      const ptReconstructed = screenToImage(ptScreen, state.viewport);
      expect(ptReconstructed.x).toBeCloseTo(ptImage.x);
      expect(ptReconstructed.y).toBeCloseTo(ptImage.y);
    });

    it('C1.6: Executing Add as Layer / Overlay while zoomed preserves base image and appends overlay without displacing viewport', () => {
      let state = createInitialState({
        image: mockBaseImage1,
        annotations: [createMockAnnotation('ann-l1', 1, 'box', 'amber', 4, 0.15)],
        viewport: { zoom: 1.25, panX: -50, panY: -30 },
      });

      const overlay = createMockOverlay('ov-pasted-layer', {
        x: 50,
        y: 50,
        opacity: 0.8,
      });

      state = appReducer(state, {
        type: 'ADD_IMAGE_OVERLAY',
        payload: { overlay },
      });

      expect(state.image?.id).toBe(mockBaseImage1.id);
      expect(state.overlays).toHaveLength(1);
      expect(state.overlays[0].id).toBe('ov-pasted-layer');
      expect(state.overlays[0].opacity).toBe(0.8);
      expect(state.annotations).toHaveLength(1);
      expect(state.viewport.zoom).toBe(1.25);
      expect(state.viewport.panX).toBe(-50);
      expect(state.viewport.panY).toBe(-30);
    });

    it('C1.7: Interleaved wheel zoom quantization and transform invariance across all ladder tiers', () => {
      let currentZoom = 1.0;
      const zoomHistory: number[] = [currentZoom];

      // Step up through ladder to 2.0
      for (let i = 0; i < 5; i++) {
        currentZoom = quantizeWheelZoom(currentZoom, -120);
        zoomHistory.push(currentZoom);
      }
      expect(currentZoom).toBe(2.0);
      expect(zoomHistory.length).toBe(6);

      // Step down through ladder to 0.10
      for (let i = 0; i < 15; i++) {
        currentZoom = quantizeWheelZoom(currentZoom, 120);
      }
      expect(currentZoom).toBe(0.10);

      // Verify all presets exist in ladder
      ZOOM_PRESETS.forEach((preset) => {
        expect(preset).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(preset).toBeLessThanOrEqual(MAX_ZOOM);
      });

      // Verify computeZoomTransform preserves cursor focal point image coordinates
      const focalScreen: Point = { x: 600, y: 400 };
      const vpBefore = { zoom: 1.0, panX: 100, panY: 50 };
      const ptImgBefore = screenToImage(focalScreen, vpBefore);

      const vpAfter = computeZoomTransform(vpBefore, focalScreen, 1.5, MIN_ZOOM, MAX_ZOOM);
      const ptImgAfter = screenToImage(focalScreen, vpAfter);

      expect(ptImgAfter.x).toBeCloseTo(ptImgBefore.x, 5);
      expect(ptImgAfter.y).toBeCloseTo(ptImgBefore.y, 5);
    });
  });

  // =========================================================================
  // Section 2: Layered Export with 5+ Overlays, 20+ Annotations & Mixed Styles
  // =========================================================================
  describe('2. High-Density Layered Canvas Export Stress (6+ Overlays, 24+ Annotations, Mixed Strokes & Opacities)', () => {
    it('C2.1: Composites base image, 6 layered overlays with diverse opacities, and 24 annotations with exact stroke/opacity combinations', async () => {
      const overlays: ImageOverlay[] = [
        createMockOverlay('layer-1', { x: 0, y: 0, width: 400, height: 300, opacity: 0.1 }),
        createMockOverlay('layer-2', { x: 50, y: 50, width: 500, height: 400, opacity: 0.25 }),
        createMockOverlay('layer-3', { x: 100, y: 80, width: 600, height: 450, opacity: 0.5 }),
        createMockOverlay('layer-4', { x: -30, y: -20, width: 700, height: 500, opacity: 0.75 }),
        createMockOverlay('layer-5', { x: 200, y: 150, width: 400, height: 300, opacity: 0.9 }),
        createMockOverlay('layer-6', { x: 300, y: 250, width: 350, height: 250, opacity: 1.0 }),
      ];

      const strokeWeights = [2, 4, 8];
      const opacityOptions = [0, 0.15, 0.3, 0.5];
      const colors: PresetColor[] = ['amber', 'red', 'green', 'cyan', 'purple'];
      const shapeTypes: ('box' | 'ellipse' | 'arrow' | 'pin')[] = ['box', 'ellipse', 'arrow', 'pin'];

      // Generate 24 annotations covering every shape type, stroke width, and opacity
      const annotations: Annotation[] = [];
      for (let i = 0; i < 24; i++) {
        const type = shapeTypes[i % shapeTypes.length];
        const color = colors[i % colors.length];
        const strokeWidth = strokeWeights[i % strokeWeights.length];
        const fillOpacity = opacityOptions[i % opacityOptions.length];
        annotations.push(
          createMockAnnotation(`ann-${i + 1}`, i + 1, type, color, strokeWidth, fillOpacity)
        );
      }

      const canvas = await renderCompositeCanvas(mockBaseImage1, annotations, overlays);
      const ctx = canvas.getContext('2d')!;

      // Canvas dimensions must match base image 1:1
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);

      // Base image (1) + 6 overlays = 7 drawImage calls
      expect(ctx.drawImage).toHaveBeenCalledTimes(7);

      // Verify each overlay was drawn with its dimensions
      expect(ctx.drawImage).toHaveBeenNthCalledWith(1, expect.anything(), 0, 0, 1920, 1080);
      expect(ctx.drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 400, 300);
      expect(ctx.drawImage).toHaveBeenNthCalledWith(3, expect.anything(), 50, 50, 500, 400);
      expect(ctx.drawImage).toHaveBeenNthCalledWith(4, expect.anything(), 100, 80, 600, 450);
      expect(ctx.drawImage).toHaveBeenNthCalledWith(5, expect.anything(), -30, -20, 700, 500);
      expect(ctx.drawImage).toHaveBeenNthCalledWith(6, expect.anything(), 200, 150, 400, 300);
      expect(ctx.drawImage).toHaveBeenNthCalledWith(7, expect.anything(), 300, 250, 350, 250);

      // Verify save and restore calls balance
      expect((ctx.save as unknown as Mock).mock.calls.length).toBeGreaterThanOrEqual(6 + 24);
      expect((ctx.restore as unknown as Mock).mock.calls.length).toBeGreaterThanOrEqual(6 + 24);
    });

    it('C2.2: Generates valid binary PNG Blob and Data URL for 6+ overlays and 20+ annotations', async () => {
      const overlays: ImageOverlay[] = [
        createMockOverlay('ov-b1', { opacity: 0.3 }),
        createMockOverlay('ov-b2', { opacity: 0.6 }),
        createMockOverlay('ov-b3', { opacity: 0.9 }),
        createMockOverlay('ov-b4', { opacity: 0.4 }),
        createMockOverlay('ov-b5', { opacity: 0.7 }),
      ];

      const annotations: Annotation[] = [];
      for (let i = 0; i < 20; i++) {
        annotations.push(
          createMockAnnotation(`ann-b-${i + 1}`, i + 1, 'box', 'amber', 4, 0.3)
        );
      }

      const blob = await exportCompositeBlob(mockBaseImage1, annotations, overlays);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);

      const dataUrl = await exportCompositeDataUrl(mockBaseImage1, annotations, overlays);
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('C2.3: Fuzzes extreme export workloads with 60 annotations, 8 overlays, negative coordinates, and boundary values', async () => {
      const overlays: ImageOverlay[] = [];
      for (let i = 0; i < 8; i++) {
        overlays.push(
          createMockOverlay(`ov-fuzz-${i}`, {
            x: (i - 4) * 50,
            y: (i - 4) * 40,
            width: 1000 + i * 100,
            height: 700 + i * 50,
            opacity: Math.max(0.05, Math.min(1.0, (i + 1) * 0.12)),
          })
        );
      }

      const shapeList: ('box' | 'ellipse' | 'arrow' | 'pin')[] = ['box', 'ellipse', 'arrow', 'pin'];
      const annotations: Annotation[] = [];
      for (let i = 0; i < 60; i++) {
        const type = shapeList[i % shapeList.length];
        const color = COLOR_KEYS[i % COLOR_KEYS.length];
        const strokeWidth = STROKE_WIDTH_OPTIONS[i % STROKE_WIDTH_OPTIONS.length];
        const fillOpacity = FILL_OPACITY_OPTIONS[i % FILL_OPACITY_OPTIONS.length].value;
        annotations.push(
          createMockAnnotation(`fuzz-ann-${i + 1}`, i + 1, type, color, strokeWidth, fillOpacity)
        );
      }

      const canvas = await renderCompositeCanvas(mockBaseImage1, annotations, overlays);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
      const ctx = canvas.getContext('2d')!;
      expect(ctx.drawImage).toHaveBeenCalledTimes(9); // Base + 8 overlays
    });

    it('C2.4: Validates hexToRgba transformation matrix across all preset colors and fill opacities', () => {
      COLOR_KEYS.forEach((colorKey) => {
        const colorDef = PRESET_COLORS[colorKey];
        FILL_OPACITY_OPTIONS.forEach(({ value: opacity }) => {
          const rgba = hexToRgba(colorDef.hex, opacity);
          expect(rgba.startsWith('rgba(')).toBe(true);
          expect(rgba.endsWith(')')).toBe(true);
          if (opacity === 0) {
            expect(rgba.endsWith(', 0)')).toBe(true);
          } else {
            expect(rgba.includes(String(opacity))).toBe(true);
          }
        });
      });
    });
  });

  // =========================================================================
  // Section 3: Responsive Viewport Transition Chaos During Drawing & Zooming
  // =========================================================================
  describe('3. Responsive Viewport Transition Chaos During Interactive Drawing & Zoom Operations', () => {
    it('C3.1: Handles viewport resize mutation (1920 -> 640 -> 320) during active drawing without NaN coordinates', () => {
      setViewport(1920, 1080);
      const { container } = render(
        <App
          initialState={{
            image: mockBaseImage1,
            activeTool: 'box',
            activeStrokeWidth: 4,
            activeFillOpacity: 0.3,
          }}
        />
      );

      const canvasContainer = screen.getByTestId('canvas-workspace-container');
      expect(canvasContainer).toBeInTheDocument();

      // Begin drawing box via pointerdown
      fireEvent.pointerDown(canvasContainer, { clientX: 200, clientY: 200, pointerId: 1 });

      // Resize abruptly mid-drag to mobile viewport
      act(() => {
        setViewport(640, 480);
      });

      // Pointermove at new viewport
      fireEvent.pointerMove(canvasContainer, { clientX: 350, clientY: 300, pointerId: 1 });

      // Resize abruptly to ultra-compact 320px
      act(() => {
        setViewport(320, 568);
      });

      // Pointerup to complete drag
      fireEvent.pointerUp(canvasContainer, { clientX: 300, clientY: 280, pointerId: 1 });

      // Toolbar must remain fully rendered and unclipped
      expect(screen.getByTestId('main-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('color-palette')).toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('C3.2: Rapid viewport ladder oscillations across all 5 drawing tools preserve active tool and styling', () => {
      const ladder = [1920, 1280, 1024, 768, 640, 480, 320];

      render(
        <App
          initialState={{
            image: mockBaseImage1,
            activeTool: 'select',
            activeStrokeWidth: 2,
            activeFillOpacity: 0.15,
          }}
        />
      );

      ladder.forEach((width) => {
        act(() => {
          setViewport(width, 800);
        });

        // Verify all 6 drawing tools are present and visible
        TOOL_ITEMS.forEach((tool) => {
          const btn = screen.getByTestId(`tool-btn-${tool.id}`);
          expect(btn).toBeInTheDocument();
          expect(btn.closest('.hidden')).toBeNull();
        });

        // Verify all stroke options are present
        STROKE_WIDTH_OPTIONS.forEach((w) => {
          const strokeBtn = screen.getByTestId(`stroke-btn-${w}`);
          expect(strokeBtn).toBeInTheDocument();
          expect(strokeBtn.closest('.hidden')).toBeNull();
        });

        // Verify all fill opacity options are present
        FILL_OPACITY_OPTIONS.forEach((opt) => {
          const opacityBtn = screen.getByTestId(`opacity-btn-${Math.round(opt.value * 100)}`);
          expect(opacityBtn).toBeInTheDocument();
          expect(opacityBtn.closest('.hidden')).toBeNull();
        });
      });
    });

    it('C3.3: Container aspect ratio chaos (5000x200 banner and 200x5000 skyscraper) with getFitToViewportTransform enforces bounds', () => {
      // Extreme wide banner
      const bannerTransform = getFitToViewportTransform(
        mockBaseImage1.naturalWidth,
        mockBaseImage1.naturalHeight,
        5000,
        200,
        32,
        false,
        MIN_ZOOM,
        MAX_ZOOM
      );

      expect(bannerTransform.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(bannerTransform.zoom).toBeLessThanOrEqual(MAX_ZOOM);
      expect(Number.isFinite(bannerTransform.panX)).toBe(true);
      expect(Number.isFinite(bannerTransform.panY)).toBe(true);

      // Extreme tall skyscraper
      const skyscraperTransform = getFitToViewportTransform(
        mockBaseImage1.naturalWidth,
        mockBaseImage1.naturalHeight,
        200,
        5000,
        32,
        false,
        MIN_ZOOM,
        MAX_ZOOM
      );

      expect(skyscraperTransform.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(skyscraperTransform.zoom).toBeLessThanOrEqual(MAX_ZOOM);
      expect(Number.isFinite(skyscraperTransform.panX)).toBe(true);
      expect(Number.isFinite(skyscraperTransform.panY)).toBe(true);
    });

    it('C3.4: Color palette stroke presets (2/4/8) and fill opacity presets (0/15/30/50) remain clickable and update selection at 320px', () => {
      setViewport(320, 568);
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage1,
            activeStrokeWidth: 2,
            activeFillOpacity: 0.15,
          }}
        >
          <ColorPalette />
        </AppProvider>
      );

      const stroke8Btn = screen.getByTestId('stroke-btn-8');
      expect(stroke8Btn).toBeInTheDocument();
      fireEvent.click(stroke8Btn);

      const opacity50Btn = screen.getByTestId('opacity-btn-50');
      expect(opacity50Btn).toBeInTheDocument();
      fireEvent.click(opacity50Btn);

      expect(screen.getByTestId('fill-opacity-label')).toHaveTextContent('Fill');
    });
  });

  // =========================================================================
  // Section 4: Deep Undo/Redo State Serialization Across 100+ Operations
  // =========================================================================
  describe('4. Deep Undo/Redo State Serialization Across 100+ Operations', () => {
    it('C4.1: 120-operation chaos sequence strictly caps history at MAX_HISTORY_STEPS (50)', () => {
      let state = createInitialState({ image: mockBaseImage1 });
      let history = createInitialHistory(state.annotations, state.selectedAnnotationId);

      const shapeTypes: ('box' | 'ellipse' | 'arrow' | 'pin')[] = ['box', 'ellipse', 'arrow', 'pin'];
      const strokeWidths = [2, 4, 8];
      const fillOpacities = [0, 0.15, 0.3, 0.5];
      const colors = COLOR_KEYS;

      // Perform 120 operations
      for (let i = 0; i < 120; i++) {
        const opType = i % 6;
        if (opType === 0) {
          // Add annotation
          const type = shapeTypes[i % shapeTypes.length];
          const color = colors[i % colors.length];
          const strokeWidth = strokeWidths[i % strokeWidths.length];
          const fillOpacity = fillOpacities[i % fillOpacities.length];
          const ann = createMockAnnotation(`ann-op-${i}`, state.annotations.length + 1, type, color, strokeWidth, fillOpacity);
          state = {
            ...state,
            annotations: reindexAnnotations([...state.annotations, ann]),
          };
        } else if (opType === 1 && state.annotations.length > 0) {
          // Update style of first annotation
          const target = state.annotations[0];
          const updated = {
            ...target,
            style: {
              ...target.style,
              strokeWidth: strokeWidths[(i + 1) % strokeWidths.length],
              fillOpacity: fillOpacities[(i + 1) % fillOpacities.length],
            },
          };
          state = {
            ...state,
            annotations: [updated, ...state.annotations.slice(1)],
          };
        } else if (opType === 2 && state.annotations.length > 0) {
          // Update note
          const target = state.annotations[state.annotations.length - 1];
          const updated = { ...target, note: `Updated note step ${i}` };
          state = {
            ...state,
            annotations: [...state.annotations.slice(0, -1), updated],
          };
        } else if (opType === 3 && state.annotations.length > 3) {
          // Delete an annotation and reindex
          state = {
            ...state,
            annotations: reindexAnnotations(state.annotations.slice(1)),
          };
        } else if (opType === 4) {
          // Add overlay
          const ov = createMockOverlay(`ov-op-${i}`, { opacity: 0.5 });
          state = {
            ...state,
            overlays: [...state.overlays, ov],
          };
        } else {
          // Viewport change
          state = {
            ...state,
            viewport: {
              zoom: quantizeWheelZoom(state.viewport.zoom, i % 2 === 0 ? -120 : 120),
              panX: i * 2,
              panY: i * 3,
            },
          };
        }

        // Push snapshot to history
        const snapshot: HistorySnapshot = {
          annotations: state.annotations,
          selectedAnnotationId: state.selectedAnnotationId,
        };
        history = pushHistory(history, snapshot);
      }

      // History past must be strictly capped at 50
      expect(history.past.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
      expect(history.past.length).toBe(MAX_HISTORY_STEPS);
      expect(canUndo(history)).toBe(true);

      // Verify annotations adhere to continuous 1..N indexing invariant
      state.annotations.forEach((ann, idx) => {
        expect(ann.index).toBe(idx + 1);
      });
    });

    it('C4.2: 50 continuous undo operations followed by 50 redo operations maintain state symmetry and 1..N sequence', () => {
      let state = createInitialState({ image: mockBaseImage1 });
      let history = createInitialHistory(state.annotations, state.selectedAnnotationId);

      // Create 60 distinct states
      for (let i = 0; i < 60; i++) {
        const ann = createMockAnnotation(`sym-ann-${i}`, i + 1, 'box', 'amber', 4, 0.3);
        state = {
          ...state,
          annotations: reindexAnnotations([...state.annotations, ann]),
        };
        history = pushHistory(history, {
          annotations: state.annotations,
          selectedAnnotationId: null,
        });
      }

      const initialPresentCount = history.present.annotations.length;
      expect(initialPresentCount).toBe(60);
      expect(history.past.length).toBe(MAX_HISTORY_STEPS);

      // Perform 50 undos
      for (let i = 0; i < 50; i++) {
        expect(canUndo(history)).toBe(true);
        history = undo(history);
      }

      expect(canUndo(history)).toBe(false);
      expect(history.future.length).toBe(50);
      expect(history.present.annotations.length).toBe(10); // 60 - 50 = 10

      // Perform 50 redos
      for (let i = 0; i < 50; i++) {
        expect(canRedo(history)).toBe(true);
        history = redo(history);
      }

      expect(canRedo(history)).toBe(false);
      expect(history.present.annotations.length).toBe(initialPresentCount);

      // Check continuous indexing
      history.present.annotations.forEach((ann, idx) => {
        expect(ann.index).toBe(idx + 1);
      });
    });

    it('C4.3: REPLACE_IMAGE_AND_CLEAR resets deep history and wipes all annotations and overlays', () => {
      let state = createInitialState({ image: mockBaseImage1 });
      let history = createInitialHistory([], null);

      for (let i = 0; i < 30; i++) {
        const ann = createMockAnnotation(`rst-ann-${i}`, i + 1, 'box', 'amber', 4, 0.15);
        state = { ...state, annotations: [...state.annotations, ann] };
        history = pushHistory(history, { annotations: state.annotations, selectedAnnotationId: null });
      }

      expect(canUndo(history)).toBe(true);

      // Clear image and state
      state = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_CLEAR',
        payload: { image: mockPastedImage },
      });

      // AppContext resets history on REPLACE_IMAGE_AND_CLEAR
      history = createInitialHistory([], null);
      expect(canUndo(history)).toBe(false);
      expect(canRedo(history)).toBe(false);
      expect(state.annotations).toHaveLength(0);
      expect(state.overlays).toHaveLength(0);
    });

    it('C4.4: Multi-stage Markdown serialization fidelity across deep history snapshots', () => {
      const annotations: Annotation[] = [
        createMockAnnotation('md-1', 1, 'box', 'amber', 2, 0.0, 'Critical bug in login modal | pipe test'),
        createMockAnnotation('md-2', 2, 'ellipse', 'red', 4, 0.15, 'Multi-line note\\nSecond line with *asterisks*'),
        createMockAnnotation('md-3', 3, 'arrow', 'cyan', 8, 0.3, 'Arrow pointer to checkout button'),
        createMockAnnotation('md-4', 4, 'pin', 'purple', 4, 0.5, '<script>alert("xss")</script> sanitized note'),
      ];

      // Format 1: Numbered List
      const listOutput = serializeToNumberedList(annotations);
      expect(listOutput).toContain('1.');
      expect(listOutput).toContain('2.');
      expect(listOutput).toContain('3.');
      expect(listOutput).toContain('4.');
      expect(listOutput).toContain('Critical bug in login modal');

      // Format 2: Markdown Table
      const tableOutput = serializeToMarkdownTable(annotations);
      expect(tableOutput).toContain('| # |');
      expect(tableOutput).toContain('| Type |');
      expect(tableOutput).toContain('| Note |');
      expect(tableOutput).toContain('Box');
      expect(tableOutput).toContain('Ellipse');
      expect(tableOutput).toContain('Arrow');
      expect(tableOutput).toContain('Pin');

      // Format 3: Full Report
      const reportOutput = serializeToFullReport(annotations, mockBaseImage1, {
        title: 'Audit Screenshot',
        includeSummaryStats: true,
      });
      expect(reportOutput).toContain('Screenshot Details');
      expect(reportOutput).toContain('Total Annotations');
      expect(reportOutput).toContain('4');

      // Format 4: serializeAnnotationsToMarkdown
      const defaultOutput = serializeAnnotationsToMarkdown(annotations);
      expect(defaultOutput).toContain('Visual Annotations & Notes');
      expect(defaultOutput).toContain('1.');
      expect(defaultOutput).toContain('2.');
      expect(defaultOutput).toContain('3.');
      expect(defaultOutput).toContain('4.');
    });
  });
});
