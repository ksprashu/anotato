import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ReplaceImageModalProps {
  isOpen: boolean;
  annotationCount: number;
  /** Primary callback: Replaces base image, completely purges annotations and notes */
  onReplaceClear?: () => void;
  /** Callback: Replaces base image, retains existing annotations and notes in place */
  onReplaceKeep?: () => void;
  /** Callback: Adds new image as an overlay layer without replacing base image or wiping annotations */
  onAddLayer?: () => void;
  /** Synonyms for compatibility with varying dispatch naming contracts */
  onReplaceAndClear?: () => void;
  onReplaceAndKeep?: () => void;
  onAddAsLayer?: () => void;
  /** Legacy alias for onReplaceClear */
  onConfirm?: () => void;
  /** Dismisses modal without making any changes */
  onCancel: () => void;
}

export const ReplaceImageModal: React.FC<ReplaceImageModalProps> = ({
  isOpen,
  annotationCount,
  onReplaceClear,
  onReplaceKeep,
  onAddLayer,
  onReplaceAndClear,
  onReplaceAndKeep,
  onAddAsLayer,
  onConfirm,
  onCancel,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const handleReplaceClear = onReplaceClear || onReplaceAndClear || onConfirm || (() => {});
  const handleReplaceKeep = onReplaceKeep || onReplaceAndKeep || (() => {});
  const handleAddLayer = onAddLayer || onAddAsLayer || (() => {});

  useEffect(() => {
    if (!isOpen) return;

    // Auto-focus primary confirm button
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter') {
        // If focus is on an explicit button in the modal, let natural button activation handle it
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
          return;
        }
        e.preventDefault();
        handleReplaceClear();
        return;
      }
      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel, handleReplaceClear]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-modal-title"
      aria-describedby="replace-modal-description"
      data-testid="replace-image-modal"
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-left text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h2 id="replace-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Replace Current Screenshot?
            </h2>
            <p id="replace-modal-description" className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              You currently have{' '}
              <strong className="text-amber-600 dark:text-amber-400 font-semibold">
                {annotationCount}
              </strong>{' '}
              active annotation{annotationCount === 1 ? '' : 's'} on this screenshot. Choose how you would like to proceed with the newly pasted image:
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          {/* Action buttons: Add as Layer, Replace & Keep, Replace & Clear */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              data-testid="replace-modal-add-layer-btn"
              onClick={handleAddLayer}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-md transition cursor-pointer active:scale-95 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              <span data-testid="add-layer-btn">Add as Layer / Overlay</span>
            </button>

            <button
              type="button"
              data-testid="replace-modal-replace-keep-btn"
              onClick={handleReplaceKeep}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium text-sm border border-slate-300 dark:border-slate-700 shadow-sm transition cursor-pointer active:scale-95 text-center focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              <span data-testid="replace-keep-btn">Replace & Keep Annotations</span>
            </button>

            <button
              ref={confirmBtnRef}
              type="button"
              data-testid="replace-modal-confirm-btn"
              onClick={handleReplaceClear}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm shadow-md transition cursor-pointer active:scale-95 text-center focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              <span data-testid="replace-modal-replace-clear-btn">Replace & Clear Annotations</span>
            </button>
          </div>

          {/* Cancel button */}
          <div className="flex justify-end pt-1 border-t border-slate-100 dark:border-slate-800/60">
            <button
              type="button"
              data-testid="replace-modal-cancel-btn"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReplaceImageModal;
