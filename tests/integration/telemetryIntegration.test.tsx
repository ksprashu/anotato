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
  getEventLogForTesting,
  clearEventLogForTesting,
  setTelemetryEnabled,
} from '../../src/analytics/telemetry';
import { BaseImage, Annotation } from '../../src/types';

describe('Telemetry End-to-End & Integration Suite', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-test-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1000,
    naturalHeight: 800,
    fileName: 'screenshot.png',
    fileSize: 40960,
  };

  const mockAnnotation: Annotation = {
    id: 'ann-1',
    index: 1,
    geometry: { type: 'box', x: 50, y: 50, width: 100, height: 100 },
    style: { color: 'red', strokeWidth: 4, fillOpacity: 0.18 },
    note: 'Test note content',
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(() => {
    clearEventLogForTesting();
    setTelemetryEnabled(true);
    window.dataLayer = [];
    window.gtag = vi.fn();
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  });

  afterEach(() => {
    clearEventLogForTesting();
    setTelemetryEnabled(true);
  });

  describe('1. Ingestion / Paste Telemetry Integration', () => {
    const createWrapper = () => {
      return ({ children }: { children: React.ReactNode }) => (
        <AppProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppProvider>
      );
    };

    it('tracks paste event with source clipboard on window paste', async () => {
      renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper(),
      });

      const fakeImageFile = new File(['image-content'], 'clipboard-shot.png', {
        type: 'image/png',
      });

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as unknown as Event & {
        clipboardData: {
          items: Array<{ type: string; getAsFile: () => File | null }>;
          files: File[];
        };
      };
      pasteEvent.clipboardData = {
        items: [
          {
            type: 'image/png',
            getAsFile: () => fakeImageFile,
          },
        ],
        files: [fakeImageFile],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      const logs = getEventLogForTesting();
      const pasteLogs = logs.filter((l) => l.event === 'paste');
      expect(pasteLogs).toHaveLength(1);
      expect(pasteLogs[0].params.source).toBe('clipboard');
      expect(pasteLogs[0].params.dimensions).toBeDefined();

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledWith(
        'event',
        'paste',
        expect.objectContaining({ source: 'clipboard' })
      );
    });

    it('tracks paste event with source drop on drag-and-drop', async () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper(),
      });

      const fakeImageFile = new File(['image-bytes'], 'dropped-shot.png', {
        type: 'image/png',
      });

      const fakeDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [fakeImageFile],
        },
      } as unknown as React.DragEvent;

      await result.current.handleDrop(fakeDropEvent);

      const logs = getEventLogForTesting();
      const pasteLogs = logs.filter((l) => l.event === 'paste');
      expect(pasteLogs).toHaveLength(1);
      expect(pasteLogs[0].params.source).toBe('drop');
    });

    it('tracks paste event with source file_picker on file selection', async () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper(),
      });

      const fakeImageFile = new File(['image-bytes'], 'picked-shot.png', {
        type: 'image/png',
      });

      const fakeChangeEvent = {
        target: {
          files: [fakeImageFile],
          value: 'C:\\fakepath\\picked-shot.png',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      await result.current.handleFileInputChange(fakeChangeEvent);

      const logs = getEventLogForTesting();
      const pasteLogs = logs.filter((l) => l.event === 'paste');
      expect(pasteLogs).toHaveLength(1);
      expect(pasteLogs[0].params.source).toBe('file_picker');
    });
  });

  describe('2. ExportActions Button Clicks Telemetry Integration', () => {
    it('fires copy event for Copy Image button', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [mockAnnotation],
          }}
        >
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-copy-image'));

      const logs = getEventLogForTesting();
      const copyLogs = logs.filter((l) => l.event === 'copy');
      expect(copyLogs).toHaveLength(1);
      expect(copyLogs[0].params).toEqual({
        copy_type: 'image_clipboard',
        annotation_count: 1,
      });
    });

    it('fires copy event for Copy Notes button', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [mockAnnotation],
          }}
        >
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-copy-notes'));

      const logs = getEventLogForTesting();
      const copyLogs = logs.filter((l) => l.event === 'copy');
      expect(copyLogs).toHaveLength(1);
      expect(copyLogs[0].params).toEqual({
        copy_type: 'notes_clipboard',
        annotation_count: 1,
      });
    });

    it('fires copy event for Combined Copy button', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [mockAnnotation],
          }}
        >
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-copy-combined'));

      const logs = getEventLogForTesting();
      const copyLogs = logs.filter((l) => l.event === 'copy');
      expect(copyLogs).toHaveLength(1);
      expect(copyLogs[0].params).toEqual({
        copy_type: 'combined_clipboard',
        annotation_count: 1,
      });
    });

    it('fires copy event for PNG Download button', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [mockAnnotation],
          }}
        >
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-export-png'));

      const logs = getEventLogForTesting();
      const copyLogs = logs.filter((l) => l.event === 'copy');
      expect(copyLogs).toHaveLength(1);
      expect(copyLogs[0].params).toEqual({
        copy_type: 'png_download',
        annotation_count: 1,
      });
    });

    it('fires copy event for Markdown Download button', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [mockAnnotation],
          }}
        >
          <ToastProvider>
            <ExportActions />
          </ToastProvider>
        </AppProvider>
      );

      fireEvent.click(screen.getByTestId('btn-export-md'));

      const logs = getEventLogForTesting();
      const copyLogs = logs.filter((l) => l.event === 'copy');
      expect(copyLogs).toHaveLength(1);
      expect(copyLogs[0].params).toEqual({
        copy_type: 'markdown_download',
        annotation_count: 1,
      });
    });
  });

  describe('3. Keyboard Shortcuts Telemetry Integration in App', () => {
    it('fires copy telemetry on Cmd+C and Cmd+Shift+C shortcuts', () => {
      render(
        <App
          initialState={{
            image: mockBaseImage,
            annotations: [mockAnnotation],
          }}
        />
      );

      // Trigger Cmd+C
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'c',
          metaKey: true,
          bubbles: true,
        })
      );

      // Trigger Cmd+Shift+C
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'c',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );

      const logs = getEventLogForTesting();
      const copyLogs = logs.filter((l) => l.event === 'copy');
      expect(copyLogs.length).toBeGreaterThanOrEqual(2);
      expect(copyLogs.some((l) => l.params.copy_type === 'image_clipboard')).toBe(true);
      expect(copyLogs.some((l) => l.params.copy_type === 'notes_clipboard')).toBe(true);
    });
  });

  describe('4. Annotation Canvas Drawing Telemetry Integration', () => {
    it('fires annotate event on drawing Box shape', () => {
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

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 300, clientY: 250 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 250 });

      const logs = getEventLogForTesting();
      const annotateLogs = logs.filter((l) => l.event === 'annotate');
      expect(annotateLogs).toHaveLength(1);
      expect(annotateLogs[0].params).toEqual({
        shape_type: 'box',
        color: 'red',
        stroke_width: 4,
        annotation_index: 1,
      });
    });

    it('fires annotate event on placing a Pin', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            activeTool: 'pin',
            activeColor: 'cyan',
            activeStrokeWidth: 3,
            annotations: [mockAnnotation],
          }}
        >
          <SvgOverlay />
        </AppProvider>
      );

      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 200, clientY: 200 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 200, clientY: 200 });

      const logs = getEventLogForTesting();
      const annotateLogs = logs.filter((l) => l.event === 'annotate');
      expect(annotateLogs).toHaveLength(1);
      expect(annotateLogs[0].params).toEqual({
        shape_type: 'pin',
        color: 'cyan',
        stroke_width: 3,
        annotation_index: 2,
      });
    });

    it('does not fire annotate event when drawing draft is smaller than threshold', () => {
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

      // Drag only 2px (below 4px threshold)
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 102, clientY: 102 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 102, clientY: 102 });

      const logs = getEventLogForTesting();
      const annotateLogs = logs.filter((l) => l.event === 'annotate');
      expect(annotateLogs).toHaveLength(0);
    });
  });
});
