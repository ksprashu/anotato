import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ReplaceImageModalProps {
  isOpen: boolean;
  annotationCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ReplaceImageModal: React.FC<ReplaceImageModalProps> = ({
  isOpen,
  annotationCount,
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Auto-focus confirm button
      confirmBtnRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-modal-title"
      data-testid="replace-image-modal"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-left text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 id="replace-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Replace Current Screenshot?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              You currently have <strong className="text-amber-600 dark:text-amber-400 font-semibold">{annotationCount}</strong> active annotation{annotationCount === 1 ? '' : 's'} on this screenshot. Replacing the screenshot will discard existing annotations and reset the canvas.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            data-testid="replace-modal-cancel-btn"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm border border-slate-300 dark:border-slate-700 transition cursor-pointer active:scale-95"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            data-testid="replace-modal-confirm-btn"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm shadow-md transition cursor-pointer active:scale-95"
          >
            Replace & Clear Annotations
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReplaceImageModal;
