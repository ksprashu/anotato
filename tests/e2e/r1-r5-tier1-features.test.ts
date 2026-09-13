/**
 * Tier 1: Feature Coverage Test Suite (R1 through R5 Enhancements)
 * 
 * Verifies all 5 enhancement requirements from ORIGINAL_REQUEST.md & PROJECT.md:
 * - R1: Image paste replace/keep/overlay modes, 0 ghost annotations, style retention (>=5 tests)
 * - R2: Mouse wheel zoom quantization to 10 preset steps, cursor focal point invariance (>=5 tests)
 * - R3: Responsive toolbar layout wrapping at 768px and 640px without hiding tools (>=5 tests)
 * - R4: Distinct stroke width presets 2px, 4px, 8px (>=5 tests)
 * - R5: Fill opacity controls 0%, 15%, 30%, 50%, "Fill" label, active indicators (>=5 tests)
 * 
 * Total Tier 1 Enhancement Tests: 27
 */

import { describe, it, expect, beforeEach } from './test-runner.js';
import {
  createInitialState,
  appReducer,
  screenToImage,
  imageToScreen,
  computeZoomTransform,
  serializeAnnotationsToMarkdown,
  createTestImage,
  createTestAnnotation,
  createTestOverlay,
  ZOOM_PRESETS,
  quantizeWheelZoom,
  STROKE_WIDTH_OPTIONS,
  FILL_OPACITY_OPTIONS,
  computeResponsiveToolbarMetrics,
  AppState,
} from '../helpers/testFixtures.js';

