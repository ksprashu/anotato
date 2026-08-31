import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplaceImageModal } from '../../src/components/modals/ReplaceImageModal';

describe('ReplaceImageModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ReplaceImageModal
        isOpen={false}
        annotationCount={3}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders dialog and correct annotation count when isOpen is true', () => {
    render(
      <ReplaceImageModal
        isOpen={true}
        annotationCount={5}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('replace-image-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Replace Current Screenshot\?/i })).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/active annotations/i)).toBeInTheDocument();
    expect(screen.getByTestId('replace-modal-cancel-btn')).toBeInTheDocument();
    expect(screen.getByTestId('replace-modal-confirm-btn')).toBeInTheDocument();
  });

  it('renders singular "annotation" when count is 1', () => {
    render(
      <ReplaceImageModal
        isOpen={true}
        annotationCount={1}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/active annotation/i)).toBeInTheDocument();
    expect(screen.queryByText(/active annotations/i)).not.toBeInTheDocument();
  });

  it('invokes onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirmMock = vi.fn();

    render(
      <ReplaceImageModal
        isOpen={true}
        annotationCount={2}
        onConfirm={onConfirmMock}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('replace-modal-confirm-btn'));
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancelMock = vi.fn();

    render(
      <ReplaceImageModal
        isOpen={true}
        annotationCount={2}
        onConfirm={vi.fn()}
        onCancel={onCancelMock}
      />
    );

    await user.click(screen.getByTestId('replace-modal-cancel-btn'));
    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel when Escape key is pressed', () => {
    const onCancelMock = vi.fn();

    render(
      <ReplaceImageModal
        isOpen={true}
        annotationCount={2}
        onConfirm={vi.fn()}
        onCancel={onCancelMock}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });

  it('invokes onConfirm when Enter key is pressed', () => {
    const onConfirmMock = vi.fn();

    render(
      <ReplaceImageModal
        isOpen={true}
        annotationCount={2}
        onConfirm={onConfirmMock}
        onCancel={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });
});
