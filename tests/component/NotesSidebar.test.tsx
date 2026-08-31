import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotesSidebar } from '../../src/components/sidebar/NotesSidebar';
import { AppProvider } from '../../src/state/AppContext';
import { Annotation } from '../../src/types';

describe('NotesSidebar Component Test Suite', () => {
  const sampleBox: Annotation = {
    id: 'ann_1',
    index: 1,
    geometry: { type: 'box', x: 100, y: 100, width: 200, height: 150 },
    style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
    note: 'Initial note for annotation 1',
    createdAt: 1000,
    updatedAt: 1000,
  };

  const sampleArrow: Annotation = {
    id: 'ann_2',
    index: 2,
    geometry: { type: 'arrow', startX: 50, startY: 50, endX: 300, endY: 300 },
    style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
    note: 'Second note for annotation 2',
    createdAt: 2000,
    updatedAt: 2000,
  };

  const samplePin: Annotation = {
    id: 'ann_3',
    index: 3,
    geometry: { type: 'pin', x: 400, y: 500 },
    style: { color: 'green', strokeWidth: 3, fillOpacity: 0.15 },
    note: 'Third note for annotation 3',
    createdAt: 3000,
    updatedAt: 3000,
  };

  describe('Suite 1: Header, Container & Badge Count', () => {
    it('T1.1: Renders sidebar container, header, title, and count badge', () => {
      render(
        <AppProvider initialState={{ annotations: [sampleBox, sampleArrow], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      expect(screen.getByTestId('notes-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-header')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-title')).toHaveTextContent('Annotation Notes');
      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('2');
    });

    it('T1.2: Updates badge count indicator when annotations list changes', () => {
      const { rerender } = render(
        <AppProvider key="sidebar-test-1" initialState={{ annotations: [sampleBox], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );
      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('1');

      rerender(
        <AppProvider key="sidebar-test-2" initialState={{ annotations: [sampleBox, sampleArrow, samplePin], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );
      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('3');
    });
  });

  describe('Suite 2: Collapsible Sidebar Interactions', () => {
    it('T2.1: Renders collapsed rail with expand button when isSidebarOpen is false', () => {
      render(
        <AppProvider initialState={{ annotations: [sampleBox], isSidebarOpen: false }}>
          <NotesSidebar />
        </AppProvider>
      );

      expect(screen.getByTestId('notes-sidebar-collapsed')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-expand-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('notes-sidebar')).not.toBeInTheDocument();
    });

    it('T2.2: Clicking collapse button toggles sidebar closed', async () => {
      const user = userEvent.setup();
      render(
        <AppProvider initialState={{ annotations: [sampleBox], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      const collapseBtn = screen.getByTestId('sidebar-collapse-btn');
      await user.click(collapseBtn);

      expect(screen.getByTestId('notes-sidebar-collapsed')).toBeInTheDocument();
    });

    it('T2.3: Clicking expand button in collapsed state restores full sidebar', async () => {
      const user = userEvent.setup();
      render(
        <AppProvider initialState={{ annotations: [sampleBox], isSidebarOpen: false }}>
          <NotesSidebar />
        </AppProvider>
      );

      const expandBtn = screen.getByTestId('sidebar-expand-btn');
      await user.click(expandBtn);

      expect(screen.getByTestId('notes-sidebar')).toBeInTheDocument();
    });
  });

  describe('Suite 3: Empty State Display', () => {
    it('T3.1: Displays empty state placeholder when annotations list is empty', () => {
      render(
        <AppProvider initialState={{ annotations: [], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      expect(screen.getByTestId('sidebar-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-empty-icon')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-empty-title')).toHaveTextContent('No annotations yet');
      expect(screen.getByTestId('sidebar-empty-description')).toHaveTextContent('Select a tool (Box, Circle, Arrow, Pin)');
      expect(screen.queryByTestId('sidebar-notes-list')).not.toBeInTheDocument();
    });

    it('T3.2: Replaces empty state with notes list once an annotation exists', () => {
      const { rerender } = render(
        <AppProvider key="empty-test-1" initialState={{ annotations: [], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );
      expect(screen.getByTestId('sidebar-empty-state')).toBeInTheDocument();

      rerender(
        <AppProvider key="empty-test-2" initialState={{ annotations: [sampleBox], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );
      expect(screen.queryByTestId('sidebar-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('sidebar-notes-list')).toBeInTheDocument();
    });
  });

  describe('Suite 4: Reordering & Boundary Disabling', () => {
    it('T4.1: Move Up button on first card (index 1) is disabled', () => {
      render(
        <AppProvider initialState={{ annotations: [sampleBox, sampleArrow, samplePin], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      const moveUpFirst = screen.getByTestId('note-card-move-up-1');
      expect(moveUpFirst).toBeDisabled();

      const moveDownFirst = screen.getByTestId('note-card-move-down-1');
      expect(moveDownFirst).not.toBeDisabled();
    });

    it('T4.2: Move Down button on last card (index 3) is disabled', () => {
      render(
        <AppProvider initialState={{ annotations: [sampleBox, sampleArrow, samplePin], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      const moveDownLast = screen.getByTestId('note-card-move-down-3');
      expect(moveDownLast).toBeDisabled();

      const moveUpLast = screen.getByTestId('note-card-move-up-3');
      expect(moveUpLast).not.toBeDisabled();
    });

    it('T4.3: Both Move Up and Move Down are enabled on intermediate cards', () => {
      render(
        <AppProvider initialState={{ annotations: [sampleBox, sampleArrow, samplePin], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      expect(screen.getByTestId('note-card-move-up-2')).not.toBeDisabled();
      expect(screen.getByTestId('note-card-move-down-2')).not.toBeDisabled();
    });

    it('T4.4: Both Move Up and Move Down are disabled when only one annotation exists', () => {
      render(
        <AppProvider initialState={{ annotations: [sampleBox], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      expect(screen.getByTestId('note-card-move-up-1')).toBeDisabled();
      expect(screen.getByTestId('note-card-move-down-1')).toBeDisabled();
    });

    it('T4.5: Clicking Move Down on first card moves it down and dynamically reindexes 1..N', async () => {
      const user = userEvent.setup();
      render(
        <AppProvider initialState={{ annotations: [sampleBox, sampleArrow, samplePin], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      const moveDownBtn = screen.getByTestId('note-card-move-down-1');
      await user.click(moveDownBtn);

      const cards = screen.getAllByTestId(/^note-card-ann_/);
      expect(cards[0]).toHaveAttribute('data-annotation-id', 'ann_2');
      expect(cards[1]).toHaveAttribute('data-annotation-id', 'ann_1');
      expect(cards[2]).toHaveAttribute('data-annotation-id', 'ann_3');

      // Verify sequence badge reindexing
      expect(screen.getByTestId('card-badge-ann_2')).toHaveTextContent('1');
      expect(screen.getByTestId('card-badge-ann_1')).toHaveTextContent('2');
      expect(screen.getByTestId('card-badge-ann_3')).toHaveTextContent('3');
    });

    it('T4.6: Clicking Move Up on second card swaps position and updates sequence numbers', async () => {
      const user = userEvent.setup();
      render(
        <AppProvider initialState={{ annotations: [sampleBox, sampleArrow], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      const moveUpBtn = screen.getByTestId('note-card-move-up-2');
      await user.click(moveUpBtn);

      const cards = screen.getAllByTestId(/^note-card-ann_/);
      expect(cards[0]).toHaveAttribute('data-annotation-id', 'ann_2');
      expect(cards[1]).toHaveAttribute('data-annotation-id', 'ann_1');

      expect(screen.getByTestId('card-badge-ann_2')).toHaveTextContent('1');
      expect(screen.getByTestId('card-badge-ann_1')).toHaveTextContent('2');
    });
  });

  describe('Suite 5: Single-Click Deletion & Re-indexing', () => {
    it('T5.1: Clicking delete button removes annotation immediately and renumbers remaining items', async () => {
      const user = userEvent.setup();
      render(
        <AppProvider initialState={{ annotations: [sampleBox, sampleArrow, samplePin], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      const deleteBtn = screen.getByTestId('note-card-delete-1');
      await user.click(deleteBtn);

      expect(screen.queryByTestId('note-card-ann_1')).not.toBeInTheDocument();
      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('2');

      // Remaining items re-indexed to 1 and 2
      expect(screen.getByTestId('card-badge-ann_2')).toHaveTextContent('1');
      expect(screen.getByTestId('card-badge-ann_3')).toHaveTextContent('2');
    });

    it('T5.2: Deleting all annotations transitions view to empty state', async () => {
      const user = userEvent.setup();
      render(
        <AppProvider initialState={{ annotations: [sampleBox], isSidebarOpen: true }}>
          <NotesSidebar />
        </AppProvider>
      );

      const deleteBtn = screen.getByTestId('note-card-delete-1');
      await user.click(deleteBtn);

      expect(screen.getByTestId('sidebar-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('0');
    });
  });
});
