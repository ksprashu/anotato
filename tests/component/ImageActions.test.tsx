import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageActions, decodeImageFile } from '../../src/components/toolbar/ImageActions';
import { AppProvider } from '../../src/state/AppContext';
import { BaseImage, BoxGeometry } from '../../src/types';

const mockImage: BaseImage = {
  id: 'img_test_1',
  src: 'blob:mock-image-url',
  naturalWidth: 1600,
  naturalHeight: 900,
  fileName: 'test-screenshot.png',
  fileSize: 102400,
};

const sampleBox: BoxGeometry = {
  type: 'box',
  x: 10,
  y: 10,
  width: 100,
  height: 100,
};

describe('ImageActions Component & decodeImageFile Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('decodeImageFile Utility', () => {
    it('decodes a valid image file and resolves BaseImage', async () => {
      const file = new File(['fake-bytes'], 'photo.png', { type: 'image/png' });
      const image = await decodeImageFile(file);

      expect(image).toBeDefined();
      expect(image.fileName).toBe('photo.png');
      expect(image.naturalWidth).toBe(800);
      expect(image.naturalHeight).toBe(600);
    });

    it('rejects invalid non-image file types', async () => {
      const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
      await expect(decodeImageFile(file)).rejects.toThrow(/Invalid file type/);
    });
  });

  describe('Rendering & State Behaviors', () => {
    it('renders image actions toolbar with all buttons', () => {
      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ImageActions />
        </AppProvider>
      );

      expect(screen.getByTestId('image-actions-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('replace-image-btn')).toBeInTheDocument();
      expect(screen.getByTestId('clear-annotations-btn')).toBeInTheDocument();
      expect(screen.getByTestId('reset-canvas-btn')).toBeInTheDocument();
    });

    it('disables Clear Annotations button when annotations list is empty', () => {
      render(
        <AppProvider initialState={{ image: mockImage, annotations: [] }}>
          <ImageActions />
        </AppProvider>
      );

      expect(screen.getByTestId('clear-annotations-btn')).toBeDisabled();
    });

    it('enables Clear Annotations button when active annotations exist', () => {
      const annotation = {
        id: 'ann_1',
        index: 1,
        geometry: sampleBox,
        style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Sample note',
        createdAt: 1000,
        updatedAt: 1000,
      };

      render(
        <AppProvider initialState={{ image: mockImage, annotations: [annotation] }}>
          <ImageActions />
        </AppProvider>
      );

      expect(screen.getByTestId('clear-annotations-btn')).not.toBeDisabled();
    });

    it('disables Reset Canvas button when image is null and annotations are empty', () => {
      render(
        <AppProvider initialState={{ image: null, annotations: [] }}>
          <ImageActions />
        </AppProvider>
      );

      expect(screen.getByTestId('reset-canvas-btn')).toBeDisabled();
    });

    it('enables Reset Canvas button when image is present', () => {
      render(
        <AppProvider initialState={{ image: mockImage, annotations: [] }}>
          <ImageActions />
        </AppProvider>
      );

      expect(screen.getByTestId('reset-canvas-btn')).not.toBeDisabled();
    });
  });

  describe('User Interactions & Callbacks', () => {
    it('triggers onRequestUpload or clicks file input when Replace Image is clicked', async () => {
      const user = userEvent.setup();
      const onRequestUploadMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ImageActions onRequestUpload={onRequestUploadMock} />
        </AppProvider>
      );

      await user.click(screen.getByTestId('replace-image-btn'));
      expect(onRequestUploadMock).toHaveBeenCalledTimes(1);
    });

    it('invokes custom onClearAnnotations callback when Clear Annotations is clicked', async () => {
      const user = userEvent.setup();
      const onClearMock = vi.fn();
      const annotation = {
        id: 'ann_1',
        index: 1,
        geometry: sampleBox,
        style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Sample note',
        createdAt: 1000,
        updatedAt: 1000,
      };

      render(
        <AppProvider initialState={{ image: mockImage, annotations: [annotation] }}>
          <ImageActions onClearAnnotations={onClearMock} />
        </AppProvider>
      );

      await user.click(screen.getByTestId('clear-annotations-btn'));
      expect(onClearMock).toHaveBeenCalledTimes(1);
    });

    it('invokes custom onResetCanvas callback when Reset Canvas is clicked', async () => {
      const user = userEvent.setup();
      const onResetMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ImageActions onResetCanvas={onResetMock} />
        </AppProvider>
      );

      await user.click(screen.getByTestId('reset-canvas-btn'));
      expect(onResetMock).toHaveBeenCalledTimes(1);
    });

    it('handles native file input change event and dispatches SET_IMAGE', async () => {
      const onReplaceImageMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ImageActions onReplaceImage={onReplaceImageMock} />
        </AppProvider>
      );

      const fileInput = screen.getByTestId('image-file-input');
      const file = new File(['fake-bytes'], 'new_photo.png', { type: 'image/png' });

      fireEvent.change(fileInput, {
        target: { files: [file] },
      });

      expect(onReplaceImageMock).toHaveBeenCalledWith(file);
    });
  });
});
