import { describe, it, expect } from 'vitest';
import {
  createInitialHistory,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  isSnapshotEqual,
  TransactionManager,
  MAX_HISTORY_STEPS,
} from '../../src/state/historyManager';
import { Annotation, HistorySnapshot } from '../../src/types';

describe('Adversarial Undo/Redo & TransactionManager History Stress Tests', () => {
  function makeAnnotation(id: string, index: number, x: number = 0, y: number = 0): Annotation {
    return {
      id,
      index,
      geometry: { type: 'box', x, y, width: 50, height: 50 },
      style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
      note: `Note for ${id}`,
      createdAt: 1000,
      updatedAt: 1000,
    };
  }

  describe('50-Step Cap & FIFO Eviction Invariants', () => {
    it('strictly caps past history at MAX_HISTORY_STEPS (50) under 200 rapid pushes', () => {
      let history = createInitialHistory([], null);

      for (let i = 1; i <= 200; i++) {
        const snap: HistorySnapshot = {
          annotations: [makeAnnotation(`ann_${i}`, 1, i * 10, i * 10)],
          selectedAnnotationId: `ann_${i}`,
        };
        history = pushHistory(history, snap);
        expect(history.past.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
        expect(history.present).toBe(snap);
        expect(history.future).toHaveLength(0);
      }

      expect(history.past).toHaveLength(50);

      // The 50 items in past should correspond to steps 150 to 199 (since 200 is present)
      for (let k = 0; k < 50; k++) {
        const expectedStep = 150 + k;
        expect(history.past[k].selectedAnnotationId).toBe(`ann_${expectedStep}`);
      }
    });

    it('can exhaustively undo all 50 steps down to base and safely handle underflow', () => {
      let history = createInitialHistory([], null);

      for (let i = 1; i <= 60; i++) {
        history = pushHistory(history, {
          annotations: [makeAnnotation(`ann_${i}`, 1, i, i)],
          selectedAnnotationId: `ann_${i}`,
        });
      }
      expect(history.past).toHaveLength(50);

      // Undo 50 times
      for (let u = 0; u < 50; u++) {
        expect(canUndo(history)).toBe(true);
        history = undo(history);
        expect(history.past).toHaveLength(49 - u);
        expect(history.future).toHaveLength(u + 1);
      }

      // Stack exhausted
      expect(canUndo(history)).toBe(false);
      expect(history.past).toHaveLength(0);
      expect(history.future).toHaveLength(50);

      // 51st undo should be safe no-op
      const stateBefore = history;
      history = undo(history);
      expect(history).toBe(stateBefore);
    });

    it('can exhaustively redo all 50 steps and safely handle redo overflow', () => {
      let history = createInitialHistory([], null);

      for (let i = 1; i <= 50; i++) {
        history = pushHistory(history, {
          annotations: [makeAnnotation(`ann_${i}`, 1, i, i)],
          selectedAnnotationId: `ann_${i}`,
        });
      }

      // Undo all 50
      for (let u = 0; u < 50; u++) {
        history = undo(history);
      }
      expect(history.future).toHaveLength(50);
      expect(canRedo(history)).toBe(true);

      // Redo all 50
      for (let r = 0; r < 50; r++) {
        expect(canRedo(history)).toBe(true);
        history = redo(history);
        expect(history.future).toHaveLength(49 - r);
      }

      expect(canRedo(history)).toBe(false);
      expect(history.future).toHaveLength(0);
      expect(history.past).toHaveLength(50);

      // 51st redo should be safe no-op
      const stateBefore = history;
      history = redo(history);
      expect(history).toBe(stateBefore);
    });

    it('wipes redo stack (future) on new branch action after undos', () => {
      let history = createInitialHistory([], null);

      // Push 30 actions
      for (let i = 1; i <= 30; i++) {
        history = pushHistory(history, {
          annotations: [makeAnnotation(`ann_${i}`, 1, i, i)],
          selectedAnnotationId: `ann_${i}`,
        });
      }
      expect(history.past).toHaveLength(30);

      // Undo 10 actions
      for (let u = 0; u < 10; u++) {
        history = undo(history);
      }
      expect(history.past).toHaveLength(20);
      expect(history.future).toHaveLength(10);
      expect(canRedo(history)).toBe(true);

      // Push 1 new branched action
      const branchSnapshot: HistorySnapshot = {
        annotations: [makeAnnotation('branch_ann', 1, 999, 999)],
        selectedAnnotationId: 'branch_ann',
      };
      history = pushHistory(history, branchSnapshot);

      // Future must be completely cleared
      expect(history.future).toHaveLength(0);
      expect(canRedo(history)).toBe(false);
      expect(history.past).toHaveLength(21);
      expect(history.present).toBe(branchSnapshot);
    });
  });

  describe('Deduplication & isSnapshotEqual deep comparison', () => {
    it('does not push duplicate snapshots', () => {
      const snapA: HistorySnapshot = {
        annotations: [makeAnnotation('a1', 1, 10, 20)],
        selectedAnnotationId: 'a1',
      };
      const snapB: HistorySnapshot = {
        annotations: [makeAnnotation('a1', 1, 10, 20)],
        selectedAnnotationId: 'a1',
      };

      let history = createInitialHistory([], null);
      history = pushHistory(history, snapA);
      expect(history.past).toHaveLength(1);

      // Push structurally identical snapshot
      const nextHistory = pushHistory(history, snapB);
      expect(nextHistory).toBe(history);
      expect(nextHistory.past).toHaveLength(1);
    });

    it('detects subtle geometry/style/note changes across shape types', () => {
      const base: HistorySnapshot = {
        annotations: [makeAnnotation('a1', 1, 10, 20)],
        selectedAnnotationId: 'a1',
      };

      // Changed note
      const diffNote: HistorySnapshot = {
        annotations: [{ ...makeAnnotation('a1', 1, 10, 20), note: 'Changed' }],
        selectedAnnotationId: 'a1',
      };
      expect(isSnapshotEqual(base, diffNote)).toBe(false);

      // Changed color
      const diffColor: HistorySnapshot = {
        annotations: [{ ...makeAnnotation('a1', 1, 10, 20), style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 } }],
        selectedAnnotationId: 'a1',
      };
      expect(isSnapshotEqual(base, diffColor)).toBe(false);

      // Changed selection
      const diffSel: HistorySnapshot = {
        annotations: [makeAnnotation('a1', 1, 10, 20)],
        selectedAnnotationId: null,
      };
      expect(isSnapshotEqual(base, diffSel)).toBe(false);
    });
  });

  describe('TransactionManager gesture batching & cancel', () => {
    it('batches 1,000 pointermove events into exactly 1 history commit on pointerup', () => {
      const tx = new TransactionManager();
      let history = createInitialHistory([], null);

      const startSnap: HistorySnapshot = {
        annotations: [makeAnnotation('drag_box', 1, 100, 100)],
        selectedAnnotationId: 'drag_box',
      };
      history = pushHistory(history, startSnap);
      expect(history.past).toHaveLength(1);

      // 1. Pointer Down
      tx.beginTransaction(history.present);
      expect(tx.isTransactionActive()).toBe(true);

      // 2. 1,000 Pointer Moves (transient state without pushing to history)
      let currentDragSnap = history.present;
      for (let i = 1; i <= 1000; i++) {
        currentDragSnap = {
          annotations: [makeAnnotation('drag_box', 1, 100 + i, 100 + i)],
          selectedAnnotationId: 'drag_box',
        };
      }

      // 3. Pointer Up (Commit Transaction)
      history = tx.commitTransaction(history, currentDragSnap);
      expect(tx.isTransactionActive()).toBe(false);
      expect(history.past).toHaveLength(2); // Initial empty -> startSnap -> finalSnap
      expect(history.present).toBe(currentDragSnap);

      // Verify undo takes us directly back to startSnap in 1 step!
      history = undo(history);
      expect(history.present).toEqual(startSnap);
    });

    it('does not commit history if pointer dragged back to start position', () => {
      const tx = new TransactionManager();
      let history = createInitialHistory([], null);

      const startSnap: HistorySnapshot = {
        annotations: [makeAnnotation('box', 1, 100, 100)],
        selectedAnnotationId: 'box',
      };
      history = pushHistory(history, startSnap);
      const pastCountBefore = history.past.length;

      tx.beginTransaction(history.present);

      // Move and then return to exact start
      const finalSnap: HistorySnapshot = {
        annotations: [makeAnnotation('box', 1, 100, 100)],
        selectedAnnotationId: 'box',
      };

      history = tx.commitTransaction(history, finalSnap);
      expect(history.past.length).toBe(pastCountBefore);
    });

    it('cancelTransaction resets active gesture and returns original start snapshot', () => {
      const tx = new TransactionManager();
      const startSnap: HistorySnapshot = {
        annotations: [makeAnnotation('box', 1, 50, 50)],
        selectedAnnotationId: 'box',
      };

      tx.beginTransaction(startSnap);
      expect(tx.isTransactionActive()).toBe(true);

      const rolledBack = tx.cancelTransaction();
      expect(tx.isTransactionActive()).toBe(false);
      expect(rolledBack).toEqual(startSnap);
    });
  });
});
