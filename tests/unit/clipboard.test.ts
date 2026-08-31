import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  writeImageToClipboard,
  copyImageToClipboard,
  writeTextToClipboard,
  copyTextToClipboard,
  writeCombinedToClipboard,
  downloadBlob,
  downloadTextFile,
  copyCompositeImage,
  copyAnnotationNotes,
  downloadCompositeImageFile,
  downloadNotesMarkdownFile,
  isAsyncClipboardSupported,
  isClipboardItemSupported,
  isClipboardWritePermissionGranted,
} from '../../src/export/clipboard';
import { BaseImage, Annotation } from '../../src/types';

describe('Clipboard Service Unit Tests', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 800,
    naturalHeight: 600,
    fileName: 'test-mock.png',
    fileSize: 1000,
  };

  const mockAnnotation: Annotation = {
    id: 'ann-1',
    index: 1,
    geometry: { type: 'box', x: 10, y: 10, width: 100, height: 100 },
    style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
    note: 'Test note',
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Feature Detection', () => {
    it('detects async clipboard API presence', () => {
      expect(isAsyncClipboardSupported()).toBe(true);
    });

    it('detects ClipboardItem constructor presence', () => {
      expect(isClipboardItemSupported()).toBe(true);
    });

    it('checks clipboard write permission status gracefully', async () => {
      const granted = await isClipboardWritePermissionGranted();
      expect(typeof granted).toBe('boolean');
    });
  });

  describe('Image Clipboard Operations', () => {
    it('writes image Blob to system clipboard via ClipboardItem', async () => {
      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      const res = await writeImageToClipboard(blob);

      expect(res.success).toBe(true);
      expect(res.method).toBe('async-clipboard');
      expect(res.fallbackUsed).toBe(false);
      expect(navigator.clipboard.write).toHaveBeenCalled();
    });

    it('converts HTMLCanvasElement to Blob and writes to clipboard', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;

      const res = await writeImageToClipboard(canvas);
      expect(res.success).toBe(true);
      expect(res.method).toBe('async-clipboard');
    });

    it('falls back to downloadBlob when clipboard write throws an error', async () => {
      vi.mocked(navigator.clipboard.write).mockRejectedValueOnce(new Error('Permission denied'));

      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      const res = await writeImageToClipboard(blob, { fallbackFileName: 'fallback.png' });

      expect(res.success).toBe(true);
      expect(res.method).toBe('download-fallback');
      expect(res.fallbackUsed).toBe(true);
      expect(res.error?.message).toBe('Permission denied');
    });

    it('throws error when clipboard write fails and autoDownloadFallback is false', async () => {
      vi.mocked(navigator.clipboard.write).mockRejectedValueOnce(new Error('Permission denied'));

      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      await expect(
        writeImageToClipboard(blob, { autoDownloadFallback: false })
      ).rejects.toThrow('Permission denied');
    });

    it('copyImageToClipboard returns true on success', async () => {
      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      const success = await copyImageToClipboard(blob);
      expect(success).toBe(true);
    });
  });

  describe('Text Clipboard Operations', () => {
    it('writes text string via navigator.clipboard.writeText', async () => {
      const text = '### Notes\n1. Item 1';
      const res = await writeTextToClipboard(text);

      expect(res.success).toBe(true);
      expect(res.method).toBe('async-clipboard');
      expect(res.fallbackUsed).toBe(false);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text);
    });

    it('falls back to execCommand when writeText rejects', async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('writeText failed'));
      document.execCommand = vi.fn().mockReturnValue(true);

      const text = 'Fallback note';
      const res = await writeTextToClipboard(text);

      expect(res.success).toBe(true);
      expect(res.method).toBe('execCommand');
      expect(res.fallbackUsed).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });

    it('falls back to file download when both writeText and execCommand fail', async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('writeText failed'));
      document.execCommand = vi.fn().mockReturnValue(false);

      const text = 'Download note';
      const res = await writeTextToClipboard(text, { fallbackFileName: 'notes.md' });

      expect(res.success).toBe(true);
      expect(res.method).toBe('download-fallback');
      expect(res.fallbackUsed).toBe(true);
    });

    it('copyTextToClipboard returns true on success', async () => {
      const success = await copyTextToClipboard('Hello World');
      expect(success).toBe(true);
    });
  });

  describe('Combined and High-Level Operations', () => {
    it('writeCombinedToClipboard writes both image and text to clipboard', async () => {
      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      const res = await writeCombinedToClipboard(blob, '# Notes');

      expect(res.success).toBe(true);
      expect(res.method).toBe('async-clipboard');
    });

    it('copyCompositeImage renders canvas and writes to clipboard', async () => {
      const res = await copyCompositeImage(mockBaseImage, [mockAnnotation]);
      expect(res.success).toBe(true);
    });

    it('copyAnnotationNotes serializes notes and writes to clipboard', async () => {
      const res = await copyAnnotationNotes([mockAnnotation]);
      expect(res.success).toBe(true);
    });

    it('downloadCompositeImageFile triggers file download with sanitized filename', async () => {
      await downloadCompositeImageFile(mockBaseImage, [mockAnnotation]);
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('downloadNotesMarkdownFile triggers markdown file download', () => {
      downloadNotesMarkdownFile(mockBaseImage, [mockAnnotation]);
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('downloadBlob and downloadTextFile trigger browser download pipeline', () => {
      const blob = new Blob(['sample-data'], { type: 'text/plain' });
      downloadBlob(blob, 'sample.txt');
      expect(URL.createObjectURL).toHaveBeenCalled();

      downloadTextFile('sample text content', 'sample.md');
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});
