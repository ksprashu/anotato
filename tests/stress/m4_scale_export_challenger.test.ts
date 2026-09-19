import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import {
  renderCompositeCanvas,
  rasterizeAnnotation,
  rasterizeBadge,
} from '../../src/export/canvasExporter';
import {
  computeResolutionScale,
  getBadgeDimensions,
  getPinDimensions,
} from '../../src/math/badges';
import {
  getGeometryBoundingBox,
  getPinBoundingBox,
} from '../../src/math/geometry';
import { TransformHandles } from '../../src/components/canvas/TransformHandles';
import { ShapeRenderer } from '../../src/components/canvas/ShapeRenderer';
import { BaseImage, Annotation, PresetColor } from '../../src/types';

// ============================================================================
// Instrumented Canvas Context for Context State Isolation & Coordinate Checks
// ============================================================================

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

function createInstrumentedContext(): {
  ctx: CanvasRenderingContext2D;
  getStateStackDepth: () => number;
  getSaveCount: () => number;
  getRestoreCount: () => number;
  getUnderflowCount: () => number;
  getFontHistory: () => string[];
  getDrawCalls: () => { method: string; args: any[] }[];
  getViolations: () => string[];
} {
  const stack: CanvasState[] = [];
  let current: CanvasState = { ...DEFAULT_STATE };
  let saveCount = 0;
  let restoreCount = 0;
  let underflowCount = 0;
  const fontHistory: string[] = [];
  const drawCalls: { method: string; args: any[] }[] = [];
  const violations: string[] = [];

  const checkCoords = (method: string, ...args: any[]) => {
    for (let i = 0; i < args.length; i++) {
      const val = args[i];
      if (typeof val === 'number') {
        if (Number.isNaN(val)) {
          violations.push(`${method}: arg[${i}] is NaN`);
        } else if (!Number.isFinite(val)) {
          violations.push(`${method}: arg[${i}] is infinite (${val})`);
        }
      }
    }
  };

  const dummyCanvas = { width: 3840, height: 2160 } as HTMLCanvasElement;

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
      fontHistory.push(val);
      if (val.includes('NaN') || val.includes('undefined') || val.includes('null')) {
        violations.push(`Corrupted font string set: "${val}"`);
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
    clip: vi.fn(),

    moveTo: vi.fn((x: number, y: number) => {
      checkCoords('moveTo', x, y);
      drawCalls.push({ method: 'moveTo', args: [x, y] });
    }),

    lineTo: vi.fn((x: number, y: number) => {
      checkCoords('lineTo', x, y);
      drawCalls.push({ method: 'lineTo', args: [x, y] });
    }),

    arc: vi.fn((x: number, y: number, r: number, sa: number, ea: number, cc?: boolean) => {
      checkCoords('arc', x, y, r, sa, ea);
      drawCalls.push({ method: 'arc', args: [x, y, r, sa, ea, cc] });
    }),

    arcTo: vi.fn((x1: number, y1: number, x2: number, y2: number, r: number) => {
      checkCoords('arcTo', x1, y1, x2, y2, r);
    }),

    bezierCurveTo: vi.fn(
      (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => {
        checkCoords('bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y);
        drawCalls.push({ method: 'bezierCurveTo', args: [cp1x, cp1y, cp2x, cp2y, x, y] });
      }
    ),

    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      checkCoords('rect', x, y, w, h);
    }),

    ellipse: vi.fn(
      (
        x: number,
        y: number,
        rx: number,
        ry: number,
        rot: number,
        sa: number,
        ea: number,
        cc?: boolean
      ) => {
        checkCoords('ellipse', x, y, rx, ry, rot, sa, ea);
        drawCalls.push({ method: 'ellipse', args: [x, y, rx, ry, rot, sa, ea, cc] });
      }
    ),

    fill: vi.fn(),
    stroke: vi.fn(),

    fillText: vi.fn((text: string, x: number, y: number, maxWidth?: number) => {
      checkCoords('fillText', x, y);
      drawCalls.push({ method: 'fillText', args: [String(text), x, y, maxWidth, current.font] });
    }),

    strokeText: vi.fn((_text: string, x: number, y: number, _maxWidth?: number) => {
      checkCoords('strokeText', x, y);
    }),

    drawImage: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),

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
    getFontHistory: () => [...fontHistory],
    getDrawCalls: () => [...drawCalls],
    getViolations: () => [...violations],
  };
}

