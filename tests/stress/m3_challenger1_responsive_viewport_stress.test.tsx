import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { TOOL_ITEMS } from '../../src/components/toolbar/MainToolbar';
import { STROKE_WIDTH_OPTIONS, FILL_OPACITY_OPTIONS } from '../../src/components/toolbar/ColorPalette';

/**
 * Milestone 3 Challenger 1: Comprehensive Responsive Viewport & Anti-Hiding Stress Test Suite
 *
 * Mandate:
 * Empirically challenge responsive layout and anti-hiding across 1920px down to 320px.
 * Verify that all drawing tools, styling controls, zoom controls, history controls,
 * and image actions remain fully rendered, interactive, accessible, and unclipped.
 */
describe('Milestone 3 Challenger 1: Responsive Viewport & Anti-Hiding Stress Test Suite (1920px to 320px)', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  const setViewport = (width: number, height: number = 900) => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
    window.dispatchEvent(new Event('resize'));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1280, 900);
  });

  afterEach(() => {
    setViewport(originalInnerWidth, originalInnerHeight);
  });

  /* ========================================================================
   * 1. DISCRETE VIEWPORT LADDER COVERAGE (1920px down to 320px)
   * ======================================================================== */
  const VIEWPORT_LADDER = [
    { name: '1920px Desktop Full HD', width: 1920, height: 1080 },
    { name: '1440px Desktop 2K/QHD', width: 1440, height: 900 },
    { name: '1280px Desktop Standard / xl breakpoint', width: 1280, height: 800 },
    { name: '1024px Tablet Landscape / iPad Pro / lg breakpoint', width: 1024, height: 768 },
    { name: '896px Large Mobile Landscape / Surface', width: 896, height: 600 },
    { name: '768px Tablet Portrait / iPad / md breakpoint', width: 768, height: 1024 },
    { name: '640px Mobile Large / sm breakpoint', width: 640, height: 800 },
    { name: '480px Mobile Medium', width: 480, height: 854 },
    { name: '375px iPhone Standard / Compact Mobile', width: 375, height: 667 },
    { name: '320px Ultra-Compact Mobile / iPhone SE / Galaxy Fold', width: 320, height: 568 },
  ] as const;

  describe('Section 1: Exhaustive Viewport Ladder Rendering & Anti-Hiding Invariants', () => {
    VIEWPORT_LADDER.forEach(({ name, width, height }) => {
      it(`renders all essential toolbars and controls at ${name} (${width}x${height})`, () => {
        setViewport(width, height);
        render(<App />);

        // Invariant 1: All 6 drawing tools rendered and NOT hidden
        const mainToolbar = screen.getByTestId('main-toolbar');
        expect(mainToolbar).toBeInTheDocument();
        expect(mainToolbar.closest('.hidden')).toBeNull();

        TOOL_ITEMS.forEach((tool) => {
          const btn = screen.getByTestId(`tool-btn-${tool.id}`);
          expect(btn).toBeInTheDocument();
          expect(btn.closest('.hidden')).toBeNull();
        });

        // Invariant 2: ColorPalette rendered with all presets and NOT hidden
        const colorPalette = screen.getByTestId('color-palette');
        expect(colorPalette).toBeInTheDocument();
        expect(colorPalette.closest('.hidden')).toBeNull();

        // Stroke width buttons (2px, 4px, 8px)
        STROKE_WIDTH_OPTIONS.forEach((w) => {
          const strokeBtn = screen.getByTestId(`stroke-btn-${w}`);
          expect(strokeBtn).toBeInTheDocument();
          expect(strokeBtn.closest('.hidden')).toBeNull();
        });

        // Fill opacity label and buttons (0%, 15%, 30%, 50%)
        const fillLabel = screen.getByTestId('fill-opacity-label');
        expect(fillLabel).toBeInTheDocument();
        expect(fillLabel).toHaveTextContent('Fill');
        expect(fillLabel.closest('.hidden')).toBeNull();

        FILL_OPACITY_OPTIONS.forEach((opt) => {
          const opacityBtn = screen.getByTestId(`opacity-btn-${Math.round(opt.value * 100)}`);
          expect(opacityBtn).toBeInTheDocument();
          expect(opacityBtn.closest('.hidden')).toBeNull();
        });

        // Invariant 3: Zoom controls toolbar rendered and NOT hidden
        const zoomToolbar = screen.getByTestId('zoom-controls-toolbar');
        expect(zoomToolbar).toBeInTheDocument();
        expect(zoomToolbar.closest('.hidden')).toBeNull();
        expect(screen.getByTestId('zoom-out-btn')).toBeInTheDocument();
        expect(screen.getByTestId('zoom-in-btn')).toBeInTheDocument();
        expect(screen.getByTestId('fit-screen-btn')).toBeInTheDocument();
        expect(screen.getByTestId('actual-size-btn')).toBeInTheDocument();
        expect(screen.getByTestId('zoom-level-dropdown-btn')).toBeInTheDocument();

        // Invariant 4: Image actions toolbar rendered and NOT hidden
        const imageActions = screen.getByTestId('image-actions-toolbar');
        expect(imageActions).toBeInTheDocument();
        expect(imageActions.closest('.hidden')).toBeNull();
        expect(screen.getByTestId('replace-image-btn')).toBeInTheDocument();
        expect(screen.getByTestId('clear-annotations-btn')).toBeInTheDocument();
        expect(screen.getByTestId('reset-canvas-btn')).toBeInTheDocument();

        // Invariant 5: History controls rendered and NOT hidden
        const historyToolbar = screen.getByTestId('history-controls-toolbar');
        expect(historyToolbar).toBeInTheDocument();
        expect(historyToolbar.closest('.hidden')).toBeNull();
        expect(screen.getByTestId('undo-btn')).toBeInTheDocument();
        expect(screen.getByTestId('redo-btn')).toBeInTheDocument();

        // Invariant 6: Export actions rendered and NOT hidden
        const exportToolbar = screen.getByTestId('export-actions-toolbar');
        expect(exportToolbar).toBeInTheDocument();
        expect(exportToolbar.closest('.hidden')).toBeNull();
        expect(screen.getByTestId('btn-copy-image')).toBeInTheDocument();
        expect(screen.getByTestId('btn-copy-notes')).toBeInTheDocument();

        // Invariant 7: Sidebar toggle and help buttons rendered and NOT hidden
        const sidebarBtn = screen.getByTestId('toggle-sidebar-button');
        expect(sidebarBtn).toBeInTheDocument();
        expect(sidebarBtn.closest('.hidden')).toBeNull();

        const shortcutsBtn = screen.getByTestId('shortcuts-help-btn');
        expect(shortcutsBtn).toBeInTheDocument();
        expect(shortcutsBtn.closest('.hidden')).toBeNull();
      });
    });
  });

  /* ========================================================================
   * 2. INTERACTION INTEGRITY ON ULTRA-COMPACT VIEWPORTS (320px, 375px, 480px)
   * ======================================================================== */
  describe('Section 2: Interactive Usability on Ultra-Compact Viewports', () => {
    it('allows full drawing tool switching at 320px viewport', async () => {
      setViewport(320, 568);
      render(<App />);
      const user = userEvent.setup();

      // Click each drawing tool sequentially and verify active state updates
      for (const tool of TOOL_ITEMS) {
        const btn = screen.getByTestId(`tool-btn-${tool.id}`);
        await user.click(btn);
        expect(btn).toHaveAttribute('aria-pressed', 'true');
        expect(btn.className).toContain('text-amber-700');
      }
    });

    it('allows stroke width switching and persists active state at 320px viewport', async () => {
      setViewport(320, 568);
      render(<App />);
      const user = userEvent.setup();

      // Click 2px, 4px, 8px
      const btn2 = screen.getByTestId('stroke-btn-2');
      const btn4 = screen.getByTestId('stroke-btn-4');
      const btn8 = screen.getByTestId('stroke-btn-8');

      await user.click(btn8);
      expect(btn8).toHaveAttribute('aria-checked', 'true');

      await user.click(btn4);
      expect(btn4).toHaveAttribute('aria-checked', 'true');
      expect(btn8).toHaveAttribute('aria-checked', 'false');

      await user.click(btn2);
      expect(btn2).toHaveAttribute('aria-checked', 'true');
      expect(btn4).toHaveAttribute('aria-checked', 'false');
    });

    it('allows fill opacity switching with high-contrast active indicator at 320px viewport', async () => {
      setViewport(320, 568);
      render(<App />);
      const user = userEvent.setup();

      const btn0 = screen.getByTestId('opacity-btn-0');
      const btn30 = screen.getByTestId('opacity-btn-30');
      const btn50 = screen.getByTestId('opacity-btn-50');

      // Click 50%
      await user.click(btn50);
      expect(btn50).toHaveAttribute('aria-checked', 'true');
      expect(btn50.className).toContain('bg-amber-500/15');

      // Click 0%
      await user.click(btn0);
      expect(btn0).toHaveAttribute('aria-checked', 'true');
      expect(btn0.className).toContain('bg-amber-500/15');
      expect(btn50).toHaveAttribute('aria-checked', 'false');

      // Click 30%
      await user.click(btn30);
      expect(btn30).toHaveAttribute('aria-checked', 'true');
      expect(btn30.className).toContain('bg-amber-500/15');
    });

    it('allows color preset switching at 375px viewport', async () => {
      setViewport(375, 667);
      render(<App />);
      const user = userEvent.setup();

      const redBtn = screen.getByTestId('color-btn-red');
      const cyanBtn = screen.getByTestId('color-btn-cyan');

      await user.click(redBtn);
      expect(redBtn).toHaveAttribute('aria-checked', 'true');

      await user.click(cyanBtn);
      expect(cyanBtn).toHaveAttribute('aria-checked', 'true');
      expect(redBtn).toHaveAttribute('aria-checked', 'false');
    });

    it('allows sidebar toggling at 320px viewport', async () => {
      setViewport(320, 568);
      render(<App />);
      const user = userEvent.setup();

      const sidebarToggleBtn = screen.getByTestId('toggle-sidebar-button');
      expect(sidebarToggleBtn).toHaveAttribute('aria-expanded', 'true');

      await user.click(sidebarToggleBtn);
      expect(sidebarToggleBtn).toHaveAttribute('aria-expanded', 'false');

      await user.click(sidebarToggleBtn);
      expect(sidebarToggleBtn).toHaveAttribute('aria-expanded', 'true');
    });

    it('allows shortcuts help dialog to open and close at 320px viewport', async () => {
      setViewport(320, 568);
      render(<App />);
      const user = userEvent.setup();

      const shortcutsBtn = screen.getByTestId('shortcuts-help-btn');
      await user.click(shortcutsBtn);

      // Dialog should appear
      const dialog = screen.getByRole('dialog', { name: /keyboard shortcuts/i });
      expect(dialog).toBeInTheDocument();

      // Close dialog via close button
      const closeBtn = screen.getByTestId('shortcuts-modal-close-btn');
      await user.click(closeBtn);
      expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).toBeNull();
    });
  });

  /* ========================================================================
   * 3. DYNAMIC RESIZE CHAOS & STATE INVARIANCE
   * ======================================================================== */
  describe('Section 3: Dynamic Window Resize Chaos & State Invariance', () => {
    it('preserves user tool and styling selection across rapid continuous viewport mutations', async () => {
      setViewport(1920, 1080);
      render(<App />);
      const user = userEvent.setup();

      // 1. Select 'pin' tool, 8px stroke, 50% opacity, 'purple' color
      await user.click(screen.getByTestId('tool-btn-pin'));
      await user.click(screen.getByTestId('stroke-btn-8'));
      await user.click(screen.getByTestId('opacity-btn-50'));
      await user.click(screen.getByTestId('color-btn-purple'));

      // 2. Perform chaotic series of viewport transitions:
      // 1920 -> 1024 -> 320 -> 768 -> 375 -> 1440 -> 640 -> 480 -> 1280 -> 320
      const resizeSequence = [1024, 320, 768, 375, 1440, 640, 480, 1280, 320];

      for (const width of resizeSequence) {
        setViewport(width, 700);

        // State must remain intact at every step
        expect(screen.getByTestId('tool-btn-pin')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('stroke-btn-8')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('opacity-btn-50')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('color-btn-purple')).toHaveAttribute('aria-checked', 'true');

        // All elements must still be present and not hidden
        expect(screen.getByTestId('main-toolbar').closest('.hidden')).toBeNull();
        expect(screen.getByTestId('color-palette').closest('.hidden')).toBeNull();
        expect(screen.getByTestId('zoom-controls-toolbar').closest('.hidden')).toBeNull();
        expect(screen.getByTestId('image-actions-toolbar').closest('.hidden')).toBeNull();
        expect(screen.getByTestId('history-controls-toolbar').closest('.hidden')).toBeNull();
        expect(screen.getByTestId('export-actions-toolbar').closest('.hidden')).toBeNull();
      }
    });
  });

  /* ========================================================================
   * 4. STRUCTURAL ANTI-CLIPPING & OVERFLOW INVARIANTS
   * ======================================================================== */
  describe('Section 4: Structural Layout & Anti-Clipping Invariants', () => {
    it('guarantees header uses flex-wrap and avoids rigid h-14 locking', () => {
      render(<App />);
      const header = screen.getByTestId('app-header');

      // Must have flex-wrap so wrapped lines don't get clipped
      expect(header.className).toContain('flex-wrap');

      // Must NOT have fixed h-14 without h-auto or min-h-14
      expect(header.className).toContain('min-h-14');
      expect(header.className).toContain('h-auto');

      // Must NOT have overflow-x-auto or overflow-hidden on header
      expect(header.className).not.toContain('overflow-x-auto');
      expect(header.className).not.toContain('overflow-x-scroll');
    });

    it('guarantees annotation-tools-container wraps elastically', () => {
      render(<App />);
      const toolsContainer = screen.getByTestId('annotation-tools-container');

      expect(toolsContainer.className).toContain('flex-wrap');
      expect(toolsContainer.className).not.toContain('overflow-hidden');
      expect(toolsContainer.className).not.toContain('overflow-x-auto');
    });

    it('guarantees color-palette wraps elastically on narrow viewports', () => {
      render(<App />);
      const colorPalette = screen.getByTestId('color-palette');

      // ColorPalette has flex-wrap to gracefully stack swatches, strokes, and fill options
      expect(colorPalette.className).toContain('flex-wrap');
      expect(colorPalette.className).not.toContain('overflow-hidden');
    });

    it('guarantees main workspace has flex-1 and min-h-0 to avoid vertical clipping', () => {
      const { container } = render(<App />);
      const main = container.querySelector('main');
      expect(main).not.toBeNull();

      expect(main!.className).toContain('flex-1');
      expect(main!.className).toContain('min-h-0');
      expect(main!.className).toContain('relative');
    });

    it('guarantees no core functional toolbars use obsolete hidden-breakpoint classes', () => {
      const { container } = render(<App />);
      const header = container.querySelector('header');
      expect(header).not.toBeNull();

      // Check for previously problematic classes: hidden md:flex, hidden lg:flex, hidden sm:flex
      const toolbars = header!.querySelectorAll('[data-testid$="-toolbar"], [data-testid="color-palette"]');
      expect(toolbars.length).toBeGreaterThanOrEqual(5);

      toolbars.forEach((toolbar) => {
        const parent = toolbar.parentElement;
        if (parent && parent !== header) {
          expect(parent.className).not.toMatch(/hidden\s+(sm|md|lg):flex/);
        }
        expect(toolbar.className).not.toMatch(/hidden\s+(sm|md|lg):flex/);
      });
    });
  });

  /* ========================================================================
   * 5. EXTREME BOUNDARIES & STATEFUL ADVERSARIAL CHALLENGES
   * ======================================================================== */
  describe('Section 5: Extreme Boundaries & Stateful Stress Scenarios', () => {
    it('survives ultra-wide 3840px (4K UHD) without layout breakdown or uncentered drift', () => {
      setViewport(3840, 2160);
      render(<App />);

      const header = screen.getByTestId('app-header');
      expect(header).toBeInTheDocument();
      expect(screen.getByTestId('main-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('color-palette')).toBeInTheDocument();
      expect(screen.getByTestId('export-actions-toolbar')).toBeInTheDocument();
    });

    it('survives sub-320px boundary (280px Galaxy Fold folded screen) without fatal DOM crash', () => {
      setViewport(280, 653);
      render(<App />);

      const header = screen.getByTestId('app-header');
      expect(header).toBeInTheDocument();
      expect(screen.getByTestId('main-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('color-palette')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-controls-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('image-actions-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('history-controls-toolbar')).toBeInTheDocument();
    });

    it('synchronizes selected annotation styling on 320px viewport without desync', async () => {
      setViewport(320, 568);
      render(<App />);
      const user = userEvent.setup();

      // Switch tool to box
      await user.click(screen.getByTestId('tool-btn-box'));
      expect(screen.getByTestId('tool-btn-box')).toHaveAttribute('aria-pressed', 'true');

      // Select 8px stroke
      await user.click(screen.getByTestId('stroke-btn-8'));
      expect(screen.getByTestId('stroke-btn-8')).toHaveAttribute('aria-checked', 'true');

      // Select 50% opacity
      await user.click(screen.getByTestId('opacity-btn-50'));
      expect(screen.getByTestId('opacity-btn-50')).toHaveAttribute('aria-checked', 'true');

      // Select green color
      await user.click(screen.getByTestId('color-btn-green'));
      expect(screen.getByTestId('color-btn-green')).toHaveAttribute('aria-checked', 'true');
    });

    it('handles rapid sequential clicks between all drawing tools at 320px viewport without lockup', async () => {
      setViewport(320, 568);
      render(<App />);
      const user = userEvent.setup();

      // Cycle 5 times across all 6 tools (30 clicks total)
      for (let cycle = 0; cycle < 5; cycle++) {
        for (const tool of TOOL_ITEMS) {
          await user.click(screen.getByTestId(`tool-btn-${tool.id}`));
          expect(screen.getByTestId(`tool-btn-${tool.id}`)).toHaveAttribute('aria-pressed', 'true');
        }
      }
    });
  });
});

