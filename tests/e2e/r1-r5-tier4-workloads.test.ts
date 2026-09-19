/**
 * Tier 4: Realistic End-to-End User Workloads Test Suite (R1 through R5 Enhancements)
 * 
 * Simulates complete real-world developer and QA workflows:
 * - Workload 1: Full Developer Annotation & Asset Review Workflow
 * - Workload 2: UI/UX Compact Tablet Review Workflow (768px Responsive Layout)
 * - Workload 3: Rapid Bug Logging on Compact Narrow Window (640px Viewport)
 * - Workload 4: High-Precision Component Diff & Focal Zoom Inspection
 * - Workload 5: Multi-Step Iterative QA Regression Workflow with Overlay Comparison
 * 
 * Total Tier 4 Enhancement Tests: 5
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
  createTestOverlay,
  quantizeWheelZoom,
  computeResponsiveToolbarMetrics,
  AppState,
} from '../helpers/testFixtures.js';

describe('Tier 4: Realistic End-to-End User Workloads (R1 through R5 Enhancements)', () => {
  let state: AppState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('Workload 1: Full Developer Annotation & Asset Review Workflow', () => {
    // 1. Ingest 1080p dashboard screenshot via clipboard
    const dashboardImg = createTestImage(1920, 1080, 'dashboard-v1.png');
    state = appReducer(state, { type: 'SET_IMAGE', payload: dashboardImg });
    expect(state.image?.naturalWidth).toBe(1920);

    // 2. Zoom in to header component using wheel quantization (100% -> 125% -> 150%)
    let zoom = state.viewport.zoom;
    zoom = quantizeWheelZoom(zoom, -120); // 1.25
    zoom = quantizeWheelZoom(zoom, -120); // 1.50
    expect(zoom).toBe(1.50);

    const cursor = { x: 600, y: 150 };
    const vp = computeZoomTransform(state.viewport, cursor, zoom);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: vp });

    // 3. Draw bounding box with bold 8px stroke and 30% fill opacity around broken header
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.30 });
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'red' });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'header-nav-bug',
        geometry: { type: 'box', x: 200, y: 20, width: 800, height: 64 },
        note: 'Header navigation items overflow on narrow screens',
      },
    });

    // 4. Deselect and draw arrow with 4px stroke and 0% fill pointing to displaced action icon
    state = appReducer(state, { type: 'SET_SELECTED_ANNOTATION', payload: null });
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 4 });
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0 });
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'amber' });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'icon-displaced-arrow',
        geometry: { type: 'arrow', startX: 1100, startY: 100, endX: 1050, endY: 52 },
        note: 'Settings gear icon displaced 12px below baseline',
      },
    });

    expect(state.annotations).toHaveLength(2);
    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.30);
    expect(state.annotations[1].style.strokeWidth).toBe(4);
    expect(state.annotations[1].style.fillOpacity).toBe(0);

    // 5. Add updated design mockup as image overlay layer
    const designMockupOverlay = createTestOverlay({
      id: 'figma-mockup-layer',
      src: 'data:image/png;base64,mockFigmaHeader',
      x: 200,
      y: 20,
      width: 800,
      height: 64,
      opacity: 0.85,
    });
    state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: designMockupOverlay } });
    expect(state.overlays).toHaveLength(1);

    // 6. Replace base image with retina screenshot selecting "Replace & Keep Annotations"
    const retinaBase = createTestImage(3840, 2160, 'dashboard-v1-retina.png');
    state = appReducer(state, { type: 'REPLACE_IMAGE_AND_KEEP', payload: { image: retinaBase } });

    // 7. Verify 0 ghost annotations, 100% style retention, and notes preserved
    expect(state.image?.fileName).toBe('dashboard-v1-retina.png');
    expect(state.annotations).toHaveLength(2);
    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.30);
    expect(state.annotations[0].note).toBe('Header navigation items overflow on narrow screens');
    expect(state.annotations[1].style.strokeWidth).toBe(4);
    expect(state.annotations[1].style.fillOpacity).toBe(0);

    // 8. Export markdown notes
    const mdReport = serializeAnnotationsToMarkdown(state.annotations);
    expect(mdReport).toContain('1. **[Box]**');
    expect(mdReport).toContain('2. **[Arrow]**');
  });

  it('Workload 2: UI/UX Compact Tablet Review Workflow (768px Responsive Layout)', () => {
    // 1. Tablet viewport 768px
    const layout = computeResponsiveToolbarMetrics(768);
    expect(layout.breakpoint).toBe('tablet');
    expect(layout.allDrawingToolsRendered).toBe(true);
    expect(layout.colorPaletteRendered).toBe(true);
    expect(layout.isMultiRowWrapped).toBe(true);
    expect(layout.hasHorizontalClipping).toBe(false);

    // 2. Ingest mobile mockup
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(750, 1334, 'mobile-screen.png') });

    // 3. Annotate callout pins with 4px stroke & 15% fill
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 4 });
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.15 });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'pin-nav', geometry: { type: 'pin', x: 50, y: 60 }, note: 'Sticky header blur' },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'circle-avatar', geometry: { type: 'ellipse', cx: 375, cy: 300, rx: 60, ry: 60 }, note: 'Profile crop size' },
    });

    // 4. Zoom out to 50% for whole-screen overview
    let zoom = 1.0;
    zoom = quantizeWheelZoom(zoom, 120); // 0.75
    zoom = quantizeWheelZoom(zoom, 120); // 0.67
    zoom = quantizeWheelZoom(zoom, 120); // 0.50
    expect(zoom).toBe(0.50);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: { zoom } });

    // 5. Add second variant overlay
    state = appReducer(state, { type: 'ADD_IMAGE_OVERLAY', payload: { overlay: createTestOverlay({ id: 'variant-b' }) } });

    expect(state.annotations).toHaveLength(2);
    expect(state.overlays).toHaveLength(1);
    expect(state.viewport.zoom).toBe(0.50);
  });

  it('Workload 3: Rapid Bug Logging on Compact Narrow Window (640px Viewport)', () => {
    // 1. Compact 640px viewport
    const layout = computeResponsiveToolbarMetrics(640);
    expect(layout.breakpoint).toBe('mobile');
    expect(layout.allDrawingToolsRendered).toBe(true);
    expect(layout.colorPaletteRendered).toBe(true);
    expect(layout.isMultiRowWrapped).toBe(true);

    // 2. Paste bug screenshot
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1024, 768, 'wrong-capture.png') });

    // 3. Annotate 3 issues with 2px, 4px, and 8px strokes
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'b1', geometry: { type: 'box', x: 10, y: 10, width: 50, height: 50 }, style: { color: 'green', strokeWidth: 2, fillOpacity: 0 } },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'b2', geometry: { type: 'box', x: 80, y: 10, width: 50, height: 50 }, style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.15 } },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'b3', geometry: { type: 'box', x: 150, y: 10, width: 50, height: 50 }, style: { color: 'red', strokeWidth: 8, fillOpacity: 0.50 } },
    });

    expect(state.annotations).toHaveLength(3);
    expect(state.annotations[2].style.strokeWidth).toBe(8);
    expect(state.annotations[2].style.fillOpacity).toBe(0.50);

    // 4. User realizes wrong screenshot was pasted -> "Replace & Clear Annotations"
    const correctCapture = createTestImage(1440, 900, 'correct-capture.png');
    state = appReducer(state, { type: 'REPLACE_IMAGE_AND_CLEAR', payload: { image: correctCapture } });

    // 5. Confirm 0 ghost annotations
    expect(state.image?.fileName).toBe('correct-capture.png');
    expect(state.annotations).toHaveLength(0);
    expect(state.overlays).toHaveLength(0);

    // 6. Draw correct annotation
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'correct-ann', geometry: { type: 'box', x: 50, y: 50, width: 100, height: 100 }, note: 'Real defect log' },
    });
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].note).toBe('Real defect log');
  });

  it('Workload 4: High-Precision Component Diff & Focal Zoom Inspection', () => {
    // 1. Ingest high-res screenshot
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(2560, 1440, 'component-render.png') });

    // 2. Step monotonically through full zoom ladder: 100% -> 125% -> 150% -> 200%
    const expectedSequence = [1.25, 1.50, 2.00];
    let currentZoom = 1.00;
    for (const expected of expectedSequence) {
      currentZoom = quantizeWheelZoom(currentZoom, -100);
      expect(currentZoom).toBe(expected);
    }
    expect(currentZoom).toBe(2.00);

    // 3. Focal transform invariance at 200% zoom
    const cursor = { x: 720, y: 480 };
    const vp = computeZoomTransform(state.viewport, cursor, 2.00);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: vp });

    const imgPt = screenToImage(cursor, state.viewport);
    const screenBack = imageToScreen(imgPt, state.viewport);
    expect(screenBack.x).toBeCloseTo(cursor.x, 3);
    expect(screenBack.y).toBeCloseTo(cursor.y, 3);

    // 4. Add defect box with 8px stroke and 50% fill
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'diff-flaw',
        geometry: { type: 'box', x: imgPt.x - 50, y: imgPt.y - 25, width: 100, height: 50 },
        style: { color: 'purple', strokeWidth: 8, fillOpacity: 0.50 },
        note: 'Sub-pixel alignment error on card container',
      },
    });

    // 5. Add overlay representing Figma spec
    state = appReducer(state, {
      type: 'ADD_IMAGE_OVERLAY',
      payload: { overlay: createTestOverlay({ id: 'figma-spec-overlay', opacity: 0.5 }) },
    });

    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.50);
    expect(state.overlays).toHaveLength(1);

    const report = serializeAnnotationsToMarkdown(state.annotations);
    expect(report).toContain('Sub-pixel alignment error on card container');
  });

  it('Workload 5: Multi-Step Iterative QA Regression Workflow with Overlay Comparison', () => {
    // 1. Build v1 screenshot
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080, 'build-v1.png') });

    // 2. Add 4 annotations with various stroke widths & fill opacities
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'issue-1', geometry: { type: 'box', x: 10, y: 10, width: 100, height: 50 }, style: { color: 'red', strokeWidth: 2, fillOpacity: 0 }, note: 'Issue 1' },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'issue-2', geometry: { type: 'box', x: 120, y: 10, width: 100, height: 50 }, style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.15 }, note: 'Issue 2 (Resolved)' },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'issue-3', geometry: { type: 'box', x: 230, y: 10, width: 100, height: 50 }, style: { color: 'green', strokeWidth: 8, fillOpacity: 0.30 }, note: 'Issue 3' },
    });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'issue-4', geometry: { type: 'box', x: 340, y: 10, width: 100, height: 50 }, style: { color: 'purple', strokeWidth: 8, fillOpacity: 0.50 }, note: 'Issue 4' },
    });

    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3, 4]);

    // 3. Add v2 candidate as overlay layer
    state = appReducer(state, {
      type: 'ADD_IMAGE_OVERLAY',
      payload: { overlay: createTestOverlay({ id: 'v2-preview', opacity: 0.7 }) },
    });
    expect(state.overlays).toHaveLength(1);

    // 4. Issue 2 is resolved -> delete it, verify re-indexing to 1..3
    state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'issue-2' } });
    expect(state.annotations).toHaveLength(3);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);

    // 5. Ingest final build v2 screenshot selecting "Replace & Keep Annotations"
    state = appReducer(state, {
      type: 'REPLACE_IMAGE_AND_KEEP',
      payload: { image: createTestImage(1920, 1080, 'build-v2-final.png') },
    });

    // 6. Confirm 0 ghosts and 100% style retention
    expect(state.image?.fileName).toBe('build-v2-final.png');
    expect(state.annotations).toHaveLength(3);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);
    expect(state.annotations[0].style.strokeWidth).toBe(2);
    expect(state.annotations[0].style.fillOpacity).toBe(0);
    expect(state.annotations[1].style.strokeWidth).toBe(8);
    expect(state.annotations[1].style.fillOpacity).toBe(0.30);
    expect(state.annotations[2].style.strokeWidth).toBe(8);
    expect(state.annotations[2].style.fillOpacity).toBe(0.50);

    // 7. Verify exported markdown notes
    const md = serializeAnnotationsToMarkdown(state.annotations);
    expect(md).toContain('1. **[Box]**');
    expect(md).toContain('Issue 1');
    expect(md).toContain('2. **[Box]**');
    expect(md).toContain('Issue 3');
    expect(md).toContain('3. **[Box]**');
    expect(md).toContain('Issue 4');
  });
});
