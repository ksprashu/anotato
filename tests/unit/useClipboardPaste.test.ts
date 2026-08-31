import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useClipboardPaste, createBaseImageFromBlob } from '../../src/hooks/useClipboardPaste';
import { AppProvider } from '../../src/state/AppContext';
import { AppState, BaseImage, BoxGeometry } from '../../src/types';

const mockBaseImage: BaseImage = {
  id: 'img_existing_1',
  src: 'blob:http://localhost/existing-image',
  naturalWidth: 1200,
  naturalHeight: 800,
  fileName: 'existing.png',
  fileSize: 50000,
};

const sampleBox: BoxGeometry = {
  type: 'box',
  x: 50,
  y: 50,
  width: 100,
  height: 100,
};

describe('useClipboardPaste Hook & Ingestion Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createWrapper = (initialState?: Partial<AppState>) => {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(AppProvider, { initialState, children });
  };

  describe('createBaseImageFromBlob Utility', () => {
    it('creates a BaseImage from a valid image File', async () => {
      const file = new File(['fake-image-bytes'], 'test-screenshot.png', { type: 'image/png' });
      const baseImage = await createBaseImageFromBlob(file);

      expect(baseImage).toBeDefined();
      expect(baseImage.id).toBeDefined();
      expect(baseImage.fileName).toBe('test-screenshot.png');
      expect(baseImage.naturalWidth).toBeGreaterThan(0);
      expect(baseImage.naturalHeight).toBeGreaterThan(0);
      expect(baseImage.src).toMatch(/^blob:/);
    });

    it('creates a BaseImage from a raw Blob with custom filename', async () => {
      const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
      const baseImage = await createBaseImageFromBlob(blob, 'custom_name.jpg');

      expect(baseImage.fileName).toBe('custom_name.jpg');
      expect(baseImage.naturalWidth).toBe(800);
      expect(baseImage.naturalHeight).toBe(600);
    });

    it('rejects unsupported non-image formats and cleans up object URL', async () => {
      const file = new File(['fake-pdf-content'], 'document.pdf', { type: 'application/pdf' });

      await expect(createBaseImageFromBlob(file)).rejects.toThrow(
        /Unsupported or invalid image format/
      );
    });

    it('falls back to Image loader when createImageBitmap returns 0 dimensions or fails', async () => {
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      globalThis.createImageBitmap = vi.fn().mockResolvedValue({
        width: 0,
        height: 0,
        close: vi.fn(),
      } as unknown as ImageBitmap);

      // Mock Image implementation
      const originalImage = globalThis.Image;
      class MockImage {
        naturalWidth = 1024;
        naturalHeight = 768;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private _src = '';

        set src(value: string) {
          this._src = value;
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
        get src() {
          return this._src;
        }
      }
      globalThis.Image = MockImage as unknown as typeof Image;

      const blob = new Blob(['bytes'], { type: 'image/png' });
      const baseImage = await createBaseImageFromBlob(blob);

      expect(baseImage.naturalWidth).toBe(1024);
      expect(baseImage.naturalHeight).toBe(768);

      globalThis.createImageBitmap = originalCreateImageBitmap;
      globalThis.Image = originalImage;
    });

    it('rejects image with 0 or negative dimensions and cleans up blob URL', async () => {
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      globalThis.createImageBitmap = vi.fn().mockResolvedValue({
        width: 0,
        height: 0,
        close: vi.fn(),
      } as unknown as ImageBitmap);

      const originalImage = globalThis.Image;
      class MockZeroImage {
        naturalWidth = 0;
        naturalHeight = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private _src = '';
        set src(value: string) {
          this._src = value;
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
        get src() {
          return this._src;
        }
      }
      globalThis.Image = MockZeroImage as unknown as typeof Image;
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      const blob = new Blob(['bytes'], { type: 'image/png' });
      await expect(createBaseImageFromBlob(blob)).rejects.toThrow(/Invalid image dimensions/);
      expect(revokeSpy).toHaveBeenCalled();

      globalThis.createImageBitmap = originalCreateImageBitmap;
      globalThis.Image = originalImage;
    });
  });

  describe('Suite 1: Clipboard Paste Event Ingestion', () => {
    it('pastes an image/png DataTransfer item and creates a BaseImage in state', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const file = new File(['png-data'], 'clipboard.png', { type: 'image/png' });
      const item = {
        type: 'image/png',
        getAsFile: () => file,
      };

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        items: [item],
        files: [file],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('clipboard.png');
    });

    it('pastes an image from clipboardData.files when items is empty', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const file = new File(['jpeg-data'], 'pasted_photo.jpg', { type: 'image/jpeg' });
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        items: [],
        files: [file],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('pasted_photo.jpg');
    });

    it('ignores plain text paste and preserves default text paste behavior', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        items: [{ type: 'text/plain', getAsFile: () => null }],
        files: [],
      };
      const preventDefaultSpy = vi.spyOn(pasteEvent, 'preventDefault');

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(onImageLoaded).not.toHaveBeenCalled();
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('ignores paste when typing in an input element if clipboard has only text', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      Object.defineProperty(pasteEvent, 'target', { value: input, configurable: true });
      pasteEvent.clipboardData = {
        items: [{ type: 'text/plain', getAsFile: () => null }],
        files: [],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(onImageLoaded).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('intercepts and ingests image paste even when focused on an input element', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const input = document.createElement('textarea');
      document.body.appendChild(input);
      input.focus();

      const file = new File(['png-data'], 'diagram.png', { type: 'image/png' });
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      Object.defineProperty(pasteEvent, 'target', { value: input, configurable: true });
      pasteEvent.clipboardData = {
        items: [{ type: 'image/png', getAsFile: () => file }],
        files: [file],
      };
      const preventDefaultSpy = vi.spyOn(pasteEvent, 'preventDefault');

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      document.body.removeChild(input);
    });

    it('does not listen to paste events when disabled option is true', async () => {
      const onImageLoaded = vi.fn();
      renderHook(() => useClipboardPaste({ onImageLoaded, disabled: true }), {
        wrapper: createWrapper(),
      });

      const file = new File(['png-data'], 'disabled.png', { type: 'image/png' });
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        items: [{ type: 'image/png', getAsFile: () => file }],
        files: [file],
      };

      await act(async () => {
        window.dispatchEvent(pasteEvent);
      });

      expect(onImageLoaded).not.toHaveBeenCalled();
    });
  });

  describe('Suite 2: Drag & Drop Ingestion & Depth Tracking', () => {
    it('tracks nested drag enter/leave depth correctly', () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isDraggingOver).toBe(false);

      const fakeDragEnterEvent = {
        preventDefault: vi.fn(),
        dataTransfer: { types: ['Files'] },
      } as unknown as React.DragEvent;

      act(() => {
        result.current.handleDragEnter(fakeDragEnterEvent);
      });
      expect(result.current.isDraggingOver).toBe(true);

      // Nested child enter
      act(() => {
        result.current.handleDragEnter(fakeDragEnterEvent);
      });
      expect(result.current.isDraggingOver).toBe(true);

      // Child leave
      const fakeDragLeaveEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.DragEvent;

      act(() => {
        result.current.handleDragLeave(fakeDragLeaveEvent);
      });
      expect(result.current.isDraggingOver).toBe(true);

      // Container leave
      act(() => {
        result.current.handleDragLeave(fakeDragLeaveEvent);
      });
      expect(result.current.isDraggingOver).toBe(false);
    });

    it('sets dropEffect to copy on dragOver', () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper(),
      });

      const dataTransfer = { dropEffect: '' };
      const fakeDragOverEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer,
      } as unknown as React.DragEvent;

      act(() => {
        result.current.handleDragOver(fakeDragOverEvent);
      });

      expect(fakeDragOverEvent.preventDefault).toHaveBeenCalled();
      expect(dataTransfer.dropEffect).toBe('copy');
    });

    it('ingests image on handleDrop with valid image file', async () => {
      const onImageLoaded = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const file = new File(['image-bytes'], 'dropped.png', { type: 'image/png' });
      const fakeDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [file],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(fakeDropEvent);
      });

      expect(fakeDropEvent.preventDefault).toHaveBeenCalled();
      expect(result.current.isDraggingOver).toBe(false);
      expect(onImageLoaded).toHaveBeenCalledTimes(1);
    });

    it('calls onError when a non-image file is dropped', async () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onError }), {
        wrapper: createWrapper(),
      });

      const file = new File(['text'], 'readme.txt', { type: 'text/plain' });
      const fakeDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [file],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(fakeDropEvent);
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Suite 3: File Picker Fallback', () => {
    it('openFilePicker clears input value and clicks the input element', () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper(),
      });

      const mockInput = document.createElement('input');
      mockInput.value = 'old_file.png';
      const clickSpy = vi.spyOn(mockInput, 'click').mockImplementation(() => {});

      (result.current.fileInputRef as any).current = mockInput;

      act(() => {
        result.current.openFilePicker();
      });

      expect(mockInput.value).toBe('');
      expect(clickSpy).toHaveBeenCalled();
    });

    it('handleFileInputChange processes selected file and resets input value', async () => {
      const onImageLoaded = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const file = new File(['bytes'], 'picked.png', { type: 'image/png' });
      const mockChangeEvent = {
        target: {
          files: [file],
          value: 'C:\\fakepath\\picked.png',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleFileInputChange(mockChangeEvent);
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(mockChangeEvent.target.value).toBe('');
    });
  });

  describe('Suite 4: Base Image Replacement & Confirmation Modal', () => {
    it('applies image directly without modal when canvas has no existing image', async () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper({ image: null, annotations: [] }),
      });

      const file = new File(['bytes'], 'first.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
    });

    it('applies image directly without modal when image exists but 0 annotations exist', async () => {
      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper({ image: mockBaseImage, annotations: [] }),
      });

      const file = new File(['bytes'], 'second.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
    });

    it('opens confirmation modal and stages pendingImage when image and active annotations exist', async () => {
      const existingAnnotation = {
        id: 'ann_1',
        index: 1,
        geometry: sampleBox,
        style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Note 1',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const { result } = renderHook(() => useClipboardPaste({ requireConfirmationIfAnnotated: true }), {
        wrapper: createWrapper({ image: mockBaseImage, annotations: [existingAnnotation] }),
      });

      const file = new File(['bytes'], 'replacement.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);
      expect(result.current.pendingImage).not.toBeNull();
      expect(result.current.pendingImage?.fileName).toBe('replacement.png');
    });

    it('confirmImageReplacement commits pending image and closes modal', async () => {
      const existingAnnotation = {
        id: 'ann_1',
        index: 1,
        geometry: sampleBox,
        style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Note 1',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const onImageLoaded = vi.fn();
      const { result } = renderHook(
        () => useClipboardPaste({ onImageLoaded, requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({ image: mockBaseImage, annotations: [existingAnnotation] }),
        }
      );

      const file = new File(['bytes'], 'new_shot.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);

      act(() => {
        result.current.confirmImageReplacement();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(onImageLoaded).toHaveBeenCalledTimes(1);
    });

    it('cancelImageReplacement revokes pending blob URL, closes modal, and discards pendingImage', async () => {
      const existingAnnotation = {
        id: 'ann_1',
        index: 1,
        geometry: sampleBox,
        style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Note 1',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const { result } = renderHook(() => useClipboardPaste({ requireConfirmationIfAnnotated: true }), {
        wrapper: createWrapper({ image: mockBaseImage, annotations: [existingAnnotation] }),
      });

      const file = new File(['bytes'], 'discarded.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      const pendingSrc = result.current.pendingImage?.src;
      expect(pendingSrc).toBeDefined();

      act(() => {
        result.current.cancelImageReplacement();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(revokeSpy).toHaveBeenCalledWith(pendingSrc);
    });
  });

  describe('Suite 5: Memory Management', () => {
    it('revokes previous base image object URL when new image is loaded', async () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const oldImage: BaseImage = {
        ...mockBaseImage,
        src: 'blob:http://localhost/old-image-to-clean',
      };

      const { result } = renderHook(() => useClipboardPaste(), {
        wrapper: createWrapper({ image: oldImage, annotations: [] }),
      });

      const file = new File(['bytes'], 'next.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/old-image-to-clean');
    });

    it('revokes pendingImage blob URL on hook unmount', async () => {
      const existingAnnotation = {
        id: 'ann_1',
        index: 1,
        geometry: sampleBox,
        style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Note 1',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const { result, unmount } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({ image: mockBaseImage, annotations: [existingAnnotation] }),
        }
      );

      const file = new File(['bytes'], 'pending_unmount.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      const pendingSrc = result.current.pendingImage?.src;

      act(() => {
        unmount();
      });

      expect(revokeSpy).toHaveBeenCalledWith(pendingSrc);
    });
  });
});
