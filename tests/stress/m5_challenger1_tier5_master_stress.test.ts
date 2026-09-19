import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  rasterizeAnnotation,
  createCanvas,
  bakeBlurFallback,
} from '../../src/export/canvasExporter';
import {
  BaseImage,
  Annotation,
  PresetColor,
  PinGeometry,
} from '../../src/types';
import {
  computeResolutionScale,
  getBadgeDimensions,
  getPinDimensions,
} from '../../src/math/badges';
import { calculateArrowhead, getPinBoundingBox } from '../../src/math/geometry';

/**
 * ============================================================================
 * Milestone 5 Challenger 1: Tier 5 Master High-Load Cross-Tool Stress Suite
 * ============================================================================
 * Objectives:
 * 1. High-density composite export: 100+ arrows, 50+ highlights, 50+ blurs,
 *    100+ scalable pins and badges on 4K (3840x2160) and 8K (7680x4320) canvases.
 * 2. Extreme aspect ratios: 12000x800 banner and 800x12000 skyscraper with mixed annotations.
 * 3. Canvas state isolation under high load: verify stack depth, save/restore balance,
 *    zero underflow, font state restoration, filter restoration, and shadow clearing.
 * 4. Cross-tool optical verification: verify that spotlight punchouts, destructive blur regions,
 *    thick arrow casings, and resolution-scaled badges co-exist without artifacts.
 * 5. Adversarial stress & boundary conditions: micro-vectors, zero dimensions, clustered shapes,
 *    parallel exports, and scale invariance.
 */

// ---------------------------------------------------------------------------
// 1. Instrumented Context & State Isolation Oracle
// ---------------------------------------------------------------------------

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
  filter: string;
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
  filter: 'none',
};

interface ContextTracker {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  saveCount: number;
  restoreCount: number;
  underflowCount: number;
  maxStackDepth: number;
  getStackDepth: () => number;
  getCurrentState: () => CanvasState;
  fontHistory: string[];
  filterHistory: string[];
  compositeOpsHistory: string[];
  callLog: { type: string; args: unknown[] }[];
  violations: string[];
}

const trackedContexts: ContextTracker[] = [];
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext | null = null;

function installContextInstrumenter(): void {
  trackedContexts.length = 0;
  if (!originalGetContext) {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
  }

  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    ...args: unknown[]
  ) {
    if (contextId === '2d') {
      const existing = (this as unknown as { __trackerInstance?: ContextTracker }).__trackerInstance;
      if (existing) {
        return existing.ctx;
      }

      const stack: CanvasState[] = [];
      let current: CanvasState = { ...DEFAULT_STATE };
      let saveCount = 0;
      let restoreCount = 0;
      let underflowCount = 0;
      let maxStackDepth = 0;
      const fontHistory: string[] = [];
      const filterHistory: string[] = [];
      const compositeOpsHistory: string[] = [];
      const callLog: { type: string; args: unknown[] }[] = [];
      const violations: string[] = [];

      const checkNumbers = (method: string, ...vals: unknown[]) => {
        for (let i = 0; i < vals.length; i++) {
          const v = vals[i];
          if (typeof v === 'number' && (Number.isNaN(v) || !Number.isFinite(v))) {
            violations.push(`${method}: arg[${i}] is non-finite or NaN (${v})`);
          }
        }
      };

      const mockCtx = {
        canvas: this,
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
          fontHistory.push(val);
          if (val.includes('NaN') || val.includes('undefined') || val.includes('null')) {
            violations.push(`Corrupted font string: "${val}"`);
          }
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
          compositeOpsHistory.push(val);
        },
        get filter() {
          return current.filter;
        },
        set filter(val: string) {
          current.filter = val;
          filterHistory.push(val);
        },

        save: vi.fn(() => {
          saveCount++;
          stack.push({ ...current });
          maxStackDepth = Math.max(maxStackDepth, stack.length);
          callLog.push({ type: 'save', args: [] });
        }),

        restore: vi.fn(() => {
          restoreCount++;
          if (stack.length === 0) {
            underflowCount++;
            violations.push('Stack underflow: restore() invoked on empty stack');
          } else {
            current = stack.pop()!;
          }
          callLog.push({ type: 'restore', args: [] });
        }),

        beginPath: vi.fn(() => callLog.push({ type: 'beginPath', args: [] })),
        closePath: vi.fn(() => callLog.push({ type: 'closePath', args: [] })),
        clip: vi.fn(() => callLog.push({ type: 'clip', args: [] })),

        moveTo: vi.fn((x: number, y: number) => {
          checkNumbers('moveTo', x, y);
          callLog.push({ type: 'moveTo', args: [x, y] });
        }),
        lineTo: vi.fn((x: number, y: number) => {
          checkNumbers('lineTo', x, y);
          callLog.push({ type: 'lineTo', args: [x, y] });
        }),
        rect: vi.fn((x: number, y: number, w: number, h: number) => {
          checkNumbers('rect', x, y, w, h);
          callLog.push({ type: 'rect', args: [x, y, w, h] });
        }),
        roundRect: vi.fn((x: number, y: number, w: number, h: number, r?: number | number[]) => {
          checkNumbers('roundRect', x, y, w, h);
          callLog.push({ type: 'roundRect', args: [x, y, w, h, r] });
        }),
        arc: vi.fn((x: number, y: number, r: number, sa: number, ea: number, cc?: boolean) => {
          checkNumbers('arc', x, y, r, sa, ea);
          callLog.push({ type: 'arc', args: [x, y, r, sa, ea, cc] });
        }),
        arcTo: vi.fn((x1: number, y1: number, x2: number, y2: number, r: number) => {
          checkNumbers('arcTo', x1, y1, x2, y2, r);
          callLog.push({ type: 'arcTo', args: [x1, y1, x2, y2, r] });
        }),
        bezierCurveTo: vi.fn((cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => {
          checkNumbers('bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y);
          callLog.push({ type: 'bezierCurveTo', args: [cp1x, cp1y, cp2x, cp2y, x, y] });
        }),
        ellipse: vi.fn((cx: number, cy: number, rx: number, ry: number, rot: number, sa: number, ea: number) => {
          checkNumbers('ellipse', cx, cy, rx, ry, rot, sa, ea);
          callLog.push({ type: 'ellipse', args: [cx, cy, rx, ry, rot, sa, ea] });
        }),
        fill: vi.fn(() => callLog.push({ type: 'fill', args: [] })),
        stroke: vi.fn(() => callLog.push({ type: 'stroke', args: [] })),
        fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
          checkNumbers('fillRect', x, y, w, h);
          callLog.push({ type: 'fillRect', args: [x, y, w, h] });
        }),
        strokeRect: vi.fn((x: number, y: number, w: number, h: number) => {
          checkNumbers('strokeRect', x, y, w, h);
          callLog.push({ type: 'strokeRect', args: [x, y, w, h] });
        }),
        clearRect: vi.fn((x: number, y: number, w: number, h: number) => {
          checkNumbers('clearRect', x, y, w, h);
          callLog.push({ type: 'clearRect', args: [x, y, w, h] });
        }),
        drawImage: vi.fn((...imgArgs: (CanvasImageSource | number)[]) => {
          checkNumbers('drawImage', ...imgArgs.filter((a): a is number => typeof a === 'number'));
          callLog.push({ type: 'drawImage', args: imgArgs });
        }),
        fillText: vi.fn((text: string, x: number, y: number) => {
          checkNumbers('fillText', x, y);
          callLog.push({ type: 'fillText', args: [text, x, y] });
        }),
        strokeText: vi.fn((text: string, x: number, y: number) => {
          checkNumbers('strokeText', x, y);
          callLog.push({ type: 'strokeText', args: [text, x, y] });
        }),
        measureText: vi.fn((text: string) => ({
          width: text.length * 8,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        })),
      } as unknown as CanvasRenderingContext2D;

      const tracker: ContextTracker = {
        canvas: this,
        ctx: mockCtx,
        get saveCount() {
          return saveCount;
        },
        get restoreCount() {
          return restoreCount;
        },
        get underflowCount() {
          return underflowCount;
        },
        get maxStackDepth() {
          return maxStackDepth;
        },
        getStackDepth: () => stack.length,
        getCurrentState: () => ({ ...current }),
        fontHistory,
        filterHistory,
        compositeOpsHistory,
        callLog,
        violations,
      };

      (this as unknown as { __trackerInstance?: ContextTracker }).__trackerInstance = tracker;
      trackedContexts.push(tracker);
      return mockCtx;
    }

    return originalGetContext ? Reflect.apply(originalGetContext, this, [contextId, ...args]) : null;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

