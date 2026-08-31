import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import React from 'react';
import { App } from '../../src/App';
import { AppProvider } from '../../src/state/AppContext';
import { ToastProvider } from '../../src/components/export/ToastNotification';
import { ExportActions } from '../../src/components/export/ExportActions';
import { SvgOverlay } from '../../src/components/canvas/SvgOverlay';
import { useClipboardPaste } from '../../src/hooks/useClipboardPaste';
import {
  trackPaste,
  trackCopy,
  trackAnnotate,
  getEventLogForTesting,
  clearEventLogForTesting,
  setTelemetryEnabled,
} from '../../src/analytics/telemetry';
import { BaseImage, Annotation, PresetColor } from '../../src/types';

describe('Adversarial Telemetry & Event Payload Fidelity Suite (challenger_rel2_2)', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-adv-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'highres-capture.png',
    fileSize: 524288,
  };

  const createMockAnnotation = (index: number, shapeType: 'box' | 'ellipse' | 'arrow' | 'pin'): Annotation => ({
    id: `ann-${index}`,
    index,
    geometry:
      shapeType === 'box'
        ? { type: 'box', x: 100 * index, y: 100 * index, width: 80, height: 60 }
        : shapeType === 'ellipse'
        ? { type: 'ellipse', cx: 100 * index, cy: 100 * index, rx: 40, ry: 30 }
        : shapeType === 'arrow'
        ? { type: 'arrow', startX: 50 * index, startY: 50 * index, endX: 150 * index, endY: 150 * index }
        : { type: 'pin', x: 100 * index, y: 100 * index },
    style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.2 },
    note: `Detailed note for annotation #${index}`,
    createdAt: 1000 + index,
    updatedAt: 1000 + index,
  });

  beforeEach(() => {
    clearEventLogForTesting();
    setTelemetryEnabled(true);
    window.dataLayer = [];
    window.gtag = vi.fn();
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
  });

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <AppProvider>
        <ToastProvider>{children}</ToastProvider>
      </AppProvider>
    );
  };

  // =========================================================================
  // REQUIREMENT 1: Paste Event Accuracy & Fidelity
  // =========================================================================
  describe('1. Paste Event Fidelity (Clipboard, Drag & Drop, File Picker)', () => {
    it('1.1: Clipboard paste fires paste event with exact dimensions, file_size, and source="clipboard"', async () => {
      renderHook(() => useClipboardPaste(), { wrapper: createWrapper() });

      const testBlob = new File(['fake-binary-content-1234567890'], 'pasted_screenshot.png', {
        type: 'image/png',
      });

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        items: [{ type: 'image/png', getAsFile: () => testBlob }],
        files: [testBlob],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      const events = getEventLogForTesting().filter((e) => e.event === 'paste');
      expect(events).toHaveLength(1);
      const payload = events[0].params;

      expect(payload.source).toBe('clipboard');
      expect(payload.file_size).toBe(testBlob.size);
      expect(payload.width).toBeGreaterThan(0);
      expect(payload.height).toBeGreaterThan(0);
      expect(payload.dimensions).toBe(`${payload.width}x${payload.height}`);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledWith(
        'event',
        'paste',
        expect.objectContaining({
          source: 'clipboard',
          file_size: testBlob.size,
          dimensions: `${payload.width}x${payload.height}`,
        })
      );
    });

    it('1.2: Drag & drop fires paste event with exact dimensions, file_size, and source="drop"', async () => {
      const { result } = renderHook(() => useClipboardPaste(), { wrapper: createWrapper() });

      const testBlob = new File(['drag-and-drop-image-payload-data'], 'dropped_canvas.png', {
        type: 'image/png',
      });

      const fakeDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [testBlob],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(fakeDropEvent);
      });

      const events = getEventLogForTesting().filter((e) => e.event === 'paste');
      expect(events).toHaveLength(1);
      const payload = events[0].params;

      expect(payload.source).toBe('drop');
      expect(payload.file_size).toBe(testBlob.size);
      expect(payload.width).toBeGreaterThan(0);
      expect(payload.height).toBeGreaterThan(0);
      expect(payload.dimensions).toBe(`${payload.width}x${payload.height}`);
    });

    it('1.3: File picker fires paste event with exact dimensions, file_size, and source="file_picker"', async () => {
      const { result } = renderHook(() => useClipboardPaste(), { wrapper: createWrapper() });

      const testBlob = new File(['file-picker-selected-image-bytes-777'], 'picker_upload.png', {
        type: 'image/png',
      });

      const fakeChangeEvent = {
        target: {
          files: [testBlob],
          value: 'C:\\fakepath\\picker_upload.png',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleFileInputChange(fakeChangeEvent);
      });

      const events = getEventLogForTesting().filter((e) => e.event === 'paste');
      expect(events).toHaveLength(1);
      const payload = events[0].params;

      expect(payload.source).toBe('file_picker');
      expect(payload.file_size).toBe(testBlob.size);
      expect(payload.width).toBeGreaterThan(0);
      expect(payload.height).toBeGreaterThan(0);
      expect(payload.dimensions).toBe(`${payload.width}x${payload.height}`);
    });

    it('1.4: Replacing image with annotations stages pending image and only fires paste event upon confirmation', async () => {
      const { result } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: ({ children }) => (
            <AppProvider
              initialState={{
                image: mockBaseImage,
                annotations: [createMockAnnotation(1, 'box')],
              }}
            >
              <ToastProvider>{children}</ToastProvider>
            </AppProvider>
          ),
        }
      );

      const replacementBlob = new File(['replacement-image-data-999'], 'replaced.png', {
        type: 'image/png',
      });

      // Process blob with annotations active -> should stage replacement and NOT fire paste event yet
      await act(async () => {
        await result.current.processImageBlob(replacementBlob, 'replaced.png', 'drop');
      });

      expect(result.current.isReplaceModalOpen).toBe(true);
      expect(result.current.pendingImage).not.toBeNull();
      expect(getEventLogForTesting().filter((e) => e.event === 'paste')).toHaveLength(0);

      // Now confirm replacement -> paste event must fire with source="drop"
      act(() => {
        result.current.confirmImageReplacement();
      });

      const events = getEventLogForTesting().filter((e) => e.event === 'paste');
      expect(events).toHaveLength(1);
      expect(events[0].params.source).toBe('drop');
      expect(events[0].params.file_size).toBe(replacementBlob.size);
    });

    it('1.5: Cancelling image replacement does NOT fire paste telemetry event', async () => {
      const { result } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: ({ children }) => (
            <AppProvider
              initialState={{
                image: mockBaseImage,
                annotations: [createMockAnnotation(1, 'box')],
              }}
            >
              <ToastProvider>{children}</ToastProvider>
            </AppProvider>
          ),
        }
      );

      const replacementBlob = new File(['cancelled-image-bytes'], 'cancelled.png', {
        type: 'image/png',
      });

      await act(async () => {
        await result.current.processImageBlob(replacementBlob, 'cancelled.png', 'clipboard');
      });

      expect(result.current.isReplaceModalOpen).toBe(true);

      // Cancel replacement
      act(() => {
        result.current.cancelImageReplacement();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(getEventLogForTesting().filter((e) => e.event === 'paste')).toHaveLength(0);
    });

    it('1.6: Non-image or corrupted files do NOT trigger paste telemetry event', async () => {
      const { result } = renderHook(() => useClipboardPaste(), { wrapper: createWrapper() });

      const textFile = new File(['Hello World plain text'], 'notes.txt', {
        type: 'text/plain',
      });

      const fakeDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [textFile],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(fakeDropEvent);
      });

      expect(getEventLogForTesting().filter((e) => e.event === 'paste')).toHaveLength(0);
    });

    it('1.7: Direct trackPaste payload formatting handles custom dimensions, types, and sizes', () => {
      trackPaste({
        source: 'clipboard',
        fileSize: 10485760, // 10MB
        fileType: 'image/webp',
        width: 3840,
        height: 2160,
      });

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(1);
      expect(logs[0].params).toEqual({
        source: 'clipboard',
        file_size: 10485760,
        file_type: 'image/webp',
        width: 3840,
        height: 2160,
        dimensions: '3840x2160',
      });
    });
  });

  // =========================================================================
  // REQUIREMENT 2: Copy Event Across 5 Export Methods & Keyboard Shortcuts
  // =========================================================================
  describe('2. Copy Event Across All 5 Export Methods & Keyboard Shortcuts', () => {
    const annotations5 = [
      createMockAnnotation(1, 'box'),
      createMockAnnotation(2, 'ellipse'),
      createMockAnnotation(3, 'arrow'),
      createMockAnnotation(4, 'pin'),
      createMockAnnotation(5, 'box'),
    ];

    it('2.1: Method 1 - "image_clipboard" button click fires copy event with exact annotation count', () => {
      render(
        <AppProvider initialState={{ image: mockBaseImage, annotations: annotations5 }}>
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-copy-image'));

      const events = getEventLogForTesting().filter((e) => e.event === 'copy');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        copy_type: 'image_clipboard',
        annotation_count: 5,
      });
    });

    it('2.2: Method 2 - "notes_clipboard" button click fires copy event with exact annotation count', () => {
      render(
        <AppProvider initialState={{ image: mockBaseImage, annotations: annotations5 }}>
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-copy-notes'));

      const events = getEventLogForTesting().filter((e) => e.event === 'copy');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        copy_type: 'notes_clipboard',
        annotation_count: 5,
      });
    });

    it('2.3: Method 3 - "combined_clipboard" button click fires copy event with exact annotation count', () => {
      render(
        <AppProvider initialState={{ image: mockBaseImage, annotations: annotations5 }}>
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-copy-combined'));

      const events = getEventLogForTesting().filter((e) => e.event === 'copy');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        copy_type: 'combined_clipboard',
        annotation_count: 5,
      });
    });

    it('2.4: Method 4 - "png_download" button click fires copy event with exact annotation count', () => {
      render(
        <AppProvider initialState={{ image: mockBaseImage, annotations: annotations5 }}>
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-export-png'));

      const events = getEventLogForTesting().filter((e) => e.event === 'copy');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        copy_type: 'png_download',
        annotation_count: 5,
      });
    });

    it('2.5: Method 5 - "markdown_download" button click fires copy event with exact annotation count', () => {
      render(
        <AppProvider initialState={{ image: mockBaseImage, annotations: annotations5 }}>
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-export-md'));

      const events = getEventLogForTesting().filter((e) => e.event === 'copy');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        copy_type: 'markdown_download',
        annotation_count: 5,
      });
    });

    it('2.6: Keyboard shortcut Cmd+C / Ctrl+C fires copy event for image_clipboard', () => {
      render(<App initialState={{ image: mockBaseImage, annotations: annotations5 }} />);

      // Meta+C (Mac)
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'c',
          metaKey: true,
          bubbles: true,
        })
      );

      // Ctrl+C (Windows/Linux)
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'c',
          ctrlKey: true,
          bubbles: true,
        })
      );

      const events = getEventLogForTesting().filter((e) => e.event === 'copy');
      expect(events.length).toBe(2);
      expect(events[0].params).toEqual({
        copy_type: 'image_clipboard',
        annotation_count: 5,
      });
      expect(events[1].params).toEqual({
        copy_type: 'image_clipboard',
        annotation_count: 5,
      });
    });

    it('2.7: Keyboard shortcut Cmd+Shift+C / Ctrl+Shift+C fires copy event for notes_clipboard', () => {
      render(<App initialState={{ image: mockBaseImage, annotations: annotations5 }} />);

      // Meta+Shift+C (Mac)
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'c',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );

      // Ctrl+Shift+C (Windows/Linux)
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'c',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );

      const events = getEventLogForTesting().filter((e) => e.event === 'copy');
      expect(events.length).toBe(2);
      expect(events[0].params).toEqual({
        copy_type: 'notes_clipboard',
        annotation_count: 5,
      });
      expect(events[1].params).toEqual({
        copy_type: 'notes_clipboard',
        annotation_count: 5,
      });
    });

    it('2.8: Copy shortcuts and buttons do NOT fire telemetry when prerequisites are missing', () => {
      // 1. No image loaded -> Copy Image should NOT fire
      render(<App initialState={{ image: null, annotations: [] }} />);

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

      expect(getEventLogForTesting().filter((e) => e.event === 'copy')).toHaveLength(0);
    });

    it('2.9: Cmd+C inside input with active text selection does NOT trigger copy image telemetry', () => {
      render(<App initialState={{ image: mockBaseImage, annotations: annotations5 }} />);

      const input = document.createElement('input');
      input.value = 'Selected Text';
      document.body.appendChild(input);
      input.focus();
      input.setSelectionRange(0, 5);

      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'c',
          metaKey: true,
          bubbles: true,
        })
      );

      expect(getEventLogForTesting().filter((e) => e.event === 'copy')).toHaveLength(0);
      document.body.removeChild(input);
    });

    it('2.10: 50 rapid sequential copy operations accurately track annotation count scale', () => {
      for (let i = 0; i < 50; i++) {
        trackCopy({
          type: (['image_clipboard', 'notes_clipboard', 'combined_clipboard', 'png_download', 'markdown_download'] as const)[i % 5],
          annotationCount: i,
        });
      }

      const events = getEventLogForTesting().filter((e) => e.event === 'copy');
      expect(events).toHaveLength(50);
      expect(events[0].params.annotation_count).toBe(0);
      expect(events[49].params.annotation_count).toBe(49);
      expect(events[49].params.copy_type).toBe('markdown_download');
    });
  });

  // =========================================================================
  // REQUIREMENT 3: Annotate Event on Valid Shapes & Sub-Threshold Filter
  // =========================================================================
  describe('3. Annotate Event Validity, Shape Types & Sub-Threshold Filtering', () => {
    it('3.1: Valid Box (>= 4px) fires annotate event with exact shape_type, color, stroke_width, index', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'box',
            activeColor: 'emerald' as unknown as PresetColor,
            activeStrokeWidth: 6,
            annotations: [createMockAnnotation(1, 'pin')],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 200, clientY: 180 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 200, clientY: 180 });

      const events = getEventLogForTesting().filter((e) => e.event === 'annotate');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        shape_type: 'box',
        color: 'emerald',
        stroke_width: 6,
        annotation_index: 2,
      });
    });

    it('3.2: Sub-threshold Box (< 4px) does NOT fire annotate event', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'box',
            annotations: [],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      // Drag only 2px horizontally and 2px vertically
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 102, clientY: 102 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 102, clientY: 102 });

      expect(getEventLogForTesting().filter((e) => e.event === 'annotate')).toHaveLength(0);
    });

    it('3.3: Valid Ellipse (rx >= 2 || ry >= 2) fires annotate event', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'ellipse',
            activeColor: 'indigo' as unknown as PresetColor,
            activeStrokeWidth: 4,
            annotations: [],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 250, clientY: 240 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 250, clientY: 240 });

      const events = getEventLogForTesting().filter((e) => e.event === 'annotate');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        shape_type: 'ellipse',
        color: 'indigo',
        stroke_width: 4,
        annotation_index: 1,
      });
    });

    it('3.4: Sub-threshold Ellipse (rx < 2 && ry < 2) does NOT fire annotate event', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'ellipse',
            annotations: [],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      // Drag 1px
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 201, clientY: 201 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 201, clientY: 201 });

      expect(getEventLogForTesting().filter((e) => e.event === 'annotate')).toHaveLength(0);
    });

    it('3.5: Valid Arrow (hypot >= 8px) fires annotate event', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'arrow',
            activeColor: 'rose' as unknown as PresetColor,
            activeStrokeWidth: 3,
            annotations: [createMockAnnotation(1, 'box'), createMockAnnotation(2, 'ellipse')],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      // Drag 20px length
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 120, clientY: 100 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 120, clientY: 100 });

      const events = getEventLogForTesting().filter((e) => e.event === 'annotate');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        shape_type: 'arrow',
        color: 'rose',
        stroke_width: 3,
        annotation_index: 3,
      });
    });

    it('3.6: Sub-threshold Arrow (hypot < 8px) does NOT fire annotate event', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'arrow',
            annotations: [],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      // Drag 4px (hypot = 4 < 8)
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 104, clientY: 100 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 104, clientY: 100 });

      expect(getEventLogForTesting().filter((e) => e.event === 'annotate')).toHaveLength(0);
    });

    it('3.7: Pin click fires annotate event regardless of drag distance', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'pin',
            activeColor: 'cyan',
            activeStrokeWidth: 2,
            annotations: [],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      // Zero-distance click
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 300, clientY: 300 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 300 });

      const events = getEventLogForTesting().filter((e) => e.event === 'annotate');
      expect(events).toHaveLength(1);
      expect(events[0].params).toEqual({
        shape_type: 'pin',
        color: 'cyan',
        stroke_width: 2,
        annotation_index: 1,
      });
    });

    it('3.8: Non-drawing gestures (Select tool drag, Pan tool drag) NEVER fire annotate events', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'select',
            annotations: [createMockAnnotation(1, 'box')],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      // Pointer drag across canvas in select tool mode
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 200, clientY: 200 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 200, clientY: 200 });

      expect(getEventLogForTesting().filter((e) => e.event === 'annotate')).toHaveLength(0);
    });

    it('3.9: Monotonic indexing across multiple sequential annotations in same session', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'pin',
            activeColor: 'amber',
            activeStrokeWidth: 3,
            annotations: [],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      // Add 4 pins sequentially
      for (let i = 1; i <= 4; i++) {
        fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100 * i, clientY: 100 * i });
        fireEvent.pointerUp(svg, { pointerId: 1, clientX: 100 * i, clientY: 100 * i });
      }

      const events = getEventLogForTesting().filter((e) => e.event === 'annotate');
      expect(events).toHaveLength(4);
      expect(events[0].params.annotation_index).toBe(1);
      expect(events[1].params.annotation_index).toBe(2);
      expect(events[2].params.annotation_index).toBe(3);
      expect(events[3].params.annotation_index).toBe(4);
    });
  });

  // =========================================================================
  // REQUIREMENT 4: Telemetry Resilience, Offline Mode & GA4 Tag Verification
  // =========================================================================
  describe('4. Telemetry Resilience, Offline Mode & GA4 Integration', () => {
    it('4.1: gtag runtime exception does not break execution or crash event log', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('Script execution blocked by browser tracking prevention');
      });

      expect(() => {
        trackAnnotate({ shapeType: 'box', color: 'red', strokeWidth: 4, index: 1 });
      }).not.toThrow();

      const events = getEventLogForTesting();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('annotate');

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalled();
    });

    it('4.2: navigator.onLine = false records locally without attempting gtag network call', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      trackPaste({ source: 'clipboard', fileSize: 1024, width: 800, height: 600 });

      const events = getEventLogForTesting();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('paste');

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).not.toHaveBeenCalled();
    });

    it('4.3: dataLayer fallback works seamlessly when gtag function is absent', async () => {
      delete (window as any).gtag;
      window.dataLayer = [];

      trackCopy({ type: 'combined_clipboard', annotationCount: 3 });

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      expect(window.dataLayer).toEqual([
        {
          event: 'copy',
          copy_type: 'combined_clipboard',
          annotation_count: 3,
        },
      ]);
    });

    it('4.4: Disabling telemetry stops both log recording and external dispatch', async () => {
      setTelemetryEnabled(false);

      trackPaste({ source: 'clipboard', fileSize: 500, width: 100, height: 100 });
      trackCopy({ type: 'image_clipboard', annotationCount: 2 });
      trackAnnotate({ shapeType: 'arrow', color: 'blue', strokeWidth: 3, index: 1 });

      expect(getEventLogForTesting()).toHaveLength(0);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).not.toHaveBeenCalled();
    });
  });
});
