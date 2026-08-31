import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  ToastCard,
  ToastContainer,
  ToastProvider,
  useToast,
  ToastItem,
} from '../../src/components/export/ToastNotification';

describe('ToastNotification Component Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ToastCard Rendering & Variants', () => {
    it('renders success toast with title, description, and emerald icon', () => {
      const mockDismiss = vi.fn();
      const toast: ToastItem = {
        id: 't-1',
        type: 'success',
        message: 'Copied image to clipboard!',
        description: 'Ready to paste into markdown',
        createdAt: 100,
      };

      render(<ToastCard toast={toast} onDismiss={mockDismiss} />);

      expect(screen.getByTestId('toast-item')).toBeInTheDocument();
      expect(screen.getByTestId('toast-message')).toHaveTextContent('Copied image to clipboard!');
      expect(screen.getByTestId('toast-description')).toHaveTextContent('Ready to paste into markdown');
      expect(screen.getByTestId('toast-icon-success')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders error toast with role=alert and assertive live region', () => {
      const mockDismiss = vi.fn();
      const toast: ToastItem = {
        id: 't-2',
        type: 'error',
        message: 'Failed to copy image',
        createdAt: 100,
      };

      render(<ToastCard toast={toast} onDismiss={mockDismiss} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('toast-icon-error')).toBeInTheDocument();
      expect(screen.getByTestId('toast-message')).toHaveTextContent('Failed to copy image');
    });

    it('renders warning and info toast variants properly', () => {
      const mockDismiss = vi.fn();
      const warningToast: ToastItem = {
        id: 't-3',
        type: 'warning',
        message: 'Fallback download used',
        createdAt: 100,
      };
      const infoToast: ToastItem = {
        id: 't-4',
        type: 'info',
        message: 'Shortcut: Cmd+C',
        createdAt: 100,
      };

      const { rerender } = render(<ToastCard toast={warningToast} onDismiss={mockDismiss} />);
      expect(screen.getByTestId('toast-icon-warning')).toBeInTheDocument();

      rerender(<ToastCard toast={infoToast} onDismiss={mockDismiss} />);
      expect(screen.getByTestId('toast-icon-info')).toBeInTheDocument();
    });

    it('renders action button and triggers callback when clicked', () => {
      const mockDismiss = vi.fn();
      const mockAction = vi.fn();
      const toast: ToastItem = {
        id: 't-5',
        type: 'info',
        message: 'Export ready',
        action: { label: 'Open File', onClick: mockAction },
        createdAt: 100,
      };

      render(<ToastCard toast={toast} onDismiss={mockDismiss} />);
      const actionBtn = screen.getByTestId('toast-action-btn');
      expect(actionBtn).toHaveTextContent('Open File');

      fireEvent.click(actionBtn);
      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(mockDismiss).toHaveBeenCalledWith('t-5');
    });

    it('dismisses toast when close button is clicked', () => {
      const mockDismiss = vi.fn();
      const toast: ToastItem = {
        id: 't-6',
        type: 'success',
        message: 'Saved',
        createdAt: 100,
      };

      render(<ToastCard toast={toast} onDismiss={mockDismiss} />);
      const closeBtn = screen.getByTestId('toast-close-btn');

      fireEvent.click(closeBtn);
      expect(mockDismiss).toHaveBeenCalledWith('t-6');
    });

    it('renders ToastContainer standalone with provided toasts and onDismiss', () => {
      const mockDismiss = vi.fn();
      const toastList: ToastItem[] = [
        { id: 't-c-1', type: 'info', message: 'Container toast', createdAt: 100 },
      ];

      render(<ToastContainer toasts={toastList} onDismiss={mockDismiss} />);
      expect(screen.getByTestId('toast-container')).toBeInTheDocument();
      expect(screen.getByTestId('toast-message')).toHaveTextContent('Container toast');
    });
  });

  describe('Timer Lifecycle & Pause on Hover', () => {
    it('automatically dismisses toast after specified duration', () => {
      const mockDismiss = vi.fn();
      const toast: ToastItem = {
        id: 't-timer-1',
        type: 'success',
        message: 'Auto dismiss',
        duration: 3000,
        createdAt: 100,
      };

      render(<ToastCard toast={toast} onDismiss={mockDismiss} />);

      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(mockDismiss).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(mockDismiss).toHaveBeenCalledWith('t-timer-1');
    });

    it('pauses timer on mouseEnter and resumes on mouseLeave', () => {
      const mockDismiss = vi.fn();
      const toast: ToastItem = {
        id: 't-hover-1',
        type: 'info',
        message: 'Hoverable toast',
        duration: 3000,
        createdAt: 100,
      };

      render(<ToastCard toast={toast} onDismiss={mockDismiss} />);
      const item = screen.getByTestId('toast-item');

      // Advance 1000ms
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Hover
      fireEvent.mouseEnter(item);

      // Advance 5000ms while hovered
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(mockDismiss).not.toHaveBeenCalled();

      // Mouse leave -> remaining time is ~2000ms
      fireEvent.mouseLeave(item);

      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(mockDismiss).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(5);
      });
      expect(mockDismiss).toHaveBeenCalledWith('t-hover-1');
    });
  });

  describe('ToastProvider and useToast Integration', () => {
    const TestComponent: React.FC = () => {
      const toast = useToast();

      return (
        <div>
          <button
            data-testid="trigger-success"
            onClick={() => toast.success('Success message', 'Extra details')}
          >
            Trigger Success
          </button>
          <button
            data-testid="trigger-error"
            onClick={() => toast.error('Error message')}
          >
            Trigger Error
          </button>
          <button
            data-testid="trigger-clear"
            onClick={() => toast.clearAllToasts()}
          >
            Clear All
          </button>
        </div>
      );
    };

    it('dispatches toasts via hook and renders inside ToastContainer', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.queryByTestId('toast-container')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('trigger-success'));
      expect(screen.getByTestId('toast-container')).toBeInTheDocument();
      expect(screen.getByTestId('toast-message')).toHaveTextContent('Success message');
      expect(screen.getByTestId('toast-description')).toHaveTextContent('Extra details');

      fireEvent.click(screen.getByTestId('trigger-error'));
      const items = screen.getAllByTestId('toast-item');
      expect(items).toHaveLength(2);

      fireEvent.click(screen.getByTestId('trigger-clear'));
      expect(screen.queryByTestId('toast-container')).not.toBeInTheDocument();
    });
  });
});
