import { useState, useRef, useEffect, useCallback } from 'react';
import { BaseImage } from '../types';
import { useApp } from '../state/AppContext';
import { generateUniqueId } from '../state/appReducer';
import { trackPaste, TelemetryPasteSource } from '../analytics/telemetry';

export interface UseClipboardPasteOptions {
  /** Callback fired after a new base image has been decoded and committed to state */
  onImageLoaded?: (image: BaseImage) => void;
  /** Callback fired when image extraction or decoding fails */
  onError?: (error: Error) => void;
  /** Flag to disable paste/drop listeners (e.g. during modal dialogs) */
  disabled?: boolean;
  /** Whether to require confirmation before replacing an image if annotations exist (default: true) */
  requireConfirmationIfAnnotated?: boolean;
}

export interface UseClipboardPasteReturn {
  /** True when a file is currently being dragged over the drop zone */
  isDraggingOver: boolean;
  /** True while an image blob is being decoded into bitmap dimensions */
  isLoading: boolean;
  /** The staged BaseImage awaiting user confirmation for replacement */
  pendingImage: BaseImage | null;
  /** Whether the Replace Image confirmation modal is open */
  isReplaceModalOpen: boolean;
  /** Confirm replacement: applies pendingImage, clears annotations, and closes modal */
  confirmImageReplacement: () => void;
  /** Cancel replacement: revokes pending blob URL and closes modal */
  cancelImageReplacement: () => void;
  /** Imperatively open the native file picker dialog */
  openFilePicker: () => void;
  /** Drop event handler for drop zone container */
  handleDrop: (e: React.DragEvent) => Promise<void>;
  /** DragEnter event handler */
  handleDragEnter: (e: React.DragEvent) => void;
  /** DragOver event handler */
  handleDragOver: (e: React.DragEvent) => void;
  /** DragLeave event handler */
  handleDragLeave: (e: React.DragEvent) => void;
  /** Change event handler for hidden file input */
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  /** Ref to attach to the hidden file input element */
  fileInputRef: React.RefObject<HTMLInputElement>;
  /** Direct decoding utility for testing or manual uploads */
  processImageBlob: (
    blob: Blob | File,
    customFileName?: string,
    source?: TelemetryPasteSource
  ) => Promise<BaseImage>;
}

