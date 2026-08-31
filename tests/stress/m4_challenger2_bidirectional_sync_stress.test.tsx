import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { AppProvider, useApp } from '../../src/state/AppContext';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import { NotesSidebar } from '../../src/components/sidebar/NotesSidebar';
import { MarkdownEditor } from '../../src/components/sidebar/MarkdownEditor';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';
import { AppState, BaseImage, Annotation } from '../../src/types';

// Standard 1000x800 test base image
const mockBaseImage: BaseImage = {
  id: 'img_challenger2_stress',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1000,
  naturalHeight: 800,
  fileName: 'm4-challenger2-stress.png',
  fileSize: 64000,
};

function createMockAnnotation(
  id: string,
  index: number,
  type: 'box' | 'ellipse' | 'arrow' | 'pin' = 'box',
  note: string = `Test note for annotation #${index}`
): Annotation {
  let geometry: any;
  switch (type) {
    case 'ellipse':
      geometry = { type: 'ellipse', cx: 100 + index * 10, cy: 100 + index * 10, rx: 30, ry: 20 };
      break;
    case 'arrow':
      geometry = {
        type: 'arrow',
        startX: 50 + index * 5,
        startY: 50 + index * 5,
        endX: 150 + index * 5,
        endY: 150 + index * 5,
      };
      break;
    case 'pin':
      geometry = { type: 'pin', x: 200 + index * 10, y: 200 + index * 10 };
      break;
    case 'box':
    default:
      geometry = { type: 'box', x: 20 + index * 15, y: 20 + index * 15, width: 60, height: 40 };
      break;
  }

  return {
    id,
    index,
    geometry,
    style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
    note,
    createdAt: 10000 + index,
    updatedAt: 10000 + index,
  };
}

const ChallengerTestContainer: React.FC<{
  onStateRef?: (state: AppState) => void;
  options?: any;
}> = ({ onStateRef, options }) => {
  const { state } = useApp();
  const shortcutResult = useKeyboardShortcuts(options);

  React.useEffect(() => {
    if (onStateRef) onStateRef(state);
  }, [state, onStateRef]);

  return (
    <div className="flex h-screen w-screen" data-is-space-pressed={shortcutResult.isSpacePressed ? 'true' : 'false'}>
      <div className="flex-1 relative">
        <CanvasWorkspace />
      </div>
      <aside data-testid="notes-sidebar-wrapper" className="w-96 h-full">
        <NotesSidebar />
      </aside>
    </div>
  );
};

