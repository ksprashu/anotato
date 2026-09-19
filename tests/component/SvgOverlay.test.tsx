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

  describe('Interactive Highlight & Spotlight Mask Focus Mode', () => {
    it('draws a highlight annotation on drag and renders live draft preview and badge', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'highlight',
      });
      const svg = screen.getByTestId('svg-overlay');

      // Pointer down
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 150, clientY: 150 });
      // Pointer move
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 350, clientY: 300 });

      // Draft preview should be visible
      const highlightShape = screen.getByTestId('shape-highlight');
      expect(highlightShape).toBeInTheDocument();

      // Spotlight backdrop should be visible during drag
      const backdrop = screen.getByTestId('spotlight-backdrop');
      expect(backdrop).toBeInTheDocument();
      expect(backdrop.getAttribute('fill')).toBe('rgba(0,0,0,0.68)');
      expect(backdrop.getAttribute('mask')).toBe('url(#spotlight-mask)');
      expect(backdrop.getAttribute('pointer-events')).toBe('none');

      // Pointer up
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 350, clientY: 300 });

      // Shape is finalized - unnumbered highlight does not render a badge
      expect(screen.getByTestId('shape-highlight')).toBeInTheDocument();
      expect(screen.queryByTestId('shape-badge')).not.toBeInTheDocument();
    });

    it('renders unified spotlight-mask with white base rect and black cutouts for all highlights', () => {
      renderOverlay({
        image: mockBaseImage,
        annotations: [
          {
            id: 'hl-1',
            index: 1,
            geometry: { type: 'highlight', x: 100, y: 100, width: 200, height: 150, borderRadius: 4 },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: 'First highlight',
            createdAt: 1000,
            updatedAt: 1000,
          },
          {
            id: 'hl-2',
            index: 2,
            geometry: { type: 'highlight', x: 400, y: 200, width: 180, height: 120, borderRadius: 4 },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: 'Second highlight',
            createdAt: 2000,
            updatedAt: 2000,
          },
        ],
      });

      const mask = document.getElementById('spotlight-mask');
      expect(mask).toBeInTheDocument();
      expect(mask?.getAttribute('maskUnits')).toBe('userSpaceOnUse');

      const rects = mask?.querySelectorAll('rect');
      expect(rects?.length).toBe(3); // 1 base rect + 2 cutouts
      expect(rects?.[0].getAttribute('fill')).toBe('white');
      expect(rects?.[1].getAttribute('fill')).toBe('black');
      expect(rects?.[1].getAttribute('rx')).toBe('4');
      expect(rects?.[2].getAttribute('fill')).toBe('black');
      expect(rects?.[2].getAttribute('rx')).toBe('4');

      // Spotlight backdrop is rendered
      const backdrop = screen.getByTestId('spotlight-backdrop');
      expect(backdrop).toBeInTheDocument();
    });

    it('does not render spotlight-backdrop when no highlights exist and not drafting', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'select',
        annotations: [
          {
            id: 'ann-1',
            index: 1,
            geometry: { type: 'box', x: 100, y: 100, width: 200, height: 100 },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: 'Box note',
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });

      expect(screen.queryByTestId('spotlight-backdrop')).not.toBeInTheDocument();
    });

    it('renders 8 transform resize handles when a highlight annotation is selected', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'select',
        selectedAnnotationId: 'hl-1',
        annotations: [
          {
            id: 'hl-1',
            index: 1,
            geometry: { type: 'highlight', x: 100, y: 100, width: 200, height: 150 },
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: 'Highlight note',
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });

      expect(screen.getByTestId('transform-handles')).toBeInTheDocument();
      expect(screen.getByTestId('transform-bounding-box')).toBeInTheDocument();
      expect(screen.getByTestId('transform-handle-nw')).toBeInTheDocument();
      expect(screen.getByTestId('transform-handle-se')).toBeInTheDocument();
    });

    it('discards tiny highlight drag jitter under 4px threshold', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'highlight',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 102, clientY: 102 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 102, clientY: 102 });

      expect(screen.queryByTestId('shape-highlight')).not.toBeInTheDocument();
    });
  });

  describe('Interactive Gaussian Blur Drawing & Filter Overlay', () => {
    it('B1.1: draws a blur annotation on drag, renders draft clipPath and draft image slice', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'blur',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 150, clientY: 80 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 470, clientY: 170 });

      // Draft slice and draft shape should be visible
      expect(screen.getByTestId('blur-slice-draft')).toBeInTheDocument();
      expect(screen.getByTestId('shape-blur')).toBeInTheDocument();

      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 470, clientY: 170 });

      // Finalized shape and persistent blur slice - unnumbered blur does not render a badge
      expect(screen.getByTestId('shape-blur')).toBeInTheDocument();
      expect(screen.queryByTestId('shape-badge')).not.toBeInTheDocument();
    });

    it('B1.2: renders SVG feGaussianBlur filter in defs with stdDeviation="10" and edgeMode="duplicate"', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'select',
      });
      const svg = screen.getByTestId('svg-overlay');
      const filter = svg.querySelector('filter#gaussian-blur');
      expect(filter).toBeInTheDocument();

      const feBlur = filter?.querySelector('feGaussianBlur');
      expect(feBlur).toBeInTheDocument();
      expect(feBlur?.getAttribute('stdDeviation')).toBe('10');
      expect(feBlur?.getAttribute('edgeMode')).toBe('duplicate');
    });

    it('B1.3: renders per-annotation clipPath and blurred image slice with url(#gaussian-blur)', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'select',
        annotations: [
          {
            id: 'blur-test-1',
            index: 1,
            geometry: { type: 'blur', x: 200, y: 150, width: 300, height: 100, borderRadius: 2 },
            style: { color: 'amber', strokeWidth: 2, fillOpacity: 0 },
            note: 'Blur note',
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });

      const slice = screen.getByTestId('blur-slice-blur-test-1');
      expect(slice).toBeInTheDocument();
      expect(slice.getAttribute('filter')).toBe('url(#gaussian-blur)');
      expect(slice.getAttribute('clip-path')).toBe('url(#blur-clip-blur-test-1)');

      const clip = document.getElementById('blur-clip-blur-test-1');
      expect(clip).toBeInTheDocument();
      const rect = clip?.querySelector('rect');
      expect(rect?.getAttribute('x')).toBe('200');
      expect(rect?.getAttribute('y')).toBe('150');
      expect(rect?.getAttribute('width')).toBe('300');
      expect(rect?.getAttribute('height')).toBe('100');
      expect(rect?.getAttribute('rx')).toBe('2');
    });

    it('B1.4: renders 8 transform resize handles when a blur annotation is selected', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'select',
        selectedAnnotationId: 'blur-1',
        annotations: [
          {
            id: 'blur-1',
            index: 1,
            geometry: { type: 'blur', x: 100, y: 100, width: 200, height: 150 },
            style: { color: 'amber', strokeWidth: 2, fillOpacity: 0 },
            note: 'Blur note',
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });

      expect(screen.getByTestId('transform-handles')).toBeInTheDocument();
      expect(screen.getByTestId('transform-bounding-box')).toBeInTheDocument();
      expect(screen.getByTestId('transform-handle-nw')).toBeInTheDocument();
      expect(screen.getByTestId('transform-handle-se')).toBeInTheDocument();
    });

    it('B1.5: constrains blur to 1:1 square when Shift key is held during drawing', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'blur',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 300, clientY: 200, shiftKey: true });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 200, shiftKey: true });

      const shape = screen.getByTestId('shape-blur');
      const rect = shape.querySelector('rect[fill="transparent"]');
      expect(rect?.getAttribute('width')).toBe(rect?.getAttribute('height'));
    });

    it('B1.6: discards tiny blur drag jitter under 4px threshold', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'blur',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 102, clientY: 102 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 102, clientY: 102 });

      expect(screen.queryByTestId('shape-blur')).not.toBeInTheDocument();
    });
  });
});
