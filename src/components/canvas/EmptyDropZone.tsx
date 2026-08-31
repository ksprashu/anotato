import React from 'react';
import { ImageIcon, Upload } from 'lucide-react';

export interface EmptyDropZoneProps {
  className?: string;
  isDraggingOver?: boolean;
  onOpenFilePicker?: () => void;
}

export const EmptyDropZone: React.FC<EmptyDropZoneProps> = ({
  className = '',
  isDraggingOver = false,
  onOpenFilePicker,
}) => {
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '');
  const pasteShortcut = isMac ? '⌘V' : 'Ctrl+V';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenFilePicker?.();
    }
  };

  return (
    <div
      data-testid="canvas-empty-state"
      role="region"
      aria-label="Image drop zone"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`absolute inset-0 m-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 z-10 select-none outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 ${
        isDraggingOver
          ? 'border-amber-500 bg-amber-500/10 text-amber-300 shadow-[0_0_40px_rgba(245,158,11,0.25)] scale-[1.01]'
          : 'border-slate-800 bg-slate-900/60 backdrop-blur-sm text-slate-400 hover:border-slate-700 hover:bg-slate-900/80'
      } ${className}`}
    >
      <div className="flex flex-col items-center max-w-md text-center p-8 space-y-5 pointer-events-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
          <ImageIcon className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold text-slate-100">
            Paste or Drop a Screenshot
          </h3>
          <p className="text-sm text-slate-400 flex items-center justify-center gap-1.5 flex-wrap">
            Press{' '}
            <kbd className="px-2 py-0.5 text-xs font-mono font-bold bg-slate-800 text-amber-400 rounded border border-slate-700 shadow-sm">
              {pasteShortcut}
            </kbd>{' '}
            anywhere or drag an image file onto the canvas.
          </p>
        </div>

        <button
          type="button"
          data-testid="canvas-upload-button"
          onClick={onOpenFilePicker}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white text-sm font-medium border border-slate-700 transition shadow-sm hover:shadow"
        >
          <Upload className="w-4 h-4 text-amber-400" />
          Choose Image File
        </button>

        <div className="pt-2 flex flex-col items-center gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 flex-wrap justify-center text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">PNG</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">JPEG</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">WebP</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">GIF</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">SVG</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Supports high-DPI retina screenshots up to 4K / 8K resolution
          </span>
        </div>
      </div>
    </div>
  );
};

export default EmptyDropZone;
