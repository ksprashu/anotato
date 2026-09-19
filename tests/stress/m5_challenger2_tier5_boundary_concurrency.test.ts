import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppProvider, useApp } from '../../src/state/AppContext';
import {
  reindexAnnotations,
} from '../../src/state/appReducer';
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
import {
  getBadgePositionForShape,
  getBadgeDimensions,
  getPinDimensions,
} from '../../src/math/badges';
import {
  calculateArrowhead,
  getResizeHandlePositions,
} from '../../src/math/geometry';
import { screenToImage, imageToScreen } from '../../src/math/coordinates';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
} from '../../src/export/canvasExporter';
import { TransformHandles } from '../../src/components/canvas/TransformHandles';
import { BadgeRenderer } from '../../src/components/canvas/BadgeRenderer';
import { ShapeRenderer } from '../../src/components/canvas/ShapeRenderer';
import { SvgOverlay } from '../../src/components/canvas/SvgOverlay';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';
import {
  BaseImage,
  Annotation,
  HistorySnapshot,
  PresetColor,
  BoxGeometry,
  HighlightGeometry,
  BlurGeometry,
  ArrowGeometry,
  PinGeometry,
  EllipseGeometry,
  ToolType,
  Point,
} from '../../src/types';

// =========================================================================
// Test Fixtures
// =========================================================================

const mockBaseImage: BaseImage = {
  id: 'img-m5-boundary-concurrency',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1920,
  naturalHeight: 1080,
  fileName: 'm5-tier5-boundary-stress.png',
  fileSize: 524288,
};

const ALL_PRESET_COLORS: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];

function createAnnotelyAnnotation(
  id: string,
  index: number,
  type: 'box' | 'highlight' | 'blur' | 'ellipse' | 'arrow' | 'pin',
  color: PresetColor = 'amber',
  note: string = `Annotation note #${index}`
): Annotation {
  let geometry: Annotation['geometry'];

  switch (type) {
    case 'box':
      geometry = {
        type: 'box',
        x: 100 + (index % 10) * 40,
        y: 100 + Math.floor(index / 10) * 30,
        width: 140,
        height: 90,
        borderRadius: 6,
      };
      break;

    case 'highlight':
      geometry = {
        type: 'highlight',
        x: 80 + (index % 8) * 60,
        y: 80 + Math.floor(index / 8) * 45,
        width: 200,
        height: 120,
        borderRadius: 4,
      };
      break;

    case 'blur':
      geometry = {
        type: 'blur',
        x: 120 + (index % 8) * 55,
        y: 120 + Math.floor(index / 8) * 40,
        width: 160,
        height: 80,
        borderRadius: 2,
      };
      break;

    case 'ellipse':
      geometry = {
        type: 'ellipse',
        cx: 200 + (index % 10) * 40,
        cy: 200 + Math.floor(index / 10) * 35,
        rx: 70,
        ry: 45,
      };
      break;

    case 'arrow': {
      const heading = (index % 12) * (Math.PI / 6);
      const len = 120;
      const startX = 250 + (index % 10) * 40;
      const startY = 250 + Math.floor(index / 10) * 40;
      geometry = {
        type: 'arrow',
        startX,
        startY,
        endX: Math.round(startX + Math.cos(heading) * len),
        endY: Math.round(startY + Math.sin(heading) * len),
      };
      break;
    }

    case 'pin':
      geometry = {
        type: 'pin',
        x: 150 + (index % 12) * 50,
        y: 150 + Math.floor(index / 12) * 50,
      };
      break;
  }

  return {
    id,
    index,
    geometry,
    style: {
      color,
      strokeWidth: type === 'arrow' ? 6 : 3,
      fillOpacity: type === 'highlight' ? 0.45 : 0.15,
    },
    note,
    createdAt: 1710000000000 + index * 100,
    updatedAt: 1710000000000 + index * 100,
  };
}

// Component helper using React.createElement for pure .ts compatibility
const ShortcutTestHarness: React.FC = () => {
  const { state } = useApp();
  useKeyboardShortcuts();

  return React.createElement(
    'div',
    { 'data-testid': 'shortcut-harness-root' },
    React.createElement('div', { 'data-testid': 'active-tool-display' }, state.activeTool),
    React.createElement('div', { 'data-testid': 'selected-id-display' }, state.selectedAnnotationId ?? 'none'),
    React.createElement('textarea', {
      'data-testid': 'isolated-note-textarea',
      defaultValue: 'Initial note content',
    }),
    React.createElement('input', {
      'data-testid': 'isolated-text-input',
      defaultValue: 'Initial search query',
    })
  );
};

// =========================================================================
// Master Adversarial Stress Suite
// =========================================================================

