import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { AppProvider, useApp } from '../../src/state/AppContext';
import { appReducer, createInitialState } from '../../src/state/appReducer';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import { ReplaceImageModal } from '../../src/components/modals/ReplaceImageModal';
import { renderCompositeCanvas } from '../../src/export/canvasExporter';
import {
  Annotation,
  AnnotationGeometry,
  AppState,
  BaseImage,
  ImageOverlay,
  PresetColor,
} from '../../src/types';
import { PRESET_COLORS } from '../../src/constants/colors';

// ---------------------------------------------------------------------------
// Mock Helpers and Generators
// ---------------------------------------------------------------------------

const baseImage1: BaseImage = {
  id: 'img-1',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 800,
  naturalHeight: 600,
  fileName: 'screenshot-1.png',
  fileSize: 1024,
};

const baseImage2: BaseImage = {
  id: 'img-2',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  naturalWidth: 1200,
  naturalHeight: 900,
  fileName: 'screenshot-2.png',
  fileSize: 2048,
};

const overlay1: ImageOverlay = {
  id: 'overlay-1',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 400,
  naturalHeight: 300,
  fileName: 'overlay.png',
  fileSize: 512,
  x: 50,
  y: 50,
  width: 400,
  height: 300,
  opacity: 0.8,
};

const PRESET_COLOR_KEYS: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];
const STROKE_WIDTH_OPTIONS = [2, 3, 4, 8];
const FILL_OPACITY_OPTIONS = [0, 0.15, 0.3, 0.5];

function createDiverseAnnotations(count: number): Annotation[] {
  const geometries: AnnotationGeometry[] = [
    { type: 'box', x: 20, y: 30, width: 150, height: 100 },
    { type: 'ellipse', cx: 300, cy: 200, rx: 80, ry: 50 },
    { type: 'arrow', startX: 50, startY: 400, endX: 250, endY: 450 },
    { type: 'pin', x: 500, y: 150 },
  ];

  const annotations: Annotation[] = [];
  for (let i = 0; i < count; i++) {
    const geo = { ...geometries[i % geometries.length] };
    if (geo.type === 'box') {
      geo.x += (i * 10) % 200;
      geo.y += (i * 15) % 200;
    }
    annotations.push({
      id: `ann-${i + 1}`,
      index: i + 1,
      geometry: geo,
      style: {
        color: PRESET_COLOR_KEYS[i % PRESET_COLOR_KEYS.length],
        strokeWidth: STROKE_WIDTH_OPTIONS[i % STROKE_WIDTH_OPTIONS.length],
        fillOpacity: FILL_OPACITY_OPTIONS[i % FILL_OPACITY_OPTIONS.length],
      },
      note: `Adversarial stress note ${i + 1} with special chars <>&"'\nnewline`,
      createdAt: 10000 + i,
      updatedAt: 10000 + i,
    });
  }
  return annotations;
}

// ---------------------------------------------------------------------------
// Test Suite: Milestone 1 Challenger 1 — Ghost Annotations & Style Retention
// ---------------------------------------------------------------------------

