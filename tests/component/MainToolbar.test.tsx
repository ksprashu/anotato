import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MainToolbar } from '../../src/components/toolbar/MainToolbar';
import { AppProvider } from '../../src/state/AppContext';
import { App } from '../../src/App';

describe('MainToolbar Component', () => {
  it('renders all 6 annotation and manipulation tools with correct test IDs', () => {
    render(
      <AppProvider>
        <MainToolbar />
      </AppProvider>
    );

    expect(screen.getByTestId('main-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('tool-btn-select')).toBeInTheDocument();
    expect(screen.getByTestId('tool-btn-box')).toBeInTheDocument();
    expect(screen.getByTestId('tool-btn-ellipse')).toBeInTheDocument();
    expect(screen.getByTestId('tool-btn-arrow')).toBeInTheDocument();
    expect(screen.getByTestId('tool-btn-pin')).toBeInTheDocument();
    expect(screen.getByTestId('tool-btn-pan')).toBeInTheDocument();
  });

  it('highlights the active tool with aria-pressed and indicator dot', () => {
    render(
      <AppProvider initialState={{ activeTool: 'box' }}>
        <MainToolbar />
      </AppProvider>
    );

    expect(screen.getByTestId('tool-btn-box')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tool-btn-select')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('tool-btn-arrow')).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches active tool in state when tool buttons are clicked', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialState={{ activeTool: 'select' }}>
        <MainToolbar />
      </AppProvider>
    );

    const arrowBtn = screen.getByTestId('tool-btn-arrow');
    await user.click(arrowBtn);

    expect(arrowBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tool-btn-select')).toHaveAttribute('aria-pressed', 'false');
  });

  it('invokes onSelectTool custom callback when provided as prop', async () => {
    const user = userEvent.setup();
    const onSelectToolMock = vi.fn();

    render(
      <AppProvider>
        <MainToolbar onSelectTool={onSelectToolMock} />
      </AppProvider>
    );

    await user.click(screen.getByTestId('tool-btn-pin'));
    expect(onSelectToolMock).toHaveBeenCalledWith('pin');
  });

  it('displays correct keyboard shortcut labels and tooltips', () => {
    render(
      <AppProvider>
        <MainToolbar />
      </AppProvider>
    );

    expect(screen.getByTestId('tool-btn-select')).toHaveAttribute('title', 'Select (V)');
    expect(screen.getByTestId('tool-btn-box')).toHaveAttribute('title', 'Box (B)');
    expect(screen.getByTestId('tool-btn-ellipse')).toHaveAttribute('title', 'Ellipse (C)');
    expect(screen.getByTestId('tool-btn-arrow')).toHaveAttribute('title', 'Arrow (A)');
    expect(screen.getByTestId('tool-btn-pin')).toHaveAttribute('title', 'Pin (P)');
    expect(screen.getByTestId('tool-btn-pan')).toHaveAttribute('title', 'Pan (H)');
  });

  it('disables all tool buttons when disabled prop is true', () => {
    render(
      <AppProvider>
        <MainToolbar disabled={true} />
      </AppProvider>
    );

    expect(screen.getByTestId('tool-btn-select')).toBeDisabled();
    expect(screen.getByTestId('tool-btn-box')).toBeDisabled();
    expect(screen.getByTestId('tool-btn-ellipse')).toBeDisabled();
    expect(screen.getByTestId('tool-btn-arrow')).toBeDisabled();
    expect(screen.getByTestId('tool-btn-pin')).toBeDisabled();
    expect(screen.getByTestId('tool-btn-pan')).toBeDisabled();
  });

  /* ========================================================================
   * Responsive Toolbar Layout & Viewport Adaptability (R3 Specification)
   * ======================================================================== */
  describe('Responsive Toolbar Layout & Viewport Adaptability (R3)', () => {
    const setViewport = (width: number, height: number = 900) => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
      window.dispatchEvent(new Event('resize'));
    };

    beforeEach(() => {
      setViewport(1280, 900);
    });

    it('T3.1: All drawing tools and styling controls remain rendered and interactive at 768px viewport (Tablet)', async () => {
      setViewport(768, 1024);
      render(<App />);

      const user = userEvent.setup();

      // 1. Verify all 6 drawing tools rendered
      const tools = ['select', 'box', 'ellipse', 'arrow', 'pin', 'pan'];
      tools.forEach((tool) => {
        const btn = screen.getByTestId(`tool-btn-${tool}`);
        expect(btn).toBeInTheDocument();
      });

      // 2. Verify drawing tool interaction
      await user.click(screen.getByTestId('tool-btn-box'));
      expect(screen.getByTestId('tool-btn-box')).toHaveAttribute('aria-pressed', 'true');

      // 3. Verify ColorPalette controls rendered
      const colorPalette = screen.getByTestId('color-palette');
      expect(colorPalette).toBeInTheDocument();
      expect(screen.getByTestId('color-btn-amber')).toBeInTheDocument();
      expect(screen.getByTestId('stroke-btn-2')).toBeInTheDocument();
      expect(screen.getByTestId('stroke-btn-4')).toBeInTheDocument();
      expect(screen.getByTestId('stroke-btn-8')).toBeInTheDocument();
      expect(screen.getByTestId('fill-opacity-label')).toBeInTheDocument();
      expect(screen.getByTestId('opacity-btn-0')).toBeInTheDocument();
      expect(screen.getByTestId('opacity-btn-50')).toBeInTheDocument();

      // 4. Verify styling control interaction
      await user.click(screen.getByTestId('stroke-btn-8'));
      expect(screen.getByTestId('stroke-btn-8')).toHaveAttribute('aria-checked', 'true');

      await user.click(screen.getByTestId('opacity-btn-50'));
      expect(screen.getByTestId('opacity-btn-50')).toHaveAttribute('aria-checked', 'true');

      // 5. Anti-hiding assertion: ColorPalette and MainToolbar must NOT be wrapped in hidden classes
      expect(colorPalette.closest('.hidden')).toBeNull();
      expect(screen.getByTestId('main-toolbar').closest('.hidden')).toBeNull();
    });

    it('T3.2: All drawing tools and styling controls remain rendered and interactive at 640px viewport (Compact Mobile)', async () => {
      setViewport(640, 800);
      render(<App />);

      const user = userEvent.setup();

      // 1. Drawing tools rendered & interactive
      for (const tool of ['select', 'box', 'ellipse', 'arrow', 'pin', 'pan']) {
        expect(screen.getByTestId(`tool-btn-${tool}`)).toBeInTheDocument();
      }

      await user.click(screen.getByTestId('tool-btn-ellipse'));
      expect(screen.getByTestId('tool-btn-ellipse')).toHaveAttribute('aria-pressed', 'true');

      // 2. ColorPalette rendered & interactive
      const palette = screen.getByTestId('color-palette');
      expect(palette).toBeInTheDocument();
      expect(palette.closest('.hidden')).toBeNull();

      expect(screen.getByTestId('fill-opacity-label')).toHaveTextContent('Fill');
      expect(screen.getByTestId('stroke-btn-8')).toBeInTheDocument();

      await user.click(screen.getByTestId('stroke-btn-4'));
      expect(screen.getByTestId('stroke-btn-4')).toHaveAttribute('aria-checked', 'true');

      // 3. History controls rendered (no hidden sm:flex)
      const historyToolbar = screen.getByTestId('history-controls-toolbar');
      expect(historyToolbar).toBeInTheDocument();
      expect(historyToolbar.closest('.hidden')).toBeNull();
    });

    it('T3.3: Header layout engages flex-wrap and eliminates horizontal clipping scrollbars', () => {
      const { container } = render(<App />);
      const header = container.querySelector('header');
      expect(header).not.toBeNull();

      // Invariant 1: flex-wrap must be present on header to enable multi-row wrapping
      expect(header!.className).toContain('flex-wrap');

      // Invariant 2: overflow-x-auto must NOT be present (no horizontal scrolling)
      expect(header!.className).not.toContain('overflow-x-auto');

      // Invariant 3: fixed rigid h-14 must NOT lock header height; min-h-14 or h-auto allowed
      expect(header!.className).toMatch(/min-h-14|h-auto/);

      // Invariant 4: Main workspace flex-1 min-h-0 allows canvas to flex smoothly
      const main = container.querySelector('main');
      expect(main).not.toBeNull();
      expect(main!.className).toContain('min-h-0');
    });

    it('T3.4: Zoom controls and Image actions remain accessible without hidden lg:flex suppression', () => {
      setViewport(768, 900);
      render(<App />);

      const zoomToolbar = screen.getByTestId('zoom-controls-toolbar');
      expect(zoomToolbar).toBeInTheDocument();
      expect(zoomToolbar.closest('.hidden')).toBeNull();

      const imageActions = screen.getByTestId('image-actions-toolbar');
      expect(imageActions).toBeInTheDocument();
      expect(imageActions.closest('.hidden')).toBeNull();
    });
  });
});
