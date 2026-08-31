import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../../src/state/AppContext';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import { NotesSidebar } from '../../src/components/sidebar/NotesSidebar';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';
import { AppState, BaseImage, Annotation } from '../../src/types';

// Mock base image
const mockImage: BaseImage = {
  id: 'img_integration_1',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1000,
  naturalHeight: 800,
  fileName: 'sync-test.png',
  fileSize: 50000,
};

const mockAnnotation1: Annotation = {
  id: 'ann-1',
  index: 1,
  geometry: { type: 'box', x: 100, y: 100, width: 200, height: 150 },
  style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
  note: 'Primary issue box note',
  createdAt: 1000,
  updatedAt: 1000,
};

const mockAnnotation2: Annotation = {
  id: 'ann-2',
  index: 2,
  geometry: { type: 'arrow', startX: 400, startY: 300, endX: 600, endY: 500 },
  style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
  note: 'Secondary pointer arrow note',
  createdAt: 2000,
  updatedAt: 2000,
};

const mockAnnotation3: Annotation = {
  id: 'ann-3',
  index: 3,
  geometry: { type: 'pin', x: 700, y: 200 },
  style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
  note: 'Critical callout pin note',
  createdAt: 3000,
  updatedAt: 3000,
};

const SyncTestContainer: React.FC = () => {
  useKeyboardShortcuts();
  return React.createElement(
    'div',
    { className: 'flex h-screen w-screen' },
    React.createElement(
      'div',
      { className: 'flex-1 relative' },
      React.createElement(CanvasWorkspace)
    ),
    React.createElement(
      'aside',
      { 'data-testid': 'notes-sidebar-container', className: 'w-80 h-full' },
      React.createElement(NotesSidebar)
    )
  );
};

