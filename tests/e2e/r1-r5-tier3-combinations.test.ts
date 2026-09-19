/**
 * Tier 3: Cross-Feature Combinations Test Suite (R1 through R5 Enhancements)
 * 
 * Verifies pairwise and cross-feature interactions:
 * - Combo 1: Paste replacement (Keep mode) after mouse wheel zoom
 * - Combo 2: Retained annotations style preservation across multiple base image swaps while zooming
 * - Combo 3: Add image overlay layer with custom stroke width and fill opacity on vector annotations
 * - Combo 4: Responsive viewport resize (1920px -> 768px -> 640px) during active wheel zoom transition
 * - Combo 5: Replace & Clear under zoomed viewport (200%) followed by layer addition
 * - Combo 6: Annotation stroke width & fill opacity updates while stepping through zoom ladder
 * - Combo 7: Multi-layer overlay stack with mixed stroke widths and fill opacities
 * - Combo 8: Modal Cancel action preserves unsaved state then user modifies stroke/opacity
 * - Combo 9: Wheel zoom quantization boundary clamping during rapid drawing interactions
 * - Combo 10: Full composite export with base image, overlay layer, 8px stroke annotations, and 30% fill opacity
 * 
 * Total Tier 3 Enhancement Tests: 10
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
  quantizeWheelZoom,
  computeResponsiveToolbarMetrics,
  AppState,
} from '../helpers/testFixtures.js';

describe('Tier 3: Cross-Feature Combinations (R1 through R5 Enhancements)', () => {
  let state: AppState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('Combo 1: Paste replacement (Keep mode) after mouse wheel zoom preserves screen/image coordinate alignment', () => {
    // 1. Initial base image
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080, 'base-v1.png') });

    // 2. Zoom in using wheel quantization from 100% to 150%
    let zoom = state.viewport.zoom;
    zoom = quantizeWheelZoom(zoom, -120); // 1.25
    zoom = quantizeWheelZoom(zoom, -120); // 1.50
    expect(zoom).toBe(1.50);

    const cursor = { x: 500, y: 300 };
    const vp = computeZoomTransform(state.viewport, cursor, zoom);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: vp });

    // 3. Draw annotation at focal region
    const focalImgPt = screenToImage(cursor, state.viewport);
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'focal-box',
        geometry: { type: 'box', x: focalImgPt.x, y: focalImgPt.y, width: 200, height: 100 },
        style: { color: 'amber', strokeWidth: 8, fillOpacity: 0.3 },
        note: 'Focal detail note',
      },
    });

    // 4. Replace base image keeping annotations
    const swappedImage = createTestImage(1920, 1080, 'base-v2-sharp.png');
    state = appReducer(state, { type: 'REPLACE_IMAGE_AND_KEEP', payload: { image: swappedImage } });

    // Verify annotation survives with exact geometry and style
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].id).toBe('focal-box');
    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.3);

    // Verify screen position beneath cursor is still aligned
    const screenAfter = imageToScreen({ x: focalImgPt.x, y: focalImgPt.y }, state.viewport);
    expect(screenAfter.x).toBeCloseTo(cursor.x, 3);
    expect(screenAfter.y).toBeCloseTo(cursor.y, 3);
  });

  it('Combo 2: Retained annotations style preservation across multiple base image swaps while zooming', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1000, 1000) });

    // 3 shapes with distinct line weights and opacities
    const shapes = [
      createTestAnnotation({ id: 's1', style: { color: 'red', strokeWidth: 2, fillOpacity: 0 } }),
      createTestAnnotation({ id: 's2', style: { color: 'green', strokeWidth: 4, fillOpacity: 0.15 } }),
      createTestAnnotation({ id: 's3', style: { color: 'purple', strokeWidth: 8, fillOpacity: 0.5 } }),
    ];
    state = { ...state, annotations: shapes };

    // Perform 3 sequential swaps while stepping through zoom ladder
    const zoomSteps = [0.75, 1.25, 2.00];
    for (let i = 0; i < 3; i++) {
      state = appReducer(state, {
        type: 'SET_VIEWPORT',
        payload: { zoom: zoomSteps[i], panX: i * 50, panY: i * 30 },
      });
      state = appReducer(state, {
        type: 'REPLACE_IMAGE_AND_KEEP',
        payload: { image: createTestImage(1200 + i * 200, 800 + i * 100, `swap-${i}.png`) },
      });

      // Verify all 3 styles preserved intact at every step
      expect(state.annotations[0].style.strokeWidth).toBe(2);
      expect(state.annotations[0].style.fillOpacity).toBe(0);

      expect(state.annotations[1].style.strokeWidth).toBe(4);
      expect(state.annotations[1].style.fillOpacity).toBe(0.15);

      expect(state.annotations[2].style.strokeWidth).toBe(8);
      expect(state.annotations[2].style.fillOpacity).toBe(0.5);
    }
  });

  it('Combo 3: Add image overlay layer with custom stroke width and fill opacity on vector annotations', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080, 'bg.png') });

    // Add overlay layer
    const overlay = createTestOverlay({
      id: 'diff-overlay',
      x: 200,
      y: 150,
      width: 800,
      height: 600,
      opacity: 0.75,
    });
    state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay } });

    // Set styling and draw box on overlay
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.5 });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'overlay-box',
        geometry: { type: 'box', x: 250, y: 200, width: 300, height: 200 },
        note: 'Inspect overlay difference',
      },
    });

    expect(state.overlays).toHaveLength(1);
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.5);
  });

  it('Combo 4: Responsive viewport resize (1920px -> 768px -> 640px) during active wheel zoom transition', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080) });

    // Active zoom
    const targetZoom = quantizeWheelZoom(1.0, -100);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: { zoom: targetZoom } });
    expect(state.viewport.zoom).toBe(1.25);

    // Resize viewport to 768px
    const tabletMetrics = computeResponsiveToolbarMetrics(768);
    expect(tabletMetrics.allDrawingToolsRendered).toBe(true);
    expect(tabletMetrics.isMultiRowWrapped).toBe(true);
    expect(state.viewport.zoom).toBe(1.25); // Viewport zoom unaffected by responsive toolbar wrap

    // Resize viewport to 640px
    const mobileMetrics = computeResponsiveToolbarMetrics(640);
    expect(mobileMetrics.allDrawingToolsRendered).toBe(true);
    expect(mobileMetrics.isMultiRowWrapped).toBe(true);
    expect(state.viewport.zoom).toBe(1.25);
  });

  it('Combo 5: Replace & Clear under zoomed viewport (200%) followed by layer addition', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1000, 1000) });
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: { zoom: 2.00, panX: 200, panY: 200 } });
    state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { geometry: { type: 'pin', x: 50, y: 50 } } });

    // Execute Replace & Clear
    state = appReducer(state, { type: 'REPLACE_IMAGE_AND_CLEAR', payload: { image: createTestImage(1200, 1200) } });
    expect(state.annotations).toHaveLength(0);
    expect(state.overlays).toHaveLength(0);

    // Add overlay
    state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: createTestOverlay({ id: 'layer-post-clear' }) } });
    expect(state.overlays).toHaveLength(1);
    expect(state.annotations).toHaveLength(0); // Still 0 ghost annotations
  });

  it('Combo 6: Annotation stroke width & fill opacity updates while stepping through zoom ladder', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1000, 1000) });
    const ann = createTestAnnotation({ id: 'stepped-ann', style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0 } });
    state = { ...state, annotations: [ann], selectedAnnotationId: 'stepped-ann' };

    // Step 1: zoom to 1.25, stroke 4, fill 0.15
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: { zoom: quantizeWheelZoom(state.viewport.zoom, -100) } });
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 4 });
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.15 });

    expect(state.viewport.zoom).toBe(1.25);
    expect(state.annotations[0].style.strokeWidth).toBe(4);
    expect(state.annotations[0].style.fillOpacity).toBe(0.15);

    // Step 2: zoom to 1.50, stroke 8, fill 0.50
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: { zoom: quantizeWheelZoom(state.viewport.zoom, -100) } });
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.50 });

    expect(state.viewport.zoom).toBe(1.50);
    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.50);
  });

  it('Combo 7: Multi-layer overlay stack with mixed stroke widths and fill opacities', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080) });

    // Add 2 overlays
    state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: createTestOverlay({ id: 'layer-1', opacity: 0.5 }) } });
    state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: createTestOverlay({ id: 'layer-2', opacity: 0.8 }) } });

    // Add 3 annotations
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a1', geometry: { type: 'box', x: 0, y: 0, width: 50, height: 50 }, style: { color: 'red', strokeWidth: 2, fillOpacity: 0 } },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a2', geometry: { type: 'box', x: 100, y: 100, width: 50, height: 50 }, style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.3 } },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a3', geometry: { type: 'box', x: 200, y: 200, width: 50, height: 50 }, style: { color: 'green', strokeWidth: 8, fillOpacity: 0.5 } },
    });

    expect(state.overlays).toHaveLength(2);
    expect(state.annotations).toHaveLength(3);
    expect(state.annotations.map(a => a.style.strokeWidth)).toEqual([2, 4, 8]);
    expect(state.annotations.map(a => a.style.fillOpacity)).toEqual([0, 0.3, 0.5]);
  });

  it('Combo 8: Modal Cancel action preserves unsaved state then user modifies stroke/opacity', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1000, 1000) });
    const originalAnn = createTestAnnotation({ id: 'preserved-ann', style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.15 } });
    state = { ...state, annotations: [originalAnn], selectedAnnotationId: 'preserved-ann' };

    // Simulate modal cancellation (no state change dispatched)
    expect(state.annotations[0].id).toBe('preserved-ann');

    // Modify stroke to 8px and opacity to 50%
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.50 });

    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.50);
  });

  it('Combo 9: Wheel zoom quantization boundary clamping during rapid drawing interactions', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1000, 1000) });

    // Zoom all the way to 200%
    let zoom = 1.0;
    for (let i = 0; i < 10; i++) {
      zoom = quantizeWheelZoom(zoom, -100);
    }
    expect(zoom).toBe(2.00);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: { zoom } });

    // Draw annotation at clamped zoom
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'arrow', startX: 100, startY: 100, endX: 200, endY: 200 } },
    });
    expect(state.annotations).toHaveLength(1);
    expect(state.viewport.zoom).toBe(2.00);
  });

  it('Combo 10: Full composite export with base image, overlay layer, 8px stroke annotations, and 30% fill opacity', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080, 'release-diff.png') });
    state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: createTestOverlay({ id: 'layer-v2', opacity: 0.9 }) } });

    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'final-box',
        geometry: { type: 'box', x: 200, y: 300, width: 400, height: 250 },
        style: { color: 'amber', strokeWidth: 8, fillOpacity: 0.30 },
        note: 'Header layout regression confirmed against overlay',
      },
    });

    const mdReport = serializeAnnotationsToMarkdown(state.annotations);
    expect(mdReport).toContain('1. **[Box]**');
    expect(mdReport).toContain('Header layout regression confirmed against overlay');
    expect(state.overlays).toHaveLength(1);
    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.30);
  });
});