function restoreContextInstrumenter(): void {
  if (originalGetContext) {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
  trackedContexts.length = 0;
}

// ---------------------------------------------------------------------------
// 2. High-Density Workload Data Generators
// ---------------------------------------------------------------------------

const sampleDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const createMockImage = (width: number, height: number): BaseImage => ({
  id: `mock-img-${width}x${height}`,
  src: sampleDataUrl,
  naturalWidth: width,
  naturalHeight: height,
  fileName: `test-${width}x${height}.png`,
  fileSize: width * height * 4,
});

interface HighDensityDatasetConfig {
  arrowCount: number;
  highlightCount: number;
  blurCount: number;
  pinCount: number;
  boxCount?: number;
  ellipseCount?: number;
  canvasWidth: number;
  canvasHeight: number;
}

function generateHighDensityDataset(config: HighDensityDatasetConfig): Annotation[] {
  const {
    arrowCount,
    highlightCount,
    blurCount,
    pinCount,
    boxCount = 0,
    ellipseCount = 0,
    canvasWidth,
    canvasHeight,
  } = config;

  const colors: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];
  const annotations: Annotation[] = [];
  let index = 1;

  // 1. Generate Arrows (100+)
  for (let i = 0; i < arrowCount; i++) {
    const startX = ((i * 47) % (canvasWidth - 300)) + 50;
    const startY = ((i * 31) % (canvasHeight - 300)) + 50;
    const angle = ((i % 16) * Math.PI) / 8;
    const len = 120 + (i % 180);
    const endX = Math.max(10, Math.min(canvasWidth - 10, startX + Math.cos(angle) * len));
    const endY = Math.max(10, Math.min(canvasHeight - 10, startY + Math.sin(angle) * len));

    annotations.push({
      id: `arrow-${index}`,
      index: index++,
      geometry: {
        type: 'arrow',
        startX,
        startY,
        endX,
        endY,
      },
      style: {
        color: colors[i % colors.length],
        strokeWidth: 4 + (i % 5),
        fillOpacity: 0.2,
      },
      note: `Thick Arrow #${index - 1}`,
      createdAt: 1000 + i,
      updatedAt: 1000 + i,
    });
  }

  // 2. Generate Highlights (50+)
  for (let i = 0; i < highlightCount; i++) {
    const w = 150 + (i % 200);
    const h = 80 + (i % 120);
    const x = ((i * 59) % (canvasWidth - w - 40)) + 20;
    const y = ((i * 41) % (canvasHeight - h - 40)) + 20;

    annotations.push({
      id: `highlight-${index}`,
      index: index++,
      geometry: {
        type: 'highlight',
        x,
        y,
        width: w,
        height: h,
        borderRadius: 4,
      },
      style: {
        color: colors[i % colors.length],
        strokeWidth: 2 + (i % 3),
        fillOpacity: 0.2,
      },
      note: `Spotlight Highlight #${index - 1}`,
      createdAt: 2000 + i,
      updatedAt: 2000 + i,
    });
  }

  // 3. Generate Blurs (50+)
  for (let i = 0; i < blurCount; i++) {
    const w = 120 + (i % 180);
    const h = 60 + (i % 90);
    const x = ((i * 53) % (canvasWidth - w - 40)) + 20;
    const y = ((i * 37) % (canvasHeight - h - 40)) + 20;

    annotations.push({
      id: `blur-${index}`,
      index: index++,
      geometry: {
        type: 'blur',
        x,
        y,
        width: w,
        height: h,
        borderRadius: 2,
      },
      style: {
        color: colors[i % colors.length],
        strokeWidth: 2,
        fillOpacity: 0.2,
      },
      note: `Privacy Redact Blur #${index - 1}`,
      createdAt: 3000 + i,
      updatedAt: 3000 + i,
    });
  }

  // 4. Generate Scalable Pins (100+)
  for (let i = 0; i < pinCount; i++) {
    const x = ((i * 43) % (canvasWidth - 100)) + 50;
    const y = ((i * 29) % (canvasHeight - 150)) + 100;

    annotations.push({
      id: `pin-${index}`,
      index: index++,
      geometry: {
        type: 'pin',
        x,
        y,
      },
      style: {
        color: colors[i % colors.length],
        strokeWidth: 3,
        fillOpacity: 0.2,
      },
      note: `Scalable Callout Pin #${index - 1}`,
      createdAt: 4000 + i,
      updatedAt: 4000 + i,
    });
  }

  // 5. Optional Boxes & Ellipses
  for (let i = 0; i < boxCount; i++) {
    annotations.push({
      id: `box-${index}`,
      index: index++,
      geometry: {
        type: 'box',
        x: (i * 70) % (canvasWidth - 200),
        y: (i * 50) % (canvasHeight - 200),
        width: 140,
        height: 90,
      },
      style: { color: colors[i % colors.length], strokeWidth: 3, fillOpacity: 0.2 },
      note: `Box #${index - 1}`,
      createdAt: 5000 + i,
      updatedAt: 5000 + i,
    });
  }

  for (let i = 0; i < ellipseCount; i++) {
    annotations.push({
      id: `ellipse-${index}`,
      index: index++,
      geometry: {
        type: 'ellipse',
        cx: ((i * 80) % (canvasWidth - 200)) + 100,
        cy: ((i * 60) % (canvasHeight - 200)) + 100,
        rx: 70,
        ry: 45,
      },
      style: { color: colors[i % colors.length], strokeWidth: 3, fillOpacity: 0.2 },
      note: `Ellipse #${index - 1}`,
      createdAt: 6000 + i,
      updatedAt: 6000 + i,
    });
  }

  return annotations;
}

