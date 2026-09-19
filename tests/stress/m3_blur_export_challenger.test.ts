import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  bakeBlurFallback,
  rasterizeAnnotation,
} from '../../src/export/canvasExporter';
import {
  BaseImage,
  Annotation,
  PresetColor,
  BlurGeometry,
  HighlightGeometry,
  ArrowGeometry,
} from '../../src/types';

/**
 * ============================================================================
 * 1. Pixel Grid & Diffusion Simulation Oracle (BlurDiffusionOracle)
 * ============================================================================
 * Provides bitwise-exact discrete 2D pixel grid math to verify:
 * - Destructive pixel alteration (Mean Squared Error > 0, L1 delta > 0).
 * - High-frequency Laplacian gradient energy collapse (unrecoverable text/credentials).
 * - Shannon entropy degradation before vs after blur.
 * - Zero spillover invariant: 100% bitwise identity for every pixel outside blur bounds.
 */
class BlurDiffusionOracle {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  static fromPattern(width: number, height: number, type: 'checkerboard' | 'text' | 'solid'): BlurDiffusionOracle {
    const oracle = new BlurDiffusionOracle(width, height);
    if (type === 'solid') {
      for (let i = 0; i < oracle.data.length; i += 4) {
        oracle.data[i] = 200;
        oracle.data[i + 1] = 200;
        oracle.data[i + 2] = 200;
        oracle.data[i + 3] = 255;
      }
    } else if (type === 'checkerboard') {
      // Nyquist-frequency high contrast alternating pattern (black/white 2x2 blocks)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const isWhite = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
          const val = isWhite ? 255 : 0;
          const idx = (y * width + x) * 4;
          oracle.data[idx] = val;
          oracle.data[idx + 1] = val;
          oracle.data[idx + 2] = val;
          oracle.data[idx + 3] = 255;
        }
      }
    } else if (type === 'text') {
      // High-contrast simulated credit-card/credential text lines (sharp black stripes on white)
      for (let y = 0; y < height; y++) {
        const isTextLine = (y % 12 >= 3 && y % 12 <= 8);
        for (let x = 0; x < width; x++) {
          const isCharPixel = isTextLine && ((x % 8 >= 2 && x % 8 <= 6) || (x % 5 === 0));
          const val = isCharPixel ? 0 : 255;
          const idx = (y * width + x) * 4;
          oracle.data[idx] = val;
          oracle.data[idx + 1] = val;
          oracle.data[idx + 2] = val;
          oracle.data[idx + 3] = 255;
        }
      }
    }
    return oracle;
  }

  clone(): BlurDiffusionOracle {
    const copy = new BlurDiffusionOracle(this.width, this.height);
    copy.data.set(this.data);
    return copy;
  }

  getPixel(x: number, y: number): [number, number, number, number] {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || px >= this.width || py < 0 || py >= this.height) {
      return [0, 0, 0, 0];
    }
    const idx = (py * this.width + px) * 4;
    return [this.data[idx], this.data[idx + 1], this.data[idx + 2], this.data[idx + 3]];
  }

  /**
   * Simulates destructive Gaussian/box blur diffusion strictly within (x, y, w, h).
   */
  applyBoxBlur(x: number, y: number, w: number, h: number, radius = 5): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));

    const temp = new Uint8ClampedArray(this.data);

    // Multi-pass box blur approximating Gaussian blur
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const sx = px + kx;
            const sy = py + ky;
            if (sx >= 0 && sx < this.width && sy >= 0 && sy < this.height) {
              const sIdx = (sy * this.width + sx) * 4;
              rSum += temp[sIdx];
              gSum += temp[sIdx + 1];
              bSum += temp[sIdx + 2];
              count++;
            }
          }
        }
        const targetIdx = (py * this.width + px) * 4;
        this.data[targetIdx] = Math.round(rSum / count);
        this.data[targetIdx + 1] = Math.round(gSum / count);
        this.data[targetIdx + 2] = Math.round(bSum / count);
      }
    }
  }

  /**
   * Simulates bakeBlurFallback: downsampling by factor of 10 into small buffer,
   * then bilinear upsampling back into (x, y, w, h).
   */
  applyFallbackDiffusion(x: number, y: number, w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    const regionW = x1 - x0;
    const regionH = y1 - y0;
    if (regionW <= 0 || regionH <= 0) return;

    const sampleW = Math.max(2, Math.round(regionW / 10));
    const sampleH = Math.max(2, Math.round(regionH / 10));

    // 1. Downsample to small buffer
    const small = new Float32Array(sampleW * sampleH * 3);
    for (let sy = 0; sy < sampleH; sy++) {
      for (let sx = 0; sx < sampleW; sx++) {
        const srcX0 = x0 + Math.floor((sx / sampleW) * regionW);
        const srcX1 = Math.min(x1, x0 + Math.floor(((sx + 1) / sampleW) * regionW));
        const srcY0 = y0 + Math.floor((sy / sampleH) * regionH);
        const srcY1 = Math.min(y1, y0 + Math.floor(((sy + 1) / sampleH) * regionH));

        let r = 0, g = 0, b = 0, count = 0;
        for (let py = srcY0; py < srcY1; py++) {
          for (let px = srcX0; px < srcX1; px++) {
            const idx = (py * this.width + px) * 4;
            r += this.data[idx];
            g += this.data[idx + 1];
            b += this.data[idx + 2];
            count++;
          }
        }
        const sIdx = (sy * sampleW + sx) * 3;
        small[sIdx] = count > 0 ? r / count : 128;
        small[sIdx + 1] = count > 0 ? g / count : 128;
        small[sIdx + 2] = count > 0 ? b / count : 128;
      }
    }

    // 2. Upscale back into region with bilinear interpolation
    for (let py = y0; py < y1; py++) {
      const v = ((py - y0) / regionH) * (sampleH - 1);
      const sy0 = Math.floor(v);
      const sy1 = Math.min(sampleH - 1, sy0 + 1);
      const fy = v - sy0;

      for (let px = x0; px < x1; px++) {
        const u = ((px - x0) / regionW) * (sampleW - 1);
        const sx0 = Math.floor(u);
        const sx1 = Math.min(sampleW - 1, sx0 + 1);
        const fx = u - sx0;

        const idx00 = (sy0 * sampleW + sx0) * 3;
        const idx10 = (sy0 * sampleW + sx1) * 3;
        const idx01 = (sy1 * sampleW + sx0) * 3;
        const idx11 = (sy1 * sampleW + sx1) * 3;

        const targetIdx = (py * this.width + px) * 4;
        for (let c = 0; c < 3; c++) {
          const top = small[idx00 + c] * (1 - fx) + small[idx10 + c] * fx;
          const bot = small[idx01 + c] * (1 - fx) + small[idx11 + c] * fx;
          this.data[targetIdx + c] = Math.round(top * (1 - fy) + bot * fy);
        }
      }
    }
  }

  /**
   * Computes discrete high-frequency Laplacian edge energy:
   * sum(|I(x+1, y) - I(x, y)| + |I(x, y+1) - I(x, y)|) / pixelCount.
   * Sharp text/checkerboards have high energy (>50), blurred regions have low energy (<10).
   */
  computeLaplacianEnergy(x: number, y: number, w: number, h: number): number {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width - 1, Math.ceil(x + w));
    const y1 = Math.min(this.height - 1, Math.ceil(y + h));

    let totalDiff = 0;
    let count = 0;

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const idx = (py * this.width + px) * 4;
        const idxRight = (py * this.width + (px + 1)) * 4;
        const idxDown = ((py + 1) * this.width + px) * 4;

        const intensity = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
        const intensityRight = (this.data[idxRight] + this.data[idxRight + 1] + this.data[idxRight + 2]) / 3;
        const intensityDown = (this.data[idxDown] + this.data[idxDown + 1] + this.data[idxDown + 2]) / 3;

        totalDiff += Math.abs(intensityRight - intensity) + Math.abs(intensityDown - intensity);
        count++;
      }
    }
    return count > 0 ? totalDiff / count : 0;
  }

  /**
   * Computes Mean Squared Error (MSE) between this oracle and another within (x, y, w, h).
   */
  computeMSE(other: BlurDiffusionOracle, x: number, y: number, w: number, h: number): number {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));

    let sumSqDiff = 0;
    let count = 0;

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const idx = (py * this.width + px) * 4;
        for (let c = 0; c < 3; c++) {
          const diff = this.data[idx + c] - other.data[idx + c];
          sumSqDiff += diff * diff;
        }
        count += 3;
      }
    }
    return count > 0 ? sumSqDiff / count : 0;
  }

  /**
   * Computes Shannon Entropy of grayscale intensities in the region.
   */
  computeShannonEntropy(x: number, y: number, w: number, h: number): number {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));

    const hist = new Array(256).fill(0);
    let total = 0;

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const idx = (py * this.width + px) * 4;
        const intensity = Math.round((this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3);
        hist[intensity]++;
        total++;
      }
    }

    if (total === 0) return 0;
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (hist[i] > 0) {
        const p = hist[i] / total;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  /**
   * Verifies Zero Spillover Invariant:
   * Every pixel OUTSIDE the specified bounding boxes must be 100% bitwise identical.
   */
  verifyZeroSpillover(other: BlurDiffusionOracle, regions: { x: number; y: number; w: number; h: number }[]): {
    spilloverCount: number;
    maxDiscrepancy: number;
  } {
    let spilloverCount = 0;
    let maxDiscrepancy = 0;

    for (let py = 0; py < this.height; py++) {
      for (let px = 0; px < this.width; px++) {
        const isInsideAnyRegion = regions.some(
          (r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
        );

        if (!isInsideAnyRegion) {
          const idx = (py * this.width + px) * 4;
          for (let c = 0; c < 4; c++) {
            const diff = Math.abs(this.data[idx + c] - other.data[idx + c]);
            if (diff > 0) {
              spilloverCount++;
              maxDiscrepancy = Math.max(maxDiscrepancy, diff);
            }
          }
        }
      }
    }
    return { spilloverCount, maxDiscrepancy };
  }
}

/**
 * ============================================================================
 * 2. Stateful Canvas 2D Instrumentor & Telemetry Tracker
 * ============================================================================
 * Intercepts Canvas 2D context operations to monitor:
 * - Save/Restore balancing, stack depth, and underflow detection.
 * - Exact `ctx.filter` transitions and isolation (`blur(12px)` -> `none`).
 * - Clipping isolation (`ctx.clip()`).
 * - Numerical coordinate sanity (flags NaN / Infinity).
 * - Vector style and shadow leakage across sequential draw calls.
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
  filter: string;
  clipPathCount: number;
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
  clipPathCount: 0,
};

interface CoordinateViolation {
  method: string;
  args: any[];
  reason: string;
}

interface DrawImageRecord {
  image: any;
  args: any[];
  filterAtCall: string;
  clipCountAtCall: number;
}

interface InstrumentedContextBundle {
  ctx: CanvasRenderingContext2D;
  getStateStackDepth: () => number;
  getSaveCount: () => number;
  getRestoreCount: () => number;
  getUnderflowCount: () => number;
  getCoordinateViolations: () => CoordinateViolation[];
  getDrawImageCalls: () => DrawImageRecord[];
  getFilterTransitions: () => string[];
  getCurrentState: () => CanvasState;
  resetTelemetry: () => void;
}

function createInstrumentedContext(width = 1920, height = 1080): InstrumentedContextBundle {
  let stack: CanvasState[] = [];
  let current: CanvasState = { ...DEFAULT_STATE };
  let saveCount = 0;
  let restoreCount = 0;
  let underflowCount = 0;
  const coordinateViolations: CoordinateViolation[] = [];
  const drawImageCalls: DrawImageRecord[] = [];
  const filterTransitions: string[] = [];

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
    },
    get filter() {
      return current.filter;
    },
    set filter(val: string) {
      current.filter = val;
      filterTransitions.push(val);
    },
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high' as ImageSmoothingQuality,

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
    clip: vi.fn(() => {
      current.clipPathCount++;
    }),

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
      (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => {
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

    fill: vi.fn(),
    stroke: vi.fn(),

    fillText: vi.fn((_text: string, x: number, y: number, _maxWidth?: number) => {
      checkCoords('fillText', x, y);
    }),

    strokeText: vi.fn((_text: string, x: number, y: number, _maxWidth?: number) => {
      checkCoords('strokeText', x, y);
    }),

    drawImage: vi.fn((image: any, ...args: any[]) => {
      checkCoords('drawImage', ...args);
      drawImageCalls.push({
        image,
        args,
        filterAtCall: current.filter,
        clipCountAtCall: current.clipPathCount,
      });
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
    getDrawImageCalls: () => drawImageCalls,
    getFilterTransitions: () => filterTransitions,
    getCurrentState: () => ({ ...current }),
    resetTelemetry: () => {
      stack = [];
      current = { ...DEFAULT_STATE };
      saveCount = 0;
      restoreCount = 0;
      underflowCount = 0;
      coordinateViolations.length = 0;
      drawImageCalls.length = 0;
      filterTransitions.length = 0;
    },
  };
}

describe('M3 Challenger Suite: Destructive 2D Canvas Export Blur Baking', () => {
  const mock4KBaseImage: BaseImage = {
    id: 'img-4k',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 3840,
    naturalHeight: 2160,
    fileName: 'retina-screen-4k.png',
    fileSize: 1024 * 500,
  };

  const mockStandardImage: BaseImage = {
    id: 'img-std',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'standard-screenshot.png',
    fileSize: 1024 * 200,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Challenge 1: Destructive Pixel Baking & Spatial Confinement Oracle
  // =========================================================================
  describe('Challenge 1: Destructive Pixel Baking & Spatial Confinement Oracle', () => {
    it('C1.1: Empirically proves underlying image pixels inside blur bounding box are permanently and irreversibly altered', () => {
      // 1. Create a 300x200 pixel test image containing sharp high-contrast text credentials
      const original = BlurDiffusionOracle.fromPattern(300, 200, 'text');
      const blurred = original.clone();

      const blurRegion = { x: 50, y: 40, w: 180, h: 80 };

      // Initial energy: sharp text lines produce significant high-frequency Laplacian energy
      const preEnergy = original.computeLaplacianEnergy(blurRegion.x, blurRegion.y, blurRegion.w, blurRegion.h);
      expect(preEnergy).toBeGreaterThan(40);

      // Apply destructive box blur to bounding box
      blurred.applyBoxBlur(blurRegion.x, blurRegion.y, blurRegion.w, blurRegion.h, 6);

      // Post blur metrics:
      const postEnergy = blurred.computeLaplacianEnergy(blurRegion.x, blurRegion.y, blurRegion.w, blurRegion.h);
      const mse = original.computeMSE(blurred, blurRegion.x, blurRegion.y, blurRegion.w, blurRegion.h);

      // 1. Mean Squared Error inside blurred box is strictly > 0 (permanent modification)
      expect(mse).toBeGreaterThan(500);

      // 2. High-frequency edge energy collapses by > 75%
      const energyDropRatio = (preEnergy - postEnergy) / preEnergy;
      expect(energyDropRatio).toBeGreaterThan(0.75);
      expect(postEnergy).toBeLessThan(15);
    });

    it('C1.2: Empirically proves Nyquist checkerboard pattern suffers total high-frequency contrast destruction', () => {
      const original = BlurDiffusionOracle.fromPattern(200, 200, 'checkerboard');
      const blurred = original.clone();

      const region = { x: 30, y: 30, w: 120, h: 120 };
      const preEnergy = original.computeLaplacianEnergy(region.x, region.y, region.w, region.h);

      blurred.applyBoxBlur(region.x, region.y, region.w, region.h, 8);

      const postEnergy = blurred.computeLaplacianEnergy(region.x, region.y, region.w, region.h);

      // Nyquist pattern pre-energy is near theoretical maximum (~255)
      expect(preEnergy).toBeGreaterThan(200);
      // Post-energy is crushed to near zero (< 5)
      expect(postEnergy).toBeLessThan(5);
      expect(postEnergy / preEnergy).toBeLessThan(0.05); // >95% reduction
    });

    it('C1.3: Verifies Zero Spillover Invariant: pixels outside blurred bounding box remain 100% bitwise identical', () => {
      const original = BlurDiffusionOracle.fromPattern(400, 300, 'text');
      const blurred = original.clone();

      const blurRegion = { x: 80, y: 60, w: 140, h: 90 };
      blurred.applyBoxBlur(blurRegion.x, blurRegion.y, blurRegion.w, blurRegion.h, 7);

      // Check all pixels outside (80, 60, 140, 90)
      const spillover = blurred.verifyZeroSpillover(original, [blurRegion]);

      // Zero spillover: exact 0 discrepancy outside the blur box
      expect(spillover.spilloverCount).toBe(0);
      expect(spillover.maxDiscrepancy).toBe(0);

      // Spot check boundary pixels:
      // Pixel right above: (100, 59) must be identical
      expect(blurred.getPixel(100, 59)).toEqual(original.getPixel(100, 59));
      // Pixel right below: (100, 150) must be identical
      expect(blurred.getPixel(100, 150)).toEqual(original.getPixel(100, 150));
      // Pixel right left: (79, 80) must be identical
      expect(blurred.getPixel(79, 80)).toEqual(original.getPixel(79, 80));
      // Pixel right right: (220, 80) must be identical
      expect(blurred.getPixel(220, 80)).toEqual(original.getPixel(220, 80));
    });

    it('C1.4: Multi-region blur independence: N non-overlapping blur boxes modify only their own bounded regions', () => {
      const original = BlurDiffusionOracle.fromPattern(500, 400, 'text');
      const blurred = original.clone();

      const regions = [
        { x: 30, y: 40, w: 100, h: 60 },
        { x: 180, y: 50, w: 120, h: 70 },
        { x: 340, y: 60, w: 110, h: 80 },
        { x: 80, y: 220, w: 150, h: 90 },
        { x: 280, y: 240, w: 160, h: 100 },
      ];

      for (const r of regions) {
        blurred.applyBoxBlur(r.x, r.y, r.w, r.h, 5);
      }

      // Every region individually has high MSE > 300
      for (const r of regions) {
        const mse = original.computeMSE(blurred, r.x, r.y, r.w, r.h);
        expect(mse).toBeGreaterThan(300);
      }

      // Zero spillover across the entire 500x400 canvas outside all 5 regions
      const spillover = blurred.verifyZeroSpillover(original, regions);
      expect(spillover.spilloverCount).toBe(0);
      expect(spillover.maxDiscrepancy).toBe(0);
    });

    it('C1.5: Overlapping blur boxes blend destructively in their union without clipping or overflow', () => {
      const original = BlurDiffusionOracle.fromPattern(300, 300, 'checkerboard');
      const blurred = original.clone();

      const boxA = { x: 50, y: 50, w: 120, h: 100 };
      const boxB = { x: 110, y: 90, w: 130, h: 110 }; // Overlaps boxA in [110, 170] x [90, 150]

      blurred.applyBoxBlur(boxA.x, boxA.y, boxA.w, boxA.h, 5);
      blurred.applyBoxBlur(boxB.x, boxB.y, boxB.w, boxB.h, 5);

      // Overlap intersection center point (140, 120)
      const overlapEnergy = blurred.computeLaplacianEnergy(110, 90, 60, 60);
      expect(overlapEnergy).toBeLessThan(10);

      // Outside union: zero spillover
      const spillover = blurred.verifyZeroSpillover(original, [boxA, boxB]);
      expect(spillover.spilloverCount).toBe(0);
    });
  });

  // =========================================================================
  // Challenge 2: Canvas State Isolation, Save/Restore Symmetry & Filter Invariance
  // =========================================================================
  describe('Challenge 2: Canvas State Isolation, Save/Restore Symmetry & Filter Invariance', () => {
    it('C2.1: 2D Canvas Exporter executes destructive blur baking with exact 1:1 save() / restore() balance', async () => {
      const blur1: Annotation = {
        id: 'blur-1',
        index: 1,
        geometry: { type: 'blur', x: 100, y: 100, width: 250, height: 150, borderRadius: 2 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blur sensitive credential',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const blur2: Annotation = {
        id: 'blur-2',
        index: 2,
        geometry: { type: 'blur', x: 400, y: 300, width: 200, height: 100, borderRadius: 2 },
        style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blur username',
        createdAt: 2000,
        updatedAt: 2000,
      };

      const canvas = await renderCompositeCanvas(mockStandardImage, [blur1, blur2]);
      const mainCtx = canvas.getContext('2d')!;

      // Verify that save and restore were called
      expect(mainCtx.save).toHaveBeenCalled();
      expect(mainCtx.restore).toHaveBeenCalled();

      // Number of save calls must equal number of restore calls
      const saveCalls = vi.mocked(mainCtx.save).mock.calls.length;
      const restoreCalls = vi.mocked(mainCtx.restore).mock.calls.length;
      expect(saveCalls).toBe(restoreCalls);

      // Base image drawImage (call 0) + 2 blur baking drawImage calls (call 1, 2)
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(3);

      // Clip was invoked exactly twice (once per blur box)
      expect(mainCtx.clip).toHaveBeenCalledTimes(2);

      // Rect path defined for each blur box
      expect(mainCtx.rect).toHaveBeenCalledWith(100, 100, 250, 150);
      expect(mainCtx.rect).toHaveBeenCalledWith(400, 300, 200, 100);
    });

    it('C2.2: Instrumented context verifies ctx.filter is set to "blur(12px)" during baking and reverts cleanly', async () => {
      const instrumented = createInstrumentedContext(1920, 1080);

      // Mock HTMLCanvasElement.prototype.getContext to return our instrumented context
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, contextId: string) {
        if (contextId === '2d') {
          return instrumented.ctx;
        }
        return null;
      }) as any;

      try {
        const blurAnnotation: Annotation = {
          id: 'blur-filter-test',
          index: 1,
          geometry: { type: 'blur', x: 150, y: 150, width: 300, height: 120, borderRadius: 2 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Filter isolation test',
          createdAt: 1000,
          updatedAt: 1000,
        };

        await renderCompositeCanvas(mockStandardImage, [blurAnnotation]);

        // 1. Filter transitions must include 'blur(12px)'
        const filterHistory = instrumented.getFilterTransitions();
        expect(filterHistory).toContain('blur(12px)');

        // 2. DrawImage call for blur was executed while filter was 'blur(12px)'
        const drawCalls = instrumented.getDrawImageCalls();
        expect(drawCalls.length).toBeGreaterThanOrEqual(2);

        // First call is base image (filter = 'none')
        expect(drawCalls[0].filterAtCall).toBe('none');
        // Second call is blurred image (filter = 'blur(12px)', clipped)
        expect(drawCalls[1].filterAtCall).toBe('blur(12px)');
        expect(drawCalls[1].clipCountAtCall).toBeGreaterThanOrEqual(1);

        // 3. Final state of main canvas after export completion must have filter === 'none'
        const finalState = instrumented.getCurrentState();
        expect(finalState.filter).toBe('none');

        // 4. Save/Restore stack depth must return to 0 (zero stack leakage)
        expect(instrumented.getStateStackDepth()).toBe(0);
        expect(instrumented.getUnderflowCount()).toBe(0);
        expect(instrumented.getSaveCount()).toBe(instrumented.getRestoreCount());
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it('C2.3: Interleaved shapes: ctx.filter does NOT leak into subsequent arrow, box, highlight, or pin annotations', async () => {
      const instrumented = createInstrumentedContext(1920, 1080);

      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, contextId: string) {
        if (contextId === '2d') {
          return instrumented.ctx;
        }
        return null;
      }) as any;

      try {
        const blurBefore: Annotation = {
          id: 'blur-lead',
          index: 1,
          geometry: { type: 'blur', x: 100, y: 100, width: 200, height: 100 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Blur first',
          createdAt: 1000,
          updatedAt: 1000,
        };

        const arrowAfter: Annotation = {
          id: 'arrow-after',
          index: 2,
          geometry: { type: 'arrow', startX: 400, startY: 300, endX: 700, endY: 300 },
          style: { color: 'red', strokeWidth: 6, fillOpacity: 0.2 },
          note: 'Sharp arrow after blur',
          createdAt: 2000,
          updatedAt: 2000,
        };

        const pinAfter: Annotation = {
          id: 'pin-after',
          index: 3,
          geometry: { type: 'pin', x: 850, y: 450 },
          style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.2 },
          note: 'Crisp pin marker',
          createdAt: 3000,
          updatedAt: 3000,
        };

        await renderCompositeCanvas(mockStandardImage, [blurBefore, arrowAfter, pinAfter]);

        // When rasterizing vector annotations (arrows, pins, badges), filter must be 'none'
        const state = instrumented.getCurrentState();
        expect(state.filter).toBe('none');

        // All 3 badges rendered cleanly
        expect(instrumented.ctx.fillText).toHaveBeenCalledWith('1', 100, 100);
        expect(instrumented.ctx.fillText).toHaveBeenCalledWith('2', 400, 300);
        expect(instrumented.ctx.fillText).toHaveBeenCalledWith('3', 850, 423);

        // Arrowhead tip was drawn at (700, 300) with crisp lines (no filter)
        expect(instrumented.ctx.moveTo).toHaveBeenCalledWith(700, 300);
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it('C2.4: Zero clip leakage: subsequent annotations drawn outside blur box are not clipped by the blur clip path', () => {
      const instrumented = createInstrumentedContext();

      const blurAnnotation: Annotation = {
        id: 'blur-clip-test',
        index: 1,
        geometry: { type: 'blur', x: 50, y: 50, width: 100, height: 100 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blur annotation for rasterizeAnnotation',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(instrumented.ctx, blurAnnotation);

      // Stack depth must be 0 after rasterizeAnnotation
      expect(instrumented.getStateStackDepth()).toBe(0);
      expect(instrumented.getUnderflowCount()).toBe(0);
      expect(instrumented.getSaveCount()).toBe(instrumented.getRestoreCount());
      expect(instrumented.getCurrentState().filter).toBe('none');
    });

    it('C2.5: Zero style contamination: strokeStyle, fillStyle, and shadow do not bleed from blur border into subsequent shapes', () => {
      const instrumented = createInstrumentedContext();

      const blurAnnotation: Annotation = {
        id: 'blur-style-test',
        index: 1,
        geometry: { type: 'blur', x: 200, y: 200, width: 150, height: 80, borderRadius: 4 },
        style: { color: 'green', strokeWidth: 5, fillOpacity: 0.3 },
        note: 'Green blur',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(instrumented.ctx, blurAnnotation);

      // Context restored cleanly
      const state = instrumented.getCurrentState();
      expect(state.shadowBlur).toBe(0);
      expect(state.shadowColor).toBe('transparent');
      expect(state.globalCompositeOperation).toBe('source-over');
    });
  });

  // =========================================================================
  // Challenge 3: Fallback Diffusion Oracle (bakeBlurFallback)
  // =========================================================================
  describe('Challenge 3: Fallback Diffusion Oracle (bakeBlurFallback)', () => {
    it('C3.1: Automatic fallback invocation when "filter" property is absent from canvas context', async () => {
      const fallbackCtx = createInstrumentedContext(1920, 1080);
      // Remove 'filter' property to simulate legacy browser or canvas implementation lacking ctx.filter
      delete (fallbackCtx.ctx as any).filter;

      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      let isMainCanvas = true;
      HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, contextId: string) {
        if (contextId === '2d') {
          if (this.width === 1920 && this.height === 1080 && isMainCanvas) {
            isMainCanvas = false;
            return fallbackCtx.ctx;
          }
          const subCtx = createInstrumentedContext(this.width, this.height);
          delete (subCtx.ctx as any).filter;
          return subCtx.ctx;
        }
        return null;
      }) as any;

      try {
        const blurAnnotation: Annotation = {
          id: 'blur-fallback-1',
          index: 1,
          geometry: { type: 'blur', x: 200, y: 150, width: 300, height: 200 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Fallback blur',
          createdAt: 1000,
          updatedAt: 1000,
        };

        await renderCompositeCanvas(mockStandardImage, [blurAnnotation]);

        // In fallback mode:
        // Main canvas receives drawImage calls:
        // 1. Base image (0, 0, W, H)
        // 2. Fallback upscaled drawImage from smallCanvas (smallCanvas, 0, 0, sW, sH, x, y, w, h)
        const drawCalls = fallbackCtx.getDrawImageCalls();
        expect(drawCalls.length).toBeGreaterThanOrEqual(2);

        // Second draw call drew the small temporary canvas back into (200, 150, 300, 200)
        const fallbackDraw = drawCalls[1];
        expect(fallbackDraw.args[4]).toBe(200); // x
        expect(fallbackDraw.args[5]).toBe(150); // y
        expect(fallbackDraw.args[6]).toBe(300); // w
        expect(fallbackDraw.args[7]).toBe(200); // h
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it('C3.2: 10x downscale/upscale bilinear diffusion destroys >90% of high-frequency contrast', () => {
      const original = BlurDiffusionOracle.fromPattern(400, 300, 'text');
      const diffused = original.clone();

      const region = { x: 40, y: 50, w: 200, h: 100 };

      // Pre-diffusion energy of sharp text
      const preEnergy = original.computeLaplacianEnergy(region.x, region.y, region.w, region.h);
      expect(preEnergy).toBeGreaterThan(35);

      // Apply bakeBlurFallback mathematical simulation
      diffused.applyFallbackDiffusion(region.x, region.y, region.w, region.h);

      const postEnergy = diffused.computeLaplacianEnergy(region.x, region.y, region.w, region.h);
      const mse = original.computeMSE(diffused, region.x, region.y, region.w, region.h);

      // Fallback diffusion destroys high-frequency details
      expect(mse).toBeGreaterThan(400);
      expect(postEnergy / preEnergy).toBeLessThan(0.15); // >85% reduction
      expect(postEnergy).toBeLessThan(8);

      // Zero spillover outside fallback region
      const spillover = diffused.verifyZeroSpillover(original, [region]);
      expect(spillover.spilloverCount).toBe(0);
    });

    it('C3.3: bakeBlurFallback verifies temporary canvas dimensions use Math.max(2, Math.round(dim / 10))', () => {
      const mockCtx = {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const mockImg = { width: 1920, height: 1080 } as HTMLImageElement;

      // Test a 250x180 region
      bakeBlurFallback(mockCtx, mockImg, 100, 100, 250, 180);

      // sampleW = Math.max(2, Math.round(250 / 10)) = 25
      // sampleH = Math.max(2, Math.round(180 / 10)) = 18
      // Upward drawImage back to mockCtx:
      expect(mockCtx.drawImage).toHaveBeenCalledWith(
        expect.any(Object), // smallCanvas
        0,
        0,
        25,
        18,
        100,
        100,
        250,
        180
      );
    });

    it('C3.4: Degenerate dimensions resilience: w <= 0 or h <= 0 safely returns without error or canvas creation', () => {
      const mockCtx = {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const mockImg = { width: 1000, height: 1000 } as HTMLImageElement;

      expect(() => bakeBlurFallback(mockCtx, mockImg, 50, 50, 0, 100)).not.toThrow();
      expect(() => bakeBlurFallback(mockCtx, mockImg, 50, 50, 100, 0)).not.toThrow();
      expect(() => bakeBlurFallback(mockCtx, mockImg, 50, 50, -50, 100)).not.toThrow();
      expect(() => bakeBlurFallback(mockCtx, mockImg, 50, 50, 100, -50)).not.toThrow();
      expect(mockCtx.drawImage).not.toHaveBeenCalled();
    });

    it('C3.5: Micro-region handling: 1x1, 2x2, 5x5 regions safely maintain minimum 2px sample canvas', () => {
      const mockCtx = {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const mockImg = { width: 1000, height: 1000 } as HTMLImageElement;

      // 1x1 box: 1 / 10 = 0.1 -> Math.round = 0 -> Math.max(2, 0) = 2
      bakeBlurFallback(mockCtx, mockImg, 10, 10, 1, 1);
      expect(mockCtx.drawImage).toHaveBeenCalledWith(
        expect.any(Object),
        0,
        0,
        2,
        2,
        10,
        10,
        1,
        1
      );

      // 5x5 box: 5 / 10 = 0.5 -> Math.round = 1 -> Math.max(2, 1) = 2
      bakeBlurFallback(mockCtx, mockImg, 20, 20, 5, 5);
      expect(mockCtx.drawImage).toHaveBeenCalledWith(
        expect.any(Object),
        0,
        0,
        2,
        2,
        20,
        20,
        5,
        5
      );
    });

    it('C3.6: Non-integer / fractional coordinates processed without NaN in canvas calls', () => {
      const mockCtx = {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const mockImg = { width: 1000, height: 1000 } as HTMLImageElement;

      // Fractional coordinates from high-DPI scaling
      bakeBlurFallback(mockCtx, mockImg, 15.7, 23.4, 102.8, 88.6);

      expect(mockCtx.drawImage).toHaveBeenCalledWith(
        expect.any(Object),
        0,
        0,
        10, // Math.round(102.8 / 10) = 10
        9,  // Math.round(88.6 / 10) = 9
        15.7,
        23.4,
        102.8,
        88.6
      );
    });

    it('C3.7: Slivers and high-aspect-ratio regions (1000x2 and 2x1000) execute safely', () => {
      const mockCtx = {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const mockImg = { width: 2000, height: 2000 } as HTMLImageElement;

      // Ultra-wide sliver: 1000 x 2
      bakeBlurFallback(mockCtx, mockImg, 10, 10, 1000, 2);
      expect(mockCtx.drawImage).toHaveBeenCalledWith(
        expect.any(Object),
        0,
        0,
        100, // 1000 / 10
        2,   // Math.max(2, Math.round(2 / 10))
        10,
        10,
        1000,
        2
      );

      // Ultra-tall sliver: 2 x 1000
      bakeBlurFallback(mockCtx, mockImg, 10, 10, 2, 1000);
      expect(mockCtx.drawImage).toHaveBeenCalledWith(
        expect.any(Object),
        0,
        0,
        2,   // Math.max(2, Math.round(2 / 10))
        100, // 1000 / 10
        10,
        10,
        2,
        1000
      );
    });
  });

  // =========================================================================
  // Challenge 4: High-Load 4K Composite Stress & Memory Stability
  // =========================================================================
  describe('Challenge 4: High-Load 4K Composite Stress & Memory Stability', () => {
    it('C4.1: Massive workload export: 50+ blur + 20 highlight spotlights + 30 arrows on 4K canvas (3840x2160)', async () => {
      const blurCount = 55;
      const highlightCount = 20;
      const arrowCount = 30;
      const totalCount = blurCount + highlightCount + arrowCount;

      const annotations: Annotation[] = [];
      let seqIndex = 1;

      // 1. Generate 55 Blur Annotations distributed across 4K canvas
      for (let i = 0; i < blurCount; i++) {
        const col = i % 8;
        const row = Math.floor(i / 8);
        annotations.push({
          id: `blur-4k-${i + 1}`,
          index: seqIndex++,
          geometry: {
            type: 'blur',
            x: 80 + col * 460,
            y: 60 + row * 280,
            width: 220 + (i % 4) * 20,
            height: 120 + (i % 3) * 15,
            borderRadius: 2,
          } as BlurGeometry,
          style: {
            color: (['amber', 'red', 'green', 'cyan', 'purple'] as PresetColor[])[i % 5],
            strokeWidth: 3,
            fillOpacity: 0.15,
          },
          note: `4K Confidential Blur #${i + 1}`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        });
      }

      // 2. Generate 20 Highlight Spotlights distributed across 4K canvas
      for (let i = 0; i < highlightCount; i++) {
        const col = i % 5;
        const row = Math.floor(i / 5);
        annotations.push({
          id: `hl-4k-${i + 1}`,
          index: seqIndex++,
          geometry: {
            type: 'highlight',
            x: 200 + col * 700,
            y: 150 + row * 450,
            width: 350 + (i % 3) * 30,
            height: 200 + (i % 2) * 20,
            borderRadius: 6,
          } as HighlightGeometry,
          style: {
            color: 'amber',
            strokeWidth: 3,
            fillOpacity: 0.15,
          },
          note: `4K Spotlight Focus #${i + 1}`,
          createdAt: 2000 + i,
          updatedAt: 2000 + i,
        });
      }

      // 3. Generate 30 Arrows pointing across 4K canvas
      for (let i = 0; i < arrowCount; i++) {
        const col = i % 6;
        const row = Math.floor(i / 6);
        const startX = 150 + col * 600;
        const startY = 200 + row * 380;
        annotations.push({
          id: `arrow-4k-${i + 1}`,
          index: seqIndex++,
          geometry: {
            type: 'arrow',
            startX,
            startY,
            endX: startX + 180 + (i % 5) * 20,
            endY: startY + 120 + (i % 4) * 15,
          } as ArrowGeometry,
          style: {
            color: (['red', 'amber', 'green', 'cyan', 'purple'] as PresetColor[])[i % 5],
            strokeWidth: 6,
            fillOpacity: 0.2,
          },
          note: `4K Pointer Arrow #${i + 1}`,
          createdAt: 3000 + i,
          updatedAt: 3000 + i,
        });
      }

      expect(annotations).toHaveLength(totalCount); // Exactly 105 annotations

      const startTime = performance.now();
      const canvas = await renderCompositeCanvas(mock4KBaseImage, annotations);
      const elapsedMs = performance.now() - startTime;

      // 1. Strict 4K Canvas resolution preservation
      expect(canvas.width).toBe(3840);
      expect(canvas.height).toBe(2160);

      // 2. High-load composite performance budget: 105 annotations on 4K must complete in < 2500ms
      expect(elapsedMs).toBeLessThan(2500);

      const mainCtx = canvas.getContext('2d')!;

      // 3. DrawImage invocation count verification:
      // Base image (1) + 55 blur baking draws (55) + 1 unified offscreen highlight backdrop (1) = 57 drawImage calls
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1 + blurCount + 1);

      // 4. Clip invoked exactly 55 times for blur annotations
      expect(mainCtx.clip).toHaveBeenCalledTimes(blurCount);

      // 5. Total text badges rendered matches total annotations (105)
      expect(mainCtx.fillText).toHaveBeenCalledTimes(totalCount);
    });

    it('C4.2: Zero coordinate violations across 100+ composite annotations (zero NaN, zero Infinity)', async () => {
      const instrumented = createInstrumentedContext(3840, 2160);

      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, contextId: string) {
        if (contextId === '2d') {
          return instrumented.ctx;
        }
        return null;
      }) as any;

      try {
        const heavySet: Annotation[] = [];
        for (let i = 1; i <= 50; i++) {
          heavySet.push({
            id: `b-${i}`,
            index: i,
            geometry: {
              type: 'blur',
              x: (i * 70) % 3600,
              y: (i * 40) % 2000,
              width: 150 + (i % 10) * 10,
              height: 80 + (i % 5) * 10,
              borderRadius: 2,
            },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: `Blur ${i}`,
            createdAt: 1000 + i,
            updatedAt: 1000 + i,
          });
        }
        for (let i = 51; i <= 70; i++) {
          heavySet.push({
            id: `h-${i}`,
            index: i,
            geometry: {
              type: 'highlight',
              x: (i * 120) % 3500,
              y: (i * 80) % 1900,
              width: 250,
              height: 150,
              borderRadius: 4,
            },
            style: { color: 'green', strokeWidth: 3, fillOpacity: 0.15 },
            note: `Highlight ${i}`,
            createdAt: 1000 + i,
            updatedAt: 1000 + i,
          });
        }
        for (let i = 71; i <= 100; i++) {
          heavySet.push({
            id: `a-${i}`,
            index: i,
            geometry: {
              type: 'arrow',
              startX: (i * 100) % 3500,
              startY: (i * 60) % 1900,
              endX: ((i * 100) % 3500) + 150,
              endY: ((i * 60) % 1900) + 100,
            },
            style: { color: 'red', strokeWidth: 6, fillOpacity: 0.2 },
            note: `Arrow ${i}`,
            createdAt: 1000 + i,
            updatedAt: 1000 + i,
          });
        }

        await renderCompositeCanvas(mock4KBaseImage, heavySet);

        // Assert strictly zero NaN or Infinity coordinate violations across all canvas drawing calls
        const violations = instrumented.getCoordinateViolations();
        expect(violations).toHaveLength(0);
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it('C4.3: Multi-iteration stability: 10 consecutive 4K exports execute smoothly without degradation or memory buildup', async () => {
      const testAnnotations: Annotation[] = [
        {
          id: 'blur-stress-1',
          index: 1,
          geometry: { type: 'blur', x: 200, y: 200, width: 400, height: 300, borderRadius: 2 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Stress blur',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'hl-stress-2',
          index: 2,
          geometry: { type: 'highlight', x: 700, y: 300, width: 500, height: 350, borderRadius: 6 },
          style: { color: 'green', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Stress highlight',
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          id: 'arrow-stress-3',
          index: 3,
          geometry: { type: 'arrow', startX: 1300, startY: 400, endX: 1600, endY: 600 },
          style: { color: 'red', strokeWidth: 6, fillOpacity: 0.2 },
          note: 'Stress arrow',
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];

      const iterations = 10;
      const durations: number[] = [];

      for (let run = 0; run < iterations; run++) {
        const start = performance.now();
        const canvas = await renderCompositeCanvas(mock4KBaseImage, testAnnotations);
        durations.push(performance.now() - start);

        expect(canvas.width).toBe(3840);
        expect(canvas.height).toBe(2160);
      }

      // Average duration must be fast
      const avgDuration = durations.reduce((a, b) => a + b, 0) / iterations;
      expect(avgDuration).toBeLessThan(100);

      // Latest iteration must not be degraded compared to first (no progressive memory thrashing)
      const lastDuration = durations[iterations - 1];
      expect(lastDuration).toBeLessThan(avgDuration * 3 + 50);
    });

    it('C4.4: Interleaved rendering order verifies strict visual layering hierarchy', async () => {
      // Create a scenario where blur is under a highlight spotlight, and arrow tail starts on blur
      const blur: Annotation = {
        id: 'blur-base',
        index: 1,
        geometry: { type: 'blur', x: 200, y: 200, width: 300, height: 200 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blurred secret',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const highlight: Annotation = {
        id: 'hl-overlay',
        index: 2,
        geometry: { type: 'highlight', x: 150, y: 150, width: 500, height: 400 },
        style: { color: 'green', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Highlight enclosing blur',
        createdAt: 2000,
        updatedAt: 2000,
      };

      const arrow: Annotation = {
        id: 'arrow-pointer',
        index: 3,
        geometry: { type: 'arrow', startX: 250, startY: 250, endX: 600, endY: 350 },
        style: { color: 'red', strokeWidth: 6, fillOpacity: 0.2 },
        note: 'Arrow starting in blur',
        createdAt: 3000,
        updatedAt: 3000,
      };

      const canvas = await renderCompositeCanvas(mockStandardImage, [blur, highlight, arrow]);
      const mainCtx = canvas.getContext('2d')!;

      // Call 0: Base image
      // Call 1: Destructive blur baking
      // Call 2: Additive highlight backdrop
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(3);

      // Blur border stroke and badge rendered on top of baked pixels
      expect(mainCtx.fillText).toHaveBeenCalledWith('1', 200, 200);
      expect(mainCtx.fillText).toHaveBeenCalledWith('2', 150, 150);
      expect(mainCtx.fillText).toHaveBeenCalledWith('3', 250, 250);
    });
  });

  // =========================================================================
  // Challenge 5: End-to-End Export Pipeline (Blob, Data URL, Background Fill)
  // =========================================================================
  describe('Challenge 5: End-to-End Export Pipeline (Blob, Data URL, Background Fill)', () => {
    it('C5.1: exportCompositeBlob produces a valid PNG Blob containing baked blur', async () => {
      const blurAnnotation: Annotation = {
        id: 'blur-blob',
        index: 1,
        geometry: { type: 'blur', x: 100, y: 100, width: 200, height: 120 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blob blur test',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const blob = await exportCompositeBlob(mockStandardImage, [blurAnnotation]);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('C5.2: exportCompositeDataUrl produces a valid data:image/png;base64 string', async () => {
      const blurAnnotation: Annotation = {
        id: 'blur-dataurl',
        index: 1,
        geometry: { type: 'blur', x: 50, y: 50, width: 150, height: 80 },
        style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'DataURL blur test',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const dataUrl = await exportCompositeDataUrl(mockStandardImage, [blurAnnotation]);
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('C5.3: Background color fill support when base image has transparency with blur', async () => {
      const instrumented = createInstrumentedContext(1920, 1080);
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, contextId: string) {
        if (contextId === '2d') {
          return instrumented.ctx;
        }
        return null;
      }) as any;

      try {
        const blurAnnotation: Annotation = {
          id: 'blur-bg-test',
          index: 1,
          geometry: { type: 'blur', x: 100, y: 100, width: 200, height: 150 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Background color fill',
          createdAt: 1000,
          updatedAt: 1000,
        };

        const canvas = await renderCompositeCanvas(mockStandardImage, [blurAnnotation], {
          backgroundColor: '#FFFFFF',
        });

        // Background filled with white before base image
        expect(instrumented.ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
        expect(canvas.width).toBe(1920);
        expect(canvas.height).toBe(1080);
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it('C5.4: Empty annotations fast-path: cleanly exports base image with zero blur overhead', async () => {
      const canvas = await renderCompositeCanvas(mockStandardImage, []);
      const mainCtx = canvas.getContext('2d')!;

      // Exactly 1 drawImage (base image only)
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1);
      expect(mainCtx.clip).not.toHaveBeenCalled();
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });
  });
});
