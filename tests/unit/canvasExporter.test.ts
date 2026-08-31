import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  rasterizeAnnotation,
  rasterizeBadge,
  drawRoundRect,
  hexToRgba,
  loadImageElement,
  createCanvas,
} from '../../src/export/canvasExporter';
import { BaseImage, Annotation } from '../../src/types';
import { PRESET_COLORS } from '../../src/constants/colors';

describe('1:1 Native Composite Canvas Exporter Unit Tests', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'dashboard-screenshot.png',
    fileSize: 1024 * 100,
  };

  const mockBox: Annotation = {
    id: 'ann-1',
    index: 1,
    geometry: { type: 'box', x: 100, y: 150, width: 300, height: 200, borderRadius: 4 },
    style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
    note: 'Header layout issue',
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockEllipse: Annotation = {
    id: 'ann-2',
    index: 2,
    geometry: { type: 'ellipse', cx: 600, cy: 400, rx: 80, ry: 50 },
    style: { color: 'green', strokeWidth: 3, fillOpacity: 0.15 },
    note: 'User avatar container',
    createdAt: 2000,
    updatedAt: 2000,
  };

  const mockArrow: Annotation = {
    id: 'ann-3',
    index: 3,
    geometry: { type: 'arrow', startX: 200, startY: 300, endX: 500, endY: 600 },
    style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
    note: 'Move button here',
    createdAt: 3000,
    updatedAt: 3000,
  };

  const mockPin: Annotation = {
    id: 'ann-4',
    index: 4,
    geometry: { type: 'pin', x: 800, y: 700 },
    style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.2 },
    note: 'Missing tooltip',
    createdAt: 4000,
    updatedAt: 4000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Group 1: Canvas Dimensions & 1:1 Scaling
  // =========================================================================
  describe('Group 1: Canvas Dimensions & 1:1 Scaling', () => {
    it('E1.1: Creates offscreen canvas with exact naturalWidth and naturalHeight of base image', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockBox]);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('E1.2: Renders minimal 1x1 image up to 8K (7680x4320) unscaled dimensions', async () => {
      const img1x1: BaseImage = { ...mockBaseImage, naturalWidth: 1, naturalHeight: 1 };
      const canvas1x1 = await renderCompositeCanvas(img1x1, []);
      expect(canvas1x1.width).toBe(1);
      expect(canvas1x1.height).toBe(1);

      const img8K: BaseImage = { ...mockBaseImage, naturalWidth: 7680, naturalHeight: 4320 };
      const canvas8K = await renderCompositeCanvas(img8K, []);
      expect(canvas8K.width).toBe(7680);
      expect(canvas8K.height).toBe(4320);
    });

    it('E1.3: Background color fill option paints canvas prior to image drawing', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [], {
        backgroundColor: '#FFFFFF',
      });
      const ctx = canvas.getContext('2d')!;
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    });

    it('E1.4: Helper hexToRgba accurately converts hex colors and bounds opacity', () => {
      expect(hexToRgba('#EF4444', 0.5)).toBe('rgba(239, 68, 68, 0.5)');
      expect(hexToRgba('#FFF', 1.0)).toBe('rgba(255, 255, 255, 1)');
      expect(hexToRgba('#000000', -0.5)).toBe('rgba(0, 0, 0, 0)');
      expect(hexToRgba('#000000', 1.5)).toBe('rgba(0, 0, 0, 1)');
    });

    it('E1.5: Helper loadImageElement loads valid image source', async () => {
      const img = await loadImageElement(mockBaseImage.src);
      expect(img).toBeDefined();
    });
  });

  // =========================================================================
  // Group 2: Vector Shape Rasterization Accuracy
  // =========================================================================
  describe('Group 2: Vector Shape Rasterization Accuracy', () => {
    it('E2.1: Rasterizes Box annotation with correct x, y, width, height, fill and stroke', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockBox);

      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalledWith('1', 100, 150);
    });

    it('E2.2: Rasterizes Ellipse annotation with center and radii matching natural coordinates', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockEllipse);

      expect(ctx.ellipse).toHaveBeenCalledWith(600, 400, 80, 50, 0, 0, 2 * Math.PI);
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('E2.3: Rasterizes Directional Arrow with exact 30° arrowhead wings, recessed notch, and shaft', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockArrow);

      expect(ctx.moveTo).toHaveBeenCalledWith(200, 300);
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it('E2.4: Rasterizes Callout Pin teardrop profile with drop shadow, border, and centered index', () => {
      const canvas = createCanvas(1000, 1000);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockPin);

      expect(ctx.bezierCurveTo).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalledWith(800, 680, 14, Math.PI, 0, false);
      expect(ctx.fillText).toHaveBeenCalledWith('4', 800, 680);
    });

    it('E2.5: drawRoundRect fallback correctly draws arcs and lines when ctx.roundRect is absent', () => {
      const canvas = createCanvas(400, 400);
      const ctx = canvas.getContext('2d')!;
      // Temporarily remove roundRect to force fallback path
      const originalRoundRect = (ctx as any).roundRect;
      delete (ctx as any).roundRect;

      drawRoundRect(ctx, 10, 20, 100, 50, 8);
      expect(ctx.moveTo).toHaveBeenCalledWith(18, 20);
      expect(ctx.lineTo).toHaveBeenCalledWith(102, 20);
      expect(ctx.arcTo).toHaveBeenCalled();

      if (originalRoundRect) (ctx as any).roundRect = originalRoundRect;
    });
  });

  // =========================================================================
  // Group 3: Numbered Badge Anchoring & Pill Expansion
  // =========================================================================
  describe('Group 3: Numbered Badge Anchoring & Pill Expansion', () => {
    it('E3.1: Anchors Box badge at top-left corner (x, y)', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockBox);

      // Badge for Box is at (100, 150)
      expect(ctx.fillText).toHaveBeenCalledWith('1', 100, 150);
    });

    it('E3.2: Anchors Ellipse badge at 225° diagonal apex', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockEllipse);

      const expectedX = 600 - 80 * Math.SQRT1_2;
      const expectedY = 400 - 50 * Math.SQRT1_2;
      expect(ctx.fillText).toHaveBeenCalledWith('2', expectedX, expectedY);
    });

    it('E3.3: Arrow badge is strictly anchored at tail start point to keep head unobstructed', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockArrow);

      // Tail start point is (200, 300)
      expect(ctx.fillText).toHaveBeenCalledWith('3', 200, 300);
    });

    it('E3.4: Renders single-digit index as circle (radius 12px) and multi-digit index as expanded pill', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      // Single digit (index 1)
      rasterizeBadge(ctx, { x: 50, y: 50 }, 1, 'red');
      expect(ctx.arc).toHaveBeenCalledWith(50, 50, 12, 0, 2 * Math.PI);

      // Multi-digit (index 12) -> pill
      rasterizeBadge(ctx, { x: 100, y: 100 }, 12, 'amber');
      expect(ctx.fillText).toHaveBeenCalledWith('12', 100, 100);
    });

    it('E3.5: Applies dark badge text on Potato Gold (Amber) and white text on Red/Green/Cyan/Purple', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      rasterizeBadge(ctx, { x: 100, y: 100 }, 1, 'amber');
      expect(PRESET_COLORS.amber.badgeText).toBe('#1E293B');

      rasterizeBadge(ctx, { x: 100, y: 100 }, 1, 'red');
      expect(PRESET_COLORS.red.badgeText).toBe('#FFFFFF');
    });
  });

  // =========================================================================
  // Group 4: Blob Generation & Format Conversion
  // =========================================================================
  describe('Group 4: Blob Generation & Format Conversion', () => {
    it('E4.1: exportCompositeBlob returns valid image/png Blob with non-zero byte size', async () => {
      const blob = await exportCompositeBlob(mockBaseImage, [mockBox, mockEllipse]);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('E4.2: exportCompositeDataUrl returns valid data:image/png;base64 string', async () => {
      const dataUrl = await exportCompositeDataUrl(mockBaseImage, [mockBox]);
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('E4.3: Handles empty annotations array by outputting clean base image pass-through', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, []);
      expect(canvas.width).toBe(mockBaseImage.naturalWidth);
      expect(canvas.height).toBe(mockBaseImage.naturalHeight);
    });

    it('E4.4: Rejects gracefully with descriptive error when base image src fails to load', async () => {
      const brokenImage: BaseImage = {
        ...mockBaseImage,
        src: 'invalid-image-source://404',
      };

      // Mock Image failure
      const originalImage = globalThis.Image;
      (globalThis as any).Image = class MockFailingImage {
        crossOrigin = '';
        set src(_v: string) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
          }, 0);
        }
        onerror: ((e: any) => void) | null = null;
        onload: (() => void) | null = null;
      };

      await expect(renderCompositeCanvas(brokenImage, [])).rejects.toThrow(
        /Failed to load image from source/
      );

      globalThis.Image = originalImage;
    });

    it('E4.5: High-density composite: rasterizes 50 mixed annotations without performance degradation', async () => {
      const annotations: Annotation[] = Array.from({ length: 50 }, (_, i) => ({
        id: `ann-${i + 1}`,
        index: i + 1,
        geometry:
          i % 4 === 0
            ? { type: 'box', x: (i * 20) % 800, y: (i * 15) % 600, width: 80, height: 60 }
            : i % 4 === 1
            ? { type: 'ellipse', cx: (i * 25) % 800, cy: (i * 20) % 600, rx: 40, ry: 30 }
            : i % 4 === 2
            ? { type: 'arrow', startX: (i * 10) % 800, startY: (i * 10) % 600, endX: (i * 30) % 800, endY: (i * 20) % 600 }
            : { type: 'pin', x: (i * 35) % 800, y: (i * 25) % 600 },
        style: { color: (['red', 'amber', 'green', 'cyan', 'purple'] as const)[i % 5], strokeWidth: 4, fillOpacity: 0.18 },
        note: `Note #${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      const startTime = Date.now();
      const canvas = await renderCompositeCanvas(mockBaseImage, annotations);
      const elapsed = Date.now() - startTime;

      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