describe('Cross-Module Integration: Canvas <-> Sidebar Bidirectional Synchronization', () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderAppWithState = (initialState?: Partial<AppState>) => {
    return render(
      React.createElement(
        AppProvider,
        {
          initialState: {
            image: mockImage,
            annotations: [mockAnnotation1, mockAnnotation2, mockAnnotation3],
            selectedAnnotationId: null,
            hoveredAnnotationId: null,
            isSidebarOpen: true,
            activeTool: 'select',
            ...initialState,
          },
        },
        React.createElement(SyncTestContainer)
      )
    );
  };

  // =========================================================================
  // Test Suite 1: Layout & Mount Integration
  // =========================================================================
  describe('Suite 1: Split-View Layout & Visibility Integration', () => {
    it('I1.1: Mounts App with both CanvasWorkspace and NotesSidebar rendered simultaneously', () => {
      renderAppWithState();
      expect(screen.getByTestId('canvas-workspace-container')).toBeInTheDocument();
      expect(screen.getByTestId('notes-sidebar-container')).toBeInTheDocument();
      expect(screen.getAllByTestId(/^note-card-ann-/)).toHaveLength(3);
    });

    it('I1.2: Renders 3 canvas shapes and 3 sidebar note cards matching sequence 1, 2, 3', () => {
      renderAppWithState();
      expect(screen.getByTestId('shape-box')).toBeInTheDocument();
      expect(screen.getByTestId('shape-arrow')).toBeInTheDocument();
      expect(screen.getByTestId('shape-pin')).toBeInTheDocument();

      expect(screen.getByTestId('note-card-ann-1')).toHaveTextContent('Primary issue box note');
      expect(screen.getByTestId('note-card-ann-2')).toHaveTextContent('Secondary pointer arrow note');
      expect(screen.getByTestId('note-card-ann-3')).toHaveTextContent('Critical callout pin note');
    });
  });

  // =========================================================================
  // Test Suite 2: Sidebar -> Canvas Hover Highlighting
  // =========================================================================
  describe('Suite 2: Sidebar Card Hover -> Canvas Highlighting', () => {
    it('I2.1: Hovering NoteCard #1 triggers hover halo on canvas box shape', () => {
      renderAppWithState();
      const card1 = screen.getByTestId('note-card-ann-1');

      // Mouse enter sidebar card
      fireEvent.mouseEnter(card1);

      const boxGroup = screen.getByTestId('shape-box');
      // Hover halo rect should be rendered
      const haloRect = boxGroup.querySelector('rect[stroke-opacity="0.3"], rect[stroke-opacity="0.35"], rect[stroke-opacity="0.5"]');
      expect(haloRect).toBeInTheDocument();
    });

    it('I2.2: Hovering NoteCard #2 scales up canvas Arrow badge to 1.15x', () => {
      renderAppWithState();
      const card2 = screen.getByTestId('note-card-ann-2');

      fireEvent.mouseEnter(card2);

      const badge2 = screen.getByTestId('annotation-badge-2');
      expect(badge2.style.transform).toBe('scale(1.15)');
    });

    it('I2.3: Unhovering NoteCard resets canvas hover state cleanly', () => {
      renderAppWithState();
      const card1 = screen.getByTestId('note-card-ann-1');

      fireEvent.mouseEnter(card1);
      const badge1 = screen.getByTestId('annotation-badge-1');
      expect(badge1.style.transform).toBe('scale(1.15)');

      fireEvent.mouseLeave(card1);
      expect(badge1.style.transform).toBe('scale(1)');
    });
  });

  // =========================================================================
  // Test Suite 3: Canvas -> Sidebar Hover Highlighting & Smooth Scrolling
  // =========================================================================
  describe('Suite 3: Canvas Hover -> Sidebar Card Accent & Scroll', () => {
    it('I3.1: Hovering canvas box shape highlights NoteCard #1 with accent border ring', () => {
      renderAppWithState();
      const boxShape = screen.getByTestId('shape-box');

      fireEvent.mouseEnter(boxShape);

      const card1 = screen.getByTestId('note-card-ann-1');
      expect(card1.getAttribute('data-is-hovered')).toBe('true');
    });

    it('I3.2: Hovering canvas badge #3 triggers scrollIntoView on NoteCard #3', () => {
      renderAppWithState();
      const badge3 = screen.getByTestId('annotation-badge-3');

      fireEvent.pointerEnter(badge3);

      expect(scrollIntoViewMock).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: 'smooth',
          block: 'nearest',
        })
      );
    });

    it('I3.3: Pointer leaving canvas shape clears sidebar card hover highlight', () => {
      renderAppWithState();
      const boxShape = screen.getByTestId('shape-box');

      fireEvent.mouseEnter(boxShape);
      const card1 = screen.getByTestId('note-card-ann-1');
      expect(card1.getAttribute('data-is-hovered')).toBe('true');

      fireEvent.mouseLeave(boxShape);
      expect(card1.getAttribute('data-is-hovered')).toBe('false');
    });
  });

  // =========================================================================
  // Test Suite 4: Bidirectional Selection Synchronization
  // =========================================================================
  describe('Suite 4: Bidirectional Selection Synchronization', () => {
    it('I4.1: Clicking sidebar NoteCard #1 selects box and displays TransformHandles on canvas', () => {
      renderAppWithState();
      const card1 = screen.getByTestId('note-card-ann-1');

      fireEvent.click(card1);

      // Canvas transform handles are now rendered
      expect(screen.getByTestId('transform-handles')).toBeInTheDocument();
      // Badge #1 selection ring rendered
      expect(screen.getByTestId('badge-selection-ring-1')).toBeInTheDocument();
    });

    it('I4.2: Clicking canvas arrow shape highlights and selects NoteCard #2 in sidebar', () => {
      renderAppWithState();
      const arrowShape = screen.getByTestId('shape-arrow');

      fireEvent.click(arrowShape);

      const card2 = screen.getByTestId('note-card-ann-2');
      expect(card2.getAttribute('data-is-selected')).toBe('true');
    });

    it('I4.3: Clicking canvas background catcher deselects active annotation across both views', () => {
      renderAppWithState({ selectedAnnotationId: 'ann-1' });

      expect(screen.getByTestId('transform-handles')).toBeInTheDocument();
      expect(screen.getByTestId('note-card-ann-1').getAttribute('data-is-selected')).toBe('true');

      const bgCatcher = screen.getByTestId('canvas-background-catcher');
      fireEvent.click(bgCatcher);

      expect(screen.queryByTestId('transform-handles')).not.toBeInTheDocument();
      expect(screen.getByTestId('note-card-ann-1').getAttribute('data-is-selected')).toBe('false');
    });
  });

  // =========================================================================
  // Test Suite 5: Live Note Editing & Canvas Invariance
  // =========================================================================
  describe('Suite 5: Live Note Editing Synchronization', () => {
    it('I5.1: Editing note in sidebar updates state without disrupting canvas shape coordinates', () => {
      renderAppWithState({ selectedAnnotationId: 'ann-1' });

      const textarea = screen.getByTestId('note-textarea-ann-1');
      fireEvent.change(textarea, { target: { value: 'Updated live note text' } });

      expect(textarea).toHaveValue('Updated live note text');
      // Box shape remains intact on canvas
      expect(screen.getByTestId('shape-box')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-badge-1')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Test Suite 6: Reordering & Deletion Dynamic 1..N Re-indexing
  // =========================================================================
  describe('Suite 6: Dynamic 1..N Re-indexing on Reorder and Delete', () => {
    it('I6.1: Clicking Move Down on Card #1 reorders items and updates badges to 1, 2, 3 across canvas and sidebar', () => {
      renderAppWithState();

      const moveDownBtn1 = screen.getByTestId('reorder-down-ann-1');
      fireEvent.click(moveDownBtn1);

      // Now order is [ann-2, ann-1, ann-3]
      const cards = screen.getAllByTestId(/^note-card-ann-/);
      expect(cards[0].getAttribute('data-annotation-id')).toBe('ann-2');
      expect(cards[1].getAttribute('data-annotation-id')).toBe('ann-1');
      expect(cards[2].getAttribute('data-annotation-id')).toBe('ann-3');

      // Badges reflect new indices
      expect(screen.getByTestId('badge-text-1')).toBeInTheDocument();
      expect(screen.getByTestId('badge-text-2')).toBeInTheDocument();
      expect(screen.getByTestId('badge-text-3')).toBeInTheDocument();
    });

    it('I6.2: Deleting middle annotation #2 re-indexes remaining items to #1 and #2 on both views', () => {
      renderAppWithState();

      const deleteBtn2 = screen.getByTestId('delete-annotation-ann-2');
      fireEvent.click(deleteBtn2);

      // 2 cards remaining
      const cards = screen.getAllByTestId(/^note-card-ann-/);
      expect(cards).toHaveLength(2);
      expect(cards[0].getAttribute('data-annotation-id')).toBe('ann-1');
      expect(cards[1].getAttribute('data-annotation-id')).toBe('ann-3');

      // Badge on ann-3 is re-indexed from 3 to 2
      expect(screen.queryByTestId('shape-arrow')).not.toBeInTheDocument();
      expect(screen.getByTestId('shape-box')).toBeInTheDocument();
      expect(screen.getByTestId('shape-pin')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-badge-2')).toHaveAttribute('data-annotation-id', 'ann-3');
    });
  });

  // =========================================================================
  // Test Suite 7: Input Isolation Integration
  // =========================================================================
  describe('Suite 7: Input Isolation Integration', () => {
    it('I7.1: Typing "b", "c", "v" or Backspace inside note textarea does not trigger canvas tool switch or deletion', () => {
      renderAppWithState({ selectedAnnotationId: 'ann-1' });

      const textarea = screen.getByTestId('note-textarea-ann-1');
      textarea.focus();

      // Fire hotkey events on textarea
      fireEvent.keyDown(textarea, { key: 'b', code: 'KeyB' });
      fireEvent.keyDown(textarea, { key: 'c', code: 'KeyC' });
      fireEvent.keyDown(textarea, { key: 'Backspace', code: 'Backspace' });

      // Annotation #1 is NOT deleted
      expect(screen.getByTestId('note-card-ann-1')).toBeInTheDocument();
      expect(screen.getByTestId('shape-box')).toBeInTheDocument();
    });
  });
});
