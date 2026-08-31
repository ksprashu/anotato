import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { useKeyboardShortcuts, isEditableElement, UseKeyboardShortcutsReturn } from '../../src/hooks/useKeyboardShortcuts';
import { ColorPalette } from '../../src/components/toolbar/ColorPalette';
import { HistoryControls } from '../../src/components/toolbar/HistoryControls';
import { AppProvider, useApp, AppContextValue } from '../../src/state/AppContext';
import { MAX_HISTORY_STEPS } from '../../src/state/historyManager';
import { Annotation, AppState, PresetColor, AnnotationGeometry, BoxGeometry } from '../../src/types';

describe('Milestone 3 Challenger 2: Adversarial Stress Test Suite', () => {
  function makeAnnotation(id: string, index: number, color: PresetColor = 'amber', strokeWidth = 3, fillOpacity = 0.15): Annotation {
    return {
      id,
      index,
      geometry: { type: 'box', x: index * 10, y: index * 10, width: 50, height: 50 },
      style: { color, strokeWidth, fillOpacity },
      note: `Note ${index}`,
      createdAt: 1000 + index,
      updatedAt: 1000 + index,
    };
  }

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

  /* ========================================================================
   * 1. RAPID BURSTS OF 100+ UNDO / REDO CYCLES & HISTORY STACK INTEGRITY
   * ======================================================================== */
  describe('Rapid Bursts of 100+ Undo / Redo Cycles & History Invariants', () => {
    it('handles 100 sequential additions followed by 100 rapid undos and 100 redos in React state', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        useKeyboardShortcuts();
        return null;
      };

      const { unmount } = renderHook(() => null, {
        wrapper: createWrapper(undefined, React.createElement(TestComponent, null)),
      });

      expect(ctx).toBeDefined();

      // 1. Dispatch 100 shape additions
      for (let i = 1; i <= 100; i++) {
        act(() => {
          ctx!.dispatch({
            type: 'ADD_ANNOTATION',
            payload: {
              id: `shape_${i}`,
              geometry: { type: 'box', x: i, y: i, width: 20, height: 20 },
              style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            },
          });
        });
      }

      expect(ctx!.state.annotations).toHaveLength(100);
      expect(ctx!.history.past.length).toBe(MAX_HISTORY_STEPS); // Capped at 50

      // 2. Perform 100 rapid undos
      for (let u = 1; u <= 100; u++) {
        act(() => {
          ctx!.undo();
        });
      }

      // Past stack is 50, so undoing 50 times rolls back 50 annotations (from 100 down to 50)
      expect(ctx!.state.annotations).toHaveLength(50);
      expect(ctx!.canUndo).toBe(false);
      expect(ctx!.canRedo).toBe(true);
      expect(ctx!.history.past).toHaveLength(0);
      expect(ctx!.history.future).toHaveLength(50);

      // Verify sequence index 1..50 invariant
      ctx!.state.annotations.forEach((ann, idx) => {
        expect(ann.index).toBe(idx + 1);
        expect(ann.id).toBe(`shape_${idx + 1}`);
      });

      // 3. Perform 100 rapid redos
      for (let r = 1; r <= 100; r++) {
        act(() => {
          ctx!.redo();
        });
      }

      // Redone back to 100
      expect(ctx!.state.annotations).toHaveLength(100);
      expect(ctx!.canUndo).toBe(true);
      expect(ctx!.canRedo).toBe(false);
      expect(ctx!.history.future).toHaveLength(0);
      expect(ctx!.history.past).toHaveLength(50);

      // Verify sequence index 1..100 invariant
      ctx!.state.annotations.forEach((ann, idx) => {
        expect(ann.index).toBe(idx + 1);
        expect(ann.id).toBe(`shape_${idx + 1}`);
      });

      unmount();
    });

    it('survives 200 high-frequency alternating Undo/Redo oscillations without stack drift or memory corruption', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        return null;
      };

      const { unmount } = renderHook(() => null, {
        wrapper: createWrapper(undefined, React.createElement(TestComponent, null)),
      });

      // Add 2 annotations
      act(() => {
        ctx!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: { id: 'box1', geometry: { type: 'box', x: 10, y: 10, width: 20, height: 20 } },
        });
      });
      act(() => {
        ctx!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: { id: 'box2', geometry: { type: 'box', x: 30, y: 30, width: 20, height: 20 } },
        });
      });

      expect(ctx!.state.annotations).toHaveLength(2);

      // Oscillate 200 times: Undo -> Redo
      for (let i = 0; i < 200; i++) {
        act(() => {
          ctx!.undo();
        });
        expect(ctx!.state.annotations).toHaveLength(1);
        expect(ctx!.state.annotations[0].id).toBe('box1');

        act(() => {
          ctx!.redo();
        });
        expect(ctx!.state.annotations).toHaveLength(2);
        expect(ctx!.state.annotations[1].id).toBe('box2');
      }

      expect(ctx!.state.annotations).toHaveLength(2);
      expect(ctx!.state.annotations[0].index).toBe(1);
      expect(ctx!.state.annotations[1].index).toBe(2);

      unmount();
    });

    it('wipes redo stack cleanly on branched action after undo sequence', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        return null;
      };

      const { unmount } = renderHook(() => null, {
        wrapper: createWrapper(undefined, React.createElement(TestComponent, null)),
      });

      // Add 5 annotations
      for (let i = 1; i <= 5; i++) {
        act(() => {
          ctx!.dispatch({
            type: 'ADD_ANNOTATION',
            payload: { id: `ann_${i}`, geometry: { type: 'box', x: i, y: i, width: 10, height: 10 } },
          });
        });
      }

      // Undo 3 times
      act(() => ctx!.undo());
      act(() => ctx!.undo());
      act(() => ctx!.undo());
      expect(ctx!.state.annotations).toHaveLength(2);
      expect(ctx!.canRedo).toBe(true);
      expect(ctx!.history.future).toHaveLength(3);

      // Branching: add a new annotation
      act(() => {
        ctx!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: { id: 'branched_box', geometry: { type: 'box', x: 99, y: 99, width: 10, height: 10 } },
        });
      });

      // Redo must now be completely wiped
      expect(ctx!.state.annotations).toHaveLength(3);
      expect(ctx!.canRedo).toBe(false);
      expect(ctx!.history.future).toHaveLength(0);
      expect(ctx!.state.annotations[2].id).toBe('branched_box');
      expect(ctx!.state.annotations[2].index).toBe(3);

      unmount();
    });
  });

  /* ========================================================================
   * 2. COLOR PALETTE & STYLING MUTATIONS ACROSS MULTIPLE SELECTED SHAPES
   * ======================================================================== */
  describe('ColorPalette & Styling Mutations Across Multiple Selected Shapes', () => {
    it('mutates styles independently across multiple distinct shapes without cross-contamination', async () => {
      const user = userEvent.setup();

      const initialAnnotations: Annotation[] = [
        makeAnnotation('shape-1', 1, 'amber', 3, 0.15),
        makeAnnotation('shape-2', 2, 'amber', 3, 0.15),
        makeAnnotation('shape-3', 3, 'amber', 3, 0.15),
        makeAnnotation('shape-4', 4, 'amber', 3, 0.15),
        makeAnnotation('shape-5', 5, 'amber', 3, 0.15),
      ];

      let ctx: AppContextValue | undefined;
      const TestContainer = () => {
        ctx = useApp();
        return <ColorPalette />;
      };

      render(
        <AppProvider initialState={{ annotations: initialAnnotations, selectedAnnotationId: 'shape-1' }}>
          <TestContainer />
        </AppProvider>
      );

      // 1. Mutate Shape 1 -> Red, 6px, 50%
      await user.click(screen.getByTestId('color-btn-red'));
      await user.click(screen.getByTestId('stroke-btn-6'));
      await user.click(screen.getByTestId('opacity-btn-50'));

      expect(ctx!.state.annotations[0].style).toEqual({ color: 'red', strokeWidth: 6, fillOpacity: 0.5 });
      // Other shapes remain untouched
      expect(ctx!.state.annotations[1].style).toEqual({ color: 'amber', strokeWidth: 3, fillOpacity: 0.15 });

      // 2. Select Shape 2 -> Mutate to Cyan, 2px, 0%
      act(() => {
        ctx!.dispatch({ type: 'SELECT_ANNOTATION', payload: 'shape-2' });
      });
      await user.click(screen.getByTestId('color-btn-cyan'));
      await user.click(screen.getByTestId('stroke-btn-2'));
      await user.click(screen.getByTestId('opacity-btn-0'));

      expect(ctx!.state.annotations[1].style).toEqual({ color: 'cyan', strokeWidth: 2, fillOpacity: 0 });
      expect(ctx!.state.annotations[0].style).toEqual({ color: 'red', strokeWidth: 6, fillOpacity: 0.5 });

      // 3. Select Shape 3 -> Mutate to Purple, 4px, 30%
      act(() => {
        ctx!.dispatch({ type: 'SELECT_ANNOTATION', payload: 'shape-3' });
      });
      await user.click(screen.getByTestId('color-btn-purple'));
      await user.click(screen.getByTestId('stroke-btn-4'));
      await user.click(screen.getByTestId('opacity-btn-30'));

      expect(ctx!.state.annotations[2].style).toEqual({ color: 'purple', strokeWidth: 4, fillOpacity: 0.3 });

      // 4. Select Shape 4 -> Mutate to Green, 6px, 15%
      act(() => {
        ctx!.dispatch({ type: 'SELECT_ANNOTATION', payload: 'shape-4' });
      });
      await user.click(screen.getByTestId('color-btn-green'));
      await user.click(screen.getByTestId('stroke-btn-6'));
      await user.click(screen.getByTestId('opacity-btn-15'));

      expect(ctx!.state.annotations[3].style).toEqual({ color: 'green', strokeWidth: 6, fillOpacity: 0.15 });

      // 5. Select Shape 5 -> remains Amber, 3px, 15%
      act(() => {
        ctx!.dispatch({ type: 'SELECT_ANNOTATION', payload: 'shape-5' });
      });
      expect(screen.getByTestId('color-btn-amber')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('stroke-btn-4')).toHaveAttribute('aria-checked', 'false');

      // Verify all 5 shapes maintain exact unique styling
      expect(ctx!.state.annotations[0].style).toEqual({ color: 'red', strokeWidth: 6, fillOpacity: 0.5 });
      expect(ctx!.state.annotations[1].style).toEqual({ color: 'cyan', strokeWidth: 2, fillOpacity: 0 });
      expect(ctx!.state.annotations[2].style).toEqual({ color: 'purple', strokeWidth: 4, fillOpacity: 0.3 });
      expect(ctx!.state.annotations[3].style).toEqual({ color: 'green', strokeWidth: 6, fillOpacity: 0.15 });
      expect(ctx!.state.annotations[4].style).toEqual({ color: 'amber', strokeWidth: 3, fillOpacity: 0.15 });
    });

    it('updates global active creation defaults when no annotation is selected without altering existing shapes', async () => {
      const user = userEvent.setup();
      const initialAnnotations: Annotation[] = [
        makeAnnotation('shape-1', 1, 'amber', 3, 0.15),
        makeAnnotation('shape-2', 2, 'green', 4, 0.3),
      ];

      let ctx: AppContextValue | undefined;
      const TestContainer = () => {
        ctx = useApp();
        return <ColorPalette />;
      };

      render(
        <AppProvider initialState={{ annotations: initialAnnotations, selectedAnnotationId: null }}>
          <TestContainer />
        </AppProvider>
      );

      // Change creation defaults to Purple, 6px, 50%
      await user.click(screen.getByTestId('color-btn-purple'));
      await user.click(screen.getByTestId('stroke-btn-6'));
      await user.click(screen.getByTestId('opacity-btn-50'));

      expect(ctx!.state.activeColor).toBe('purple');
      expect(ctx!.state.activeStrokeWidth).toBe(6);
      expect(ctx!.state.activeFillOpacity).toBe(0.5);

      // Existing annotations must remain unchanged!
      expect(ctx!.state.annotations[0].style).toEqual({ color: 'amber', strokeWidth: 3, fillOpacity: 0.15 });
      expect(ctx!.state.annotations[1].style).toEqual({ color: 'green', strokeWidth: 4, fillOpacity: 0.3 });

      // Creating a new annotation should now inherit new active defaults
      act(() => {
        ctx!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: { geometry: { type: 'box', x: 0, y: 0, width: 20, height: 20 } },
        });
      });

      expect(ctx!.state.annotations[2].style).toEqual({ color: 'purple', strokeWidth: 6, fillOpacity: 0.5 });
    });
  });

  /* ========================================================================
   * 3. DELETE KEY, BACKSPACE & ESCAPE DESELECT SEMANTICS
   * ======================================================================== */
  describe('Delete Key, Backspace & Escape Deselect Semantics', () => {
    it('deletes selected annotation, clears selection, and reindexes remaining shapes 1..N', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        useKeyboardShortcuts();
        return null;
      };

      const initialAnnotations: Annotation[] = [
        makeAnnotation('a1', 1),
        makeAnnotation('a2', 2),
        makeAnnotation('a3', 3),
        makeAnnotation('a4', 4),
        makeAnnotation('a5', 5),
      ];

      renderHook(() => null, {
        wrapper: createWrapper(
          { annotations: initialAnnotations, selectedAnnotationId: 'a3' },
          React.createElement(TestComponent, null)
        ),
      });

      expect(ctx!.state.selectedAnnotationId).toBe('a3');

      // Press Delete key
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      });

      // a3 removed, remaining 4 reindexed 1..4
      expect(ctx!.state.annotations).toHaveLength(4);
      expect(ctx!.state.selectedAnnotationId).toBeNull();
      expect(ctx!.state.annotations.map((a) => a.id)).toEqual(['a1', 'a2', 'a4', 'a5']);
      expect(ctx!.state.annotations.map((a) => a.index)).toEqual([1, 2, 3, 4]);

      // Press Delete again when nothing is selected -> Safe no-op
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      });
      expect(ctx!.state.annotations).toHaveLength(4);
      expect(ctx!.state.selectedAnnotationId).toBeNull();
    });

    it('handles Backspace deletion safely down to 0 annotations and survives repeated keypresses', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        useKeyboardShortcuts();
        return null;
      };

      const initialAnnotations: Annotation[] = [
        makeAnnotation('a1', 1),
        makeAnnotation('a2', 2),
      ];

      renderHook(() => null, {
        wrapper: createWrapper(
          { annotations: initialAnnotations, selectedAnnotationId: 'a1' },
          React.createElement(TestComponent, null)
        ),
      });

      // Delete a1
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      });
      expect(ctx!.state.annotations).toHaveLength(1);
      expect(ctx!.state.annotations[0].id).toBe('a2');
      expect(ctx!.state.annotations[0].index).toBe(1);

      // Select remaining a2
      act(() => {
        ctx!.dispatch({ type: 'SELECT_ANNOTATION', payload: 'a2' });
      });

      // Delete a2
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      });
      expect(ctx!.state.annotations).toHaveLength(0);
      expect(ctx!.state.selectedAnnotationId).toBeNull();

      // Press Backspace 50 times on empty canvas -> safe no-op
      for (let i = 0; i < 50; i++) {
        act(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
        });
      }
      expect(ctx!.state.annotations).toHaveLength(0);
      expect(ctx!.state.selectedAnnotationId).toBeNull();
    });

    it('clears selection on Escape, and resets activeTool to select if nothing selected', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        useKeyboardShortcuts();
        return null;
      };

      renderHook(() => null, {
        wrapper: createWrapper(
          {
            annotations: [makeAnnotation('a1', 1)],
            selectedAnnotationId: 'a1',
            activeTool: 'box',
          },
          React.createElement(TestComponent, null)
        ),
      });

      expect(ctx!.state.selectedAnnotationId).toBe('a1');
      expect(ctx!.state.activeTool).toBe('box');

      // 1. Escape with selection -> clears selection, retains activeTool 'box'
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(ctx!.state.selectedAnnotationId).toBeNull();
      expect(ctx!.state.activeTool).toBe('box');

      // 2. Escape without selection -> resets activeTool to 'select'
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(ctx!.state.activeTool).toBe('select');

      // 3. Escape again -> safe no-op
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(ctx!.state.activeTool).toBe('select');
    });
  });

  /* ========================================================================
   * 4. INPUT FOCUS ISOLATION & EDITABLE ELEMENT EXCLUSION
   * ======================================================================== */
  describe('Input Focus Isolation & Editable Element Protection', () => {
    it('strictly isolates all tool shortcuts, delete keys, and spacebar when typing in input, textarea, select, contenteditable, and role=textbox', () => {
      let ctx: AppContextValue | undefined;
      let hookReturn: UseKeyboardShortcutsReturn | undefined;

      const TestHost = () => {
        ctx = useApp();
        hookReturn = useKeyboardShortcuts();
        return (
          <div>
            <input data-testid="inp-text" type="text" defaultValue="test" />
            <input data-testid="inp-number" type="number" defaultValue="42" />
            <input data-testid="inp-search" type="search" defaultValue="query" />
            <textarea data-testid="txt-area" defaultValue="markdown note text" />
            <select data-testid="sel-elem"><option value="1">1</option></select>
            <div data-testid="div-editable" contentEditable="true">editable text</div>
            <div data-testid="div-textbox" role="textbox">textbox text</div>
            <div data-testid="div-searchbox" role="searchbox">searchbox text</div>
          </div>
        );
      };

      render(
        <AppProvider
          initialState={{
            annotations: [makeAnnotation('a1', 1)],
            selectedAnnotationId: 'a1',
            activeTool: 'select',
          }}
        >
          <TestHost />
        </AppProvider>
      );

      const editableTestIds = [
        'inp-text',
        'inp-number',
        'inp-search',
        'txt-area',
        'sel-elem',
        'div-editable',
        'div-textbox',
        'div-searchbox',
      ];

      const shortcutKeys = ['v', 'b', 'r', 'c', 'o', 'a', 'p', 'h', '0', '1', '+', '-', '?', 'Delete', 'Backspace'];

      for (const testId of editableTestIds) {
        const elem = screen.getByTestId(testId);

        // Verify isEditableElement returns true
        expect(isEditableElement(elem)).toBe(true);

        // Try all tool and action keys while focused on this editable element
        for (const key of shortcutKeys) {
          act(() => {
            const ev = new KeyboardEvent('keydown', { key, bubbles: true });
            elem.dispatchEvent(ev);
          });

          // State must NOT change: tool stays select, annotation not deleted!
          expect(ctx!.state.activeTool).toBe('select');
          expect(ctx!.state.annotations).toHaveLength(1);
          expect(ctx!.state.selectedAnnotationId).toBe('a1');
        }

        // Try Spacebar while focused on editable element
        act(() => {
          const ev = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
          elem.dispatchEvent(ev);
        });
        expect(hookReturn!.isSpacePressed).toBe(false);
      }
    });

    it('does not trigger tool switching on meta/ctrl shortcut combos (e.g. Cmd+B, Cmd+A, Cmd+C, Cmd+V)', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        useKeyboardShortcuts();
        return null;
      };

      renderHook(() => null, {
        wrapper: createWrapper({ activeTool: 'select' }, React.createElement(TestComponent, null)),
      });

      expect(ctx!.state.activeTool).toBe('select');

      // Cmd+B (Bold)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }));
      });
      expect(ctx!.state.activeTool).toBe('select');

      // Cmd+A (Select All)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true }));
      });
      expect(ctx!.state.activeTool).toBe('select');

      // Ctrl+C (Copy)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      });
      expect(ctx!.state.activeTool).toBe('select');

      // Ctrl+P (Print / shortcut)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }));
      });
      expect(ctx!.state.activeTool).toBe('select');
    });
  });

  /* ========================================================================
   * 5. HIGH-VELOCITY RANDOMIZED FUZZER & INVARIANT CHECKER (500 ACTIONS)
   * ======================================================================== */
  describe('High-Velocity Fuzzer & Invariant Checker (500 Operations)', () => {
    it('preserves all invariants across 500 randomized CRUD, styling, reorder, undo, and redo operations', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        return null;
      };

      const { unmount } = renderHook(() => null, {
        wrapper: createWrapper(undefined, React.createElement(TestComponent, null)),
      });

      const colors: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];
      const strokeWidths = [2, 4, 6];
      const opacities = [0, 0.15, 0.3, 0.5];

      // Run 500 randomized operations
      for (let step = 0; step < 500; step++) {
        const actionChoice = Math.floor(Math.random() * 8);

        act(() => {
          if (actionChoice === 0 || ctx!.state.annotations.length === 0) {
            // 1. ADD_ANNOTATION (Box, Ellipse, Arrow, or Pin)
            const typeChoice = ['box', 'ellipse', 'arrow', 'pin'][Math.floor(Math.random() * 4)];
            let geo: AnnotationGeometry;
            if (typeChoice === 'box') {
              geo = { type: 'box', x: Math.random() * 500, y: Math.random() * 500, width: Math.random() * 100, height: Math.random() * 100 };
            } else if (typeChoice === 'ellipse') {
              geo = { type: 'ellipse', cx: Math.random() * 500, cy: Math.random() * 500, rx: Math.random() * 50, ry: Math.random() * 50 };
            } else if (typeChoice === 'arrow') {
              geo = { type: 'arrow', startX: Math.random() * 500, startY: Math.random() * 500, endX: Math.random() * 500, endY: Math.random() * 500 };
            } else {
              geo = { type: 'pin', x: Math.random() * 500, y: Math.random() * 500 };
            }

            ctx!.dispatch({
              type: 'ADD_ANNOTATION',
              payload: {
                geometry: geo,
                style: {
                  color: colors[Math.floor(Math.random() * colors.length)],
                  strokeWidth: strokeWidths[Math.floor(Math.random() * strokeWidths.length)],
                  fillOpacity: opacities[Math.floor(Math.random() * opacities.length)],
                },
              },
            });
          } else if (actionChoice === 1 && ctx!.canUndo) {
            // 2. UNDO
            ctx!.undo();
          } else if (actionChoice === 2 && ctx!.canRedo) {
            // 3. REDO
            ctx!.redo();
          } else if (actionChoice === 3) {
            // 4. SELECT_ANNOTATION
            const randomIdx = Math.floor(Math.random() * ctx!.state.annotations.length);
            const targetId = ctx!.state.annotations[randomIdx]?.id ?? null;
            ctx!.dispatch({ type: 'SELECT_ANNOTATION', payload: targetId });
          } else if (actionChoice === 4 && ctx!.state.selectedAnnotationId) {
            // 5. DELETE_ANNOTATION
            ctx!.dispatch({ type: 'DELETE_ANNOTATION', payload: { id: ctx!.state.selectedAnnotationId } });
          } else if (actionChoice === 5 && ctx!.state.selectedAnnotationId) {
            // 6. UPDATE_ANNOTATION_STYLE
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            const randomStroke = strokeWidths[Math.floor(Math.random() * strokeWidths.length)];
            const randomOpacity = opacities[Math.floor(Math.random() * opacities.length)];
            ctx!.dispatch({
              type: 'SET_ACTIVE_COLOR',
              payload: randomColor,
            });
            ctx!.dispatch({
              type: 'SET_ACTIVE_STROKE_WIDTH',
              payload: randomStroke,
            });
            ctx!.dispatch({
              type: 'SET_ACTIVE_FILL_OPACITY',
              payload: randomOpacity,
            });
          } else if (actionChoice === 6 && ctx!.state.annotations.length >= 2) {
            // 7. REORDER_ANNOTATIONS
            const from = Math.floor(Math.random() * ctx!.state.annotations.length);
            const to = Math.floor(Math.random() * ctx!.state.annotations.length);
            ctx!.dispatch({ type: 'REORDER_ANNOTATIONS', payload: { fromIndex: from, toIndex: to } });
          } else {
            // 8. UPDATE_ANNOTATION_NOTE
            if (ctx!.state.annotations.length > 0) {
              const target = ctx!.state.annotations[Math.floor(Math.random() * ctx!.state.annotations.length)];
              ctx!.dispatch({ type: 'UPDATE_ANNOTATION_NOTE', payload: { id: target.id, note: `Fuzz Note #${step}` } });
            }
          }
        });

        // ================= INVARIANT VERIFICATIONS =================
        const { annotations, selectedAnnotationId } = ctx!.state;

        // Invariant 1: Continuous 1..N index sequence
        annotations.forEach((ann, idx) => {
          expect(ann.index).toBe(idx + 1);
          expect(typeof ann.id).toBe('string');
          expect(ann.id.length).toBeGreaterThan(0);
        });

        // Invariant 2: Selection validity
        if (selectedAnnotationId !== null) {
          const found = annotations.some((a) => a.id === selectedAnnotationId);
          expect(found).toBe(true);
        }

        // Invariant 3: History boundaries
        expect(ctx!.history.past.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
        expect(ctx!.canUndo).toBe(ctx!.history.past.length > 0);
        expect(ctx!.canRedo).toBe(ctx!.history.future.length > 0);
      }

      unmount();
    });
  });

  /* ========================================================================
   * 6. TRANSACTION MANAGER GESTURE INVARIANTS & MICRO-MOVEMENTS
   * ======================================================================== */
  describe('TransactionManager Gesture Invariants & Micro-Movements', () => {
    it('correctly batches 100 distinct micro-gestures and deduplicates zero-net changes', () => {
      let ctx: AppContextValue | undefined;
      const TestComponent = () => {
        ctx = useApp();
        return null;
      };

      const { unmount } = renderHook(() => null, {
        wrapper: createWrapper(undefined, React.createElement(TestComponent, null)),
      });

      // Add base annotation
      act(() => {
        ctx!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: { id: 'box-tx', geometry: { type: 'box', x: 50, y: 50, width: 100, height: 100 } },
        });
      });

      const initialPastCount = ctx!.history.past.length;

      // 1. Gesture that moves and returns to EXACT start position -> 0 net change
      act(() => {
        ctx!.txManager.beginTransaction({
          annotations: ctx!.state.annotations,
          selectedAnnotationId: ctx!.state.selectedAnnotationId,
        });
      });
      expect(ctx!.txManager.isTransactionActive()).toBe(true);

      // Transient moves
      for (let i = 1; i <= 20; i++) {
        act(() => {
          ctx!.dispatch({
            type: 'UPDATE_ANNOTATION_GEOMETRY',
            payload: { id: 'box-tx', geometry: { type: 'box', x: 50 + i, y: 50 + i, width: 100, height: 100 } },
          });
        });
      }

      // Move back to exactly (50, 50)
      act(() => {
        ctx!.dispatch({
          type: 'UPDATE_ANNOTATION_GEOMETRY',
          payload: { id: 'box-tx', geometry: { type: 'box', x: 50, y: 50, width: 100, height: 100 } },
        });
      });

      // Commit transaction
      act(() => {
        ctx!.commitGesture();
      });

      // Since net change was 0, history past length should NOT have increased!
      expect(ctx!.history.past.length).toBe(initialPastCount);

      // 2. Gesture that finishes at (150, 150) -> Exactly 1 history step
      act(() => {
        ctx!.txManager.beginTransaction({
          annotations: ctx!.state.annotations,
          selectedAnnotationId: ctx!.state.selectedAnnotationId,
        });
      });

      // 50 micro moves
      for (let i = 1; i <= 50; i++) {
        act(() => {
          ctx!.dispatch({
            type: 'UPDATE_ANNOTATION_GEOMETRY',
            payload: { id: 'box-tx', geometry: { type: 'box', x: 50 + i * 2, y: 50 + i * 2, width: 100, height: 100 } },
          });
        });
      }

      // Commit transaction
      act(() => {
        ctx!.commitGesture();
      });

      expect(ctx!.history.past.length).toBe(initialPastCount + 1);

      // 1 single Undo reverts all 50 intermediate movements back to (50, 50)!
      act(() => {
        ctx!.undo();
      });
      const boxGeo = ctx!.state.annotations[0].geometry as BoxGeometry;
      expect(boxGeo.x).toBe(50);
      expect(boxGeo.y).toBe(50);

      unmount();
    });
  });

  /* ========================================================================
   * 7. HISTORY CONTROLS COMPONENT & STEP COUNT TOOLTIP INVARIANTS
   * ======================================================================== */
  describe('HistoryControls Component Integration & Tooltips', () => {
    it('accurately binds Undo/Redo actions and updates dynamic step count tooltips', async () => {
      const user = userEvent.setup();
      let ctx: AppContextValue | undefined;

      const TestHost = () => {
        ctx = useApp();
        return <HistoryControls />;
      };

      render(
        <AppProvider>
          <TestHost />
        </AppProvider>
      );

      const undoBtn = screen.getByTestId('undo-btn');
      const redoBtn = screen.getByTestId('redo-btn');

      // Initially both disabled
      expect(undoBtn).toBeDisabled();
      expect(redoBtn).toBeDisabled();
      expect(undoBtn).toHaveAttribute('title', 'Undo (⌘Z)');

      // Add 3 shapes
      for (let i = 1; i <= 3; i++) {
        act(() => {
          ctx!.dispatch({
            type: 'ADD_ANNOTATION',
            payload: { id: `s_${i}`, geometry: { type: 'box', x: i, y: i, width: 10, height: 10 } },
          });
        });
      }

      expect(undoBtn).not.toBeDisabled();
      expect(redoBtn).toBeDisabled();
      expect(undoBtn).toHaveAttribute('title', 'Undo (⌘Z) — 3 steps');

      // Click Undo button twice
      await user.click(undoBtn);
      await user.click(undoBtn);

      expect(ctx!.state.annotations).toHaveLength(1);
      expect(undoBtn).toHaveAttribute('title', 'Undo (⌘Z) — 1 step');
      expect(redoBtn).not.toBeDisabled();
      expect(redoBtn).toHaveAttribute('title', 'Redo (⌘⇧Z) — 2 steps');

      // Click Redo button once
      await user.click(redoBtn);
      expect(ctx!.state.annotations).toHaveLength(2);
      expect(undoBtn).toHaveAttribute('title', 'Undo (⌘Z) — 2 steps');
      expect(redoBtn).toHaveAttribute('title', 'Redo (⌘⇧Z) — 1 step');
    });
  });
});
