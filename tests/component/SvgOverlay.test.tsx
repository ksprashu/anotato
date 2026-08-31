import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '../../src/state/AppContext';
import { SvgOverlay } from '../../src/components/canvas/SvgOverlay';
import { AppState, BaseImage } from '../../src/types';

const mockBaseImage: BaseImage = {
  id: 'img_test_overlay',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1000,
  naturalHeight: 800,
  fileName: 'screenshot.png',
  fileSize: 50000,
};

const renderOverlay = (initialState?: Partial<AppState>) => {
  return render(
    <AppProvider initialState={initialState}>
      <SvgOverlay />
    </AppProvider>
  );
};

describe('SvgOverlay Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('Canvas Dimension Invariants & Empty State', () => {
    it('returns null when image is null', () => {
      renderOverlay({ image: null });
      expect(screen.queryByTestId('svg-overlay')).not.toBeInTheDocument();
    });

    it('renders SVG with exact natural dimensions and viewBox', () => {
      renderOverlay({ image: mockBaseImage });
      const svg = screen.getByTestId('svg-overlay');
      expect(svg).toBeInTheDocument();
      expect(svg.getAttribute('width')).toBe('1000');
      expect(svg.getAttribute('height')).toBe('800');
      expect(svg.getAttribute('viewBox')).toBe('0 0 1000 800');
    });
  });

  describe('Interactive Bounding Box Drawing', () => {
    it('draws a bounding box on drag and renders live draft preview', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'box',
      });
      const svg = screen.getByTestId('svg-overlay');

      // Pointer down
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      // Pointer move
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 300, clientY: 250 });

      // Draft preview should be visible
      const boxShape = screen.getByTestId('shape-box');
      expect(boxShape).toBeInTheDocument();

      // Pointer up
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 250 });

      // Shape is finalized
      expect(screen.getByTestId('shape-box')).toBeInTheDocument();
      const badge = screen.getByTestId('shape-badge');
      expect(badge.textContent).toBe('1');
    });

    it('constrains bounding box to a 1:1 square when Shift key is held', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'box',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 300, clientY: 200, shiftKey: true });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 200, shiftKey: true });

      const rect = screen.getByTestId('shape-box').querySelector('rect:not([fill="none"])');
      expect(rect?.getAttribute('width')).toBe(rect?.getAttribute('height'));
    });
  });

  describe('Interactive Ellipse Drawing', () => {
    it('draws an ellipse with center cx, cy and radiuses rx, ry', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'ellipse',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 300, clientY: 200 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 200 });

      const ellipse = screen.getByTestId('shape-ellipse').querySelector('ellipse:not([fill="none"])');
      expect(ellipse).toBeInTheDocument();
      expect(ellipse?.getAttribute('cx')).toBe('200');
      expect(ellipse?.getAttribute('cy')).toBe('150');
      expect(ellipse?.getAttribute('rx')).toBe('100');
      expect(ellipse?.getAttribute('ry')).toBe('50');
    });
  });

  describe('Interactive Directional Arrow Drawing', () => {
    it('draws an arrow with shaft line, 30-deg arrowhead wings, and tail badge', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'arrow',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 250, clientY: 150 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 250, clientY: 150 });

      const arrow = screen.getByTestId('shape-arrow');
      expect(arrow).toBeInTheDocument();
      const line = arrow.querySelector('line');
      expect(line).toBeInTheDocument();
      const path = arrow.querySelector('path');
      expect(path).toBeInTheDocument();
      const badge = arrow.querySelector('[data-testid="shape-badge"]');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Interactive Callout Pin Drawing', () => {
    it('creates a pin annotation at target point on click', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'pin',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 400, clientY: 300 });

      const pin = screen.getByTestId('shape-pin');
      expect(pin).toBeInTheDocument();
      expect(pin.textContent).toBe('1');
    });
  });

  describe('Sequential Numbering Invariant (1..N)', () => {
    it('auto-increments sequential badges #1, #2, #3 across consecutive creations', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'box',
      });
      const svg = screen.getByTestId('svg-overlay');

      // Draw Box #1
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 150, clientY: 150 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 150, clientY: 150 });

      // Draw Box #2
      fireEvent.pointerDown(svg, { button: 0, pointerId: 2, clientX: 200, clientY: 50 });
      fireEvent.pointerMove(svg, { pointerId: 2, clientX: 300, clientY: 150 });
      fireEvent.pointerUp(svg, { pointerId: 2, clientX: 300, clientY: 150 });

      const badges = screen.getAllByTestId('shape-badge');
      expect(badges).toHaveLength(2);
      expect(badges[0].textContent).toBe('1');
      expect(badges[1].textContent).toBe('2');
    });
  });

  describe('Micro-drag Jitter Rejection', () => {
    it('ignores zero-size micro clicks for box/ellipse/arrow', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'box',
      });
      const svg = screen.getByTestId('svg-overlay');

      // Accidental 1px jitter click
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 101, clientY: 101 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 101, clientY: 101 });

      expect(screen.queryByTestId('shape-box')).not.toBeInTheDocument();
    });
  });

  describe('Selection & Deselection Interactions', () => {
    it('selects an annotation on click in select tool mode and deselects on background click', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'select',
        annotations: [
          {
            id: 'ann-1',
            index: 1,
            geometry: { type: 'box', x: 100, y: 100, width: 200, height: 100 },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: 'Test note',
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });

      const box = screen.getByTestId('shape-box');
      fireEvent.click(box);

      // Transform handles appear when selected
      expect(screen.getByTestId('transform-handles')).toBeInTheDocument();

      // Click background
      const bgCatcher = screen.getByTestId('canvas-background-catcher');
      fireEvent.click(bgCatcher);
      expect(screen.queryByTestId('transform-handles')).not.toBeInTheDocument();
    });
  });
});
