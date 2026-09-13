import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ColorPalette,
  STROKE_WIDTH_OPTIONS,
  FILL_OPACITY_OPTIONS,
} from '../../src/components/toolbar/ColorPalette';
import { ShapeRenderer, hexToRgba } from '../../src/components/canvas/ShapeRenderer';
import { AppProvider, useApp, AppContextValue } from '../../src/state/AppContext';
import {
  appReducer,
  createInitialState,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FILL_OPACITY,
} from '../../src/state/appReducer';
import {
  rasterizeAnnotation,
  createCanvas,
  renderCompositeCanvas,
} from '../../src/export/canvasExporter';
import { PRESET_COLORS } from '../../src/constants/colors';
import { Annotation, PresetColor, BaseImage } from '../../src/types';
import { calculateArrowhead } from '../../src/math/geometry';

describe('Milestone 3 Iteration 2 Challenger 2: Stroke Width (2/4/8px), Fill Opacity & Export Invariants', () => {
  function makeAnnotation(
    id: string,
    index: number,
    type: 'box' | 'ellipse' | 'arrow' | 'pin' = 'box',
    color: PresetColor = 'amber',
    strokeWidth = 2,
    fillOpacity = 0.15
  ): Annotation {
    let geometry;
    if (type === 'box') {
      geometry = { type: 'box' as const, x: index * 10, y: index * 10, width: 60, height: 40 };
    } else if (type === 'ellipse') {
      geometry = { type: 'ellipse' as const, cx: index * 20, cy: index * 20, rx: 30, ry: 20 };
    } else if (type === 'arrow') {
      geometry = {
        type: 'arrow' as const,
        startX: index * 10,
        startY: index * 10,
        endX: index * 10 + 60,
        endY: index * 10 + 40,
      };
    } else {
      geometry = { type: 'pin' as const, x: index * 25, y: index * 25 };
    }

    return {
      id,
      index,
      geometry,
      style: { color, strokeWidth, fillOpacity },
      note: `Note for ${id}`,
      createdAt: 1000 + index,
      updatedAt: 1000 + index,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ========================================================================
   * 1. DEFAULT_STROKE_WIDTH = 2 INITIALIZATION & INITIAL HIGHLIGHT
   * ======================================================================== */
  describe('1. DEFAULT_STROKE_WIDTH = 2 Initialization & Initial Highlight Invariants', () => {
    it('C1.1: DEFAULT_STROKE_WIDTH constant is strictly 2', () => {
      expect(DEFAULT_STROKE_WIDTH).toBe(2);
    });

    it('C1.2: createInitialState sets activeStrokeWidth to 2 and activeFillOpacity to 0.15', () => {
      const state = createInitialState();
      expect(state.activeStrokeWidth).toBe(2);
      expect(state.activeFillOpacity).toBe(DEFAULT_FILL_OPACITY);
      expect(state.activeFillOpacity).toBe(0.15);
    });

    it('C1.3: On fresh mount with AppProvider, stroke-btn-2 is checked by default, while 4 and 8 are not', () => {
      render(
        <AppProvider>
          <ColorPalette />
        </AppProvider>
      );

      const btn2 = screen.getByTestId('stroke-btn-2');
      const btn4 = screen.getByTestId('stroke-btn-4');
      const btn8 = screen.getByTestId('stroke-btn-8');

      expect(btn2).toHaveAttribute('aria-checked', 'true');
      expect(btn4).toHaveAttribute('aria-checked', 'false');
      expect(btn8).toHaveAttribute('aria-checked', 'false');
    });

    it('C1.4: Standalone ColorPalette rendered outside AppProvider falls back to activeStrokeWidth = 2', () => {
      render(<ColorPalette />);

      const btn2 = screen.getByTestId('stroke-btn-2');
      const btn4 = screen.getByTestId('stroke-btn-4');
      const btn8 = screen.getByTestId('stroke-btn-8');

      expect(btn2).toHaveAttribute('aria-checked', 'true');
      expect(btn4).toHaveAttribute('aria-checked', 'false');
      expect(btn8).toHaveAttribute('aria-checked', 'false');
    });

    it('C1.5: Fresh session immediately assigns strokeWidth: 2 to newly created annotations', () => {
      let ctx: AppContextValue | undefined;
      const TestConsumer = () => {
        ctx = useApp();
        return null;
      };

      render(
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      );

      expect(ctx).toBeDefined();

      act(() => {
        ctx!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: {
            geometry: { type: 'box', x: 20, y: 20, width: 100, height: 80 },
          },
        });
      });

      expect(ctx!.state.annotations).toHaveLength(1);
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(2);
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.15);
    });

    it('C1.6: Image replacement actions maintain activeStrokeWidth = 2', () => {
      const initial = createInitialState({
        annotations: [makeAnnotation('a1', 1, 'box', 'amber', 2, 0.15)],
      });
      const dummyImg: BaseImage = {
        id: 'dummy-img-1',
        fileName: 'dummy.png',
        fileSize: 1024,
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        naturalWidth: 200,
        naturalHeight: 200,
      };

      // 1. REPLACE_IMAGE_AND_KEEP maintains activeStrokeWidth = 2
      const kept = appReducer(initial, {
        type: 'REPLACE_IMAGE_AND_KEEP',
        payload: { image: dummyImg },
      });
      expect(kept.activeStrokeWidth).toBe(2);
      expect(kept.annotations[0].style.strokeWidth).toBe(2);

      // 2. REPLACE_IMAGE_AND_CLEAR maintains activeStrokeWidth = 2
      const cleared = appReducer(initial, {
        type: 'REPLACE_IMAGE_AND_CLEAR',
        payload: { image: dummyImg },
      });
      expect(cleared.activeStrokeWidth).toBe(2);
      expect(cleared.annotations).toHaveLength(0);
    });
  });

  /* ========================================================================
   * 2. PRESET BUTTONS TOGGLING, FILL LABEL & ACTIVE INDICATORS
   * ======================================================================== */
  describe('2. Preset Buttons Toggling, Fill Label & Active Indicators', () => {
    it('C2.1: STROKE_WIDTH_OPTIONS matches exactly [2, 4, 8] and renders all three buttons', () => {
      expect(STROKE_WIDTH_OPTIONS).toEqual([2, 4, 8]);
      render(
        <AppProvider>
          <ColorPalette />
        </AppProvider>
      );
      expect(screen.getByTestId('stroke-btn-2')).toBeInTheDocument();
      expect(screen.getByTestId('stroke-btn-4')).toBeInTheDocument();
      expect(screen.getByTestId('stroke-btn-8')).toBeInTheDocument();
      expect(screen.queryByTestId('stroke-btn-6')).not.toBeInTheDocument();
    });

    it('C2.2: Toggling stroke preset buttons updates active stroke width and aria-checked', async () => {
      const user = userEvent.setup();
      let ctx: AppContextValue | undefined;
      const TestConsumer = () => {
        ctx = useApp();
        return <ColorPalette />;
      };

      render(
        <AppProvider>
          <TestConsumer />
        </AppProvider>
      );

      const btn2 = screen.getByTestId('stroke-btn-2');
      const btn4 = screen.getByTestId('stroke-btn-4');
      const btn8 = screen.getByTestId('stroke-btn-8');

      // Click 4px
      await user.click(btn4);
      expect(ctx!.state.activeStrokeWidth).toBe(4);
      expect(btn4).toHaveAttribute('aria-checked', 'true');
      expect(btn2).toHaveAttribute('aria-checked', 'false');
      expect(btn8).toHaveAttribute('aria-checked', 'false');

      // Click 8px
      await user.click(btn8);
      expect(ctx!.state.activeStrokeWidth).toBe(8);
      expect(btn8).toHaveAttribute('aria-checked', 'true');
      expect(btn4).toHaveAttribute('aria-checked', 'false');

      // Click 2px
      await user.click(btn2);
      expect(ctx!.state.activeStrokeWidth).toBe(2);
      expect(btn2).toHaveAttribute('aria-checked', 'true');
    });

    it('C2.3: Fill opacity preset options are [0, 0.15, 0.3, 0.5] with visible Fill label and amber indicator', async () => {
      const user = userEvent.setup();
      expect(FILL_OPACITY_OPTIONS.map((o) => o.value)).toEqual([0, 0.15, 0.3, 0.5]);

      render(
        <AppProvider initialState={{ activeFillOpacity: 0.15 }}>
          <ColorPalette />
        </AppProvider>
      );

      // Label check
      const label = screen.getByTestId('fill-opacity-label');
      expect(label).toBeInTheDocument();
      expect(label.textContent?.trim()).toBe('Fill');

      const btn0 = screen.getByTestId('opacity-btn-0');
      const btn15 = screen.getByTestId('opacity-btn-15');
      const btn30 = screen.getByTestId('opacity-btn-30');
      const btn50 = screen.getByTestId('opacity-btn-50');

      // 15% is active initially
      expect(btn15).toHaveAttribute('aria-checked', 'true');
      expect(btn15.className).toMatch(/border-amber-500/);
      expect(btn15.className).toMatch(/text-amber-700|text-amber-400/);

      // Inactive buttons have transparent border
      expect(btn0).toHaveAttribute('aria-checked', 'false');
      expect(btn0.className).toContain('border-transparent');
      expect(btn30).toHaveAttribute('aria-checked', 'false');
      expect(btn50).toHaveAttribute('aria-checked', 'false');

      // Click 50%
      await user.click(btn50);
      expect(btn50).toHaveAttribute('aria-checked', 'true');
      expect(btn50.className).toMatch(/border-amber-500/);
      expect(btn15).toHaveAttribute('aria-checked', 'false');
      expect(btn15.className).toContain('border-transparent');
    });
  });

  /* ========================================================================
   * 3. MULTI-SHAPE MUTATION ISOLATION & HISTORY STACK INTEGRITY
   * ======================================================================== */
  describe('3. Multi-Shape Mutation Isolation & History Stack Integrity', () => {
    it('C3.1: Mutating selected shape preserves styles of unselected shapes across all 3 stroke weights', async () => {
      const user = userEvent.setup();
      const shapes: Annotation[] = [
        makeAnnotation('s-2px', 1, 'box', 'cyan', 2, 0),
        makeAnnotation('s-4px', 2, 'ellipse', 'green', 4, 0.15),
        makeAnnotation('s-8px', 3, 'arrow', 'purple', 8, 0.5),
      ];

      let ctx: AppContextValue | undefined;
      const TestConsumer = () => {
        ctx = useApp();
        return <ColorPalette />;
      };

      render(
        <AppProvider initialState={{ annotations: shapes, selectedAnnotationId: 's-4px' }}>
          <TestConsumer />
        </AppProvider>
      );

      // Selected s-4px initially reflects stroke 4 and opacity 15
      expect(screen.getByTestId('stroke-btn-4')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('opacity-btn-15')).toHaveAttribute('aria-checked', 'true');

      // Mutate s-4px -> 8px, 0%
      await user.click(screen.getByTestId('stroke-btn-8'));
      await user.click(screen.getByTestId('opacity-btn-0'));

      const updatedS4 = ctx!.state.annotations.find((a) => a.id === 's-4px')!;
      expect(updatedS4.style.strokeWidth).toBe(8);
      expect(updatedS4.style.fillOpacity).toBe(0);

      // Verify unselected shapes retain exact original styles
      const s2 = ctx!.state.annotations.find((a) => a.id === 's-2px')!;
      const s8 = ctx!.state.annotations.find((a) => a.id === 's-8px')!;
      expect(s2.style).toEqual({ color: 'cyan', strokeWidth: 2, fillOpacity: 0 });
      expect(s8.style).toEqual({ color: 'purple', strokeWidth: 8, fillOpacity: 0.5 });
    });

    it('C3.2: Full undo/redo cycle across multiple stroke and opacity transitions', () => {
      let ctx: AppContextValue | undefined;
      const TestConsumer = () => {
        ctx = useApp();
        return null;
      };

      const shape = makeAnnotation('target', 1, 'box', 'amber', 2, 0.15);

      render(
        <AppProvider initialState={{ annotations: [shape], selectedAnnotationId: 'target' }}>
          <TestConsumer />
        </AppProvider>
      );

      // Step 1: 2 -> 4
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_STROKE_WIDTH', payload: 4 });
      });
      // Step 2: 4 -> 8
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      });
      // Step 3: opacity 0.15 -> 0.5
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.5 });
      });

      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(8);
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.5);

      // Undo 1: opacity 0.5 -> 0.15
      act(() => ctx!.undo());
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(8);
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.15);

      // Undo 2: stroke 8 -> 4
      act(() => ctx!.undo());
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(4);
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.15);

      // Undo 3: stroke 4 -> 2
      act(() => ctx!.undo());
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(2);
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.15);

      // Redo all 3
      act(() => ctx!.redo());
      act(() => ctx!.redo());
      act(() => ctx!.redo());
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(8);
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.5);
    });
  });

  /* ========================================================================
   * 4. HIGH-VELOCITY RANDOMIZED STRESS FUZZER (2,500 OPERATIONS)
   * ======================================================================== */
  describe('4. High-Velocity Randomized Stress Fuzzer (2,500 Operations)', () => {
    it('C4.1: 2,500 fuzzed stroke, opacity, shape creation, and undo/redo operations maintain all invariants', () => {
      let state = createInitialState({
        activeStrokeWidth: 2,
        activeFillOpacity: 0.15,
        annotations: [
          makeAnnotation('fz-1', 1, 'box', 'amber', 2, 0),
          makeAnnotation('fz-2', 2, 'ellipse', 'red', 4, 0.15),
          makeAnnotation('fz-3', 3, 'arrow', 'green', 8, 0.3),
          makeAnnotation('fz-4', 4, 'pin', 'cyan', 2, 0.5),
        ],
        selectedAnnotationId: 'fz-1',
      });

      const strokePresets = [2, 4, 8] as const;
      const opacityPresets = [0, 0.15, 0.3, 0.5] as const;
      const colorPresets: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];
      const shapeTypes = ['box', 'ellipse', 'arrow', 'pin'] as const;

      for (let op = 0; op < 2500; op++) {
        const actionType = op % 8;

        if (actionType === 0) {
          // Change selection (random shape or null)
          const randTarget =
            Math.random() > 0.3 && state.annotations.length > 0
              ? state.annotations[Math.floor(Math.random() * state.annotations.length)].id
              : null;
          state = appReducer(state, { type: 'SELECT_ANNOTATION', payload: randTarget });
        } else if (actionType === 1) {
          // Mutate stroke width (valid preset)
          const sw = strokePresets[Math.floor(Math.random() * strokePresets.length)];
          state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: sw });
        } else if (actionType === 2) {
          // Mutate fill opacity (valid preset)
          const fo = opacityPresets[Math.floor(Math.random() * opacityPresets.length)];
          state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: fo });
        } else if (actionType === 3) {
          // Mutate color
          const col = colorPresets[Math.floor(Math.random() * colorPresets.length)];
          state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: col });
        } else if (actionType === 4) {
          // Add annotation of random shape type inheriting active styles
          const st = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
          let geom;
          if (st === 'box') {
            geom = { type: 'box' as const, x: 10 + op, y: 10 + op, width: 50, height: 30 };
          } else if (st === 'ellipse') {
            geom = { type: 'ellipse' as const, cx: 50 + op, cy: 50 + op, rx: 25, ry: 15 };
          } else if (st === 'arrow') {
            geom = { type: 'arrow' as const, startX: op, startY: op, endX: op + 40, endY: op + 40 };
          } else {
            geom = { type: 'pin' as const, x: 20 + op, y: 20 + op };
          }
          state = appReducer(state, {
            type: 'ADD_ANNOTATION',
            payload: { geometry: geom },
          });
        } else if (actionType === 5) {
          // Delete annotation if any exist
          if (state.annotations.length > 2 && state.selectedAnnotationId) {
            state = appReducer(state, {
              type: 'DELETE_ANNOTATION',
              payload: { id: state.selectedAnnotationId },
            });
          }
        } else if (actionType === 6) {
          // Replace image and keep annotations
          state = appReducer(state, {
            type: 'REPLACE_IMAGE_AND_KEEP',
            payload: {
              image: {
                id: 'fuzz-img',
                fileName: 'fuzz.png',
                fileSize: 2048,
                src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                naturalWidth: 800,
                naturalHeight: 600,
              },
            },
          });
        } else {
          // Deselect
          state = appReducer(state, { type: 'SELECT_ANNOTATION', payload: null });
        }

        // Assert core invariants on every iteration:
        expect(strokePresets.includes(state.activeStrokeWidth as (typeof strokePresets)[number])).toBe(true);
        expect(opacityPresets.includes(state.activeFillOpacity as (typeof opacityPresets)[number])).toBe(true);
        expect(state.annotations.every((a) => !Number.isNaN(a.style.strokeWidth) && a.style.strokeWidth > 0)).toBe(true);
        expect(state.annotations.every((a) => !Number.isNaN(a.style.fillOpacity) && a.style.fillOpacity >= 0 && a.style.fillOpacity <= 1)).toBe(true);
        expect(state.annotations.every((a, idx) => a.index === idx + 1)).toBe(true);
      }
    });
  });

  /* ========================================================================
   * 5. EXPORT RASTERIZATION & OFFSCREEN RENDERING FIDELITY
   * ======================================================================== */
  describe('5. Export Rasterization & Offscreen Rendering Fidelity', () => {
    it('C5.1: rasterizeAnnotation draws box with exact lineWidth 2/4/8 and rgba fillStyle for each opacity preset', () => {
      const strokeWeights = [2, 4, 8] as const;
      const opacityOptions = [0, 0.15, 0.3, 0.5] as const;

      for (const sw of strokeWeights) {
        for (const fo of opacityOptions) {
          const canvas = createCanvas(400, 300);
          const ctx = canvas.getContext('2d')!;

          const recordedLineWidths: number[] = [];
          const recordedFillStyles: string[] = [];

          const origStroke = ctx.stroke.bind(ctx);
          vi.spyOn(ctx, 'stroke').mockImplementation(() => {
            recordedLineWidths.push(ctx.lineWidth);
            return origStroke();
          });

          const origFill = ctx.fill.bind(ctx);
          vi.spyOn(ctx, 'fill').mockImplementation(() => {
            recordedFillStyles.push(String(ctx.fillStyle));
            return origFill();
          });

          const box = makeAnnotation(`box-${sw}-${fo}`, 1, 'box', 'cyan', sw, fo);
          rasterizeAnnotation(ctx, box);

          // Box stroke is index 0
          expect(recordedLineWidths[0]).toBe(sw);
          // Box fill is index 0
          const expectedFill = hexToRgba(PRESET_COLORS.cyan.hex, fo);
          expect(recordedFillStyles[0]).toBe(expectedFill);
        }
      }
    });

    it('C5.2: rasterizeAnnotation draws ellipse with exact lineWidth 2/4/8 and rgba fillStyle', () => {
      const strokeWeights = [2, 4, 8] as const;
      const opacityOptions = [0, 0.15, 0.3, 0.5] as const;

      for (const sw of strokeWeights) {
        for (const fo of opacityOptions) {
          const canvas = createCanvas(400, 300);
          const ctx = canvas.getContext('2d')!;

          const recordedLineWidths: number[] = [];
          const recordedFillStyles: string[] = [];

          const origStroke = ctx.stroke.bind(ctx);
          vi.spyOn(ctx, 'stroke').mockImplementation(() => {
            recordedLineWidths.push(ctx.lineWidth);
            return origStroke();
          });

          const origFill = ctx.fill.bind(ctx);
          vi.spyOn(ctx, 'fill').mockImplementation(() => {
            recordedFillStyles.push(String(ctx.fillStyle));
            return origFill();
          });

          const ellipse = makeAnnotation(`ellipse-${sw}-${fo}`, 2, 'ellipse', 'purple', sw, fo);
          rasterizeAnnotation(ctx, ellipse);

          expect(recordedLineWidths[0]).toBe(sw);
          const expectedFill = hexToRgba(PRESET_COLORS.purple.hex, fo);
          expect(recordedFillStyles[0]).toBe(expectedFill);
        }
      }
    });

    it('C5.3: Arrow rasterization dynamically scales arrowhead geometry without NaN or infinite coordinates', () => {
      const strokeWeights = [2, 4, 8] as const;

      for (const sw of strokeWeights) {
        const arrow = makeAnnotation(`arr-${sw}`, 1, 'arrow', 'green', sw, 0.15);
        const canvas = createCanvas(500, 500);
        const ctx = canvas.getContext('2d')!;

        const movedPoints: { x: number; y: number }[] = [];
        const linedPoints: { x: number; y: number }[] = [];
        const recordedLineWidths: number[] = [];

        vi.spyOn(ctx, 'moveTo').mockImplementation((x, y) => {
          movedPoints.push({ x, y });
        });
        vi.spyOn(ctx, 'lineTo').mockImplementation((x, y) => {
          linedPoints.push({ x, y });
        });
        const origStroke = ctx.stroke.bind(ctx);
        vi.spyOn(ctx, 'stroke').mockImplementation(() => {
          recordedLineWidths.push(ctx.lineWidth);
          return origStroke();
        });

        rasterizeAnnotation(ctx, arrow);

        // Shaft lineWidth
        expect(recordedLineWidths[0]).toBe(sw);

        // All moveTo and lineTo coordinates must be finite and non-NaN
        expect(movedPoints.length).toBeGreaterThan(0);
        expect(linedPoints.length).toBeGreaterThan(0);
        expect(movedPoints.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
        expect(linedPoints.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      }
    });

    it('C5.4: calculateArrowhead handles zero-length arrow degenerate coordinates gracefully with 8px stroke', () => {
      // Degenerate case: start point equals end point
      const arrowhead = calculateArrowhead({ x: 100, y: 100 }, { x: 100, y: 100 }, 8);

      expect(Number.isFinite(arrowhead.tip.x)).toBe(true);
      expect(Number.isFinite(arrowhead.tip.y)).toBe(true);
      expect(Number.isFinite(arrowhead.shaftEnd.x)).toBe(true);
      expect(Number.isFinite(arrowhead.shaftEnd.y)).toBe(true);
      expect(Number.isFinite(arrowhead.wingLeft.x)).toBe(true);
      expect(Number.isFinite(arrowhead.wingLeft.y)).toBe(true);
      expect(Number.isFinite(arrowhead.wingRight.x)).toBe(true);
      expect(Number.isFinite(arrowhead.wingRight.y)).toBe(true);
      expect(Number.isFinite(arrowhead.notch.x)).toBe(true);
      expect(Number.isFinite(arrowhead.notch.y)).toBe(true);
    });

    it('C5.5: SVG ShapeRenderer matches strokeWidth and rgba fill on DOM elements', () => {
      const ann = makeAnnotation('svg-shape', 1, 'box', 'amber', 8, 0.3);
      const { container } = render(
        <svg>
          <ShapeRenderer annotation={ann} />
        </svg>
      );

      const rect = container.querySelector('rect');
      expect(rect).not.toBeNull();
      expect(rect).toHaveAttribute('stroke-width', '8');
      expect(rect).toHaveAttribute('fill', hexToRgba(PRESET_COLORS.amber.hex, 0.3));
    });

    it('C5.6: renderCompositeCanvas composites base image with annotations across all stroke presets [2, 4, 8] without error', async () => {
      const baseImage: BaseImage = {
        id: 'export-base-img',
        fileName: 'export-base.png',
        fileSize: 4096,
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        naturalWidth: 640,
        naturalHeight: 480,
      };

      const annotations: Annotation[] = [
        makeAnnotation('exp-1', 1, 'box', 'red', 2, 0),
        makeAnnotation('exp-2', 2, 'ellipse', 'amber', 4, 0.15),
        makeAnnotation('exp-3', 3, 'arrow', 'green', 8, 0.5),
        makeAnnotation('exp-4', 4, 'pin', 'cyan', 2, 0.3),
      ];

      const canvas = await renderCompositeCanvas(baseImage, annotations);
      expect(canvas).toBeDefined();
      expect(canvas.width).toBe(640);
      expect(canvas.height).toBe(480);
    });
  });
});