export async function createBaseImageFromBlob(
  blob: Blob | File,
  customFileName?: string
): Promise<BaseImage> {
  const isImageMime = blob.type && blob.type.startsWith('image/');
  const hasImageExtension =
    blob instanceof File && /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(blob.name);

  if (!isImageMime && !hasImageExtension) {
    throw new Error(`Unsupported or invalid image format: ${blob.type || 'unknown'}`);
  }

  const fileName =
    customFileName ||
    (blob instanceof File && blob.name
      ? blob.name
      : `screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`);

  const objectUrl = URL.createObjectURL(blob);

  try {
    let width = 0;
    let height = 0;

    if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close?.();
      } catch {
        // Fallback to HTMLImageElement
      }
    }

    if (width === 0 || height === 0) {
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (w > 0 && h > 0) {
            resolve({ width: w, height: h });
          } else {
            reject(new Error(`Invalid image dimensions: ${w}x${h}`));
          }
        };
        img.onerror = () => reject(new Error('Failed to decode image from blob'));
        img.src = objectUrl;
      });
      width = dims.width;
      height = dims.height;
    }

    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid image dimensions: ${width}x${height}`);
    }

    return {
      id: generateUniqueId(),
      src: objectUrl,
      naturalWidth: width,
      naturalHeight: height,
      fileName,
      fileSize: blob.size,
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

export function useClipboardPaste({
  onImageLoaded,
  onError,
  disabled = false,
  requireConfirmationIfAnnotated = true,
}: UseClipboardPasteOptions = {}): UseClipboardPasteReturn {
  const { state, dispatch } = useApp();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<BaseImage | null>(null);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);

  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const committedImageSrcRef = useRef<string | null>(null);
  const pendingSourceRef = useRef<TelemetryPasteSource>('unknown');

  const applyBaseImage = useCallback(
    (newImage: BaseImage, source: TelemetryPasteSource = 'unknown') => {
      if (state.image?.src && state.image.src.startsWith('blob:')) {
        URL.revokeObjectURL(state.image.src);
      }
      dispatch({ type: 'SET_IMAGE', payload: newImage });
      onImageLoaded?.(newImage);
      trackPaste({
        source,
        fileSize: newImage.fileSize,
        width: newImage.naturalWidth,
        height: newImage.naturalHeight,
      });
    },
    [state.image?.src, dispatch, onImageLoaded]
  );

  const processImageBlob = useCallback(
    async (
      blob: Blob | File,
      customFileName?: string,
      source: TelemetryPasteSource = 'unknown'
    ): Promise<BaseImage> => {
      setIsLoading(true);
      pendingSourceRef.current = source;
      try {
        const baseImage = await createBaseImageFromBlob(blob, customFileName);
        if (requireConfirmationIfAnnotated && state.image && state.annotations.length > 0) {
          setPendingImage(baseImage);
          setIsReplaceModalOpen(true);
        } else {
          applyBaseImage(baseImage, source);
        }
        return baseImage;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [state.image, state.annotations.length, requireConfirmationIfAnnotated, applyBaseImage, onError]
  );

  const confirmImageReplacement = useCallback(() => {
    if (pendingImage) {
      const staged = pendingImage;
      committedImageSrcRef.current = staged.src;
      applyBaseImage(staged, pendingSourceRef.current);
      setPendingImage(null);
      setIsReplaceModalOpen(false);
    }
  }, [pendingImage, applyBaseImage]);

  const cancelImageReplacement = useCallback(() => {
    if (pendingImage) {
      setPendingImage(null);
      setIsReplaceModalOpen(false);
    }
  }, [pendingImage]);

  const openFilePicker = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          await processImageBlob(file, file.name, 'file_picker');
        } catch {
          // Error already forwarded to onError in processImageBlob
        }
      }
      e.target.value = '';
    },
    [processImageBlob]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.types?.includes('Files')) {
      dragDepthRef.current += 1;
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer?.files || []);
      const imageFile = files.find(
        (f) =>
          (f?.type && typeof f.type === 'string' && f.type.startsWith('image/')) ||
          (f?.name && typeof f.name === 'string' && /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name))
      );

      if (imageFile) {
        try {
          await processImageBlob(imageFile, imageFile.name, 'drop');
        } catch {
          // Error handled in processImageBlob
        }
      } else if (files.length > 0) {
        const error = new Error('Dropped file is not a supported image format.');
        onError?.(error);
      }
    },
    [processImageBlob, onError]
  );

  // Global window paste listener
  useEffect(() => {
    if (disabled) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      let imageBlob: Blob | null = null;
      let fileName: string | undefined;

      if (clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];
          if (item?.type && typeof item.type === 'string' && item.type.startsWith('image/')) {
            try {
              const file = item.getAsFile();
              if (file) {
                imageBlob = file;
                fileName = file.name || `clipboard_${Date.now()}.png`;
                break;
              }
            } catch {
              // Ignore clipboard security errors and continue searching
            }
          }
        }
      }

      if (!imageBlob && clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          const file = clipboardData.files[i];
          if (file?.type && typeof file.type === 'string' && file.type.startsWith('image/')) {
            imageBlob = file;
            fileName = file.name;
            break;
          }
        }
      }

      if (!imageBlob) {
        // Plain text paste inside text fields or body is preserved
        return;
      }

      // If user pasted an image (even inside an input), intercept and process
      e.preventDefault();
      try {
        await processImageBlob(imageBlob, fileName, 'clipboard');
      } catch {
        // Handled in processImageBlob
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [disabled, processImageBlob]);

  // Global window dragover/drop protection
  useEffect(() => {
    const preventWindowDrop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', preventWindowDrop);
    window.addEventListener('drop', preventWindowDrop);
    return () => {
      window.removeEventListener('dragover', preventWindowDrop);
      window.removeEventListener('drop', preventWindowDrop);
    };
  }, []);

  // Cleanup pendingImage blob URL on unmount or cancellation
  useEffect(() => {
    return () => {
      if (
        pendingImage?.src &&
        pendingImage.src.startsWith('blob:') &&
        pendingImage.src !== committedImageSrcRef.current
      ) {
        URL.revokeObjectURL(pendingImage.src);
      }
    };
  }, [pendingImage]);

  return {
    isDraggingOver,
    isLoading,
    pendingImage,
    isReplaceModalOpen,
    confirmImageReplacement,
    cancelImageReplacement,
    openFilePicker,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleFileInputChange,
    fileInputRef: fileInputRef as React.RefObject<HTMLInputElement>,
    processImageBlob,
  };
}
