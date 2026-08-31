import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AppProvider } from '../../src/state/AppContext';
import { NoteCard } from '../../src/components/sidebar/NoteCard';
import { Annotation, AppState } from '../../src/types';

const mockAnnotation: Annotation = {
  id: 'ann-101',
  index: 1,
  geometry: {
    type: 'box',
    x: 120,
    y: 150,
    width: 250,
    height: 180,
  },
  style: {
    color: 'amber',
    strokeWidth: 3,
    fillOpacity: 0.18,
  },
  note: 'Inspect layout alignment on mobile devices',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const renderWithContext = (
  ui: React.ReactNode,
  initialState?: Partial<AppState>
) => {
  return render(
    <AppProvider initialState={initialState}>
      {ui}
    </AppProvider>
  );
};

describe('NoteCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Visual Metadata & Header Rendering', () => {
    it('renders sequence badge with matching preset color and index number', () => {
      renderWithContext(
        <NoteCard annotation={mockAnnotation} index={1} totalCount={3} />
      );

      const badge = screen.getByTestId('note-card-badge-1');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('1');
      expect(badge.style.backgroundColor).toBe('rgb(245, 158, 11)'); // Amber hex #F59E0B
    });

    it('renders shape type tag for Box, Circle, Arrow, and Pin with correct icons', () => {
      const { rerender } = renderWithContext(
        <NoteCard annotation={mockAnnotation} index={1} totalCount={3} />
      );
      expect(screen.getByTestId('note-card-type-ann-101')).toHaveTextContent('Box');

      // Ellipse -> Circle
      rerender(
        <AppProvider>
          <NoteCard
            annotation={{ ...mockAnnotation, geometry: { type: 'ellipse', cx: 50, cy: 50, rx: 20, ry: 20 } }}
            index={1}
            totalCount={3}
          />
        </AppProvider>
      );
      expect(screen.getByTestId('note-card-type-ann-101')).toHaveTextContent('Circle');

      // Arrow
      rerender(
        <AppProvider>
          <NoteCard
            annotation={{ ...mockAnnotation, geometry: { type: 'arrow', startX: 0, startY: 0, endX: 50, endY: 50 } }}
            index={1}
            totalCount={3}
          />
        </AppProvider>
      );
      expect(screen.getByTestId('note-card-type-ann-101')).toHaveTextContent('Arrow');

      // Pin
      rerender(
        <AppProvider>
          <NoteCard
            annotation={{ ...mockAnnotation, geometry: { type: 'pin', x: 100, y: 100 } }}
            index={1}
            totalCount={3}
          />
        </AppProvider>
      );
      expect(screen.getByTestId('note-card-type-ann-101')).toHaveTextContent('Pin');
    });

    it('renders formatted timestamp', () => {
      renderWithContext(
        <NoteCard annotation={mockAnnotation} index={1} totalCount={3} />
      );
      const timeElem = screen.getByTestId('note-card-time-ann-101');
      expect(timeElem).toBeInTheDocument();
    });
  });

  describe('2. Reordering & Deletion Actions', () => {
    it('disables Move Up on first item and enables Move Down', () => {
      renderWithContext(
        <NoteCard annotation={mockAnnotation} index={1} totalCount={3} />
      );
      expect(screen.getByTestId('note-card-move-up-1')).toBeDisabled();
      expect(screen.getByTestId('note-card-move-down-1')).not.toBeDisabled();
    });

    it('disables Move Down on last item and enables Move Up', () => {
      renderWithContext(
        <NoteCard annotation={mockAnnotation} index={3} totalCount={3} />
      );
      expect(screen.getByTestId('note-card-move-up-3')).not.toBeDisabled();
      expect(screen.getByTestId('note-card-move-down-3')).toBeDisabled();
    });

    it('triggers onMoveUp and onMoveDown callbacks with 0-based index', async () => {
      const user = userEvent.setup();
      const onMoveUp = vi.fn();
      const onMoveDown = vi.fn();

      renderWithContext(
        <NoteCard
          annotation={mockAnnotation}
          index={2}
          totalCount={3}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      );

      await user.click(screen.getByTestId('note-card-move-up-2'));
      expect(onMoveUp).toHaveBeenCalledWith(1); // 2 - 1 = 1

      await user.click(screen.getByTestId('note-card-move-down-2'));
      expect(onMoveDown).toHaveBeenCalledWith(1);
    });

    it('triggers onDelete callback when delete button is clicked', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();

      renderWithContext(
        <NoteCard
          annotation={mockAnnotation}
          index={1}
          totalCount={3}
          onDelete={onDelete}
        />
      );

      await user.click(screen.getByTestId('note-card-delete-1'));
      expect(onDelete).toHaveBeenCalledWith('ann-101');
    });
  });

  describe('3. Selection & Hover Highlighting', () => {
    it('applies selection ring styling when isSelected is true', () => {
      renderWithContext(
        <NoteCard annotation={mockAnnotation} index={1} totalCount={3} isSelected={true} />
      );
      const card = screen.getByTestId('note-card-ann-101');
      expect(card.className).toContain('ring-amber-500');
    });

    it('triggers onSelect when card header is clicked', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      renderWithContext(
        <NoteCard
          annotation={mockAnnotation}
          index={1}
          totalCount={3}
          onSelect={onSelect}
        />
      );

      await user.click(screen.getByTestId('note-card-header-ann-101'));
      expect(onSelect).toHaveBeenCalledWith('ann-101');
    });

    it('triggers onHover on pointer enter and pointer leave', () => {
      const onHover = vi.fn();
      renderWithContext(
        <NoteCard
          annotation={mockAnnotation}
          index={1}
          totalCount={3}
          onHover={onHover}
        />
      );

      const card = screen.getByTestId('note-card-ann-101');
      fireEvent.pointerEnter(card);
      expect(onHover).toHaveBeenCalledWith('ann-101');

      fireEvent.pointerLeave(card);
      expect(onHover).toHaveBeenCalledWith(null);
    });
  });

  describe('4. Note Editor Integration', () => {
    it('renders initial markdown note text and triggers onNoteChange on edit', async () => {
      const user = userEvent.setup();
      const onNoteChange = vi.fn();

      renderWithContext(
        <NoteCard
          annotation={mockAnnotation}
          index={1}
          totalCount={3}
          onNoteChange={onNoteChange}
        />
      );

      const textarea = screen.getByTestId('note-textarea-ann-101');
      expect(textarea).toHaveValue('Inspect layout alignment on mobile devices');

      await user.type(textarea, ' - urgent');
      expect(onNoteChange).toHaveBeenCalled();
    });
  });
});