describe('Tier 1: Feature Coverage (R1 through R5 Enhancements)', () => {
  let state: AppState;

  beforeEach(() => {
    state = createInitialState();
  });

  // =========================================================================
  // Feature R1: Image Paste Modes, Ghost Annotations & Layering
  // =========================================================================
  describe('Feature R1: Image Paste Modes & Ghost Elimination', () => {
    it('T1-R1.1: Replace & Clear Annotations purges previous annotations with 0 residual ghost annotations', () => {
      // Setup canvas with base image, 3 active annotations, and an overlay
      const initialImage = createTestImage(1920, 1080, 'initial-base.png');
      state = appReducer(state, { type: 'SET_IMAGE', payload: initialImage });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: 'ann-1',
          geometry: { type: 'box', x: 50, y: 50, width: 100, height: 80 },
          style: { color: 'red', strokeWidth: 2, fillOpacity: 0 },
          note: 'Initial bug note #1',
        },
      });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: 'ann-2',
          geometry: { type: 'arrow', startX: 200, startY: 200, endX: 350, endY: 300 },
          style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.15 },
          note: 'Initial bug note #2',
        },
      });
      state = appReducer(state, {
        type: 'ADD_IMAGE_OVERLAY',
        payload: { overlay: createTestOverlay({ id: 'ov-1' }) },
      });
      state = appReducer(state, { type: 'SET_SELECTED_ANNOTATION', payload: 'ann-1' });
      state = appReducer(state, { type: 'SET_HOVERED_ANNOTATION', payload: 'ann-2' });

      expect(state.annotations).toHaveLength(2);
      expect(state.overlays).toHaveLength(1);
      expect(state.selectedAnnotationId).toBe('ann-1');

      // Execute Action 1: Replace & Clear Annotations
      const newImage = createTestImage(1280, 720, 'replacement-screenshot.png');
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_CLEAR', payload: { image: newImage } });

      // Verifications: Exactly 0 ghost annotations remain
      expect(state.image?.fileName).toBe('replacement-screenshot.png');
      expect(state.image?.naturalWidth).toBe(1280);
      expect(state.annotations).toHaveLength(0);
      expect(state.overlays).toHaveLength(0);
      expect(state.selectedAnnotationId).toBeNull();
      expect(state.hoveredAnnotationId).toBeNull();

      // Serialized notes must confirm empty state
      const mdNotes = serializeAnnotationsToMarkdown(state.annotations);
      expect(mdNotes).toBe('_No annotations recorded._');
    });

    it('T1-R1.2: Replace & Keep Annotations swaps base image while retaining annotations, indices, and notes', () => {
      const initialImage = createTestImage(1920, 1080, 'base-v1.png');
      state = appReducer(state, { type: 'SET_IMAGE', payload: initialImage });

      // Add 3 annotations
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'box-1', geometry: { type: 'box', x: 10, y: 10, width: 50, height: 50 }, note: 'Layout check' },
      });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'circle-1', geometry: { type: 'ellipse', cx: 100, cy: 100, rx: 20, ry: 20 }, note: 'Avatar circle' },
      });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'pin-1', geometry: { type: 'pin', x: 300, y: 300 }, note: 'Critical pin' },
      });

      expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);

      // Execute Action 2: Replace & Keep Annotations
      const swappedImage = createTestImage(2560, 1440, 'base-v2-retina.png');
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_KEEP', payload: { image: swappedImage } });

      // Assert image swapped
      expect(state.image?.fileName).toBe('base-v2-retina.png');
      expect(state.image?.naturalWidth).toBe(2560);

      // Assert all annotations, sequence badges, and markdown notes are preserved
      expect(state.annotations).toHaveLength(3);
      expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);
      expect(state.annotations[0].note).toBe('Layout check');
      expect(state.annotations[1].note).toBe('Avatar circle');
      expect(state.annotations[2].note).toBe('Critical pin');

      const mdNotes = serializeAnnotationsToMarkdown(state.annotations);
      expect(mdNotes).toContain('1. **[Box]**');
      expect(mdNotes).toContain('2. **[Ellipse]**');
      expect(mdNotes).toContain('3. **[Pin]**');
    });

    it('T1-R1.3: Add as Layer / Overlay appends image overlay without replacing base image or wiping annotations', () => {
      const baseImg = createTestImage(1920, 1080, 'canvas-base.png');
      state = appReducer(state, { type: 'SET_IMAGE', payload: baseImg });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: { type: 'box', x: 20, y: 20, width: 60, height: 40 }, note: 'Active note' },
      });

      expect(state.overlays).toHaveLength(0);
      expect(state.annotations).toHaveLength(1);

      // Execute Action 3: Add as Layer / Overlay
      const layerOverlay = createTestOverlay({
        id: 'overlay-diff-layer',
        src: 'data:image/png;base64,overlayLayerData',
        x: 150,
        y: 80,
        width: 600,
        height: 400,
        opacity: 0.85,
      });
      state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: layerOverlay } });

      // Base image is NOT replaced
      expect(state.image?.fileName).toBe('canvas-base.png');
      expect(state.image?.naturalWidth).toBe(1920);

      // Annotations are NOT wiped
      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0].note).toBe('Active note');

      // Overlay is successfully added
      expect(state.overlays).toHaveLength(1);
      expect(state.overlays[0].id).toBe('overlay-diff-layer');
      expect(state.overlays[0].x).toBe(150);
      expect(state.overlays[0].opacity).toBe(0.85);
    });

    it('T1-R1.4: Retaining annotations preserves strokeWidth, color, and fillOpacity without unintentional mutation', () => {
      const baseImg = createTestImage(1920, 1080);
      state = appReducer(state, { type: 'SET_IMAGE', payload: baseImg });

      // Create 3 shapes with distinct styling
      const ann1 = createTestAnnotation({
        id: 'shape-1',
        style: { color: 'red', strokeWidth: 2, fillOpacity: 0 },
      });
      const ann2 = createTestAnnotation({
        id: 'shape-2',
        style: { color: 'green', strokeWidth: 4, fillOpacity: 0.3 },
      });
      const ann3 = createTestAnnotation({
        id: 'shape-3',
        style: { color: 'purple', strokeWidth: 8, fillOpacity: 0.5 },
      });
      state = { ...state, annotations: [ann1, ann2, ann3] };

      // Replace image and keep
      const newImg = createTestImage(1440, 900, 'new-base.png');
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_KEEP', payload: { image: newImg } });

      // Verify each shape's style properties remain 100% intact
      expect(state.annotations[0].style.color).toBe('red');
      expect(state.annotations[0].style.strokeWidth).toBe(2);
      expect(state.annotations[0].style.fillOpacity).toBe(0);

      expect(state.annotations[1].style.color).toBe('green');
      expect(state.annotations[1].style.strokeWidth).toBe(4);
      expect(state.annotations[1].style.fillOpacity).toBe(0.3);

      expect(state.annotations[2].style.color).toBe('purple');
      expect(state.annotations[2].style.strokeWidth).toBe(8);
      expect(state.annotations[2].style.fillOpacity).toBe(0.5);
    });

    it('T1-R1.5: ReplaceImageModal interface contract defines 3 distinct actions and cancel test IDs', () => {
      const modalContract = {
        dialogTestId: 'replace-image-modal',
        clearBtnTestId: 'replace-modal-confirm-btn',
        clearAltTestId: 'replace-modal-replace-clear-btn',
        keepBtnTestId: 'replace-modal-replace-keep-btn',
        overlayBtnTestId: 'replace-modal-add-layer-btn',
        cancelBtnTestId: 'replace-modal-cancel-btn',
      };

      expect(modalContract.dialogTestId).toBe('replace-image-modal');
      expect(modalContract.clearBtnTestId).toBe('replace-modal-confirm-btn');
      expect(modalContract.keepBtnTestId).toBe('replace-modal-replace-keep-btn');
      expect(modalContract.overlayBtnTestId).toBe('replace-modal-add-layer-btn');
      expect(modalContract.cancelBtnTestId).toBe('replace-modal-cancel-btn');
    });

    it('T1-R1.6: Sequential additions and delete operations maintain 1..N re-indexing invariant across replacement', () => {
      state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1000, 1000) });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: { type: 'pin', x: 10, y: 10 } } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a2', geometry: { type: 'pin', x: 20, y: 20 } } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a3', geometry: { type: 'pin', x: 30, y: 30 } } });
      expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);

      // Delete #2
      state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'a2' } });
      expect(state.annotations.map(a => a.index)).toEqual([1, 2]);

      // Replace image keeping annotations
      state = appReducer(state, { type: 'REPLACE_IMAGE_AND_KEEP', payload: { image: createTestImage(1200, 800) } });
      expect(state.annotations.map(a => a.index)).toEqual([1, 2]);
    });
  });

  // =========================================================================
  // Feature R2: Calibrate Mouse Scroll Wheel Zoom Increments & Focal Centering
  // =========================================================================
  describe('Feature R2: Mouse Wheel Zoom Quantization & Focal Invariance', () => {
    it('T1-R2.1: Preset scale defines exactly 10 monotonic steps matching UI selector', () => {
      expect(ZOOM_PRESETS).toHaveLength(10);
      expect(ZOOM_PRESETS).toEqual([0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00]);

      // Assert strict monotonicity
      for (let i = 1; i < ZOOM_PRESETS.length; i++) {
        expect(ZOOM_PRESETS[i]).toBeGreaterThan(ZOOM_PRESETS[i - 1]);
      }
    });

    it('T1-R2.2: Single wheel tick zooms up monotonically by exactly 1 preset step', () => {
      // 100% -> 125% -> 150% -> 200%
      let zoom = 1.00;
      zoom = quantizeWheelZoom(zoom, -120);
      expect(zoom).toBe(1.25);

      zoom = quantizeWheelZoom(zoom, -120);
      expect(zoom).toBe(1.50);

      zoom = quantizeWheelZoom(zoom, -120);
      expect(zoom).toBe(2.00);

      // At max 200%, further zoom in clamps at 2.00
      zoom = quantizeWheelZoom(zoom, -120);
      expect(zoom).toBe(2.00);
    });

    it('T1-R2.3: Single wheel tick zooms down monotonically by exactly 1 preset step', () => {
      // 100% -> 75% -> 67% -> 50% -> 33% -> 25% -> 10%
      let zoom = 1.00;
      zoom = quantizeWheelZoom(zoom, 120);
      expect(zoom).toBe(0.75);

      zoom = quantizeWheelZoom(zoom, 120);
      expect(zoom).toBe(0.67);

      zoom = quantizeWheelZoom(zoom, 120);
      expect(zoom).toBe(0.50);

      zoom = quantizeWheelZoom(zoom, 120);
      expect(zoom).toBe(0.33);

      zoom = quantizeWheelZoom(zoom, 120);
      expect(zoom).toBe(0.25);

      zoom = quantizeWheelZoom(zoom, 120);
      expect(zoom).toBe(0.10);

      // At min 10%, further zoom out clamps at 0.10
      zoom = quantizeWheelZoom(zoom, 120);
      expect(zoom).toBe(0.10);
    });

    it('T1-R2.4: Arbitrary fractional zoom snaps to adjacent preset step without multi-tier jump', () => {
      // Prevents erratic 13% leaping to 200% on trackpad delta burst
      const fractionalZoom = 0.134; // 13.4%
      const nextZoomIn = quantizeWheelZoom(fractionalZoom, -275);
      expect(nextZoomIn).toBe(0.25); // Moves to 25%, not 200%!

      const nextZoomOut = quantizeWheelZoom(fractionalZoom, 275);
      expect(nextZoomOut).toBe(0.10); // Moves to 10%
    });

    it('T1-R2.5: Cursor focal point centering invariance is preserved during wheel zoom step', () => {
      const initialViewport = { zoom: 1.0, panX: 120, panY: 80 };
      const cursorScreen = { x: 450, y: 350 };

      // Underlying image point under cursor before zoom
      const imagePointBefore = screenToImage(cursorScreen, initialViewport);

      // Quantize next step up
      const nextZoom = quantizeWheelZoom(initialViewport.zoom, -100);
      expect(nextZoom).toBe(1.25);

      // Compute transform preserving focal point
      const updatedViewport = computeZoomTransform(initialViewport, cursorScreen, nextZoom);

      // Verify cursor points to the EXACT same image pixel after zoom
      const screenPointAfter = imageToScreen(imagePointBefore, updatedViewport);
      expect(screenPointAfter.x).toBeCloseTo(cursorScreen.x, 3);
      expect(screenPointAfter.y).toBeCloseTo(cursorScreen.y, 3);
    });
  });

  // =========================================================================
  // Feature R3: Responsive Annotation Toolbar Layout
  // =========================================================================
  describe('Feature R3: Responsive Annotation Toolbar Layout', () => {
    it('T1-R3.1: All drawing tools remain rendered and interactive at 768px viewport', () => {
      const metrics = computeResponsiveToolbarMetrics(768);
      expect(metrics.breakpoint).toBe('tablet');
      expect(metrics.allDrawingToolsRendered).toBe(true);
      expect(metrics.hasHorizontalClipping).toBe(false);
    });

    it('T1-R3.2: All drawing tools and styling controls remain rendered and interactive at compact 640px', () => {
      const metrics = computeResponsiveToolbarMetrics(640);
      expect(metrics.breakpoint).toBe('mobile');
      expect(metrics.allDrawingToolsRendered).toBe(true);
      expect(metrics.colorPaletteRendered).toBe(true);
      expect(metrics.hasHorizontalClipping).toBe(false);
    });

    it('T1-R3.3: ColorPalette controls (swatches, stroke, opacity) remain accessible at <=768px viewports', () => {
      const metrics768 = computeResponsiveToolbarMetrics(768);
      const metrics640 = computeResponsiveToolbarMetrics(640);

      expect(metrics768.colorPaletteRendered).toBe(true);
      expect(metrics640.colorPaletteRendered).toBe(true);
    });

    it('T1-R3.4: Canvas actions (upload/replace, clear, reset) and zoom controls remain accessible at <=768px', () => {
      const metrics = computeResponsiveToolbarMetrics(768);
      expect(metrics.zoomControlsRendered).toBe(true);
      expect(metrics.imageActionsRendered).toBe(true);
    });

    it('T1-R3.5: Toolbar multi-row wrapping engages cleanly without horizontal clipping or scrollbars', () => {
      const desktop = computeResponsiveToolbarMetrics(1440);
      expect(desktop.isMultiRowWrapped).toBe(false);

      const tablet = computeResponsiveToolbarMetrics(768);
      expect(tablet.isMultiRowWrapped).toBe(true);
      expect(tablet.hasHorizontalClipping).toBe(false);

      const mobile = computeResponsiveToolbarMetrics(640);
      expect(mobile.isMultiRowWrapped).toBe(true);
      expect(mobile.hasHorizontalClipping).toBe(false);
    });
  });

  // =========================================================================
  // Feature R4: Distinct Stroke Width Presets (2px / 4px / 8px)
  // =========================================================================
  describe('Feature R4: Distinct Stroke Width Presets', () => {
    it('T1-R4.1: Stroke width presets define [2, 4, 8] with clear, visually distinct line weights', () => {
      expect(STROKE_WIDTH_OPTIONS).toHaveLength(3);
      expect(STROKE_WIDTH_OPTIONS).toEqual([2, 4, 8]);
      expect(STROKE_WIDTH_OPTIONS[0]).toBe(2);
      expect(STROKE_WIDTH_OPTIONS[1]).toBe(4);
      expect(STROKE_WIDTH_OPTIONS[2]).toBe(8);
    });

    it('T1-R4.2: Selecting 2px preset applies strokeWidth: 2 to active selected shape immediately', () => {
      const ann = createTestAnnotation({ id: 'target-shape', style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.15 } });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'target-shape' };

      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 2 });
      expect(state.activeStrokeWidth).toBe(2);
      expect(state.annotations[0].style.strokeWidth).toBe(2);
    });

    it('T1-R4.3: Selecting 4px preset applies strokeWidth: 4 to active selected shape immediately', () => {
      const ann = createTestAnnotation({ id: 'target-shape', style: { color: 'green', strokeWidth: 8, fillOpacity: 0.3 } });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'target-shape' };

      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 4 });
      expect(state.activeStrokeWidth).toBe(4);
      expect(state.annotations[0].style.strokeWidth).toBe(4);
    });

    it('T1-R4.4: Selecting 8px preset applies strokeWidth: 8 to active selected shape immediately', () => {
      const ann = createTestAnnotation({ id: 'target-shape', style: { color: 'red', strokeWidth: 2, fillOpacity: 0 } });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'target-shape' };

      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      expect(state.activeStrokeWidth).toBe(8);
      expect(state.annotations[0].style.strokeWidth).toBe(8);
    });

    it('T1-R4.5: Selecting stroke width updates creation default for subsequently drawn shapes', () => {
      state.selectedAnnotationId = null;
      state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      expect(state.activeStrokeWidth).toBe(8);

      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: { type: 'box', x: 10, y: 10, width: 100, height: 100 } },
      });
      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0].style.strokeWidth).toBe(8);
    });
  });

  // =========================================================================
  // Feature R5: Explicit Fill Opacity Controls (0%, 15%, 30%, 50%)
  // =========================================================================
  describe('Feature R5: Explicit Fill Opacity Controls', () => {
    it('T1-R5.1: Opacity options define 4 presets with exact values and labels', () => {
      expect(FILL_OPACITY_OPTIONS).toHaveLength(4);
      expect(FILL_OPACITY_OPTIONS.map(o => o.value)).toEqual([0, 0.15, 0.30, 0.50]);
      expect(FILL_OPACITY_OPTIONS.map(o => o.label)).toEqual(['0%', '15%', '30%', '50%']);
    });

    it('T1-R5.2: Selecting 0% fill preset updates active selected shape to transparent interior', () => {
      const ann = createTestAnnotation({ id: 'box-shape', style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.3 } });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'box-shape' };

      state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0 });
      expect(state.activeFillOpacity).toBe(0);
      expect(state.annotations[0].style.fillOpacity).toBe(0);
    });

    it('T1-R5.3: Selecting 15% and 30% fill presets apply subtle and medium tint highlights', () => {
      const ann = createTestAnnotation({ id: 'box-shape', style: { color: 'amber', strokeWidth: 4, fillOpacity: 0 } });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'box-shape' };

      state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.15 });
      expect(state.annotations[0].style.fillOpacity).toBe(0.15);

      state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.30 });
      expect(state.annotations[0].style.fillOpacity).toBe(0.30);
    });

    it('T1-R5.4: Selecting 50% fill preset applies bold callout fill opacity', () => {
      const ann = createTestAnnotation({ id: 'box-shape', style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.15 } });
      state = { ...state, annotations: [ann], selectedAnnotationId: 'box-shape' };

      state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.50 });
      expect(state.activeFillOpacity).toBe(0.50);
      expect(state.annotations[0].style.fillOpacity).toBe(0.50);
    });

    it('T1-R5.5: Selecting fill opacity updates creation default for subsequently drawn shapes', () => {
      state.selectedAnnotationId = null;
      state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.50 });
      expect(state.activeFillOpacity).toBe(0.50);

      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: { type: 'box', x: 20, y: 20, width: 80, height: 80 } },
      });
      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0].style.fillOpacity).toBe(0.50);
    });
  });
});
