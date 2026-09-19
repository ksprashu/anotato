import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColorPalette, STROKE_WIDTH_OPTIONS, FILL_OPACITY_OPTIONS } from '../../src/components/toolbar/ColorPalette';
import { AppProvider } from '../../src/state/AppContext';
import { Annotation } from '../../src/types';

describe('ColorPalette Component', () => {
  const sampleAnnotation: Annotation = {
    id: 'ann-1',
    index: 1,
    geometry: { type: 'box', x: 50, y: 50, width: 100, height: 100 },
    style: { color: 'green', strokeWidth: 4, fillOpacity: 0.3 },
    note: 'Sample note',
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('renders 5 preset color swatches, 3 stroke widths (2/4/8px), and 4 fill opacities with Fill label', () => {
    render(
      <AppProvider>
        <ColorPalette />
      </AppProvider>
    );

    // 1. Color Swatches
    expect(screen.getByTestId('color-btn-red')).toBeInTheDocument();
    expect(screen.getByTestId('color-btn-amber')).toBeInTheDocument();
    expect(screen.getByTestId('color-btn-green')).toBeInTheDocument();
    expect(screen.getByTestId('color-btn-cyan')).toBeInTheDocument();
    expect(screen.getByTestId('color-btn-purple')).toBeInTheDocument();

    // 2. Stroke widths: [2, 4, 8] — 6px must NOT exist
    expect(screen.getByTestId('stroke-btn-2')).toBeInTheDocument();
    expect(screen.getByTestId('stroke-btn-4')).toBeInTheDocument();
    expect(screen.getByTestId('stroke-btn-8')).toBeInTheDocument();
    expect(screen.queryByTestId('stroke-btn-6')).not.toBeInTheDocument();

    // 3. Fill opacity label (R5.1)
    const fillLabel = screen.getByTestId('fill-opacity-label');
    expect(fillLabel).toBeInTheDocument();
    expect(fillLabel).toHaveTextContent('Fill');

    // 4. Fill opacities
    expect(screen.getByTestId('opacity-btn-0')).toBeInTheDocument();
    expect(screen.getByTestId('opacity-btn-15')).toBeInTheDocument();
    expect(screen.getByTestId('opacity-btn-30')).toBeInTheDocument();
    expect(screen.getByTestId('opacity-btn-50')).toBeInTheDocument();
  });

  it('exports correct preset constant arrays matching project specification', () => {
    expect(STROKE_WIDTH_OPTIONS).toEqual([2, 4, 8]);
    expect(FILL_OPACITY_OPTIONS.map((opt) => opt.value)).toEqual([0, 0.15, 0.3, 0.5]);
    expect(FILL_OPACITY_OPTIONS.map((opt) => opt.label)).toEqual(['0%', '15%', '30%', '50%']);
  });

  it('updates global active creation defaults when no annotation is selected', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialState={{ activeColor: 'amber', activeStrokeWidth: 2, activeFillOpacity: 0.15 }}>
        <ColorPalette />
      </AppProvider>
    );

    expect(screen.getByTestId('color-btn-amber')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('stroke-btn-2')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opacity-btn-15')).toHaveAttribute('aria-checked', 'true');

    // Click purple, 8px (R4), and 50% (R5)
    await user.click(screen.getByTestId('color-btn-purple'));
    await user.click(screen.getByTestId('stroke-btn-8'));
    await user.click(screen.getByTestId('opacity-btn-50'));

    expect(screen.getByTestId('color-btn-purple')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('stroke-btn-8')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('stroke-btn-2')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('opacity-btn-50')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opacity-btn-15')).toHaveAttribute('aria-checked', 'false');
  });

  it('renders high-contrast amber accent indicator on the currently active opacity preset button (R5.3)', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialState={{ activeFillOpacity: 0.15 }}>
        <ColorPalette />
      </AppProvider>
    );

    const btn15 = screen.getByTestId('opacity-btn-15');
    const btn50 = screen.getByTestId('opacity-btn-50');

    // Active 15% has amber styling
    expect(btn15).toHaveAttribute('aria-checked', 'true');
    expect(btn15.className).toMatch(/text-amber-700|text-amber-400/);
    expect(btn15.className).toMatch(/border-amber-500/);

    // Inactive 50% has transparent border
    expect(btn50).toHaveAttribute('aria-checked', 'false');
    expect(btn50.className).toContain('border-transparent');

    // Switch to 50%
    await user.click(btn50);
    expect(btn50).toHaveAttribute('aria-checked', 'true');
    expect(btn50.className).toMatch(/text-amber-700|text-amber-400/);
    expect(btn50.className).toMatch(/border-amber-500/);
    expect(btn15).toHaveAttribute('aria-checked', 'false');
    expect(btn15.className).toContain('border-transparent');
  });

  it('reflects selected annotation style in active indicators', () => {
    render(
      <AppProvider
        initialState={{
          annotations: [sampleAnnotation],
          selectedAnnotationId: 'ann-1',
          activeColor: 'red', // global default differs from annotation
        }}
      >
        <ColorPalette />
      </AppProvider>
    );

    // Selected annotation has green, 4px, 30% fill
    expect(screen.getByTestId('color-btn-green')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('color-btn-red')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('stroke-btn-4')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opacity-btn-30')).toHaveAttribute('aria-checked', 'true');
  });

  it('updates selected annotation style when palette controls are clicked (including 8px and opacity presets)', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider
        initialState={{
          annotations: [sampleAnnotation],
          selectedAnnotationId: 'ann-1',
        }}
      >
        <ColorPalette />
      </AppProvider>
    );

    // Click cyan
    await user.click(screen.getByTestId('color-btn-cyan'));
    expect(screen.getByTestId('color-btn-cyan')).toHaveAttribute('aria-checked', 'true');

    // Click 8px (R4)
    await user.click(screen.getByTestId('stroke-btn-8'));
    expect(screen.getByTestId('stroke-btn-8')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('stroke-btn-4')).toHaveAttribute('aria-checked', 'false');

    // Click 0% (R5)
    await user.click(screen.getByTestId('opacity-btn-0'));
    expect(screen.getByTestId('opacity-btn-0')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opacity-btn-30')).toHaveAttribute('aria-checked', 'false');
  });

  it('invokes custom callbacks when provided as props (including 8px stroke)', async () => {
    const user = userEvent.setup();
    const onColorMock = vi.fn();
    const onStrokeMock = vi.fn();
    const onOpacityMock = vi.fn();

    render(
      <AppProvider>
        <ColorPalette
          onColorChange={onColorMock}
          onStrokeWidthChange={onStrokeMock}
          onFillOpacityChange={onOpacityMock}
        />
      </AppProvider>
    );

    await user.click(screen.getByTestId('color-btn-red'));
    expect(onColorMock).toHaveBeenCalledWith('red');

    await user.click(screen.getByTestId('stroke-btn-8'));
    expect(onStrokeMock).toHaveBeenCalledWith(8);

    await user.click(screen.getByTestId('opacity-btn-50'));
    expect(onOpacityMock).toHaveBeenCalledWith(0.5);
  });

  it('disables all swatches, stroke buttons (including 8px), and opacity buttons when disabled prop is true', () => {
    render(
      <AppProvider>
        <ColorPalette disabled={true} />
      </AppProvider>
    );

    expect(screen.getByTestId('color-btn-red')).toBeDisabled();
    expect(screen.getByTestId('stroke-btn-2')).toBeDisabled();
    expect(screen.getByTestId('stroke-btn-4')).toBeDisabled();
    expect(screen.getByTestId('stroke-btn-8')).toBeDisabled();
    expect(screen.getByTestId('opacity-btn-0')).toBeDisabled();
    expect(screen.getByTestId('opacity-btn-50')).toBeDisabled();
  });
});
