import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../../src/state/AppContext';
import { TransformHandles } from '../../src/components/canvas/TransformHandles';
import { Annotation, AppState } from '../../src/types';

const mockBoxAnnotation: Annotation = {
  id: 'anno-box-1',
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
    fillOpacity: 0.15,
  },
  note: 'Box Note',
  createdAt: 1000,
  updatedAt: 1000,
};

const mockArrowAnnotation: Annotation = {
  id: 'anno-arrow-1',
  index: 2,
  geometry: {
    type: 'arrow',
    startX: 50,
    startY: 60,
    endX: 250,
    endY: 180,
  },
  style: {
    color: 'cyan',
    strokeWidth: 3,
    fillOpacity: 1,
  },
  note: 'Arrow Note',
  createdAt: 1000,
  updatedAt: 1000,
};

const renderWithContext = (
  ui: React.ReactNode,
  initialState?: Partial<AppState>
) => {
  return render(
    <AppProvider initialState={initialState}>
      <svg data-testid="canvas-workspace-container">{ui}</svg>
    </AppProvider>
  );
};

describe('TransformHandles Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('8-Point Handles Rendering for Box', () => {
    it('renders bounding box and all 8 resize handles for Box geometry', () => {
      renderWithContext(<TransformHandles annotation={mockBoxAnnotation} />, {
        annotations: [mockBoxAnnotation],
        selectedAnnotationId: mockBoxAnnotation.id,
      });

      expect(screen.getByTestId('transform-bounding-box')).toBeInTheDocument();
      const handleIds = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      for (const id of handleIds) {
        expect(screen.getByTestId(`transform-handle-${id}`)).toBeInTheDocument();
        expect(screen.getByTestId(`transform-handle-hitarea-${id}`)).toBeInTheDocument();
      }
    });

    it('positions corner and edge handles accurately on box perimeter', () => {
      renderWithContext(<TransformHandles annotation={mockBoxAnnotation} />);
      const handleNW = screen.getByTestId('transform-handle-nw');
      const handleE = screen.getByTestId('transform-handle-e');
      const handleSE = screen.getByTestId('transform-handle-se');

      // Box x: 100..300, y: 100..250. Handle size is 8.
      // NW center at (100, 100) -> x = 100 - 4 = 96, y = 96
      expect(handleNW.getAttribute('x')).toBe('96');
      expect(handleNW.getAttribute('y')).toBe('96');

      // E center at (300, 175) -> x = 300 - 4 = 296, y = 175 - 4 = 171
      expect(handleE.getAttribute('x')).toBe('296');
      expect(handleE.getAttribute('y')).toBe('171');

      // SE center at (300, 250) -> x = 300 - 4 = 296, y = 250 - 4 = 246
      expect(handleSE.getAttribute('x')).toBe('296');
      expect(handleSE.getAttribute('y')).toBe('246');
    });

    it('applies correct cursor styles per handle direction', () => {
      renderWithContext(<TransformHandles annotation={mockBoxAnnotation} />);
      expect(screen.getByTestId('transform-handle-nw').style.cursor).toBe('nwse-resize');
      expect(screen.getByTestId('transform-handle-n').style.cursor).toBe('ns-resize');
      expect(screen.getByTestId('transform-handle-ne').style.cursor).toBe('nesw-resize');
      expect(screen.getByTestId('transform-handle-e').style.cursor).toBe('ew-resize');
    });
  });

  describe('Handle Rendering for Arrow & Pin', () => {
    it('renders exactly 2 endpoint handles (start and end) for Arrow geometry', () => {
      renderWithContext(<TransformHandles annotation={mockArrowAnnotation} />);

      expect(screen.getByTestId('transform-handle-start')).toBeInTheDocument();
      expect(screen.getByTestId('transform-handle-end')).toBeInTheDocument();
      expect(screen.queryByTestId('transform-handle-nw')).not.toBeInTheDocument();
      expect(screen.queryByTestId('transform-bounding-box')).not.toBeInTheDocument();
    });

    it('renders 1 handle for Pin geometry', () => {
      const pinAnno: Annotation = {
        ...mockBoxAnnotation,
        geometry: { type: 'pin', x: 200, y: 350 },
      };
      renderWithContext(<TransformHandles annotation={pinAnno} />);
      expect(screen.getByTestId('transform-handle-pin')).toBeInTheDocument();
    });
  });

  describe('Handle Drag Resizing Lifecycle', () => {
    it('triggers onGeometryChange and dispatches geometry update on handle drag', () => {
      const onGeometryChange = vi.fn();
      renderWithContext(
        <TransformHandles
          annotation={mockBoxAnnotation}
          onGeometryChange={onGeometryChange}
        />,
        {
          annotations: [mockBoxAnnotation],
          selectedAnnotationId: mockBoxAnnotation.id,
          viewport: { zoom: 1.0, panX: 0, panY: 0 },
        }
      );

      const handleSE = screen.getByTestId('transform-handle-se');
      const group = screen.getByTestId('transform-handles-group');

      // Pointer down on SE handle
      fireEvent.pointerDown(handleSE, {
        clientX: 300,
        clientY: 250,
        pointerId: 1,
      });

      // Pointer move
      fireEvent.pointerMove(group, {
        clientX: 350,
        clientY: 300,
        pointerId: 1,
      });

      expect(onGeometryChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'box',
          x: 100,
          y: 100,
          width: 250,
          height: 200,
        })
      );
    });

    it('commits transaction on pointerUp', () => {
      const onDragEnd = vi.fn();
      renderWithContext(
        <TransformHandles
          annotation={mockBoxAnnotation}
          onDragEnd={onDragEnd}
        />,
        {
          annotations: [mockBoxAnnotation],
          selectedAnnotationId: mockBoxAnnotation.id,
        }
      );

      const handleSE = screen.getByTestId('transform-handle-se');
      const group = screen.getByTestId('transform-handles-group');

      fireEvent.pointerDown(handleSE, { clientX: 300, clientY: 250, pointerId: 1 });
      fireEvent.pointerUp(group, { pointerId: 1 });

      expect(onDragEnd).toHaveBeenCalled();
    });
  });

  describe('Scale Invariance with Zoom', () => {
    it('scales handle size inversely with zoom factor to maintain visible target size', () => {
      const { rerender } = renderWithContext(
        <TransformHandles annotation={mockBoxAnnotation} zoom={0.5} />
      );
      let handleNW = screen.getByTestId('transform-handle-nw');
      // At zoom 0.5: handleSize = 8 / 0.5 = 16px
      expect(handleNW.getAttribute('width')).toBe('16');

      rerender(
        <AppProvider>
          <svg data-testid="canvas-workspace-container">
            <TransformHandles annotation={mockBoxAnnotation} zoom={2.0} />
          </svg>
        </AppProvider>
      );
      handleNW = screen.getByTestId('transform-handle-nw');
      // At zoom 2.0: handleSize = 8 / 2.0 = 4px
      expect(handleNW.getAttribute('width')).toBe('4');
    });
  });
});
