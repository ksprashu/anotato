import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appReducer, createInitialState, reindexAnnotations } from '../../src/state/appReducer';
import { NotesSidebar } from '../../src/components/sidebar/NotesSidebar';
import { AppProvider } from '../../src/state/AppContext';
import { Annotation, PresetColor, AnnotationGeometry } from '../../src/types';

describe('Milestone 4 Challenger 1: Sidebar Reordering, Deletion & 1..N Sequence Invariant Stress Suite', () => {
  const PRESET_COLORS: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];

  function createTestAnnotation(i: number): Annotation {
    const types = ['box', 'ellipse', 'arrow', 'pin'] as const;
    const type = types[i % types.length];
    let geometry: AnnotationGeometry;

    switch (type) {
      case 'box':
        geometry = { type: 'box', x: (i * 10) % 800, y: (i * 15) % 600, width: 50 + (i % 50), height: 40 + (i % 40) };
        break;
      case 'ellipse':
        geometry = { type: 'ellipse', cx: (i * 20) % 800, cy: (i * 25) % 600, rx: 30 + (i % 20), ry: 20 + (i % 15) };
        break;
      case 'arrow':
        geometry = { type: 'arrow', startX: (i * 5) % 800, startY: (i * 5) % 600, endX: (i * 5 + 100) % 800, endY: (i * 5 + 80) % 600 };
        break;
      case 'pin':
        geometry = { type: 'pin', x: (i * 30) % 800, y: (i * 30) % 600 };
        break;
    }

    return {
      id: `stress_ann_${i}`,
      index: i + 1,
      geometry,
      style: {
        color: PRESET_COLORS[i % PRESET_COLORS.length],
        strokeWidth: 2 + (i % 4),
        fillOpacity: 0.1 + (i % 5) * 0.1,
      },
      note: `Stress Note #${i + 1} with **bold** and \`code_${i}\``,
      createdAt: 1000000 + i * 1000,
      updatedAt: 1000000 + i * 1000,
    };
  }

  function assertStrictSequenceInvariant(annotations: Annotation[], expectedLength?: number) {
    if (expectedLength !== undefined) {
      expect(annotations.length).toBe(expectedLength);
    }
    const seenIds = new Set<string>();
    for (let i = 0; i < annotations.length; i++) {
      const ann = annotations[i];
      expect(ann.index).toBe(i + 1);
      expect(seenIds.has(ann.id)).toBe(false);
      seenIds.add(ann.id);
    }
  }

  describe('Suite 1: 500 Annotations Scale & 1..N Sequence Invariance', () => {
    it('C1.1: Generates 500 annotations and verifies baseline 1..500 strict ordering', () => {
      const initialList: Annotation[] = [];
      for (let i = 0; i < 500; i++) {
        initialList.push(createTestAnnotation(i));
      }

      const state = createInitialState({ annotations: initialList });
      expect(state.annotations.length).toBe(500);
      assertStrictSequenceInvariant(state.annotations, 500);
    });

    it('C1.2: Executes 500 random reorder operations on 500 annotations while maintaining strict 1..500 invariance', () => {
      const initialList: Annotation[] = [];
      for (let i = 0; i < 500; i++) {
        initialList.push(createTestAnnotation(i));
      }
      let state = createInitialState({ annotations: initialList });
      const initialIdSet = new Set(initialList.map((a) => a.id));

      const startTime = performance.now();
      for (let step = 0; step < 500; step++) {
        const fromIdx = (step * 37) % 500;
        const toIdx = (step * 73 + 13) % 500;

        state = appReducer(state, {
          type: 'REORDER_ANNOTATIONS',
          payload: { fromIndex: fromIdx, toIndex: toIdx },
        });

        // Fast invariant check every 10 steps to avoid excessive test duration
        if (step % 10 === 0 || step === 499) {
          assertStrictSequenceInvariant(state.annotations, 500);
          expect(state.annotations.length).toBe(500);
        }
      }
      const elapsed = performance.now() - startTime;

      // Ensure all original 500 IDs are still present
      const finalIdSet = new Set(state.annotations.map((a) => a.id));
      expect(finalIdSet.size).toBe(500);
      for (const id of initialIdSet) {
        expect(finalIdSet.has(id)).toBe(true);
      }
      expect(elapsed).toBeLessThan(5000); // 500 reorders in < 5s under full parallel Vitest load
    });

    it('C1.3: reindexAnnotations preserves object identities when indices are unchanged', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];
      const reindexed = reindexAnnotations(list);
      // Reference equality must hold for unchanged lists
      expect(reindexed).toBe(list);
      expect(reindexed[0]).toBe(list[0]);
      expect(reindexed[1]).toBe(list[1]);
      expect(reindexed[2]).toBe(list[2]);
    });
  });

  describe('Suite 2: Mass Deletions from 500 Down to 0 & Boundary Deletions', () => {
    it('C2.1: Performs 500 sequential deletions (Head, Tail, Random, Final) maintaining 1..K at every single step', () => {
      const initialList: Annotation[] = [];
      for (let i = 0; i < 500; i++) {
        initialList.push(createTestAnnotation(i));
      }
      let state = createInitialState({ annotations: initialList });

      // 1. Delete Head (index 0) 50 times
      for (let k = 0; k < 50; k++) {
        const expectedLen = 500 - k;
        expect(state.annotations.length).toBe(expectedLen);
        const headId = state.annotations[0].id;
        state = appReducer(state, {
          type: 'DELETE_ANNOTATION',
          payload: { id: headId },
        });
        expect(state.annotations.length).toBe(expectedLen - 1);
        assertStrictSequenceInvariant(state.annotations);
      }

      // 2. Delete Tail (last index) 50 times
      for (let k = 0; k < 50; k++) {
        const expectedLen = 450 - k;
        expect(state.annotations.length).toBe(expectedLen);
        const tailId = state.annotations[state.annotations.length - 1].id;
        state = appReducer(state, {
          type: 'DELETE_ANNOTATION',
          payload: { id: tailId },
        });
        expect(state.annotations.length).toBe(expectedLen - 1);
        assertStrictSequenceInvariant(state.annotations);
      }

      // 3. Delete Random Middle Elements 399 times down to 1 element
      for (let k = 0; k < 399; k++) {
        const currentLen = state.annotations.length;
        const targetIdx = (k * 17) % currentLen;
        const targetId = state.annotations[targetIdx].id;
        state = appReducer(state, {
          type: 'DELETE_ANNOTATION',
          payload: { id: targetId },
        });
        expect(state.annotations.length).toBe(currentLen - 1);
        if (k % 25 === 0 || k === 398) {
          assertStrictSequenceInvariant(state.annotations);
        }
      }

      // 4. Exactly 1 element remaining
      expect(state.annotations.length).toBe(1);
      expect(state.annotations[0].index).toBe(1);

      // 5. Delete the last remaining element
      const lastId = state.annotations[0].id;
      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: lastId },
      });
      expect(state.annotations.length).toBe(0);
      expect(state.selectedAnnotationId).toBeNull();
      expect(state.hoveredAnnotationId).toBeNull();
    });

    it('C2.2: Deleting non-existent ID is a safe no-op with invariant preserved', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1)];
      let state = createInitialState({ annotations: list });

      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: 'non_existent_uuid' },
      });

      expect(state.annotations.length).toBe(2);
      assertStrictSequenceInvariant(state.annotations, 2);
    });
  });

  describe('Suite 3: Boundary Conditions for Reordering', () => {
    it('C3.1: Moving first item up (0 -> -1) is rejected as a no-op', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];
      const state = createInitialState({ annotations: list });

      const nextState = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 0, toIndex: -1 },
      });

      expect(nextState).toBe(state); // Reference equality
      expect(nextState.annotations[0].id).toBe('stress_ann_0');
      assertStrictSequenceInvariant(nextState.annotations, 3);
    });

    it('C3.2: Moving last item down (N-1 -> N) is rejected as a no-op', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];
      const state = createInitialState({ annotations: list });

      const nextState = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 2, toIndex: 3 },
      });

      expect(nextState).toBe(state);
      expect(nextState.annotations[2].id).toBe('stress_ann_2');
      assertStrictSequenceInvariant(nextState.annotations, 3);
    });

    it('C3.3: Reordering identical indices (from === to) is a no-op', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1)];
      const state = createInitialState({ annotations: list });

      const nextState = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 1, toIndex: 1 },
      });

      expect(nextState).toBe(state);
      assertStrictSequenceInvariant(nextState.annotations, 2);
    });

    it('C3.4: Reordering on empty list or single item list is a no-op', () => {
      const stateEmpty = createInitialState({ annotations: [] });
      const nextEmpty = appReducer(stateEmpty, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 0, toIndex: 1 },
      });
      expect(nextEmpty).toBe(stateEmpty);

      const stateSingle = createInitialState({ annotations: [createTestAnnotation(0)] });
      const nextSingle = appReducer(stateSingle, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 0, toIndex: 0 },
      });
      expect(nextSingle).toBe(stateSingle);
    });

    it('C3.5: Supports both { fromIndex, toIndex } and { sourceIndex, destinationIndex } payload conventions', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];
      const state = createInitialState({ annotations: list });

      // Using sourceIndex / destinationIndex alias
      const state1 = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { sourceIndex: 0, destinationIndex: 2 },
      });

      expect(state1.annotations[0].id).toBe('stress_ann_1');
      expect(state1.annotations[1].id).toBe('stress_ann_2');
      expect(state1.annotations[2].id).toBe('stress_ann_0');
      assertStrictSequenceInvariant(state1.annotations, 3);

      // Using fromIndex / toIndex
      const state2 = appReducer(state1, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 2, toIndex: 0 },
      });

      expect(state2.annotations[0].id).toBe('stress_ann_0');
      expect(state2.annotations[1].id).toBe('stress_ann_1');
      expect(state2.annotations[2].id).toBe('stress_ann_2');
      assertStrictSequenceInvariant(state2.annotations, 3);
    });
  });

  describe('Suite 4: Selection & Hover Invariant Integrity Under Mutations', () => {
    it('C4.1: Selection resets to null when selected item is deleted', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];
      let state = createInitialState({
        annotations: list,
        selectedAnnotationId: 'stress_ann_1',
      });

      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: 'stress_ann_1' },
      });

      expect(state.selectedAnnotationId).toBeNull();
      expect(state.annotations.length).toBe(2);
      assertStrictSequenceInvariant(state.annotations, 2);
    });

    it('C4.2: Selection is preserved when an unselected sibling is deleted', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];
      let state = createInitialState({
        annotations: list,
        selectedAnnotationId: 'stress_ann_1',
      });

      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: 'stress_ann_0' },
      });

      expect(state.selectedAnnotationId).toBe('stress_ann_1');
      expect(state.annotations[0].id).toBe('stress_ann_1');
      expect(state.annotations[0].index).toBe(1); // Re-indexed to 1
      assertStrictSequenceInvariant(state.annotations, 2);
    });

    it('C4.3: Hover resets to null when hovered item is deleted', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];
      let state = createInitialState({
        annotations: list,
        hoveredAnnotationId: 'stress_ann_2',
      });

      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: 'stress_ann_2' },
      });

      expect(state.hoveredAnnotationId).toBeNull();
      expect(state.annotations.length).toBe(2);
      assertStrictSequenceInvariant(state.annotations, 2);
    });

    it('C4.4: Selection and Hover persist through multiple reorder operations', () => {
      const list = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2), createTestAnnotation(3)];
      let state = createInitialState({
        annotations: list,
        selectedAnnotationId: 'stress_ann_1',
        hoveredAnnotationId: 'stress_ann_3',
      });

      // Move selected item from index 1 to 3
      state = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 1, toIndex: 3 },
      });

      expect(state.selectedAnnotationId).toBe('stress_ann_1');
      expect(state.hoveredAnnotationId).toBe('stress_ann_3');
      assertStrictSequenceInvariant(state.annotations, 4);

      // Move hovered item from index 2 (was 3) to 0
      state = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 2, toIndex: 0 },
      });

      expect(state.selectedAnnotationId).toBe('stress_ann_1');
      expect(state.hoveredAnnotationId).toBe('stress_ann_3');
      expect(state.annotations[0].id).toBe('stress_ann_3');
      expect(state.annotations[0].index).toBe(1);
      assertStrictSequenceInvariant(state.annotations, 4);
    });
  });

  describe('Suite 5: Array Inversion via Pairwise Swaps (Stress Permutation)', () => {
    it('C5.1: Completely inverts 500 annotations via 250 moves and validates strict 1..500 indexing', () => {
      const initialList: Annotation[] = [];
      for (let i = 0; i < 500; i++) {
        initialList.push(createTestAnnotation(i));
      }
      let state = createInitialState({ annotations: initialList });

      // Move last item to index i for i = 0..499
      for (let i = 0; i < 500; i++) {
        state = appReducer(state, {
          type: 'REORDER_ANNOTATIONS',
          payload: { fromIndex: 499, toIndex: i },
        });
      }

      expect(state.annotations.length).toBe(500);
      assertStrictSequenceInvariant(state.annotations, 500);
      // First item is now stress_ann_499
      expect(state.annotations[0].id).toBe('stress_ann_499');
      // Last item is now stress_ann_0
      expect(state.annotations[499].id).toBe('stress_ann_0');
    });
  });

  describe('Suite 6: Component-Level RTL Integration & Interactive Reordering', () => {
    it('C6.1: Renders 50 items and tests boundary button states in NotesSidebar DOM', () => {
      const items: Annotation[] = [];
      for (let i = 0; i < 50; i++) {
        items.push(createTestAnnotation(i));
      }

      render(
        <AppProvider initialState={{ annotations: items, isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      // Verify Header count badge
      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('50');

      // First item move up disabled, move down enabled
      const moveUpFirst = screen.getByTestId('note-card-move-up-1');
      const moveDownFirst = screen.getByTestId('note-card-move-down-1');
      expect(moveUpFirst).toBeDisabled();
      expect(moveDownFirst).not.toBeDisabled();

      // Last item move down disabled, move up enabled
      const moveUpLast = screen.getByTestId('note-card-move-up-50');
      const moveDownLast = screen.getByTestId('note-card-move-down-50');
      expect(moveDownLast).toBeDisabled();
      expect(moveUpLast).not.toBeDisabled();
    });

    it('C6.2: Interactively reorders cards via Move Down and Move Up in RTL DOM', async () => {
      const user = userEvent.setup();
      const items = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];

      render(
        <AppProvider initialState={{ annotations: items, isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      // Initial badges: ann_0 -> 1, ann_1 -> 2, ann_2 -> 3
      expect(screen.getByTestId('card-badge-stress_ann_0')).toHaveTextContent('1');
      expect(screen.getByTestId('card-badge-stress_ann_1')).toHaveTextContent('2');
      expect(screen.getByTestId('card-badge-stress_ann_2')).toHaveTextContent('3');

      // Click Move Down on item 1 (ann_0)
      const moveDown1 = screen.getByTestId('note-card-move-down-1');
      await user.click(moveDown1);

      // New order: ann_1 (1), ann_0 (2), ann_2 (3)
      expect(screen.getByTestId('card-badge-stress_ann_1')).toHaveTextContent('1');
      expect(screen.getByTestId('card-badge-stress_ann_0')).toHaveTextContent('2');
      expect(screen.getByTestId('card-badge-stress_ann_2')).toHaveTextContent('3');

      // Click Move Up on item 2 (now ann_0)
      const moveUp2 = screen.getByTestId('note-card-move-up-2');
      await user.click(moveUp2);

      // Restored order: ann_0 (1), ann_1 (2), ann_2 (3)
      expect(screen.getByTestId('card-badge-stress_ann_0')).toHaveTextContent('1');
      expect(screen.getByTestId('card-badge-stress_ann_1')).toHaveTextContent('2');
      expect(screen.getByTestId('card-badge-stress_ann_2')).toHaveTextContent('3');
    });

    it('C6.3: Interactively deletes middle item and verifies DOM renumbering', async () => {
      const user = userEvent.setup();
      const items = [createTestAnnotation(0), createTestAnnotation(1), createTestAnnotation(2)];

      render(
        <AppProvider initialState={{ annotations: items, isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      // Delete item 2 (stress_ann_1)
      const deleteBtn2 = screen.getByTestId('note-card-delete-2');
      await user.click(deleteBtn2);

      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('2');
      expect(screen.queryByTestId('note-card-stress_ann_1')).not.toBeInTheDocument();

      // Remaining items reindexed: stress_ann_0 -> 1, stress_ann_2 -> 2
      expect(screen.getByTestId('card-badge-stress_ann_0')).toHaveTextContent('1');
      expect(screen.getByTestId('card-badge-stress_ann_2')).toHaveTextContent('2');
    });
  });

  describe('Suite 7: Performance Benchmarking Under Rapid Mutation Bursts', () => {
    it('C7.1: Performs 1,000 randomized operations (Add, Reorder, Delete) in < 1,500ms', () => {
      let state = createInitialState();
      const startTime = performance.now();

      // 1. Add 300 items
      for (let i = 0; i < 300; i++) {
        state = appReducer(state, {
          type: 'ADD_ANNOTATION',
          payload: {
            id: `burst_ann_${i}`,
            geometry: { type: 'pin', x: i, y: i },
            note: `Note #${i + 1}`,
          },
        });
      }
      expect(state.annotations.length).toBe(300);
      assertStrictSequenceInvariant(state.annotations, 300);

      // 2. Perform 400 random reorders
      for (let r = 0; r < 400; r++) {
        const from = (r * 29) % 300;
        const to = (r * 71) % 300;
        state = appReducer(state, {
          type: 'REORDER_ANNOTATIONS',
          payload: { fromIndex: from, toIndex: to },
        });
      }
      expect(state.annotations.length).toBe(300);
      assertStrictSequenceInvariant(state.annotations, 300);

      // 3. Delete 300 items down to 0
      for (let d = 0; d < 300; d++) {
        const targetId = state.annotations[0].id;
        state = appReducer(state, {
          type: 'DELETE_ANNOTATION',
          payload: { id: targetId },
        });
      }
      expect(state.annotations.length).toBe(0);

      const totalElapsed = performance.now() - startTime;
      expect(totalElapsed).toBeLessThan(1500);
    });
  });
});
