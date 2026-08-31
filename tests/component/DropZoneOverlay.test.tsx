import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropZoneOverlay } from '../../src/components/canvas/DropZoneOverlay';
import { AppProvider } from '../../src/state/AppContext';
import { BaseImage } from '../../src/types';

const mockImage: BaseImage = {
  id: 'img_1',
  src: 'blob:image-url',
  naturalWidth: 800,
  naturalHeight: 600,
  fileName: 'screenshot.png',
  fileSize: 50000,
};

describe('DropZoneOverlay Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when image is null and not dragging', () => {
    render(
      <AppProvider initialState={{ image: null }}>
        <DropZoneOverlay />
      </AppProvider>
    );

    expect(screen.getByTestId('dropzone-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/Paste screenshot or drop image/i)).toBeInTheDocument();
    expect(screen.getByTestId('paste-shortcut-badge')).toBeInTheDocument();
    expect(screen.getByTestId('browse-files-btn')).toBeInTheDocument();
  });

  it('renders nothing when image is loaded and not dragging', () => {
    const { container } = render(
      <AppProvider initialState={{ image: mockImage }}>
        <DropZoneOverlay />
      </AppProvider>
    );

    expect(container.firstChild).toBeNull();
  });

  it('activates drag-over overlay when user drags file into dropzone', () => {
    render(
      <AppProvider initialState={{ image: null }}>
        <DropZoneOverlay />
      </AppProvider>
    );

    const emptyContainer = screen.getByTestId('dropzone-empty-state');

    fireEvent.dragEnter(emptyContainer, {
      dataTransfer: { items: [{ kind: 'file', type: 'image/png' }] },
    });

    expect(screen.getByTestId('dropzone-active-dragover')).toBeInTheDocument();
    expect(screen.getByText(/Drop image to load into canvas/i)).toBeInTheDocument();
  });

  it('handles Browse Files click by triggering native file input', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider initialState={{ image: null }}>
        <DropZoneOverlay />
      </AppProvider>
    );

    const browseBtn = screen.getByTestId('browse-files-btn');
    const fileInput = screen.getByTestId('dropzone-file-input');
    const clickSpy = vi.spyOn(fileInput, 'click');

    await user.click(browseBtn);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('invokes onFileDrop when image file is dropped', () => {
    const onFileDropMock = vi.fn();

    render(
      <AppProvider initialState={{ image: null }}>
        <DropZoneOverlay onFileDrop={onFileDropMock} />
      </AppProvider>
    );

    const emptyContainer = screen.getByTestId('dropzone-empty-state');
    const file = new File(['fake-png'], 'dropped.png', { type: 'image/png' });

    fireEvent.drop(emptyContainer, {
      dataTransfer: { files: [file] },
    });

    expect(onFileDropMock).toHaveBeenCalledWith(file);
  });
});