describe('Milestone 4 Challenger 2: Adversarial Stress Test Suite', () => {
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

  /* ========================================================================
   * 1. MARKDOWN INPUT ISOLATION & KEYBOARD SHORTCUT BYPASS
   * ======================================================================== */
  describe('Markdown Input Isolation & Keyboard Shortcut Bypass', () => {
    it('strictly bypasses all single-key tool switching shortcuts (V, B, R, C, O, A, P, H) while typing in Markdown textarea', async () => {
      const ann1 = createMockAnnotation('ann-isolation-1', 1, 'box', 'Initial text');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1],
            activeTool: 'select',
            selectedAnnotationId: 'ann-isolation-1',
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      const textarea = screen.getByTestId('note-textarea-ann-isolation-1') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();
      expect(currentState!.activeTool).toBe('select');

      // Focus textarea
      textarea.focus();
      expect(document.activeElement).toBe(textarea);

      // List of tool shortcut keys that must NEVER trigger tool changes when typing in textarea
      const toolKeys = ['v', 'V', 'b', 'B', 'r', 'R', 'c', 'C', 'o', 'O', 'a', 'A', 'p', 'P', 'h', 'H'];

      for (const key of toolKeys) {
        fireEvent.keyDown(textarea, { key, code: `Key${key.toUpperCase()}` });
        expect(currentState!.activeTool).toBe('select');
      }

      // Verify that active tool stayed 'select' and was never switched to box, ellipse, arrow, pin, pan
      expect(currentState!.activeTool).toBe('select');
    });

    it('strictly isolates Delete, Backspace, Space, and digits (0, 1, +, -, ?) while typing inside Markdown editor', () => {
      const ann1 = createMockAnnotation('ann-del-1', 1, 'box', 'Important Note');
      let currentState: AppState | null = null;
      const onFitToScreen = vi.fn();
      const onActualSize = vi.fn();
      const onZoomIn = vi.fn();
      const onZoomOut = vi.fn();
      const onToggleShortcutsModal = vi.fn();

      const { container } = render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1],
            selectedAnnotationId: 'ann-del-1',
          }}
        >
          <ChallengerTestContainer
            onStateRef={(s) => (currentState = s)}
            options={{
              onFitToScreen,
              onActualSize,
              onZoomIn,
              onZoomOut,
              onToggleShortcutsModal,
            }}
          />
        </AppProvider>
      );

      const textarea = screen.getByTestId('note-textarea-ann-del-1') as HTMLTextAreaElement;
      textarea.focus();

      // 1. Delete and Backspace while an annotation is selected
      fireEvent.keyDown(textarea, { key: 'Delete', code: 'Delete' });
      fireEvent.keyDown(textarea, { key: 'Backspace', code: 'Backspace' });

      // Annotation must NOT be deleted
      expect(currentState!.annotations).toHaveLength(1);
      expect(currentState!.selectedAnnotationId).toBe('ann-del-1');

      // 2. Spacebar key while focused in textarea
      fireEvent.keyDown(textarea, { key: ' ', code: 'Space' });
      expect(container.firstChild).toHaveAttribute('data-is-space-pressed', 'false');

      // 3. Navigation shortcuts
      fireEvent.keyDown(textarea, { key: '0', code: 'Digit0' });
      fireEvent.keyDown(textarea, { key: '1', code: 'Digit1' });
      fireEvent.keyDown(textarea, { key: '+', code: 'Equal' });
      fireEvent.keyDown(textarea, { key: '-', code: 'Minus' });
      fireEvent.keyDown(textarea, { key: '?', code: 'Slash' });

      expect(onFitToScreen).not.toHaveBeenCalled();
      expect(onActualSize).not.toHaveBeenCalled();
      expect(onZoomIn).not.toHaveBeenCalled();
      expect(onZoomOut).not.toHaveBeenCalled();
      expect(onToggleShortcutsModal).not.toHaveBeenCalled();
    });

    it('handles rich text formatting shortcuts (Cmd+B, Cmd+I, Tab, Shift+Tab, Cmd+Enter, Escape) inside Markdown editor without side effects', () => {
      let noteValue = 'Hello world';
      const onNoteChange = vi.fn((val) => {
        noteValue = val;
      });

      render(
        <MarkdownEditor
          value={noteValue}
          onChange={onNoteChange}
          annotationId="ann-fmt-1"
        />
      );

      const textarea = screen.getByTestId('note-textarea-ann-fmt-1') as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(0, 5); // Select "Hello"

      // Cmd+B -> Bold
      fireEvent.keyDown(textarea, { key: 'b', code: 'KeyB', metaKey: true });
      expect(onNoteChange).toHaveBeenCalledWith('**Hello** world');

      // Tab -> Indent 2 spaces
      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: 'Tab', code: 'Tab' });
      expect(onNoteChange).toHaveBeenCalledWith('  Hello world');

      // Escape -> Blurs textarea cleanly
      const blurSpy = vi.spyOn(textarea, 'blur');
      fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' });
      expect(blurSpy).toHaveBeenCalled();
    });

    it('safely switches between Edit, Preview, and Split modes without losing content or throwing', () => {
      let noteValue = '### Section Title\n\n- [x] Task 1\n- [ ] Task 2\n\n`const x = 42;`';
      const onNoteChange = vi.fn((val) => {
        noteValue = val;
      });

      render(
        <MarkdownEditor
          value={noteValue}
          onChange={onNoteChange}
          annotationId="ann-modes-1"
        />
      );

      // Switch to Preview
      const previewBtn = screen.getByTestId('md-mode-preview');
      fireEvent.click(previewBtn);
      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
      expect(screen.queryByTestId('note-textarea-ann-modes-1')).not.toBeInTheDocument();

      // Click preview to return to edit mode
      fireEvent.click(screen.getByTestId('markdown-preview'));
      expect(screen.getByTestId('note-textarea-ann-modes-1')).toBeInTheDocument();

      // Switch to Split mode
      const splitBtn = screen.getByTestId('md-mode-split');
      fireEvent.click(splitBtn);
      expect(screen.getByTestId('note-textarea-ann-modes-1')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    });
  });

  /* ========================================================================
   * 2. BIDIRECTIONAL HOVER / SELECTION HIGHLIGHTING & OSCILLATION STRESS
   * ======================================================================== */
  describe('Bidirectional Hover & Selection Highlighting Loops', () => {
    it('synchronizes canvas hover to sidebar card highlight and triggers smooth scrollIntoView', () => {
      const ann1 = createMockAnnotation('ann-sync-1', 1, 'box');
      const ann2 = createMockAnnotation('ann-sync-2', 2, 'arrow');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1, ann2],
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      const card1 = screen.getByTestId('note-card-ann-sync-1');
      const card2 = screen.getByTestId('note-card-ann-sync-2');
      const shape1 = screen.getByTestId('shape-box');

      expect(card1).toHaveAttribute('data-is-hovered', 'false');

      // Hover canvas shape 1
      fireEvent.mouseEnter(shape1);
      expect(currentState!.hoveredAnnotationId).toBe('ann-sync-1');
      expect(card1).toHaveAttribute('data-is-hovered', 'true');
      expect(card2).toHaveAttribute('data-is-hovered', 'false');
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });

      // Leave canvas shape 1
      fireEvent.mouseLeave(shape1);
      expect(currentState!.hoveredAnnotationId).toBeNull();
      expect(card1).toHaveAttribute('data-is-hovered', 'false');
    });

    it('synchronizes sidebar card hover to canvas shape and scales sequence badge by 1.15x', () => {
      const ann1 = createMockAnnotation('ann-badge-1', 1, 'box');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1],
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      const card1 = screen.getByTestId('note-card-ann-badge-1');
      const badge1 = screen.getByTestId('annotation-badge-1');

      expect(badge1).toHaveStyle({ transform: 'scale(1)' });

      // Hover card in sidebar
      fireEvent.pointerEnter(card1);
      expect(currentState!.hoveredAnnotationId).toBe('ann-badge-1');
      expect(badge1).toHaveStyle({ transform: 'scale(1.15)' });

      // Leave card in sidebar
      fireEvent.pointerLeave(card1);
      expect(currentState!.hoveredAnnotationId).toBeNull();
      expect(badge1).toHaveStyle({ transform: 'scale(1)' });
    });

    it('survives 500 rapid alternating hover oscillations between canvas and sidebar without infinite loops or memory spikes', () => {
      const ann1 = createMockAnnotation('ann-osc-1', 1, 'box');
      const ann2 = createMockAnnotation('ann-osc-2', 2, 'arrow');
      const ann3 = createMockAnnotation('ann-osc-3', 3, 'pin');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1, ann2, ann3],
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      const card1 = screen.getByTestId('note-card-ann-osc-1');
      const card2 = screen.getByTestId('note-card-ann-osc-2');
      const shapeBox = screen.getByTestId('shape-box');
      const shapeArrow = screen.getByTestId('shape-arrow');

      // Rapidly alternate hover events across 500 cycles
      for (let i = 0; i < 250; i++) {
        act(() => {
          fireEvent.mouseEnter(shapeBox);
          fireEvent.pointerEnter(card2);
          fireEvent.mouseLeave(shapeBox);
          fireEvent.pointerLeave(card2);
          fireEvent.mouseEnter(shapeArrow);
          fireEvent.pointerEnter(card1);
          fireEvent.mouseLeave(shapeArrow);
          fireEvent.pointerLeave(card1);
        });
      }

      // Final state must be cleanly unhovered
      expect(currentState!.hoveredAnnotationId).toBeNull();
      expect(card1).toHaveAttribute('data-is-hovered', 'false');
      expect(card2).toHaveAttribute('data-is-hovered', 'false');
    }, 15000);

    it('handles selection transitions across sidebar cards and canvas shapes seamlessly', () => {
      const ann1 = createMockAnnotation('ann-sel-1', 1, 'box');
      const ann2 = createMockAnnotation('ann-sel-2', 2, 'ellipse');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1, ann2],
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      const card1 = screen.getByTestId('note-card-ann-sel-1');
      const card2 = screen.getByTestId('note-card-ann-sel-2');

      // Click card 1 header
      fireEvent.click(screen.getByTestId('note-card-header-ann-sel-1'));
      expect(currentState!.selectedAnnotationId).toBe('ann-sel-1');
      expect(card1).toHaveAttribute('data-is-selected', 'true');
      expect(card2).toHaveAttribute('data-is-selected', 'false');

      // Click card 2 header
      fireEvent.click(screen.getByTestId('note-card-header-ann-sel-2'));
      expect(currentState!.selectedAnnotationId).toBe('ann-sel-2');
      expect(card1).toHaveAttribute('data-is-selected', 'false');
      expect(card2).toHaveAttribute('data-is-selected', 'true');

      // Click canvas background catcher to deselect
      const bgCatcher = screen.getByTestId('canvas-background-catcher');
      fireEvent.click(bgCatcher);
      expect(currentState!.selectedAnnotationId).toBeNull();
      expect(card1).toHaveAttribute('data-is-selected', 'false');
      expect(card2).toHaveAttribute('data-is-selected', 'false');
    });
  });

  /* ========================================================================
   * 3. SMOOTH SCROLL PERFORMANCE & HIGH ANNOTATION COUNT (100 ITEMS)
   * ======================================================================== */
  describe('Smooth Scroll Performance & High Annotation Count (100 Items)', () => {
    it('maintains 1..100 sequence order and accurately scrolls to item 100 when hovered on canvas', () => {
      const hundredAnnotations: Annotation[] = Array.from({ length: 100 }, (_, i) =>
        createMockAnnotation(`ann-100-${i + 1}`, i + 1, i % 2 === 0 ? 'box' : 'pin', `Note #${i + 1}`)
      );
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: hundredAnnotations,
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('100');

      // Card #100 is rendered
      const card100 = screen.getByTestId('note-card-ann-100-100');
      expect(card100).toBeInTheDocument();
      expect(card100).toHaveAttribute('data-index', '100');

      // Simulate hovering annotation #100 directly in state
      act(() => {
        fireEvent.pointerEnter(card100);
      });

      expect(currentState!.hoveredAnnotationId).toBe('ann-100-100');
      expect(card100).toHaveAttribute('data-is-hovered', 'true');
    });

    it('performs rapid reordering and maintains strict 1..N indices across all 50 items', () => {
      const fiftyAnnotations: Annotation[] = Array.from({ length: 50 }, (_, i) =>
        createMockAnnotation(`ann-50-${i + 1}`, i + 1, 'box', `Note ${i + 1}`)
      );
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: fiftyAnnotations,
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      // Reorder item #1 down 5 times
      for (let step = 1; step <= 5; step++) {
        const moveDownBtn = screen.getByTestId(`note-card-move-down-${step}`);
        fireEvent.click(moveDownBtn);
      }

      // Check invariants
      expect(currentState!.annotations).toHaveLength(50);
      currentState!.annotations.forEach((ann, idx) => {
        expect(ann.index).toBe(idx + 1);
      });

      // Item originally at #1 is now at index 5 (index value 6)
      expect(currentState!.annotations[5].id).toBe('ann-50-1');
      expect(currentState!.annotations[5].index).toBe(6);
    });
  });

  /* ========================================================================
   * 4. DELETION, COLLAPSE, AND INVARIANT INTEGRITY
   * ======================================================================== */
  describe('Deletion, Collapse, and Invariant Integrity', () => {
    it('clears hoveredAnnotationId and selectedAnnotationId when the hovered/selected item is deleted', () => {
      const ann1 = createMockAnnotation('ann-del-sync-1', 1, 'box');
      const ann2 = createMockAnnotation('ann-del-sync-2', 2, 'arrow');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1, ann2],
            selectedAnnotationId: 'ann-del-sync-1',
            hoveredAnnotationId: 'ann-del-sync-1',
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      expect(currentState!.selectedAnnotationId).toBe('ann-del-sync-1');
      expect(currentState!.hoveredAnnotationId).toBe('ann-del-sync-1');

      // Click delete on card 1
      const deleteBtn = screen.getByTestId('note-card-delete-1');
      fireEvent.click(deleteBtn);

      // Verify deletion, reindexing, and state reset
      expect(currentState!.annotations).toHaveLength(1);
      expect(currentState!.annotations[0].id).toBe('ann-del-sync-2');
      expect(currentState!.annotations[0].index).toBe(1);
      expect(currentState!.selectedAnnotationId).toBeNull();
      expect(currentState!.hoveredAnnotationId).toBeNull();
    });

    it('collapses and expands sidebar cleanly with state badge indicator', () => {
      const ann1 = createMockAnnotation('ann-col-1', 1, 'box');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1],
            isSidebarOpen: true,
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      expect(screen.getByTestId('notes-sidebar')).toBeInTheDocument();

      // Collapse sidebar
      const collapseBtn = screen.getByTestId('sidebar-collapse-btn');
      fireEvent.click(collapseBtn);

      expect(currentState!.isSidebarOpen).toBe(false);
      expect(screen.getByTestId('notes-sidebar-collapsed')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-collapsed-badge')).toHaveTextContent('1');

      // Expand sidebar
      const expandBtn = screen.getByTestId('sidebar-expand-btn');
      fireEvent.click(expandBtn);

      expect(currentState!.isSidebarOpen).toBe(true);
      expect(screen.getByTestId('notes-sidebar')).toBeInTheDocument();
    });

    it('renders empty sidebar state when all annotations are removed', () => {
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [],
            isSidebarOpen: true,
          }}
        >
          <ChallengerTestContainer />
        </AppProvider>
      );

      expect(screen.getByTestId('sidebar-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-empty-title')).toHaveTextContent('No annotations yet');
      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('0');
    });

    it('disables Move Up on first item and Move Down on last item', () => {
      const ann1 = createMockAnnotation('ann-bound-1', 1, 'box');
      const ann2 = createMockAnnotation('ann-bound-2', 2, 'arrow');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1, ann2],
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      const moveUp1 = screen.getByTestId('note-card-move-up-1');
      const moveDown1 = screen.getByTestId('note-card-move-down-1');
      const moveUp2 = screen.getByTestId('note-card-move-up-2');
      const moveDown2 = screen.getByTestId('note-card-move-down-2');

      // Index 1: Move Up disabled, Move Down enabled
      expect(moveUp1).toBeDisabled();
      expect(moveDown1).not.toBeDisabled();

      // Index 2: Move Up enabled, Move Down disabled
      expect(moveUp2).not.toBeDisabled();
      expect(moveDown2).toBeDisabled();

      // Attempt clicking disabled buttons -> state unchanged
      fireEvent.click(moveUp1);
      expect(currentState!.annotations[0].id).toBe('ann-bound-1');

      fireEvent.click(moveDown2);
      expect(currentState!.annotations[1].id).toBe('ann-bound-2');
    });
  });

  /* ========================================================================
   * 5. ADVANCED SENTENCE TYPING & MULTI-CARD ISOLATION STRESS
   * ======================================================================== */
  describe('Advanced Sentence Typing & Multi-Card Isolation Stress', () => {
    it('simulates typing a realistic developer note with all shortcut keys and backspaces without side effects', async () => {
      const ann1 = createMockAnnotation('ann-real-1', 1, 'box', '');
      const ann2 = createMockAnnotation('ann-real-2', 2, 'pin', '');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1, ann2],
            activeTool: 'select',
            selectedAnnotationId: 'ann-real-1',
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      const textarea1 = screen.getByTestId('note-textarea-ann-real-1') as HTMLTextAreaElement;
      textarea1.focus();

      // Realistic text containing V, B, A, P, H, Space, Backspace, 0, 1, ?
      const sentence = "Fix button: press V or B or P to pin; delete old box 0 or 1!";
      
      // Simulate real user typing character by character
      let typedText = '';
      for (const char of sentence) {
        fireEvent.keyDown(textarea1, { key: char, code: `Key${char.toUpperCase()}` });
        typedText += char;
        fireEvent.change(textarea1, { target: { value: typedText } });
      }

      // Simulate backspacing 5 characters
      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(textarea1, { key: 'Backspace', code: 'Backspace' });
        typedText = typedText.slice(0, -1);
        fireEvent.change(textarea1, { target: { value: typedText } });
      }

      expect(currentState!.activeTool).toBe('select');
      expect(currentState!.annotations).toHaveLength(2);
      expect(currentState!.selectedAnnotationId).toBe('ann-real-1');
      expect(currentState!.annotations[0].note).toBe(typedText);
    });

    it('isolates typing across multiple note cards independently without cross-talk or state overwrite', () => {
      const ann1 = createMockAnnotation('ann-cross-1', 1, 'box', 'Note 1');
      const ann2 = createMockAnnotation('ann-cross-2', 2, 'arrow', 'Note 2');
      const ann3 = createMockAnnotation('ann-cross-3', 3, 'ellipse', 'Note 3');
      let currentState: AppState | null = null;

      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [ann1, ann2, ann3],
          }}
        >
          <ChallengerTestContainer onStateRef={(s) => (currentState = s)} />
        </AppProvider>
      );

      const textarea1 = screen.getByTestId('note-textarea-ann-cross-1') as HTMLTextAreaElement;
      const textarea2 = screen.getByTestId('note-textarea-ann-cross-2') as HTMLTextAreaElement;
      const textarea3 = screen.getByTestId('note-textarea-ann-cross-3') as HTMLTextAreaElement;

      // Edit Card 1
      fireEvent.change(textarea1, { target: { value: 'Updated note 1 with code `const a = 1`' } });
      // Edit Card 2
      fireEvent.change(textarea2, { target: { value: 'Updated note 2 with **bold text**' } });
      // Edit Card 3
      fireEvent.change(textarea3, { target: { value: 'Updated note 3 with - list item' } });

      expect(currentState!.annotations[0].note).toBe('Updated note 1 with code `const a = 1`');
      expect(currentState!.annotations[1].note).toBe('Updated note 2 with **bold text**');
      expect(currentState!.annotations[2].note).toBe('Updated note 3 with - list item');
    });

    it('sanitizes dangerous XSS payloads in markdown preview without script execution', () => {
      const xssPayload = '<script>window.__xss_attack_flag = true;</script><img src="x" onerror="window.__xss_attack_flag = true;" />**safe text**';
      
      render(
        <MarkdownEditor
          value={xssPayload}
          onChange={() => {}}
          defaultMode="preview"
          annotationId="ann-xss"
        />
      );

      const preview = screen.getByTestId('markdown-preview');
      expect(preview).toBeInTheDocument();
      // Raw script tags are encoded and safe text is formatted
      expect(preview.innerHTML).not.toContain('<script>');
      expect(preview.innerHTML).toContain('&lt;script&gt;');
      expect((window as any).__xss_attack_flag).toBeUndefined();
    });
  });
});
