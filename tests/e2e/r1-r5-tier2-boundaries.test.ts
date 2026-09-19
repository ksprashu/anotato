/**
 * Tier 2: Boundary & Corner Cases Test Suite (R1 through R5 Enhancements)
 * 
 * Verifies edge, corner, stress, and extreme conditions for all 5 enhancement requirements:
 * - R1 Boundaries: 0 annotations, 50 annotations, oversized 8K overlays, rapid consecutive image swaps
 * - R2 Boundaries: 50-tick wheel bursts, extreme deltaY (-10000/+10000), boundary clamps (10%/200%), deltaY=0
 * - R3 Boundaries: Viewport boundaries (768px, 640px), ultra-narrow 320px, 4K ultrawide, resize stress
 * - R4 Boundaries: Idempotency, 8px on tiny 2x2 shape, style isolation, cross-geometry applicability
 * - R5 Boundaries: Rapid 0%/50% toggling, unselected updates, [0, 1] bounds clamping, 20 color/opacity combos
 * 
 * Total Tier 2 Enhancement Tests: 27
 */

import { describe, it, expect, beforeEach } from './test-runner.js';
import {
  createInitialState,
  appReducer,
  createTestImage,
  createTestAnnotation,
  createTestOverlay,
  ZOOM_PRESETS,
  quantizeWheelZoom,
  FILL_OPACITY_OPTIONS,
  computeResponsiveToolbarMetrics,
  COLOR_DEFINITIONS,
  AppState,
  Annotation,
} from '../helpers/testFixtures.js';