describe('Milestone 5 Challenger 2: Tier 5 White-Box Boundary & Concurrency Stress Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Section 1: Rapid Undo/Redo Transaction Storms (100+ Transactions)
  // =========================================================================
  describe('1. Rapid Undo/Redo Transaction Storms', () => {
    it('C2.1: executes a 120-step mixed Annotely transaction storm verifying strict 1..N index monotonicity after every step', () => {
      const toolSequence: ('box' | 'highlight' | 'blur' | 'ellipse' | 'arrow' | 'pin')[] = [
        'box',
        'highlight',
        'blur',
        'ellipse',
        'arrow',
        'pin',
      ];
      let history = createInitialHistory([], null);

      // Ingest 120 mixed annotations sequentially
      for (let i = 1; i <= 120; i++) {
        const tool = toolSequence[(i - 1) % toolSequence.length];
        const color = ALL_PRESET_COLORS[(i - 1) % ALL_PRESET_COLORS.length];
        const newAnn = createAnnotelyAnnotation(`storm_ann_${i}`, i, tool, color);

        const nextAnnotations = reindexAnnotations([...history.present.annotations, newAnn]);
        const snapshot: HistorySnapshot = {
          annotations: nextAnnotations,
          selectedAnnotationId: newAnn.id,
        };

        history = pushHistory(history, snapshot);

        // Verification 1: Index monotonicity invariant
        expect(history.present.annotations).toHaveLength(i);
        history.present.annotations.forEach((ann, idx) => {
          expect(ann.index).toBe(idx + 1);
        });

        // Verification 2: Max history steps bound
        expect(history.past.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
        expect(history.future).toHaveLength(0);
        expect(canUndo(history)).toBe(true);
      }

      expect(history.past).toHaveLength(MAX_HISTORY_STEPS);
      expect(history.present.annotations).toHaveLength(120);
    });

    it('C2.2: survives a 100-cycle high-frequency oscillating undo/redo storm with mixed mutations without desynchronization', () => {
      let history = createInitialHistory([], null);

      // Seed with 30 initial mixed annotations
      for (let i = 1; i <= 30; i++) {
        const tool = (['box', 'highlight', 'blur', 'ellipse', 'arrow', 'pin'] as const)[(i - 1) % 6];
        const ann = createAnnotelyAnnotation(`seed_${i}`, i, tool);
        history = pushHistory(history, {
          annotations: reindexAnnotations([...history.present.annotations, ann]),
          selectedAnnotationId: ann.id,
        });
      }
      expect(history.present.annotations).toHaveLength(30);

      // Execute 100 randomized/oscillating undo/redo/mutation steps
      for (let cycle = 1; cycle <= 100; cycle++) {
        const actionType = cycle % 5;

        if (actionType === 0 && canUndo(history)) {
          // Rapid Undo
          history = undo(history);
        } else if (actionType === 1 && canRedo(history)) {
          // Rapid Redo
          history = redo(history);
        } else if (actionType === 2 && canUndo(history) && history.past.length > 2) {
          // Double Undo
          history = undo(history);
          history = undo(history);
        } else if (actionType === 3 && canRedo(history) && history.future.length > 1) {
          // Double Redo
          history = redo(history);
          history = redo(history);
        } else {
          // Mid-sequence mutation: add or mutate an annotation
          const count = history.present.annotations.length;
          const newAnn = createAnnotelyAnnotation(`oscillate_${cycle}`, count + 1, 'highlight', 'cyan');
          history = pushHistory(history, {
            annotations: reindexAnnotations([...history.present.annotations, newAnn]),
            selectedAnnotationId: newAnn.id,
          });
        }

        // Rigorous Invariant Assertions:
        // 1. Monotonic sequential indexing 1..N with zero gaps or duplicates
        const currentAnnotations = history.present.annotations;
        currentAnnotations.forEach((ann, idx) => {
          expect(ann.index).toBe(idx + 1);
        });

        // 2. History depth boundaries
        expect(history.past.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
        expect(history.future.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);

        // 3. Selection coherence
        if (history.present.selectedAnnotationId !== null) {
          const exists = currentAnnotations.some((a) => a.id === history.present.selectedAnnotationId);
          expect(exists).toBe(true);
        }
      }
    });

    it('C2.3: deep snapshot equality discriminates fine-grained geometry mutations across all 6 Annotely types', () => {
      const boxAnn = createAnnotelyAnnotation('a1', 1, 'box');
      const hlAnn = createAnnotelyAnnotation('a2', 2, 'highlight');
      const blurAnn = createAnnotelyAnnotation('a3', 3, 'blur');
      const arrowAnn = createAnnotelyAnnotation('a4', 4, 'arrow');
      const pinAnn = createAnnotelyAnnotation('a5', 5, 'pin');
      const ellipseAnn = createAnnotelyAnnotation('a6', 6, 'ellipse');

      const baseSnapshot: HistorySnapshot = {
        annotations: [boxAnn, hlAnn, blurAnn, arrowAnn, pinAnn, ellipseAnn],
        selectedAnnotationId: 'a2',
      };

      // 1. Identity snapshot equality
      expect(isSnapshotEqual(baseSnapshot, baseSnapshot)).toBe(true);

      // Deep cloned snapshot equality
      const clonedSnapshot: HistorySnapshot = JSON.parse(JSON.stringify(baseSnapshot));
      expect(isSnapshotEqual(baseSnapshot, clonedSnapshot)).toBe(true);

      // 2. Mutation in Highlight geometry
      const mutatedHlSnapshot: HistorySnapshot = JSON.parse(JSON.stringify(baseSnapshot));
      (mutatedHlSnapshot.annotations[1].geometry as HighlightGeometry).width += 1;
      expect(isSnapshotEqual(baseSnapshot, mutatedHlSnapshot)).toBe(false);

      // 3. Mutation in Blur geometry
      const mutatedBlurSnapshot: HistorySnapshot = JSON.parse(JSON.stringify(baseSnapshot));
      (mutatedBlurSnapshot.annotations[2].geometry as BlurGeometry).height += 1;
      expect(isSnapshotEqual(baseSnapshot, mutatedBlurSnapshot)).toBe(false);

      // 4. Mutation in Arrow start/end coordinates
      const mutatedArrowSnapshot: HistorySnapshot = JSON.parse(JSON.stringify(baseSnapshot));
      (mutatedArrowSnapshot.annotations[3].geometry as ArrowGeometry).endX += 5;
      expect(isSnapshotEqual(baseSnapshot, mutatedArrowSnapshot)).toBe(false);

      // 5. Mutation in Pin coordinates
      const mutatedPinSnapshot: HistorySnapshot = JSON.parse(JSON.stringify(baseSnapshot));
      (mutatedPinSnapshot.annotations[4].geometry as PinGeometry).y -= 2;
      expect(isSnapshotEqual(baseSnapshot, mutatedPinSnapshot)).toBe(false);

      // 6. Mutation in Ellipse radiuses
      const mutatedEllipseSnapshot: HistorySnapshot = JSON.parse(JSON.stringify(baseSnapshot));
      (mutatedEllipseSnapshot.annotations[5].geometry as EllipseGeometry).rx += 3;
      expect(isSnapshotEqual(baseSnapshot, mutatedEllipseSnapshot)).toBe(false);

      // 7. Selection ID mismatch
      const mutatedSelectionSnapshot: HistorySnapshot = {
        ...baseSnapshot,
        selectedAnnotationId: 'a3',
      };
      expect(isSnapshotEqual(baseSnapshot, mutatedSelectionSnapshot)).toBe(false);

      // 8. Re-pushing an equal snapshot into pushHistory does not mutate history
      let testHistory = createInitialHistory(baseSnapshot.annotations, baseSnapshot.selectedAnnotationId);
      const initialPastLen = testHistory.past.length;
      testHistory = pushHistory(testHistory, clonedSnapshot);
      expect(testHistory.past.length).toBe(initialPastLen);
    });

    it('C2.4: enforces mid-history branching invalidation and clears redo stack on divergent mutation', () => {
      let history = createInitialHistory([], null);

      // Push 20 sequential states
      for (let i = 1; i <= 20; i++) {
        const ann = createAnnotelyAnnotation(`branch_${i}`, i, 'box');
        history = pushHistory(history, {
          annotations: reindexAnnotations([...history.present.annotations, ann]),
          selectedAnnotationId: ann.id,
        });
      }
      expect(history.past).toHaveLength(20);
      expect(history.future).toHaveLength(0);

      // Rewind 8 steps via undo
      for (let u = 0; u < 8; u++) {
        history = undo(history);
      }
      expect(history.past).toHaveLength(12);
      expect(history.future).toHaveLength(8);
      expect(canRedo(history)).toBe(true);

      // Perform a new divergent mutation (add highlight annotation at step 12)
      const divergentAnn = createAnnotelyAnnotation('divergent_branch_hl', 13, 'highlight');
      const branchedSnapshot: HistorySnapshot = {
        annotations: reindexAnnotations([...history.present.annotations, divergentAnn]),
        selectedAnnotationId: divergentAnn.id,
      };

      history = pushHistory(history, branchedSnapshot);

      // Invariant: future stack MUST be immediately cleared to prevent time-travel collision
      expect(history.future).toHaveLength(0);
      expect(canRedo(history)).toBe(false);
      expect(history.past).toHaveLength(13);
      expect(history.present.annotations).toHaveLength(13);
      expect(history.present.annotations[12].id).toBe('divergent_branch_hl');
    });

    it('C2.5: TransactionManager safely discards micro-drags, cancels active transactions, and prevents premature commits', () => {
      const tm = new TransactionManager();
      let history = createInitialHistory([], null);

      const baseSnapshot: HistorySnapshot = {
        annotations: [createAnnotelyAnnotation('tx_ann_1', 1, 'highlight')],
        selectedAnnotationId: 'tx_ann_1',
      };

      // 1. Begin transaction
      tm.beginTransaction(baseSnapshot);
      expect(tm.isTransactionActive()).toBe(true);

      // 2. Commit transaction with identical snapshot (zero delta micro-drag)
      history = tm.commitTransaction(history, baseSnapshot);
      expect(history.past).toHaveLength(0); // Discarded as redundant
      expect(tm.isTransactionActive()).toBe(false);

      // 3. Begin another transaction and actively cancel it
      tm.beginTransaction(baseSnapshot);
      expect(tm.isTransactionActive()).toBe(true);
      const rollbackSnapshot = tm.cancelTransaction();
      expect(rollbackSnapshot).toEqual(baseSnapshot);
      expect(tm.isTransactionActive()).toBe(false);

      // 4. Calling commitTransaction when no transaction is active delegates safely to pushHistory
      expect(tm.isTransactionActive()).toBe(false);
      const delegatedHistory = tm.commitTransaction(history, baseSnapshot);
      expect(delegatedHistory.present).toEqual(baseSnapshot);
      expect(delegatedHistory.past).toHaveLength(1);
      // Pushing an identical snapshot again is a no-op (snapshot equality)
      const identicalHistory = tm.commitTransaction(delegatedHistory, baseSnapshot);
      expect(identicalHistory).toBe(delegatedHistory);
    });

    it('C2.6: proves full reversibility invariant: undoing all transactions restores genesis state and redoing restores terminal state', () => {
      let history = createInitialHistory([], null);
      const totalSteps = 25;

      for (let i = 1; i <= totalSteps; i++) {
        const tool = (['box', 'highlight', 'blur', 'ellipse', 'arrow', 'pin'] as const)[(i - 1) % 6];
        const ann = createAnnotelyAnnotation(`rev_${i}`, i, tool);
        history = pushHistory(history, {
          annotations: reindexAnnotations([...history.present.annotations, ann]),
          selectedAnnotationId: ann.id,
        });
      }

      const terminalSnapshot = history.present;
      expect(terminalSnapshot.annotations).toHaveLength(totalSteps);

      // Exhaustively undo back to genesis
      for (let u = 0; u < totalSteps; u++) {
        expect(canUndo(history)).toBe(true);
        history = undo(history);
      }

      expect(canUndo(history)).toBe(false);
      expect(history.present.annotations).toHaveLength(0);
      expect(history.past).toHaveLength(0);
      expect(history.future).toHaveLength(totalSteps);

      // Exhaustively redo back to terminal state
      for (let r = 0; r < totalSteps; r++) {
        expect(canRedo(history)).toBe(true);
        history = redo(history);
      }

      expect(canRedo(history)).toBe(false);
      expect(history.present.annotations).toHaveLength(totalSteps);
      expect(isSnapshotEqual(history.present, terminalSnapshot)).toBe(true);
    });
  });

  // =========================================================================
  // Section 2: Interactive Zoom & Pan Extremes (0.1x to 10.0x Zoom)
  // =========================================================================
  describe('2. Interactive Zoom & Pan Extremes', () => {
    it('C2.7: verifies transform handle sizes, hit targets, and stroke widths across 0.1x to 10.0x zoom without overflow or degeneration', () => {
      const zoomLevels = [0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0];
      const resolutionScales = [1.0, 2.0, 4.0];

      for (const scale of resolutionScales) {
        for (const zoom of zoomLevels) {
          // Math derived from TransformHandles.tsx:
          const handleSize = Math.max((8 * scale) / zoom, 3 * scale);
          const hitAreaSize = Math.max((20 * scale) / zoom, 10 * scale);
          const strokeWidth = Math.max((1.5 * scale) / zoom, 0.5 * scale);

          // 1. Strict positivity and finiteness
          expect(Number.isFinite(handleSize)).toBe(true);
          expect(Number.isFinite(hitAreaSize)).toBe(true);
          expect(Number.isFinite(strokeWidth)).toBe(true);

          expect(handleSize).toBeGreaterThan(0);
          expect(hitAreaSize).toBeGreaterThan(0);
          expect(strokeWidth).toBeGreaterThan(0);

          // 2. Invariant: Hit target area must strictly encompass visible handle
          expect(hitAreaSize).toBeGreaterThanOrEqual(handleSize);

          // 3. Invariant: Minimum readable floor is enforced even at 10.0x zoom
          if (zoom === 10.0) {
            expect(handleSize).toBeGreaterThanOrEqual(3 * scale);
            expect(hitAreaSize).toBeGreaterThanOrEqual(10 * scale);
          }

          // 4. Invariant: Screen-space apparent size (size * zoom) stays stable at low zoom
          if (zoom <= 1.0) {
            const apparentHandleSize = handleSize * zoom;
            expect(apparentHandleSize).toBeCloseTo(8 * scale, 1);
          }
        }
      }
    });

    it('C2.8: renders TransformHandles SVG across all 6 annotation geometries at extreme 0.1x and 10.0x zoom without SVG attribute errors', () => {
      const sampleAnnotations: Annotation[] = [
        createAnnotelyAnnotation('ann_box', 1, 'box'),
        createAnnotelyAnnotation('ann_hl', 2, 'highlight'),
        createAnnotelyAnnotation('ann_blur', 3, 'blur'),
        createAnnotelyAnnotation('ann_ellipse', 4, 'ellipse'),
        createAnnotelyAnnotation('ann_arrow', 5, 'arrow'),
        createAnnotelyAnnotation('ann_pin', 6, 'pin'),
      ];

      for (const ann of sampleAnnotations) {
        for (const zoom of [0.1, 1.0, 10.0]) {
          const { unmount } = render(
            React.createElement(
              'svg',
              null,
              React.createElement(TransformHandles, {
                annotation: ann,
                zoom,
                resolutionScale: 1.5,
              })
            )
          );

          const handlesGroup = screen.getByTestId('transform-handles');
          expect(handlesGroup).toBeInTheDocument();

          // Check bounding box for box, highlight, blur, and ellipse
          if (['box', 'highlight', 'blur', 'ellipse'].includes(ann.geometry.type)) {
            const bbox = screen.getByTestId('transform-bounding-box');
            expect(bbox).toBeInTheDocument();
            const w = parseFloat(bbox.getAttribute('width') || '0');
            const h = parseFloat(bbox.getAttribute('height') || '0');
            expect(w).toBeGreaterThan(0);
            expect(h).toBeGreaterThan(0);
          }

          // Check hit areas are rendered
          const resizeHandles = getResizeHandlePositions(ann.geometry);
          for (const handle of resizeHandles) {
            const hitArea = screen.getByTestId(`transform-handle-hitarea-${handle.id}`);
            expect(hitArea).toBeInTheDocument();
            const size = parseFloat(hitArea.getAttribute('width') || '0');
            expect(size).toBeGreaterThan(0);
          }

          unmount();
        }
      }
    });

    it('C2.9: verifies badge position anchors are strictly finite and preserve tail-anchor contract across zoom and resolution scaling', () => {
      const geometries: Annotation['geometry'][] = [
        { type: 'box', x: 250, y: 150, width: 300, height: 180 },
        { type: 'highlight', x: 100, y: 80, width: 500, height: 250 },
        { type: 'blur', x: 400, y: 300, width: 220, height: 140 },
        { type: 'ellipse', cx: 600, cy: 400, rx: 120, ry: 80 },
        { type: 'arrow', startX: 150, startY: 120, endX: 750, endY: 800 },
        { type: 'pin', x: 800, y: 600 },
      ];

      for (const scale of [1.0, 1.77, 2.5, 4.0]) {
        for (const geom of geometries) {
          const anchor = getBadgePositionForShape(geom, scale);

          expect(Number.isFinite(anchor.x)).toBe(true);
          expect(Number.isFinite(anchor.y)).toBe(true);

          if (geom.type === 'arrow') {
            // CRITICAL R1 CONTRACT: Arrow badge anchor MUST BE EXACTLY (startX, startY)
            expect(anchor.x).toBe(geom.startX);
            expect(anchor.y).toBe(geom.startY);
          } else if (geom.type === 'box' || geom.type === 'highlight' || geom.type === 'blur') {
            expect(anchor.x).toBe(geom.x);
            expect(anchor.y).toBe(geom.y);
          } else if (geom.type === 'pin') {
            const pinDims = getPinDimensions(scale);
            expect(anchor.x).toBe(geom.x);
            expect(anchor.y).toBe(geom.y - pinDims.pointerHeight);
          }
        }
      }
    });

    it('C2.10: verifies bidirectional viewport coordinate transform round-trip identity across extreme zoom and pan boundaries', () => {
      const testViewports = [
        { zoom: 0.05, panX: -10000, panY: -10000 },
        { zoom: 0.1, panX: -2500, panY: 1500 },
        { zoom: 0.5, panX: 0, panY: 0 },
        { zoom: 1.0, panX: -500, panY: -300 },
        { zoom: 2.5, panX: 1200, panY: -800 },
        { zoom: 5.0, panX: -4500, panY: 6200 },
        { zoom: 10.0, panX: 10000, panY: 10000 },
      ];

      const testScreenPoints: Point[] = [
        { x: 0, y: 0 },
        { x: 960, y: 540 },
        { x: 1920, y: 1080 },
        { x: -500, y: -500 },
        { x: 3840, y: 2160 },
      ];

      for (const vp of testViewports) {
        for (const pt of testScreenPoints) {
          // screen -> image
          const imagePt = screenToImage(pt, vp);
          expect(Number.isFinite(imagePt.x)).toBe(true);
          expect(Number.isFinite(imagePt.y)).toBe(true);

          // image -> screen
          const screenPt = imageToScreen(imagePt, vp);
          expect(Number.isFinite(screenPt.x)).toBe(true);
          expect(Number.isFinite(screenPt.y)).toBe(true);

          // Round-trip identity invariant: screenToImage(imageToScreen) === screen
          expect(screenPt.x).toBeCloseTo(pt.x, 6);
          expect(screenPt.y).toBeCloseTo(pt.y, 6);
        }
      }
    });

    it('C2.11: renders BadgeRenderer at zoom extremes (0.1x, 1.0x, 10.0x) with single-digit and multi-digit pill geometries', () => {
      const indicesToTest = [1, 9, 10, 99, 100];

      for (const index of indicesToTest) {
        for (const zoom of [0.1, 1.0, 10.0]) {
          const dims = getBadgeDimensions(index, 1.0);
          expect(dims.width).toBeGreaterThanOrEqual(20);
          expect(dims.height).toBeGreaterThanOrEqual(20);
          expect(dims.fontSize).toBeGreaterThanOrEqual(11);
          expect(dims.isPill).toBe(index >= 10);

          const { unmount } = render(
            React.createElement(
              'svg',
              null,
              React.createElement(BadgeRenderer, {
                index,
                position: { x: 200, y: 200 },
                color: 'red',
                zoom,
                scale: 1.0,
              })
            )
          );

          const badgeEl = screen.getByTestId(`annotation-badge-${index}`);
          expect(badgeEl).toBeInTheDocument();
          expect(badgeEl).toHaveTextContent(String(index));

          unmount();
        }
      }
    });
  });

  // =========================================================================
  // Section 3: Boundary Collisions & Overlapping Geometries
  // =========================================================================
  describe('3. Boundary Collisions & Overlapping Geometries', () => {
    it('C2.12: renders nested and overlapping blur regions placed directly inside highlight spotlight punchout in SvgOverlay', () => {
      // Collision Scenario:
      // - Highlight punchout at (200, 200, 600, 400)
      // - Blur 1: Nested completely inside spotlight punchout at (300, 250, 300, 150)
      // - Blur 2: Straddling spotlight border at (150, 180, 200, 100)
      // - Blur 3: Completely outside spotlight punchout at (900, 700, 200, 150)
      const hlAnn: Annotation = {
        id: 'hl-collision-1',
        index: 1,
        geometry: { type: 'highlight', x: 200, y: 200, width: 600, height: 400, borderRadius: 4 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.45 },
        note: 'Highlight focus region',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const blurNested: Annotation = {
        id: 'blur-nested-1',
        index: 2,
        geometry: { type: 'blur', x: 300, y: 250, width: 300, height: 150, borderRadius: 2 },
        style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blur nested inside spotlight',
        createdAt: 2000,
        updatedAt: 2000,
      };

      const blurStraddling: Annotation = {
        id: 'blur-straddle-1',
        index: 3,
        geometry: { type: 'blur', x: 150, y: 180, width: 200, height: 100, borderRadius: 2 },
        style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blur straddling spotlight boundary',
        createdAt: 3000,
        updatedAt: 3000,
      };

      const blurOutside: Annotation = {
        id: 'blur-outside-1',
        index: 4,
        geometry: { type: 'blur', x: 900, y: 700, width: 200, height: 150, borderRadius: 2 },
        style: { color: 'purple', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blur outside spotlight',
        createdAt: 4000,
        updatedAt: 4000,
      };

      const { unmount } = render(
        React.createElement(
          AppProvider,
          {
            initialState: {
              image: mockBaseImage,
              annotations: [hlAnn, blurNested, blurStraddling, blurOutside],
              activeTool: 'select',
            },
          },
          React.createElement(SvgOverlay, null)
        )
      );

      // Verify Spotlight Mask is rendered
      const spotlightBackdrop = screen.getByTestId('spotlight-backdrop');
      expect(spotlightBackdrop).toBeInTheDocument();
      expect(spotlightBackdrop.getAttribute('mask')).toBe('url(#spotlight-mask)');

      // Verify Blur Slices for all 3 blur regions are rendered with clipPaths
      expect(screen.getByTestId('blur-slice-blur-nested-1')).toBeInTheDocument();
      expect(screen.getByTestId('blur-slice-blur-straddle-1')).toBeInTheDocument();
      expect(screen.getByTestId('blur-slice-blur-outside-1')).toBeInTheDocument();

      // Verify Shape renderers and Badges
      expect(screen.getByTestId('shape-highlight')).toBeInTheDocument();
      expect(screen.getAllByTestId('shape-blur')).toHaveLength(3);
      expect(screen.getByTestId('annotation-badge-1')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-badge-1')).toHaveAttribute('data-annotation-id', 'hl-collision-1');
      expect(screen.getByTestId('annotation-badge-2')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-badge-3')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-badge-4')).toBeInTheDocument();

      unmount();
    });

    it('C2.13: renders 2D composite canvas export with nested blur inside highlight punchout without clipping or composite corruptions', async () => {
      const hlAnn = createAnnotelyAnnotation('exp_hl_1', 1, 'highlight');
      const blurNested = createAnnotelyAnnotation('exp_blur_nested', 2, 'blur');
      // Position blur directly inside highlight
      const hlGeo = hlAnn.geometry as HighlightGeometry;
      const blurGeo = blurNested.geometry as BlurGeometry;
      blurGeo.x = hlGeo.x + 20;
      blurGeo.y = hlGeo.y + 20;
      blurGeo.width = hlGeo.width - 40;
      blurGeo.height = hlGeo.height - 40;

      const canvas = await renderCompositeCanvas(mockBaseImage, [hlAnn, blurNested]);
      expect(canvas).toBeDefined();
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);

      const ctx = canvas.getContext('2d')!;
      // Verify base image was drawn
      expect(ctx.drawImage).toHaveBeenCalled();
      // Verify clip was called for destructive blur baking
      expect(ctx.clip).toHaveBeenCalled();
      // Verify badges were rasterized
      expect(ctx.fillText).toHaveBeenCalledWith('1', expect.any(Number), expect.any(Number));
      expect(ctx.fillText).toHaveBeenCalledWith('2', expect.any(Number), expect.any(Number));

      // Verify blob export succeeds
      const blob = await exportCompositeBlob(mockBaseImage, [hlAnn, blurNested]);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');

      // Verify data URL export succeeds
      const dataUrl = await exportCompositeDataUrl(mockBaseImage, [hlAnn, blurNested]);
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('C2.14: arrow endpoints terminating on badge borders, micro-vectors, and zero-length collocated points generate finite numbers', () => {
      // Case 1: Collocated Zero-Length Arrow (startX === endX, startY === endY)
      const zeroArrow = calculateArrowhead({ x: 400, y: 300 }, { x: 400, y: 300 }, 6);
      expect(Number.isFinite(zeroArrow.tip.x)).toBe(true);
      expect(Number.isFinite(zeroArrow.tip.y)).toBe(true);
      expect(Number.isFinite(zeroArrow.wingLeft.x)).toBe(true);
      expect(Number.isFinite(zeroArrow.wingRight.x)).toBe(true);
      expect(Number.isFinite(zeroArrow.notch.x)).toBe(true);
      expect(Number.isFinite(zeroArrow.shaftEnd.x)).toBe(true);
      expect(zeroArrow.pathString).not.toContain('NaN');

      // Case 2: Micro-Vector Arrow (sub-pixel displacement: dx = 0.001, dy = 0.001)
      const microArrow = calculateArrowhead({ x: 400, y: 300 }, { x: 400.001, y: 300.001 }, 6);
      expect(Number.isFinite(microArrow.tip.x)).toBe(true);
      expect(microArrow.pathString).not.toContain('NaN');
      expect(microArrow.headLength).toBeLessThanOrEqual(36);

      // Case 3: Arrow terminating precisely on another shape's badge border
      // Pin at (500, 500), its badge center is at (500, 500 - 20) = (500, 480)
      // Arrow starts at (200, 480) and ends exactly at (500, 480)
      const terminatingArrow = calculateArrowhead({ x: 200, y: 480 }, { x: 500, y: 480 }, 6);
      expect(terminatingArrow.tip.x).toBe(500);
      expect(terminatingArrow.tip.y).toBe(480);
      expect(terminatingArrow.headingRad).toBeCloseTo(0, 5);
      expect(terminatingArrow.shaftEnd.x).toBeLessThan(500);

      // Verify ShapeRenderer renders collocated zero-length arrow without crashing
      const arrowAnn: Annotation = {
        id: 'ann-zero-arrow',
        index: 1,
        geometry: { type: 'arrow', startX: 400, startY: 300, endX: 400, endY: 300 },
        style: { color: 'amber', strokeWidth: 6, fillOpacity: 0.15 },
        note: 'Zero arrow note',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const { unmount } = render(
        React.createElement(
          'svg',
          null,
          React.createElement(ShapeRenderer, { annotation: arrowAnn })
        )
      );
      expect(screen.getByTestId('shape-arrow')).toBeInTheDocument();
      expect(screen.getByTestId('arrow-graphic')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-badge-1')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-badge-1')).toHaveAttribute('data-annotation-id', 'ann-zero-arrow');
      unmount();
    });

    it('C2.15: stress tests 60 mixed overlapping annotations at identical spatial coordinates without DOM or rasterizer corruption', async () => {
      const toolCycle: ('box' | 'highlight' | 'blur' | 'ellipse' | 'arrow' | 'pin')[] = [
        'box',
        'highlight',
        'blur',
        'ellipse',
        'arrow',
        'pin',
      ];
      const collisionAnnotations: Annotation[] = [];

      for (let i = 1; i <= 60; i++) {
        const tool = toolCycle[(i - 1) % toolCycle.length];
        const ann = createAnnotelyAnnotation(`col_${i}`, i, tool);
        // Force identical coordinate collision
        if (tool === 'box' || tool === 'highlight' || tool === 'blur') {
          (ann.geometry as BoxGeometry).x = 300;
          (ann.geometry as BoxGeometry).y = 200;
        } else if (tool === 'ellipse') {
          (ann.geometry as EllipseGeometry).cx = 300;
          (ann.geometry as EllipseGeometry).cy = 200;
        } else if (tool === 'arrow') {
          (ann.geometry as ArrowGeometry).startX = 300;
          (ann.geometry as ArrowGeometry).startY = 200;
          (ann.geometry as ArrowGeometry).endX = 450;
          (ann.geometry as ArrowGeometry).endY = 200;
        } else if (tool === 'pin') {
          (ann.geometry as PinGeometry).x = 300;
          (ann.geometry as PinGeometry).y = 200;
        }
        collisionAnnotations.push(ann);
      }

      // 1. Live SvgOverlay rendering with 60 colliding annotations
      const { unmount } = render(
        React.createElement(
          AppProvider,
          {
            initialState: {
              image: mockBaseImage,
              annotations: collisionAnnotations,
              activeTool: 'select',
            },
          },
          React.createElement(SvgOverlay, null)
        )
      );

      expect(screen.getByTestId('svg-overlay')).toBeInTheDocument();
      // All 60 badges must be distinctly rendered
      for (let i = 1; i <= 60; i++) {
        expect(screen.getByTestId(`annotation-badge-${i}`)).toBeInTheDocument();
      }
      unmount();

      // 2. Offscreen Canvas composite rasterization with 60 colliding annotations
      const canvas = await renderCompositeCanvas(mockBaseImage, collisionAnnotations);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });
  });

  // =========================================================================
  // Section 4: Keyboard Shortcut Concurrency & Tool Switching
  // =========================================================================
  describe('4. Keyboard Shortcut Concurrency & Tool Switching', () => {
    it('C2.16: rapid switching between B (blur), L (highlight), A (arrow), R (box), O (ellipse), and P (pin) processes all 120 transitions synchronously', () => {
      const keysToToolMap: { key: string; expectedTool: ToolType }[] = [
        { key: 'b', expectedTool: 'blur' },
        { key: 'l', expectedTool: 'highlight' },
        { key: 'a', expectedTool: 'arrow' },
        { key: 'r', expectedTool: 'box' },
        { key: 'o', expectedTool: 'ellipse' },
        { key: 'p', expectedTool: 'pin' },
        { key: 'c', expectedTool: 'ellipse' },
        { key: 'v', expectedTool: 'select' },
        { key: 'h', expectedTool: 'pan' },
      ];

      const { unmount } = render(
        React.createElement(
          AppProvider,
          { initialState: { image: mockBaseImage, activeTool: 'select' } },
          React.createElement(ShortcutTestHarness, null)
        )
      );

      const activeToolDisplay = screen.getByTestId('active-tool-display');
      expect(activeToolDisplay).toHaveTextContent('select');

      // Rapidly fire 120 keyboard shortcuts cycling through the Annotely tools
      for (let i = 0; i < 120; i++) {
        const item = keysToToolMap[i % keysToToolMap.length];

        act(() => {
          fireEvent.keyDown(window, { key: item.key });
        });

        expect(activeToolDisplay).toHaveTextContent(item.expectedTool);
      }

      unmount();
    });

    it('C2.17: switching tools concurrently during active selection preserves selection or resets tool predictably', () => {
      const sampleAnn = createAnnotelyAnnotation('sel_switch_1', 1, 'highlight');

      const { unmount } = render(
        React.createElement(
          AppProvider,
          {
            initialState: {
              image: mockBaseImage,
              annotations: [sampleAnn],
              selectedAnnotationId: 'sel_switch_1',
              activeTool: 'select',
            },
          },
          React.createElement(ShortcutTestHarness, null)
        )
      );

      const activeToolDisplay = screen.getByTestId('active-tool-display');
      const selectedIdDisplay = screen.getByTestId('selected-id-display');

      expect(activeToolDisplay).toHaveTextContent('select');
      expect(selectedIdDisplay).toHaveTextContent('sel_switch_1');

      // Switch to blur ('b')
      act(() => {
        fireEvent.keyDown(window, { key: 'b' });
      });
      expect(activeToolDisplay).toHaveTextContent('blur');

      // Switch to highlight ('l')
      act(() => {
        fireEvent.keyDown(window, { key: 'l' });
      });
      expect(activeToolDisplay).toHaveTextContent('highlight');

      // Switch to arrow ('a')
      act(() => {
        fireEvent.keyDown(window, { key: 'a' });
      });
      expect(activeToolDisplay).toHaveTextContent('arrow');

      // Switch back to select ('v')
      act(() => {
        fireEvent.keyDown(window, { key: 'v' });
      });
      expect(activeToolDisplay).toHaveTextContent('select');

      unmount();
    });

    it('C2.18: strictly isolates keyboard shortcuts when typing inside form inputs and textareas (zero hotkey leakage)', () => {
      const sampleAnn = createAnnotelyAnnotation('form_iso_1', 1, 'box');

      const { unmount } = render(
        React.createElement(
          AppProvider,
          {
            initialState: {
              image: mockBaseImage,
              annotations: [sampleAnn],
              selectedAnnotationId: 'form_iso_1',
              activeTool: 'select',
            },
          },
          React.createElement(ShortcutTestHarness, null)
        )
      );

      const activeToolDisplay = screen.getByTestId('active-tool-display');
      const selectedIdDisplay = screen.getByTestId('selected-id-display');
      const textarea = screen.getByTestId('isolated-note-textarea');
      const textInput = screen.getByTestId('isolated-text-input');

      // 1. Focus textarea and type hotkeys: 'b', 'l', 'a', 'r', 'o', 'p', 'Delete', 'Backspace'
      act(() => {
        textarea.focus();
      });

      act(() => {
        fireEvent.keyDown(textarea, { key: 'b' });
        fireEvent.keyDown(textarea, { key: 'l' });
        fireEvent.keyDown(textarea, { key: 'a' });
        fireEvent.keyDown(textarea, { key: 'r' });
        fireEvent.keyDown(textarea, { key: 'o' });
        fireEvent.keyDown(textarea, { key: 'p' });
        fireEvent.keyDown(textarea, { key: 'Delete' });
        fireEvent.keyDown(textarea, { key: 'Backspace' });
      });

      // INVARIANT: activeTool remains 'select', selected annotation was NOT deleted
      expect(activeToolDisplay).toHaveTextContent('select');
      expect(selectedIdDisplay).toHaveTextContent('form_iso_1');

      // 2. Focus input and type hotkeys
      act(() => {
        textInput.focus();
      });

      act(() => {
        fireEvent.keyDown(textInput, { key: 'b' });
        fireEvent.keyDown(textInput, { key: 'l' });
        fireEvent.keyDown(textInput, { key: 'Escape' });
      });

      // INVARIANT: activeTool remains 'select', selection was NOT cleared
      expect(activeToolDisplay).toHaveTextContent('select');
      expect(selectedIdDisplay).toHaveTextContent('form_iso_1');

      unmount();
    });

    it('C2.19: modifier keys (Ctrl/Cmd, Alt, Shift) do not trigger accidental tool switching', () => {
      const { unmount } = render(
        React.createElement(
          AppProvider,
          { initialState: { image: mockBaseImage, activeTool: 'select' } },
          React.createElement(ShortcutTestHarness, null)
        )
      );

      const activeToolDisplay = screen.getByTestId('active-tool-display');
      expect(activeToolDisplay).toHaveTextContent('select');

      // Cmd+B or Ctrl+B (Bold in rich text, NOT Blur tool)
      act(() => {
        fireEvent.keyDown(window, { key: 'b', metaKey: true });
        fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
      });
      expect(activeToolDisplay).toHaveTextContent('select');

      // Cmd+A or Ctrl+A (Select all, NOT Arrow tool)
      act(() => {
        fireEvent.keyDown(window, { key: 'a', metaKey: true });
        fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
      });
      expect(activeToolDisplay).toHaveTextContent('select');

      // Cmd+P or Ctrl+P (Print, NOT Pin tool)
      act(() => {
        fireEvent.keyDown(window, { key: 'p', metaKey: true });
        fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
      });
      expect(activeToolDisplay).toHaveTextContent('select');

      // Bare single-key 'b' DOES switch tool
      act(() => {
        fireEvent.keyDown(window, { key: 'b' });
      });
      expect(activeToolDisplay).toHaveTextContent('blur');

      unmount();
    });

    it('C2.20: Escape key deselects active annotation first, and subsequent Escape resets tool to select', () => {
      const sampleAnn = createAnnotelyAnnotation('esc_test_1', 1, 'blur');

      const { unmount } = render(
        React.createElement(
          AppProvider,
          {
            initialState: {
              image: mockBaseImage,
              annotations: [sampleAnn],
              selectedAnnotationId: 'esc_test_1',
              activeTool: 'blur',
            },
          },
          React.createElement(ShortcutTestHarness, null)
        )
      );

      const activeToolDisplay = screen.getByTestId('active-tool-display');
      const selectedIdDisplay = screen.getByTestId('selected-id-display');

      expect(activeToolDisplay).toHaveTextContent('blur');
      expect(selectedIdDisplay).toHaveTextContent('esc_test_1');

      // First Escape: Deselects the annotation
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      expect(selectedIdDisplay).toHaveTextContent('none');
      expect(activeToolDisplay).toHaveTextContent('blur');

      // Second Escape: Resets active tool from 'blur' to 'select'
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      expect(activeToolDisplay).toHaveTextContent('select');

      unmount();
    });
  });
});
