import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShortcutsModal } from '../../src/components/modals/ShortcutsModal';

describe('ShortcutsModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Visibility & Initial Rendering', () => {
    it('renders null when isOpen is false', () => {
      const { container } = render(
        <ShortcutsModal isOpen={false} onClose={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders modal dialog with correct ARIA attributes when isOpen is true', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const modal = screen.getByTestId('shortcuts-modal');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-labelledby', 'shortcuts-modal-title');
      expect(modal).toHaveAttribute('aria-describedby', 'shortcuts-modal-description');

      expect(screen.getByTestId('shortcuts-modal-title')).toHaveTextContent(/Keyboard Shortcuts/i);
      expect(screen.getByTestId('shortcuts-modal-close-btn')).toBeInTheDocument();
      expect(screen.getByTestId('shortcuts-search-input')).toBeInTheDocument();
    });

    it('renders all shortcut categories by default', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByTestId('shortcut-category-card-tools')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-category-card-canvas')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-category-card-history')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-category-card-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-category-card-export')).toBeInTheDocument();
    });

    it('renders essential keybindings (V, B, C, A, P, H, Cmd+Z, Cmd+C, Cmd+Shift+C)', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByTestId('shortcut-row-tool-select')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-tool-box')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-tool-ellipse')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-tool-arrow')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-tool-pin')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-tool-pan')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-history-undo')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-export-copy-image')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-export-copy-notes')).toBeInTheDocument();
    });
  });

  describe('2. Dismissal & Closing Interactions', () => {
    it('invokes onClose when top close button (X) is clicked', async () => {
      const user = userEvent.setup();
      const onCloseMock = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={onCloseMock} />);

      await user.click(screen.getByTestId('shortcuts-modal-close-btn'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('invokes onClose when bottom Done button is clicked', async () => {
      const user = userEvent.setup();
      const onCloseMock = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={onCloseMock} />);

      await user.click(screen.getByTestId('shortcuts-modal-done-btn'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('invokes onClose when Escape key is pressed', () => {
      const onCloseMock = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={onCloseMock} />);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('invokes onClose when clicking on backdrop outside modal container', () => {
      const onCloseMock = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={onCloseMock} />);

      const backdrop = screen.getByTestId('shortcuts-modal-backdrop');
      fireEvent.click(backdrop);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT invoke onClose when clicking inside the modal content box', () => {
      const onCloseMock = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={onCloseMock} />);

      const title = screen.getByTestId('shortcuts-modal-title');
      fireEvent.click(title);
      expect(onCloseMock).not.toHaveBeenCalled();
    });
  });

  describe('3. Real-Time Search & Category Filtering', () => {
    it('filters shortcuts in real-time by search query', async () => {
      const user = userEvent.setup();
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const searchInput = screen.getByTestId('shortcuts-search-input');
      await user.type(searchInput, 'ellipse');

      expect(screen.getByTestId('shortcut-row-tool-ellipse')).toBeInTheDocument();
      expect(screen.queryByTestId('shortcut-row-tool-arrow')).not.toBeInTheDocument();
      expect(screen.queryByTestId('shortcut-row-export-copy-image')).not.toBeInTheDocument();
    });

    it('filters shortcuts when searching by key combinations', async () => {
      const user = userEvent.setup();
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const searchInput = screen.getByTestId('shortcuts-search-input');
      await user.type(searchInput, 'undo');

      expect(screen.getByTestId('shortcut-row-history-undo')).toBeInTheDocument();
      expect(screen.queryByTestId('shortcut-row-tool-box')).not.toBeInTheDocument();
    });

    it('shows empty state when no shortcuts match the query and allows reset', async () => {
      const user = userEvent.setup();
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const searchInput = screen.getByTestId('shortcuts-search-input');
      await user.type(searchInput, 'nonexistentrandomtermxyz');

      expect(screen.getByTestId('shortcuts-empty-state')).toBeInTheDocument();
      expect(screen.getByText(/No shortcuts found/i)).toBeInTheDocument();

      // Click Reset Filters
      await user.click(screen.getByTestId('shortcuts-reset-search-btn'));
      expect(screen.queryByTestId('shortcuts-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-tool-select')).toBeInTheDocument();
    });

    it('clears search input when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const searchInput = screen.getByTestId('shortcuts-search-input');
      await user.type(searchInput, 'pin');
      expect(searchInput).toHaveValue('pin');

      const clearBtn = screen.getByTestId('shortcuts-search-clear-btn');
      await user.click(clearBtn);
      expect(searchInput).toHaveValue('');
    });

    it('filters shortcuts by category tab', async () => {
      const user = userEvent.setup();
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      // Click 'Export' tab
      await user.click(screen.getByTestId('category-tab-export'));

      expect(screen.getByTestId('shortcut-category-card-export')).toBeInTheDocument();
      expect(screen.queryByTestId('shortcut-category-card-tools')).not.toBeInTheDocument();
      expect(screen.queryByTestId('shortcut-category-card-canvas')).not.toBeInTheDocument();

      // Click 'All' tab
      await user.click(screen.getByTestId('category-tab-all'));
      expect(screen.getByTestId('shortcut-category-card-tools')).toBeInTheDocument();
    });
  });

  describe('4. Platform Toggle (Mac vs Win/Linux)', () => {
    it('switches displayed keycaps when platform toggle is clicked', async () => {
      const user = userEvent.setup();
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      // Default Mac platform has Command symbols
      await user.click(screen.getByTestId('platform-toggle-mac'));
      const undoRowMac = screen.getByTestId('shortcut-row-history-undo');
      expect(within(undoRowMac).getByText('⌘')).toBeInTheDocument();

      // Switch to Windows / Linux
      await user.click(screen.getByTestId('platform-toggle-win'));
      const undoRowWin = screen.getByTestId('shortcut-row-history-undo');
      expect(within(undoRowWin).getByText('Ctrl')).toBeInTheDocument();
    });
  });

  describe('5. Accessibility & Focus Trapping', () => {
    it('traps Tab navigation within modal focusable elements', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const focusable = screen.getByTestId('shortcuts-modal').querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      expect(focusable.length).toBeGreaterThan(2);
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      // Focus last element and press Tab -> wraps to first
      lastEl.focus();
      fireEvent.keyDown(window, { key: 'Tab', bubbles: true });
      expect(document.activeElement).toBe(firstEl);

      // Focus first element and press Shift+Tab -> wraps to last
      firstEl.focus();
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true, bubbles: true });
      expect(document.activeElement).toBe(lastEl);
    });

    it('locks body scroll when open and restores on unmount', () => {
      const { unmount } = render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);
      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });
});
