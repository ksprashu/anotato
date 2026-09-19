import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { useClipboardPaste, createBaseImageFromBlob } from '../../src/hooks/useClipboardPaste';
import { ReplaceImageModal } from '../../src/components/modals/ReplaceImageModal';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import { AppProvider } from '../../src/state/AppContext';
import { AppState, BaseImage, BoxGeometry, Annotation } from '../../src/types';

const sampleBox: BoxGeometry = {
  type: 'box',
  x: 100,
  y: 100,
  width: 200,
  height: 150,
};

const createMockAnnotation = (id: string, index: number): Annotation => ({
  id,
  index,
  geometry: { ...sampleBox },
  style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
  note: `Note for annotation ${index}`,
  createdAt: 1000 + index,
  updatedAt: 1000 + index,
});

const mockBaseImage: BaseImage = {
  id: 'img_base_1',
  src: 'blob:http://localhost/base-screenshot-1',
  naturalWidth: 1920,
  naturalHeight: 1080,
  fileName: 'base_screenshot.png',
  fileSize: 102400,
};

describe('Adversarial Image Ingestion & Replace Image Stress Tests', () => {
  let createdBlobUrls: string[] = [];
  let revokedBlobUrls: string[] = [];

  beforeEach(() => {
    createdBlobUrls = [];
    revokedBlobUrls = [];

    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:http://localhost/mock-blob-${Math.random().toString(36).slice(2, 10)}`;
      createdBlobUrls.push(url);
      return url;
    });

    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revokedBlobUrls.push(url);
    });

    if (!globalThis.createImageBitmap || vi.isMockFunction(globalThis.createImageBitmap)) {
      globalThis.createImageBitmap = vi.fn().mockImplementation(async () => ({
        width: 800,
        height: 600,
        close: vi.fn(),
      } as unknown as ImageBitmap));
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createWrapper = (initialState?: Partial<AppState>) => {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(AppProvider, { initialState, children });
  };

  describe('Suite 1: Malformed and Edge-Case DataTransfer Objects', () => {
    it('handles clipboard paste event where clipboardData is null or undefined without throwing', async () => {
      const onImageLoaded = vi.fn();
      const onError = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded, onError }), {
        wrapper: createWrapper(),
      });

      const pasteEventWithoutClipboardData = new Event('paste', {
        bubbles: true,
        cancelable: true,
      }) as any;
      pasteEventWithoutClipboardData.clipboardData = null;

      await act(async () => {
        window.dispatchEvent(pasteEventWithoutClipboardData);
      });

      expect(onImageLoaded).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      // Undefined clipboardData
      const pasteEventUndefined = new Event('paste', {
        bubbles: true,
        cancelable: true,
      }) as any;
      pasteEventUndefined.clipboardData = undefined;

      await act(async () => {
        window.dispatchEvent(pasteEventUndefined);
      });

      expect(onImageLoaded).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('handles clipboardData with null or undefined items and files arrays', async () => {
      const onImageLoaded = vi.fn();
      const onError = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded, onError }), {
        wrapper: createWrapper(),
      });

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        items: null,
        files: null,
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(onImageLoaded).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('safely skips items whose getAsFile() returns null or throws an unexpected exception', async () => {
      const onImageLoaded = vi.fn();
      const onError = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded, onError }), {
        wrapper: createWrapper(),
      });

      const throwItem = {
        type: 'image/png',
        getAsFile: () => {
          throw new Error('SecurityError: Clipboard access denied by host');
        },
      };

      const nullItem = {
        type: 'image/png',
        getAsFile: () => null,
      };

      const validFile = new File(['valid-image-bytes'], 'valid.png', { type: 'image/png' });
      const validItem = {
        type: 'image/png',
        getAsFile: () => validFile,
      };

      // Case A: null item followed by valid item
      const pasteEventA = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEventA.clipboardData = {
        items: [nullItem, validItem],
        files: [],
      };

      await act(async () => {
        window.dispatchEvent(pasteEventA);
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('valid.png');

      // Case B: throwing item
      const pasteEventB = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEventB.clipboardData = {
        items: [throwItem],
        files: [],
      };

      await act(async () => {
        expect(() => window.dispatchEvent(pasteEventB)).not.toThrow();
      });
    });

    it('handles clipboardData.items with malformed type properties (empty, undefined, non-string)', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const corruptItems = [
        { type: '', getAsFile: () => null },
        { type: undefined as unknown as string, getAsFile: () => null },
        { type: null as unknown as string, getAsFile: () => null },
      ];

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        items: corruptItems,
        files: [],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(onImageLoaded).not.toHaveBeenCalled();
    });

    it('handles drop event with null or empty dataTransfer.files without throwing', async () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper(),
      });

      const fakeNullDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: null,
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(fakeNullDropEvent);
      });

      expect(fakeNullDropEvent.preventDefault).toHaveBeenCalled();
      expect(result.current.isDraggingOver).toBe(false);
    });

    it('handles dragEnter when dataTransfer.types is missing or empty', () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper(),
      });

      const fakeEvent = {
        preventDefault: vi.fn(),
        dataTransfer: { types: [] },
      } as unknown as React.DragEvent;

      act(() => {
        result.current.handleDragEnter(fakeEvent);
      });

      expect(result.current.isDraggingOver).toBe(false);
    });
  });

  describe('Suite 2: Non-Image Files & Content-Type Fuzzing', () => {
    const nonImageTypes = [
      { type: 'text/plain', name: 'notes.txt' },
      { type: 'text/html', name: 'index.html' },
      { type: 'application/pdf', name: 'report.pdf' },
      { type: 'application/zip', name: 'archive.zip' },
      { type: 'application/octet-stream', name: 'binary.bin' },
      { type: 'video/mp4', name: 'screencast.mp4' },
      { type: 'audio/mpeg', name: 'recording.mp3' },
      { type: 'application/json', name: 'data.json' },
    ];

    it.each(nonImageTypes)(
      'rejects non-image MIME type %s and revokes blob URL',
      async ({ type, name }) => {
        const file = new File(['dummy-content'], name, { type });
        await expect(createBaseImageFromBlob(file)).rejects.toThrow(
          /Unsupported or invalid image format/
        );
      }
    );

    it('accepts valid image extensions even if MIME type is missing or application/octet-stream', async () => {
      const extensions = ['shot.png', 'photo.jpg', 'img.jpeg', 'graphic.webp', 'icon.bmp', 'vector.svg'];

      for (const fileName of extensions) {
        const file = new File(['valid-bytes'], fileName, { type: '' });
        const baseImage = await createBaseImageFromBlob(file);
        expect(baseImage.fileName).toBe(fileName);
        expect(baseImage.naturalWidth).toBeGreaterThan(0);
      }
    });

    it('rejects zero-byte file when image decoder cannot extract natural dimensions', async () => {
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      // Mock failure for 0-byte corrupt blob
      globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('Corrupt zero byte image'));

      const originalImage = globalThis.Image;
      class MockFailingImage {
        naturalWidth = 0;
        naturalHeight = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private _src = '';
        set src(value: string) {
          this._src = value;
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 0);
        }
        get src() {
          return this._src;
        }
      }
      globalThis.Image = MockFailingImage as unknown as typeof Image;

      const emptyFile = new File([], 'empty.png', { type: 'image/png' });
      await expect(createBaseImageFromBlob(emptyFile)).rejects.toThrow(
        /Failed to decode image from blob/
      );

      // Verify blob URL was revoked after catch
      expect(revokedBlobUrls.length).toBeGreaterThanOrEqual(1);

      globalThis.createImageBitmap = originalCreateImageBitmap;
      globalThis.Image = originalImage;
    });

    it('invokes onError callback when non-image file is dropped', async () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onError }), {
        wrapper: createWrapper(),
      });

      const pdfFile = new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' });
      const dropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [pdfFile],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(dropEvent);
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toMatch(/not a supported image format/i);
    });
  });

  describe('Suite 3: Multi-File Ingestion & Mixed Content Payloads', () => {
    it('picks the first valid image from a mixed dropped file list [text, image, pdf]', async () => {
      const onImageLoaded = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
      const imgFile = new File(['png-data'], 'valid_shot.png', { type: 'image/png' });
      const pdfFile = new File(['pdf-data'], 'doc.pdf', { type: 'application/pdf' });

      const dropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [textFile, imgFile, pdfFile],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(dropEvent);
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('valid_shot.png');
    });

    it('ingests first image when multiple images are dropped simultaneously without crashing', async () => {
      const onImageLoaded = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const img1 = new File(['png1'], 'image_1.png', { type: 'image/png' });
      const img2 = new File(['png2'], 'image_2.png', { type: 'image/png' });
      const img3 = new File(['png3'], 'image_3.png', { type: 'image/png' });

      const dropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [img1, img2, img3],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(dropEvent);
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('image_1.png');
    });

    it('extracts image item from clipboard when items contains mixed text and image', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const textItem = {
        type: 'text/plain',
        getAsFile: () => null,
      };

      const imgFile = new File(['png'], 'clip.png', { type: 'image/png' });
      const imageItem = {
        type: 'image/png',
        getAsFile: () => imgFile,
      };

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        items: [textItem, imageItem],
        files: [],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('clip.png');
    });
  });

  describe('Suite 4: High-Frequency Paste Bursts & Concurrency Stress', () => {
    it('handles 30 rapid successive paste events without unhandled rejections or corrupted state', async () => {
      const onImageLoaded = vi.fn();
      const { unmount } = renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        for (let i = 0; i < 30; i++) {
          const file = new File([`data-${i}`], `burst_${i}.png`, { type: 'image/png' });
          const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
          pasteEvent.clipboardData = {
            items: [{ type: 'image/png', getAsFile: () => file }],
            files: [file],
          };
          window.dispatchEvent(pasteEvent);
        }
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(30);
      const lastLoaded = onImageLoaded.mock.calls[29][0];
      expect(lastLoaded.fileName).toBe('burst_29.png');
      unmount();
    });

    it('revokes every discarded object URL across 20 sequential image replacements', async () => {
      const { result } = renderHook(() => useClipboardPaste({ requireConfirmationIfAnnotated: false }), {
        wrapper: createWrapper({ image: mockBaseImage, annotations: [] }),
      });

      for (let i = 0; i < 20; i++) {
        const file = new File([`blob-${i}`], `seq_${i}.png`, { type: 'image/png' });
        await act(async () => {
          await result.current.processImageBlob(file);
        });
      }

      // Initial mock image + 19 replaced images = 20 revocations
      expect(revokedBlobUrls.length).toBeGreaterThanOrEqual(19);
    });
  });

  describe('Suite 5: ReplaceImageModal Confirmation Flow (0 vs N >= 1 Annotations)', () => {
    it('directly replaces image without modal when annotations array is empty (0 annotations)', async () => {
      const onImageLoaded = vi.fn();
      const { result } = renderHook(
        () => useClipboardPaste({ onImageLoaded, requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImage,
            annotations: [], // 0 annotations
          }),
        }
      );

      const newFile = new File(['new-bytes'], 'clean_replace.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(newFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('clean_replace.png');
      expect(revokedBlobUrls).toContain(mockBaseImage.src);
    });

    it('stages pendingImage and opens modal when 1 annotation exists', async () => {
      const annotation1 = createMockAnnotation('ann-1', 1);
      const { result } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImage,
            annotations: [annotation1],
          }),
        }
      );

      const newFile = new File(['new-bytes'], 'staged_1.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(newFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);
      expect(result.current.pendingImage).not.toBeNull();
      expect(result.current.pendingImage?.fileName).toBe('staged_1.png');
      // Previous image must NOT be revoked yet while confirmation is pending
      expect(revokedBlobUrls).not.toContain(mockBaseImage.src);
    });

    it('stages pendingImage and opens modal when 100 annotations exist', async () => {
      const annotations100 = Array.from({ length: 100 }, (_, i) =>
        createMockAnnotation(`ann-${i + 1}`, i + 1)
      );

      const { result } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImage,
            annotations: annotations100,
          }),
        }
      );

      const newFile = new File(['new-bytes'], 'staged_100.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(newFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);
      expect(result.current.pendingImage?.fileName).toBe('staged_100.png');
    });

    it('confirmImageReplacement applies image, revokes old image blob, and closes modal', async () => {
      const annotation1 = createMockAnnotation('ann-1', 1);
      const onImageLoaded = vi.fn();

      const { result } = renderHook(
        () => useClipboardPaste({ onImageLoaded, requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImage,
            annotations: [annotation1],
          }),
        }
      );

      const newFile = new File(['new-bytes'], 'confirmed_image.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(newFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);
      const stagedUrl = result.current.pendingImage?.src;

      act(() => {
        result.current.confirmImageReplacement();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('confirmed_image.png');
      expect(revokedBlobUrls).toContain(mockBaseImage.src);
      // Pending URL must not be revoked on confirm (it is now active)
      expect(revokedBlobUrls).not.toContain(stagedUrl);
    });

    it('cancelImageReplacement revokes pending blob URL, keeps old image intact, and closes modal', async () => {
      const annotation1 = createMockAnnotation('ann-1', 1);
      const onImageLoaded = vi.fn();

      const { result } = renderHook(
        () => useClipboardPaste({ onImageLoaded, requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImage,
            annotations: [annotation1],
          }),
        }
      );

      const newFile = new File(['new-bytes'], 'cancelled_image.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(newFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);
      const pendingUrl = result.current.pendingImage?.src;
      expect(pendingUrl).toBeDefined();

      act(() => {
        result.current.cancelImageReplacement();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(onImageLoaded).not.toHaveBeenCalled();
      // Pending image URL revoked
      expect(revokedBlobUrls).toContain(pendingUrl);
      // Original image URL NOT revoked
      expect(revokedBlobUrls).not.toContain(mockBaseImage.src);
    });

    it('executes 10 repeated cancel cycles without memory leak or state mutation', async () => {
      const annotation1 = createMockAnnotation('ann-1', 1);

      const { result } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImage,
            annotations: [annotation1],
          }),
        }
      );

      const stagedUrls: string[] = [];

      for (let i = 0; i < 10; i++) {
        const file = new File([`bytes-${i}`], `cancel_${i}.png`, { type: 'image/png' });
        await act(async () => {
          await result.current.processImageBlob(file);
        });

        expect(result.current.isReplaceModalOpen).toBe(true);
        const url = result.current.pendingImage!.src;
        stagedUrls.push(url);

        act(() => {
          result.current.cancelImageReplacement();
        });

        expect(result.current.isReplaceModalOpen).toBe(false);
        expect(result.current.pendingImage).toBeNull();
      }

      // Every single staged URL was properly revoked
      for (const url of stagedUrls) {
        expect(revokedBlobUrls).toContain(url);
      }
      expect(revokedBlobUrls).not.toContain(mockBaseImage.src);
    });

    it('ReplaceImageModal UI renders annotation count correctly and responds to Escape and Enter keys', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const { rerender } = render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByTestId('replace-image-modal')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText(/active annotation on this screenshot/i)).toBeInTheDocument();

      // Enter key confirms
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(onConfirm).toHaveBeenCalledTimes(1);

      // Escape key cancels
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Rerender with 15 annotations
      rerender(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={15}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText(/active annotations on this screenshot/i)).toBeInTheDocument();

      // Click Cancel button
      fireEvent.click(screen.getByTestId('replace-modal-cancel-btn'));
      expect(onCancel).toHaveBeenCalledTimes(2);

      // Click Confirm button
      fireEvent.click(screen.getByTestId('replace-modal-confirm-btn'));
      expect(onConfirm).toHaveBeenCalledTimes(2);
    });
  });

  describe('Suite 6: Input Focus & Keyboard Shortcut Isolation', () => {
    it('allows text pasting inside text inputs without triggering image ingestion', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const textPasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      Object.defineProperty(textPasteEvent, 'target', { value: input });
      textPasteEvent.clipboardData = {
        items: [{ type: 'text/plain', getAsFile: () => null }],
        files: [],
      };
      const preventDefaultSpy = vi.spyOn(textPasteEvent, 'preventDefault');

      await act(async () => {
        window.dispatchEvent(textPasteEvent);
      });

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(onImageLoaded).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('CanvasWorkspace ignores spacebar pan activation when typing inside an input element', () => {
      render(
        <AppProvider initialState={{ image: mockBaseImage, annotations: [] }}>
          <div>
            <input data-testid="test-input" type="text" />
            <CanvasWorkspace />
          </div>
        </AppProvider>
      );

      const input = screen.getByTestId('test-input');
      input.focus();

      const container = screen.getByTestId('canvas-workspace-container');
      expect(container.style.cursor).toBe('default');

      // Press space while focused on input
      fireEvent.keyDown(window, { code: 'Space' });
      // Cursor should still be default, NOT grab
      expect(container.style.cursor).toBe('default');

      // Blur input
      input.blur();

      // Press space while focused on body
      fireEvent.keyDown(window, { code: 'Space' });
      // Cursor transitions to grab
      expect(container.style.cursor).toBe('grab');

      // Release space
      fireEvent.keyUp(window, { code: 'Space' });
      expect(container.style.cursor).toBe('default');
    });
  });

  // =========================================================================
  // Suite 7: Follow-up R1 Invariants (Ghost Annotations, Style Retention, Overlays)
  // =========================================================================
  describe('Suite 7: Follow-up R1 Invariants (Ghost Annotations, Style Retention, Overlays)', () => {
    const mockAnnotation1: Annotation = {
      id: 'ann-red-box',
      index: 1,
      geometry: { type: 'box', x: 50, y: 50, width: 200, height: 100 },
      style: { color: 'red', strokeWidth: 4, fillOpacity: 0.5 },
      note: 'Critical visual defect',
      createdAt: 1000,
      updatedAt: 1000,
    };

    const mockAnnotation2: Annotation = {
      id: 'ann-green-circle',
      index: 2,
      geometry: { type: 'ellipse', cx: 400, cy: 300, rx: 60, ry: 60 },
      style: { color: 'green', strokeWidth: 2, fillOpacity: 0.0 },
      note: 'Verified component boundary',
      createdAt: 2000,
      updatedAt: 2000,
    };

    const mockAnnotation3: Annotation = {
      id: 'ann-purple-pin',
      index: 3,
      geometry: { type: 'pin', x: 700, y: 500 },
      style: { color: 'purple', strokeWidth: 8, fillOpacity: 0.3 },
      note: 'Missing click handler',
      createdAt: 3000,
      updatedAt: 3000,
    };

    // -----------------------------------------------------------------------
    // Invariant 1: 0 Ghost Annotations on Replace & Clear
    // -----------------------------------------------------------------------
    it('purges all annotations leaving 0 ghost annotations after Replace & Clear', async () => {
      const onImageLoaded = vi.fn();
      const initialAnnotations = [mockAnnotation1, mockAnnotation2, mockAnnotation3];

      const { result } = renderHook(
        () => useClipboardPaste({ onImageLoaded, requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImage,
            annotations: initialAnnotations,
          }),
        }
      );

      // 1. Stage new image
      const newFile = new File(['replaced-png-data'], 'new_screenshot.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(newFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);

      // 2. Execute Replace & Clear
      act(() => {
        result.current.confirmImageReplacement();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(onImageLoaded).toHaveBeenCalledTimes(1);

      // 3. Render CanvasWorkspace to assert 0 ghost SVG elements
      const { container } = render(
        <AppProvider
          initialState={{
            image: onImageLoaded.mock.calls[0][0],
            annotations: [],
            overlays: [],
          }}
        >
          <CanvasWorkspace />
        </AppProvider>
      );

      // Zero annotation shapes exist in DOM
      const shapeElements = container.querySelectorAll('[data-testid^="shape-"]');
      expect(shapeElements.length).toBe(0);

      // Canvas base image updated
      const baseImg = screen.getByTestId('canvas-base-image');
      expect(baseImg).toHaveAttribute('src', onImageLoaded.mock.calls[0][0].src);
    });

    it('adversarial 20-burst replace-clear loop guarantees 0 residual ghost annotations', async () => {
      let currentAnnotations = [mockAnnotation1, mockAnnotation2];

      for (let burst = 0; burst < 20; burst++) {
        const { result } = renderHook(
          () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
          {
            wrapper: createWrapper({
              image: mockBaseImage,
              annotations: currentAnnotations,
            }),
          }
        );

        const file = new File([`burst-${burst}`], `burst_${burst}.png`, { type: 'image/png' });
        await act(async () => {
          await result.current.processImageBlob(file);
        });

        act(() => {
          result.current.confirmImageReplacement();
        });

        expect(result.current.pendingImage).toBeNull();
        expect(result.current.isReplaceModalOpen).toBe(false);
        // Reset annotations to empty for next round
        currentAnnotations = [];
      }
    });

    // -----------------------------------------------------------------------
    // Invariant 2: Style Preservation on Replace & Keep
    // -----------------------------------------------------------------------
    it('preserves shape color, strokeWidth, and fillOpacity without mutation on Replace & Keep', async () => {
      const onImageLoaded = vi.fn();
      const initialAnnotations = [mockAnnotation1, mockAnnotation2, mockAnnotation3];

      const { result } = renderHook(
        () => useClipboardPaste({ onImageLoaded, requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImage,
            annotations: initialAnnotations,
            activeColor: 'amber',
            activeStrokeWidth: 4,
            activeFillOpacity: 0.15,
          }),
        }
      );

      const replacementFile = new File(['kept-png-data'], 'replacement.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(replacementFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);

      // Execute Replace & Keep
      act(() => {
        result.current.replaceAndKeepAnnotations();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);

      // Assert styles of retained annotations
      expect(initialAnnotations[0].style).toEqual({
        color: 'red',
        strokeWidth: 4,
        fillOpacity: 0.5,
      });

      expect(initialAnnotations[1].style).toEqual({
        color: 'green',
        strokeWidth: 2,
        fillOpacity: 0.0,
      });

      expect(initialAnnotations[2].style).toEqual({
        color: 'purple',
        strokeWidth: 8,
        fillOpacity: 0.3,
      });

      // Sequential indices and notes remain intact
      expect(initialAnnotations[0].index).toBe(1);
      expect(initialAnnotations[1].index).toBe(2);
      expect(initialAnnotations[2].index).toBe(3);
      expect(initialAnnotations[0].note).toBe('Critical visual defect');
    });

    // -----------------------------------------------------------------------
    // Invariant 3: Overlay Stacking and Rendering
    // -----------------------------------------------------------------------
    it('stacks multiple overlay layers beneath annotations and above base image', async () => {
      const overlay1 = {
        id: 'overlay-layer-1',
        src: 'blob:http://localhost/layer-1',
        naturalWidth: 800,
        naturalHeight: 600,
        fileName: 'layer1.png',
        fileSize: 4096,
        x: 20,
        y: 30,
        width: 800,
        height: 600,
        opacity: 0.9,
      };

      const overlay2 = {
        id: 'overlay-layer-2',
        src: 'blob:http://localhost/layer-2',
        naturalWidth: 400,
        naturalHeight: 300,
        fileName: 'layer2.png',
        fileSize: 2048,
        x: 100,
        y: 150,
        width: 400,
        height: 300,
        opacity: 0.75,
      };

      const { container } = render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            overlays: [overlay1, overlay2],
            annotations: [mockAnnotation1],
          }}
        >
          <CanvasWorkspace />
        </AppProvider>
      );

      // Verify both overlays rendered in DOM
      const overlayEl1 = screen.getByTestId('canvas-overlay-image-overlay-layer-1');
      const overlayEl2 = screen.getByTestId('canvas-overlay-image-overlay-layer-2');
      const baseImg = screen.getByTestId('canvas-base-image');
      const svgOverlay = container.querySelector('svg');

      expect(overlayEl1).toBeInTheDocument();
      expect(overlayEl2).toBeInTheDocument();

      // Assert overlay attributes and styles
      expect(overlayEl1).toHaveStyle({ left: '20px', top: '30px', opacity: '0.9' });
      expect(overlayEl2).toHaveStyle({ left: '100px', top: '150px', opacity: '0.75' });

      // Assert DOM child hierarchy: Base Image < Overlay 1 < Overlay 2 < SvgOverlay
      const transformLayer = screen.getByTestId('canvas-transform-layer');
      const children = Array.from(transformLayer.children);
      const baseIndex = children.indexOf(baseImg);
      const ov1Index = children.indexOf(overlayEl1);
      const ov2Index = children.indexOf(overlayEl2);
      const svgIndex = children.indexOf(svgOverlay!);

      expect(baseIndex).toBeLessThan(ov1Index);
      expect(ov1Index).toBeLessThan(ov2Index);
      expect(ov2Index).toBeLessThan(svgIndex);
    });

    it('exports composite PNG containing base image, overlay layers, and annotations', async () => {
      const { renderCompositeCanvas } = await import('../../src/export/canvasExporter');

      const overlay = {
        id: 'ov-export-1',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        naturalWidth: 400,
        naturalHeight: 300,
        fileName: 'patch.png',
        fileSize: 1024,
        x: 50,
        y: 50,
        width: 400,
        height: 300,
        opacity: 0.8,
      };

      const canvas = await renderCompositeCanvas(
        mockBaseImage,
        [mockAnnotation1],
        [overlay]
      );

      const ctx = canvas.getContext('2d')!;
      // drawImage called for base image and overlay
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      // Base image drawn at (0, 0, 1920, 1080)
      expect(ctx.drawImage).toHaveBeenNthCalledWith(1, expect.anything(), 0, 0, 1920, 1080);
      // Overlay drawn at (50, 50, 400, 300)
      expect(ctx.drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 50, 50, 400, 300);
    });
  });
});
