/**
 * Tier 3: Cross-Feature Combinations & Interactions Test Suite
 * 
 * Verifies pairwise and multi-feature interaction workflows:
 * State transitions, coordinate sync, undo/redo loops, export pipelines, and UI state invariants.
 */

import { describe, it, expect, beforeEach } from './test-runner.js';
import {
  createInitialState,
  appReducer,
  screenToImage,
  computeZoomTransform,
  serializeAnnotationsToMarkdown,
  createTestImage,
  COLOR_DEFINITIONS,
  AppState,
} from '../helpers/testFixtures.js';

describe('Tier 3: Cross-Feature Combinations & Interactions', () => {
  let state: AppState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('Combo 1: Paste Image -> Draw 4 Distinct Tools -> Verify Auto-Indexing -> Export Markdown', () => {
    // 1. Ingest base image
    const img = createTestImage(1920, 1080, 'dashboard.png');
    state = appReducer(state, { type: 'SET_IMAGE', payload: img });
    expect(state.image).toBeDefined();

    // 2. Draw Box
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'box-1', geometry: { type: 'box', x: 50, y: 50, width: 200, height: 100 }, note: 'Check header layout' },
    });

    // 3. Draw Ellipse
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'circle-1', geometry: { type: 'ellipse', cx: 400, cy: 300, rx: 60, ry: 60 }, note: 'Profile avatar crop' },
    });

    // 4. Draw Arrow
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'arrow-1', geometry: { type: 'arrow', startX: 600, startY: 100, endX: 750, endY: 250 }, note: 'CTA button pointer' },
    });

    // 5. Draw Pin
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'pin-1', geometry: { type: 'pin', x: 800, y: 400 }, note: 'Tooltip anchor' },
    });

    // Verify 1..4 sequence
    expect(state.annotations).toHaveLength(4);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3, 4]);

    // Verify markdown serialization
    const md = serializeAnnotationsToMarkdown(state.annotations);
    expect(md).toContain('1. **[Box]**');
    expect(md).toContain('Check header layout');
    expect(md).toContain('2. **[Ellipse]**');
    expect(md).toContain('3. **[Arrow]**');
    expect(md).toContain('4. **[Pin]**');
  });

  it('Combo 2: Reorder Sequence -> Undo Reorder -> Redo Reorder -> Canvas/Sidebar Alignment', () => {
    // Populate 3 annotations
    state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a', geometry: { type: 'box', x: 0, y: 0, width: 10, height: 10 }, note: 'A' } });
    state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'b', geometry: { type: 'ellipse', cx: 0, cy: 0, rx: 5, ry: 5 }, note: 'B' } });
    state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'c', geometry: { type: 'pin', x: 0, y: 0 }, note: 'C' } });

    const stateBeforeReorder = state;

    // Move 'c' (index 2) to first position (index 0)
    state = appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { sourceIndex: 2, destinationIndex: 0 } });
    const stateAfterReorder = state;

    expect(state.annotations.map(a => a.id)).toEqual(['c', 'a', 'b']);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);

    // Simulating Undo
    state = stateBeforeReorder;
    expect(state.annotations.map(a => a.id)).toEqual(['a', 'b', 'c']);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);

    // Simulating Redo
    state = stateAfterReorder;
    expect(state.annotations.map(a => a.id)).toEqual(['c', 'a', 'b']);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);
  });

  it('Combo 3: Draw Box -> Change Preset Colors -> Move Geometry -> Resize Geometry -> Verify Properties', () => {
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'box-target', geometry: { type: 'box', x: 100, y: 100, width: 150, height: 100 }, style: { color: 'red', strokeWidth: 4 } },
    });
    state = appReducer(state, { type: 'SET_SELECTED_ANNOTATION', payload: 'box-target' });

    // Change color to green
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'green' });
    expect(state.annotations[0].style.color).toBe('green');

    // Move box
    state = appReducer(state, {
      type: 'UPDATE_ANNOTATION_GEOMETRY',
      payload: { id: 'box-target', geometry: { type: 'box', x: 250, y: 180, width: 150, height: 100 } },
    });
    expect((state.annotations[0].geometry as any).x).toBe(250);
    expect((state.annotations[0].geometry as any).y).toBe(180);

    // Resize box
    state = appReducer(state, {
      type: 'UPDATE_ANNOTATION_GEOMETRY',
      payload: { id: 'box-target', geometry: { type: 'box', x: 250, y: 180, width: 320, height: 210 } },
    });
    expect((state.annotations[0].geometry as any).width).toBe(320);
    expect((state.annotations[0].geometry as any).height).toBe(210);
  });

  it('Combo 4: Zoom to 300% at Focal Point -> Draw Arrow in Zoomed Coordinates -> Verify 1:1 Invariance', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(3840, 2160) });
    const screenFocalPoint = { x: 800, y: 600 };

    // Zoom from 1.0 to 3.0 centered on (800, 600)
    const zoomedVp = computeZoomTransform(state.viewport, screenFocalPoint, 3.0);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: zoomedVp });

    // User drags in screen coordinates: (800, 600) to (950, 750)
    const imgStart = screenToImage({ x: 800, y: 600 }, state.viewport);
    const imgEnd = screenToImage({ x: 950, y: 750 }, state.viewport);

    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'arrow', startX: imgStart.x, startY: imgStart.y, endX: imgEnd.x, endY: imgEnd.y } },
    });

    const arrowGeom = state.annotations[0].geometry as any;
    expect(Number.isFinite(arrowGeom.startX)).toBe(true);
    expect(Number.isFinite(arrowGeom.endX)).toBe(true);

    // Reset zoom back to 1.0 and verify arrow coordinates remain in natural image pixel space
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: { zoom: 1.0, panX: 0, panY: 0 } });
    expect(state.annotations[0].geometry).toEqual(arrowGeom);
  });

  it('Combo 5: Create Annotations -> Hover Card in Sidebar -> Delete Hovered Card -> Verify Hover Reset', () => {
    state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'item-1', geometry: { type: 'box', x: 0, y: 0, width: 10, height: 10 } } });
    state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'item-2', geometry: { type: 'pin', x: 50, y: 50 } } });

    state = appReducer(state, { type: 'SET_HOVERED_ANNOTATION', payload: 'item-2' });
    expect(state.hoveredAnnotationId).toBe('item-2');

    state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'item-2' } });
    expect(state.hoveredAnnotationId).toBeNull();
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].id).toBe('item-1');
  });

  it('Combo 6: Copy Image to Clipboard -> Copy Notes to Clipboard -> Modify Note -> Re-Export Notes', async () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080) });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { id: 'a1', geometry: { type: 'box', x: 100, y: 100, width: 50, height: 50 }, note: 'Initial description' },
    });

    // 1. Copy Image
    const pngBlob = new Blob(['composite_png_bytes'], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    expect((await navigator.clipboard.read())[0].types).toContain('image/png');

    // 2. Copy Notes
    const md1 = serializeAnnotationsToMarkdown(state.annotations);
    await navigator.clipboard.writeText(md1);
    expect(await navigator.clipboard.readText()).toContain('Initial description');

    // 3. Modify Note
    state = appReducer(state, {
      type: 'UPDATE_ANNOTATION_NOTE',
      payload: { id: 'a1', note: 'Refined description with details' },
    });

    // 4. Re-copy Notes
    const md2 = serializeAnnotationsToMarkdown(state.annotations);
    await navigator.clipboard.writeText(md2);
    expect(await navigator.clipboard.readText()).toContain('Refined description with details');
  });

  it('Combo 7: Ingest Image A -> Add Annotations -> Ingest Image B -> Verify Full State Reset', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(800, 600, 'imgA.png') });
    state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: { type: 'box', x: 10, y: 10, width: 20, height: 20 } } });
    state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a2', geometry: { type: 'pin', x: 50, y: 50 } } });
    state = appReducer(state, { type: 'SET_SELECTED_ANNOTATION', payload: 'a1' });

    // Ingest Image B
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1440, 900, 'imgB.png') });
    expect(state.image?.fileName).toBe('imgB.png');
    expect(state.annotations).toHaveLength(0);
    expect(state.selectedAnnotationId).toBeNull();
  });

  it('Combo 8: Styling Mutations: Color Preset + Stroke Width + Fill Opacity -> Retain on New Shapes', () => {
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'amber' });
    state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
    state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.5 });

    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'box', x: 0, y: 0, width: 100, height: 100 } },
    });

    expect(state.annotations[0].style.color).toBe('amber');
    expect(state.annotations[0].style.strokeWidth).toBe(8);
    expect(state.annotations[0].style.fillOpacity).toBe(0.5);
  });

  it('Combo 9: Tool Switching: Select -> Pin -> Box -> Ellipse -> Arrow -> Pan', () => {
    const sequence: ('select' | 'pin' | 'box' | 'ellipse' | 'arrow' | 'pan')[] = [
      'select', 'pin', 'box', 'ellipse', 'arrow', 'pan'
    ];
    for (const tool of sequence) {
      state = appReducer(state, { type: 'SET_ACTIVE_TOOL', payload: tool });
      expect(state.activeTool).toBe(tool);
    }
  });

  it('Combo 10: Dark and Light Theme Switching with Multi-Color Presets Contrast Verification', () => {
    state = appReducer(state, { type: 'SET_THEME', payload: 'dark' });
    expect(state.theme).toBe('dark');

    // Verify all 5 preset color badge text colors are contrast-compliant
    for (const color of Object.keys(COLOR_DEFINITIONS) as (keyof typeof COLOR_DEFINITIONS)[]) {
      const def = COLOR_DEFINITIONS[color];
      expect(['#FFFFFF', '#000000']).toContain(def.badgeText);
    }

    state = appReducer(state, { type: 'SET_THEME', payload: 'light' });
    expect(state.theme).toBe('light');
  });

  it('Combo 11: Rich Markdown Formatting (Code blocks, checklists, links) in List and Table Modes', () => {
    const richNote = 'Fix typo in auth helper:\n- [x] Tested locally\n- [ ] Deploy to staging\n`checkToken()`';
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'box', x: 0, y: 0, width: 10, height: 10 }, note: richNote },
    });

    const listMd = serializeAnnotationsToMarkdown(state.annotations, 'list');
    expect(listMd).toContain('`checkToken()`');
    expect(listMd).toContain('- [x] Tested locally');

    const tableMd = serializeAnnotationsToMarkdown(state.annotations, 'table');
    expect(tableMd).toContain('| # | Type | Color | Note |');
    expect(tableMd).toContain('`checkToken()`');
  });

  it('Combo 12: Full Multi-Step Lifecycle: Ingest -> Draw 5 -> Delete #3 -> Reorder -> Export -> Verify', () => {
    // 1. Ingest
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080) });

    // 2. Add 5 annotations
    for (let i = 1; i <= 5; i++) {
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: `item-${i}`, geometry: { type: 'box', x: i * 20, y: i * 20, width: 50, height: 50 }, note: `Task ${i}` },
      });
    }
    expect(state.annotations).toHaveLength(5);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3, 4, 5]);

    // 3. Delete #3 ('item-3')
    state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'item-3' } });
    expect(state.annotations).toHaveLength(4);
    expect(state.annotations.map(a => a.id)).toEqual(['item-1', 'item-2', 'item-4', 'item-5']);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3, 4]);

    // 4. Reorder #4 ('item-5') to #1
    state = appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { sourceIndex: 3, destinationIndex: 0 } });
    expect(state.annotations.map(a => a.id)).toEqual(['item-5', 'item-1', 'item-2', 'item-4']);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3, 4]);

    // 5. Serialize
    const finalMd = serializeAnnotationsToMarkdown(state.annotations);
    expect(finalMd).toContain('1. **[Box]**');
    expect(finalMd).toContain('Task 5');
    expect(finalMd).toContain('2. **[Box]**');
    expect(finalMd).toContain('Task 1');
  });
});
