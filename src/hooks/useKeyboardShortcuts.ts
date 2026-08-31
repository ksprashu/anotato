import { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../state/AppContext';
import { ToolType } from '../types';

export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  if (
    target.isContentEditable ||
    target.contentEditable === 'true' ||
    target.getAttribute('contenteditable') === 'true' ||
    target.getAttribute('contenteditable') === ''
  ) {
    return true;
  }
  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox') {
    return true;
  }
  return false;
}

export const isInputElement = isEditableElement;

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  onFitToScreen?: () => void;
  onActualSize?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onToggleShortcutsModal?: () => void;
  onToggleTheme?: () => void;
  onDeleteSelected?: () => void;
  onCopyImage?: () => void | Promise<void>;
  onCopyNotes?: () => void | Promise<void>;
  targetElement?: HTMLElement | Window | null;
}

export interface UseKeyboardShortcutsReturn {
  isSpacePressed: boolean;
}

export function useKeyboardShortcuts(
  options: UseKeyboardShortcutsOptions = {}
): UseKeyboardShortcutsReturn {
  const { enabled = true, targetElement } = options;

  let state = null;
  let dispatch = (_action: any) => {};
  let undo = () => {};
  let redo = () => {};
  let canUndo = false;
  let canRedo = false;

  try {
    const app = useApp();
    state = app.state;
    dispatch = app.dispatch;
    undo = app.undo;
    redo = app.redo;
    canUndo = app.canUndo;
    canRedo = app.canRedo;
  } catch {
    // Graceful fallback
  }

  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target;
      const isInputFocused = isEditableElement(target);

      // Spacebar Pan Modifier
      if (e.code === 'Space' && !e.repeat) {
        if (!isInputFocused) {
          e.preventDefault();
          setIsSpacePressed(true);
        }
        return;
      }

      // If user is actively typing in an input/textarea, bypass all single-key shortcuts and shortcuts modal
      if (isInputFocused) {
        return;
      }

      const hasMetaOrCtrl = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // 1. Undo / Redo / Copy / Theme Shortcuts
      if (hasMetaOrCtrl) {
        // Redo: Cmd+Shift+Z or Ctrl+Shift+Z or Ctrl+Y
        if (
          (e.shiftKey && key === 'z') ||
          (!e.metaKey && e.ctrlKey && key === 'y')
        ) {
          e.preventDefault();
          if (canRedo) redo();
          return;
        }

        // Undo: Cmd+Z or Ctrl+Z (without shift)
        if (!e.shiftKey && key === 'z') {
          e.preventDefault();
          if (canUndo) undo();
          return;
        }

        // Copy Notes: Cmd+Shift+C or Ctrl+Shift+C
        if (e.shiftKey && key === 'c') {
          e.preventDefault();
          optionsRef.current.onCopyNotes?.();
          return;
        }

        // Copy Image: Cmd+C or Ctrl+C (without shift)
        if (!e.shiftKey && key === 'c') {
          let hasActiveSelection = false;
          if (typeof window !== 'undefined') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
              const inputEl = activeEl as HTMLInputElement | HTMLTextAreaElement;
              if (
                inputEl.selectionStart !== null &&
                inputEl.selectionEnd !== null &&
                inputEl.selectionStart !== inputEl.selectionEnd
              ) {
                hasActiveSelection = true;
              }
            } else {
              const selection = window.getSelection();
              if (selection && selection.toString().length > 0) {
                hasActiveSelection = true;
              }
            }
          }
          if (hasActiveSelection) {
            return;
          }
          e.preventDefault();
          optionsRef.current.onCopyImage?.();
          return;
        }

        // Toggle Theme: Cmd+D or Ctrl+D
        if (!e.shiftKey && key === 'd') {
          e.preventDefault();
          optionsRef.current.onToggleTheme?.();
          return;
        }

        return;
      }

      // 2. Delete / Backspace: Remove selected annotation
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedId = stateRef.current?.selectedAnnotationId;
        if (selectedId) {
          e.preventDefault();
          if (optionsRef.current.onDeleteSelected) {
            optionsRef.current.onDeleteSelected();
          } else {
            dispatch({ type: 'DELETE_ANNOTATION', payload: { id: selectedId } });
          }
        }
        return;
      }

      // 3. Escape: Deselect annotation or reset to Select tool
      if (e.key === 'Escape') {
        e.preventDefault();
        if (stateRef.current?.selectedAnnotationId) {
          dispatch({ type: 'SELECT_ANNOTATION', payload: null });
        } else if (stateRef.current?.activeTool !== 'select') {
          dispatch({ type: 'SET_ACTIVE_TOOL', payload: 'select' });
        }
        return;
      }

      // 4. Tool Switching Shortcuts (Single-letter keys)
      let nextTool: ToolType | null = null;
      switch (key) {
        case 'v':
          nextTool = 'select';
          break;
        case 'b':
        case 'r':
          nextTool = 'box';
          break;
        case 'c':
        case 'o':
          nextTool = 'ellipse';
          break;
        case 'a':
          nextTool = 'arrow';
          break;
        case 'p':
          nextTool = 'pin';
          break;
        case 'h':
          nextTool = 'pan';
          break;
        default:
          break;
      }

      if (nextTool !== null) {
        e.preventDefault();
        dispatch({ type: 'SET_ACTIVE_TOOL', payload: nextTool });
        return;
      }

      // 5. Navigation & Zoom & Help Shortcuts
      if (key === '0') {
        e.preventDefault();
        optionsRef.current.onFitToScreen?.();
      } else if (key === '1') {
        e.preventDefault();
        optionsRef.current.onActualSize?.();
      } else if (key === '+' || key === '=') {
        e.preventDefault();
        optionsRef.current.onZoomIn?.();
      } else if (key === '-' || key === '_') {
        e.preventDefault();
        optionsRef.current.onZoomOut?.();
      } else if (e.key === '?' || key === '?' || (e.shiftKey && (key === '/' || e.code === 'Slash'))) {
        e.preventDefault();
        optionsRef.current.onToggleShortcutsModal?.();
      }
    },
    [enabled, canUndo, canRedo, undo, redo, dispatch]
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      setIsSpacePressed(false);
    }
  }, []);

  const handleBlur = useCallback(() => {
    setIsSpacePressed(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const target = targetElement || window;
    target.addEventListener('keydown', handleKeyDown as EventListener);
    target.addEventListener('keyup', handleKeyUp as EventListener);
    window.addEventListener('blur', handleBlur);

    return () => {
      target.removeEventListener('keydown', handleKeyDown as EventListener);
      target.removeEventListener('keyup', handleKeyUp as EventListener);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled, targetElement, handleKeyDown, handleKeyUp, handleBlur]);

  return { isSpacePressed };
}

export default useKeyboardShortcuts;
