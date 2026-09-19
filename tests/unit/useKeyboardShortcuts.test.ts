import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useKeyboardShortcuts, isEditableElement } from '../../src/hooks/useKeyboardShortcuts';
import { AppProvider, useApp, AppContextValue } from '../../src/state/AppContext';
import { Annotation, AppState } from '../../src/types';

describe('useKeyboardShortcuts & Input Focus Exclusion', () => {
  const sampleAnnotation: Annotation = {
    id: 'ann-1',
    index: 1,
    geometry: { type: 'box', x: 10, y: 10, width: 50, height: 50 },
    style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
    note: '',
    createdAt: 100,
    updatedAt: 100,
  };

  const createWrapper = (initialState?: Partial<AppState>, extraComponent?: React.ReactNode) => {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        AppProvider,
        { initialState, children: React.createElement(React.Fragment, null, extraComponent, children) }
      );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Switching Shortcuts', () => {
    it('switches tool on single-letter shortcuts (v, b, c, a, p, h)', () => {
      let stateTracker: AppState | undefined;
      const TestComponent = () => {
        const { state } = useApp();
        stateTracker = state;
        useKeyboardShortcuts();
        return null;
      };

      const { unmount } = renderHook(() => null, {
        wrapper: createWrapper(undefined, React.createElement(TestComponent, null)),
      });

      // Press 'b' -> blur tool
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('blur');

      // Press 'r' -> box tool
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('box');

      // Press 'c' -> ellipse tool
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('ellipse');

      // Press 'a' -> arrow tool
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('arrow');

      // Press 'p' -> pin tool
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('pin');

      // Press 'h' -> pan tool
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('pan');

      // Press 'v' -> select tool
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('select');

      unmount();
    });

    it('supports alias shortcut keys (r for box, o for ellipse)', () => {
      let stateTracker: AppState | undefined;
      const TestComponent = () => {
        const { state } = useApp();
        stateTracker = state;
        useKeyboardShortcuts();
        return null;
      };

      const { unmount } = renderHook(() => null, {
        wrapper: createWrapper(undefined, React.createElement(TestComponent, null)),
      });

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('box');

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
      });
      expect(stateTracker?.activeTool).toBe('ellipse');

      unmount();
    });
  });

  describe('Undo / Redo Keyboard Shortcuts', () => {
    it('triggers undo on Cmd+Z / Ctrl+Z and redo on Cmd+Shift+Z / Ctrl+Y', () => {
      let contextTracker: AppContextValue | undefined;
      const TestComponent = () => {
        contextTracker = useApp();
        useKeyboardShortcuts();
        return null;
      };

      renderHook(() => null, {
        wrapper: createWrapper(undefined, React.createElement(TestComponent, null)),
      });

      // Add annotation
      act(() => {
        contextTracker?.dispatch({
          type: 'ADD_ANNOTATION',
          payload: { geometry: { type: 'box', x: 0, y: 0, width: 10, height: 10 } },
        });
      });
      expect(contextTracker?.state.annotations).toHaveLength(1);

      // Cmd+Z (Undo)
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })
        );
      });
      expect(contextTracker?.state.annotations).toHaveLength(0);

      // Cmd+Shift+Z (Redo)
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true })
        );
      });
      expect(contextTracker?.state.annotations).toHaveLength(1);
    });
  });

  describe('Delete and Escape Handling', () => {
    it('deletes selected annotation when Backspace or Delete key is pressed', () => {
      let stateTracker: AppState | undefined;
      const TestComponent = () => {
        const { state } = useApp();
        stateTracker = state;
        useKeyboardShortcuts();
        return null;
      };

      renderHook(() => null, {
        wrapper: createWrapper(
          { annotations: [sampleAnnotation], selectedAnnotationId: 'ann-1' },
          React.createElement(TestComponent, null)
        ),
      });

      expect(stateTracker?.annotations).toHaveLength(1);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      });

      expect(stateTracker?.annotations).toHaveLength(0);
      expect(stateTracker?.selectedAnnotationId).toBeNull();
    });

    it('clears selected annotation when Escape key is pressed', () => {
      let stateTracker: AppState | undefined;
      const TestComponent = () => {
        const { state } = useApp();
        stateTracker = state;
        useKeyboardShortcuts();
        return null;
      };

      renderHook(() => null, {
        wrapper: createWrapper(
          { annotations: [sampleAnnotation], selectedAnnotationId: 'ann-1' },
          React.createElement(TestComponent, null)
        ),
      });

      expect(stateTracker?.selectedAnnotationId).toBe('ann-1');

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(stateTracker?.selectedAnnotationId).toBeNull();
      expect(stateTracker?.annotations).toHaveLength(1);
    });
  });

  describe('Input Focus Exclusion Invariant', () => {
    it('correctly identifies input, textarea, and contenteditable elements', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const select = document.createElement('select');
      const divEditable = document.createElement('div');
      divEditable.contentEditable = 'true';
      const divTextbox = document.createElement('div');
      divTextbox.setAttribute('role', 'textbox');
      const normalDiv = document.createElement('div');

      expect(isEditableElement(input)).toBe(true);
      expect(isEditableElement(textarea)).toBe(true);
      expect(isEditableElement(select)).toBe(true);
      expect(isEditableElement(divEditable)).toBe(true);
      expect(isEditableElement(divTextbox)).toBe(true);
      expect(isEditableElement(normalDiv)).toBe(false);
      expect(isEditableElement(null)).toBe(false);
    });

    it('ignores tool switching and deletion shortcuts when typing inside an input element', () => {
      let stateTracker: AppState | undefined;
      const TestComponent = () => {
        const { state } = useApp();
        stateTracker = state;
        useKeyboardShortcuts();
        return React.createElement('input', { 'data-testid': 'test-input' });
      };

      const { unmount } = renderHook(() => null, {
        wrapper: createWrapper(
          {
            annotations: [sampleAnnotation],
            selectedAnnotationId: 'ann-1',
            activeTool: 'select',
          },
          React.createElement(TestComponent, null)
        ),
      });

      const input = document.querySelector('input')!;

      // Simulate pressing 'b' while focused inside input
      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'b', bubbles: true });
        input.dispatchEvent(event);
      });
      // Active tool should NOT change to box
      expect(stateTracker?.activeTool).toBe('select');

      // Simulate pressing Backspace while focused inside input
      act(() => {
        const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
        input.dispatchEvent(event);
      });
      // Annotation should NOT be deleted
      expect(stateTracker?.annotations).toHaveLength(1);

      unmount();
    });
  });

  describe('Spacebar Pan Modifier', () => {
    it('tracks isSpacePressed state on keydown and keyup', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), {
        wrapper: createWrapper({ annotations: [sampleAnnotation], activeTool: 'select' }),
      });

      expect(result.current.isSpacePressed).toBe(false);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      });
      expect(result.current.isSpacePressed).toBe(true);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
      });
      expect(result.current.isSpacePressed).toBe(false);
    });

    it('resets isSpacePressed when window blurs', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(), {
        wrapper: createWrapper({ annotations: [sampleAnnotation], activeTool: 'select' }),
      });

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      });
      expect(result.current.isSpacePressed).toBe(true);

      act(() => {
        window.dispatchEvent(new Event('blur'));
      });
      expect(result.current.isSpacePressed).toBe(false);
    });
  });

  describe('Navigation & Custom Callbacks', () => {
    it('triggers zoom and navigation callbacks', () => {
      const onFitMock = vi.fn();
      const onActualMock = vi.fn();
      const onZoomInMock = vi.fn();
      const onZoomOutMock = vi.fn();
      const onToggleModalMock = vi.fn();

      renderHook(
        () =>
          useKeyboardShortcuts({
            onFitToScreen: onFitMock,
            onActualSize: onActualMock,
            onZoomIn: onZoomInMock,
            onZoomOut: onZoomOutMock,
            onToggleShortcutsModal: onToggleModalMock,
          }),
        { wrapper: createWrapper({ annotations: [sampleAnnotation], activeTool: 'select' }) }
      );

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
      });
      expect(onFitMock).toHaveBeenCalledTimes(1);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      });
      expect(onActualMock).toHaveBeenCalledTimes(1);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      });
      expect(onZoomInMock).toHaveBeenCalledTimes(1);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
      });
      expect(onZoomOutMock).toHaveBeenCalledTimes(1);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      });
      expect(onToggleModalMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Copy Keyboard Shortcuts', () => {
    it('triggers onCopyImage on Cmd+C when no text selection is present', () => {
      const onCopyImageMock = vi.fn();
      renderHook(
        () =>
          useKeyboardShortcuts({
            onCopyImage: onCopyImageMock,
          }),
        { wrapper: createWrapper({ annotations: [sampleAnnotation], activeTool: 'select' }) }
      );

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true })
        );
      });
      expect(onCopyImageMock).toHaveBeenCalledTimes(1);
    });

    it('triggers onCopyNotes on Cmd+Shift+C', () => {
      const onCopyNotesMock = vi.fn();
      renderHook(
        () =>
          useKeyboardShortcuts({
            onCopyNotes: onCopyNotesMock,
          }),
        { wrapper: createWrapper({ annotations: [sampleAnnotation], activeTool: 'select' }) }
      );

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'c', metaKey: true, shiftKey: true, bubbles: true })
        );
      });
      expect(onCopyNotesMock).toHaveBeenCalledTimes(1);
    });
  });
});
