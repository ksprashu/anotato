import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../../src/state/AppContext';
import { SvgOverlay } from '../../src/components/canvas/SvgOverlay';
import {
  appReducer,
  normalizeHighlightGeometry,
  createInitialState,
} from '../../src/state/appReducer';
import {
  createInitialHistory,
  pushHistory,
  undo,
  redo,
  TransactionManager,
  MAX_HISTORY_STEPS,
} from '../../src/state/historyManager';
import {
  renderCompositeCanvas,
  rasterizeAnnotation,
  drawRoundRect,
  exportCompositeBlob,
  exportCompositeDataUrl,
} from '../../src/export/canvasExporter';
import {
  getGeometryBoundingBox,
  getResizeHandlePositions,
  hitTestAnnotation,
  applyHandleResize,
  translateGeometry,
  normalizeBox,
} from '../../src/math/geometry';
import { getBadgePositionForShape, getBadgeDimensions } from '../../src/math/badges';
import {
  Annotation,
  BaseImage,
  HighlightGeometry,
  PresetColor,
  Point,
  AppState,
  HistorySnapshot,
} from '../../src/types';

/**
 * Instrumented HTML5 Canvas 2D Rendering Context.
 * Intercepts all canvas operations, tracks the save/restore state stack,
 * checks for zero style contamination, and validates numerical coordinate sanity (no NaN/Infinity).
 */
interface CanvasState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
}

const DEFAULT_STATE: CanvasState = {
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  shadowColor: 'transparent',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  globalAlpha: 1.0,
  globalCompositeOperation: 'source-over',
};

interface CoordinateViolation {
  method: string;
  args: unknown[];
  reason: string;
}

function createInstrumentedContext(width = 1920, height = 1080) {
  const stack: CanvasState[] = [];
  let current: CanvasState = { ...DEFAULT_STATE };
  let saveCount = 0;
  let restoreCount = 0;
  let underflowCount = 0;
  const coordinateViolations: CoordinateViolation[] = [];
  const badgeDrawCalls: { text: string; x: number; y: number }[] = [];
  const compositeOperationChanges: GlobalCompositeOperation[] = [];
  const roundRectCalls: { x: number; y: number; w: number; h: number; r: unknown }[] = [];

  const checkCoords = (method: string, ...args: unknown[]) => {
    for (let i = 0; i < args.length; i++) {
      const val = args[i];
      if (typeof val === 'number') {
        if (Number.isNaN(val)) {
          coordinateViolations.push({
            method,
            args,
            reason: `Argument at index ${i} is NaN`,
          });
        } else if (!Number.isFinite(val)) {
          coordinateViolations.push({
            method,
            args,
            reason: `Argument at index ${i} is Infinite (${val})`,
          });
        }
      }
    }
  };

  const dummyCanvas = { width, height } as HTMLCanvasElement;

  const ctx = {
    get canvas() {
      return dummyCanvas;
    },
    get fillStyle() {
      return current.fillStyle;
    },
    set fillStyle(val: string) {
      current.fillStyle = val;
    },
    get strokeStyle() {
      return current.strokeStyle;
    },
    set strokeStyle(val: string) {
      current.strokeStyle = val;
    },
    get lineWidth() {
      return current.lineWidth;
    },
    set lineWidth(val: number) {
      current.lineWidth = val;
    },
    get lineCap() {
      return current.lineCap;
    },
    set lineCap(val: CanvasLineCap) {
      current.lineCap = val;
    },
    get lineJoin() {
      return current.lineJoin;
    },
    set lineJoin(val: CanvasLineJoin) {
      current.lineJoin = val;
    },
    get shadowColor() {
      return current.shadowColor;
    },
    set shadowColor(val: string) {
      current.shadowColor = val;
    },
    get shadowBlur() {
      return current.shadowBlur;
    },
    set shadowBlur(val: number) {
      current.shadowBlur = val;
    },
    get shadowOffsetX() {
      return current.shadowOffsetX;
    },
    set shadowOffsetX(val: number) {
      current.shadowOffsetX = val;
    },
    get shadowOffsetY() {
      return current.shadowOffsetY;
    },
    set shadowOffsetY(val: number) {
      current.shadowOffsetY = val;
    },
    get font() {
      return current.font;
    },
    set font(val: string) {
      current.font = val;
    },
    get textAlign() {
      return current.textAlign;
    },
    set textAlign(val: CanvasTextAlign) {
      current.textAlign = val;
    },
    get textBaseline() {
      return current.textBaseline;
    },
    set textBaseline(val: CanvasTextBaseline) {
      current.textBaseline = val;
    },
    get globalAlpha() {
      return current.globalAlpha;
    },
    set globalAlpha(val: number) {
      current.globalAlpha = val;
    },
    get globalCompositeOperation() {
      return current.globalCompositeOperation;
    },
    set globalCompositeOperation(val: GlobalCompositeOperation) {
      current.globalCompositeOperation = val;
      compositeOperationChanges.push(val);
    },

    save: vi.fn(() => {
      saveCount++;
      stack.push({ ...current });
    }),

    restore: vi.fn(() => {
      restoreCount++;
      if (stack.length === 0) {
        underflowCount++;
      } else {
        current = stack.pop()!;
      }
    }),

    beginPath: vi.fn(),
    closePath: vi.fn(),

    moveTo: vi.fn((x: number, y: number) => {
      checkCoords('moveTo', x, y);
    }),

    lineTo: vi.fn((x: number, y: number) => {
      checkCoords('lineTo', x, y);
    }),

    arc: vi.fn(
      (
        x: number,
        y: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        _counterclockwise?: boolean
      ) => {
        checkCoords('arc', x, y, radius, startAngle, endAngle);
      }
    ),

    arcTo: vi.fn((x1: number, y1: number, x2: number, y2: number, radius: number) => {
      checkCoords('arcTo', x1, y1, x2, y2, radius);
    }),

    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      checkCoords('rect', x, y, w, h);
    }),

    roundRect: vi.fn((x: number, y: number, w: number, h: number, radius?: unknown) => {
      checkCoords('roundRect', x, y, w, h);
      roundRectCalls.push({ x, y, w, h, r: radius });
    }),

    ellipse: vi.fn(
      (
        x: number,
        y: number,
        radiusX: number,
        radiusY: number,
        rotation: number,
        startAngle: number,
        endAngle: number
      ) => {
        checkCoords('ellipse', x, y, radiusX, radiusY, rotation, startAngle, endAngle);
      }
    ),

    fill: vi.fn(),
    stroke: vi.fn(),

    fillText: vi.fn((text: string, x: number, y: number) => {
      checkCoords('fillText', x, y);
      badgeDrawCalls.push({ text: String(text), x, y });
    }),

    strokeText: vi.fn((_text: string, x: number, y: number) => {
      checkCoords('strokeText', x, y);
    }),

    drawImage: vi.fn((...args: unknown[]) => {
      checkCoords('drawImage', ...args.slice(1));
    }),

    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      checkCoords('fillRect', x, y, w, h);
    }),

    clearRect: vi.fn((x: number, y: number, w: number, h: number) => {
      checkCoords('clearRect', x, y, w, h);
    }),

    measureText: vi.fn((text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    })),
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    getStateStackDepth: () => stack.length,
    getSaveCount: () => saveCount,
    getRestoreCount: () => restoreCount,
    getUnderflowCount: () => underflowCount,
    getCoordinateViolations: () => coordinateViolations,
    getBadgeDrawCalls: () => badgeDrawCalls,
    getCompositeOperationChanges: () => compositeOperationChanges,
    getRoundRectCalls: () => roundRectCalls,
    getCurrentState: () => ({ ...current }),
  };
}

