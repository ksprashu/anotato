import { describe, it, expect } from 'vitest';
import {
  normalizeHighlightGeometry,
  normalizeGeometry,
  appReducer,
  createInitialState,
} from '../../src/state/appReducer';
import {
  createInitialHistory,
  pushHistory,
  undo,
  redo,
  isSnapshotEqual,
} from '../../src/state/historyManager';
import {
  applyHandleResize,
  getResizeHandlePositions,
  getGeometryBoundingBox,
  hitTestAnnotation,
  translateGeometry,
} from '../../src/math/geometry';
import { getBadgePositionForShape } from '../../src/math/badges';
import { renderCompositeCanvas } from '../../src/export/canvasExporter';
import { AppState, BaseImage, HighlightGeometry, Annotation } from '../../src/types';

describe('Milestone M2 Adversarial Challenger Suite: Additive Highlight & Spotlight Tool', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'test-screenshot.png',
    fileSize: 1024,
  };

  const initialBaseState: AppState = createInitialState({
    image: mockBaseImage,
  });

  describe('Challenger 1: Coordinate Normalization & Axis Inversion Stress', () => {
    it('C1.1: Normalizes 4 quadrants of inverted drag vectors cleanly', () => {
      // Quadrant 1: drag down-right (positive, positive)
      const q1 = normalizeHighlightGeometry({ type: 'highlight', x: 100, y: 100, width: 200, height: 150 });
      expect(q1).toEqual({ type: 'highlight', x: 100, y: 100, width: 200, height: 150 });

      // Quadrant 2: drag down-left (negative, positive)
      const q2 = normalizeHighlightGeometry({ type: 'highlight', x: 300, y: 100, width: -200, height: 150 });
      expect(q2).toEqual({ type: 'highlight', x: 100, y: 100, width: 200, height: 150 });

      // Quadrant 3: drag up-left (negative, negative)
      const q3 = normalizeHighlightGeometry({ type: 'highlight', x: 300, y: 250, width: -200, height: -150 });
      expect(q3).toEqual({ type: 'highlight', x: 100, y: 100, width: 200, height: 150 });

      // Quadrant 4: drag up-right (positive, negative)
      const q4 = normalizeHighlightGeometry({ type: 'highlight', x: 100, y: 250, width: 200, height: -150 });
      expect(q4).toEqual({ type: 'highlight', x: 100, y: 100, width: 200, height: 150 });
    });

    it('C1.2: Normalizes inverted highlight via universal normalizeGeometry dispatcher', () => {
      const inverted: HighlightGeometry = {
        type: 'highlight',
        x: 500,
        y: 400,
        width: -300,
        height: -200,
        borderRadius: 8,
      };
      const normalized = normalizeGeometry(inverted) as HighlightGeometry;
      expect(normalized.type).toBe('highlight');
      expect(normalized.x).toBe(200);
      expect(normalized.y).toBe(200);
      expect(normalized.width).toBe(300);
      expect(normalized.height).toBe(200);
      expect(normalized.borderRadius).toBe(8);
    });

    it('C1.3: Handles zero dimensions without negative zero (-0)', () => {
      const zeroGeom: HighlightGeometry = {
        type: 'highlight',
        x: 100,
        y: 100,
        width: 0,
        height: 0,
      };
      const normalized = normalizeHighlightGeometry(zeroGeom);
      expect(Object.is(normalized.width, 0)).toBe(true);
      expect(Object.is(normalized.height, 0)).toBe(true);
    });
  });

  describe('Challenger 2: 8-Point Transform Handle & Flipping Resizing', () => {
    const baseHl: HighlightGeometry = {
      type: 'highlight',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      borderRadius: 6,
    };

    it('C2.1: Generates exactly 8 resize handles for highlight geometry', () => {
      const handles = getResizeHandlePositions(baseHl);
      expect(handles).toHaveLength(8);
      const ids = handles.map((h) => h.id);
      expect(ids).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);

      // Check handle coordinates
      expect(handles.find((h) => h.id === 'nw')).toEqual({ id: 'nw', x: 100, y: 100, cursor: 'nwse-resize' });
      expect(handles.find((h) => h.id === 'se')).toEqual({ id: 'se', x: 300, y: 250, cursor: 'nwse-resize' });
      expect(handles.find((h) => h.id === 'n')).toEqual({ id: 'n', x: 200, y: 100, cursor: 'ns-resize' });
      expect(handles.find((h) => h.id === 'e')).toEqual({ id: 'e', x: 300, y: 175, cursor: 'ew-resize' });
    });

    it('C2.2: Resizing via SE handle flips coordinates when dragged past opposite corner', () => {
      // Drag SE handle from (300, 250) across NW corner (100, 100) to (50, 40)
      const flipped = applyHandleResize(baseHl, 'se', { x: 50, y: 40 }) as HighlightGeometry;

      expect(flipped.type).toBe('highlight');
      expect(flipped.x).toBe(50);
      expect(flipped.y).toBe(40);
      expect(flipped.width).toBe(50); // 100 - 50
      expect(flipped.height).toBe(60); // 100 - 40
      expect(flipped.borderRadius).toBe(6);
    });

    it('C2.3: Resizing via NW handle flips coordinates when dragged past SE corner', () => {
      // Drag NW handle from (100, 100) across SE corner (300, 250) to (400, 350)
      const flipped = applyHandleResize(baseHl, 'nw', { x: 400, y: 350 }) as HighlightGeometry;

      expect(flipped.type).toBe('highlight');
      expect(flipped.x).toBe(300);
      expect(flipped.y).toBe(250);
      expect(flipped.width).toBe(100);
      expect(flipped.height).toBe(100);
      expect(flipped.borderRadius).toBe(6);
    });

    it('C2.4: 1D Cardinal handles (N, S, E, W) preserve the unaffected dimension', () => {
      // North handle resize (only changes y and height, x and width unchanged)
      const nResized = applyHandleResize(baseHl, 'n', { x: 999, y: 50 }) as HighlightGeometry;
      expect(nResized.x).toBe(100);
      expect(nResized.y).toBe(50);
      expect(nResized.width).toBe(200);
      expect(nResized.height).toBe(200); // 250 - 50

      // East handle resize (only changes width, y and height unchanged)
      const eResized = applyHandleResize(baseHl, 'e', { x: 350, y: 999 }) as HighlightGeometry;
      expect(eResized.x).toBe(100);
      expect(eResized.y).toBe(100);
      expect(eResized.width).toBe(250);
      expect(eResized.height).toBe(150);
    });

    it('C2.5: Enforces minimum dimensions >= 2px under extreme collapse resize', () => {
      const collapsed = applyHandleResize(baseHl, 'se', { x: 100, y: 100 }) as HighlightGeometry;
      expect(collapsed.width).toBeGreaterThanOrEqual(2);
      expect(collapsed.height).toBeGreaterThanOrEqual(2);
    });

    it('C2.6: Aspect ratio locking constraint during resize', () => {
      const aspectLocked = applyHandleResize(baseHl, 'se', { x: 350, y: 200 }, true) as HighlightGeometry;
      // width was 250, height was 100 -> side is max(250, 100) = 250
      expect(aspectLocked.width).toBe(250);
      expect(aspectLocked.height).toBe(250);
    });
  });

  describe('Challenger 3: Spatial Math, Hit Testing & Badge Anchors', () => {
    const hl: HighlightGeometry = {
      type: 'highlight',
      x: 200,
      y: 150,
      width: 300,
      height: 200,
    };

    it('C3.1: getGeometryBoundingBox computes exact bounding rect', () => {
      const bbox = getGeometryBoundingBox(hl);
      expect(bbox).toEqual({ x: 200, y: 150, width: 300, height: 200 });
    });

    it('C3.2: getBadgePositionForShape anchors badge at top-left (x, y)', () => {
      const badgePos = getBadgePositionForShape(hl);
      expect(badgePos).toEqual({ x: 200, y: 150 });
    });

    it('C3.3: hitTestAnnotation detects points inside, on edge, and rejects outside', () => {
      const ann: Annotation = {
        id: 'hl-test',
        index: 1,
        geometry: hl,
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: '',
        createdAt: 1,
        updatedAt: 1,
      };

      // Inside point
      expect(hitTestAnnotation({ x: 250, y: 200 }, ann)).toBe(true);
      // Boundary point with default tolerance (4px)
      expect(hitTestAnnotation({ x: 198, y: 150 }, ann)).toBe(true);
      // Clearly outside point
      expect(hitTestAnnotation({ x: 150, y: 100 }, ann)).toBe(false);
      expect(hitTestAnnotation({ x: 550, y: 400 }, ann)).toBe(false);
    });

    it('C3.4: translateGeometry shifts x and y by delta while preserving all properties', () => {
      const translated = translateGeometry(hl, 50, -30) as HighlightGeometry;
      expect(translated).toEqual({
        type: 'highlight',
        x: 250,
        y: 120,
        width: 300,
        height: 200,
      });
    });
  });

  describe('Challenger 4: History & Undo/Redo Invariant Stress', () => {
    it('C4.1: isSnapshotEqual distinguishes changes in highlight geometry', () => {
      const ann1: Annotation = {
        id: 'hl-1',
        index: 1,
        geometry: { type: 'highlight', x: 100, y: 100, width: 200, height: 100 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Note 1',
        createdAt: 1,
        updatedAt: 1,
      };

      const ann2: Annotation = {
        ...ann1,
        geometry: { type: 'highlight', x: 101, y: 100, width: 200, height: 100 },
      };

      const snap1 = { annotations: [ann1], selectedAnnotationId: 'hl-1' };
      const snap2 = { annotations: [ann2], selectedAnnotationId: 'hl-1' };

      expect(isSnapshotEqual(snap1, snap1)).toBe(true);
      expect(isSnapshotEqual(snap1, snap2)).toBe(false);
    });

    it('C4.2: Full cycle history: add, update, delete, undo x2, redo x2', () => {
      let state = initialBaseState;

      // 1. Add highlight
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: 'hl-1',
          geometry: { type: 'highlight', x: 100, y: 100, width: 200, height: 150 },
          note: 'First highlight',
        },
      });
      let history = createInitialHistory(state.annotations, state.selectedAnnotationId);

      // 2. Update geometry (move highlight)
      state = appReducer(state, {
        type: 'UPDATE_ANNOTATION_GEOMETRY',
        payload: {
          id: 'hl-1',
          geometry: { type: 'highlight', x: 300, y: 250, width: 200, height: 150 },
        },
      });
      history = pushHistory(history, { annotations: state.annotations, selectedAnnotationId: state.selectedAnnotationId });
      expect(history.past).toHaveLength(1);

      // 3. Delete highlight
      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: 'hl-1' },
      });
      history = pushHistory(history, { annotations: state.annotations, selectedAnnotationId: state.selectedAnnotationId });
      expect(history.past).toHaveLength(2);
      expect(history.present.annotations).toHaveLength(0);

      // 4. Undo deletion -> restores moved highlight
      history = undo(history);
      expect(history.present.annotations).toHaveLength(1);
      expect((history.present.annotations[0].geometry as HighlightGeometry).x).toBe(300);

      // 5. Undo move -> restores original position
      history = undo(history);
      expect(history.present.annotations).toHaveLength(1);
      expect((history.present.annotations[0].geometry as HighlightGeometry).x).toBe(100);

      // 6. Redo move -> moved position
      history = redo(history);
      expect((history.present.annotations[0].geometry as HighlightGeometry).x).toBe(300);

      // 7. Redo deletion -> empty
      history = redo(history);
      expect(history.present.annotations).toHaveLength(0);
    });
  });

  describe('Challenger 5: Additive Multi-Region 2D Canvas Export Stress', () => {
    it('C5.1: 50 overlapping highlight regions punch cleanly without extra drawImage layers', async () => {
      const fiftyHighlights: Annotation[] = Array.from({ length: 50 }, (_, i) => ({
        id: `hl-${i}`,
        index: i + 1,
        geometry: {
          type: 'highlight',
          x: 100 + (i * 15),
          y: 100 + (i * 10),
          width: 200,
          height: 150,
          borderRadius: 4,
        },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: `Highlight #${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      const canvas = await renderCompositeCanvas(mockBaseImage, fiftyHighlights);
      const ctx = canvas.getContext('2d')!;

      // Exactly 2 drawImage calls: base image + 1 unified offscreen spotlight backdrop
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);

      const offscreen = vi.mocked(ctx.drawImage).mock.calls[1][0] as HTMLCanvasElement;
      const offscreenCtx = offscreen.getContext('2d')!;
      // 50 cutout punches on the single offscreen canvas
      expect(offscreenCtx.fill).toHaveBeenCalledTimes(50);
      expect(offscreenCtx.globalCompositeOperation).toBe('destination-out');
    });

    it('C5.2: Preserves custom borderRadius = 0 and custom radius in export', async () => {
      const sharpHl: Annotation = {
        id: 'sharp',
        index: 1,
        geometry: { type: 'highlight', x: 50, y: 50, width: 100, height: 100, borderRadius: 0 },
        style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0.15 },
        note: 'Sharp corners',
        createdAt: 1,
        updatedAt: 1,
      };

      const roundHl: Annotation = {
        id: 'round',
        index: 2,
        geometry: { type: 'highlight', x: 200, y: 50, width: 100, height: 100, borderRadius: 20 },
        style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0.15 },
        note: 'Extra round corners',
        createdAt: 2,
        updatedAt: 2,
      };

      const canvas = await renderCompositeCanvas(mockBaseImage, [sharpHl, roundHl]);
      const ctx = canvas.getContext('2d')!;

      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      const offscreen = vi.mocked(ctx.drawImage).mock.calls[1][0] as HTMLCanvasElement;
      const offscreenCtx = offscreen.getContext('2d')!;
      expect(offscreenCtx.roundRect).toHaveBeenCalledWith(50, 50, 100, 100, 0);
      expect(offscreenCtx.roundRect).toHaveBeenCalledWith(200, 50, 100, 100, 20);
    });

    it('C5.3: Mixed canvas export: highlights, boxes, arrows, and pins in single composite', async () => {
      const mixedAnnotations: Annotation[] = [
        {
          id: 'hl-1',
          index: 1,
          geometry: { type: 'highlight', x: 100, y: 100, width: 200, height: 150 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Spotlight',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'box-1',
          index: 2,
          geometry: { type: 'box', x: 120, y: 120, width: 80, height: 60 },
          style: { color: 'red', strokeWidth: 3, fillOpacity: 0.2 },
          note: 'Target inside highlight',
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: 'arrow-1',
          index: 3,
          geometry: { type: 'arrow', startX: 400, startY: 300, endX: 200, endY: 180 },
          style: { color: 'amber', strokeWidth: 6, fillOpacity: 1.0 },
          note: 'Pointer into highlight',
          createdAt: 3,
          updatedAt: 3,
        },
      ];

      const canvas = await renderCompositeCanvas(mockBaseImage, mixedAnnotations);
      const ctx = canvas.getContext('2d')!;

      // 1 base image + 1 spotlight backdrop
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      // All 3 badges rendered (fillText called for indices 1, 2, 3)
      expect(ctx.fillText).toHaveBeenCalledWith('1', expect.any(Number), expect.any(Number));
      expect(ctx.fillText).toHaveBeenCalledWith('2', expect.any(Number), expect.any(Number));
      expect(ctx.fillText).toHaveBeenCalledWith('3', expect.any(Number), expect.any(Number));
    });
  });
});
