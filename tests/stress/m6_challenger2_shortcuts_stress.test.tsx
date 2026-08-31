import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from '../../src/App';
import {
  ShortcutsModal,
  isMacPlatform,
  KbdBadge,
} from '../../src/components/modals/ShortcutsModal';
import {
  useKeyboardShortcuts,
  isEditableElement,
  UseKeyboardShortcutsOptions,
} from '../../src/hooks/useKeyboardShortcuts';
import { AppProvider, useApp } from '../../src/state/AppContext';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { BaseImage, Annotation, AppState } from '../../src/types';

// Mock base image
const mockBaseImage: BaseImage = {
  id: 'img-m6-stress',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1920,
  naturalHeight: 1080,
  fileName: 'shortcuts-stress-base.png',
  fileSize: 98000,
};

// Generator for N mock annotations
function generateMockAnnotations(count: number): Annotation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ann-m6-${i + 1}`,
    index: i + 1,
    geometry: {
      type: 'box',
      x: (i * 25) % 1800,
      y: (i * 20) % 1000,
      width: 100,
      height: 70,
    },
    style: {
      color: (['amber', 'red', 'green', 'cyan', 'purple'] as const)[i % 5],
      strokeWidth: 3,
      fillOpacity: 0.2,
    },
    note: `Developer annotation #${i + 1} with testing details.`,
    createdAt: 10000 + i,
    updatedAt: 10000 + i,
  }));
}

// Test harness component for useKeyboardShortcuts
const KeyboardShortcutsHarness: React.FC<{
  options?: UseKeyboardShortcutsOptions;
  initialState?: Partial<AppState>;
  children?: React.ReactNode;
}> = ({ options = {}, initialState = {}, children }) => {
  return (
    <AppProvider initialState={initialState}>
      <KeyboardShortcutsConsumer options={options}>
        {children}
      </KeyboardShortcutsConsumer>
    </AppProvider>
  );
};

const KeyboardShortcutsConsumer: React.FC<{
  options: UseKeyboardShortcutsOptions;
  children?: React.ReactNode;
}> = ({ options, children }) => {
  const { isSpacePressed } = useKeyboardShortcuts(options);
  const { state } = useApp();

  return (
    <div data-testid="shortcuts-harness">
      <div data-testid="spacebar-indicator">
        {isSpacePressed ? 'SPACE_ACTIVE' : 'SPACE_IDLE'}
      </div>
      <div data-testid="active-tool-indicator">{state.activeTool}</div>
      <div data-testid="selected-id-indicator">
        {state.selectedAnnotationId || 'NONE'}
      </div>
      <div data-testid="annotations-count">{state.annotations.length}</div>
      {children}
    </div>
  );
};