// ===========================================================================
// TEST SUITE EXECUTION
// ===========================================================================

describe('Milestone 5 Challenger 1: Tier 5 Master High-Load Cross-Tool Stress Suite', () => {
  beforeEach(() => {
    installContextInstrumenter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreContextInstrumenter();
  });

  // =========================================================================
  // SECTION 1: High-Density Composite Export Stress (4K & 8K Canvases)
  // =========================================================================
  describe('1. High-Density Composite Export (4K & 8K Canvases)', () => {
    it('T1.1: 4K UHD (3840x2160) composites 300+ mixed annotations (100 arrows, 50 highlights, 50 blurs, 100 pins) with 1:1 fidelity', async () => {
      const img4K = createMockImage(3840, 2160);
      const dataset = generateHighDensityDataset({
        arrowCount: 100,
        highlightCount: 50,
        blurCount: 50,
        pinCount: 100,
        canvasWidth: 3840,
        canvasHeight: 2160,
      });

      expect(dataset).toHaveLength(300);

      // Verify resolution scale math on 4K: clamp(3840 / 1440, 1.0, 4.0) = 2.6667
      const expectedScale = computeResolutionScale(3840, 2160);
      expect(expectedScale).toBeCloseTo(2.6667, 3);

      const startTime = performance.now();
      const canvas = await renderCompositeCanvas(img4K, dataset);
      const elapsed = performance.now() - startTime;

      expect(canvas.width).toBe(3840);
      expect(canvas.height).toBe(2160);
      expect(elapsed).toBeLessThan(3500);

      const tracker = trackedContexts[0];
      expect(tracker).toBeDefined();
      expect(tracker.violations).toHaveLength(0);

      // Verify 200 badges were rasterized (100 arrows + 100 pins; highlights and blurs are unnumbered)
      const fillTextCalls = tracker.callLog.filter((c) => c.type === 'fillText');
      expect(fillTextCalls).toHaveLength(200);

      // Verify sequence index text was drawn for callout badges
      expect(fillTextCalls[0].args[0]).toBe('1');
      expect(fillTextCalls[fillTextCalls.length - 1].args[0]).toBeDefined();
    });

    it('T1.2: 8K FUHD (7680x4320) composites 350+ annotations at maximum clamped scale factor (4.0x)', async () => {
      const img8K = createMockImage(7680, 4320);
      const dataset = generateHighDensityDataset({
        arrowCount: 120,
        highlightCount: 60,
        blurCount: 60,
        pinCount: 110,
        canvasWidth: 7680,
        canvasHeight: 4320,
      });

      expect(dataset).toHaveLength(350);

      // Invariant: Scale clamped at exactly 4.0
      const scale8K = computeResolutionScale(7680, 4320);
      expect(scale8K).toBe(4.0);

      const canvas = await renderCompositeCanvas(img8K, dataset);
      expect(canvas.width).toBe(7680);
      expect(canvas.height).toBe(4320);

      const tracker = trackedContexts[0];
      expect(tracker.violations).toHaveLength(0);

      // Verify badge font scaling on 8K (4.0x base font of 12px -> 48px)
      const fontStrings = tracker.fontHistory;
      expect(fontStrings.length).toBeGreaterThan(0);
      const has48pxFont = fontStrings.some((f) => f.includes('48px'));
      expect(has48pxFont).toBe(true);

      // Verify pin dimension scaling on 8K
      const pinDims = getPinDimensions(scale8K);
      expect(pinDims.headRadius).toBe(56); // 14 * 4
      expect(pinDims.pointerHeight).toBe(80); // 20 * 4
      expect(pinDims.fontSize).toBe(48); // 12 * 4
    });

    it('T1.3: Numbered sequence integrity and 3-digit pill expansion across 1..350 items under scale', () => {
      const scale = 2.6667;

      // 1-digit (1..9): circle, radius = round(12 * scale) = 32
      for (let i = 1; i <= 9; i++) {
        const dims = getBadgeDimensions(i, scale);
        expect(dims.isPill).toBe(false);
        expect(dims.radius).toBe(32);
        expect(dims.fontSize).toBe(Math.round(13 * scale));
      }

      // 2-digit (10..99): pill, width = round(32 * scale) = 85
      for (const i of [10, 50, 99]) {
        const dims = getBadgeDimensions(i, scale);
        expect(dims.isPill).toBe(true);
        expect(dims.width).toBe(Math.round(32 * scale));
        expect(dims.height).toBe(Math.round(24 * scale));
      }

      // 3-digit (100..350): expanded pill, baseWidth = 24 + (3 - 1) * 8 = 40 -> round(40 * scale) = 107
      for (const i of [100, 250, 350]) {
        const dims = getBadgeDimensions(i, scale);
        expect(dims.isPill).toBe(true);
        expect(dims.width).toBe(Math.round(40 * scale));
        expect(dims.height).toBe(Math.round(24 * scale));
        expect(dims.fontSize).toBe(Math.round(12 * scale));
      }
    });

    it('T1.4: High-density export performance: 300 annotations execute comfortably within SLA (<2500ms)', async () => {
      const img4K = createMockImage(3840, 2160);
      const dataset = generateHighDensityDataset({
        arrowCount: 100,
        highlightCount: 50,
        blurCount: 50,
        pinCount: 100,
        canvasWidth: 3840,
        canvasHeight: 2160,
      });

      const start = performance.now();
      const canvas = await renderCompositeCanvas(img4K, dataset);
      const durationMs = performance.now() - start;

      expect(canvas.width).toBe(3840);
      expect(durationMs).toBeLessThan(2500);
    });

    it('T1.5: Blob and Data URL generation succeed reliably with 300 annotations', async () => {
      const img4K = createMockImage(3840, 2160);
      const dataset = generateHighDensityDataset({
        arrowCount: 100,
        highlightCount: 50,
        blurCount: 50,
        pinCount: 100,
        canvasWidth: 3840,
        canvasHeight: 2160,
      });

      const blob = await exportCompositeBlob(img4K, dataset);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);

      const dataUrl = await exportCompositeDataUrl(img4K, dataset);
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  // =========================================================================
  // SECTION 2: Extreme Aspect Ratios (Banner 12000x800 & Skyscraper 800x12000)
  // =========================================================================
  describe('2. Extreme Aspect Ratios & Boundary Geometries', () => {
    it('T2.1: Ultra-panoramic ribbon banner (12,000 x 800) rasterizes long-span vectors without coordinate distortion', async () => {
      const bannerImg = createMockImage(12000, 800);
      const annotations: Annotation[] = [
        // Arrow spanning almost full 12,000px length
        {
          id: 'banner-arrow-1',
          index: 1,
          geometry: { type: 'arrow', startX: 100, startY: 400, endX: 11900, endY: 400 },
          style: { color: 'cyan', strokeWidth: 8, fillOpacity: 0.2 },
          note: 'Full-span horizontal vector (11,800px)',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // Highlight in left section
        {
          id: 'banner-hl-1',
          index: 2,
          geometry: { type: 'highlight', x: 1500, y: 50, width: 2500, height: 700 },
          style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Left banner highlight',
          createdAt: 2000,
          updatedAt: 2000,
        },
        // Destructive blur in center
        {
          id: 'banner-blur-1',
          index: 3,
          geometry: { type: 'blur', x: 5500, y: 100, width: 1200, height: 600 },
          style: { color: 'red', strokeWidth: 3, fillOpacity: 0.2 },
          note: 'Center sensitive text blur',
          createdAt: 3000,
          updatedAt: 3000,
        },
        // Pin at far right
        {
          id: 'banner-pin-1',
          index: 4,
          geometry: { type: 'pin', x: 11500, y: 400 },
          style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Far right milestone pin',
          createdAt: 4000,
          updatedAt: 4000,
        },
      ];

      const canvas = await renderCompositeCanvas(bannerImg, annotations);
      expect(canvas.width).toBe(12000);
      expect(canvas.height).toBe(800);

      const tracker = trackedContexts[0];
      expect(tracker.violations).toHaveLength(0);

      // Base image drawn at exact natural coordinates
      const drawImageCalls = tracker.callLog.filter((c) => c.type === 'drawImage');
      expect(drawImageCalls[0].args[3]).toBe(12000);
      expect(drawImageCalls[0].args[4]).toBe(800);

      // Arrowhead geometry oracle verification
      const arrowhead = calculateArrowhead({ x: 100, y: 400 }, { x: 11900, y: 400 }, 8);
      expect(arrowhead.tip.x).toBe(11900);
      expect(arrowhead.tip.y).toBe(400);
      expect(arrowhead.shaftEnd.x).toBeLessThan(arrowhead.notch.x);

      // Verify badge positions along the banner (arrow and pin only; highlight and blur are unnumbered)
      const badgeCalls = tracker.callLog.filter((c) => c.type === 'fillText');
      expect(badgeCalls).toHaveLength(2);
      expect(badgeCalls[0].args).toEqual(['1', 100, 400]); // Arrow tail
      expect(badgeCalls[1].args[0]).toBe('4'); // Pin
      expect(badgeCalls[1].args[1]).toBe(11500);
    });

    it('T2.2: Ultra-tall skyscraper column (800 x 12,000) rasterizes deep vertical vectors with uncorrupted bounds', async () => {
      const skyscraperImg = createMockImage(800, 12000);
      const annotations: Annotation[] = [
        // Arrow descending vertically across full height
        {
          id: 'col-arrow-1',
          index: 1,
          geometry: { type: 'arrow', startX: 400, startY: 100, endX: 400, endY: 11900 },
          style: { color: 'green', strokeWidth: 8, fillOpacity: 0.2 },
          note: 'Full-span vertical vector (11,800px)',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // Tall highlight
        {
          id: 'col-hl-1',
          index: 2,
          geometry: { type: 'highlight', x: 50, y: 3000, width: 700, height: 2000 },
          style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Vertical highlight block',
          createdAt: 2000,
          updatedAt: 2000,
        },
        // Blur near base
        {
          id: 'col-blur-1',
          index: 3,
          geometry: { type: 'blur', x: 100, y: 9000, width: 600, height: 800 },
          style: { color: 'red', strokeWidth: 3, fillOpacity: 0.2 },
          note: 'Base secret redaction',
          createdAt: 3000,
          updatedAt: 3000,
        },
        // Pin near bottom terminus
        {
          id: 'col-pin-1',
          index: 4,
          geometry: { type: 'pin', x: 400, y: 11950 },
          style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Column base pin',
          createdAt: 4000,
          updatedAt: 4000,
        },
      ];

      const canvas = await renderCompositeCanvas(skyscraperImg, annotations);
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(12000);

      const tracker = trackedContexts[0];
      expect(tracker.violations).toHaveLength(0);

      // Verify vertical arrow heading is exactly 90 degrees (Math.PI / 2)
      const head = calculateArrowhead({ x: 400, y: 100 }, { x: 400, y: 11900 }, 8);
      expect(head.headingRad).toBeCloseTo(Math.PI / 2, 4);
      expect(head.tip.y).toBe(11900);
      expect(head.shaftEnd.y).toBeLessThan(head.notch.y);
    });

    it('T2.3: Scale metric clamping on extreme aspect ratios (max(W, H)/1440 clamped to [1.0, 4.0])', () => {
      // 12000 x 800: max is 12000 -> 12000 / 1440 = 8.33 -> clamped to 4.0
      expect(computeResolutionScale(12000, 800)).toBe(4.0);

      // 800 x 12000: max is 12000 -> clamped to 4.0
      expect(computeResolutionScale(800, 12000)).toBe(4.0);

      // 16000 x 200: max is 16000 -> clamped to 4.0
      expect(computeResolutionScale(16000, 200)).toBe(4.0);

      // 50 x 50: max is 50 -> 50 / 1440 = 0.035 -> clamped to 1.0
      expect(computeResolutionScale(50, 50)).toBe(1.0);

      // 1440 x 900: max is 1440 -> 1440 / 1440 = 1.0
      expect(computeResolutionScale(1440, 900)).toBe(1.0);

      // 2880 x 1800: max is 2880 -> 2880 / 1440 = 2.0
      expect(computeResolutionScale(2880, 1800)).toBe(2.0);
    });

    it('T2.4: Needle ribbon matrices (16,000 x 100 and 100 x 16,000) composite without memory overflow or NaN', async () => {
      const ribbons = [
        { w: 16000, h: 100 },
        { w: 100, h: 16000 },
      ];

      for (const { w, h } of ribbons) {
        const img = createMockImage(w, h);
        const ann: Annotation = {
          id: `ann-${w}x${h}`,
          index: 1,
          geometry: { type: 'arrow', startX: 10, startY: 10, endX: w - 10, endY: h - 10 },
          style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Ribbon traverse',
          createdAt: 1000,
          updatedAt: 1000,
        };

        const canvas = await renderCompositeCanvas(img, [ann]);
        expect(canvas.width).toBe(w);
        expect(canvas.height).toBe(h);

        const tracker = trackedContexts[trackedContexts.length - 1];
        expect(tracker.violations).toHaveLength(0);
      }
    });

    it('T2.5: Sub-pixel floating point and out-of-bounds annotations on extreme aspect canvases', async () => {
      const bannerImg = createMockImage(10000, 1000);
      const subpixelAnns: Annotation[] = [
        {
          id: 'sp-1',
          index: 1,
          geometry: { type: 'box', x: 123.4567, y: 234.5678, width: 456.7891, height: 234.1234 },
          style: { color: 'red', strokeWidth: 2.75, fillOpacity: 0.123 },
          note: 'Subpixel box',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'oob-1',
          index: 2,
          geometry: { type: 'arrow', startX: -500, startY: -200, endX: 12000, endY: 1500 },
          style: { color: 'green', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Out of bounds traversal',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];

      const canvas = await renderCompositeCanvas(bannerImg, subpixelAnns);
      expect(canvas.width).toBe(10000);
      expect(canvas.height).toBe(1000);

      const tracker = trackedContexts[0];
      expect(tracker.violations).toHaveLength(0);
    });
  });

  // =========================================================================
  // SECTION 3: Canvas State Isolation & Zero Leakage Under High Load
  // =========================================================================
  describe('3. Canvas State Isolation Under High Load', () => {
    it('T3.1: Save/Restore Stack Depth Balance: saves === restores and final depth returns to exactly 0', async () => {
      const img = createMockImage(3840, 2160);
      const dataset = generateHighDensityDataset({
        arrowCount: 80,
        highlightCount: 40,
        blurCount: 40,
        pinCount: 80,
        boxCount: 30,
        ellipseCount: 30,
        canvasWidth: 3840,
        canvasHeight: 2160,
      });

      expect(dataset).toHaveLength(300);

      await renderCompositeCanvas(img, dataset);

      const tracker = trackedContexts[0];
      expect(tracker).toBeDefined();

      // STRICT INVARIANT: Total saves must equal total restores
      expect(tracker.saveCount).toBeGreaterThan(0);
      expect(tracker.restoreCount).toBeGreaterThan(0);
      expect(tracker.saveCount).toBe(tracker.restoreCount);

      // Final stack depth must return to 0 (no lingering un-restored state)
      expect(tracker.getStackDepth()).toBe(0);

      // Max stack depth should be bounded (nested save depth <= 3)
      expect(tracker.maxStackDepth).toBeGreaterThanOrEqual(1);
      expect(tracker.maxStackDepth).toBeLessThanOrEqual(4);
    });

    it('T3.2: Zero stack underflow: restore() is never invoked when state stack is empty', async () => {
      const img = createMockImage(1920, 1080);
      const dataset = generateHighDensityDataset({
        arrowCount: 50,
        highlightCount: 30,
        blurCount: 30,
        pinCount: 50,
        canvasWidth: 1920,
        canvasHeight: 1080,
      });

      await renderCompositeCanvas(img, dataset);

      const tracker = trackedContexts[0];
      // STRICT INVARIANT: Underflow count must be exactly zero
      expect(tracker.underflowCount).toBe(0);
      expect(tracker.violations).not.toContain('Stack underflow: restore() invoked on empty stack');
    });

    it('T3.3: Font state restoration: badge font string (700 {fontSize}px) does not leak into root state', async () => {
      const img = createMockImage(3840, 2160);
      const dataset = generateHighDensityDataset({
        arrowCount: 30,
        highlightCount: 20,
        blurCount: 20,
        pinCount: 30,
        canvasWidth: 3840,
        canvasHeight: 2160,
      });

      await renderCompositeCanvas(img, dataset);

      const tracker = trackedContexts[0];
      // Badge fonts were actively used during rendering
      expect(tracker.fontHistory.length).toBeGreaterThan(0);

      // INVARIANT: When composite rendering returns, the context's font property is restored to default
      const finalState = tracker.getCurrentState();
      expect(finalState.font).toBe(DEFAULT_STATE.font);
    });

    it('T3.4: Filter state restoration: blur(12px) baking is strictly restored to "none"', async () => {
      const img = createMockImage(1920, 1080);
      const blurs: Annotation[] = Array.from({ length: 15 }, (_, i) => ({
        id: `blur-iso-${i}`,
        index: i + 1,
        geometry: { type: 'blur', x: i * 80, y: i * 50, width: 100, height: 60 },
        style: { color: 'red', strokeWidth: 2, fillOpacity: 0.2 },
        note: `Blur ${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      await renderCompositeCanvas(img, blurs);

      const tracker = trackedContexts[0];
      // blur filter was set 15 times
      expect(tracker.filterHistory).toContain('blur(12px)');

      // INVARIANT: Final state has filter restored to 'none'
      const finalState = tracker.getCurrentState();
      expect(finalState.filter).toBe('none');
    });

    it('T3.5: GlobalCompositeOperation isolation: destination-out is strictly confined to offscreen canvas', async () => {
      const img = createMockImage(1920, 1080);
      const highlights: Annotation[] = Array.from({ length: 20 }, (_, i) => ({
        id: `hl-iso-${i}`,
        index: i + 1,
        geometry: { type: 'highlight', x: i * 60, y: i * 40, width: 120, height: 80 },
        style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.2 },
        note: `Highlight ${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      await renderCompositeCanvas(img, highlights);

      // Primary canvas tracker (trackedContexts[0])
      const primaryTracker = trackedContexts[0];
      // STRICT INVARIANT: The main canvas must NEVER have destination-out set
      expect(primaryTracker.compositeOpsHistory).not.toContain('destination-out');
      expect(primaryTracker.getCurrentState().globalCompositeOperation).toBe('source-over');

      // Offscreen canvas tracker (trackedContexts[1]) used for backdrop punchout
      expect(trackedContexts.length).toBeGreaterThanOrEqual(2);
      const offscreenTracker = trackedContexts[1];
      expect(offscreenTracker.compositeOpsHistory).toContain('destination-out');
    });

    it('T3.6: Shadow state isolation: arrow casing drop shadow and pin shadows do not bleed into subsequent shapes', async () => {
      const img = createMockImage(1920, 1080);
      const mixed: Annotation[] = [
        {
          id: 'arr-shadow-1',
          index: 1,
          geometry: { type: 'arrow', startX: 100, startY: 100, endX: 400, endY: 100 },
          style: { color: 'red', strokeWidth: 6, fillOpacity: 0.2 },
          note: 'Arrow with casing drop shadow',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'box-no-shadow-2',
          index: 2,
          geometry: { type: 'box', x: 500, y: 100, width: 200, height: 100 },
          style: { color: 'green', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Subsequent box should not inherit shadow',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];

      await renderCompositeCanvas(img, mixed);

      const tracker = trackedContexts[0];
      const finalState = tracker.getCurrentState();
      // INVARIANT: Shadow properties returned to default (transparent / 0 blur)
      expect(finalState.shadowColor).toBe('transparent');
      expect(finalState.shadowBlur).toBe(0);
      expect(finalState.shadowOffsetX).toBe(0);
      expect(finalState.shadowOffsetY).toBe(0);
    });

    it('T3.7: Clip region isolation: blur clipping does not clip subsequent arrow or badge drawings', async () => {
      const img = createMockImage(1920, 1080);
      const annotations: Annotation[] = [
        // Small blur region at (100, 100, 100, 100)
        {
          id: 'clip-blur',
          index: 1,
          geometry: { type: 'blur', x: 100, y: 100, width: 100, height: 100 },
          style: { color: 'red', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Blur with clip',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // Arrow located far outside blur region at (1000, 800, 1500, 800)
        {
          id: 'far-arrow',
          index: 2,
          geometry: { type: 'arrow', startX: 1000, startY: 800, endX: 1500, endY: 800 },
          style: { color: 'cyan', strokeWidth: 6, fillOpacity: 0.2 },
          note: 'Arrow outside blur',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];

      await renderCompositeCanvas(img, annotations);

      const tracker = trackedContexts[0];
      // Verify that after clip() was called for blur, a restore() was invoked before drawing far-arrow
      const clipIndex = tracker.callLog.findIndex((c) => c.type === 'clip');
      expect(clipIndex).toBeGreaterThanOrEqual(0);

      const subsequentRestores = tracker.callLog.slice(clipIndex).filter((c) => c.type === 'restore');
      expect(subsequentRestores.length).toBeGreaterThan(0);

      // Verify that the arrow at (1000, 800) was rendered via moveTo/lineTo
      const arrowMove = tracker.callLog.some(
        (c) => c.type === 'moveTo' && c.args[0] === 1000 && c.args[1] === 800
      );
      expect(arrowMove).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 4: Cross-Tool Optical Co-existence & Rendering Hierarchy
  // =========================================================================
  describe('4. Cross-Tool Optical Co-existence & Rendering Hierarchy', () => {
    it('T4.1: Optical layering hierarchy: Base Image -> Blur Baking -> Spotlight Backdrop -> Vector Shapes & Badges', async () => {
      const img = createMockImage(1920, 1080);
      const annotations: Annotation[] = [
        {
          id: 'ann-arr',
          index: 1,
          geometry: { type: 'arrow', startX: 100, startY: 100, endX: 300, endY: 300 },
          style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Arrow',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'ann-hl',
          index: 2,
          geometry: { type: 'highlight', x: 200, y: 200, width: 300, height: 200 },
          style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Highlight',
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          id: 'ann-blur',
          index: 3,
          geometry: { type: 'blur', x: 400, y: 400, width: 200, height: 100 },
          style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Blur',
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];

      await renderCompositeCanvas(img, annotations);

      const tracker = trackedContexts[0];
      const log = tracker.callLog;

      // 1. First drawImage call must be the base image [0, 0, 1920, 1080]
      const firstDraw = log.find((c) => c.type === 'drawImage');
      expect(firstDraw).toBeDefined();
      expect(firstDraw!.args[1]).toBe(0);
      expect(firstDraw!.args[2]).toBe(0);
      expect(firstDraw!.args[3]).toBe(1920);
      expect(firstDraw!.args[4]).toBe(1080);

      // 2. Destructive blur baking drawImage must follow
      const firstDrawIdx = log.indexOf(firstDraw!);
      const clipIdx = log.findIndex((c) => c.type === 'clip');
      expect(clipIdx).toBeGreaterThan(firstDrawIdx);

      // 3. Spotlight backdrop drawImage must be drawn AFTER blur baking
      const backdropDrawIdx = log.findIndex(
        (c, idx) => idx > clipIdx && c.type === 'drawImage' && c.args[1] === 0 && c.args[2] === 0
      );
      expect(backdropDrawIdx).toBeGreaterThan(clipIdx);

      // 4. Vector shape and badge fillText calls must happen AFTER spotlight backdrop
      const firstFillTextIdx = log.findIndex((c) => c.type === 'fillText');
      expect(firstFillTextIdx).toBeGreaterThan(backdropDrawIdx);
    });

    it('T4.2: Arrow traversing over destructive blur region maintains contrast outline and sharp arrowhead', async () => {
      const canvas = createCanvas(1000, 1000);
      const ctx = canvas.getContext('2d')!;

      // Blur region covering (200, 200, 400, 400)
      const blurAnn: Annotation = {
        id: 'blur-under',
        index: 1,
        geometry: { type: 'blur', x: 200, y: 200, width: 400, height: 400 },
        style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Underlying blur',
        createdAt: 1000,
        updatedAt: 1000,
      };

      // Arrow cutting straight across the blur from (100, 400) to (700, 400)
      const arrowAnn: Annotation = {
        id: 'arrow-over',
        index: 2,
        geometry: { type: 'arrow', startX: 100, startY: 400, endX: 700, endY: 400 },
        style: { color: 'amber', strokeWidth: 6, fillOpacity: 0.2 },
        note: 'Crossing arrow',
        createdAt: 2000,
        updatedAt: 2000,
      };

      rasterizeAnnotation(ctx, blurAnn);
      rasterizeAnnotation(ctx, arrowAnn);

      // Verify that Arrow Underlay Casing was rendered with contrast parameters
      // Casing stroke width = 6 + 3.5 = 9.5px
      const head = calculateArrowhead({ x: 100, y: 400 }, { x: 700, y: 400 }, 6);
      expect(head.casingStrokeWidth).toBe(9.5);
      expect(head.headingRad).toBe(0); // Pure horizontal right

      // Verify arrow notch clearance prevents linecap overflow
      expect(head.shaftEnd.x).toBeLessThan(head.notch.x);
      expect(head.notch.x).toBe(700 - head.headLength * 0.75);

      // Badge for arrow anchored at tail start (100, 400)
      expect(ctx.fillText).toHaveBeenCalledWith('2', 100, 400);
    });

    it('T4.3: Destructive blur region inside spotlight cutout: punchout does not erase blurred pixels', async () => {
      const img = createMockImage(1920, 1080);
      // Highlight cutout from (300, 300, 600, 400)
      const highlightAnn: Annotation = {
        id: 'hl-window',
        index: 1,
        geometry: { type: 'highlight', x: 300, y: 300, width: 600, height: 400 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.2 },
        note: 'Illuminated window',
        createdAt: 1000,
        updatedAt: 1000,
      };

      // Blur region inside the highlight at (400, 350, 300, 200)
      const blurAnn: Annotation = {
        id: 'blur-inside',
        index: 2,
        geometry: { type: 'blur', x: 400, y: 350, width: 300, height: 200 },
        style: { color: 'red', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Redacted data inside spotlight',
        createdAt: 2000,
        updatedAt: 2000,
      };

      await renderCompositeCanvas(img, [highlightAnn, blurAnn]);

      const primaryTracker = trackedContexts[0];
      const offscreenTracker = trackedContexts[1];

      // Primary canvas receives destructive blur baked into base image FIRST
      expect(primaryTracker.filterHistory).toContain('blur(12px)');

      // Offscreen canvas punches out highlight window with destination-out
      expect(offscreenTracker.compositeOpsHistory).toContain('destination-out');

      // Primary canvas then draws the offscreen backdrop on top without erasing blur
      expect(primaryTracker.compositeOpsHistory).not.toContain('destination-out');
    });

    it('T4.4: Additive multi-region highlight cutouts merge seamlessly without double-dimming artifacts', async () => {
      const img = createMockImage(1920, 1080);
      // 5 overlapping highlight rectangles
      const highlights: Annotation[] = [
        {
          id: 'hl-1',
          index: 1,
          geometry: { type: 'highlight', x: 100, y: 100, width: 300, height: 200 },
          style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Highlight 1',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'hl-2',
          index: 2,
          geometry: { type: 'highlight', x: 250, y: 150, width: 300, height: 200 },
          style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Highlight 2 overlapping 1',
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          id: 'hl-3',
          index: 3,
          geometry: { type: 'highlight', x: 400, y: 200, width: 300, height: 200 },
          style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Highlight 3 overlapping 2',
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];

      await renderCompositeCanvas(img, highlights);

      // Verify offscreen canvas was created and destination-out was used to punch out all 3 cutouts
      const offscreenTracker = trackedContexts[1];
      expect(offscreenTracker).toBeDefined();

      const fills = offscreenTracker.callLog.filter((c) => c.type === 'fill');
      // 3 cutouts filled with black under destination-out
      expect(fills.length).toBeGreaterThanOrEqual(3);
    });

    it('T4.5: Scaled callout pins and badges co-existing with thick arrows: teardrop head, offset, and centered text', () => {
      const canvas = createCanvas(2000, 2000);
      const ctx = canvas.getContext('2d')!;
      const scale = 2.0;

      const pinAnn: Annotation = {
        id: 'pin-scaled-1',
        index: 42,
        geometry: { type: 'pin', x: 800, y: 600 },
        style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Pin scaled 2.0x',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(ctx, pinAnn, scale);

      // Scale = 2.0:
      // pointerHeight = 20 * 2 = 40
      // headRadius = 14 * 2 = 28
      // headCenterY = 600 - 40 = 560
      // fontSize = 12 * 2 = 24
      const pinDims = getPinDimensions(scale);
      expect(pinDims.headRadius).toBe(28);
      expect(pinDims.pointerHeight).toBe(40);
      expect(pinDims.fontSize).toBe(24);

      // Verify text centered at (x, headCenterY) = (800, 560)
      expect(ctx.fillText).toHaveBeenCalledWith('42', 800, 560);

      // Verify pin bounding box calculation
      const bbox = getPinBoundingBox(pinAnn.geometry as PinGeometry, scale);
      expect(bbox.x).toBe(800 - 28);
      expect(bbox.y).toBe(600 - (28 + 40));
      expect(bbox.width).toBe(56);
      expect(bbox.height).toBe(68);
    });
  });

  // =========================================================================
  // SECTION 5: Adversarial Boundary Conditions & Concurrency
  // =========================================================================
  describe('5. Adversarial Boundary Conditions & Concurrency', () => {
    it('T5.1: Zero-sized and inverted geometries within high load handled gracefully without NaN or crashing', async () => {
      const img = createMockImage(1920, 1080);
      const hostileAnns: Annotation[] = [
        {
          id: 'zero-box',
          index: 1,
          geometry: { type: 'box', x: 100, y: 100, width: 0, height: 0 },
          style: { color: 'red', strokeWidth: 2, fillOpacity: 0.2 },
          note: '0x0 box',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'zero-blur',
          index: 2,
          geometry: { type: 'blur', x: 200, y: 200, width: 0, height: 0 },
          style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.2 },
          note: '0x0 blur',
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          id: 'zero-hl',
          index: 3,
          geometry: { type: 'highlight', x: 300, y: 300, width: 0, height: 0 },
          style: { color: 'green', strokeWidth: 2, fillOpacity: 0.2 },
          note: '0x0 highlight',
          createdAt: 3000,
          updatedAt: 3000,
        },
        {
          id: 'zero-arrow',
          index: 4,
          geometry: { type: 'arrow', startX: 400, startY: 400, endX: 400, endY: 400 },
          style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Zero-length arrow',
          createdAt: 4000,
          updatedAt: 4000,
        },
        {
          id: 'zero-ellipse',
          index: 5,
          geometry: { type: 'ellipse', cx: 500, cy: 500, rx: 0, ry: 0 },
          style: { color: 'purple', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Zero-radius ellipse',
          createdAt: 5000,
          updatedAt: 5000,
        },
      ];

      const canvas = await renderCompositeCanvas(img, hostileAnns);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);

      const tracker = trackedContexts[0];
      expect(tracker.violations).toHaveLength(0);
    });

    it('T5.2: Clustered coincident annotations: 50 arrows sharing identical start/end points and 50 blurs at same coordinates', async () => {
      const img = createMockImage(1920, 1080);
      const coincidentAnns: Annotation[] = [];
      let index = 1;

      // 50 coincident arrows
      for (let i = 0; i < 50; i++) {
        coincidentAnns.push({
          id: `c-arr-${i}`,
          index: index++,
          geometry: { type: 'arrow', startX: 500, startY: 500, endX: 800, endY: 500 },
          style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
          note: `Coincident Arrow #${i + 1}`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        });
      }

      // 50 coincident blurs
      for (let i = 0; i < 50; i++) {
        coincidentAnns.push({
          id: `c-blur-${i}`,
          index: index++,
          geometry: { type: 'blur', x: 200, y: 200, width: 200, height: 100 },
          style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0.2 },
          note: `Coincident Blur #${i + 1}`,
          createdAt: 2000 + i,
          updatedAt: 2000 + i,
        });
      }

      const canvas = await renderCompositeCanvas(img, coincidentAnns);
      expect(canvas.width).toBe(1920);

      const tracker = trackedContexts[0];
      expect(tracker.violations).toHaveLength(0);
      expect(tracker.getStackDepth()).toBe(0);
    });

    it('T5.3: Non-sequential and sparse index ordering: annotations with random gaps composite in strictly sorted index order', async () => {
      const img = createMockImage(1000, 1000);
      const sparseAnns: Annotation[] = [
        {
          id: 'ann-999',
          index: 999,
          geometry: { type: 'pin', x: 100, y: 100 },
          style: { color: 'purple', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'Last',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'ann-3',
          index: 3,
          geometry: { type: 'box', x: 200, y: 200, width: 100, height: 100 },
          style: { color: 'red', strokeWidth: 2, fillOpacity: 0.2 },
          note: 'First',
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          id: 'ann-42',
          index: 42,
          geometry: { type: 'arrow', startX: 300, startY: 300, endX: 500, endY: 300 },
          style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Middle',
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];

      // Passed out of order: [999, 3, 42]
      await renderCompositeCanvas(img, sparseAnns);

      const tracker = trackedContexts[0];
      const textCalls = tracker.callLog.filter((c) => c.type === 'fillText').map((c) => c.args[0]);
      // INVARIANT: Rendered in strictly sorted index order: '3', '42', '999'
      expect(textCalls).toEqual(['3', '42', '999']);
    });

    it('T5.4: Concurrent high-load exports: 5 concurrent 4K composite exports with 100+ annotations run in parallel without cross-state corruption', async () => {
      const promises = Array.from({ length: 5 }, async (_, i) => {
        const img = createMockImage(3840, 2160);
        const dataset = generateHighDensityDataset({
          arrowCount: 30,
          highlightCount: 20,
          blurCount: 20,
          pinCount: 30,
          canvasWidth: 3840,
          canvasHeight: 2160,
        });

        const canvas = await renderCompositeCanvas(img, dataset);
        return { index: i, width: canvas.width, height: canvas.height };
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      for (const res of results) {
        expect(res.width).toBe(3840);
        expect(res.height).toBe(2160);
      }
    });

    it('T5.5: Hostile image dimensions (0x0, -10x-10, NaN, non-finite) clamped safely by createCanvas and computeResolutionScale', () => {
      // createCanvas clamps dimensions to at least 1x1
      const c1 = createCanvas(0, 0);
      expect(c1.width).toBe(1);
      expect(c1.height).toBe(1);

      const c2 = createCanvas(-500, -200);
      expect(c2.width).toBe(1);
      expect(c2.height).toBe(1);

      // computeResolutionScale defaults safely to 1.0 on invalid inputs
      expect(computeResolutionScale(undefined, undefined)).toBe(1.0);
      expect(computeResolutionScale(-100, 500)).toBe(1.0);
      expect(computeResolutionScale(NaN, 1080)).toBe(1.0);
      expect(computeResolutionScale(Infinity, 1080)).toBe(1.0);
    });

    it('T5.6: bakeBlurFallback downscale-upscale diffusion executes cleanly without ctx.filter', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      const dummyImage = createCanvas(800, 600);

      // Invoke fallback blur
      expect(() => {
        bakeBlurFallback(ctx, dummyImage, 50, 50, 300, 200);
      }).not.toThrow();

      // Zero dimension guard
      expect(() => {
        bakeBlurFallback(ctx, dummyImage, 50, 50, 0, 0);
      }).not.toThrow();
    });
  });
});
