import { describe, it, expect } from 'vitest';
import {
  screenToImage,
  imageToScreen,
  computeZoomTransform,
  computeZoomDelta,
  getFitToViewportTransform,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../../src/math/coordinates';
import {
  calculateArrowhead,
  getResizeHandlePositions,
  hitTestAnnotation,
  hitTestHandle,
  applyHandleResize,
  HandleType,
} from '../../src/math/geometry';
import { getBadgePositionForShape, getBadgeDimensions } from '../../src/math/badges';
import {
  appReducer,
  createInitialState,
} from '../../src/state/appReducer';
import {
  createInitialHistory,
  pushHistory,
  undo,
  canUndo,
  canRedo,
  TransactionManager,
  MAX_HISTORY_STEPS,
} from '../../src/state/historyManager';
import { Annotation, BoxGeometry, EllipseGeometry, ArrowGeometry, PinGeometry, ViewportState } from '../../src/types';

describe('Milestone 1 Challenger Stress Suite', () => {
  describe('1. Extreme Coordinate Transforms & Numerical Stability', () => {
    it('handles extreme zoom and pan values without NaN or Inf', () => {
      const extremeViewports: ViewportState[] = [
        { zoom: MIN_ZOOM, panX: -1e6, panY: 1e6 },
        { zoom: MAX_ZOOM, panX: 1e6, panY: -1e6 },
        { zoom: 1.0, panX: 0, panY: 0 },
        { zoom: 0.1234567, panX: 9876.54321, panY: -1234.5678 },
      ];

      const testPoints = [
        { x: 0, y: 0 },
        { x: -5000, y: 5000 },
        { x: 1920.1234, y: 1080.9876 },
        { x: 1e5, y: -1e5 },
      ];

      for (const vp of extremeViewports) {
        for (const pt of testPoints) {
          const screen = imageToScreen(pt, vp);
          expect(Number.isFinite(screen.x)).toBe(true);
          expect(Number.isFinite(screen.y)).toBe(true);

          const roundtrip = screenToImage(screen, vp);
          expect(roundtrip.x).toBeCloseTo(pt.x, 4);
          expect(roundtrip.y).toBeCloseTo(pt.y, 4);
        }
      }
    });

    it('maintains focal point invariant over 100 sequential zoom steps', () => {
      let vp: ViewportState = { zoom: 1.0, panX: 100, panY: 200 };
      const focalScreen = { x: 450, y: 350 };
      const originalImagePoint = screenToImage(focalScreen, vp);

      // Zoom in and out 100 times with varying delta
      for (let i = 0; i < 100; i++) {
        const deltaY = (i % 2 === 0 ? -1 : 1) * (10 + (i % 7) * 5);
        const targetZoom = computeZoomDelta(vp.zoom, deltaY);
        vp = computeZoomTransform(vp, focalScreen, targetZoom);

        const currentImagePoint = screenToImage(focalScreen, vp);
        expect(currentImagePoint.x).toBeCloseTo(originalImagePoint.x, 4);
        expect(currentImagePoint.y).toBeCloseTo(originalImagePoint.y, 4);
      }
    });

    it('handles zero zoom gracefully in screenToImage without throwing or returning NaN', () => {
      const zeroVp: ViewportState = { zoom: 0, panX: 100, panY: 50 };
      const pt = screenToImage({ x: 200, y: 150 }, zeroVp);
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    });

    it('getFitToViewportTransform handles boundary inputs (degenerate sizes)', () => {
      // Zero/negative dimensions return fallback default
      const zeroDim = getFitToViewportTransform(0, 0, 1000, 800);
      expect(zeroDim).toEqual({ zoom: 1, panX: 0, panY: 0 });

      // Extremely tall image
      const tall = getFitToViewportTransform(10, 10000, 1000, 1000, 50, true);
      expect(tall.zoom).toBeLessThanOrEqual(1.0);
      expect(Number.isFinite(tall.panX)).toBe(true);
      expect(Number.isFinite(tall.panY)).toBe(true);

      // Extremely wide image
      const wide = getFitToViewportTransform(10000, 10, 1000, 1000, 50, true);
      expect(wide.zoom).toBeLessThanOrEqual(1.0);
      expect(Number.isFinite(wide.panX)).toBe(true);
      expect(Number.isFinite(wide.panY)).toBe(true);
    });
  });

  describe('2. Hit-Testing Under Multi-Scale Zoom & Pan Offsets', () => {
    const viewports: ViewportState[] = [
      { zoom: 1.0, panX: 0, panY: 0 },
      { zoom: 0.25, panX: 150, panY: -80 },
      { zoom: 3.5, panX: -400, panY: 600 },
      { zoom: 20.0, panX: 5000, panY: -3000 },
    ];

    it('Box hit-testing is accurate across all viewports', () => {
      const box: BoxGeometry = { type: 'box', x: 200, y: 150, width: 300, height: 200 };

      for (const vp of viewports) {
        // Point inside box in image coords
        const insideImg = { x: 250, y: 200 };
        const insideScreen = imageToScreen(insideImg, vp);
        const transformedInside = screenToImage(insideScreen, vp);
        expect(hitTestAnnotation(transformedInside, box)).toBe(true);

        // Point outside box
        const outsideImg = { x: 100, y: 100 };
        const outsideScreen = imageToScreen(outsideImg, vp);
        const transformedOutside = screenToImage(outsideScreen, vp);
        expect(hitTestAnnotation(transformedOutside, box)).toBe(false);

        // Border within tolerance
        const borderImg = { x: 198, y: 200 }; // 2px outside left border
        const borderScreen = imageToScreen(borderImg, vp);
        const transformedBorder = screenToImage(borderScreen, vp);
        expect(hitTestAnnotation(transformedBorder, box, 6)).toBe(true);

        // Outside tolerance
        const farBorderImg = { x: 190, y: 200 }; // 10px outside
        const farBorderScreen = imageToScreen(farBorderImg, vp);
        const transformedFar = screenToImage(farBorderScreen, vp);
        expect(hitTestAnnotation(transformedFar, box, 6)).toBe(false);
      }
    });

    it('Ellipse hit-testing accurately tests interior and boundary', () => {
      const ellipse: EllipseGeometry = { type: 'ellipse', cx: 300, cy: 300, rx: 100, ry: 50 };

      for (const vp of viewports) {
        // Center point
        const centerScreen = imageToScreen({ x: 300, y: 300 }, vp);
        expect(hitTestAnnotation(screenToImage(centerScreen, vp), ellipse)).toBe(true);

        // Boundary point (cx + rx, cy)
        const boundaryScreen = imageToScreen({ x: 400, y: 300 }, vp);
        expect(hitTestAnnotation(screenToImage(boundaryScreen, vp), ellipse, 6)).toBe(true);

        // Outside point in corner of bounding box
        const cornerScreen = imageToScreen({ x: 400, y: 350 }, vp);
        expect(hitTestAnnotation(screenToImage(cornerScreen, vp), ellipse, 0)).toBe(false);
      }

      // Degenerate ellipse rx=0 or ry=0 returns false
      expect(hitTestAnnotation({ x: 10, y: 10 }, { type: 'ellipse', cx: 10, cy: 10, rx: 0, ry: 10 })).toBe(false);
    });

    it('Arrow hit-testing measures perpendicular segment distance correctly', () => {
      const arrow: ArrowGeometry = {
        type: 'arrow',
        startX: 100,
        startY: 100,
        endX: 400,
        endY: 500, // dx = 300, dy = 400, length = 500
      };

      for (const vp of viewports) {
        // Midpoint on segment (250, 300)
        const midScreen = imageToScreen({ x: 250, y: 300 }, vp);
        expect(hitTestAnnotation(screenToImage(midScreen, vp), arrow, 6)).toBe(true);

        // Point near tail
        const tailScreen = imageToScreen({ x: 102, y: 102 }, vp);
        expect(hitTestAnnotation(screenToImage(tailScreen, vp), arrow, 6)).toBe(true);

        // Point near tip
        const tipScreen = imageToScreen({ x: 398, y: 498 }, vp);
        expect(hitTestAnnotation(screenToImage(tipScreen, vp), arrow, 6)).toBe(true);

        // Point collinear but past tip: (460, 580)
        const pastTipScreen = imageToScreen({ x: 460, y: 580 }, vp);
        expect(hitTestAnnotation(screenToImage(pastTipScreen, vp), arrow, 6)).toBe(false);

        // Point collinear but behind tail: (40, 20)
        const behindTailScreen = imageToScreen({ x: 40, y: 20 }, vp);
        expect(hitTestAnnotation(screenToImage(behindTailScreen, vp), arrow, 6)).toBe(false);
      }
    });

    it('Pin hit-testing verifies head circle and anchor point', () => {
      const pin: PinGeometry = { type: 'pin', x: 250, y: 400 };

      for (const vp of viewports) {
        // At anchor point (250, 400)
        const anchorScreen = imageToScreen({ x: 250, y: 400 }, vp);
        expect(hitTestAnnotation(screenToImage(anchorScreen, vp), pin, 6)).toBe(true);

        // At head center (250, 380)
        const headScreen = imageToScreen({ x: 250, y: 380 }, vp);
        expect(hitTestAnnotation(screenToImage(headScreen, vp), pin, 6)).toBe(true);

        // At top of head circle (250, 380 - 14 = 366)
        const headTopScreen = imageToScreen({ x: 250, y: 366 }, vp);
        expect(hitTestAnnotation(screenToImage(headTopScreen, vp), pin, 6)).toBe(true);

        // Far away point
        const farScreen = imageToScreen({ x: 250, y: 200 }, vp);
        expect(hitTestAnnotation(screenToImage(farScreen, vp), pin, 6)).toBe(false);
      }
    });
  });

  describe('3. 8-Point Resize Handles & Inversion Drag Transformations', () => {
    const baseBox: BoxGeometry = { type: 'box', x: 100, y: 100, width: 200, height: 150 };

    it('computes 8 handles with correct coordinates and cursor types', () => {
      const handles = getResizeHandlePositions(baseBox);
      expect(handles).toHaveLength(8);

      const handleMap = new Map(handles.map((h) => [h.id, h]));

      expect(handleMap.get('nw')).toEqual({ id: 'nw', x: 100, y: 100, cursor: 'nwse-resize' });
      expect(handleMap.get('n')).toEqual({ id: 'n', x: 200, y: 100, cursor: 'ns-resize' });
      expect(handleMap.get('ne')).toEqual({ id: 'ne', x: 300, y: 100, cursor: 'nesw-resize' });
      expect(handleMap.get('e')).toEqual({ id: 'e', x: 300, y: 175, cursor: 'ew-resize' });
      expect(handleMap.get('se')).toEqual({ id: 'se', x: 300, y: 250, cursor: 'nwse-resize' });
      expect(handleMap.get('s')).toEqual({ id: 's', x: 200, y: 250, cursor: 'ns-resize' });
      expect(handleMap.get('sw')).toEqual({ id: 'sw', x: 100, y: 250, cursor: 'nesw-resize' });
      expect(handleMap.get('w')).toEqual({ id: 'w', x: 100, y: 175, cursor: 'ew-resize' });
    });

    it('hitTestHandle detects click on every handle', () => {
      const handles = getResizeHandlePositions(baseBox);
      for (const handle of handles) {
        expect(hitTestHandle({ x: handle.x, y: handle.y }, handles, 8)).toBe(handle.id);
        // Within 8px radius
        expect(hitTestHandle({ x: handle.x + 5, y: handle.y - 5 }, handles, 8)).toBe(handle.id);
        // Outside 8px radius
        expect(hitTestHandle({ x: handle.x + 20, y: handle.y + 20 }, handles, 8)).not.toBe(handle.id);
      }
    });

    it('resizes in all 8 directions normally', () => {
      const allHandles: HandleType[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      for (const h of allHandles) {
        const resized = applyHandleResize(baseBox, h, { x: 50, y: 50 }, false);
        expect(resized.type).toBe('box');
        const b = resized as BoxGeometry;
        expect(b.width).toBeGreaterThanOrEqual(2);
        expect(b.height).toBeGreaterThanOrEqual(2);
      }
    });

    it('handles inverted dragging across all axes without negative width or height', () => {
      // Invert SE handle: drag SE (normally at 300, 250) to top-left of box (50, 50)
      const invSE = applyHandleResize(baseBox, 'se', { x: 50, y: 50 }) as BoxGeometry;
      expect(invSE.x).toBe(50);
      expect(invSE.y).toBe(50);
      expect(invSE.width).toBe(50);
      expect(invSE.height).toBe(50);

      // Invert NW handle: drag NW (normally at 100, 100) past bottom-right to (350, 300)
      const invNW = applyHandleResize(baseBox, 'nw', { x: 350, y: 300 }) as BoxGeometry;
      expect(invNW.x).toBe(300); // previous right was 300
      expect(invNW.y).toBe(250); // previous bottom was 250
      expect(invNW.width).toBe(50);
      expect(invNW.height).toBe(50);

      // Invert NE handle: drag NE (normally at 300, 100) to (50, 300)
      const invNE = applyHandleResize(baseBox, 'ne', { x: 50, y: 300 }) as BoxGeometry;
      expect(invNE.x).toBe(50);
      expect(invNE.y).toBe(250);
      expect(invNE.width).toBe(50);
      expect(invNE.height).toBe(50);

      // Invert SW handle: drag SW (normally at 100, 250) to (350, 50)
      const invSW = applyHandleResize(baseBox, 'sw', { x: 350, y: 50 }) as BoxGeometry;
      expect(invSW.x).toBe(300);
      expect(invSW.y).toBe(50);
      expect(invSW.width).toBe(50);
      expect(invSW.height).toBe(50);

      // Invert E handle: drag past left edge
      const invE = applyHandleResize(baseBox, 'e', { x: 50, y: 175 }) as BoxGeometry;
      expect(invE.x).toBe(50);
      expect(invE.width).toBe(50);

      // Invert W handle: drag past right edge
      const invW = applyHandleResize(baseBox, 'w', { x: 350, y: 175 }) as BoxGeometry;
      expect(invW.x).toBe(300);
      expect(invW.width).toBe(50);

      // Invert N handle: drag past bottom edge
      const invN = applyHandleResize(baseBox, 'n', { x: 200, y: 300 }) as BoxGeometry;
      expect(invN.y).toBe(250);
      expect(invN.height).toBe(50);

      // Invert S handle: drag past top edge
      const invS = applyHandleResize(baseBox, 's', { x: 200, y: 50 }) as BoxGeometry;
      expect(invS.y).toBe(50);
      expect(invS.height).toBe(50);
    });

    it('enforces 1:1 square aspect ratio when constrainAspect = true', () => {
      const allHandles: HandleType[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      for (const h of allHandles) {
        const constrained = applyHandleResize(baseBox, h, { x: 400, y: 200 }, true) as BoxGeometry;
        expect(constrained.width).toBe(constrained.height);
        expect(constrained.width).toBeGreaterThanOrEqual(2);
      }
    });

    it('resizes ellipse geometry cleanly and keeps cx, cy, rx, ry valid', () => {
      const ellipse: EllipseGeometry = { type: 'ellipse', cx: 200, cy: 150, rx: 100, ry: 50 };
      const resized = applyHandleResize(ellipse, 'se', { x: 400, y: 300 }) as EllipseGeometry;
      expect(resized.type).toBe('ellipse');
      expect(resized.rx).toBeGreaterThan(0);
      expect(resized.ry).toBeGreaterThan(0);
      expect(Number.isFinite(resized.cx)).toBe(true);
      expect(Number.isFinite(resized.cy)).toBe(true);
    });
  });

  describe('4. Arrowhead Vector Aerodynamics & Angle Precision', () => {
    it('calculates 30-degree wing angles for all 8 cardinal & diagonal directions', () => {
      const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, -(3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4];
      const start = { x: 500, y: 500 };
      const radius = 200;

      for (const theta of angles) {
        const end = {
          x: start.x + radius * Math.cos(theta),
          y: start.y + radius * Math.sin(theta),
        };

        const head = calculateArrowhead(start, end, 3);
        expect(head.headingRad).toBeCloseTo(theta, 4);
        expect(head.tip).toEqual(end);
        expect(Number.isFinite(head.wingLeft.x)).toBe(true);
        expect(Number.isFinite(head.wingRight.x)).toBe(true);
        expect(Number.isFinite(head.notch.x)).toBe(true);

        // Vector tip -> wingLeft
        const vLeft = { x: head.wingLeft.x - head.tip.x, y: head.wingLeft.y - head.tip.y };
        const vShaft = { x: start.x - end.x, y: start.y - end.y };
        const dot = (vLeft.x * vShaft.x + vLeft.y * vShaft.y) / (Math.hypot(vLeft.x, vLeft.y) * Math.hypot(vShaft.x, vShaft.y));
        // cos(30 deg) = sqrt(3)/2 ≈ 0.866025
        expect(dot).toBeCloseTo(Math.cos(Math.PI / 6), 4);
      }
    });

    it('handles zero-length arrow without NaN or throwing', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 100, y: 100 };
      const head = calculateArrowhead(start, end, 3);
      expect(Number.isFinite(head.headingRad)).toBe(true);
      expect(Number.isFinite(head.headLength)).toBe(true);
      expect(Number.isFinite(head.wingLeft.x)).toBe(true);
      expect(Number.isFinite(head.wingRight.x)).toBe(true);
      expect(Number.isFinite(head.notch.x)).toBe(true);
    });
  });

  describe('5. Badge Anchoring Invariants & Scalable Pill Sizing', () => {
    it('ARROW BADGE MUST ALWAYS ANCHOR AT TAIL (startX, startY)', () => {
      const arrows: ArrowGeometry[] = [
        { type: 'arrow', startX: 10, startY: 20, endX: 500, endY: 600 },
        { type: 'arrow', startX: 800, startY: 900, endX: 100, endY: 50 },
      ];

      for (const arr of arrows) {
        const badgePos = getBadgePositionForShape(arr);
        expect(badgePos.x).toBe(arr.startX);
        expect(badgePos.y).toBe(arr.startY);
        // Ensure badge is never at tip
        expect(badgePos.x).not.toBe(arr.endX);
      }
    });

    it('badge dimension expansion for 1..9999 items', () => {
      expect(getBadgeDimensions(1)).toEqual({ width: 24, height: 24, radius: 12, isPill: false, fontSize: 13 });
      expect(getBadgeDimensions(9)).toEqual({ width: 24, height: 24, radius: 12, isPill: false, fontSize: 13 });
      expect(getBadgeDimensions(10)).toEqual({ width: 32, height: 24, radius: 12, isPill: true, fontSize: 12 });
      expect(getBadgeDimensions(99)).toEqual({ width: 32, height: 24, radius: 12, isPill: true, fontSize: 12 });
      expect(getBadgeDimensions(100)).toEqual({ width: 40, height: 24, radius: 12, isPill: true, fontSize: 12 });
      expect(getBadgeDimensions(999)).toEqual({ width: 40, height: 24, radius: 12, isPill: true, fontSize: 12 });
      expect(getBadgeDimensions(1000)).toEqual({ width: 48, height: 24, radius: 12, isPill: true, fontSize: 12 });

      // Edge case: 0 or negative index
      expect(getBadgeDimensions(0).isPill).toBe(false);
      expect(getBadgeDimensions(-5).isPill).toBe(false);
    });
  });

  describe('6. State Engine Invariants & History Transaction Stress', () => {
    it('maintains continuous 1..N sequence numbering across 50 random operations', () => {
      let state = createInitialState();

      // Add 20 annotations
      for (let i = 0; i < 20; i++) {
        state = appReducer(state, {
          type: 'ADD_ANNOTATION',
          payload: {
            geometry: { type: 'box', x: i * 10, y: i * 10, width: 50, height: 50 },
            note: `Note ${i + 1}`,
          },
        });
      }

      expect(state.annotations).toHaveLength(20);
      expect(state.annotations.map((a) => a.index)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

      // Random deletions and reorderings
      state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: state.annotations[5].id } });
      expect(state.annotations.map((a) => a.index)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));

      state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: state.annotations[0].id } });
      expect(state.annotations.map((a) => a.index)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));

      state = appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: 10, toIndex: 2 } });
      expect(state.annotations.map((a) => a.index)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    });

    it('History stack limits past snapshots to MAX_HISTORY_STEPS (50)', () => {
      let history = createInitialHistory();

      // Push 80 snapshots
      for (let i = 1; i <= 80; i++) {
        const dummyAnnotation: Annotation = {
          id: `ann_${i}`,
          index: i,
          geometry: { type: 'box', x: i, y: i, width: 10, height: 10 },
          style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
          note: '',
          createdAt: 0,
          updatedAt: 0,
        };
        history = pushHistory(history, {
          annotations: [dummyAnnotation],
          selectedAnnotationId: `ann_${i}`,
        });
      }

      expect(history.past.length).toBe(MAX_HISTORY_STEPS);
      expect(canUndo(history)).toBe(true);

      // Undo 50 times
      for (let i = 0; i < MAX_HISTORY_STEPS; i++) {
        expect(canUndo(history)).toBe(true);
        history = undo(history);
      }

      // Past stack is now empty
      expect(canUndo(history)).toBe(false);
      expect(canRedo(history)).toBe(true);
      expect(history.future.length).toBe(MAX_HISTORY_STEPS);
    });

    it('TransactionManager batches 60-FPS pointermove events into exactly 1 history commit', () => {
      const tm = new TransactionManager();
      const initialSnapshot = {
        annotations: [
          {
            id: 'box1',
            index: 1,
            geometry: { type: 'box' as const, x: 100, y: 100, width: 100, height: 100 },
            style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
            note: '',
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        selectedAnnotationId: 'box1',
      };

      let history = createInitialHistory(initialSnapshot.annotations, 'box1');

      // 1. Pointer Down
      tm.beginTransaction(history.present);
      expect(tm.isTransactionActive()).toBe(true);

      // 2. 60 simulated pointer moves
      let currentSnapshot = initialSnapshot;
      for (let frame = 1; frame <= 60; frame++) {
        currentSnapshot = {
          ...currentSnapshot,
          annotations: [
            {
              ...currentSnapshot.annotations[0],
              geometry: { type: 'box' as const, x: 100 + frame, y: 100 + frame, width: 100, height: 100 },
            },
          ],
        };
      }

      // 3. Pointer Up -> commitTransaction
      history = tm.commitTransaction(history, currentSnapshot);
      expect(tm.isTransactionActive()).toBe(false);

      // History should have exactly 1 past step (not 60)
      expect(history.past.length).toBe(1);
      expect(history.present.annotations[0].geometry).toEqual({
        type: 'box',
        x: 160,
        y: 160,
        width: 100,
        height: 100,
      });

      // Undo brings back initial snapshot
      history = undo(history);
      expect(history.present.annotations[0].geometry).toEqual({
        type: 'box',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
      });
    });

    it('TransactionManager does not push history if gesture ended with zero delta', () => {
      const tm = new TransactionManager();
      const snapshot = {
        annotations: [],
        selectedAnnotationId: null,
      };

      let history = createInitialHistory();
      tm.beginTransaction(history.present);
      // Committed with same snapshot
      history = tm.commitTransaction(history, snapshot);
      expect(history.past.length).toBe(0);
    });
  });
});
