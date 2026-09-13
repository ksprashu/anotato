import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplaceImageModal } from '../../src/components/modals/ReplaceImageModal';

describe('ReplaceImageModal Component', () => {
  const defaultProps = {
    isOpen: true,
    annotationCount: 3,
    onReplaceClear: vi.fn(),
    onReplaceKeep: vi.fn(),
    onAddLayer: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Visibility & ARIA Attributes
  // -------------------------------------------------------------------------
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ReplaceImageModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with proper accessibility attributes when isOpen is true', () => {
    render(<ReplaceImageModal {...defaultProps} />);

    const modal = screen.getByTestId('replace-image-modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-labelledby', 'replace-modal-title');
    expect(modal).toHaveAttribute('aria-describedby', 'replace-modal-description');
  });

  // -------------------------------------------------------------------------
  // 2. Annotation Count Pluralization
  // -------------------------------------------------------------------------
  it('renders singular "active annotation" when count is 1', () => {
    render(<ReplaceImageModal {...defaultProps} annotationCount={1} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/active annotation/i)).toBeInTheDocument();
    expect(screen.queryByText(/active annotations/i)).not.toBeInTheDocument();
  });

  it('renders plural "active annotations" when count is greater than 1', () => {
    render(<ReplaceImageModal {...defaultProps} annotationCount={7} />);

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/active annotations/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 3. Action Buttons Rendering & Text
  // -------------------------------------------------------------------------
  it('renders all 3 distinct action buttons and the Cancel button', () => {
    render(<ReplaceImageModal {...defaultProps} />);

    // Action 1: Replace & Clear Annotations
    const clearBtn = screen.getByTestId('replace-modal-confirm-btn');
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).toHaveTextContent(/Replace & Clear Annotations/i);

    // Action 2: Replace & Keep Annotations
    const keepBtn = screen.getByTestId('replace-modal-replace-keep-btn');
    expect(keepBtn).toBeInTheDocument();
    expect(keepBtn).toHaveTextContent(/Replace & Keep Annotations/i);

    // Action 3: Add as Layer / Overlay
    const layerBtn = screen.getByTestId('replace-modal-add-layer-btn');
    expect(layerBtn).toBeInTheDocument();
    expect(layerBtn).toHaveTextContent(/Add as Layer \/ Overlay/i);

    // Cancel Button
    const cancelBtn = screen.getByTestId('replace-modal-cancel-btn');
    expect(cancelBtn).toBeInTheDocument();
    expect(cancelBtn).toHaveTextContent(/Cancel/i);
  });

  // -------------------------------------------------------------------------
  // 4. Click Callbacks
  // -------------------------------------------------------------------------
  it('invokes onReplaceClear (or onConfirm) when "Replace & Clear Annotations" is clicked', async () => {
    const user = userEvent.setup();
    const onReplaceClear = vi.fn();
    render(<ReplaceImageModal {...defaultProps} onReplaceClear={onReplaceClear} />);

    await user.click(screen.getByTestId('replace-modal-confirm-btn'));
    expect(onReplaceClear).toHaveBeenCalledTimes(1);
  });

  it('invokes onReplaceKeep when "Replace & Keep Annotations" is clicked', async () => {
    const user = userEvent.setup();
    const onReplaceKeep = vi.fn();
    render(<ReplaceImageModal {...defaultProps} onReplaceKeep={onReplaceKeep} />);

    await user.click(screen.getByTestId('replace-modal-replace-keep-btn'));
    expect(onReplaceKeep).toHaveBeenCalledTimes(1);
  });

  it('invokes onAddLayer when "Add as Layer / Overlay" is clicked', async () => {
    const user = userEvent.setup();
    const onAddLayer = vi.fn();
    render(<ReplaceImageModal {...defaultProps} onAddLayer={onAddLayer} />);

    await user.click(screen.getByTestId('replace-modal-add-layer-btn'));
    expect(onAddLayer).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel when "Cancel" button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ReplaceImageModal {...defaultProps} onCancel={onCancel} />);

    await user.click(screen.getByTestId('replace-modal-cancel-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 5. Keyboard Navigation
  // -------------------------------------------------------------------------
  it('invokes onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn();
    render(<ReplaceImageModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('invokes primary action on Enter key press', () => {
    const onReplaceClear = vi.fn();
    render(<ReplaceImageModal {...defaultProps} onReplaceClear={onReplaceClear} />);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onReplaceClear).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 6. High-Contrast Visual Styling Contract
  // -------------------------------------------------------------------------
  it('renders distinct visual styling across action buttons', () => {
    render(<ReplaceImageModal {...defaultProps} />);

    const clearBtn = screen.getByTestId('replace-modal-confirm-btn');
    const keepBtn = screen.getByTestId('replace-modal-replace-keep-btn');
    const layerBtn = screen.getByTestId('replace-modal-add-layer-btn');

    // Replace & Clear: Amber warning accent
    expect(clearBtn.className).toMatch(/bg-amber-/);

    // Replace & Keep: Neutral slate style
    expect(keepBtn.className).toMatch(/bg-slate-|border-slate-/);

    // Add Layer: Indigo or distinctive accent
    expect(layerBtn.className).toMatch(/bg-indigo-|bg-blue-|border-/);
  });

  // -------------------------------------------------------------------------
  // 7. Backward Compatibility: onConfirm & synonym prop aliases
  // -------------------------------------------------------------------------
  it('supports legacy onConfirm prop as fallback for onReplaceClear', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ReplaceImageModal
        isOpen={true}
        annotationCount={2}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('replace-modal-confirm-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('supports onReplaceAndClear, onReplaceAndKeep, onAddAsLayer synonyms', async () => {
    const user = userEvent.setup();
    const onReplaceAndClear = vi.fn();
    const onReplaceAndKeep = vi.fn();
    const onAddAsLayer = vi.fn();

    render(
      <ReplaceImageModal
        isOpen={true}
        annotationCount={2}
        onReplaceAndClear={onReplaceAndClear}
        onReplaceAndKeep={onReplaceAndKeep}
        onAddAsLayer={onAddAsLayer}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('replace-modal-confirm-btn'));
    expect(onReplaceAndClear).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('replace-modal-replace-keep-btn'));
    expect(onReplaceAndKeep).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('replace-modal-add-layer-btn'));
    expect(onAddAsLayer).toHaveBeenCalledTimes(1);
  });
});
