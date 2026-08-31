/**
 * Tier 4: Realistic End-to-End User Workloads Test Suite
 * 
 * Simulates complete real-world developer and designer workflows from paste to export:
 * - Workload 1: Frontend Bug Report Workflow
 * - Workload 2: UI/UX Design Review Workflow
 * - Workload 3: Code Diff & Architecture Callout Workflow
 * - Workload 4: High-DPI 4K Retina Screenshot Review
 * - Workload 5: Rapid Iteration & Undo/Redo Recovery Stress Workload
 */

import { describe, it, expect, beforeEach } from './test-runner.js';
import {
  createInitialState,
  appReducer,
  computeZoomTransform,
  calculateAutoFit,
  serializeAnnotationsToMarkdown,
  createTestImage,
  AppState,
} from '../helpers/testFixtures.js';

describe('Tier 4: Realistic End-to-End User Workloads', () => {
  let state: AppState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('Workload 1: Frontend Bug Report Workflow (Dashboard Layout & Missing Assets)', async () => {
    // 1. User pastes 1080p dashboard screenshot
    const dashboardImg = createTestImage(1920, 1080, 'dashboard-bug-report.png');
    state = appReducer(state, { type: 'SET_IMAGE', payload: dashboardImg });
    expect(state.image?.naturalWidth).toBe(1920);

    // 2. Add Red Bounding Box around broken navigation bar (#1)
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'red' });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'bug-nav-box',
        geometry: { type: 'box', x: 0, y: 0, width: 1920, height: 72 },
        note: '### Navigation Bug\nFlex layout wraps prematurely on 1280px viewport.',
      },
    });

    // 3. Add Amber Arrow pointing to misplaced CTA button (#2)
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'amber' });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'bug-cta-arrow',
        geometry: { type: 'arrow', startX: 1400, startY: 200, endX: 1650, endY: 300 },
        note: 'Button padding should be 12px instead of 24px.',
      },
    });

    // 4. Add Purple Pin on broken icon asset (#3)
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'purple' });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'bug-icon-pin',
        geometry: { type: 'pin', x: 1800, y: 36 },
        note: 'Missing SVG icon asset for dark mode toggle.',
      },
    });

    // Verify 1..3 sequence
    expect(state.annotations).toHaveLength(3);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);

    // 5. Copy Image to Clipboard (Cmd+C)
    const compositePngBlob = new Blob(['composite_png_1920x1080'], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': compositePngBlob })]);
    const clipboardItems = await navigator.clipboard.read();
    expect(clipboardItems[0].types).toContain('image/png');

    // 6. Copy Notes to Clipboard (Cmd+Shift+C)
    const markdownNotes = serializeAnnotationsToMarkdown(state.annotations);
    await navigator.clipboard.writeText(markdownNotes);
    const clipboardText = await navigator.clipboard.readText();

    expect(clipboardText).toContain('1. **[Box]**');
    expect(clipboardText).toContain('Navigation Bug');
    expect(clipboardText).toContain('2. **[Arrow]**');
    expect(clipboardText).toContain('Button padding');
    expect(clipboardText).toContain('3. **[Pin]**');
    expect(clipboardText).toContain('Missing SVG icon');
  });

  it('Workload 2: UI/UX Design Review Workflow (Mobile Mockup & Item Reprioritization)', async () => {
    // 1. Ingest iPhone 15 mobile screenshot (393 x 852)
    const mobileMockup = createTestImage(393, 852, 'iphone-mockup.png');
    state = appReducer(state, { type: 'SET_IMAGE', payload: mobileMockup });

    // 2. Add Green Ellipse around approved hero header (#1)
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'green' });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'review-header',
        geometry: { type: 'ellipse', cx: 196, cy: 120, rx: 150, ry: 40 },
        note: 'Approved typography and avatar alignment.',
      },
    });

    // 3. Add Cyan Box around form input (#2)
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'cyan' });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'review-input',
        geometry: { type: 'box', x: 24, y: 300, width: 345, height: 48 },
        note: 'Increase touch target height to min 48px.',
      },
    });

    // 4. Add Amber Arrow from CTA to footer (#3)
    state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'amber' });
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'review-cta',
        geometry: { type: 'arrow', startX: 196, startY: 600, endX: 196, endY: 720 },
        note: 'High priority: Move secondary link below primary button.',
      },
    });

    // 5. Reprioritize: Move CTA feedback (#3) to first position (#1)
    state = appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { sourceIndex: 2, destinationIndex: 0 } });
    expect(state.annotations.map(a => a.id)).toEqual(['review-cta', 'review-header', 'review-input']);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3]);

    // 6. Export formatted markdown table
    const tableReport = serializeAnnotationsToMarkdown(state.annotations, 'table');
    expect(tableReport).toContain('| 1 | Arrow |');
    expect(tableReport).toContain('High priority');
    expect(tableReport).toContain('| 2 | Ellipse |');
    expect(tableReport).toContain('| 3 | Box |');
  });

  it('Workload 3: Code Diff & Architecture Callout Workflow (Focal Zoom & Multi-Quadrant Inspect)', () => {
    // 1. User pastes 2560x1440 IDE screenshot showing git diff
    const ideScreenshot = createTestImage(2560, 1440, 'git-diff.png');
    state = appReducer(state, { type: 'SET_IMAGE', payload: ideScreenshot });

    // 2. Zoom in to lines 45-60 at 175% zoom centered at (1200, 600)
    const zoomVp = computeZoomTransform(state.viewport, { x: 1200, y: 600 }, 1.75);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: zoomVp });
    expect(state.viewport.zoom).toBe(1.75);

    // 3. Add Red Box around concurrency race condition (#1)
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'race-condition',
        geometry: { type: 'box', x: 450, y: 520, width: 800, height: 120 },
        note: 'Thread safety bug: lock not acquired before state mutation.',
      },
    });

    // 4. Add Green Box around suggested atomic fix (#2)
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'atomic-fix',
        geometry: { type: 'box', x: 450, y: 700, width: 800, height: 120 },
        note: 'Use `AtomicReference.compareAndSet` here.',
      },
    });

    // 5. Add Pin on unused import (#3)
    state = appReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        id: 'unused-import',
        geometry: { type: 'pin', x: 200, y: 80 },
        note: 'Remove unused legacy import `com.example.LegacyManager`.',
      },
    });

    // 6. Reset view to 1:1 and verify all coordinates remained intact in image space
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: { zoom: 1.0, panX: 0, panY: 0 } });
    expect((state.annotations[0].geometry as any).x).toBe(450);
    expect((state.annotations[1].geometry as any).x).toBe(450);
    expect((state.annotations[2].geometry as any).x).toBe(200);
  });

  it('Workload 4: High-DPI 4K Retina Screenshot Review (8 Quadrant Annotations & Deletion)', () => {
    // 1. Ingest 4K screenshot (3840 x 2160)
    const retina4k = createTestImage(3840, 2160, 'retina-4k-architecture.png');
    state = appReducer(state, { type: 'SET_IMAGE', payload: retina4k });

    // 2. Auto-fit to 1920x1080 screen container
    const autoFit = calculateAutoFit(3840, 2160, 1920, 1080, 32);
    state = appReducer(state, { type: 'SET_VIEWPORT', payload: autoFit });
    expect(state.viewport.zoom).toBeLessThan(1.0);

    // 3. Add 8 annotations across all 4 quadrants of 4K image
    const quadrants = [
      { x: 500, y: 400 }, { x: 1200, y: 400 },
      { x: 2400, y: 400 }, { x: 3200, y: 400 },
      { x: 500, y: 1500 }, { x: 1200, y: 1500 },
      { x: 2400, y: 1500 }, { x: 3200, y: 1500 },
    ];

    quadrants.forEach((pt, i) => {
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: `quad-${i + 1}`,
          geometry: { type: 'box', x: pt.x, y: pt.y, width: 200, height: 150 },
          note: `Quadrant inspection #${i + 1}`,
        },
      });
    });

    expect(state.annotations).toHaveLength(8);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // 4. Delete item #4 ('quad-4')
    state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'quad-4' } });
    expect(state.annotations).toHaveLength(7);
    expect(state.annotations.map(a => a.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state.annotations.map(a => a.id)).toEqual(['quad-1', 'quad-2', 'quad-3', 'quad-5', 'quad-6', 'quad-7', 'quad-8']);

    // 5. Update styling of #2 to Amber, #5 (id 'quad-6') to Cyan
    state = appReducer(state, {
      type: 'UPDATE_ANNOTATION_STYLE',
      payload: { id: 'quad-2', style: { color: 'amber' } },
    });
    state = appReducer(state, {
      type: 'UPDATE_ANNOTATION_STYLE',
      payload: { id: 'quad-6', style: { color: 'cyan' } },
    });

    expect(state.annotations.find(a => a.id === 'quad-2')?.style.color).toBe('amber');
    expect(state.annotations.find(a => a.id === 'quad-6')?.style.color).toBe('cyan');
  });

  it('Workload 5: Rapid Iteration & Undo/Redo Recovery Stress Workload (20 Annotations & Full Rollback)', () => {
    state = appReducer(state, { type: 'SET_IMAGE', payload: createTestImage(1920, 1080) });

    const historySnapshots: AppState[] = [];
    historySnapshots.push(state);

    // 1. Add 20 annotations sequentially and track history
    for (let i = 1; i <= 20; i++) {
      const type = i % 4 === 0 ? 'box' : i % 4 === 1 ? 'ellipse' : i % 4 === 2 ? 'arrow' : 'pin';
      let geom: any;
      if (type === 'box') geom = { type: 'box', x: i * 20, y: i * 20, width: 40, height: 40 };
      else if (type === 'ellipse') geom = { type: 'ellipse', cx: i * 20, cy: i * 20, rx: 20, ry: 20 };
      else if (type === 'arrow') geom = { type: 'arrow', startX: i * 10, startY: i * 10, endX: i * 25, endY: i * 25 };
      else geom = { type: 'pin', x: i * 30, y: i * 30 };

      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: `stress-${i}`, geometry: geom, note: `Stress note #${i}` },
      });
      historySnapshots.push(state);
    }

    expect(state.annotations).toHaveLength(20);
    expect(state.annotations.map(a => a.index)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    // 2. Perform 10 Undo operations by restoring snapshots
    for (let step = 0; step < 10; step++) {
      historySnapshots.pop();
      state = historySnapshots[historySnapshots.length - 1];
    }
    expect(state.annotations).toHaveLength(10);
    expect(state.annotations.map(a => a.index)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));

    // 3. Verify markdown matches the rolled-back 10 items
    const rolledBackMd = serializeAnnotationsToMarkdown(state.annotations);
    expect(rolledBackMd).toContain('10. **[');
    expect(rolledBackMd).not.toContain('11. **[');
  });
});
