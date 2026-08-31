import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MainToolbar } from '../../src/components/toolbar/MainToolbar';
import { AppProvider } from '../../src/state/AppContext';

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
});
