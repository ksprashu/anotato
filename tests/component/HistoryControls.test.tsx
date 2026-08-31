import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryControls } from '../../src/components/toolbar/HistoryControls';
import { AppProvider, useApp } from '../../src/state/AppContext';

describe('HistoryControls Component', () => {
  it('renders undo and redo buttons with correct test IDs', () => {
    render(
      <AppProvider>
        <HistoryControls />
      </AppProvider>
    );

    expect(screen.getByTestId('history-controls-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('undo-btn')).toBeInTheDocument();
    expect(screen.getByTestId('redo-btn')).toBeInTheDocument();
  });

  it('disables undo and redo initially when history stack is empty', () => {
    render(
      <AppProvider>
        <HistoryControls />
      </AppProvider>
    );

    expect(screen.getByTestId('undo-btn')).toBeDisabled();
    expect(screen.getByTestId('redo-btn')).toBeDisabled();
  });

  it('enables undo when an annotation is added and executes undo on click', async () => {
    const user = userEvent.setup();

    const TestComponent = () => {
      const { dispatch } = useApp();
      return (
        <div>
          <HistoryControls />
          <button
            data-testid="add-btn"
            onClick={() =>
              dispatch({
                type: 'ADD_ANNOTATION',
                payload: {
                  geometry: { type: 'box', x: 10, y: 10, width: 50, height: 50 },
                },
              })
            }
          >
            Add
          </button>
        </div>
      );
    };

    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    const undoBtn = screen.getByTestId('undo-btn');
    const redoBtn = screen.getByTestId('redo-btn');

    expect(undoBtn).toBeDisabled();

    // Add annotation
    await user.click(screen.getByTestId('add-btn'));

    // Undo should be enabled
    expect(undoBtn).not.toBeDisabled();
    expect(redoBtn).toBeDisabled();

    // Click undo
    await user.click(undoBtn);

    // After undo: undo is disabled, redo is enabled
    expect(undoBtn).toBeDisabled();
    expect(redoBtn).not.toBeDisabled();

    // Click redo
    await user.click(redoBtn);

    // After redo: undo is enabled, redo is disabled
    expect(undoBtn).not.toBeDisabled();
    expect(redoBtn).toBeDisabled();
  });

  it('invokes custom onUndo and onRedo callbacks when provided', async () => {
    const user = userEvent.setup();
    const onUndoMock = vi.fn();
    const onRedoMock = vi.fn();

    const ActiveComponent = () => {
      const { dispatch } = useApp();
      return (
        <div>
          <HistoryControls onUndo={onUndoMock} onRedo={onRedoMock} />
          <button
            data-testid="add-btn"
            onClick={() =>
              dispatch({
                type: 'ADD_ANNOTATION',
                payload: {
                  geometry: { type: 'box', x: 10, y: 10, width: 50, height: 50 },
                },
              })
            }
          >
            Add
          </button>
        </div>
      );
    };

    render(
      <AppProvider>
        <ActiveComponent />
      </AppProvider>
    );

    await user.click(screen.getByTestId('add-btn'));
    await user.click(screen.getByTestId('undo-btn'));

    expect(onUndoMock).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons when disabled prop is true', () => {
    render(
      <AppProvider>
        <HistoryControls disabled={true} />
      </AppProvider>
    );

    expect(screen.getByTestId('undo-btn')).toBeDisabled();
    expect(screen.getByTestId('redo-btn')).toBeDisabled();
  });
});