// ============================================================================
// Helper Mock Factory
// ============================================================================

function createMockImage(width: number, height: number): BaseImage {
  return {
    id: `img-${width}x${height}`,
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: width,
    naturalHeight: height,
    fileName: `mock-${width}x${height}.png`,
    fileSize: 1024,
  };
}

function createMockAnnotation(
  id: string,
  index: number,
  geometry: Annotation['geometry'],
  color: PresetColor = 'amber'
): Annotation {
  return {
    id,
    index,
    geometry,
    style: {
      color,
      strokeWidth: 4,
      fillOpacity: 0.25,
    },
    note: `Annotation ${index}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// Stress & Oracle Test Suite: Milestone M4 Resolution Scaling & Export Parity
// ============================================================================

describe('M4 Resolution-Aware Scaling & Export Parity Challenger Suite', () => {
  // --------------------------------------------------------------------------
  // Group 1: Resolution Scale Metric Math & Boundary Invariants
  // --------------------------------------------------------------------------
  describe('Group 1: Resolution Scale Metric Invariants (computeResolutionScale)', () => {
    it('M4.1.1: Computes exact scale factors across standard resolutions', () => {
      // 720p: 1280x720 -> maxDim 1280 < 1440 baseline -> clamped to 1.0
      expect(computeResolutionScale(1280, 720)).toBe(1.0);

      // 1080p: 1920x1080 -> 1920 / 1440 = 1.3333333333333333
      expect(computeResolutionScale(1920, 1080)).toBeCloseTo(1.3333, 4);

      // 2K QHD: 2560x1440 -> 2560 / 1440 = 1.7777777777777777
      expect(computeResolutionScale(2560, 1440)).toBeCloseTo(1.7778, 4);

      // 4K UHD: 3840x2160 -> 3840 / 1440 = 2.6666666666666665
      expect(computeResolutionScale(3840, 2160)).toBeCloseTo(2.6667, 4);

      // 8K FUHD: 7680x4320 -> 7680 / 1440 = 5.333 -> clamped to upper bound 4.0
      expect(computeResolutionScale(7680, 4320)).toBe(4.0);
    });

    it('M4.1.2: Boundary clamping enforces [1.0, 4.0] across extreme inputs', () => {
      // Below baseline
      expect(computeResolutionScale(800, 600)).toBe(1.0);
      expect(computeResolutionScale(100, 100)).toBe(1.0);
      expect(computeResolutionScale(1, 1)).toBe(1.0);

      // Clamped upper bound
      expect(computeResolutionScale(10000, 50)).toBe(4.0); // Panoramic
      expect(computeResolutionScale(50, 10000)).toBe(4.0); // Vertical column
      expect(computeResolutionScale(16000, 9000)).toBe(4.0); // 16K

      // Degenerate inputs safely return 1.0 (backward compatibility)
      expect(computeResolutionScale(NaN as any, 1080)).toBe(1.0);
      expect(computeResolutionScale(1920, Infinity as any)).toBe(1.0);
      expect(computeResolutionScale(0, 0)).toBe(1.0);
      expect(computeResolutionScale(-1920, -1080)).toBe(1.0);
      expect(computeResolutionScale(undefined, undefined)).toBe(1.0);
    });
  });

  // --------------------------------------------------------------------------
  // Group 2: Backward Compatibility Oracle (Sub-baseline Displays)
  // --------------------------------------------------------------------------
  describe('Group 2: Backward Compatibility Oracle (<= 1440px)', () => {
    it('M4.2.1: 800x600 screenshot produces exact 1:1 unscaled badge and pin metrics', async () => {
      const img800 = createMockImage(800, 600);
      const boxAnn = createMockAnnotation('b1', 1, { type: 'box', x: 50, y: 50, width: 200, height: 100 });
      const pinAnn = createMockAnnotation('p1', 2, { type: 'pin', x: 300, y: 400 });
      const arrowAnn = createMockAnnotation('a1', 3, { type: 'arrow', startX: 100, startY: 200, endX: 250, endY: 200 });

      const canvas = await renderCompositeCanvas(img800, [boxAnn, pinAnn, arrowAnn]);
      const ctx = canvas.getContext('2d')!;

      // Box badge: single-digit fontSize is 13px at 1.0x
      const boxDims = getBadgeDimensions(1, 1.0);
      expect(boxDims.width).toBe(24);
      expect(boxDims.height).toBe(24);
      expect(boxDims.fontSize).toBe(13);

      // Pin badge: fontSize 12px, pointerHeight 20px at 1.0x
      const pinDims = getPinDimensions(1.0);
      expect(pinDims.headRadius).toBe(14);
      expect(pinDims.pointerHeight).toBe(20);
      expect(pinDims.fontSize).toBe(12);

      // Pin text rendered at y - 20 = 380
      expect(ctx.fillText).toHaveBeenCalledWith('2', 300, 380);
      // Box text rendered at (50, 50)
      expect(ctx.fillText).toHaveBeenCalledWith('1', 50, 50);
      // Arrow text rendered at (100, 200)
      expect(ctx.fillText).toHaveBeenCalledWith('3', 100, 200);
    });

    it('M4.2.2: 1280x720 (720p) produces exact 1:1 unscaled badge metrics', async () => {
      const img720p = createMockImage(1280, 720);
      const boxAnn = createMockAnnotation('b1', 9, { type: 'box', x: 100, y: 100, width: 300, height: 200 });
      const pinAnn = createMockAnnotation('p1', 10, { type: 'pin', x: 500, y: 500 });

      const canvas = await renderCompositeCanvas(img720p, [boxAnn, pinAnn]);
      const ctx = canvas.getContext('2d')!;

      // Single digit (index 9) -> 13px
      expect(getBadgeDimensions(9, 1.0).fontSize).toBe(13);
      // Multi digit (index 10) -> 12px, width 32px
      expect(getBadgeDimensions(10, 1.0).fontSize).toBe(12);
      expect(getBadgeDimensions(10, 1.0).width).toBe(32);
      expect(getBadgeDimensions(10, 1.0).isPill).toBe(true);

      expect(ctx.fillText).toHaveBeenCalledWith('9', 100, 100);
      expect(ctx.fillText).toHaveBeenCalledWith('10', 500, 480); // 500 - 20
    });
  });

  // --------------------------------------------------------------------------
  // Group 3: Transform Handles Scale & Hit-Target Invariants
  // --------------------------------------------------------------------------
  describe('Group 3: Transform Handles Scaling Invariants (Zoom & Resolution)', () => {
    const zoomLevels = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];
    const resolutionScales = [1.0, 1.3333, 1.7778, 2.6667, 4.0];

    it('M4.3.1: Minimum handle clickable size is always >= 3px and hit area >= 10px across all zoom/scale combinations', () => {
      for (const zoom of zoomLevels) {
        for (const resScale of resolutionScales) {
          const handleSize = Math.max((8 * resScale) / zoom, 3 * resScale);
          const hitAreaSize = Math.max((20 * resScale) / zoom, 10 * resScale);
          const strokeWidth = Math.max((1.5 * resScale) / zoom, 0.5 * resScale);

          expect(handleSize).toBeGreaterThanOrEqual(3.0);
          expect(hitAreaSize).toBeGreaterThanOrEqual(10.0);
          expect(strokeWidth).toBeGreaterThanOrEqual(0.5);

          expect(Number.isFinite(handleSize)).toBe(true);
          expect(Number.isFinite(hitAreaSize)).toBe(true);
          expect(Number.isNaN(handleSize)).toBe(false);
          expect(Number.isNaN(hitAreaSize)).toBe(false);
        }
      }
    });

    it('M4.3.2: Degenerate zoom (0, negative, NaN) and scale (0, negative, NaN) handle gracefully without NaN', () => {
      const degenerateZooms = [0, -1, NaN, -Infinity];
      const degenerateScales = [0, -2, NaN, Infinity];

      for (const z of degenerateZooms) {
        for (const s of degenerateScales) {
          const effectiveZoom = z > 0 ? z : 1.0;
          const safeScale = typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 1.0;

          const handleSize = Math.max((8 * safeScale) / effectiveZoom, 3 * safeScale);
          const hitAreaSize = Math.max((20 * safeScale) / effectiveZoom, 10 * safeScale);

          expect(handleSize).toBeGreaterThanOrEqual(3.0);
          expect(hitAreaSize).toBeGreaterThanOrEqual(10.0);
          expect(Number.isNaN(handleSize)).toBe(false);
          expect(Number.isNaN(hitAreaSize)).toBe(false);
        }
      }
    });

    it('M4.3.3: Pin bounding box correctly encompasses scaled teardrop head and pointer anchor', () => {
      const pinGeom = { type: 'pin' as const, x: 500, y: 1000 };

      // Scale 1.0
      const bbox1 = getPinBoundingBox(pinGeom, 1.0);
      expect(bbox1).toEqual({
        x: 500 - 14,
        y: 1000 - (14 + 20),
        width: 28,
        height: 34,
      });

      // Scale 2.6667 (4K)
      const scale4K = 3840 / 1440;
      const headRadius4K = Math.round(14 * scale4K); // 37
      const pointerHeight4K = Math.round(20 * scale4K); // 53
      const bbox4K = getPinBoundingBox(pinGeom, scale4K);

      expect(bbox4K).toEqual({
        x: 500 - headRadius4K,
        y: 1000 - (headRadius4K + pointerHeight4K),
        width: headRadius4K * 2,
        height: headRadius4K + pointerHeight4K,
      });

      // Full AABB routing
      const fullBbox = getGeometryBoundingBox(pinGeom, scale4K);
      expect(fullBbox).toEqual(bbox4K);
    });

    it('M4.3.4: Renders TransformHandles component at 4K resolution and 0.5x zoom with scaled handles', () => {
      const boxAnn = createMockAnnotation('box-h', 1, {
        type: 'box',
        x: 100,
        y: 100,
        width: 400,
        height: 300,
      });

      const scale4K = 3840 / 1440;
      const zoom = 0.5;

      const { container } = render(
        React.createElement(
          'svg',
          null,
          React.createElement(TransformHandles, {
            annotation: boxAnn,
            zoom,
            resolutionScale: scale4K,
          })
        )
      );

      const nwHandle = container.querySelector('[data-testid="transform-handle-nw"]');
      expect(nwHandle).not.toBeNull();
      // Handle size = max((8 * 2.6667) / 0.5, 3 * 2.6667) = max(42.667, 8) = 42.667
      const width = parseFloat(nwHandle?.getAttribute('width') || '0');
      expect(width).toBeGreaterThanOrEqual(42);

      const nwHit = container.querySelector('[data-testid="transform-handle-hitarea-nw"]');
      expect(nwHit).not.toBeNull();
      const hitWidth = parseFloat(nwHit?.getAttribute('width') || '0');
      expect(hitWidth).toBeGreaterThanOrEqual(100);
    });
  });

  // --------------------------------------------------------------------------
  // Group 4: Context State Isolation Stress Test (100+ Mixed Annotations on 4K)
  // --------------------------------------------------------------------------
  describe('Group 4: Context State Isolation Stress Test (100+ Annotations on 4K Canvas)', () => {
    it('M4.4.1: Strictly balances save() and restore() with zero stack underflow across 120 mixed annotations', () => {
      const instrument = createInstrumentedContext();
      const ctx = instrument.ctx;

      // Generate 120 mixed annotations: 20 boxes, 20 highlights, 20 blurs, 20 arrows, 20 ellipses, 20 pins
      const mixed: Annotation[] = [];
      let idx = 1;

      for (let i = 0; i < 20; i++) {
        mixed.push(
          createMockAnnotation(`box-${i}`, idx++, {
            type: 'box',
            x: 100 + i * 10,
            y: 100 + i * 10,
            width: 80,
            height: 60,
          })
        );
        mixed.push(
          createMockAnnotation(`hl-${i}`, idx++, {
            type: 'highlight',
            x: 200 + i * 10,
            y: 200 + i * 10,
            width: 100,
            height: 50,
          })
        );
        mixed.push(
          createMockAnnotation(`blur-${i}`, idx++, {
            type: 'blur',
            x: 350 + i * 10,
            y: 350 + i * 10,
            width: 120,
            height: 40,
          })
        );
        mixed.push(
          createMockAnnotation(`arr-${i}`, idx++, {
            type: 'arrow',
            startX: 500 + i * 5,
            startY: 500 + i * 5,
            endX: 650 + i * 5,
            endY: 550 + i * 5,
          })
        );
        mixed.push(
          createMockAnnotation(`ell-${i}`, idx++, {
            type: 'ellipse',
            cx: 800 + i * 5,
            cy: 800 + i * 5,
            rx: 50,
            ry: 30,
          })
        );
        mixed.push(
          createMockAnnotation(`pin-${i}`, idx++, {
            type: 'pin',
            x: 1000 + i * 5,
            y: 1000 + i * 5,
          })
        );
      }

      expect(mixed.length).toBe(120);

      const scale4K = 3840 / 1440; // 2.6667

      // Pre-set sentinel state to verify restoration
      ctx.fillStyle = '#123456';
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 99;

      for (const ann of mixed) {
        rasterizeAnnotation(ctx, ann, scale4K);
      }

      // Check stack integrity
      expect(instrument.getUnderflowCount()).toBe(0);
      expect(instrument.getStateStackDepth()).toBe(0);
      expect(instrument.getSaveCount()).toBe(instrument.getRestoreCount());
      expect(instrument.getViolations()).toHaveLength(0);

      // Verify that after all 120 annotations, the sentinel state was restored
      expect(ctx.fillStyle).toBe('#123456');
      expect(ctx.strokeStyle).toBe('#654321');
      expect(ctx.lineWidth).toBe(99);
    });
  });

  // --------------------------------------------------------------------------
  // Group 5: Font String Integrity & Anti-Corruption Invariants
  // --------------------------------------------------------------------------
  describe('Group 5: Font String Integrity & Anti-Corruption', () => {
    it('M4.5.1: Formats exact integer pixel fonts without NaN or decimal corruptions across scales [1.0 .. 4.0]', () => {
      const scales = [1.0, 1.25, 1.3333, 1.5, 1.7778, 2.0, 2.3333, 2.6667, 3.0, 3.5, 4.0];
      const fontRegex = /^700 (\d+)px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif$/;

      for (const scale of scales) {
        // Badge dimensions
        const singleDigit = getBadgeDimensions(5, scale);
        const multiDigit = getBadgeDimensions(42, scale);
        const pinDims = getPinDimensions(scale);

        // Verify font sizes are pure integers >= 11
        expect(Number.isInteger(singleDigit.fontSize)).toBe(true);
        expect(singleDigit.fontSize).toBeGreaterThanOrEqual(11);

        expect(Number.isInteger(multiDigit.fontSize)).toBe(true);
        expect(multiDigit.fontSize).toBeGreaterThanOrEqual(11);

        expect(Number.isInteger(pinDims.fontSize)).toBe(true);
        expect(pinDims.fontSize).toBeGreaterThanOrEqual(12);

        // Test canvas font string generation in instrumented context
        const instrument = createInstrumentedContext();
        rasterizeBadge(instrument.ctx, { x: 100, y: 100 }, 5, 'amber', scale);
        rasterizeBadge(instrument.ctx, { x: 200, y: 200 }, 42, 'cyan', scale);

        const pinAnn = createMockAnnotation('p', 1, { type: 'pin', x: 300, y: 300 });
        rasterizeAnnotation(instrument.ctx, pinAnn, scale);

        const fonts = instrument.getFontHistory();
        expect(fonts.length).toBeGreaterThanOrEqual(3);

        for (const f of fonts) {
          expect(f).toMatch(fontRegex);
          expect(f).not.toContain('NaN');
          expect(f).not.toContain('undefined');
          expect(f).not.toContain('.'); // No fractional font sizes like 34.6667px
        }

        expect(instrument.getViolations()).toHaveLength(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Group 6: Proportional Scaling & Parity Oracle on 4K Screenshots
  // --------------------------------------------------------------------------
  describe('Group 6: 4K Proportional Font Sizes & Scale Parity Oracle (3840x2160)', () => {
    const scale4K = 3840 / 1440; // 2.6666666666666665

    it('M4.6.1: Direct rasterizeBadge at 4K scale produces proportional font size (~35px single digit, ~32px multi digit)', () => {
      const instrument = createInstrumentedContext();

      // Single digit (index 1): round(13 * 2.6667) = 35px
      rasterizeBadge(instrument.ctx, { x: 100, y: 100 }, 1, 'amber', scale4K);
      expect(instrument.getFontHistory()[0]).toContain('35px');

      // Multi digit (index 25): round(12 * 2.6667) = 32px
      rasterizeBadge(instrument.ctx, { x: 200, y: 200 }, 25, 'cyan', scale4K);
      expect(instrument.getFontHistory()[1]).toContain('32px');
    });

    it('M4.6.2: Direct rasterizeAnnotation at 4K scale rasterizes Pin teardrop and centered index (~32px font, pointerHeight 53px)', () => {
      const instrument = createInstrumentedContext();
      const pinAnn = createMockAnnotation('pin-4k', 7, { type: 'pin', x: 1500, y: 1200 });

      rasterizeAnnotation(instrument.ctx, pinAnn, scale4K);

      const headRadius = Math.round(14 * scale4K); // 37
      const pointerHeight = Math.round(20 * scale4K); // 53
      const headCenterY = 1200 - pointerHeight; // 1147
      const fontSize = Math.round(12 * scale4K); // 32

      expect(headRadius).toBe(37);
      expect(pointerHeight).toBe(53);
      expect(fontSize).toBe(32);

      // Verify arc for head circle
      const arcCall = instrument.getDrawCalls().find((c) => c.method === 'arc');
      expect(arcCall).toBeDefined();
      expect(arcCall?.args[0]).toBe(1500);
      expect(arcCall?.args[1]).toBe(headCenterY);
      expect(arcCall?.args[2]).toBe(headRadius);

      // Verify fillText centered at (1500, headCenterY) with 32px font
      const textCall = instrument.getDrawCalls().find((c) => c.method === 'fillText');
      expect(textCall).toBeDefined();
      expect(textCall?.args[0]).toBe('7');
      expect(textCall?.args[1]).toBe(1500);
      expect(textCall?.args[2]).toBe(headCenterY);
      expect(textCall?.args[4]).toContain('32px');
    });

    it('M4.6.3: renderCompositeCanvas on 4K screenshot scales Box badge font to 35px', async () => {
      const img4K = createMockImage(3840, 2160);
      const boxAnn = createMockAnnotation('box-1', 1, {
        type: 'box',
        x: 500,
        y: 400,
        width: 600,
        height: 300,
      });

      const canvas = await renderCompositeCanvas(img4K, [boxAnn]);
      const ctx = canvas.getContext('2d')!;

      // Box badge font must be 35px
      expect(ctx.font).toContain('35px');
      expect(ctx.fillText).toHaveBeenCalledWith('1', 500, 400);
    });

    /**
     * ADVERSARIAL ORACLE TEST: Export Scale Parity for Callout Pins on 4K Screenshots
     *
     * Requirement:
     * - USER_REQUEST Objective 2: "Verify that on 4K screenshots (3840x2160), badges and pins
     *   rasterize with proportional font sizes (~35px for box badges, ~32px for pins) without
     *   clipping or font string corruption."
     * - PROJECT.md F4.5: "Exact proportional badge and pin scaling applied in 2D canvas exporter
     *   matching live canvas appearance."
     *
     * Observation of Defect in Worker M4's canvasExporter.ts line 530:
     * `const annScale = annotation.geometry.type === 'pin' && options.scale === undefined ? 1.0 : scale;`
     * When options.scale is undefined (standard export call across the app), pin scaling is forced
     * to 1.0, rasterizing pins with 12px font instead of ~32px, and 14px radius instead of 37px!
     */
    it('M4.6.4: Export Scale Parity Oracle: Callout Pin on 4K screenshot must rasterize with ~32px font without explicit options.scale', async () => {
      const img4K = createMockImage(3840, 2160);
      const pinAnn = createMockAnnotation('pin-4k-export', 3, {
        type: 'pin',
        x: 1000,
        y: 1000,
      });

      // Default export call as performed by App.tsx, clipboard.ts, and ExportActions.tsx:
      // await renderCompositeCanvas(img4K, [pinAnn]);
      const canvas = await renderCompositeCanvas(img4K, [pinAnn]);
      const ctx = canvas.getContext('2d')!;

      // Expected headCenterY at 4K: 1000 - Math.round(20 * (3840/1440)) = 1000 - 53 = 947
      // Expected font size at 4K: Math.round(12 * (3840/1440)) = 32px
      //
      // IF WORKER M4'S HACK IS PRESENT:
      // annScale is forced to 1.0 -> headCenterY is 980 (1000 - 20) and font is 12px.
      // This assertion proves whether the pin scaled proportionally or remained at 12px.
      expect(ctx.font).toContain('32px');
      expect(ctx.fillText).toHaveBeenCalledWith('3', 1000, 947);
    });

    it('M4.6.5: Explicit options.scale override scales Callout Pin proportionally', async () => {
      const img4K = createMockImage(3840, 2160);
      const pinAnn = createMockAnnotation('pin-4k-override', 3, {
        type: 'pin',
        x: 1000,
        y: 1000,
      });

      // When options.scale is explicitly passed:
      const canvas = await renderCompositeCanvas(img4K, [pinAnn], { scale: scale4K });
      const ctx = canvas.getContext('2d')!;

      expect(ctx.font).toContain('32px');
      expect(ctx.fillText).toHaveBeenCalledWith('3', 1000, 947);
    });

    it('M4.6.6: Live SVG Overlay vs Canvas Export Parity Discrepancy on 4K Screenshots', async () => {
      const img4K = createMockImage(3840, 2160);
      const pinAnn = createMockAnnotation('pin-4k-parity', 8, {
        type: 'pin',
        x: 2000,
        y: 1500,
      });

      // 1. Live SVG Workspace: ShapeRenderer rendered with resolutionScale = 2.6667
      const { container } = render(
        React.createElement(
          'svg',
          null,
          React.createElement(ShapeRenderer, {
            annotation: pinAnn,
            resolutionScale: scale4K,
          })
        )
      );

      const svgText = container.querySelector('[data-testid="badge-text-8"]');
      expect(svgText).not.toBeNull();
      const svgFontSize = parseFloat(svgText?.getAttribute('font-size') || '0');
      // Live SVG correctly scales the pin font to 32px
      expect(svgFontSize).toBe(32);

      // 2. 2D Canvas Export: renderCompositeCanvas without options.scale
      const canvas = await renderCompositeCanvas(img4K, [pinAnn]);
      const ctx = canvas.getContext('2d')!;

      // PARITY ASSERTION: Canvas export font MUST match Live SVG font (32px)
      // If line 530 forces annScale = 1.0, ctx.font has '12px' instead of '32px'
      expect(ctx.font).toContain(`${svgFontSize}px`);
    });
  });

  // --------------------------------------------------------------------------
  // Group 7: Multi-Resolution Scale Parity Matrix (720p, 1080p, 2K, 4K, 8K)
  // --------------------------------------------------------------------------
  describe('Group 7: Multi-Resolution Scale Parity Matrix across Mixed Annotations', () => {
    const resolutions = [
      { name: '720p', w: 1280, h: 720, expectedScale: 1.0, boxFont: 13, pinFont: 12, pointerH: 20 },
      { name: '1080p', w: 1920, h: 1080, expectedScale: 1.3333, boxFont: 17, pinFont: 16, pointerH: 27 },
      { name: '2K', w: 2560, h: 1440, expectedScale: 1.7778, boxFont: 23, pinFont: 21, pointerH: 36 },
      { name: '4K', w: 3840, h: 2160, expectedScale: 2.6667, boxFont: 35, pinFont: 32, pointerH: 53 },
      { name: '8K', w: 7680, h: 4320, expectedScale: 4.0, boxFont: 52, pinFont: 48, pointerH: 80 },
    ];

    for (const res of resolutions) {
      it(`M4.7.${res.name}: Mixed annotations scaling on ${res.name} (${res.w}x${res.h})`, async () => {
        const computedScale = computeResolutionScale(res.w, res.h);
        expect(computedScale).toBeCloseTo(res.expectedScale, 2);

        const boxDims = getBadgeDimensions(1, computedScale);
        expect(boxDims.fontSize).toBe(res.boxFont);

        const pinDims = getPinDimensions(computedScale);
        expect(pinDims.fontSize).toBe(res.pinFont);
        expect(pinDims.pointerHeight).toBe(res.pointerH);

        // Arrow tail anchor badge matches box badge dimensions
        const arrowBadgeDims = getBadgeDimensions(2, computedScale);
        expect(arrowBadgeDims.fontSize).toBe(res.boxFont);

        // Direct rasterization with computed scale
        const instrument = createInstrumentedContext();
        const boxAnn = createMockAnnotation('b', 1, { type: 'box', x: 100, y: 100, width: 200, height: 100 });
        const pinAnn = createMockAnnotation('p', 2, { type: 'pin', x: 400, y: 400 });

        rasterizeAnnotation(instrument.ctx, boxAnn, computedScale);
        rasterizeAnnotation(instrument.ctx, pinAnn, computedScale);

        expect(instrument.getViolations()).toHaveLength(0);
      });
    }
  });
});