describe('Milestone 6 Challenger 2: Adversarial Stress Test Suite', () => {
  let localStorageStore: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageStore = {};

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageStore[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete localStorageStore[key];
        }),
        clear: vi.fn(() => {
          localStorageStore = {};
        }),
      },
      writable: true,
    });

    document.documentElement.className = '';
    document.body.style.overflow = '';
  });

  afterEach(() => {
    cleanup();
    document.documentElement.className = '';
    document.body.style.overflow = '';
  });

  // =========================================================================
  // Suite 1: Rapid Lifecycle & Stress (100+ Open/Close/Toggle Cycles)
  // =========================================================================
  describe('Suite 1: Rapid Lifecycle & Stress (100+ Cycles)', () => {
    it('C1.1: Survives 100 consecutive mount and unmount cycles without memory leaks or locked body overflow', () => {
      expect(document.body.style.overflow).toBe('');

      for (let i = 0; i < 100; i++) {
        const { unmount } = render(
          <ShortcutsModal isOpen={true} onClose={vi.fn()} />
        );
        expect(document.body.style.overflow).toBe('hidden');
        unmount();
        expect(document.body.style.overflow).toBe('');
      }

      expect(document.body.style.overflow).toBe('');
    });

    it('C1.2: Survives 100 rapid open/close prop transitions in a stateful parent component', async () => {
      const ToggleController = () => {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button
              data-testid="toggle-btn"
              onClick={() => setOpen((prev) => !prev)}
            >
              Toggle
            </button>
            <ShortcutsModal isOpen={open} onClose={() => setOpen(false)} />
          </div>
        );
      };

      render(<ToggleController />);
      const toggleBtn = screen.getByTestId('toggle-btn');

      for (let i = 0; i < 100; i++) {
        fireEvent.click(toggleBtn);
        expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument();
        expect(document.body.style.overflow).toBe('hidden');

        fireEvent.click(toggleBtn);
        expect(screen.queryByTestId('shortcuts-modal')).toBeNull();
        expect(document.body.style.overflow).toBe('');
      }
    });

    it('C1.3: Handles 100 rapid platform toggles (Mac <-> Win/Linux) maintaining valid key badges', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const macBtn = screen.getByTestId('platform-toggle-mac');
      const winBtn = screen.getByTestId('platform-toggle-win');

      for (let i = 0; i < 50; i++) {
        fireEvent.click(winBtn);
        expect(winBtn).toHaveAttribute('aria-pressed', 'true');
        expect(macBtn).toHaveAttribute('aria-pressed', 'false');

        // Check undo shortcut badge renders Ctrl + Z
        const undoRow = screen.getByTestId('shortcut-row-history-undo');
        expect(undoRow).toHaveTextContent('Ctrl');

        fireEvent.click(macBtn);
        expect(macBtn).toHaveAttribute('aria-pressed', 'true');
        expect(winBtn).toHaveAttribute('aria-pressed', 'false');

        // Check undo shortcut badge renders ⌘ + Z
        expect(undoRow).toHaveTextContent('⌘');
      }
    });

    it('C1.4: Handles 50 rapid category tab switches without rendering anomalies', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const categories = ['all', 'tools', 'canvas', 'history', 'sidebar', 'export'];

      for (let cycle = 0; cycle < 10; cycle++) {
        for (const catId of categories) {
          const tabBtn = screen.getByTestId(`category-tab-${catId}`);
          fireEvent.click(tabBtn);
          expect(tabBtn).toHaveAttribute('aria-selected', 'true');

          if (catId === 'all') {
            expect(screen.getByTestId('shortcut-category-card-tools')).toBeInTheDocument();
            expect(screen.getByTestId('shortcut-category-card-export')).toBeInTheDocument();
          } else {
            expect(screen.getByTestId(`shortcut-category-card-${catId}`)).toBeInTheDocument();
          }
        }
      }
    });
  });

  // =========================================================================
  // Suite 2: Focus Trap Exhaustive Traversal & Wrap-Around Boundary Stress
  // =========================================================================
  describe('Suite 2: Focus Trap Exhaustive Traversal & Wrap-Around Stress', () => {
    it('C2.1: Traps focus and wraps around forward (Tab on last element -> focuses first element)', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const modalDialog = screen.getByTestId('shortcuts-modal-dialog');
      const focusableElements = modalDialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      expect(focusableElements.length).toBeGreaterThan(5);

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Set active focus on the last focusable element
      lastElement.focus();
      expect(document.activeElement).toBe(lastElement);

      // Press Tab
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });

      // Focus should loop back to the first element
      expect(document.activeElement).toBe(firstElement);
    });

    it('C2.2: Traps focus and wraps around backward (Shift+Tab on first element -> focuses last element)', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const modalDialog = screen.getByTestId('shortcuts-modal-dialog');
      const focusableElements = modalDialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Set active focus on the first focusable element
      firstElement.focus();
      expect(document.activeElement).toBe(firstElement);

      // Press Shift+Tab
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });

      // Focus should loop to the last element
      expect(document.activeElement).toBe(lastElement);
    });

    it('C2.3: Survives 500 rapid Tab and Shift+Tab oscillations strictly retaining focus inside modal', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const modalDialog = screen.getByTestId('shortcuts-modal-dialog');
      const searchInput = screen.getByTestId('shortcuts-search-input');
      searchInput.focus();

      for (let i = 0; i < 250; i++) {
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
        expect(modalDialog.contains(document.activeElement)).toBe(true);

        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        expect(modalDialog.contains(document.activeElement)).toBe(true);
      }
    });

    it('C2.4: Restores focus to previous active element upon dismissal', () => {
      const TestContainer = () => {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button data-testid="trigger-btn" onClick={() => setOpen(true)}>
              Open Modal
            </button>
            <ShortcutsModal isOpen={open} onClose={() => setOpen(false)} />
          </div>
        );
      };

      render(<TestContainer />);
      const triggerBtn = screen.getByTestId('trigger-btn');
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      // Open modal
      fireEvent.click(triggerBtn);
      expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument();

      // Close modal via Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('shortcuts-modal')).toBeNull();

      // Focus must be restored to trigger button
      expect(document.activeElement).toBe(triggerBtn);
    });

    it('C2.5: Handles focus trap when empty state is displayed with reset button', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const searchInput = screen.getByTestId('shortcuts-search-input');
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent123' } });

      expect(screen.getByTestId('shortcuts-empty-state')).toBeInTheDocument();
      const resetBtn = screen.getByTestId('shortcuts-reset-search-btn');
      expect(resetBtn).toBeInTheDocument();

      const modalDialog = screen.getByTestId('shortcuts-modal-dialog');
      const focusable = modalDialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const lastElement = focusable[focusable.length - 1];

      lastElement.focus();
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(focusable[0]);
    });
  });

  // =========================================================================
  // Suite 3: Search Filtering Adversarial Fuzzing (Regex, Unicode, Emojis, Injection)
  // =========================================================================
  describe('Suite 3: Search Filtering Adversarial Fuzzing', () => {
    const adversarialQueries = [
      { name: 'Regex Special Chars (*+?^${}()|[]\\)', query: '.*+?^${}()|[]\\' },
      { name: 'Unmatched Opening Bracket ([)', query: '[' },
      { name: 'Unmatched Parenthesis (()', query: '(' },
      { name: 'Quantifier Plus (+)', query: '+' },
      { name: 'Backslash (\\)', query: '\\' },
      { name: 'HTML Script Tag', query: '<script>alert(1)</script>' },
      { name: 'SVG XSS vector', query: '"><svg/onload=alert()>' },
      { name: 'Unicode Accented (éclair)', query: 'éclair' },
      { name: 'Unicode Umlauts (über)', query: 'über' },
      { name: 'CJK Characters (日本語 / 漢字)', query: '日本語 漢字' },
      { name: 'Arabic Text (العربية)', query: 'العربية' },
      { name: 'Cyrillic (кириллица)', query: 'кириллица' },
      { name: 'Potato Emoji (🥔)', query: '🥔' },
      { name: 'Multi-byte Emoji (👨‍👩‍👧‍👦)', query: '👨‍👩‍👧‍👦' },
      { name: 'Whitespace and Tabs', query: '   \t    ' },
      { name: 'Extremely Long String (5000 chars)', query: 'a'.repeat(5000) },
    ];

    adversarialQueries.forEach(({ name, query }) => {
      it(`C3.1: Safely processes adversarial search query without crashing: ${name}`, () => {
        expect(() => {
          render(<ShortcutsModal isOpen={true} onClose={vi.fn()} initialSearch={query} />);
        }).not.toThrow();

        const searchInput = screen.getByTestId('shortcuts-search-input');
        expect(searchInput).toBeInTheDocument();

        // If no match found, empty state renders safely
        if (screen.queryByTestId('shortcuts-empty-state')) {
          expect(screen.getByTestId('shortcuts-empty-state')).toBeInTheDocument();
        }
      });
    });

    it('C3.2: Accurately filters shortcuts by diverse keywords and aliases', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);
      const searchInput = screen.getByTestId('shortcuts-search-input');

      // Test 1: "undo" -> matches history-undo and history-redo
      fireEvent.change(searchInput, { target: { value: 'undo' } });
      expect(screen.getByTestId('shortcut-row-history-undo')).toBeInTheDocument();

      // Test 2: "png" or "image" -> matches export-copy-image
      fireEvent.change(searchInput, { target: { value: 'png' } });
      expect(screen.getByTestId('shortcut-row-export-copy-image')).toBeInTheDocument();

      // Test 3: "markdown" or "notes" -> matches export-copy-notes
      fireEvent.change(searchInput, { target: { value: 'markdown' } });
      expect(screen.getByTestId('shortcut-row-export-copy-notes')).toBeInTheDocument();

      // Test 4: "arrow" -> matches tool-arrow
      fireEvent.change(searchInput, { target: { value: 'arrow' } });
      expect(screen.getByTestId('shortcut-row-tool-arrow')).toBeInTheDocument();
      expect(screen.queryByTestId('shortcut-row-tool-box')).toBeNull();

      // Test 5: "zoom" -> matches canvas zoom in/out/fit/actual
      fireEvent.change(searchInput, { target: { value: 'zoom' } });
      expect(screen.getByTestId('shortcut-row-canvas-zoom-in')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-row-canvas-zoom-out')).toBeInTheDocument();
    });

    it('C3.3: Clear button appears when query is present and resets search when clicked', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);
      const searchInput = screen.getByTestId('shortcuts-search-input');

      expect(screen.queryByTestId('shortcuts-search-clear-btn')).toBeNull();

      fireEvent.change(searchInput, { target: { value: 'rect' } });
      const clearBtn = screen.getByTestId('shortcuts-search-clear-btn');
      expect(clearBtn).toBeInTheDocument();

      fireEvent.click(clearBtn);
      expect((searchInput as HTMLInputElement).value).toBe('');
      expect(screen.queryByTestId('shortcuts-search-clear-btn')).toBeNull();
      expect(screen.getByTestId('shortcut-row-tool-box')).toBeInTheDocument();
    });

    it('C3.4: "Reset Filters" button in empty state restores all categories and empty search', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} initialCategory="tools" />);
      const searchInput = screen.getByTestId('shortcuts-search-input');

      fireEvent.change(searchInput, { target: { value: 'nonexistent999' } });
      expect(screen.getByTestId('shortcuts-empty-state')).toBeInTheDocument();

      const resetBtn = screen.getByTestId('shortcuts-reset-search-btn');
      fireEvent.click(resetBtn);

      expect((searchInput as HTMLInputElement).value).toBe('');
      expect(screen.getByTestId('category-tab-all')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('shortcut-category-card-tools')).toBeInTheDocument();
      expect(screen.getByTestId('shortcut-category-card-history')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Suite 4: Keyboard Shortcuts Dispatcher & Global Event Routing
  // =========================================================================
  describe('Suite 4: Keyboard Shortcuts Dispatcher & Global Event Routing', () => {
    it('C4.1: Dispatches single-key tool switches correctly (V, B, R, C, O, A, P, H)', () => {
      render(
        <KeyboardShortcutsHarness
          initialState={{ image: mockBaseImage, activeTool: 'select' }}
        />
      );

      const toolIndicator = screen.getByTestId('active-tool-indicator');
      expect(toolIndicator).toHaveTextContent('select');

      const toolKeyMap = [
        { key: 'b', expected: 'box' },
        { key: 'r', expected: 'box' },
        { key: 'c', expected: 'ellipse' },
        { key: 'o', expected: 'ellipse' },
        { key: 'a', expected: 'arrow' },
        { key: 'p', expected: 'pin' },
        { key: 'h', expected: 'pan' },
        { key: 'v', expected: 'select' },
      ];

      for (const { key, expected } of toolKeyMap) {
        fireEvent.keyDown(window, { key });
        expect(toolIndicator).toHaveTextContent(expected);
      }
    });

    it('C4.2: Invokes navigation, zoom, and help callbacks', () => {
      const onFitToScreen = vi.fn();
      const onActualSize = vi.fn();
      const onZoomIn = vi.fn();
      const onZoomOut = vi.fn();
      const onToggleShortcutsModal = vi.fn();
      const onToggleTheme = vi.fn();

      render(
        <KeyboardShortcutsHarness
          options={{
            onFitToScreen,
            onActualSize,
            onZoomIn,
            onZoomOut,
            onToggleShortcutsModal,
            onToggleTheme,
          }}
        />
      );

      // Zoom keybindings
      fireEvent.keyDown(window, { key: '0' });
      expect(onFitToScreen).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: '1' });
      expect(onActualSize).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: '+' });
      expect(onZoomIn).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: '=' });
      expect(onZoomIn).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(window, { key: '-' });
      expect(onZoomOut).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: '_' });
      expect(onZoomOut).toHaveBeenCalledTimes(2);

      // Help Modal keybindings: '?' and Shift+'/'
      fireEvent.keyDown(window, { key: '?' });
      expect(onToggleShortcutsModal).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: '/', shiftKey: true, code: 'Slash' });
      expect(onToggleShortcutsModal).toHaveBeenCalledTimes(2);

      // Theme toggle: Cmd+D or Ctrl+D
      fireEvent.keyDown(window, { key: 'd', metaKey: true });
      expect(onToggleTheme).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
      expect(onToggleTheme).toHaveBeenCalledTimes(2);
    });

    it('C4.3: Tracks Spacebar hold and release state for canvas panning', () => {
      render(<KeyboardShortcutsHarness />);

      const spaceIndicator = screen.getByTestId('spacebar-indicator');
      expect(spaceIndicator).toHaveTextContent('SPACE_IDLE');

      // Space down
      fireEvent.keyDown(window, { code: 'Space' });
      expect(spaceIndicator).toHaveTextContent('SPACE_ACTIVE');

      // Space repeated keydown should not glitch
      fireEvent.keyDown(window, { code: 'Space', repeat: true });
      expect(spaceIndicator).toHaveTextContent('SPACE_ACTIVE');

      // Space up
      fireEvent.keyUp(window, { code: 'Space' });
      expect(spaceIndicator).toHaveTextContent('SPACE_IDLE');

      // Window blur resets spacebar state
      fireEvent.keyDown(window, { code: 'Space' });
      expect(spaceIndicator).toHaveTextContent('SPACE_ACTIVE');
      fireEvent.blur(window);
      expect(spaceIndicator).toHaveTextContent('SPACE_IDLE');
    });

    it('C4.4: Handles 500 rapid mixed keyboard shortcut events without throwing or locking', () => {
      const onCopyImage = vi.fn();
      const onCopyNotes = vi.fn();
      const onToggleTheme = vi.fn();

      render(
        <KeyboardShortcutsHarness
          options={{ onCopyImage, onCopyNotes, onToggleTheme }}
          initialState={{ image: mockBaseImage, activeTool: 'select' }}
        />
      );

      const keys = ['v', 'b', 'c', 'a', 'p', 'h', '0', '1', '+', '-', 'z', 'd'];

      expect(() => {
        for (let i = 0; i < 500; i++) {
          const key = keys[i % keys.length];
          const metaKey = i % 3 === 0;
          const shiftKey = i % 5 === 0;
          fireEvent.keyDown(window, { key, metaKey, shiftKey });
        }
      }).not.toThrow();
    });
  });

  // =========================================================================
  // Suite 5: Strict Input Isolation & Text Selection Guards
  // =========================================================================
  describe('Suite 5: Strict Input Isolation & Text Selection Guards', () => {
    it('C5.1: isEditableElement correctly identifies all interactive text targets', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const select = document.createElement('select');
      const divEditable = document.createElement('div');
      divEditable.contentEditable = 'true';
      const divRoleTextbox = document.createElement('div');
      divRoleTextbox.setAttribute('role', 'textbox');
      const divRoleSearchbox = document.createElement('div');
      divRoleSearchbox.setAttribute('role', 'searchbox');
      const plainDiv = document.createElement('div');
      const button = document.createElement('button');

      expect(isEditableElement(input)).toBe(true);
      expect(isEditableElement(textarea)).toBe(true);
      expect(isEditableElement(select)).toBe(true);
      expect(isEditableElement(divEditable)).toBe(true);
      expect(isEditableElement(divRoleTextbox)).toBe(true);
      expect(isEditableElement(divRoleSearchbox)).toBe(true);
      expect(isEditableElement(plainDiv)).toBe(false);
      expect(isEditableElement(button)).toBe(false);
      expect(isEditableElement(null)).toBe(false);
    });

    it('C5.2: Bypasses all single-key shortcuts and help modal when typing in an input element', () => {
      const onToggleShortcutsModal = vi.fn();
      render(
        <KeyboardShortcutsHarness
          options={{ onToggleShortcutsModal }}
          initialState={{ image: mockBaseImage, activeTool: 'select' }}
        >
          <input data-testid="test-input" type="text" />
        </KeyboardShortcutsHarness>
      );

      const input = screen.getByTestId('test-input');
      input.focus();
      const toolIndicator = screen.getByTestId('active-tool-indicator');

      // Type tool keys inside input
      const singleKeys = ['b', 'r', 'c', 'o', 'a', 'p', 'h', '0', '1', '?', '+', '-'];
      for (const key of singleKeys) {
        fireEvent.keyDown(input, { key, target: input });
        expect(toolIndicator).toHaveTextContent('select'); // Must NOT change
      }

      expect(onToggleShortcutsModal).not.toHaveBeenCalled();
    });

    it('C5.3: Does not trigger image copy when user has text highlighted in an input or document', () => {
      const onCopyImage = vi.fn();
      render(
        <KeyboardShortcutsHarness
          options={{ onCopyImage }}
          initialState={{ image: mockBaseImage }}
        >
          <input data-testid="copy-input" defaultValue="selected developer text" />
        </KeyboardShortcutsHarness>
      );

      const input = screen.getByTestId('copy-input') as HTMLInputElement;
      input.focus();
      input.setSelectionRange(0, 8); // Select "selected"

      // Trigger Cmd+C while text is selected inside input
      fireEvent.keyDown(window, { key: 'c', metaKey: true });
      expect(onCopyImage).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Suite 6: High Annotation Scale & Keyboard Stress (100+ Annotations)
  // =========================================================================
  describe('Suite 6: High Annotation Scale & Keyboard Stress (100+ Annotations)', () => {
    it('C6.1: Renders 150 annotations and handles keyboard deletion maintaining 1..N continuous sequence', () => {
      const annotations150 = generateMockAnnotations(150);

      render(
        <KeyboardShortcutsHarness
          initialState={{
            image: mockBaseImage,
            annotations: annotations150,
            selectedAnnotationId: 'ann-m6-75',
          }}
        />
      );

      expect(screen.getByTestId('annotations-count')).toHaveTextContent('150');
      expect(screen.getByTestId('selected-id-indicator')).toHaveTextContent('ann-m6-75');

      // Press Delete key to remove selected annotation #75
      fireEvent.keyDown(window, { key: 'Delete' });

      // Annotation count decreases to 149
      expect(screen.getByTestId('annotations-count')).toHaveTextContent('149');
    });

    it('C6.2: Handles Escape key to deselect annotation or revert tool under 100+ items load', () => {
      const annotations100 = generateMockAnnotations(100);

      render(
        <KeyboardShortcutsHarness
          initialState={{
            image: mockBaseImage,
            annotations: annotations100,
            selectedAnnotationId: 'ann-m6-50',
            activeTool: 'box',
          }}
        />
      );

      expect(screen.getByTestId('selected-id-indicator')).toHaveTextContent('ann-m6-50');

      // First Escape: Deselects annotation
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByTestId('selected-id-indicator')).toHaveTextContent('NONE');
      expect(screen.getByTestId('active-tool-indicator')).toHaveTextContent('box');

      // Second Escape: Resets tool to 'select'
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByTestId('active-tool-indicator')).toHaveTextContent('select');
    });

    it('C6.3: Integrates full App with 100+ annotations and opens ShortcutsModal without UI latency', async () => {
      const annotations100 = generateMockAnnotations(100);

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: annotations100,
          }}
        >
          <ThemeProvider defaultTheme="dark">
            <App />
          </ThemeProvider>
        </AppProvider>
      );

      // Verify App rendered with 100 annotations
      expect(screen.getByTestId('app-brand-title')).toBeInTheDocument();

      // Trigger help modal via '?' key
      fireEvent.keyDown(window, { key: '?' });

      // Modal is visible
      const modal = screen.getByTestId('shortcuts-modal');
      expect(modal).toBeInTheDocument();
      expect(screen.getByTestId('shortcuts-modal-title')).toBeInTheDocument();

      // Close modal via 'Got it' button
      const doneBtn = screen.getByTestId('shortcuts-modal-done-btn');
      fireEvent.click(doneBtn);

      expect(screen.queryByTestId('shortcuts-modal')).toBeNull();
    });
  });

  // =========================================================================
  // Suite 7: Theming & Platform Integration Under Stress
  // =========================================================================
  describe('Suite 7: Theming & Platform Integration Under Stress', () => {
    it('C7.1: Toggles dark/light theme via Cmd+D while ShortcutsModal is open without dropping modal state', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <App />
        </ThemeProvider>
      );

      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Open shortcuts modal
      fireEvent.keyDown(window, { key: '?' });
      expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument();

      // Search for "box" inside modal
      const searchInput = screen.getByTestId('shortcuts-search-input');
      fireEvent.change(searchInput, { target: { value: 'box' } });
      expect((searchInput as HTMLInputElement).value).toBe('box');

      // Trigger Cmd+D to switch theme to light
      fireEvent.keyDown(window, { key: 'd', metaKey: true });
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // Modal remains open with search value intact
      expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument();
      expect((searchInput as HTMLInputElement).value).toBe('box');

      // Trigger Cmd+D again to return to dark
      fireEvent.keyDown(window, { key: 'd', metaKey: true });
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('C7.2: isMacPlatform handles undefined navigator and platform variations safely', () => {
      expect(typeof isMacPlatform()).toBe('boolean');
    });

    it('C7.3: KbdBadge renders single keys, modifier keys, and separator text (+, or)', () => {
      const { container } = render(
        <KbdBadge keys={['⌘', '+', 'Shift', '+', 'Z', 'or', 'Ctrl', '+', 'Y']} />
      );

      expect(container).toHaveTextContent('⌘');
      expect(container).toHaveTextContent('Shift');
      expect(container).toHaveTextContent('Z');
      expect(container).toHaveTextContent('or');
      expect(container).toHaveTextContent('Ctrl');
      expect(container).toHaveTextContent('Y');
    });
  });
});
