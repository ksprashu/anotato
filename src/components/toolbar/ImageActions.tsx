import React, { useRef } from 'react';
import { ImagePlus, Eraser, RotateCcw } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { BaseImage } from '../../types';

import { createBaseImageFromBlob } from '../../hooks/useClipboardPaste';

export interface ImageActionsProps {
  className?: string;
  onReplaceImage?: (file: File) => void;
  onClearAnnotations?: () => void;
  onResetCanvas?: () => void;
  onRequestUpload?: () => void;
  showLabels?: boolean;
}

export async function decodeImageFile(file: File): Promise<BaseImage> {
  const isImageMime = file.type && file.type.startsWith('image/');
  const hasImageExt = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);

  if (!isImageMime && !hasImageExt) {
    throw new Error(`Invalid file type: ${file.type || 'unknown'}. Please upload an image file.`);
  }

  return createBaseImageFromBlob(file, file.name);
}

export const ImageActions: React.FC<ImageActionsProps> = ({
  className = '',
  onReplaceImage,
  onClearAnnotations,
  onResetCanvas,
  onRequestUpload,
  showLabels = false,
}) => {
  const { state, dispatch } = useApp();
  const { image, annotations } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasImage = image !== null;
  const hasAnnotations = annotations.length > 0;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (onReplaceImage) {
      onReplaceImage(file);
    } else {
      try {
        const loadedImage = await decodeImageFile(file);
        if (state.image?.src && state.image.src.startsWith('blob:')) {
          URL.revokeObjectURL(state.image.src);
        }
        dispatch({ type: 'SET_IMAGE', payload: loadedImage });
      } catch (err) {
        console.error('Image loading error:', err);
      }
    }

    // Reset input value so the same file can be re-selected
    e.target.value = '';
  };

  const handleTriggerUpload = () => {
    if (onRequestUpload) {
      onRequestUpload();
    } else if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleClearAnnotations = () => {
    if (!hasAnnotations) return;
    if (onClearAnnotations) {
      onClearAnnotations();
      return;
    }
    dispatch({ type: 'CLEAR_ALL_ANNOTATIONS' });
  };

  const handleResetCanvas = () => {
    if (!hasImage && !hasAnnotations) return;
    if (onResetCanvas) {
      onResetCanvas();
      return;
    }
    if (state.image?.src && state.image.src.startsWith('blob:')) {
      URL.revokeObjectURL(state.image.src);
    }
    dispatch({ type: 'CLEAR_IMAGE' });
  };

  return (
    <div
      className={`flex items-center gap-1 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-lg p-1 text-slate-700 dark:text-slate-200 shadow-sm select-none ${className}`}
      role="toolbar"
      aria-label="Image actions"
      data-testid="image-actions-toolbar"
    >
      {/* Hidden File Input for Image Upload / Replacement */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
        data-testid="image-file-input"
        aria-hidden="true"
      />

      {/* Replace Image Button */}
      <button
        type="button"
        onClick={handleTriggerUpload}
        className="flex items-center gap-1.5 p-1.5 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-medium active:scale-95 cursor-pointer"
        title={hasImage ? 'Replace current base image' : 'Upload base image'}
        aria-label={hasImage ? 'Replace Image' : 'Upload Image'}
        data-testid="replace-image-btn"
      >
        <ImagePlus className="w-4 h-4 text-amber-500 dark:text-amber-400" />
        {showLabels && <span>{hasImage ? 'Replace' : 'Upload'}</span>}
      </button>

      {/* Clear Annotations Button */}
      <button
        type="button"
        onClick={handleClearAnnotations}
        disabled={!hasAnnotations}
        className="flex items-center gap-1.5 p-1.5 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 text-xs font-medium active:scale-95 cursor-pointer"
        title="Clear all visual annotations (Undoable via ⌘Z)"
        aria-label="Clear Annotations"
        data-testid="clear-annotations-btn"
      >
        <Eraser className="w-4 h-4" />
        {showLabels && <span>Clear Notes</span>}
      </button>

      <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* Reset Canvas Button */}
      <button
        type="button"
        onClick={handleResetCanvas}
        disabled={!hasImage && !hasAnnotations}
        className="flex items-center gap-1.5 p-1.5 px-2 rounded hover:bg-red-500/10 dark:hover:bg-red-500/20 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 text-xs font-medium active:scale-95 cursor-pointer"
        title="Reset entire canvas (removes base image and annotations)"
        aria-label="Reset Canvas"
        data-testid="reset-canvas-btn"
      >
        <RotateCcw className="w-4 h-4" />
        {showLabels && <span>Reset</span>}
      </button>
    </div>
  );
};

export default ImageActions;
