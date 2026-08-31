import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../../src/state/AppContext';
import { BadgeRenderer } from '../../src/components/canvas/BadgeRenderer';
import { Annotation, AppState } from '../../src/types';

const mockAnnotation: Annotation = {
  id: 'anno-1',
  index: 1,
  geometry: {
    type: 'box',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
  },
  style: {
    color: 'amber',
    strokeWidth: 3,
    fillOpacity: 0.18,
  },
  note: 'Test note',
  createdAt: 1000,
  updatedAt: 1000,
};

const renderWithContext = (
  ui: React.ReactNode,
  initialState?: Partial<AppState>
) => {
  return render(
    <AppProvider initialState={initialState}>
      <svg data-testid="test-svg-container">{ui}</svg>
    </AppProvider>
  );
};

describe('BadgeRenderer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Badge Geometry & Multi-Digit Pill Scaling', () => {
    it('renders circular badge for single digit index (1..9)', () => {
      renderWithContext(<BadgeRenderer annotation={mockAnnotation} />);

      const badge = screen.getByTestId('annotation-badge-1');
      expect(badge).toBeInTheDocument();

      const shape = screen.getByTestId('badge-shape-1');
      expect(shape.tagName.toLowerCase()).toBe('circle');
      expect(shape.getAttribute('r')).toBe('12');

      const text = screen.getByTestId('badge-text-1');
      expect(text.textContent).toBe('1');
    });

    it('renders pill badge with expanded width for double digit index (10..99)', () => {
      const doubleDigitAnno: Annotation = {
        ...mockAnnotation,
        index: 42,
      };
      renderWithContext(<BadgeRenderer annotation={doubleDigitAnno} />);

      const shape = screen.getByTestId('badge-shape-42');
      expect(shape.tagName.toLowerCase()).toBe('rect');
      expect(shape.getAttribute('width')).toBe('32');
      expect(shape.getAttribute('height')).toBe('24');
      expect(shape.getAttribute('rx')).toBe('12');

      const text = screen.getByTestId('badge-text-42');
      expect(text.textContent).toBe('42');
    });

    it('renders expanded pill badge for triple digit index (100+)', () => {
      const tripleDigitAnno: Annotation = {
        ...mockAnnotation,
        index: 105,
      };
      renderWithContext(<BadgeRenderer annotation={tripleDigitAnno} />);

      const shape = screen.getByTestId('badge-shape-105');
      expect(shape.tagName.toLowerCase()).toBe('rect');
      expect(shape.getAttribute('width')).toBe('40'); // 24 + 2 * 8
    });
  });

  describe('Shape-Specific Anchor Placement', () => {
    it('anchors badge at box top-left corner (x, y)', () => {
      renderWithContext(<BadgeRenderer annotation={mockAnnotation} />);
      const shape = screen.getByTestId('badge-shape-1');
      expect(shape.getAttribute('cx')).toBe('100');
      expect(shape.getAttribute('cy')).toBe('100');
    });

    it('anchors badge strictly at arrow tail (startX, startY), NOT arrowhead', () => {
      const arrowAnno: Annotation = {
        ...mockAnnotation,
        geometry: {
          type: 'arrow',
          startX: 50,
          startY: 60,
          endX: 300,
          endY: 400,
        },
      };
      renderWithContext(<BadgeRenderer annotation={arrowAnno} />);
      const shape = screen.getByTestId('badge-shape-1');
      expect(shape.getAttribute('cx')).toBe('50');
      expect(shape.getAttribute('cy')).toBe('60');
    });

    it('anchors badge at pin head circle center (x, y - 20)', () => {
      const pinAnno: Annotation = {
        ...mockAnnotation,
        geometry: {
          type: 'pin',
          x: 200,
          y: 300,
        },
      };
      renderWithContext(<BadgeRenderer annotation={pinAnno} />);
      const shape = screen.getByTestId('badge-shape-1');
      expect(shape.getAttribute('cx')).toBe('200');
      expect(shape.getAttribute('cy')).toBe('280');
    });
  });

  describe('Color Styling & High-Contrast Visuals', () => {
    it('applies preset color styling (Amber: badgeBg #F59E0B, badgeText #1E293B)', () => {
      renderWithContext(<BadgeRenderer annotation={mockAnnotation} />);
      const shape = screen.getByTestId('badge-shape-1');
      const text = screen.getByTestId('badge-text-1');

      expect(shape.getAttribute('fill')).toBe('#F59E0B');
      expect(shape.getAttribute('stroke')).toBe('#ffffff');
      expect(text.getAttribute('fill')).toBe('#1E293B');
    });

    it('applies preset color styling for Cyan (#06B6D4 with #FFFFFF text)', () => {
      const cyanAnno: Annotation = {
        ...mockAnnotation,
        style: { ...mockAnnotation.style, color: 'cyan' },
      };
      renderWithContext(<BadgeRenderer annotation={cyanAnno} />);
      const shape = screen.getByTestId('badge-shape-1');
      const text = screen.getByTestId('badge-text-1');

      expect(shape.getAttribute('fill')).toBe('#06B6D4');
      expect(text.getAttribute('fill')).toBe('#FFFFFF');
    });
  });

  describe('Interactive Feedback & Selection', () => {
    it('renders outer selection accent ring when annotation is selected', () => {
      renderWithContext(<BadgeRenderer annotation={mockAnnotation} isSelected={true} />);
      const ring = screen.getByTestId('badge-selection-ring-1');
      expect(ring).toBeInTheDocument();
      expect(ring.getAttribute('stroke')).toBe('#38bdf8');
    });

    it('applies scale transform when isHovered is true', () => {
      renderWithContext(<BadgeRenderer annotation={mockAnnotation} isHovered={true} />);
      const badge = screen.getByTestId('annotation-badge-1');
      expect(badge.style.transform).toBe('scale(1.15)');
    });

    it('dispatches select action when clicked', () => {
      const onClick = vi.fn();
      renderWithContext(<BadgeRenderer annotation={mockAnnotation} onClick={onClick} />);
      const badge = screen.getByTestId('annotation-badge-1');
      fireEvent.click(badge);
      expect(onClick).toHaveBeenCalled();
    });

    it('dispatches hover action on pointer enter and leave', () => {
      const onEnter = vi.fn();
      const onLeave = vi.fn();
      renderWithContext(
        <BadgeRenderer
          annotation={mockAnnotation}
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
        />
      );
      const badge = screen.getByTestId('annotation-badge-1');
      fireEvent.pointerEnter(badge);
      expect(onEnter).toHaveBeenCalled();

      fireEvent.pointerLeave(badge);
      expect(onLeave).toHaveBeenCalled();
    });
  });
});
