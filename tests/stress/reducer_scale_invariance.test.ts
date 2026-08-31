import { describe, it, expect } from 'vitest';
import {
  appReducer,
  createInitialState,
} from '../../src/state/appReducer';
import { Annotation, BoxGeometry, EllipseGeometry } from '../../src/types';

describe('Adversarial AppReducer Scale & Invariant Stress Tests', () => {
  function verifyContinuousIndexing(annotations: Annotation[]) {
    for (let i = 0; i < annotations.length; i++) {
      expect(annotations[i].index).toBe(i + 1);
    }
  }

  function createRandomGeometry(i: number) {
    const types = ['box', 'ellipse', 'arrow', 'pin'] as const;
    const type = types[i % types.length];

    switch (type) {
      case 'box':
        return {
          type: 'box' as const,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          width: Math.random() * 200 - 50, // Intentional negative test
          height: Math.random() * 200 - 50,
        };
      case 'ellipse':
        return {
          type: 'ellipse' as const,
          cx: Math.random() * 1000,
          cy: Math.random() * 1000,
          rx: Math.random() * 100 - 20, // Intentional negative test
          ry: Math.random() * 100 - 20,
        };
      case 'arrow':
        return {
          type: 'arrow' as const,
          startX: Math.random() * 1000,
          startY: Math.random() * 1000,
          endX: Math.random() * 1000,
          endY: Math.random() * 1000,
        };
      case 'pin':
        return {
          type: 'pin' as const,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
        };
    }
  }

  it('maintains continuous 1..N index invariant across 1,000 rapid sequential insertions', () => {
    let state = createInitialState();
    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      const geo = createRandomGeometry(i);
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: `ann_${i}`,
          geometry: geo,
          note: `Note #${i + 1}`,
        },
      });

      expect(state.annotations.length).toBe(i + 1);
      expect(state.selectedAnnotationId).toBe(`ann_${i}`);
    }

    const elapsed = performance.now() - startTime;
    expect(state.annotations.length).toBe(1000);
    verifyContinuousIndexing(state.annotations);
    expect(elapsed).toBeLessThan(1000); // 1000 items in <1s
  });

  it('maintains continuous 1..N index invariant through 500 random deletions from 1,000 items', () => {
    let state = createInitialState();

    // Populate with 1,000 annotations
    for (let i = 0; i < 1000; i++) {
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: `item_${i}`,
          geometry: createRandomGeometry(i),
        },
      });
    }
    expect(state.annotations.length).toBe(1000);

    // Randomly delete 500 items
    for (let k = 0; k < 500; k++) {
      const remainingCount = state.annotations.length;
      const targetIdx = Math.floor(Math.random() * remainingCount);
      const targetId = state.annotations[targetIdx].id;

      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: targetId },
      });

      expect(state.annotations.length).toBe(remainingCount - 1);
      verifyContinuousIndexing(state.annotations);
    }

    expect(state.annotations.length).toBe(500);
    verifyContinuousIndexing(state.annotations);
  }, 30000);

  it('maintains continuous 1..N index invariant through 500 random reorderings', () => {
    let state = createInitialState();

    // Populate with 200 items
    for (let i = 0; i < 200; i++) {
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: `reorder_${i}`,
          geometry: { type: 'box', x: i, y: i, width: 10, height: 10 },
        },
      });
    }

    for (let k = 0; k < 500; k++) {
      const from = Math.floor(Math.random() * 200);
      const to = Math.floor(Math.random() * 200);

      state = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: from, toIndex: to },
      });

      expect(state.annotations.length).toBe(200);
      verifyContinuousIndexing(state.annotations);
    }
  }, 30000);

  it('safely handles out-of-bounds, negative, or equal index reorders as no-ops', () => {
    let state = createInitialState();
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a1', geometry: { type: 'box', x: 0, y: 0, width: 10, height: 10 } },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a2', geometry: { type: 'box', x: 10, y: 10, width: 10, height: 10 } },
    });

    const initial = state.annotations;

    // Equal indices
    expect(appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: 0, toIndex: 0 } }).annotations).toBe(initial);
    // Negative source
    expect(appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: -1, toIndex: 1 } }).annotations).toBe(initial);
    // Negative target
    expect(appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: 0, toIndex: -5 } }).annotations).toBe(initial);
    // Out of bounds source
    expect(appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: 5, toIndex: 0 } }).annotations).toBe(initial);
    // Out of bounds target
    expect(appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: 0, toIndex: 10 } }).annotations).toBe(initial);
  });

  it('normalizes geometry with negative width/height/radius during ADD and UPDATE', () => {
    let state = createInitialState();

    // Box with negative width and height
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'inverted_box',
        geometry: { type: 'box', x: 100, y: 100, width: -50, height: -80 },
      },
    });

    const box = state.annotations[0].geometry as BoxGeometry;
    expect(box.x).toBe(50);
    expect(box.y).toBe(20);
    expect(box.width).toBe(50);
    expect(box.height).toBe(80);

    // Update with negative width
    state = appReducer(state, {
      type: 'UPDATE_ANNOTATION_GEOMETRY',
      payload: {
        id: 'inverted_box',
        geometry: { type: 'box', x: 200, y: 200, width: -100, height: 50 },
      },
    });

    const updatedBox = state.annotations[0].geometry as BoxGeometry;
    expect(updatedBox.x).toBe(100);
    expect(updatedBox.y).toBe(200);
    expect(updatedBox.width).toBe(100);
    expect(updatedBox.height).toBe(50);

    // Ellipse with negative rx, ry
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'neg_ellipse',
        geometry: { type: 'ellipse', cx: 300, cy: 300, rx: -40, ry: -60 },
      },
    });

    const ellipse = state.annotations[1].geometry as EllipseGeometry;
    expect(ellipse.rx).toBe(40);
    expect(ellipse.ry).toBe(60);
  });

  it('synchronizes active styles to selected annotation', () => {
    let state = createInitialState();

    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'target', geometry: { type: 'box', x: 0, y: 0, width: 10, height: 10 } },
    });
    expect(state.selectedAnnotationId).toBe('target');

    // Change color while selected
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'purple' });
    expect(state.activeColor).toBe('purple');
    expect(state.annotations[0].style.color).toBe('purple');

    // Change stroke width while selected
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
    expect(state.activeStrokeWidth).toBe(8);
    expect(state.annotations[0].style.strokeWidth).toBe(8);

    // Change fill opacity while selected
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.5 });
    expect(state.activeFillOpacity).toBe(0.5);
    expect(state.annotations[0].style.fillOpacity).toBe(0.5);

    // Deselect
    state = appReducer(state, { type: 'SELECT_ANNOTATION', payload: null });
    expect(state.selectedAnnotationId).toBeNull();

    // Change color while deselected -> annotation remains purple, activeColor updates to green
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'green' });
    expect(state.activeColor).toBe('green');
    expect(state.annotations[0].style.color).toBe('purple');
  });

  it('cleans up selection and hover states when selected/hovered annotation is deleted', () => {
    let state = createInitialState();
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a1', geometry: { type: 'pin', x: 10, y: 10 } },
    });
    state = appReducer(state, {
      type: 'HOVER_ANNOTATION',
      payload: 'a1',
    });

    expect(state.selectedAnnotationId).toBe('a1');
    expect(state.hoveredAnnotationId).toBe('a1');

    state = appReducer(state, {
      type: 'DELETE_ANNOTATION',
      payload: { id: 'a1' },
    });

    expect(state.selectedAnnotationId).toBeNull();
    expect(state.hoveredAnnotationId).toBeNull();
    expect(state.annotations.length).toBe(0);
  });

  it('SET_IMAGE and CLEAR_IMAGE manage state cleanly', () => {
    let state = createInitialState();
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a1', geometry: { type: 'pin', x: 10, y: 10 } },
    });

    // Clear image flushes annotations and resets viewport
    state = appReducer(state, { type: 'CLEAR_IMAGE' });
    expect(state.image).toBeNull();
    expect(state.annotations.length).toBe(0);
    expect(state.selectedAnnotationId).toBeNull();
    expect(state.viewport).toEqual({ zoom: 1.0, panX: 0, panY: 0 });

    // Set image to null flushes annotations
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a2', geometry: { type: 'pin', x: 20, y: 20 } },
    });
    expect(state.annotations.length).toBe(1);

    state = appReducer(state, { type: 'SET_IMAGE', payload: null });
    expect(state.image).toBeNull();
    expect(state.annotations.length).toBe(0);
  });
});
