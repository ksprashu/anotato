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
import { appReducer, createInitialState } from '../../src/state/appReducer';
import { rasterizeAnnotation, createCanvas } from '../../src/export/canvasExporter';
import { PRESET_COLORS } from '../../src/constants/colors';
import { Annotation, PresetColor } from '../../src/types';

describe('Milestone 3 Challenger 2: Stroke Width (2/4/8px) & Fill Opacity Mutation Adversarial Stress Suite', () => {
  function makeAnnotation(
    id: string,
    index: number,
    type: 'box' | 'ellipse' | 'arrow' | 'pin' = 'box',
    color: PresetColor = 'amber',
    strokeWidth = 4,
    fillOpacity = 0.15
  ): Annotation {
    let geometry;
    if (type === 'box') {
      geometry = { type: 'box' as const, x: index * 15, y: index * 15, width: 60, height: 40 };
    } else if (type === 'ellipse') {
      geometry = { type: 'ellipse' as const, cx: index * 20, cy: index * 20, rx: 30, ry: 20 };
    } else if (type === 'arrow') {
      geometry = { type: 'arrow' as const, startX: index * 10, startY: index * 10, endX: index * 10 + 50, endY: index * 10 + 50 };
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
   * 1. PRESET SPECIFICATION & WHITELIST RIGIDITY (R4.1, R5.1)
   * ======================================================================== */
  describe('1. Preset Specification & Strict Whitelist Invariants', () => {
    it('C1.1: STROKE_WIDTH_OPTIONS strictly equals [2, 4, 8] and completely purges legacy 6px', () => {
      expect(STROKE_WIDTH_OPTIONS).toEqual([2, 4, 8]);
      expect((STROKE_WIDTH_OPTIONS as readonly number[]).includes(6)).toBe(false);
      expect(STROKE_WIDTH_OPTIONS).toHaveLength(3);
    });

    it('C1.2: ColorPalette DOM strictly renders stroke buttons 2px, 4px, 8px and NEVER renders 6px', () => {
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

    it('C1.3: FILL_OPACITY_OPTIONS strictly equals [0, 0.15, 0.3, 0.5] with exact percentage labels', () => {
      expect(FILL_OPACITY_OPTIONS.map((opt) => opt.value)).toEqual([0, 0.15, 0.3, 0.5]);
      expect(FILL_OPACITY_OPTIONS.map((opt) => opt.label)).toEqual(['0%', '15%', '30%', '50%']);
      expect(FILL_OPACITY_OPTIONS).toHaveLength(4);
    });

    it('C1.4: Renders explicit and visible Fill label element (R5.1)', () => {
      render(
        <AppProvider>
          <ColorPalette />
        </AppProvider>
      );

      const label = screen.getByTestId('fill-opacity-label');
      expect(label).toBeInTheDocument();
      expect(label.textContent?.trim()).toBe('Fill');
    });

    it('C1.5: Enforces high-contrast amber accent indicator on active opacity preset button and transparent on inactive (R5.3)', async () => {
      const user = userEvent.setup();
      render(
        <AppProvider initialState={{ activeFillOpacity: 0.3 }}>
          <ColorPalette />
        </AppProvider>
      );

      const btn0 = screen.getByTestId('opacity-btn-0');
      const btn15 = screen.getByTestId('opacity-btn-15');
      const btn30 = screen.getByTestId('opacity-btn-30');
      const btn50 = screen.getByTestId('opacity-btn-50');

      // Active 30%
      expect(btn30).toHaveAttribute('aria-checked', 'true');
      expect(btn30.className).toMatch(/text-amber-700|text-amber-400/);
      expect(btn30.className).toMatch(/border-amber-500/);

      // Inactive 0%, 15%, 50%
      expect(btn0).toHaveAttribute('aria-checked', 'false');
      expect(btn0.className).toContain('border-transparent');
      expect(btn15).toHaveAttribute('aria-checked', 'false');
      expect(btn15.className).toContain('border-transparent');
      expect(btn50).toHaveAttribute('aria-checked', 'false');
      expect(btn50.className).toContain('border-transparent');

      // Click 0%
      await user.click(btn0);
      expect(btn0).toHaveAttribute('aria-checked', 'true');
      expect(btn0.className).toMatch(/text-amber-700|text-amber-400/);
      expect(btn0.className).toMatch(/border-amber-500/);
      expect(btn30).toHaveAttribute('aria-checked', 'false');
      expect(btn30.className).toContain('border-transparent');
    });
  });

  /* ========================================================================
   * 2. SELECTED SHAPE MUTATION & MULTI-SHAPE ISOLATION (R4.2, R5.2)
   * ======================================================================== */
  describe('2. Selected Shape Mutation & Strict Isolation Across Multiple Shapes', () => {
    it('C2.1: Clicking stroke width and opacity buttons immediately mutates selected shape without altering unselected shapes', async () => {
      const user = userEvent.setup();
      const shapes: Annotation[] = [
        makeAnnotation('shape-1', 1, 'box', 'red', 2, 0),
        makeAnnotation('shape-2', 2, 'ellipse', 'amber', 4, 0.15),
        makeAnnotation('shape-3', 3, 'arrow', 'green', 4, 0.3),
        makeAnnotation('shape-4', 4, 'box', 'cyan', 2, 0.15),
      ];

      let ctx: AppContextValue | undefined;
      const TestContainer = () => {
        ctx = useApp();
        return <ColorPalette />;
      };

      render(
        <AppProvider initialState={{ annotations: shapes, selectedAnnotationId: 'shape-2' }}>
          <TestContainer />
        </AppProvider>
      );

      // Initially shape-2 is selected (amber, 4px, 15%)
      expect(screen.getByTestId('stroke-btn-4')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('opacity-btn-15')).toHaveAttribute('aria-checked', 'true');

      // Mutate shape-2 to 8px and 50%
      await user.click(screen.getByTestId('stroke-btn-8'));
      await user.click(screen.getByTestId('opacity-btn-50'));

      expect(screen.getByTestId('stroke-btn-8')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('opacity-btn-50')).toHaveAttribute('aria-checked', 'true');

      // Verify shape-2 mutated in state
      const updatedShape2 = ctx!.state.annotations.find((a) => a.id === 'shape-2')!;
      expect(updatedShape2.style.strokeWidth).toBe(8);
      expect(updatedShape2.style.fillOpacity).toBe(0.5);

      // Verify shapes 1, 3, 4 are strictly unchanged!
      const shape1 = ctx!.state.annotations.find((a) => a.id === 'shape-1')!;
      const shape3 = ctx!.state.annotations.find((a) => a.id === 'shape-3')!;
      const shape4 = ctx!.state.annotations.find((a) => a.id === 'shape-4')!;

      expect(shape1.style).toEqual({ color: 'red', strokeWidth: 2, fillOpacity: 0 });
      expect(shape3.style).toEqual({ color: 'green', strokeWidth: 4, fillOpacity: 0.3 });
      expect(shape4.style).toEqual({ color: 'cyan', strokeWidth: 2, fillOpacity: 0.15 });
    });

    it('C2.2: Seamlessly switches active indicators when toggling selection across shapes with distinct styles', async () => {
      const shapes: Annotation[] = [
        makeAnnotation('shape-A', 1, 'box', 'purple', 8, 0.5),
        makeAnnotation('shape-B', 2, 'box', 'green', 2, 0),
        makeAnnotation('shape-C', 3, 'box', 'cyan', 4, 0.3),
      ];

      let ctx: AppContextValue | undefined;
      const TestContainer = () => {
        ctx = useApp();
        return <ColorPalette />;
      };

      render(
        <AppProvider initialState={{ annotations: shapes, selectedAnnotationId: 'shape-A' }}>
          <TestContainer />
        </AppProvider>
      );

      // Selection A: purple, 8px, 50%
      expect(screen.getByTestId('color-btn-purple')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('stroke-btn-8')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('opacity-btn-50')).toHaveAttribute('aria-checked', 'true');

      // Switch selection to B: green, 2px, 0%
      act(() => {
        ctx!.dispatch({ type: 'SELECT_ANNOTATION', payload: 'shape-B' });
      });
      expect(screen.getByTestId('color-btn-green')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('stroke-btn-2')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('opacity-btn-0')).toHaveAttribute('aria-checked', 'true');

      // Switch selection to C: cyan, 4px, 30%
      act(() => {
        ctx!.dispatch({ type: 'SELECT_ANNOTATION', payload: 'shape-C' });
      });
      expect(screen.getByTestId('color-btn-cyan')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('stroke-btn-4')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('opacity-btn-30')).toHaveAttribute('aria-checked', 'true');
    });

    it('C2.3: Modifying defaults with NO annotation selected updates creation settings and leaves existing shapes intact', async () => {
      const user = userEvent.setup();
      const existingShapes: Annotation[] = [
        makeAnnotation('s1', 1, 'box', 'amber', 4, 0.15),
        makeAnnotation('s2', 2, 'ellipse', 'red', 2, 0.3),
      ];

      let ctx: AppContextValue | undefined;
      const TestContainer = () => {
        ctx = useApp();
        return <ColorPalette />;
      };

      render(
        <AppProvider initialState={{ annotations: existingShapes, selectedAnnotationId: null, activeStrokeWidth: 4, activeFillOpacity: 0.15 }}>
          <TestContainer />
        </AppProvider>
      );

      // Set creation defaults to 8px and 50%
      await user.click(screen.getByTestId('stroke-btn-8'));
      await user.click(screen.getByTestId('opacity-btn-50'));

      expect(ctx!.state.activeStrokeWidth).toBe(8);
      expect(ctx!.state.activeFillOpacity).toBe(0.5);

      // Existing shapes must NOT be modified!
      expect(ctx!.state.annotations[0].style).toEqual({ color: 'amber', strokeWidth: 4, fillOpacity: 0.15 });
      expect(ctx!.state.annotations[1].style).toEqual({ color: 'red', strokeWidth: 2, fillOpacity: 0.3 });

      // Creating a new shape inherits 8px and 50%
      act(() => {
        ctx!.dispatch({
          type: 'ADD_ANNOTATION',
          payload: {
            geometry: { type: 'box', x: 100, y: 100, width: 50, height: 50 },
          },
        });
      });

      expect(ctx!.state.annotations).toHaveLength(3);
      expect(ctx!.state.annotations[2].style.strokeWidth).toBe(8);
      expect(ctx!.state.annotations[2].style.fillOpacity).toBe(0.5);
    });
  });

  /* ========================================================================
   * 3. SVG CANVAS RENDERING FIDELITY ACROSS ALL SHAPE TYPES
   * ======================================================================== */
  describe('3. SVG Canvas Rendering Fidelity Across All Shape Types', () => {
    it('C3.1: ShapeRenderer renders box with exact strokeWidth 2/4/8 and rgba fill opacity', () => {
      for (const strokeWidth of [2, 4, 8] as const) {
        for (const fillOpacity of [0, 0.15, 0.3, 0.5] as const) {
          const ann = makeAnnotation('test-box', 1, 'box', 'cyan', strokeWidth, fillOpacity);
          const { container, unmount } = render(
            <svg>
              <ShapeRenderer annotation={ann} />
            </svg>
          );

          const rect = container.querySelector('rect[data-testid="shape-box"] rect, rect:not([className])');
          expect(rect).not.toBeNull();
          expect(rect).toHaveAttribute('stroke-width', strokeWidth.toString());

          const expectedRgba = hexToRgba(PRESET_COLORS.cyan.hex, fillOpacity);
          expect(rect).toHaveAttribute('fill', expectedRgba);

          unmount();
        }
      }
    });

    it('C3.2: ShapeRenderer renders ellipse with exact strokeWidth 2/4/8 and rgba fill opacity', () => {
      for (const strokeWidth of [2, 4, 8] as const) {
        for (const fillOpacity of [0, 0.15, 0.3, 0.5] as const) {
          const ann = makeAnnotation('test-ellipse', 1, 'ellipse', 'purple', strokeWidth, fillOpacity);
          const { container, unmount } = render(
            <svg>
              <ShapeRenderer annotation={ann} />
            </svg>
          );

          const ellipse = container.querySelector('ellipse:not([className])');
          expect(ellipse).not.toBeNull();
          expect(ellipse).toHaveAttribute('stroke-width', strokeWidth.toString());

          const expectedRgba = hexToRgba(PRESET_COLORS.purple.hex, fillOpacity);
          expect(ellipse).toHaveAttribute('fill', expectedRgba);

          unmount();
        }
      }
    });

    it('C3.3: ShapeRenderer renders arrow with shaft strokeWidth 2/4/8 and dynamically scaled arrowhead', () => {
      for (const strokeWidth of [2, 4, 8] as const) {
        const ann = makeAnnotation('test-arrow', 1, 'arrow', 'green', strokeWidth, 0.15);
        const { container, unmount } = render(
          <svg>
            <ShapeRenderer annotation={ann} />
          </svg>
        );

        const line = container.querySelector('line:not([className])');
        expect(line).not.toBeNull();
        expect(line).toHaveAttribute('stroke-width', strokeWidth.toString());

        // Arrowhead path exists
        const path = container.querySelector('path');
        expect(path).not.toBeNull();
        expect(path?.getAttribute('d')).toBeTruthy();

        unmount();
      }
    });

    it('C3.4: Callout pin selection and mutation survives without throwing errors', () => {
      const pin = makeAnnotation('test-pin', 1, 'pin', 'amber', 4, 0.15);
      const state = createInitialState({ annotations: [pin], selectedAnnotationId: 'test-pin' });

      // Mutate stroke width and fill opacity
      const next1 = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      expect(next1.annotations[0].style.strokeWidth).toBe(8);

      const next2 = appReducer(next1, { type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.5 });
      expect(next2.annotations[0].style.fillOpacity).toBe(0.5);

      // Rendering pin with updated styles
      const { container, unmount } = render(
        <svg>
          <ShapeRenderer annotation={next2.annotations[0]} />
        </svg>
      );
      expect(container.querySelector('[data-testid="shape-pin"]')).toBeInTheDocument();
      unmount();
    });
  });

  /* ========================================================================
   * 4. UNDO / REDO FIDELITY FOR STROKE WIDTH & OPACITY MUTATIONS
   * ======================================================================== */
  describe('4. Undo / Redo Fidelity for Stroke Width & Opacity Mutations', () => {
    it('C4.1: Seamlessly unwinds and redoes sequential stroke width mutations (2 -> 4 -> 8 -> 2)', () => {
      let ctx: AppContextValue | undefined;
      const TestContainer = () => {
        ctx = useApp();
        return null;
      };

      const initialAnnotation = makeAnnotation('shape-undo', 1, 'box', 'amber', 2, 0.15);

      render(
        <AppProvider initialState={{ annotations: [initialAnnotation], selectedAnnotationId: 'shape-undo' }}>
          <TestContainer />
        </AppProvider>
      );

      // Mutate 2 -> 4
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_STROKE_WIDTH', payload: 4 });
      });
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(4);

      // Mutate 4 -> 8
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_STROKE_WIDTH', payload: 8 });
      });
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(8);

      // Mutate 8 -> 2
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_STROKE_WIDTH', payload: 2 });
      });
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(2);

      // Undo 1: 2 -> 8
      act(() => {
        ctx!.undo();
      });
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(8);

      // Undo 2: 8 -> 4
      act(() => {
        ctx!.undo();
      });
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(4);

      // Undo 3: 4 -> 2
      act(() => {
        ctx!.undo();
      });
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(2);

      // Redo 1: 2 -> 4
      act(() => {
        ctx!.redo();
      });
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(4);

      // Redo 2: 4 -> 8
      act(() => {
        ctx!.redo();
      });
      expect(ctx!.state.annotations[0].style.strokeWidth).toBe(8);
    });

    it('C4.2: Seamlessly unwinds and redoes fill opacity mutations (0% -> 15% -> 30% -> 50%)', () => {
      let ctx: AppContextValue | undefined;
      const TestContainer = () => {
        ctx = useApp();
        return null;
      };

      const initialAnnotation = makeAnnotation('shape-undo-opacity', 1, 'box', 'cyan', 4, 0);

      render(
        <AppProvider initialState={{ annotations: [initialAnnotation], selectedAnnotationId: 'shape-undo-opacity' }}>
          <TestContainer />
        </AppProvider>
      );

      // Mutate 0 -> 0.15 -> 0.3 -> 0.5
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.15 });
      });
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.3 });
      });
      act(() => {
        ctx!.dispatch({ type: 'SET_ACTIVE_FILL_OPACITY', payload: 0.5 });
      });
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.5);

      // Undo 3 times back to 0
      act(() => ctx!.undo());
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.3);
      act(() => ctx!.undo());
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.15);
      act(() => ctx!.undo());
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0);

      // Redo back to 0.5
      act(() => ctx!.redo());
      act(() => ctx!.redo());
      act(() => ctx!.redo());
      expect(ctx!.state.annotations[0].style.fillOpacity).toBe(0.5);
    });
  });

  /* ========================================================================
   * 5. HIGH-VELOCITY RANDOMIZED STRESS FUZZER (1,000 CYCLES)
   * ======================================================================== */
  describe('5. High-Velocity Randomized Stress Fuzzer (1,000 Operations)', () => {
    it('C5.1: 1,000 rapid randomized stroke, opacity, color, and undo operations maintain invariant integrity', () => {
      let state = createInitialState({
        activeStrokeWidth: 4,
        activeFillOpacity: 0.15,
        annotations: [
          makeAnnotation('fuzz-1', 1, 'box', 'amber', 2, 0),
          makeAnnotation('fuzz-2', 2, 'ellipse', 'red', 4, 0.15),
          makeAnnotation('fuzz-3', 3, 'arrow', 'green', 8, 0.5),
        ],
        selectedAnnotationId: 'fuzz-1',
      });

      const allowedStrokes = [2, 4, 8] as const;
      const allowedOpacities = [0, 0.15, 0.3, 0.5] as const;
      const allowedColors: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];

      for (let step = 0; step < 1000; step++) {
        const choice = step % 6;

        if (choice === 0) {
          // Select random annotation or null
          const target = Math.random() > 0.2 && state.annotations.length > 0
            ? state.annotations[Math.floor(Math.random() * state.annotations.length)].id
            : null;
          state = appReducer(state, { type: 'SELECT_ANNOTATION', payload: target });
        } else if (choice === 1) {
          // Mutate stroke width
          const width = allowedStrokes[Math.floor(Math.random() * allowedStrokes.length)];
          state = appReducer(state, { type: 'SET_ACTIVE_STROKE_WIDTH', payload: width });
        } else if (choice === 2) {
          // Mutate fill opacity
          const opacity = allowedOpacities[Math.floor(Math.random() * allowedOpacities.length)];
          state = appReducer(state, { type: 'SET_ACTIVE_FILL_OPACITY', payload: opacity });
        } else if (choice === 3) {
          // Mutate color
          const color = allowedColors[Math.floor(Math.random() * allowedColors.length)];
          state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: color });
        } else if (choice === 4) {
          // Add new annotation inheriting current defaults
          state = appReducer(state, {
            type: 'ADD_ANNOTATION',
            payload: {
              geometry: { type: 'box', x: Math.random() * 200, y: Math.random() * 200, width: 50, height: 50 },
            },
          });
        } else {
          // Delete selected annotation if any
          if (state.selectedAnnotationId && state.annotations.length > 1) {
            state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: state.selectedAnnotationId } });
          }
        }

        // Invariants verification on each step:
        expect(allowedStrokes.includes(state.activeStrokeWidth as (typeof allowedStrokes)[number])).toBe(true);
        expect(allowedOpacities.includes(state.activeFillOpacity as (typeof allowedOpacities)[number])).toBe(true);
        expect(state.annotations.every((a) => !isNaN(a.style.strokeWidth) && a.style.strokeWidth > 0)).toBe(true);
        expect(state.annotations.every((a) => !isNaN(a.style.fillOpacity) && a.style.fillOpacity >= 0 && a.style.fillOpacity <= 1)).toBe(true);
        expect(state.annotations.every((a, idx) => a.index === idx + 1)).toBe(true);
      }
    });
  });

  /* ========================================================================
   * 6. CANVAS EXPORTER RASTERIZATION FIDELITY (R4, R5)
   * ======================================================================== */
  describe('6. 1:1 Canvas Exporter Rasterization Fidelity', () => {
    it('C6.1: rasterizeAnnotation draws box with exact lineWidth 8 and 50% rgba fillStyle', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      const filledStyles: (string | CanvasGradient | CanvasPattern)[] = [];
      const strokedStyles: (string | CanvasGradient | CanvasPattern)[] = [];
      const strokedLineWidths: number[] = [];

      const origFill = ctx.fill.bind(ctx);
      vi.spyOn(ctx, 'fill').mockImplementation(() => {
        filledStyles.push(ctx.fillStyle);
        return origFill();
      });

      const origStroke = ctx.stroke.bind(ctx);
      vi.spyOn(ctx, 'stroke').mockImplementation(() => {
        strokedLineWidths.push(ctx.lineWidth);
        strokedStyles.push(ctx.strokeStyle);
        return origStroke();
      });

      const box = makeAnnotation('exp-box', 1, 'box', 'purple', 8, 0.5);
      rasterizeAnnotation(ctx, box);

      // The first stroke and fill are the box shape
      expect(strokedLineWidths[0]).toBe(8);
      const expectedFill = hexToRgba(PRESET_COLORS.purple.hex, 0.5);
      expect(filledStyles[0]).toBe(expectedFill);
      expect(strokedStyles[0]).toBe(PRESET_COLORS.purple.stroke);
    });

    it('C6.2: rasterizeAnnotation draws box with outline mode (0% fill) without visual artifacting', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      const filledStyles: (string | CanvasGradient | CanvasPattern)[] = [];
      const strokedStyles: (string | CanvasGradient | CanvasPattern)[] = [];
      const strokedLineWidths: number[] = [];

      const origFill = ctx.fill.bind(ctx);
      vi.spyOn(ctx, 'fill').mockImplementation(() => {
        filledStyles.push(ctx.fillStyle);
        return origFill();
      });

      const origStroke = ctx.stroke.bind(ctx);
      vi.spyOn(ctx, 'stroke').mockImplementation(() => {
        strokedLineWidths.push(ctx.lineWidth);
        strokedStyles.push(ctx.strokeStyle);
        return origStroke();
      });

      const outlineBox = makeAnnotation('exp-outline', 2, 'box', 'cyan', 2, 0);
      rasterizeAnnotation(ctx, outlineBox);

      // The first stroke is the box outline (lineWidth 2)
      expect(strokedLineWidths[0]).toBe(2);
      const expectedFill = hexToRgba(PRESET_COLORS.cyan.hex, 0);
      expect(filledStyles[0]).toBe(expectedFill);
      expect(strokedStyles[0]).toBe(PRESET_COLORS.cyan.stroke);
    });

    it('C6.3: rasterizeAnnotation draws arrow shaft with lineWidth 8 and matching stroke color', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      const strokedStyles: (string | CanvasGradient | CanvasPattern)[] = [];
      const strokedLineWidths: number[] = [];

      const origStroke = ctx.stroke.bind(ctx);
      vi.spyOn(ctx, 'stroke').mockImplementation(() => {
        strokedLineWidths.push(ctx.lineWidth);
        strokedStyles.push(ctx.strokeStyle);
        return origStroke();
      });

      const arrow = makeAnnotation('exp-arrow', 3, 'arrow', 'green', 8, 0.15);
      rasterizeAnnotation(ctx, arrow);

      // The first stroke is the arrow shaft (lineWidth 8)
      expect(strokedLineWidths[0]).toBe(8);
      expect(strokedStyles[0]).toBe(PRESET_COLORS.green.stroke);
    });
  });
});