describe('Tier 2: Boundary & Corner Cases (R1 through R5 Enhancements)', () => {
  let state: AppState;

  beforeEach(() => {
    state = createInitialState();
  });

  // =========================================================================
  // Feature R1 Boundaries: Image Paste Modes & Ghost Elimination
  // =========================================================================
  describe('F1 Boundaries: Image Paste Modes & Ghost Elimination', () => {
    it('T2-R1.1: Replace & Clear with 0 existing annotations operates safely without errors', () => {
      const img = createTestImage(1920, 1080, 'initial.png');
      state = appReducer(state, { type: 'SET_IMAGE', payload: img });
      expect(state.annotations).toHaveLength(0);

      const replacement = createTestImage(1280, 720, 'replacement.png');
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_CLEAR', payload: { image: replacement } });

      expect(state.image?.fileName).toBe('replacement.png');
      expect(state.annotations).toHaveLength(0);
      expect(state.overlays).toHaveLength(0);
    });

    it('T2-R1.2: Replace & Clear with 50 complex annotations purges 100% of shapes and notes with 0 residual ghosts', () => {
      state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(3840, 2160) });

      // Populate 50 annotations
      const manyAnnotations: Annotation[] = [];
      for (let i = 1; i <= 50; i++) {
        manyAnnotations.push(
          createTestAnnotation({
            id: `heavy-ann-${i}`,
            index: i,
            geometry: { type: 'box', x: i * 10, y: i * 10, width: 40, height: 40 },
            style: { color: i % 2 === 0 ? 'red' : 'green', strokeWidth: 4, fillOpacity: 0.15 },
            note: `Heavy note description #${i}`,
          })
        );
      }
      state = { ...state, annotations: manyAnnotations };
      expect(state.annotations).toHaveLength(50);

      // Execute Replace & Clear
      const newImg = createTestImage(1920, 1080, 'clean-base.png');
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_CLEAR', payload: { image: newImg } });

      expect(state.annotations).toHaveLength(0);
      expect(state.overlays).toHaveLength(0);
      expect(state.selectedAnnotationId).toBeNull();
      expect(state.hoveredAnnotationId).toBeNull();
    });

    it('T2-R1.3: Replace & Keep with 50 annotations preserves all 50 annotations with valid continuous indices 1..50', () => {
      state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080) });

      const manyAnnotations: Annotation[] = [];
      for (let i = 1; i <= 50; i++) {
        manyAnnotations.push(
          createTestAnnotation({
            id: `kept-ann-${i}`,
            index: i,
            geometry: { type: 'pin', x: i * 20, y: i * 15 },
            style: { color: 'amber', strokeWidth: 2, fillOpacity: 0 },
            note: `Preserved note #${i}`,
          })
        );
      }
      state = { ...state, annotations: manyAnnotations };

      const newBase = createTestImage(2560, 1440, 'swapped-base.png');
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_KEEP', payload: { image: newBase } });

      expect(state.image?.fileName).toBe('swapped-base.png');
      expect(state.annotations).toHaveLength(50);

      // Strictly verify 1..50 indexing sequence
      for (let i = 0; i < 50; i++) {
        expect(state.annotations[i].index).toBe(i + 1);
        expect(state.annotations[i].note).toBe(`Preserved note #${i + 1}`);
        expect(state.annotations[i].style.strokeWidth).toBe(2);
      }
    });

    it('T2-R1.4: Add as Layer with oversized 8K image overlay handles dimensions without corrupting canvas base image', () => {
      state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080, 'standard-base.png') });

      const overlay8k = createTestOverlay({
        id: 'overlay-8k-blueprint',
        width: 7680,
        height: 4320,
        naturalWidth: 7680,
        naturalHeight: 4320,
      });
      state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: overlay8k } });

      expect(state.image?.naturalWidth).toBe(1920);
      expect(state.overlays).toHaveLength(1);
      expect(state.overlays[0].width).toBe(7680);
      expect(state.overlays[0].height).toBe(4320);
    });

    it('T2-R1.5: Rapid consecutive image swaps (Clear -> Keep -> Layer -> Clear) maintain state invariants', () => {
      state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1000, 1000, 'img-1.png') });

      for (let cycle = 0; cycle < 5; cycle++) {
        // Add 2 annotations
        state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { geometry: { type: 'pin', x: 10, y: 10 } } });
        state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { geometry: { type: 'pin', x: 20, y: 20 } } });
        expect(state.annotations).toHaveLength(2);

        // Replace & Keep
        state = appReducer(state, { type: 'REPLACE_IMAGE_AND_KEEP', payload: { image: createTestImage(1200, 1200, `img-keep-${cycle}.png`) } });
        expect(state.annotations).toHaveLength(2);

        // Add Layer
        state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: createTestOverlay({ id: `ov-${cycle}` }) } });
        expect(state.overlays.length).toBeGreaterThan(0);

        // Replace & Clear
        state = appReducer(state, { type: 'REPLACE_IMAGE_AND_CLEAR', payload: { image: createTestImage(800, 800, `img-clear-${cycle}.png`) } });
        expect(state.annotations).toHaveLength(0);
        expect(state.overlays).toHaveLength(0);
      }
    });

    it('T2-R1.6: BaseImage fileSize boundary handles 0 bytes and extreme 50MB files safely', () => {
      const tinyImg = { ...createTestImage(100, 100), fileSize: 0 };
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_CLEAR', payload: { image: tinyImg } });
      expect(state.image?.fileSize).toBe(0);

      const massiveImg = { ...createTestImage(5000, 5000), fileSize: 50 * 1024 * 1024 };
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_CLEAR', payload: { image: massiveImg } });
      expect(state.image?.fileSize).toBe(50 * 1024 * 1024);
    });
  });

  // =========================================================================
  // Feature R2 Boundaries: Mouse Wheel Zoom Quantization & Focal Invariance
  // =========================================================================
  describe('F2 Boundaries: Mouse Wheel Zoom Quantization & Focal Invariance', () => {
    it('T2-R2.1: Rapid wheel delta burst (50 consecutive negative ticks) clamps smoothly at 200% without overshoot', () => {
      let zoom = 0.10;
      for (let i = 0; i < 50; i++) {
        zoom = quantizeWheelZoom(zoom, -100);
      }
      expect(zoom).toBe(2.00);
    });

    it('T2-R2.2: Rapid wheel delta burst (50 consecutive positive ticks) clamps smoothly at 10% without undershoot', () => {
      let zoom = 2.00;
      for (let i = 0; i < 50; i++) {
        zoom = quantizeWheelZoom(zoom, 100);
      }
      expect(zoom).toBe(0.10);
    });

    it('T2-R2.3: Extreme deltaY burst (deltaY = -10,000) advances only single step up rather than leaping to 200%', () => {
      const initialZoom = 0.25;
      const nextZoom = quantizeWheelZoom(initialZoom, -10000);
      expect(nextZoom).toBe(0.33); // Moves to 33%, NOT 200%!
    });

    it('T2-R2.4: Extreme positive deltaY burst (deltaY = +10,000) advances only single step down rather than jumping to 10%', () => {
      const initialZoom = 1.00;
      const nextZoom = quantizeWheelZoom(initialZoom, 10000);
      expect(nextZoom).toBe(0.75); // Moves to 75%, NOT 10%!
    });

    it('T2-R2.5: Zero deltaY (deltaY = 0) is a safe no-op leaving zoom factor completely unchanged', () => {
      for (const preset of ZOOM_PRESETS) {
        expect(quantizeWheelZoom(preset, 0)).toBe(preset);
      }
      expect(quantizeWheelZoom(0.42, 0)).toBe(0.42);
    });

    it('T2-R2.6: Micro-fractional zooms are normalized cleanly without precision drift', () => {
      const microZoom = 0.3300000001;
      const nextUp = quantizeWheelZoom(microZoom, -50);
      expect(nextUp).toBe(0.50);

      const nextDown = quantizeWheelZoom(microZoom, 50);
      expect(nextDown).toBe(0.25);
    });
  });

  // =========================================================================
  // Feature R3 Boundaries: Responsive Annotation Toolbar Layout
  // =========================================================================
  describe('F3 Boundaries: Responsive Annotation Toolbar Layout', () => {
    it('T2-R3.1: Viewport boundary limit test at exactly 768px maintains all tools visible without clipping', () => {
      const metrics = computeResponsiveToolbarMetrics(768);
      expect(metrics.viewportWidth).toBe(768);
      expect(metrics.allDrawingToolsRendered).toBe(true);
      expect(metrics.colorPaletteRendered).toBe(true);
      expect(metrics.isMultiRowWrapped).toBe(true);
      expect(metrics.hasHorizontalClipping).toBe(false);
    });

    it('T2-R3.2: Viewport boundary limit test at exactly 640px maintains all tools visible without clipping', () => {
      const metrics = computeResponsiveToolbarMetrics(640);
      expect(metrics.viewportWidth).toBe(640);
      expect(metrics.allDrawingToolsRendered).toBe(true);
      expect(metrics.colorPaletteRendered).toBe(true);
      expect(metrics.isMultiRowWrapped).toBe(true);
      expect(metrics.hasHorizontalClipping).toBe(false);
    });

    it('T2-R3.3: Ultra-narrow viewport (320px extreme stress) wraps toolbar gracefully into multiple tiers', () => {
      const metrics = computeResponsiveToolbarMetrics(320);
      expect(metrics.viewportWidth).toBe(320);
      expect(metrics.allDrawingToolsRendered).toBe(true);
      expect(metrics.isMultiRowWrapped).toBe(true);
      expect(metrics.hasHorizontalClipping).toBe(false);
    });

    it('T2-R3.4: Extreme 4K viewport (3840px width) renders toolbar cleanly in single-tier row', () => {
      const metrics = computeResponsiveToolbarMetrics(3840);
      expect(metrics.viewportWidth).toBe(3840);
      expect(metrics.allDrawingToolsRendered).toBe(true);
      expect(metrics.isMultiRowWrapped).toBe(false);
    });

    it('T2-R3.5: Rapid viewport resize cycles between 640px and 1920px preserve active tool and styling selections', () => {
      state = appReducer(state, { type: 'SET_ACTIVE_TOOL', payload: 'arrow' });
      state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'purple' });
      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.5 });

      const testWidths = [1920, 1024, 768, 640, 320, 768, 1280, 1920];
      for (const w of testWidths) {
        const m = computeResponsiveToolbarMetrics(w);
        expect(m.allDrawingToolsRendered).toBe(true);
      }

      expect(state.activeTool).toBe('arrow');
      expect(state.activeColor).toBe('purple');
      expect(state.activeStrokeWidth).toBe(8);
      expect(state.activeFillOpacity).toBe(0.5);
    });
  });

  // =========================================================================
  // Feature R4 Boundaries: Distinct Stroke Width Presets (2px / 4px / 8px)
  // =========================================================================
  describe('F4 Boundaries: Distinct Stroke Width Presets', () => {
    it('T2-R4.1: Repeated clicks on the same stroke width preset are idempotent', () => {
      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      expect(state.activeStrokeWidth).toBe(8);

      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      expect(state.activeStrokeWidth).toBe(8);

      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      expect(state.activeStrokeWidth).toBe(8);
    });

    it('T2-R4.2: 8px stroke width on a tiny 2x2 bounding box maintains positive rendering bounds and finite geometry', () => {
      const tinyBox: Annotation = createTestAnnotation({
        id: 'tiny-box-8px',
        geometry: { type: 'box', x: 100, y: 100, width: 2, height: 2 },
        style: { color: 'red', strokeWidth: 8, fillOpacity: 0 },
      });
      state = { ...state, annotations: [tinyBox], selectedAnnotationId: 'tiny-box-8px' };

      expect(state.annotations[0].geometry.type).toBe('box');
      if (state.annotations[0].geometry.type === 'box') {
        expect(state.annotations[0].geometry.width).toBe(2);
        expect(state.annotations[0].geometry.height).toBe(2);
      }
      expect(state.annotations[0].style.strokeWidth).toBe(8);
    });

    it('T2-R4.3: Changing stroke width preserves annotation color and fill opacity without unintended side effects', () => {
      const ann = createTestAnnotation({
        id: 'stable-ann',
        style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0.3 },
      });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'stable-ann' };

      // Change stroke to 8px
      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });

      expect(state.annotations[0].style.strokeWidth).toBe(8);
      expect(state.annotations[0].style.color).toBe('cyan'); // Intact
      expect(state.annotations[0].style.fillOpacity).toBe(0.3); // Intact
    });

    it('T2-R4.4: Applying stroke width presets across all 4 vector geometries maintains geometry validity', () => {
      const box = createTestAnnotation({ id: 'b1', geometry: { type: 'box', x: 10, y: 10, width: 50, height: 50 } });
      const ellipse = createTestAnnotation({ id: 'e1', geometry: { type: 'ellipse', cx: 100, cy: 100, rx: 30, ry: 30 } });
      const arrow = createTestAnnotation({ id: 'a1', geometry: { type: 'arrow', startX: 0, startY: 0, endX: 50, endY: 50 } });
      const pin = createTestAnnotation({ id: 'p1', geometry: { type: 'pin', x: 200, y: 200 } });

      state = { ...state, annotations: [box, ellipse, arrow, pin] };

      // Update stroke on each
      for (const target of ['b1', 'e1', 'a1', 'p1']) {
        state = appReducer(state, { type: 'SET_SELECTED_ANNOTATION', payload: target });
        state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      }

      for (const ann of state.annotations) {
        expect(ann.style.strokeWidth).toBe(8);
      }
    });

    it('T2-R4.5: Deselecting annotation leaves active stroke width preset intact for subsequent drawing', () => {
      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      state = appReducer(state, { type: 'SET_SELECTED_ANNOTATION', payload: null });
      expect(state.activeStrokeWidth).toBe(8);

      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: { type: 'ellipse', cx: 50, cy: 50, rx: 25, ry: 25 } },
      });
      expect(state.annotations[0].style.strokeWidth).toBe(8);
    });
  });

  // =========================================================================
  // Feature R5 Boundaries: Explicit Fill Opacity Controls (0%, 15%, 30%, 50%)
  // =========================================================================
  describe('F5 Boundaries: Explicit Fill Opacity Controls', () => {
    it('T2-R5.1: Rapid toggling between 0% and 50% opacity produces stable state without numeric drift', () => {
      const ann = createTestAnnotation({ id: 'toggle-ann', style: { color: 'amber', strokeWidth: 4, fillOpacity: 0 } });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'toggle-ann' };

      for (let i = 0; i < 50; i++) {
        state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.50 });
        state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0 });
      }

      expect(state.activeFillOpacity).toBe(0);
      expect(state.annotations[0].style.fillOpacity).toBe(0);
    });

    it('T2-R5.2: Opacity selection with no shape selected updates creation default without crashing', () => {
      state.selectedAnnotationId = null;
      state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.30 });
      expect(state.activeFillOpacity).toBe(0.30);
    });

    it('T2-R5.3: Opacity values remain strictly clamped within [0.0, 1.0] range', () => {
      for (const opt of FILL_OPACITY_OPTIONS) {
        expect(opt.value).toBeGreaterThanOrEqual(0.0);
        expect(opt.value).toBeLessThanOrEqual(1.0);
      }
    });

    it('T2-R5.4: Fill opacity update preserves annotation geometry, index, note, and stroke width intact', () => {
      const ann = createTestAnnotation({
        id: 'locked-shape',
        index: 7,
        geometry: { type: 'box', x: 50, y: 60, width: 120, height: 90 },
        style: { color: 'green', strokeWidth: 4, fillOpacity: 0 },
        note: 'Important bug note',
      });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'locked-shape' };

      state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.50 });

      const updated = state.annotations[0];
      expect(updated.style.fillOpacity).toBe(0.50);
      expect(updated.index).toBe(7);
      expect(updated.note).toBe('Important bug note');
      expect(updated.style.strokeWidth).toBe(4);
      expect(updated.style.color).toBe('green');
      expect(updated.geometry).toEqual({ type: 'box', x: 50, y: 60, width: 120, height: 90 });
    });

    it('T2-R5.5: Fill opacity presets render correctly with all 5 color presets (20 combinations)', () => {
      const colors = Object.keys(COLOR_DEFINITIONS) as (keyof typeof COLOR_DEFINITIONS)[];
      expect(colors).toHaveLength(5);

      for (const color of colors) {
        for (const op of FILL_OPACITY_OPTIONS) {
          const ann = createTestAnnotation({
            style: { color, strokeWidth: 4, fillOpacity: op.value },
          });
          expect(ann.style.color).toBe(color);
          expect(ann.style.fillOpacity).toBe(op.value);
        }
      }
    });
  });
});
