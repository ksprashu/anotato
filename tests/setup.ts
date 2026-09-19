import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Polyfill Google Analytics 4 (window.dataLayer and window.gtag)
if (typeof window !== 'undefined') {
  window.dataLayer = [];
  window.gtag = vi.fn();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  if (typeof window !== 'undefined') {
    window.dataLayer = [];
    window.gtag = vi.fn();
  }
});

// Mock Canvas 2D Rendering Context
const createMockContext2D = (): CanvasRenderingContext2D => {
  let filterValue = 'none';
  const ctx = {
    canvas: null as unknown as HTMLCanvasElement,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    get filter() {
      return filterValue;
    },
    set filter(val: string) {
      filterValue = val;
    },
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalAlpha: 1.0,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,

    // Methods
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    transform: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    measureText: vi.fn((text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 8,
      fontBoundingBoxAscent: 10,
      fontBoundingBoxDescent: 2,
      emHeightAscent: 10,
      emHeightDescent: 2,
      hangingBaseline: 8,
      alphabeticBaseline: 0,
      ideographicBaseline: -2,
    })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createPattern: vi.fn(),
    getImageData: vi.fn((_sx: number, _sy: number, sw: number, sh: number) => ({
      data: new Uint8ClampedArray(sw * sh * 4),
      width: sw,
      height: sh,
      colorSpace: 'srgb' as PredefinedColorSpace,
    })),
    putImageData: vi.fn(),
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
  } as unknown as CanvasRenderingContext2D;

  return ctx;
};

// Polyfill HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, contextId: string) {
  if (contextId === '2d') {
    if (!(this as any).__mock2dContext) {
      const ctx = createMockContext2D();
      (ctx as unknown as { canvas: HTMLCanvasElement }).canvas = this;
      (this as any).__mock2dContext = ctx;
    }
    return (this as any).__mock2dContext;
  }
  return null;
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Polyfill HTMLCanvasElement.prototype.toDataURL
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

// Polyfill HTMLCanvasElement.prototype.toBlob
HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, callback: (blob: Blob | null) => void, type = 'image/png') {
  const dummyBlob = new Blob(['mock-png-binary-data'], { type });
  setTimeout(() => callback(dummyBlob), 0);
});

// Polyfill OffscreenCanvas
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  class MockOffscreenCanvas {
    width: number;
    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }

    getContext(contextId: string) {
      if (contextId === '2d') {
        const ctx = createMockContext2D();
        return ctx;
      }
      return null;
    }

    async convertToBlob(options?: { type?: string; quality?: number }) {
      return new Blob(['mock-offscreen-png-data'], { type: options?.type || 'image/png' });
    }
  }

  globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

// Polyfill createImageBitmap
if (typeof globalThis.createImageBitmap === 'undefined') {
  globalThis.createImageBitmap = vi.fn().mockImplementation(async (_source: ImageBitmapSource) => {
    return {
      width: 800,
      height: 600,
      close: vi.fn(),
    } as unknown as ImageBitmap;
  });
}

// Polyfill ClipboardItem
if (typeof globalThis.ClipboardItem === 'undefined') {
  class MockClipboardItem {
    types: string[];
    private data: Record<string, Blob>;

    constructor(items: Record<string, Blob>) {
      this.data = items;
      this.types = Object.keys(items);
    }

    async getType(type: string): Promise<Blob> {
      if (this.data[type]) {
        return this.data[type];
      }
      throw new Error(`Type ${type} not found in ClipboardItem`);
    }
  }

  globalThis.ClipboardItem = MockClipboardItem as unknown as typeof ClipboardItem;
}

// Polyfill navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    write: vi.fn().mockResolvedValue(undefined),
    writeText: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue([]),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
  configurable: true,
});

// Polyfill URL.createObjectURL and URL.revokeObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn((_blob: Blob | MediaSource) => `blob:http://localhost/${Math.random().toString(36).slice(2)}`);
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}

// Polyfill ResizeObserver
if (typeof globalThis.ResizeObserver === 'undefined') {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

// Polyfill PointerEvent
if (typeof globalThis.PointerEvent === 'undefined') {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? false;
    }
  }
  globalThis.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
  window.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
}

// Polyfill Element pointer capture methods
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
}

// Polyfill window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});


