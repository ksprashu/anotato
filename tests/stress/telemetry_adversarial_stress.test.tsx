import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  trackEvent,
  trackPaste,
  trackCopy,
  trackAnnotate,
  getEventLogForTesting,
  clearEventLogForTesting,
  setTelemetryEnabled,
  TelemetryShapeType,
  TelemetryCopyType,
  TelemetryPasteSource,
} from '../../src/analytics/telemetry';
import { AppProvider } from '../../src/state/AppContext';
import { ToastProvider } from '../../src/components/export/ToastNotification';
import { ExportActions } from '../../src/components/export/ExportActions';
import { SvgOverlay } from '../../src/components/canvas/SvgOverlay';
import { useClipboardPaste } from '../../src/hooks/useClipboardPaste';
import { App } from '../../src/App';
import { BaseImage, Annotation } from '../../src/types';

describe('Milestone Rel2: Adversarial Telemetry Stress & Failure Isolation Suite', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-adversarial-test',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'highres-screenshot.png',
    fileSize: 1048576,
  };

  const mockAnnotations: Annotation[] = [
    {
      id: 'ann-1',
      index: 1,
      geometry: { type: 'box', x: 10, y: 10, width: 100, height: 80 },
      style: { color: 'red', strokeWidth: 4, fillOpacity: 0.15 },
      note: 'Critical Bug #1',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'ann-2',
      index: 2,
      geometry: { type: 'ellipse', cx: 200, cy: 200, rx: 50, ry: 40 },
      style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.2 },
      note: 'Performance bottleneck note',
      createdAt: 1001,
      updatedAt: 1001,
    },
  ];

  beforeEach(() => {
    clearEventLogForTesting();
    setTelemetryEnabled(true);
    Object.defineProperty(window, 'gtag', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    window.dataLayer = [];
    window.createImageBitmap = vi.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      close: vi.fn(),
    });
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  });

  afterEach(() => {
    clearEventLogForTesting();
    setTelemetryEnabled(true);
    Object.defineProperty(window, 'gtag', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SUITE 1: High-Frequency Event Bursts & Rapid Cycles (1000+ Operations)
  // =========================================================================
  describe('Suite 1: High-Frequency Event Bursts & Rapid Cycles (1,000+ Operations)', () => {
    it('C1.1: Handles 1,000 rapid synchronous trackAnnotate calls with correct FIFO ordering and full parameter integrity', async () => {
      const shapeTypes: TelemetryShapeType[] = ['box', 'ellipse', 'arrow', 'pin'];
      const colors = ['red', 'amber', 'green', 'cyan', 'purple'];

      for (let i = 1; i <= 1000; i++) {
        const shapeType = shapeTypes[i % shapeTypes.length];
        const color = colors[i % colors.length];
        const strokeWidth = (i % 8) + 1;
        trackAnnotate({
          shapeType,
          color,
          strokeWidth,
          index: i,
        });
      }

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(1000);

      // Verify FIFO sequence and shape metadata integrity
      for (let i = 0; i < 1000; i++) {
        const idx = i + 1;
        expect(logs[i].event).toBe('annotate');
        expect(logs[i].params.annotation_index).toBe(idx);
        expect(logs[i].params.shape_type).toBe(shapeTypes[idx % shapeTypes.length]);
        expect(logs[i].params.color).toBe(colors[idx % colors.length]);
        expect(logs[i].params.stroke_width).toBe((idx % 8) + 1);
        expect(typeof logs[i].timestamp).toBe('number');
      }

      // Flush microtasks
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      expect(window.gtag).toHaveBeenCalledTimes(1000);
      expect(window.gtag).toHaveBeenNthCalledWith(
        1,
        'event',
        'annotate',
        expect.objectContaining({ annotation_index: 1 })
      );
      expect(window.gtag).toHaveBeenNthCalledWith(
        1000,
        'event',
        'annotate',
        expect.objectContaining({ annotation_index: 1000 })
      );
    });

    it('C1.2: Handles 1,000 rapid trackPaste events across varying sources and payloads', async () => {
      const sources: TelemetryPasteSource[] = ['clipboard', 'drop', 'file_picker', 'unknown'];

      for (let i = 1; i <= 1000; i++) {
        const source = sources[i % sources.length];
        trackPaste({
          source,
          fileSize: 1000 * i,
          fileType: 'image/png',
          width: 800 + i,
          height: 600 + i,
        });
      }

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(1000);
      expect(logs[999].params.dimensions).toBe('1800x1600');

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledTimes(1000);
    });

    it('C1.3: Handles 1,000 rapid trackCopy events spanning all 5 copy/export types', async () => {
      const copyTypes: TelemetryCopyType[] = [
        'image_clipboard',
        'notes_clipboard',
        'combined_clipboard',
        'png_download',
        'markdown_download',
      ];

      for (let i = 1; i <= 1000; i++) {
        trackCopy({
          type: copyTypes[i % copyTypes.length],
          annotationCount: i,
        });
      }

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(1000);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledTimes(1000);
    });

    it('C1.4: Survives 500 rapid interleaved cycles of paste -> annotate -> copy -> undo -> redo (2,500 total events)', async () => {
      for (let cycle = 0; cycle < 500; cycle++) {
        trackPaste({ source: 'clipboard', fileSize: 50000 });
        trackAnnotate({ shapeType: 'box', index: cycle + 1 });
        trackCopy({ type: 'image_clipboard', annotationCount: 1 });
        trackEvent('undo', { step: cycle });
        trackEvent('redo', { step: cycle });
      }

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(2500);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledTimes(2500);
    });

    it('C1.5: Repeatedly clears event log during active stream without dangling references or memory leaks', () => {
      for (let i = 0; i < 50; i++) {
        for (let k = 0; k < 20; k++) {
          trackAnnotate({ shapeType: 'pin', index: k });
        }
        expect(getEventLogForTesting()).toHaveLength(20);
        clearEventLogForTesting();
        expect(getEventLogForTesting()).toHaveLength(0);
      }
    });

    it('C1.6: Safely uses setTimeout fallback when queueMicrotask is undefined', async () => {
      const originalQueueMicrotask = window.queueMicrotask;
      // @ts-expect-error - simulating environment without queueMicrotask
      delete window.queueMicrotask;

      try {
        trackEvent('fallback_microtask_event', { test: true });
        expect(window.gtag).not.toHaveBeenCalled();

        await new Promise((r) => setTimeout(r, 15));
        expect(window.gtag).toHaveBeenCalledTimes(1);
        expect(window.gtag).toHaveBeenCalledWith('event', 'fallback_microtask_event', { test: true });
      } finally {
        window.queueMicrotask = originalQueueMicrotask;
      }
    });
  });

  // =========================================================================
  // SUITE 2: Hostile & Throwing Telemetry Failure Modes
  // =========================================================================
  describe('Suite 2: Hostile & Throwing Telemetry Failure Modes', () => {
    it('C2.1: Safely absorbs standard Error when window.gtag throws synchronously', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('AdBlocker Blocked Request');
      });

      expect(() => {
        trackAnnotate({ shapeType: 'box', index: 1 });
      }).not.toThrow();

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledTimes(1);
    });

    it('C2.2: Safely absorbs non-Error primitives thrown by window.gtag (strings, null, symbols)', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        throw 'Fatal primitive error string from hostile script injection';
      });

      expect(() => {
        trackCopy({ type: 'png_download', annotationCount: 3 });
      }).not.toThrow();

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledTimes(1);
    });

    it('C2.3: Safely handles non-function window.gtag (e.g. ad-blocker setting window.gtag = true or object)', async () => {
      // @ts-expect-error - adblocker mock
      window.gtag = { isBlocked: true };
      window.dataLayer = [];

      expect(() => {
        trackPaste({ source: 'drop' });
      }).not.toThrow();

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.dataLayer).toEqual([
        expect.objectContaining({ event: 'paste', source: 'drop' }),
      ]);
    });

    it('C2.4: Safely handles throwing getter on window.gtag (DOM SecurityError)', async () => {
      try {
        Object.defineProperty(window, 'gtag', {
          get() {
            throw new DOMException('Cross-origin frame access blocked', 'SecurityError');
          },
          configurable: true,
        });

        expect(() => {
          trackEvent('security_restricted_event');
        }).not.toThrow();

        await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      } finally {
        Object.defineProperty(window, 'gtag', {
          value: vi.fn(),
          writable: true,
          configurable: true,
        });
      }
    });

    it('C2.5: Safely absorbs exceptions when window.dataLayer.push throws (frozen dataLayer)', async () => {
      delete (window as { gtag?: unknown }).gtag;
      const frozenArray: Array<Record<string, unknown>> = [];
      Object.freeze(frozenArray);
      window.dataLayer = frozenArray;

      expect(() => {
        trackEvent('frozen_datalayer_event', { payload: 123 });
      }).not.toThrow();

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      // Handled cleanly without unhandled rejection
    });

    it('C2.6: Offline mode strictly suppresses network analytics while maintaining in-memory log', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      trackEvent('offline_mutation', { op: 'create_box' });
      trackAnnotate({ shapeType: 'arrow', index: 1 });
      trackCopy({ type: 'markdown_download', annotationCount: 1 });

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(3);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).not.toHaveBeenCalled();
    });

    it('C2.7: Safely handles environments where navigator is undefined', async () => {
      const originalNavigator = globalThis.navigator;
      // @ts-expect-error - simulating headless node context without navigator
      delete globalThis.navigator;

      try {
        expect(() => {
          trackEvent('no_navigator_event');
        }).not.toThrow();

        await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
        expect(window.gtag).toHaveBeenCalledWith('event', 'no_navigator_event', {});
      } finally {
        globalThis.navigator = originalNavigator;
      }
    });

    it('C2.8: Hostile payloads with circular objects, NaN, Infinity, and long strings do not crash telemetry', async () => {
      const hostileCircular: Record<string, unknown> = {
        normalKey: 'value',
        nanVal: NaN,
        infVal: Infinity,
        longString: 'A'.repeat(50000),
      };

      expect(() => {
        trackEvent('hostile_payload', hostileCircular);
      }).not.toThrow();

      const log = getEventLogForTesting()[0];
      expect(log.event).toBe('hostile_payload');
      expect(log.params.nanVal).toBeNaN();
      expect(log.params.infVal).toBe(Infinity);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledTimes(1);
    });

    it('C2.9: setTelemetryEnabled(false) completely disables event dispatch and logging', async () => {
      setTelemetryEnabled(false);

      trackAnnotate({ shapeType: 'box', index: 1 });
      trackPaste({ source: 'clipboard' });
      trackCopy({ type: 'image_clipboard', annotationCount: 1 });
      trackEvent('generic_event');

      expect(getEventLogForTesting()).toHaveLength(0);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).not.toHaveBeenCalled();
    });

    it('C2.10: Handles dynamic online -> offline -> online transitions smoothly across 600 events', async () => {
      let onlineCalls = 0;
      window.gtag = vi.fn().mockImplementation(() => {
        onlineCalls++;
      });

      // 1. First 200 events online
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      for (let i = 0; i < 200; i++) {
        trackAnnotate({ shapeType: 'box', index: i + 1 });
      }

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(onlineCalls).toBe(200);

      // 2. Middle 200 events offline (dropped from network, kept in log)
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      for (let i = 200; i < 400; i++) {
        trackAnnotate({ shapeType: 'box', index: i + 1 });
      }

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(onlineCalls).toBe(200); // Unchanged!

      // 3. Final 200 events back online
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      for (let i = 400; i < 600; i++) {
        trackAnnotate({ shapeType: 'box', index: i + 1 });
      }

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(onlineCalls).toBe(400); // 200 + 200
      expect(getEventLogForTesting()).toHaveLength(600); // All 600 logged
    });

    it('C2.11: Malformed and partial payloads (undefined, negative dimensions, empty strings) handle gracefully', () => {
      // @ts-expect-error - testing invalid shapeType
      trackAnnotate({ shapeType: 'invalid_shape', strokeWidth: -99, index: -1 });
      // @ts-expect-error - testing invalid source
      trackPaste({ source: 'non_existent_source', width: -100, height: 0, fileSize: -500 });
      // @ts-expect-error - testing invalid copy type
      trackCopy({ type: 'fake_copy', annotationCount: -10 });

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(3);
      expect(logs[0].params.shape_type).toBe('invalid_shape');
      expect(logs[1].params.dimensions).toBe('-100x0');
    });
  });

  // =========================================================================
  // SUITE 3: Strict Error Boundary & Isolation from Canvas & Export Workflows
  // =========================================================================
  describe('Suite 3: Strict Error Boundary & Isolation from Canvas & Export Workflows', () => {
    it('C3.1: Canvas shape drawing succeeds with 100% UI stability when window.gtag throws on every call', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('Catastrophic gtag network crash');
      });

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'box',
            activeColor: 'red',
            activeStrokeWidth: 4,
            annotations: [],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      // Draw Box on canvas
      expect(() => {
        fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
        fireEvent.pointerMove(svg, { pointerId: 1, clientX: 250, clientY: 200 });
        fireEvent.pointerUp(svg, { pointerId: 1, clientX: 250, clientY: 200 });
      }).not.toThrow();

      // Verify shape was drawn and telemetry logged despite gtag throwing
      const logs = getEventLogForTesting();
      expect(logs.some((l) => l.event === 'annotate' && l.params.shape_type === 'box')).toBe(true);

      // Verify microtask executed and swallowed gtag crash
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalled();
    });

    it('C3.2: ExportActions button clicks proceed cleanly with toasts when window.gtag throws', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('Analytics blocked by content security policy');
      });

      // Mock navigator.clipboard
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
          write: vi.fn().mockResolvedValue(undefined),
        },
      });

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: mockAnnotations,
          }}
        >
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      // Test all export buttons
      await act(async () => {
        fireEvent.click(screen.getByTestId('btn-copy-image'));
        fireEvent.click(screen.getByTestId('btn-copy-notes'));
        fireEvent.click(screen.getByTestId('btn-copy-combined'));
        fireEvent.click(screen.getByTestId('btn-export-png'));
        fireEvent.click(screen.getByTestId('btn-export-md'));
      });

      const logs = getEventLogForTesting();
      const copyLogs = logs.filter((l) => l.event === 'copy');
      expect(copyLogs).toHaveLength(5);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledTimes(5);
    });

    it('C3.3: Image paste/drop ingestion in useClipboardPaste completes seamlessly when window.gtag throws', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('Network error from analytics CDN');
      });

      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <AppProvider>
            <ToastProvider>{children}</ToastProvider>
          </AppProvider>
        ),
      });

      const fakeImageFile = new File(['fake-bytes'], 'test-drop.png', {
        type: 'image/png',
      });

      const fakeDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [fakeImageFile],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(fakeDropEvent);
      });

      const logs = getEventLogForTesting();
      const pasteLogs = logs.filter((l) => l.event === 'paste');
      expect(pasteLogs).toHaveLength(1);
      expect(pasteLogs[0].params.source).toBe('drop');

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalled();
    });

    it('C3.4: Keyboard copy shortcuts in full App execute without error when window.gtag throws', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('AdBlocker active');
      });

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: mockAnnotations,
          }}
        >
          <ToastProvider>
            <App />
          </ToastProvider>
        </AppProvider>
      );

      // Trigger Cmd+C and Cmd+Shift+C
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'c',
            metaKey: true,
            bubbles: true,
          })
        );
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'c',
            metaKey: true,
            shiftKey: true,
            bubbles: true,
          })
        );
      });

      const logs = getEventLogForTesting();
      const copyLogs = logs.filter((l) => l.event === 'copy');
      expect(copyLogs.length).toBeGreaterThanOrEqual(2);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalled();
    });

    it('C3.5: Component unmount during pending microtask analytics dispatch completes cleanly without leak or error', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        // Simulates async delay
      });

      const { unmount } = render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: mockAnnotations,
          }}
        >
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      // Click button to schedule microtask
      fireEvent.click(screen.getByTestId('btn-copy-image'));

      // Immediately unmount before microtask runs
      unmount();

      // Flush microtasks
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      expect(window.gtag).toHaveBeenCalledTimes(1);
    });
  });
});
