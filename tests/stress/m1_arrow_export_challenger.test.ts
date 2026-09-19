import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  rasterizeAnnotation,
} from '../../src/export/canvasExporter';
import { calculateArrowhead } from '../../src/math/geometry';
import { getBadgeDimensions } from '../../src/math/badges';
import { BaseImage, Annotation, PresetColor, Point } from '../../src/types';

/**
 * Stateful Canvas 2D Context Emulator and Instrumentor.
 * Accurately tracks HTML5 Canvas 2D state stack (save/restore),
 * enforces zero style leakage across draw calls,
 * and intercepts all numerical coordinates to guarantee zero NaN/Infinity.
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
  args: any[];
  reason: string;
}

interface ShadowLeakCheck {
  phase: string;
  shadowColor: string;
  shadowBlur: number;
}

export function createInstrumentedContext(): {
  ctx: CanvasRenderingContext2D;
  getStateStackDepth: () => number;
  getSaveCount: () => number;
  getRestoreCount: () => number;
  getUnderflowCount: () => number;
  getCoordinateViolations: () => CoordinateViolation[];
  getShadowLeakChecks: () => ShadowLeakCheck[];
  getBadgeDrawCalls: () => { text: string; x: number; y: number }[];
  getCurrentState: () => CanvasState;
  resetTelemetry: () => void;
} {
  let stack: CanvasState[] = [];
  let current: CanvasState = { ...DEFAULT_STATE };
  let saveCount = 0;
  let restoreCount = 0;
  let underflowCount = 0;
  const coordinateViolations: CoordinateViolation[] = [];
  const shadowLeakChecks: ShadowLeakCheck[] = [];
  const badgeDrawCalls: { text: string; x: number; y: number }[] = [];

  const checkCoords = (method: string, ...args: any[]) => {
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

  const dummyCanvas = { width: 1920, height: 1080 } as HTMLCanvasElement;

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

    bezierCurveTo: vi.fn(
      (
        cp1x: number,
        cp1y: number,
        cp2x: number,
        cp2y: number,
        x: number,
        y: number
      ) => {
        checkCoords('bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y);
      }
    ),

    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      checkCoords('rect', x, y, w, h);
    }),

    roundRect: vi.fn((x: number, y: number, w: number, h: number, radius?: any) => {
      checkCoords('roundRect', x, y, w, h);
      if (typeof radius === 'number') {
        checkCoords('roundRect:radius', radius);
      }
    }),

    ellipse: vi.fn(
      (
        x: number,
        y: number,
        radiusX: number,
        radiusY: number,
        rotation: number,
        startAngle: number,
        endAngle: number,
        _counterclockwise?: boolean
      ) => {
        checkCoords('ellipse', x, y, radiusX, radiusY, rotation, startAngle, endAngle);
      }
    ),

    fill: vi.fn(() => {
      shadowLeakChecks.push({
        phase: 'fill',
        shadowColor: current.shadowColor,
        shadowBlur: current.shadowBlur,
      });
    }),

    stroke: vi.fn(() => {
      shadowLeakChecks.push({
        phase: 'stroke',
        shadowColor: current.shadowColor,
        shadowBlur: current.shadowBlur,
      });
    }),

    fillText: vi.fn((text: string, x: number, y: number, _maxWidth?: number) => {
      checkCoords('fillText', x, y);
      badgeDrawCalls.push({ text: String(text), x, y });
    }),

    strokeText: vi.fn((_text: string, x: number, y: number, _maxWidth?: number) => {
      checkCoords('strokeText', x, y);
    }),

    drawImage: vi.fn((...args: any[]) => {
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
    getShadowLeakChecks: () => shadowLeakChecks,
    getBadgeDrawCalls: () => badgeDrawCalls,
    getCurrentState: () => ({ ...current }),
    resetTelemetry: () => {
      stack = [];
      current = { ...DEFAULT_STATE };
      saveCount = 0;
      restoreCount = 0;
      underflowCount = 0;
      coordinateViolations.length = 0;
      shadowLeakChecks.length = 0;
      badgeDrawCalls.length = 0;
    },
  };
}

describe('M1 Challenger 2: Empirical Canvas Export & Parity Stress Suite', () => {
  const PRESET_COLOR_KEYS: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Challenge 1: Rapid Sequential Rasterization of 500+ Arrows
  // =========================================================================
  describe('1. Rapid Sequential Rasterization of 500+ Arrows', () => {
    it('C1.1: Sequentially rasterizes 500 arrows spanning 360° directions, varied stroke widths, and colors with sub-second execution', () => {
      const instrumented = createInstrumentedContext();
      const strokeWidths = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32];
      const count = 500;

      const startTime = performance.now();

      for (let i = 1; i <= count; i++) {
        // Vary direction evenly across 0..2PI
        const angle = (i * 2 * Math.PI) / count;
        const length = 20 + (i * 17) % 600;
        const startX = 500 + ((i * 37) % 1000);
        const startY = 500 + ((i * 53) % 1000);
        const endX = startX + length * Math.cos(angle);
        const endY = startY + length * Math.sin(angle);
        const strokeWidth = strokeWidths[i % strokeWidths.length];
        const color = PRESET_COLOR_KEYS[i % PRESET_COLOR_KEYS.length];

        const arrowAnnotation: Annotation = {
          id: `arrow-stress-${i}`,
          index: i,
          geometry: {
            type: 'arrow',
            startX,
            startY,
            endX,
            endY,
          },
          style: {
            color,
            strokeWidth,
            fillOpacity: 0.2,
          },
          note: `Stress arrow #${i} at angle ${(angle * (180 / Math.PI)).toFixed(1)}°`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        };

        rasterizeAnnotation(instrumented.ctx, arrowAnnotation);
      }

      const elapsedMs = performance.now() - startTime;

      // 1. Performance oracle: 500 arrows must rasterize well within 1500ms
      expect(elapsedMs).toBeLessThan(1500);

      // 2. Exact badge count oracle: exactly 500 badge text calls rendered
      const badgeCalls = instrumented.getBadgeDrawCalls();
      expect(badgeCalls).toHaveLength(500);
      expect(badgeCalls[0].text).toBe('1');
      expect(badgeCalls[249].text).toBe('250');
      expect(badgeCalls[499].text).toBe('500');

      // 3. Zero stack underflows or depth leaks
      expect(instrumented.getUnderflowCount()).toBe(0);
      expect(instrumented.getStateStackDepth()).toBe(0);
      expect(instrumented.getSaveCount()).toBe(instrumented.getRestoreCount());
    });

    it('C1.2: End-to-end composite canvas generation composites 500 arrows over 4K screenshot', async () => {
      const baseImage: BaseImage = {
        id: 'img-4k-stress',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        naturalWidth: 3840,
        naturalHeight: 2160,
        fileName: 'retina-screenshot-4k.png',
        fileSize: 3840 * 2160 * 4,
      };

      const arrows: Annotation[] = Array.from({ length: 500 }, (_, i) => {
        const idx = i + 1;
        const angle = (idx * 1.6180339887) * 2 * Math.PI; // Golden ratio angle dispersion
        const dist = 30 + (idx % 250);
        const startX = 200 + ((idx * 31) % 3400);
        const startY = 200 + ((idx * 23) % 1700);

        return {
          id: `e2e-arrow-${idx}`,
          index: idx,
          geometry: {
            type: 'arrow',
            startX,
            startY,
            endX: startX + dist * Math.cos(angle),
            endY: startY + dist * Math.sin(angle),
          },
          style: {
            color: PRESET_COLOR_KEYS[idx % PRESET_COLOR_KEYS.length],
            strokeWidth: 4 + (idx % 4) * 2,
            fillOpacity: 0.2,
          },
          note: `E2E Arrow ${idx}`,
          createdAt: 1000 + idx,
          updatedAt: 1000 + idx,
        };
      });

      const startTime = performance.now();
      const canvas = await renderCompositeCanvas(baseImage, arrows);
      const elapsed = performance.now() - startTime;

      expect(canvas.width).toBe(3840);
      expect(canvas.height).toBe(2160);
      expect(elapsed).toBeLessThan(2500);

      // Verify Blob generation from composite canvas
      const blob = await exportCompositeBlob(baseImage, arrows.slice(0, 50));
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');

      // Verify Data URL generation
      const dataUrl = await exportCompositeDataUrl(baseImage, arrows.slice(0, 10));
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 2: Save/Restore Stack Balance & Style Isolation Oracle
  // =========================================================================
  describe('2. ctx.save() and ctx.restore() Balance & Zero Style Contamination', () => {
    it('C2.1: Exactly balances save() and restore() across all 3 passes of arrow rasterization', () => {
      const instrumented = createInstrumentedContext();

      const arrow: Annotation = {
        id: 'ann-balance-1',
        index: 1,
        geometry: { type: 'arrow', startX: 100, startY: 100, endX: 400, endY: 300 },
        style: { color: 'amber', strokeWidth: 6, fillOpacity: 0.2 },
        note: 'Balance check',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(instrumented.ctx, arrow);

      // Per annotation:
      // Outer save (line 204) -> 1
      // Pass 1 underlay save (line 249) -> 1
      // Pass 1 underlay restore (line 277) -> 1
      // Pass 3 badge:
      //   Badge shadow save (line 156) -> 1
      //   Badge shadow restore (line 170) -> 1
      //   Badge text save (line 173) -> 1
      //   Badge text restore (line 190) -> 1
      // Outer restore (line 352) -> 1
      // Total saves: 1 + 1 + 2 = 4 saves.
      // Total restores: 1 + 2 + 1 = 4 restores.
      expect(instrumented.getSaveCount()).toBe(4);
      expect(instrumented.getRestoreCount()).toBe(4);
      expect(instrumented.getStateStackDepth()).toBe(0);
      expect(instrumented.getUnderflowCount()).toBe(0);
    });

    it('C2.2: Shadow styles (shadowColor, shadowBlur, shadowOffsetY) are strictly isolated and do NOT leak into Pass 2 or subsequent annotations', () => {
      const instrumented = createInstrumentedContext();

      // Draw arrow with drop shadow
      const arrowAnn: Annotation = {
        id: 'ann-arrow-shadow',
        index: 1,
        geometry: { type: 'arrow', startX: 150, startY: 150, endX: 500, endY: 200 },
        style: { color: 'red', strokeWidth: 8, fillOpacity: 0.2 },
        note: 'Shadow arrow',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(instrumented.ctx, arrowAnn);

      // After arrow finishes, shadow state must be completely clean/restored to default
      const stateAfterArrow = instrumented.getCurrentState();
      expect(stateAfterArrow.shadowColor).toBe('transparent');
      expect(stateAfterArrow.shadowBlur).toBe(0);
      expect(stateAfterArrow.shadowOffsetX).toBe(0);
      expect(stateAfterArrow.shadowOffsetY).toBe(0);

      // Immediately rasterize a box and verify its drawing operations inherit ZERO shadow
      const boxAnn: Annotation = {
        id: 'ann-box-unshadowed',
        index: 2,
        geometry: { type: 'box', x: 200, y: 200, width: 300, height: 150 },
        style: { color: 'green', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Subsequent box',
        createdAt: 2000,
        updatedAt: 2000,
      };

      const checksBeforeBox = instrumented.getShadowLeakChecks().length;
      rasterizeAnnotation(instrumented.ctx, boxAnn);

      // Inspect operations recorded during the box annotation
      const checksDuringBox = instrumented.getShadowLeakChecks().slice(checksBeforeBox);
      // Box body fill and stroke must have transparent shadow
      const boxBodyFill = checksDuringBox[0];
      const boxBodyStroke = checksDuringBox[1];
      expect(boxBodyFill.shadowColor).toBe('transparent');
      expect(boxBodyFill.shadowBlur).toBe(0);
      expect(boxBodyStroke.shadowColor).toBe('transparent');
      expect(boxBodyStroke.shadowBlur).toBe(0);

      // Final context state after both annotations remains pristine
      expect(instrumented.getStateStackDepth()).toBe(0);
    });

    it('C2.3: Interleaving 100 arrows with 100 boxes, ellipses, and pins produces zero stack drift across 400 operations', () => {
      const instrumented = createInstrumentedContext();

      for (let i = 1; i <= 100; i++) {
        // 1. Arrow
        rasterizeAnnotation(instrumented.ctx, {
          id: `arr-${i}`,
          index: i * 4 - 3,
          geometry: { type: 'arrow', startX: i * 10, startY: i * 10, endX: i * 10 + 100, endY: i * 10 + 50 },
          style: { color: 'cyan', strokeWidth: 6, fillOpacity: 0.2 },
          note: '',
          createdAt: 0,
          updatedAt: 0,
        });
        expect(instrumented.getStateStackDepth()).toBe(0);

        // 2. Box
        rasterizeAnnotation(instrumented.ctx, {
          id: `box-${i}`,
          index: i * 4 - 2,
          geometry: { type: 'box', x: i * 10, y: i * 10, width: 80, height: 60 },
          style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.2 },
          note: '',
          createdAt: 0,
          updatedAt: 0,
        });
        expect(instrumented.getStateStackDepth()).toBe(0);

        // 3. Ellipse
        rasterizeAnnotation(instrumented.ctx, {
          id: `ell-${i}`,
          index: i * 4 - 1,
          geometry: { type: 'ellipse', cx: i * 10 + 50, cy: i * 10 + 50, rx: 40, ry: 30 },
          style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.2 },
          note: '',
          createdAt: 0,
          updatedAt: 0,
        });
        expect(instrumented.getStateStackDepth()).toBe(0);

        // 4. Pin
        rasterizeAnnotation(instrumented.ctx, {
          id: `pin-${i}`,
          index: i * 4,
          geometry: { type: 'pin', x: i * 10 + 100, y: i * 10 + 100 },
          style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
          note: '',
          createdAt: 0,
          updatedAt: 0,
        });
        expect(instrumented.getStateStackDepth()).toBe(0);
      }

      expect(instrumented.getUnderflowCount()).toBe(0);
      expect(instrumented.getStateStackDepth()).toBe(0);
      expect(instrumented.getSaveCount()).toBe(instrumented.getRestoreCount());
    });
  });

  // =========================================================================
  // Challenge 3: Tail-Anchored Badge Accuracy Across All 500 Arrows
  // =========================================================================
  describe('3. Tail-Anchored Badge Invariant Across All 500 Arrows', () => {
    it('C3.1: Every single arrow strictly renders its numbered badge centered at (startX, startY)', () => {
      const instrumented = createInstrumentedContext();
      const count = 500;
      const arrowStartCoords: Point[] = [];

      for (let i = 1; i <= count; i++) {
        const startX = Math.round((Math.sin(i * 3.7) + 1.5) * 1000);
        const startY = Math.round((Math.cos(i * 2.3) + 1.5) * 800);
        // Vary end point wildly
        const endX = startX + (Math.sin(i * 1.1) * 400);
        const endY = startY + (Math.cos(i * 1.1) * 400);

        arrowStartCoords.push({ x: startX, y: startY });

        rasterizeAnnotation(instrumented.ctx, {
          id: `arr-badge-${i}`,
          index: i,
          geometry: {
            type: 'arrow',
            startX,
            startY,
            endX,
            endY,
          },
          style: {
            color: PRESET_COLOR_KEYS[i % PRESET_COLOR_KEYS.length],
            strokeWidth: 6,
            fillOpacity: 0.2,
          },
          note: '',
          createdAt: 0,
          updatedAt: 0,
        });
      }

      const badgeCalls = instrumented.getBadgeDrawCalls();
      expect(badgeCalls).toHaveLength(count);

      // Verify every single badge position matches its arrow's start coordinate exactly
      for (let i = 0; i < count; i++) {
        const call = badgeCalls[i];
        const expected = arrowStartCoords[i];
        expect(call.text).toBe(String(i + 1));
        expect(call.x).toBe(expected.x);
        expect(call.y).toBe(expected.y);
      }
    });

    it('C3.2: Badge is NEVER placed at (endX, endY), keeping arrowhead pointer tip 100% unobstructed', () => {
      const instrumented = createInstrumentedContext();

      const arrow: Annotation = {
        id: 'arrow-obstruction-check',
        index: 42,
        geometry: { type: 'arrow', startX: 100, startY: 200, endX: 800, endY: 900 },
        style: { color: 'green', strokeWidth: 8, fillOpacity: 0.2 },
        note: 'Unobstructed tip check',
        createdAt: 0,
        updatedAt: 0,
      };

      rasterizeAnnotation(instrumented.ctx, arrow);

      const badgeCalls = instrumented.getBadgeDrawCalls();
      expect(badgeCalls).toHaveLength(1);
      // Badge must be at start (100, 200)
      expect(badgeCalls[0].x).toBe(100);
      expect(badgeCalls[0].y).toBe(200);
      // Badge must NOT be near tip (800, 900)
      expect(badgeCalls[0].x).not.toBe(800);
      expect(badgeCalls[0].y).not.toBe(900);
    });

    it('C3.3: Badge scales font and pill dimensions correctly for multi-digit indices on arrows', () => {
      const indices = [1, 9, 10, 99, 100, 500, 999, 1000];

      for (const idx of indices) {
        const dims = getBadgeDimensions(idx);
        if (idx < 10) {
          expect(dims.isPill).toBe(false);
          expect(dims.radius).toBe(12);
          expect(dims.fontSize).toBe(13);
        } else if (idx < 100) {
          expect(dims.isPill).toBe(true);
          expect(dims.width).toBe(32);
          expect(dims.fontSize).toBe(12);
        } else if (idx < 1000) {
          expect(dims.isPill).toBe(true);
          expect(dims.width).toBe(40);
          expect(dims.fontSize).toBe(12);
        } else {
          expect(dims.isPill).toBe(true);
          expect(dims.width).toBe(48);
          expect(dims.fontSize).toBe(12);
        }
      }
    });
  });

  // =========================================================================
  // Challenge 4: Zero NaN or Infinite Coordinates Oracle
  // =========================================================================
  describe('4. Zero NaN or Infinite Coordinates Oracle in Canvas Operations', () => {
    it('C4.1: Exactly zero NaN or Infinite coordinates across 1,000 extreme, random, and degenerate arrows', () => {
      const instrumented = createInstrumentedContext();

      for (let i = 0; i < 1000; i++) {
        let startX: number;
        let startY: number;
        let endX: number;
        let endY: number;
        let strokeWidth: number;

        if (i === 0) {
          // Zero-length arrow at origin
          startX = 0;
          startY = 0;
          endX = 0;
          endY = 0;
          strokeWidth = 6;
        } else if (i === 1) {
          // Zero-length arrow at arbitrary point
          startX = 789.456;
          startY = 123.891;
          endX = 789.456;
          endY = 123.891;
          strokeWidth = 6;
        } else if (i === 2) {
          // Microscopic vector (0.0001px)
          startX = 100;
          startY = 100;
          endX = 100.0001;
          endY = 100.0001;
          strokeWidth = 6;
        } else if (i === 3) {
          // Ultra-thick stroke (strokeWidth > length)
          startX = 200;
          startY = 200;
          endX = 210;
          endY = 210;
          strokeWidth = 64;
        } else if (i === 4) {
          // Negative coordinate space
          startX = -5000.75;
          startY = -8000.25;
          endX = -4000.1;
          endY = -7000.9;
          strokeWidth = 10;
        } else if (i === 5) {
          // Sub-pixel 0.1px stroke
          startX = 50;
          startY = 50;
          endX = 150;
          endY = 150;
          strokeWidth = 0.1;
        } else {
          // Randomized stress vectors across large coordinates
          startX = (Math.random() - 0.5) * 50000;
          startY = (Math.random() - 0.5) * 50000;
          endX = (Math.random() - 0.5) * 50000;
          endY = (Math.random() - 0.5) * 50000;
          strokeWidth = 0.5 + Math.random() * 40;
        }

        const arrow: Annotation = {
          id: `stress-nan-${i}`,
          index: (i % 999) + 1,
          geometry: { type: 'arrow', startX, startY, endX, endY },
          style: {
            color: PRESET_COLOR_KEYS[i % PRESET_COLOR_KEYS.length],
            strokeWidth,
            fillOpacity: 0.2,
          },
          note: '',
          createdAt: 0,
          updatedAt: 0,
        };

        rasterizeAnnotation(instrumented.ctx, arrow);
      }

      // Assert ZERO coordinate violations
      const violations = instrumented.getCoordinateViolations();
      if (violations.length > 0) {
        console.error('Coordinate violations detected:', violations.slice(0, 5));
      }
      expect(violations).toHaveLength(0);
    });

    it('C4.2: calculateArrowhead returns strictly finite numbers and non-empty pathString for boundary vectors', () => {
      const testCases: { start: Point; end: Point; stroke: number; desc: string }[] = [
        { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, stroke: 6, desc: 'exact zero length' },
        { start: { x: 100, y: 100 }, end: { x: 100, y: 100.0000001 }, stroke: 6, desc: 'near zero length' },
        { start: { x: 500, y: 500 }, end: { x: 505, y: 505 }, stroke: 20, desc: 'stroke much larger than length' },
        { start: { x: 1e5, y: -1e5 }, end: { x: -1e5, y: 1e5 }, stroke: 6, desc: 'huge traversal' },
        { start: { x: 100, y: 100 }, end: { x: 100, y: 200 }, stroke: 0, desc: 'zero strokeWidth' },
        { start: { x: 100, y: 100 }, end: { x: 100, y: 200 }, stroke: -5, desc: 'negative strokeWidth' },
      ];

      for (const tc of testCases) {
        const head = calculateArrowhead(tc.start, tc.end, tc.stroke);

        expect(Number.isFinite(head.tip.x)).toBe(true);
        expect(Number.isFinite(head.tip.y)).toBe(true);
        expect(Number.isFinite(head.wingLeft.x)).toBe(true);
        expect(Number.isFinite(head.wingLeft.y)).toBe(true);
        expect(Number.isFinite(head.wingRight.x)).toBe(true);
        expect(Number.isFinite(head.wingRight.y)).toBe(true);
        expect(Number.isFinite(head.notch.x)).toBe(true);
        expect(Number.isFinite(head.notch.y)).toBe(true);
        expect(Number.isFinite(head.shaftEnd.x)).toBe(true);
        expect(Number.isFinite(head.shaftEnd.y)).toBe(true);
        expect(Number.isFinite(head.headingRad)).toBe(true);
        expect(Number.isFinite(head.headLength)).toBe(true);
        expect(Number.isFinite(head.headWidth)).toBe(true);

        expect(head.pathString).not.toContain('NaN');
        expect(head.pathString).not.toContain('Infinity');
        expect(head.pathString).not.toContain('undefined');
        expect(head.pathString.startsWith('M ')).toBe(true);
      }
    });

    it('C4.3: Shaft end clamping prevents arrow inversion on short vectors (length <= headLength)', () => {
      // 6px stroke has baseHeadLength = 28. Clamped headLength = length * 0.45.
      // distToNotch = length - headLength * 0.75 = length - 0.3375 * length = 0.6625 * length.
      // clearance = 6 * 0.5 = 3.
      // When length is short (e.g. 4px), shaftLength = 0.6625 * 4 - 3 = -0.35 <= 0.
      // In this scenario, shaftEnd MUST clamp to start to prevent pointing backward!
      const start = { x: 100, y: 100 };
      const end = { x: 104, y: 100 }; // length = 4px
      const head = calculateArrowhead(start, end, 6);

      expect(head.shaftEnd.x).toBe(start.x);
      expect(head.shaftEnd.y).toBe(start.y);
    });
  });

  // =========================================================================
  // Challenge 5: Visual Parity & Geometric Alignment Oracle
  // =========================================================================
  describe('5. Visual Parity & Geometric Alignment Oracle', () => {
    it('C5.1: Arrowhead geometry strictly maintains Annotely 30° wing sweep angle across all headings', () => {
      const headings = [
        0, // East
        Math.PI / 6, // 30°
        Math.PI / 4, // 45°
        Math.PI / 3, // 60°
        Math.PI / 2, // North (90°)
        (3 * Math.PI) / 4, // 135°
        Math.PI, // West (180°)
        -(3 * Math.PI) / 4, // 225°
        -Math.PI / 2, // South (270°)
        -Math.PI / 4, // 315°
      ];

      const start = { x: 300, y: 300 };
      const length = 200;

      for (const rad of headings) {
        const end = {
          x: start.x + length * Math.cos(rad),
          y: start.y + length * Math.sin(rad),
        };

        const head = calculateArrowhead(start, end, 6);

        // Vector from tip to wingLeft
        const dxLeft = head.wingLeft.x - head.tip.x;
        const dyLeft = head.wingLeft.y - head.tip.y;
        const wingLeftLen = Math.hypot(dxLeft, dyLeft);

        // Vector from tip to wingRight
        const dxRight = head.wingRight.x - head.tip.x;
        const dyRight = head.wingRight.y - head.tip.y;
        const wingRightLen = Math.hypot(dxRight, dyRight);

        // Both wings must have equal length matching headLength
        expect(wingLeftLen).toBeCloseTo(head.headLength, 2);
        expect(wingRightLen).toBeCloseTo(head.headLength, 2);

        // Angle between wing and shaft axis must be 30° (PI/6)
        // Cosine of 30° is sqrt(3)/2 ≈ 0.866025
        const shaftDx = start.x - end.x;
        const shaftDy = start.y - end.y;
        const shaftLen = Math.hypot(shaftDx, shaftDy);

        const cosLeft = (dxLeft * shaftDx + dyLeft * shaftDy) / (wingLeftLen * shaftLen);
        const cosRight = (dxRight * shaftDx + dyRight * shaftDy) / (wingRightLen * shaftLen);

        expect(cosLeft).toBeCloseTo(Math.cos(Math.PI / 6), 3);
        expect(cosRight).toBeCloseTo(Math.cos(Math.PI / 6), 3);
      }
    });

    it('C5.2: Recessed notch clearance leaves zero linecap overhang past notch apex', () => {
      // With strokeWidth = 6, clearance = 3px.
      // Round linecap has radius R = 3px.
      // Center of cap is at shaftEnd.
      // Forward apex of cap reaches shaftEnd + clearance = notch!
      const start = { x: 100, y: 100 };
      const end = { x: 300, y: 100 }; // pure horizontal arrow heading right
      const strokeWidth = 6;
      const head = calculateArrowhead(start, end, strokeWidth);

      const clearance = strokeWidth * 0.5; // 3px
      const capApexX = head.shaftEnd.x + clearance; // for rightward arrow, cos(0) = 1

      expect(capApexX).toBeCloseTo(head.notch.x, 3);
    });

    it('C5.3: Arrowhead polygon coordinates in 2D canvas export match calculateArrowhead output exactly', () => {
      const instrumented = createInstrumentedContext();
      const start = { x: 150, y: 250 };
      const end = { x: 450, y: 650 };
      const strokeWidth = 8;

      const expectedHead = calculateArrowhead(start, end, strokeWidth);

      const arrow: Annotation = {
        id: 'ann-exact-polygon',
        index: 7,
        geometry: { type: 'arrow', startX: start.x, startY: start.y, endX: end.x, endY: end.y },
        style: { color: 'cyan', strokeWidth, fillOpacity: 0.2 },
        note: '',
        createdAt: 0,
        updatedAt: 0,
      };

      rasterizeAnnotation(instrumented.ctx, arrow);

      // Verify moveTo / lineTo calls recorded the exact points:
      // Tip -> WingLeft -> Notch -> WingRight
      expect(instrumented.ctx.moveTo).toHaveBeenCalledWith(expectedHead.tip.x, expectedHead.tip.y);
      expect(instrumented.ctx.lineTo).toHaveBeenCalledWith(expectedHead.wingLeft.x, expectedHead.wingLeft.y);
      expect(instrumented.ctx.lineTo).toHaveBeenCalledWith(expectedHead.notch.x, expectedHead.notch.y);
      expect(instrumented.ctx.lineTo).toHaveBeenCalledWith(expectedHead.wingRight.x, expectedHead.wingRight.y);

      // Verify core shaft line was drawn from start to shaftEnd
      expect(instrumented.ctx.moveTo).toHaveBeenCalledWith(start.x, start.y);
      expect(instrumented.ctx.lineTo).toHaveBeenCalledWith(expectedHead.shaftEnd.x, expectedHead.shaftEnd.y);
    });
  });
});
