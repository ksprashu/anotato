import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColorPalette } from '../../src/components/toolbar/ColorPalette';
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

  it('renders 5 preset color swatches, 3 stroke widths, and 4 fill opacities', () => {
    render(
      <AppProvider>
        <ColorPalette />
      </AppProvider>
    );

    // Color Swatches
    expect(screen.getByTestId('color-btn-red')).toBeInTheDocument();
    expect(screen.getByTestId('color-btn-amber')).toBeInTheDocument();
    expect(screen.getByTestId('color-btn-green')).toBeInTheDocument();
    expect(screen.getByTestId('color-btn-cyan')).toBeInTheDocument();
    expect(screen.getByTestId('color-btn-purple')).toBeInTheDocument();

    // Stroke widths
    expect(screen.getByTestId('stroke-btn-2')).toBeInTheDocument();
    expect(screen.getByTestId('stroke-btn-4')).toBeInTheDocument();
    expect(screen.getByTestId('stroke-btn-6')).toBeInTheDocument();

    // Fill opacities
    expect(screen.getByTestId('opacity-btn-0')).toBeInTheDocument();
    expect(screen.getByTestId('opacity-btn-15')).toBeInTheDocument();
    expect(screen.getByTestId('opacity-btn-30')).toBeInTheDocument();
    expect(screen.getByTestId('opacity-btn-50')).toBeInTheDocument();
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

    // Click purple, 6px, and 50%
    await user.click(screen.getByTestId('color-btn-purple'));
    await user.click(screen.getByTestId('stroke-btn-6'));
    await user.click(screen.getByTestId('opacity-btn-50'));

    expect(screen.getByTestId('color-btn-purple')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('stroke-btn-6')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opacity-btn-50')).toHaveAttribute('aria-checked', 'true');
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

  it('updates selected annotation style when palette controls are clicked', async () => {
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

    // Click 2px
    await user.click(screen.getByTestId('stroke-btn-2'));
    expect(screen.getByTestId('stroke-btn-2')).toHaveAttribute('aria-checked', 'true');

    // Click 0%
    await user.click(screen.getByTestId('opacity-btn-0'));
    expect(screen.getByTestId('opacity-btn-0')).toHaveAttribute('aria-checked', 'true');
  });

  it('invokes custom callbacks when provided as props', async () => {
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

    await user.click(screen.getByTestId('stroke-btn-4'));
    expect(onStrokeMock).toHaveBeenCalledWith(4);

    await user.click(screen.getByTestId('opacity-btn-30'));
    expect(onOpacityMock).toHaveBeenCalledWith(0.3);
  });

  it('disables all swatches and buttons when disabled prop is true', () => {
    render(
      <AppProvider>
        <ColorPalette disabled={true} />
      </AppProvider>
    );

    expect(screen.getByTestId('color-btn-red')).toBeDisabled();
    expect(screen.getByTestId('stroke-btn-2')).toBeDisabled();
    expect(screen.getByTestId('opacity-btn-0')).toBeDisabled();
  });
});