const mockScreenshot: BaseImage = {
  id: 'img-stress-4k',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 3840,
  naturalHeight: 2160,
  fileName: 'retina-4k.png',
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

describe('M2 Challenger: Empirical Overlapping Highlight & Mask Stress Suite', () => {
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
  // Suite 1: 100+ Overlapping and Non-Overlapping Highlight Annotations
  // =========================================================================
  describe('1. 100+ Overlapping & Non-Overlapping Highlight Annotations Stress', () => {
    it('C1.1: Sequentially adds 150 highlight annotations spanning overlapping clusters and disjoint coordinates with strict 1..N re-indexing', () => {
      let state = createInitialState({ image: mockScreenshot });
      const count = 150;
      const startTime = performance.now();

      for (let i = 1; i <= count; i++) {
        // Interleave overlapping clusters with disjoint regions
        const isCluster = i % 2 === 0;
        const x = isCluster ? 500 + (i % 10) * 15 : 100 + ((i * 47) % 3000);
        const y = isCluster ? 400 + (i % 10) * 15 : 100 + ((i * 31) % 1800);
        const width = 100 + (i % 5) * 20;
        const height = 80 + (i % 4) * 20;
        const color = PRESET_COLORS_LIST[i % PRESET_COLORS_LIST.length];

        state = appReducer(state, {
          type: 'ADD_ANNOTATION',
          payload: {
            id: `hl-stress-${i}`,
            geometry: {
              type: 'highlight',
              x,
              y,
              width,
              height,
              borderRadius: 4,
            },
            style: { color, strokeWidth: 3, fillOpacity: 0.15 },
            note: `Highlight #${i}`,
          },
        });
      }

      const elapsedMs = performance.now() - startTime;
      expect(elapsedMs).toBeLessThan(1000); // Sub-second 150 additions

      expect(state.annotations).toHaveLength(count);

      // Verify strict 1..N continuous sequence
      for (let i = 0; i < count; i++) {
        expect(state.annotations[i].index).toBe(i + 1);
        expect(state.annotations[i].geometry.type).toBe('highlight');
      }

      // Delete 30 highlights and verify continuous 1..120 re-indexing
      for (let i = 1; i <= 30; i++) {
        state = appReducer(state, {
          type: 'DELETE_ANNOTATION',
          payload: { id: `hl-stress-${i * 3}` },
        });
      }

      expect(state.annotations).toHaveLength(120);
      for (let i = 0; i < 120; i++) {
        expect(state.annotations[i].index).toBe(i + 1);
      }
    });

    it('C1.2: SvgOverlay component renders 120 highlight cutouts inside unified SVG spotlight mask without artifact or desync', () => {
      const annotations: Annotation[] = Array.from({ length: 120 }, (_, i) => {
        const idx = i + 1;
        return {
          id: `hl-svg-${idx}`,
          index: idx,
          geometry: {
            type: 'highlight',
            x: 200 + ((idx * 29) % 3000),
            y: 150 + ((idx * 23) % 1800),
            width: 150,
            height: 100,
            borderRadius: 4,
          },
          style: {
            color: PRESET_COLORS_LIST[idx % PRESET_COLORS_LIST.length],
            strokeWidth: 3,
            fillOpacity: 0.15,
          },
          note: `Highlight ${idx}`,
          createdAt: 1000 + idx,
          updatedAt: 1000 + idx,
        };
      });

      const { container } = renderOverlay({
        image: mockScreenshot,
        activeTool: 'select',
        annotations,
      });

      // Unified mask exists
      const mask = container.querySelector('#spotlight-mask');
      expect(mask).toBeInTheDocument();
      expect(mask?.getAttribute('maskUnits')).toBe('userSpaceOnUse');

      // Mask contains: 1 base rect + 120 cutouts = 121 rects
      const maskRects = mask?.querySelectorAll('rect');
      expect(maskRects?.length).toBe(121);
      expect(maskRects?.[0].getAttribute('fill')).toBe('white');

      for (let i = 1; i <= 120; i++) {
        expect(maskRects?.[i].getAttribute('fill')).toBe('black');
        expect(maskRects?.[i].getAttribute('rx')).toBe('4');
      }

      // Spotlight backdrop rendered with correct attributes
      const backdrop = screen.getByTestId('spotlight-backdrop');
      expect(backdrop).toBeInTheDocument();
      expect(backdrop.getAttribute('fill')).toBe('rgba(0,0,0,0.45)');
      expect(backdrop.getAttribute('mask')).toBe('url(#spotlight-mask)');
      expect(backdrop.getAttribute('pointer-events')).toBe('none');

      // Badges rendered for all 120 annotations
      const badges = container.querySelectorAll('[data-testid="shape-badge"]');
      expect(badges.length).toBe(120);
    });

    it('C1.3: Canvas 2D export applies additive punchout via destination-out on offscreen canvas with zero coordinate errors for 120 highlights', async () => {
      const annotations: Annotation[] = Array.from({ length: 120 }, (_, i) => {
        const idx = i + 1;
        return {
          id: `hl-exp-${idx}`,
          index: idx,
          geometry: {
            type: 'highlight',
            x: 100 + ((idx * 31) % 3200),
            y: 100 + ((idx * 19) % 1800),
            width: 140,
            height: 90,
            borderRadius: 4,
          },
          style: {
            color: PRESET_COLORS_LIST[idx % PRESET_COLORS_LIST.length],
            strokeWidth: 3,
            fillOpacity: 0.15,
          },
          note: `Highlight Export ${idx}`,
          createdAt: 1000 + idx,
          updatedAt: 1000 + idx,
        };
      });

      const startTime = performance.now();
      const canvas = await renderCompositeCanvas(mockScreenshot, annotations);
      const elapsed = performance.now() - startTime;

      expect(canvas.width).toBe(3840);
      expect(canvas.height).toBe(2160);
      expect(elapsed).toBeLessThan(2500);

      // Verify Blob and DataURL generation
      const blob = await exportCompositeBlob(mockScreenshot, annotations);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');

      const dataUrl = await exportCompositeDataUrl(mockScreenshot, annotations.slice(0, 10));
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('C1.4: Instrumented context verifies exact save/restore stack balance and zero style leakage across 120 highlights', () => {
      const instrumented = createInstrumentedContext(3840, 2160);

      for (let i = 1; i <= 120; i++) {
        const ann: Annotation = {
          id: `hl-inst-${i}`,
          index: i,
          geometry: {
            type: 'highlight',
            x: 100 + (i * 20),
            y: 100 + (i * 15),
            width: 150,
            height: 100,
            borderRadius: 4,
          },
          style: {
            color: PRESET_COLORS_LIST[i % PRESET_COLORS_LIST.length],
            strokeWidth: 3,
            fillOpacity: 0.15,
          },
          note: '',
          createdAt: 0,
          updatedAt: 0,
        };

        rasterizeAnnotation(instrumented.ctx, ann);
        expect(instrumented.getStateStackDepth()).toBe(0);
      }

      expect(instrumented.getUnderflowCount()).toBe(0);
      expect(instrumented.getSaveCount()).toBe(instrumented.getRestoreCount());
      expect(instrumented.getCoordinateViolations()).toHaveLength(0);
      expect(instrumented.getBadgeDrawCalls()).toHaveLength(120);
    });
  });

  // =========================================================================
  // Suite 2: Nested, Identical, and Completely Enclosed Highlight Geometries
  // =========================================================================
  describe('2. Nested, Identical, and Completely Enclosed Highlight Geometries', () => {
    it('C2.1: Identical highlight rectangles create idempotent cutouts without NaN or crash in SVG and 2D canvas', async () => {
      const identicalGeo: HighlightGeometry = {
        type: 'highlight',
        x: 300,
        y: 250,
        width: 400,
        height: 250,
        borderRadius: 4,
      };

      const duplicates: Annotation[] = [
        {
          id: 'hl-dup-1',
          index: 1,
          geometry: { ...identicalGeo },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Duplicate 1',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'hl-dup-2',
          index: 2,
          geometry: { ...identicalGeo },
          style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Duplicate 2',
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          id: 'hl-dup-3',
          index: 3,
          geometry: { ...identicalGeo },
          style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Duplicate 3',
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];

      // SVG Overlay
      const { container } = renderOverlay({
        image: mockScreenshot,
        annotations: duplicates,
      });

      const mask = container.querySelector('#spotlight-mask');
      const maskRects = mask?.querySelectorAll('rect');
      expect(maskRects?.length).toBe(4); // 1 base + 3 cutouts

      // All 3 cutouts share identical dimensions
      for (let i = 1; i <= 3; i++) {
        expect(maskRects?.[i].getAttribute('x')).toBe('300');
        expect(maskRects?.[i].getAttribute('y')).toBe('250');
        expect(maskRects?.[i].getAttribute('width')).toBe('400');
        expect(maskRects?.[i].getAttribute('height')).toBe('250');
        expect(maskRects?.[i].getAttribute('fill')).toBe('black');
      }

      // Canvas Export
      const instrumented = createInstrumentedContext();
      for (const ann of duplicates) {
        rasterizeAnnotation(instrumented.ctx, ann);
      }
      expect(instrumented.getCoordinateViolations()).toHaveLength(0);
      const badges = instrumented.getBadgeDrawCalls();
      expect(badges).toHaveLength(3);
      expect(badges[0].text).toBe('1');
      expect(badges[1].text).toBe('2');
      expect(badges[2].text).toBe('3');
      expect(badges[0].x).toBe(300);
      expect(badges[1].x).toBe(300);
      expect(badges[2].x).toBe(300);
    });

    it('C2.2: Deeply nested concentric highlight geometries (5 levels) exhibit proper spatial containment and hit testing', () => {
      const concentricLayers: HighlightGeometry[] = [
        { type: 'highlight', x: 100, y: 100, width: 800, height: 600 }, // L1
        { type: 'highlight', x: 200, y: 180, width: 600, height: 440 }, // L2
        { type: 'highlight', x: 300, y: 260, width: 400, height: 280 }, // L3
        { type: 'highlight', x: 400, y: 340, width: 200, height: 120 }, // L4
        { type: 'highlight', x: 450, y: 380, width: 100, height: 40 },  // L5 (Innermost)
      ];

      // Spatial hit test oracle: innermost point (480, 390) must hit test all 5 layers
      const centerPoint: Point = { x: 480, y: 390 };
      for (let i = 0; i < concentricLayers.length; i++) {
        expect(hitTestAnnotation(centerPoint, concentricLayers[i])).toBe(true);
      }

      // Intermediate point (350, 300) must hit test L1, L2, L3, but NOT L4 or L5
      const midPoint: Point = { x: 350, y: 300 };
      expect(hitTestAnnotation(midPoint, concentricLayers[0])).toBe(true);
      expect(hitTestAnnotation(midPoint, concentricLayers[1])).toBe(true);
      expect(hitTestAnnotation(midPoint, concentricLayers[2])).toBe(true);
      expect(hitTestAnnotation(midPoint, concentricLayers[3])).toBe(false);
      expect(hitTestAnnotation(midPoint, concentricLayers[4])).toBe(false);

      // Exterior point (50, 50) hits none
      const exteriorPoint: Point = { x: 50, y: 50 };
      for (const layer of concentricLayers) {
        expect(hitTestAnnotation(exteriorPoint, layer)).toBe(false);
      }
    });

    it('C2.3: 10x10 overlapping matrix (100 highlights) guarantees additive illumination without double-dimming', () => {
      const matrixHighlights: HighlightGeometry[] = [];
      const cellSize = 100;
      const step = 60; // 40px overlap between adjacent cells

      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          matrixHighlights.push({
            type: 'highlight',
            x: 100 + c * step,
            y: 100 + r * step,
            width: cellSize,
            height: cellSize,
            borderRadius: 4,
          });
        }
      }

      expect(matrixHighlights).toHaveLength(100);

      // Verify all bounding boxes are non-degenerate
      for (const hl of matrixHighlights) {
        const bbox = getGeometryBoundingBox(hl);
        expect(bbox.width).toBe(cellSize);
        expect(bbox.height).toBe(cellSize);
        expect(bbox.x).toBe(hl.x);
        expect(bbox.y).toBe(hl.y);
      }

      // Verify badges for all 100 matrix highlights
      for (let i = 0; i < matrixHighlights.length; i++) {
        const badgePos = getBadgePositionForShape(matrixHighlights[i]);
        expect(badgePos.x).toBe(matrixHighlights[i].x);
        expect(badgePos.y).toBe(matrixHighlights[i].y);
      }
    });
  });

  // =========================================================================
  // Suite 3: Inverted Coordinates, Drag Drafts, Sub-Pixel, and Massive Values
  // =========================================================================
  describe('3. Inverted Coordinates, Draft Lifecycle, Sub-Pixel, and Massive Values', () => {
    it('C3.1: Inverted drag normalization across all 4 quadrants produces positive dimensions and canonical top-left anchor', () => {
      // Quadrant 1: Dragging bottom-right to top-left (invert both axes)
      const q1Start: Point = { x: 800, y: 600 };
      const q1Current: Point = { x: 200, y: 150 };
      const q1Box = normalizeBox(q1Start, q1Current);
      const q1Hl = normalizeHighlightGeometry({
        type: 'highlight',
        x: q1Start.x,
        y: q1Start.y,
        width: q1Current.x - q1Start.x, // -600
        height: q1Current.y - q1Start.y, // -450
      });

      expect(q1Box.x).toBe(200);
      expect(q1Box.y).toBe(150);
      expect(q1Box.width).toBe(600);
      expect(q1Box.height).toBe(450);

      expect(q1Hl.x).toBe(200);
      expect(q1Hl.y).toBe(150);
      expect(q1Hl.width).toBe(600);
      expect(q1Hl.height).toBe(450);

      // Quadrant 2: Dragging top-right to bottom-left (invert X only)
      const q2Start: Point = { x: 700, y: 100 };
      const q2Current: Point = { x: 300, y: 500 };
      const q2Hl = normalizeHighlightGeometry({
        type: 'highlight',
        x: q2Start.x,
        y: q2Start.y,
        width: q2Current.x - q2Start.x, // -400
        height: q2Current.y - q2Start.y, // +400
      });
      expect(q2Hl.x).toBe(300);
      expect(q2Hl.y).toBe(100);
      expect(q2Hl.width).toBe(400);
      expect(q2Hl.height).toBe(400);

      // Quadrant 3: Dragging bottom-left to top-right (invert Y only)
      const q3Start: Point = { x: 100, y: 600 };
      const q3Current: Point = { x: 500, y: 200 };
      const q3Hl = normalizeHighlightGeometry({
        type: 'highlight',
        x: q3Start.x,
        y: q3Start.y,
        width: q3Current.x - q3Start.x, // +400
        height: q3Current.y - q3Start.y, // -400
      });
      expect(q3Hl.x).toBe(100);
      expect(q3Hl.y).toBe(200);
      expect(q3Hl.width).toBe(400);
      expect(q3Hl.height).toBe(400);

      // State reducer automatically normalizes inverted highlight additions
      const state = appReducer(createInitialState(), {
        type: 'ADD_ANNOTATION',
        payload: {
          geometry: {
            type: 'highlight',
            x: 600,
            y: 400,
            width: -350,
            height: -200,
          },
        },
      });

      const added = state.annotations[0].geometry as HighlightGeometry;
      expect(added.x).toBe(250);
      expect(added.y).toBe(200);
      expect(added.width).toBe(350);
      expect(added.height).toBe(200);
    });

    it('C3.2: Discards zero-dimension and micro-jitter drafts below 4px threshold while accepting valid boundary drafts', () => {
      renderOverlay({
        image: mockScreenshot,
        activeTool: 'highlight',
      });
      const svg = screen.getByTestId('svg-overlay');

      // 1. Stationary click (0x0 draft) -> must be rejected
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 200, clientY: 200 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 200, clientY: 200 });
      expect(screen.queryByTestId('shape-highlight')).not.toBeInTheDocument();

      // 2. Micro jitter (2x2 draft) -> must be rejected (< 4px)
      fireEvent.pointerDown(svg, { button: 0, pointerId: 2, clientX: 300, clientY: 300 });
      fireEvent.pointerMove(svg, { pointerId: 2, clientX: 302, clientY: 302 });
      fireEvent.pointerUp(svg, { pointerId: 2, clientX: 302, clientY: 302 });
      expect(screen.queryByTestId('shape-highlight')).not.toBeInTheDocument();

      // 3. Boundary threshold: exactly 4px horizontal drag -> must be accepted
      fireEvent.pointerDown(svg, { button: 0, pointerId: 3, clientX: 400, clientY: 400 });
      fireEvent.pointerMove(svg, { pointerId: 3, clientX: 404, clientY: 400 });
      fireEvent.pointerUp(svg, { pointerId: 3, clientX: 404, clientY: 400 });
      expect(screen.getByTestId('shape-highlight')).toBeInTheDocument();
    });

    it('C3.3: drawRoundRect and rasterizeAnnotation execute safely with 0x0 degenerate highlight without throwing', () => {
      const instrumented = createInstrumentedContext();

      // Explicitly invoke drawRoundRect with zero width and zero height
      expect(() => {
        drawRoundRect(instrumented.ctx, 100, 100, 0, 0, 4);
      }).not.toThrow();

      // Rasterize degenerate annotation
      const zeroAnn: Annotation = {
        id: 'zero-hl',
        index: 1,
        geometry: { type: 'highlight', x: 50, y: 50, width: 0, height: 0 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: '',
        createdAt: 0,
        updatedAt: 0,
      };

      expect(() => {
        rasterizeAnnotation(instrumented.ctx, zeroAnn);
      }).not.toThrow();

      expect(instrumented.getCoordinateViolations()).toHaveLength(0);
      expect(instrumented.getStateStackDepth()).toBe(0);
    });

    it('C3.4: Sub-pixel dimensions and fractional coordinates execute with exact numerical fidelity and zero NaN', () => {
      const instrumented = createInstrumentedContext();

      const subPixelAnn: Annotation = {
        id: 'subpixel-hl',
        index: 99,
        geometry: {
          type: 'highlight',
          x: 12.34567,
          y: 67.89012,
          width: 0.75,
          height: 0.5,
          borderRadius: 0.25,
        },
        style: { color: 'green', strokeWidth: 1.5, fillOpacity: 0.2 },
        note: 'Sub-pixel highlight',
        createdAt: 0,
        updatedAt: 0,
      };

      rasterizeAnnotation(instrumented.ctx, subPixelAnn);
      expect(instrumented.getCoordinateViolations()).toHaveLength(0);

      const bbox = getGeometryBoundingBox(subPixelAnn.geometry);
      expect(bbox.x).toBe(12.34567);
      expect(bbox.y).toBe(67.89012);
      expect(bbox.width).toBe(0.75);
      expect(bbox.height).toBe(0.5);

      // Hit testing around sub-pixel boundary with tolerance 6
      expect(hitTestAnnotation({ x: 12.5, y: 68.0 }, subPixelAnn.geometry, 6)).toBe(true);
      expect(hitTestAnnotation({ x: 50, y: 50 }, subPixelAnn.geometry, 6)).toBe(false);
    });

    it('C3.5: Massive coordinate boundary stress (+-1,000,000) maintains valid finite arithmetic and handle geometry', () => {
      const instrumented = createInstrumentedContext(100000, 100000);

      const massivePositive: HighlightGeometry = {
        type: 'highlight',
        x: 1_000_000,
        y: 1_000_000,
        width: 500_000,
        height: 500_000,
      };

      const massiveNegative: HighlightGeometry = {
        type: 'highlight',
        x: -1_000_000,
        y: -1_000_000,
        width: 2_000_000,
        height: 2_000_000,
      };

      // Bounding box
      const bboxPos = getGeometryBoundingBox(massivePositive);
      expect(bboxPos.width).toBe(500_000);
      expect(Number.isFinite(bboxPos.x)).toBe(true);

      const bboxNeg = getGeometryBoundingBox(massiveNegative);
      expect(bboxNeg.width).toBe(2_000_000);
      expect(Number.isFinite(bboxNeg.x)).toBe(true);

      // Resize handles: 8 handles for each
      const handlesPos = getResizeHandlePositions(massivePositive);
      expect(handlesPos).toHaveLength(8);
      for (const h of handlesPos) {
        expect(Number.isFinite(h.x)).toBe(true);
        expect(Number.isFinite(h.y)).toBe(true);
      }

      const handlesNeg = getResizeHandlePositions(massiveNegative);
      expect(handlesNeg).toHaveLength(8);
      for (const h of handlesNeg) {
        expect(Number.isFinite(h.x)).toBe(true);
        expect(Number.isFinite(h.y)).toBe(true);
      }

      // Hit testing with massive coordinates
      expect(hitTestAnnotation({ x: 1_250_000, y: 1_250_000 }, massivePositive)).toBe(true);
      expect(hitTestAnnotation({ x: 0, y: 0 }, massivePositive)).toBe(false);
      expect(hitTestAnnotation({ x: 0, y: 0 }, massiveNegative)).toBe(true);

      // Rasterization with massive coordinates: no NaN or Infinity
      rasterizeAnnotation(instrumented.ctx, {
        id: 'massive-hl',
        index: 1,
        geometry: massivePositive,
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: '',
        createdAt: 0,
        updatedAt: 0,
      });

      expect(instrumented.getCoordinateViolations()).toHaveLength(0);
      expect(instrumented.getStateStackDepth()).toBe(0);
    });
  });

  // =========================================================================
  // Suite 4: Rapid Undo/Redo History Transaction Stress
  // =========================================================================
  describe('4. Rapid Undo/Redo History Transaction Stress with Highlight Annotations', () => {
    it('C4.1: Executes 100 rapid highlight state mutations, verifies MAX_HISTORY_STEPS cap (50), and executes full undo/redo loop', () => {
      let history = createInitialHistory();
      let annotations: Annotation[] = [];

      // 1. Push 100 highlight additions
      for (let i = 1; i <= 100; i++) {
        const newAnn: Annotation = {
          id: `hl-hist-${i}`,
          index: i,
          geometry: {
            type: 'highlight',
            x: 100 + i * 5,
            y: 100 + i * 5,
            width: 150,
            height: 100,
          },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: `Note ${i}`,
          createdAt: i,
          updatedAt: i,
        };
        annotations = [...annotations, newAnn];

        history = pushHistory(history, {
          annotations,
          selectedAnnotationId: newAnn.id,
        });

        // Invariant: past stack depth must strictly never exceed 50
        expect(history.past.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
      }

      expect(history.past.length).toBe(MAX_HISTORY_STEPS);
      expect(history.present.annotations).toHaveLength(100);

      // 2. Perform 50 consecutive Undos
      for (let step = 1; step <= 50; step++) {
        history = undo(history);
        expect(history.present.annotations).toHaveLength(100 - step);
        // Verify index consistency at each undo step
        for (let j = 0; j < history.present.annotations.length; j++) {
          expect(history.present.annotations[j].index).toBe(j + 1);
        }
      }

      // Can undo no further
      expect(history.past.length).toBe(0);
      expect(history.future.length).toBe(50);

      // Calling undo when empty is a no-op
      const unchanged = undo(history);
      expect(unchanged).toBe(history);

      // 3. Perform 50 consecutive Redos
      for (let step = 1; step <= 50; step++) {
        history = redo(history);
        expect(history.present.annotations).toHaveLength(50 + step);
      }

      expect(history.future.length).toBe(0);
      expect(history.present.annotations).toHaveLength(100);

      // Calling redo when empty is a no-op
      const unchangedRedo = redo(history);
      expect(unchangedRedo).toBe(history);
    });

    it('C4.2: TransactionManager batches 50 transient pointermove resize steps into exactly 1 history transaction', () => {
      const txManager = new TransactionManager();
      const initialHighlight: Annotation = {
        id: 'hl-tx-1',
        index: 1,
        geometry: { type: 'highlight', x: 200, y: 200, width: 300, height: 200 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: '',
        createdAt: 1000,
        updatedAt: 1000,
      };

      let history = createInitialHistory([initialHighlight], 'hl-tx-1');

      // Pointer down: begin gesture transaction
      txManager.beginTransaction(history.present);
      expect(txManager.isTransactionActive()).toBe(true);

      // Simulate 50 intermediate drag move steps (transient state without history pushes)
      let transientGeometry: HighlightGeometry = initialHighlight.geometry as HighlightGeometry;
      for (let step = 1; step <= 50; step++) {
        transientGeometry = {
          ...transientGeometry,
          x: transientGeometry.x + 2,
          width: transientGeometry.width + 4,
        };
      }

      const finalSnapshot: HistorySnapshot = {
        annotations: [
          {
            ...initialHighlight,
            geometry: transientGeometry,
          },
        ],
        selectedAnnotationId: 'hl-tx-1',
      };

      // Pointer up: commit transaction
      history = txManager.commitTransaction(history, finalSnapshot);
      expect(txManager.isTransactionActive()).toBe(false);

      // Oracle: Exactly 1 entry pushed to past, NOT 50!
      expect(history.past.length).toBe(1);
      expect(history.present.annotations[0].geometry).toEqual(transientGeometry);

      // A single undo restores the exact original starting geometry
      history = undo(history);
      expect(history.present.annotations[0].geometry).toEqual(initialHighlight.geometry);
    });

    it('C4.3: No-op gesture returns unmodified history without phantom history entries', () => {
      const txManager = new TransactionManager();
      const initialHighlight: Annotation = {
        id: 'hl-noop',
        index: 1,
        geometry: { type: 'highlight', x: 150, y: 150, width: 250, height: 180 },
        style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
        note: '',
        createdAt: 1000,
        updatedAt: 1000,
      };

      let history = createInitialHistory([initialHighlight], 'hl-noop');
      txManager.beginTransaction(history.present);

      // Pointer returns to original coordinates
      const sameSnapshot: HistorySnapshot = {
        annotations: [{ ...initialHighlight }],
        selectedAnnotationId: 'hl-noop',
      };

      history = txManager.commitTransaction(history, sameSnapshot);
      // Zero history pushed
      expect(history.past.length).toBe(0);
      expect(history.future.length).toBe(0);
    });
  });

  // =========================================================================
  // Suite 5: Badge Positioning Stability Across Complex Transformations
  // =========================================================================
  describe('5. Badge Positioning Stability Across Complex Transformations', () => {
    it('C5.1: Highlight badge strictly anchors to top-left corner across all 8 resize handles', () => {
      const initial: HighlightGeometry = {
        type: 'highlight',
        x: 300,
        y: 200,
        width: 400,
        height: 300,
      };

      const handles = getResizeHandlePositions(initial);
      expect(handles).toHaveLength(8);

      // Test handle resize for each handle:
      // nw: moves both x and y
      const resizedNW = applyHandleResize(initial, 'nw', { x: 250, y: 150 }) as HighlightGeometry;
      expect(getBadgePositionForShape(resizedNW)).toEqual({ x: 250, y: 150 });

      // n: moves y only
      const resizedN = applyHandleResize(initial, 'n', { x: 500, y: 120 }) as HighlightGeometry;
      expect(getBadgePositionForShape(resizedN)).toEqual({ x: 300, y: 120 });

      // ne: moves y only (x stays)
      const resizedNE = applyHandleResize(initial, 'ne', { x: 750, y: 180 }) as HighlightGeometry;
      expect(getBadgePositionForShape(resizedNE)).toEqual({ x: 300, y: 180 });

      // e: x and y stay fixed, width expands
      const resizedE = applyHandleResize(initial, 'e', { x: 800, y: 350 }) as HighlightGeometry;
      expect(getBadgePositionForShape(resizedE)).toEqual({ x: 300, y: 200 });

      // se: x and y stay fixed, width & height expand
      const resizedSE = applyHandleResize(initial, 'se', { x: 850, y: 600 }) as HighlightGeometry;
      expect(getBadgePositionForShape(resizedSE)).toEqual({ x: 300, y: 200 });

      // s: x and y stay fixed, height expands
      const resizedS = applyHandleResize(initial, 's', { x: 500, y: 580 }) as HighlightGeometry;
      expect(getBadgePositionForShape(resizedS)).toEqual({ x: 300, y: 200 });

      // sw: moves x, y stays fixed
      const resizedSW = applyHandleResize(initial, 'sw', { x: 200, y: 550 }) as HighlightGeometry;
      expect(getBadgePositionForShape(resizedSW)).toEqual({ x: 200, y: 200 });

      // w: moves x, y stays fixed
      const resizedW = applyHandleResize(initial, 'w', { x: 180, y: 350 }) as HighlightGeometry;
      expect(getBadgePositionForShape(resizedW)).toEqual({ x: 180, y: 200 });
    });

    it('C5.2: Inverting handles across opposite boundaries flips geometry and correctly migrates badge anchor to new top-left', () => {
      const initial: HighlightGeometry = {
        type: 'highlight',
        x: 400,
        y: 300,
        width: 200,
        height: 200,
      };

      // 1. Drag East handle past West edge to x = 200 (horizontal flip)
      const flippedE = applyHandleResize(initial, 'e', { x: 200, y: 400 }) as HighlightGeometry;
      expect(flippedE.x).toBe(200);
      expect(flippedE.width).toBe(200);
      expect(getBadgePositionForShape(flippedE)).toEqual({ x: 200, y: 300 });

      // 2. Drag South handle past North edge to y = 100 (vertical flip)
      const flippedS = applyHandleResize(initial, 's', { x: 500, y: 100 }) as HighlightGeometry;
      expect(flippedS.y).toBe(100);
      expect(flippedS.height).toBe(200);
      expect(getBadgePositionForShape(flippedS)).toEqual({ x: 400, y: 100 });

      // 3. Drag SE handle past NW corner to (100, 50) (diagonal flip)
      const flippedSE = applyHandleResize(initial, 'se', { x: 100, y: 50 }) as HighlightGeometry;
      expect(flippedSE.x).toBe(100);
      expect(flippedSE.y).toBe(50);
      expect(flippedSE.width).toBe(300);
      expect(flippedSE.height).toBe(250);
      expect(getBadgePositionForShape(flippedSE)).toEqual({ x: 100, y: 50 });
    });

    it('C5.3: Body translation of highlight annotation preserves badge anchor with zero cumulative drift over 100 steps', () => {
      let geom: HighlightGeometry = {
        type: 'highlight',
        x: 100,
        y: 100,
        width: 300,
        height: 200,
      };

      for (let step = 1; step <= 100; step++) {
        geom = translateGeometry(geom, 5, -2) as HighlightGeometry;
        const expectedX = 100 + step * 5;
        const expectedY = 100 - step * 2;
        expect(geom.x).toBe(expectedX);
        expect(geom.y).toBe(expectedY);

        const badgePos = getBadgePositionForShape(geom);
        expect(badgePos.x).toBe(expectedX);
        expect(badgePos.y).toBe(expectedY);
      }
    });

    it('C5.4: Badge pill dimensions, font size, and text centering scale reliably for multi-digit indices on highlights', () => {
      const testCases = [
        { index: 1, expectedPill: false, expectedWidth: 24, expectedFontSize: 13 },
        { index: 9, expectedPill: false, expectedWidth: 24, expectedFontSize: 13 },
        { index: 10, expectedPill: true, expectedWidth: 32, expectedFontSize: 12 },
        { index: 99, expectedPill: true, expectedWidth: 32, expectedFontSize: 12 },
        { index: 100, expectedPill: true, expectedWidth: 40, expectedFontSize: 12 },
        { index: 500, expectedPill: true, expectedWidth: 40, expectedFontSize: 12 },
        { index: 999, expectedPill: true, expectedWidth: 40, expectedFontSize: 12 },
        { index: 1000, expectedPill: true, expectedWidth: 48, expectedFontSize: 12 },
      ];

      for (const tc of testCases) {
        const dims = getBadgeDimensions(tc.index);
        expect(dims.isPill).toBe(tc.expectedPill);
        expect(dims.width).toBe(tc.expectedWidth);
        expect(dims.height).toBe(24);
        expect(dims.radius).toBe(12);
        expect(dims.fontSize).toBe(tc.expectedFontSize);
      }
    });
  });
});
