import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useApp } from '../../state/AppContext';

export interface HistoryControlsProps {
  className?: string;
  onUndo?: () => void;
  onRedo?: () => void;
  disabled?: boolean;
}

export const HistoryControls: React.FC<HistoryControlsProps> = ({
  className = '',
  onUndo,
  onRedo,
  disabled = false,
}) => {
  let canUndo = false;
  let canRedo = false;
  let undo = () => {};
  let redo = () => {};
  let pastCount = 0;
  let futureCount = 0;

  try {
    const app = useApp();
    canUndo = app.canUndo;
    canRedo = app.canRedo;
    undo = app.undo;
    redo = app.redo;
    pastCount = app.history.past.length;
    futureCount = app.history.future.length;
  } catch {
    // Rendered outside AppProvider in isolated unit tests
  }

  const isUndoDisabled = disabled || !canUndo;
  const isRedoDisabled = disabled || !canRedo;

  const handleUndo = () => {
    if (isUndoDisabled) return;
    if (onUndo) {
      onUndo();
    } else {
      undo();
    }
  };

  const handleRedo = () => {
    if (isRedoDisabled) return;
    if (onRedo) {
      onRedo();
    } else {
      redo();
    }
  };

  return (
    <div
      className={`flex items-center gap-1 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-lg p-1 text-slate-700 dark:text-slate-200 shadow-sm select-none ${className}`}
      role="toolbar"
      aria-label="History actions"
      data-testid="history-controls-toolbar"
    >
      {/* Undo Button */}
      <button
        type="button"
        onClick={handleUndo}
        disabled={isUndoDisabled}
        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white active:scale-95 cursor-pointer"
        title={pastCount > 0 ? `Undo (⌘Z) — ${pastCount} step${pastCount > 1 ? 's' : ''}` : 'Undo (⌘Z)'}
        aria-label="Undo last action"
        data-testid="undo-btn"
      >
        <Undo2 className="w-4 h-4" />
      </button>

      {/* Redo Button */}
      <button
        type="button"
        onClick={handleRedo}
        disabled={isRedoDisabled}
        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white active:scale-95 cursor-pointer"
        title={futureCount > 0 ? `Redo (⌘⇧Z) — ${futureCount} step${futureCount > 1 ? 's' : ''}` : 'Redo (⌘⇧Z)'}
        aria-label="Redo last undone action"
        data-testid="redo-btn"
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default HistoryControls;