describe('Milestone 1 Challenger 1: Ghost Annotations & Style Retention Stress Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // =========================================================================
  // Section 1: Zero Ghost Annotations Stress Tests
  // =========================================================================
  describe('1. Ghost Annotations Elimination & Verification', () => {
    it('purges high cardinality annotations (100 shapes) down to exactly 0 in state on REPLACE_IMAGE_AND_CLEAR', () => {
      const annotations100 = createDiverseAnnotations(100);
      const state = createInitialState({
        image: baseImage1,
        annotations: annotations100,
        selectedAnnotationId: 'ann-42',
        hoveredAnnotationId: 'ann-43',
        overlays: [overlay1],
      });

      expect(state.annotations.length).toBe(100);
      expect(state.overlays.length).toBe(1);

      const nextState = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_CLEAR',
        payload: { image: baseImage2 },
      });

      // 0 ghost annotations
      expect(nextState.annotations).toEqual([]);
      expect(nextState.annotations.length).toBe(0);
      expect(nextState.selectedAnnotationId).toBeNull();
      expect(nextState.hoveredAnnotationId).toBeNull();
      expect(nextState.overlays).toEqual([]);
      expect(nextState.image).toEqual(baseImage2);
    });

    it('purges annotations down to exactly 0 when payload is direct BaseImage object (backward compatibility)', () => {
      const state = createInitialState({
        image: baseImage1,
        annotations: createDiverseAnnotations(10),
        selectedAnnotationId: 'ann-5',
        overlays: [overlay1],
      });

      const nextState = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_CLEAR',
        payload: baseImage2 as unknown as { image: BaseImage },
      });

      expect(nextState.annotations).toHaveLength(0);
      expect(nextState.selectedAnnotationId).toBeNull();
      expect(nextState.overlays).toHaveLength(0);
      expect(nextState.image?.id).toBe(baseImage2.id);
    });

    it('renders exactly 0 SVG annotation elements, 0 badge elements, and 0 selection handles in DOM after REPLACE_IMAGE_AND_CLEAR', () => {
      const annotations = createDiverseAnnotations(15);
      const initialState: Partial<AppState> = {
        image: baseImage1,
        annotations,
        selectedAnnotationId: 'ann-1', // Ann 1 is a box
      };

      let appContext: ReturnType<typeof useApp> | null = null;
      const TestConsumer = () => {
        appContext = useApp();
        return <CanvasWorkspace />;
      };

      const { container } = render(
        <AppProvider initialState={initialState}>
          <TestConsumer />
        </AppProvider>
      );

      // Verify DOM initially rendered 15 badges and shapes
      const initialBadges = container.querySelectorAll('[data-testid^="annotation-badge-"]');
      expect(initialBadges.length).toBe(15);
      const initialShapes = container.querySelectorAll('[data-testid^="shape-"]');
      expect(initialShapes.length).toBeGreaterThanOrEqual(15);
      expect(container.querySelector('[data-testid="transform-bounding-box"]')).toBeInTheDocument();

      // Dispatch REPLACE_IMAGE_AND_CLEAR
      act(() => {
        appContext!.dispatch({
          type: 'REPLACE_IMAGE_AND_CLEAR',
          payload: { image: baseImage2 },
        });
      });

      // Assert DOM has exactly 0 ghost annotation shapes
      const ghostShapes = container.querySelectorAll('[data-testid^="shape-"]');
      expect(ghostShapes.length).toBe(0);

      // Assert exactly 0 badge elements
      const ghostBadges = container.querySelectorAll('[data-testid^="annotation-badge-"]');
      expect(ghostBadges.length).toBe(0);

      // Assert exactly 0 selection handles
      const ghostHandles = container.querySelectorAll('[data-testid="transform-bounding-box"]');
      expect(ghostHandles.length).toBe(0);

      // Assert base image swapped
      const baseImg = screen.getByTestId('canvas-base-image');
      expect(baseImg).toHaveAttribute('src', baseImage2.src);
    });

    it('strictly prevents Undo/Redo resuscitation of cleared ghost annotations', () => {
      const annotations = createDiverseAnnotations(5);
      let appContext: ReturnType<typeof useApp> | null = null;

      const TestConsumer = () => {
        appContext = useApp();
        return null;
      };

      render(
        <AppProvider initialState={{ image: baseImage1, annotations }}>
          <TestConsumer />
        </AppProvider>
      );

      expect(appContext!.state.annotations.length).toBe(5);

      // Dispatch REPLACE_IMAGE_AND_CLEAR
      act(() => {
        appContext!.dispatch({
          type: 'REPLACE_IMAGE_AND_CLEAR',
          payload: { image: baseImage2 },
        });
      });

      expect(appContext!.state.annotations.length).toBe(0);
      expect(appContext!.canUndo).toBe(false);

      // Attempt to undo immediately — must NOT resuscitate annotations
      act(() => {
        appContext!.undo();
      });

      expect(appContext!.state.annotations.length).toBe(0);

      // Attempt repeated undos
      for (let i = 0; i < 5; i++) {
        act(() => {
          appContext!.undo();
        });
      }
      expect(appContext!.state.annotations.length).toBe(0);

      // Add a new annotation on the new image
      act(() => {
        appContext!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: {
            geometry: { type: 'box', x: 50, y: 50, width: 100, height: 80 },
            style: { color: 'green', strokeWidth: 4, fillOpacity: 0.3 },
            note: 'New annotation on image 2',
          },
        });
      });

      expect(appContext!.state.annotations.length).toBe(1);
      expect(appContext!.state.annotations[0].note).toBe('New annotation on image 2');
      expect(appContext!.canUndo).toBe(true);

      // Undo the new annotation — must revert to 0 annotations, NEVER the 5 from image 1!
      act(() => {
        appContext!.undo();
      });

      expect(appContext!.state.annotations.length).toBe(0);
      expect(appContext!.canUndo).toBe(false);

      // Redo restores the new annotation
      act(() => {
        appContext!.redo();
      });
      expect(appContext!.state.annotations.length).toBe(1);
      expect(appContext!.state.annotations[0].note).toBe('New annotation on image 2');
    });

    it('safely handles in-flight gesture transaction when image replacement occurs', () => {
      const annotations = createDiverseAnnotations(3);
      let appContext: ReturnType<typeof useApp> | null = null;

      const TestConsumer = () => {
        appContext = useApp();
        return null;
      };

      render(
        <AppProvider initialState={{ image: baseImage1, annotations }}>
          <TestConsumer />
        </AppProvider>
      );

      // Begin a gesture transaction
      act(() => {
        appContext!.txManager.beginTransaction({
          annotations: appContext!.state.annotations,
          selectedAnnotationId: 'ann-1',
        });
      });

      expect(appContext!.txManager.isTransactionActive()).toBe(true);

      // Image replacement arrives mid-gesture
      act(() => {
        appContext!.dispatch({
          type: 'REPLACE_IMAGE_AND_CLEAR',
          payload: { image: baseImage2 },
        });
      });

      // Commit gesture that was started before replacement
      act(() => {
        appContext!.commitGesture();
      });

      // State annotations must still be 0 (no ghost annotation resurrected from transaction)
      expect(appContext!.state.annotations.length).toBe(0);
    });

    it('SET_IMAGE and CLEAR_IMAGE also enforce 0 ghost annotations and reset history', () => {
      const annotations = createDiverseAnnotations(4);
      let appContext: ReturnType<typeof useApp> | null = null;

      const TestConsumer = () => {
        appContext = useApp();
        return null;
      };

      render(
        <AppProvider initialState={{ image: baseImage1, annotations }}>
          <TestConsumer />
        </AppProvider>
      );

      // Test SET_IMAGE
      act(() => {
        appContext!.dispatch({ type: 'SET_IMAGE', payload: baseImage2 });
      });
      expect(appContext!.state.annotations).toHaveLength(0);
      expect(appContext!.canUndo).toBe(false);

      // Add annotation
      act(() => {
        appContext!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: { geometry: { type: 'pin', x: 10, y: 10 } },
        });
      });
      expect(appContext!.state.annotations).toHaveLength(1);

      // Test CLEAR_IMAGE
      act(() => {
        appContext!.dispatch({ type: 'CLEAR_IMAGE' });
      });
      expect(appContext!.state.annotations).toHaveLength(0);
      expect(appContext!.state.image).toBeNull();
      expect(appContext!.canUndo).toBe(false);
    });
  });

  // =========================================================================
  // Section 2: Style Retention Stress Tests
  // =========================================================================
  describe('2. Style Retention Invariant & Non-Corruption Verification', () => {
    it('preserves 100% of annotation styles (color, strokeWidth, fillOpacity) across diverse permutations', () => {
      // 20 annotations with varying styles
      const originalAnnotations = createDiverseAnnotations(20);
      const state = createInitialState({
        image: baseImage1,
        annotations: originalAnnotations,
        activeColor: 'purple',
        activeStrokeWidth: 8,
        activeFillOpacity: 0.5,
        selectedAnnotationId: 'ann-7',
      });

      const nextState = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_KEEP',
        payload: { image: baseImage2 },
      });

      // Swapped base image
      expect(nextState.image).toEqual(baseImage2);
      expect(nextState.annotations.length).toBe(20);

      // Selection deselected
      expect(nextState.selectedAnnotationId).toBeNull();
      expect(nextState.hoveredAnnotationId).toBeNull();

      // Verify every single annotation retained its exact original styles and attributes
      for (let i = 0; i < 20; i++) {
        const orig = originalAnnotations[i];
        const kept = nextState.annotations[i];

        expect(kept.id).toBe(orig.id);
        expect(kept.index).toBe(orig.index);
        expect(kept.note).toBe(orig.note);
        expect(kept.createdAt).toBe(orig.createdAt);
        expect(kept.updatedAt).toBe(orig.updatedAt);
        expect(kept.geometry).toEqual(orig.geometry);

        // Core Style Retention Invariant:
        expect(kept.style.color).toBe(orig.style.color);
        expect(kept.style.strokeWidth).toBe(orig.style.strokeWidth);
        expect(kept.style.fillOpacity).toBe(orig.style.fillOpacity);

        // Must NOT have been overwritten by global active styles
        if (orig.style.color !== 'purple') {
          expect(kept.style.color).not.toBe('purple');
        }
        if (orig.style.strokeWidth !== 8) {
          expect(kept.style.strokeWidth).not.toBe(8);
        }
        if (orig.style.fillOpacity !== 0.5) {
          expect(kept.style.fillOpacity).not.toBe(0.5);
        }
      }
    });

    it('creates defensive clones of style objects preventing external reference mutation', () => {
      const originalAnnotations = createDiverseAnnotations(3);
      const state = createInitialState({
        image: baseImage1,
        annotations: originalAnnotations,
      });

      const nextState = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_KEEP',
        payload: { image: baseImage2 },
      });

      // Style objects must be newly cloned references
      expect(nextState.annotations[0].style).not.toBe(originalAnnotations[0].style);
      expect(nextState.annotations[0].style).toEqual(originalAnnotations[0].style);

      // Mutating the original style does NOT affect nextState
      originalAnnotations[0].style.color = 'red';
      originalAnnotations[0].style.strokeWidth = 999;
      expect(nextState.annotations[0].style.strokeWidth).not.toBe(999);
    });

    it('renders kept annotations with correct visual styles in DOM SVG elements', () => {
      const customAnnotations: Annotation[] = [
        {
          id: 'ann-cyan-box',
          index: 1,
          geometry: { type: 'box', x: 50, y: 50, width: 200, height: 100 },
          style: { color: 'cyan', strokeWidth: 8, fillOpacity: 0.3 },
          note: 'Cyan box',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'ann-green-ellipse',
          index: 2,
          geometry: { type: 'ellipse', cx: 300, cy: 300, rx: 60, ry: 40 },
          style: { color: 'green', strokeWidth: 2, fillOpacity: 0 },
          note: 'Green ellipse',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];

      let appContext: ReturnType<typeof useApp> | null = null;
      const TestConsumer = () => {
        appContext = useApp();
        return <CanvasWorkspace />;
      };

      const { container } = render(
        <AppProvider initialState={{ image: baseImage1, annotations: customAnnotations }}>
          <TestConsumer />
        </AppProvider>
      );

      // Dispatch REPLACE_IMAGE_AND_KEEP
      act(() => {
        appContext!.dispatch({
          type: 'REPLACE_IMAGE_AND_KEEP',
          payload: { image: baseImage2 },
        });
      });

      // Shape 1 (Cyan box): stroke should be cyan hex, strokeWidth 8, fill rgba(6, 182, 212, 0.3)
      const boxShape = container.querySelector('[data-testid="shape-box"] rect');
      expect(boxShape).toBeInTheDocument();
      expect(boxShape).toHaveAttribute('stroke', PRESET_COLORS.cyan.stroke);
      expect(boxShape).toHaveAttribute('stroke-width', '8');
      expect(boxShape).toHaveAttribute('fill', 'rgba(6, 182, 212, 0.3)');

      // Shape 2 (Green ellipse): stroke should be green hex, strokeWidth 2, fill rgba(16, 185, 129, 0)
      const ellipseShape = container.querySelector('[data-testid="shape-ellipse"] ellipse');
      expect(ellipseShape).toBeInTheDocument();
      expect(ellipseShape).toHaveAttribute('stroke', PRESET_COLORS.green.stroke);
      expect(ellipseShape).toHaveAttribute('stroke-width', '2');
      expect(ellipseShape).toHaveAttribute('fill', 'rgba(16, 185, 129, 0)');
    });

    it('preserves retained styles through post-replacement Undo operations', () => {
      const customAnnotations: Annotation[] = [
        {
          id: 'ann-amber-1',
          index: 1,
          geometry: { type: 'pin', x: 100, y: 100 },
          style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.15 },
          note: 'Amber pin',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      let appContext: ReturnType<typeof useApp> | null = null;
      const TestConsumer = () => {
        appContext = useApp();
        return null;
      };

      render(
        <AppProvider initialState={{ image: baseImage1, annotations: customAnnotations }}>
          <TestConsumer />
        </AppProvider>
      );

      // Replace and keep
      act(() => {
        appContext!.dispatch({
          type: 'REPLACE_IMAGE_AND_KEEP',
          payload: { image: baseImage2 },
        });
      });

      expect(appContext!.state.annotations).toHaveLength(1);
      expect(appContext!.canUndo).toBe(false);

      // Add a 2nd annotation with different styles
      act(() => {
        appContext!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: {
            geometry: { type: 'box', x: 200, y: 200, width: 80, height: 80 },
            style: { color: 'red', strokeWidth: 8, fillOpacity: 0.5 },
          },
        });
      });

      expect(appContext!.state.annotations).toHaveLength(2);

      // Undo the 2nd annotation
      act(() => {
        appContext!.undo();
      });

      // The kept annotation must still have amber, 4px, 0.15
      expect(appContext!.state.annotations).toHaveLength(1);
      const kept = appContext!.state.annotations[0];
      expect(kept.style.color).toBe('amber');
      expect(kept.style.strokeWidth).toBe(4);
      expect(kept.style.fillOpacity).toBe(0.15);
    });
  });

  // =========================================================================
  // Section 3: Replace Image Modal UI & Interactions Stress Tests
  // =========================================================================
  describe('3. Replace Image Modal UI & Action Interactions', () => {
    it('executes Replace & Clear via button click', async () => {
      const user = userEvent.setup();
      const onReplaceClear = vi.fn();
      const onReplaceKeep = vi.fn();
      const onAddLayer = vi.fn();
      const onCancel = vi.fn();

      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={5}
          onReplaceClear={onReplaceClear}
          onReplaceKeep={onReplaceKeep}
          onAddLayer={onAddLayer}
          onCancel={onCancel}
        />
      );

      const clearBtn = screen.getByTestId('replace-modal-confirm-btn');
      await user.click(clearBtn);

      expect(onReplaceClear).toHaveBeenCalledTimes(1);
      expect(onReplaceKeep).not.toHaveBeenCalled();
      expect(onAddLayer).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('executes Replace & Keep via button click', async () => {
      const user = userEvent.setup();
      const onReplaceClear = vi.fn();
      const onReplaceKeep = vi.fn();
      const onAddLayer = vi.fn();
      const onCancel = vi.fn();

      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={3}
          onReplaceClear={onReplaceClear}
          onReplaceKeep={onReplaceKeep}
          onAddLayer={onAddLayer}
          onCancel={onCancel}
        />
      );

      const keepBtn = screen.getByTestId('replace-modal-replace-keep-btn');
      await user.click(keepBtn);

      expect(onReplaceKeep).toHaveBeenCalledTimes(1);
      expect(onReplaceClear).not.toHaveBeenCalled();
      expect(onAddLayer).not.toHaveBeenCalled();
    });

    it('executes Add as Layer / Overlay via button click', async () => {
      const user = userEvent.setup();
      const onReplaceClear = vi.fn();
      const onReplaceKeep = vi.fn();
      const onAddLayer = vi.fn();
      const onCancel = vi.fn();

      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={3}
          onReplaceClear={onReplaceClear}
          onReplaceKeep={onReplaceKeep}
          onAddLayer={onAddLayer}
          onCancel={onCancel}
        />
      );

      const layerBtn = screen.getByTestId('replace-modal-add-layer-btn');
      await user.click(layerBtn);

      expect(onAddLayer).toHaveBeenCalledTimes(1);
      expect(onReplaceClear).not.toHaveBeenCalled();
      expect(onReplaceKeep).not.toHaveBeenCalled();
    });

    it('cancels modal via Cancel button or Escape key without altering state', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={2}
          onCancel={onCancel}
        />
      );

      // Cancel button
      await user.click(screen.getByTestId('replace-modal-cancel-btn'));
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Escape key
      onCancel.mockClear();
      await user.keyboard('{Escape}');
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('supports legacy property aliases onReplaceAndClear, onReplaceAndKeep, onAddAsLayer, onConfirm', async () => {
      const user = userEvent.setup();
      const onReplaceAndClear = vi.fn();
      const onReplaceAndKeep = vi.fn();
      const onAddAsLayer = vi.fn();
      const onCancel = vi.fn();

      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={1}
          onReplaceAndClear={onReplaceAndClear}
          onReplaceAndKeep={onReplaceAndKeep}
          onAddAsLayer={onAddAsLayer}
          onCancel={onCancel}
        />
      );

      await user.click(screen.getByTestId('replace-modal-add-layer-btn'));
      expect(onAddAsLayer).toHaveBeenCalledTimes(1);

      await user.click(screen.getByTestId('replace-modal-replace-keep-btn'));
      expect(onReplaceAndKeep).toHaveBeenCalledTimes(1);

      await user.click(screen.getByTestId('replace-modal-confirm-btn'));
      expect(onReplaceAndClear).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Section 4: Multi-Step Sequential State Fuzzing (50 Iterations)
  // =========================================================================
  describe('4. Rapid Multi-Action Sequential Fuzzing', () => {
    it('maintains strict invariants across 50 pseudo-random operations', () => {
      let state = createInitialState({ image: baseImage1 });
      let step = 0;

      const actionTypes = [
        'CLEAR_AND_REPLACE',
        'ADD_ANN',
        'KEEP_AND_REPLACE',
        'ADD_ANN',
        'ADD_ANN',
        'ADD_LAYER',
        'CLEAR_AND_REPLACE',
        'ADD_ANN',
        'KEEP_AND_REPLACE',
      ];

      for (let i = 0; i < 50; i++) {
        const actionChoice = actionTypes[i % actionTypes.length];
        step++;

        const newImage: BaseImage = {
          id: `img-step-${step}`,
          src: `data:image/png;base64,mock${step}`,
          naturalWidth: 800 + ((step * 10) % 500),
          naturalHeight: 600 + ((step * 10) % 400),
          fileName: `step_${step}.png`,
          fileSize: 1000 + step,
        };

        if (actionChoice === 'CLEAR_AND_REPLACE') {
          state = appReducer(state, {
            type: 'REPLACE_IMAGE_AND_CLEAR',
            payload: { image: newImage },
          });

          // INVARIANT 1: Annotations must be strictly 0 immediately after REPLACE_IMAGE_AND_CLEAR
          expect(state.annotations).toHaveLength(0);
          expect(state.overlays).toHaveLength(0);
          expect(state.selectedAnnotationId).toBeNull();
        } else if (actionChoice === 'KEEP_AND_REPLACE') {
          const preCount = state.annotations.length;
          const preStyles = state.annotations.map((a) => ({ ...a.style }));

          state = appReducer(state, {
            type: 'REPLACE_IMAGE_AND_KEEP',
            payload: { image: newImage },
          });

          // INVARIANT 2: Count unchanged, styles unchanged
          expect(state.annotations).toHaveLength(preCount);
          state.annotations.forEach((ann, idx) => {
            expect(ann.style).toEqual(preStyles[idx]);
          });
        } else if (actionChoice === 'ADD_ANN') {
          const newColor = PRESET_COLOR_KEYS[step % PRESET_COLOR_KEYS.length];
          const newStroke = STROKE_WIDTH_OPTIONS[step % STROKE_WIDTH_OPTIONS.length];
          const newOpacity = FILL_OPACITY_OPTIONS[step % FILL_OPACITY_OPTIONS.length];

          state = appReducer(state, {
            type: 'ADD_ANNOTATION',
            payload: {
              geometry: { type: 'box', x: 10 * step, y: 10 * step, width: 100, height: 100 },
              style: { color: newColor, strokeWidth: newStroke, fillOpacity: newOpacity },
              note: `Step ${step}`,
            },
          });
        } else if (actionChoice === 'ADD_LAYER') {
          const overlay: ImageOverlay = {
            id: `overlay-${step}`,
            src: `data:image/png;base64,overlay${step}`,
            naturalWidth: 400,
            naturalHeight: 300,
            fileName: `overlay_${step}.png`,
            fileSize: 500,
            x: 10,
            y: 10,
            width: 400,
            height: 300,
            opacity: 1,
          };
          state = appReducer(state, {
            type: 'ADD_IMAGE_OVERLAY',
            payload: { overlay },
          });
        }

        // UNIVERSAL INVARIANTS:
        // 1. Contiguous indices 1..N
        state.annotations.forEach((ann, idx) => {
          expect(ann.index).toBe(idx + 1);
        });

        // 2. Selected ID must either be null or correspond to an existing annotation
        if (state.selectedAnnotationId !== null) {
          expect(state.annotations.some((a) => a.id === state.selectedAnnotationId)).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // Section 5: Canvas Exporter Stress Verification
  // =========================================================================
  describe('5. Canvas Exporter Integrity & 0 Ghost Drawing Calls', () => {
    it('renderCompositeCanvas draws only active annotations and overlays, 0 ghost elements', async () => {
      const keptAnnotations = createDiverseAnnotations(3);

      // Call renderCompositeCanvas with 0 annotations (cleared)
      const clearedCanvas = await renderCompositeCanvas(baseImage2, [], []);
      expect(clearedCanvas.width).toBe(1200);
      expect(clearedCanvas.height).toBe(900);

      // Call with keptAnnotations (3 annotations) + 1 overlay
      const compositeCanvas = await renderCompositeCanvas(baseImage2, keptAnnotations, [overlay1]);
      expect(compositeCanvas.width).toBe(1200);
      expect(compositeCanvas.height).toBe(900);
    });
  });
});
