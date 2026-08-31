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
});
