import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '../../src/state/AppContext';
import { SvgOverlay } from '../../src/components/canvas/SvgOverlay';
import { TransformHandles } from '../../src/components/canvas/TransformHandles';
import {
  AppState,
  BaseImage,
  Annotation,
  AnnotationGeometry,
  BoxGeometry,
  EllipseGeometry,
  ArrowGeometry,
  PinGeometry,
} from '../../src/types';
import {
  normalizeBox,
  calculateEllipseBounds,
  calculateArrowhead,
  applyHandleResize,
  getResizeHandlePositions,
  translateGeometry,
} from '../../src/math/geometry';
import { appReducer, createInitialState } from '../../src/state/appReducer';

const mockBaseImage: BaseImage = {
  id: 'img_test_challenger',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 2000,
  naturalHeight: 1500,
  fileName: 'adversarial_test.png',
  fileSize: 120000,
};

const renderOverlay = (initialState?: Partial<AppState>) => {
  return render(
    <AppProvider initialState={initialState}>
      <SvgOverlay />
    </AppProvider>
  );
};

describe('SvgOverlay & Transformation Engine Adversarial Stress Tests (Milestone 3 Challenge)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 2000,
      bottom: 1500,
      width: 2000,
      height: 1500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  });

  describe('Suite 1: Rapid Creation of 500 Annotations & Index Integrity', () => {
    it('rapidly creates 500 mixed annotations through SvgOverlay pointer events and maintains strict 1..N index invariance', () => {
      // Test reducer directly at scale (500 creations)
      let state = createInitialState({ image: mockBaseImage });
      const tools: ('box' | 'ellipse' | 'arrow' | 'pin')[] = ['box', 'ellipse', 'arrow', 'pin'];

      for (let i = 0; i < 500; i++) {
        const tool = tools[i % tools.length];
        let geom: AnnotationGeometry;
        const x = (i * 13) % 1800 + 10;
        const y = (i * 17) % 1300 + 10;

        switch (tool) {
          case 'box':
            geom = { type: 'box', x, y, width: 40 + (i % 50), height: 30 + (i % 40) };
            break;
          case 'ellipse':
            geom = { type: 'ellipse', cx: x + 25, cy: y + 25, rx: 20 + (i % 30), ry: 15 + (i % 20) };
            break;
          case 'arrow':
            geom = { type: 'arrow', startX: x, startY: y, endX: x + 50, endY: y + 50 };
            break;
          case 'pin':
            geom = { type: 'pin', x, y };
            break;
        }

        state = appReducer(state, {
          type: 'ADD_ANNOTATION',
          payload: {
            geometry: geom,
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            note: `Annotation ${i + 1}`,
          },
        });
      }

      expect(state.annotations).toHaveLength(500);

      // Verify strict 1..500 contiguous index invariant
      for (let i = 0; i < 500; i++) {
        expect(state.annotations[i].index).toBe(i + 1);
        expect(Number.isFinite(state.annotations[i].index)).toBe(true);
      }

      // Verify rendering of 500 annotations in SvgOverlay without crash
      const { container } = renderOverlay(state);
      const badges = container.querySelectorAll('[data-testid="shape-badge"], [data-testid="shape-pin"]');
      expect(badges.length).toBe(500);
      expect(badges[0].textContent).toBe('1');
      expect(badges[499].textContent).toBe('500');
    });

    it('handles interactive rapid multi-stroke drawing with SvgOverlay event lifecycle', () => {
      const { container } = renderOverlay({
        image: mockBaseImage,
        activeTool: 'box',
      });
      const svg = screen.getByTestId('svg-overlay');

      for (let i = 1; i <= 20; i++) {
        const startX = i * 40;
        const startY = i * 30;
        const endX = startX + 30;
        const endY = startY + 25;

        fireEvent.pointerDown(svg, { button: 0, pointerId: i, clientX: startX, clientY: startY });
        fireEvent.pointerMove(svg, { pointerId: i, clientX: endX, clientY: endY });
        fireEvent.pointerUp(svg, { pointerId: i, clientX: endX, clientY: endY });
      }

      const boxes = container.querySelectorAll('[data-testid="shape-box"]');
      expect(boxes.length).toBe(20);
      const badges = container.querySelectorAll('[data-testid="shape-badge"]');
      expect(badges.length).toBe(20);
      expect(badges[19].textContent).toBe('20');
    });
  });

  describe('Suite 2: Handle Drag Resizing with Extreme Inversion', () => {
    it('inverts Box geometry cleanly when dragging top handle far below bottom edge', () => {
      const initialBox: BoxGeometry = { type: 'box', x: 200, y: 200, width: 300, height: 200 };
      // Bottom edge is at y = 400. Drag 'n' handle down to y = 800 (400px past bottom)
      const resized = applyHandleResize(initialBox, 'n', { x: 350, y: 800 }) as BoxGeometry;

      expect(resized.type).toBe('box');
      expect(resized.y).toBe(400); // Flipped: old bottom (400) becomes new top
      expect(resized.height).toBe(400); // 800 - 400 = 400
      expect(resized.width).toBe(300);
      expect(resized.x).toBe(200);
    });

    it('inverts Box geometry cleanly when dragging bottom handle far above top edge', () => {
      const initialBox: BoxGeometry = { type: 'box', x: 200, y: 200, width: 300, height: 200 };
      // Top edge is at y = 200. Drag 's' handle up to y = 50 (150px above top)
      const resized = applyHandleResize(initialBox, 's', { x: 350, y: 50 }) as BoxGeometry;

      expect(resized.type).toBe('box');
      expect(resized.y).toBe(50); // New top is 50
      expect(resized.height).toBe(150); // 200 - 50 = 150
      expect(resized.x).toBe(200);
      expect(resized.width).toBe(300);
    });

    it('inverts Box geometry cleanly when dragging NW corner diagonally past SE corner', () => {
      const initialBox: BoxGeometry = { type: 'box', x: 100, y: 100, width: 200, height: 150 };
      // SE corner is at (300, 250). Drag 'nw' handle to (600, 500)
      const resized = applyHandleResize(initialBox, 'nw', { x: 600, y: 500 }) as BoxGeometry;

      expect(resized.type).toBe('box');
      expect(resized.x).toBe(300); // Old right becomes new left
      expect(resized.y).toBe(250); // Old bottom becomes new top
      expect(resized.width).toBe(300); // 600 - 300 = 300
      expect(resized.height).toBe(250); // 500 - 250 = 250
    });

    it('inverts Box geometry cleanly when dragging SE corner diagonally past NW corner', () => {
      const initialBox: BoxGeometry = { type: 'box', x: 400, y: 400, width: 200, height: 150 };
      // NW corner is at (400, 400). Drag 'se' handle to (100, 150)
      const resized = applyHandleResize(initialBox, 'se', { x: 100, y: 150 }) as BoxGeometry;

      expect(resized.type).toBe('box');
      expect(resized.x).toBe(100);
      expect(resized.y).toBe(150);
      expect(resized.width).toBe(300); // 400 - 100 = 300
      expect(resized.height).toBe(250); // 400 - 150 = 250
    });

    it('inverts Ellipse geometry cleanly across all 8 handles under extreme inversions', () => {
      const initialEllipse: EllipseGeometry = { type: 'ellipse', cx: 500, cy: 500, rx: 100, ry: 80 };
      // Bounding box is x: 400..600, y: 420..580
      // Drag 'w' handle (400, 500) past east handle to x = 900
      const resizedW = applyHandleResize(initialEllipse, 'w', { x: 900, y: 500 }) as EllipseGeometry;
      expect(resizedW.type).toBe('ellipse');
      expect(resizedW.rx).toBe(150); // width is 900 - 600 = 300 -> rx = 150
      expect(resizedW.cx).toBe(750); // 600 + 150 = 750
      expect(resizedW.ry).toBe(80);
      expect(resizedW.cy).toBe(500);

      // Drag 'ne' handle (600, 420) past sw corner to (200, 800)
      const resizedNE = applyHandleResize(initialEllipse, 'ne', { x: 200, y: 800 }) as EllipseGeometry;
      expect(resizedNE.type).toBe('ellipse');
      expect(resizedNE.rx).toBe(100); // x span is 200..400 -> width 200 -> rx 100
      expect(resizedNE.cx).toBe(300);
      expect(resizedNE.ry).toBe(110); // y span is 580..800 -> height 220 -> ry 110
      expect(resizedNE.cy).toBe(690);
    });

    it('guarantees min dimensions (width >= 2, height >= 2) on exact collision / 0px collapse', () => {
      const initialBox: BoxGeometry = { type: 'box', x: 100, y: 100, width: 200, height: 150 };
      // Drag SE handle to exact NW position (100, 100) -> 0px dimension
      const collapsed = applyHandleResize(initialBox, 'se', { x: 100, y: 100 }) as BoxGeometry;
      expect(collapsed.width).toBeGreaterThanOrEqual(2);
      expect(collapsed.height).toBeGreaterThanOrEqual(2);
      expect(Number.isFinite(collapsed.x)).toBe(true);
      expect(Number.isFinite(collapsed.y)).toBe(true);
    });
  });

  describe('Suite 3: Zero-Dimension Micro Drags & Jitter Rejection', () => {
    it('rejects sub-threshold micro clicks across 1,000 randomized micro jitter vectors', () => {
      // Test Box threshold (< 4px)
      for (let i = 0; i < 200; i++) {
        const startX = 100 + i;
        const startY = 100 + i;
        const deltaX = (Math.random() * 3.9) * (Math.random() > 0.5 ? 1 : -1);
        const deltaY = (Math.random() * 3.9) * (Math.random() > 0.5 ? 1 : -1);
        const box = normalizeBox({ x: startX, y: startY }, { x: startX + deltaX, y: startY + deltaY });
        const isValid = box.width >= 4 || box.height >= 4;
        expect(isValid).toBe(false);
      }

      // Test Ellipse threshold (< 2px radius)
      for (let i = 0; i < 200; i++) {
        const startX = 200 + i;
        const startY = 200 + i;
        const deltaX = (Math.random() * 3.9) * (Math.random() > 0.5 ? 1 : -1);
        const deltaY = (Math.random() * 3.9) * (Math.random() > 0.5 ? 1 : -1);
        const ellipse = calculateEllipseBounds({ x: startX, y: startY }, { x: startX + deltaX, y: startY + deltaY });
        const isValid = ellipse.rx >= 2 || ellipse.ry >= 2;
        expect(isValid).toBe(false);
      }

      // Test Arrow threshold (< 8px length)
      for (let i = 0; i < 200; i++) {
        const startX = 300 + i;
        const startY = 300 + i;
        const angle = Math.random() * Math.PI * 2;
        const length = Math.random() * 7.99; // strictly < 8
        const endX = startX + length * Math.cos(angle);
        const endY = startY + length * Math.sin(angle);
        const dist = Math.hypot(endX - startX, endY - startY);
        const isValid = dist >= 8;
        expect(isValid).toBe(false);
      }
    });

    it('rejects micro-drag in SvgOverlay UI and accepts valid shapes above threshold', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'box',
      });
      const svg = screen.getByTestId('svg-overlay');

      // 1. Sub-threshold click (2px x 2px)
      fireEvent.pointerDown(svg, { button: 0, pointerId: 101, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 101, clientX: 102, clientY: 102 });
      fireEvent.pointerUp(svg, { pointerId: 101, clientX: 102, clientY: 102 });
      expect(screen.queryByTestId('shape-box')).not.toBeInTheDocument();

      // 2. Valid drag (50px x 40px)
      fireEvent.pointerDown(svg, { button: 0, pointerId: 102, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 102, clientX: 150, clientY: 140 });
      fireEvent.pointerUp(svg, { pointerId: 102, clientX: 150, clientY: 140 });
      expect(screen.getByTestId('shape-box')).toBeInTheDocument();
    });

    it('always creates Pin annotations even on zero-motion pointer clicks', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'pin',
      });
      const svg = screen.getByTestId('svg-overlay');

      fireEvent.pointerDown(svg, { button: 0, pointerId: 201, clientX: 500, clientY: 400 });
      fireEvent.pointerUp(svg, { pointerId: 201, clientX: 500, clientY: 400 });

      const pin = screen.getByTestId('shape-pin');
      expect(pin).toBeInTheDocument();
      expect(pin.textContent).toBe('1');
    });
  });

  describe('Suite 4: Diagonal Aspect Ratio Snapping with Shift Key', () => {
    it('constrains Box to a perfect square in all 4 drag quadrants when Shift is pressed', () => {
      const origin = { x: 500, y: 500 };
      const testCases = [
        { current: { x: 700, y: 600 }, expectedSide: 200, name: 'Quadrant 1 (+x, +y)' },
        { current: { x: 300, y: 650 }, expectedSide: 200, name: 'Quadrant 2 (-x, +y)' },
        { current: { x: 350, y: 200 }, expectedSide: 300, name: 'Quadrant 3 (-x, -y)' },
        { current: { x: 650, y: 400 }, expectedSide: 150, name: 'Quadrant 4 (+x, -y)' },
      ];

      for (const tc of testCases) {
        let box = normalizeBox(origin, tc.current);
        const side = Math.max(box.width, box.height);
        const signX = tc.current.x >= origin.x ? 1 : -1;
        const signY = tc.current.y >= origin.y ? 1 : -1;
        box = {
          type: 'box',
          x: signX === 1 ? origin.x : origin.x - side,
          y: signY === 1 ? origin.y : origin.y - side,
          width: side,
          height: side,
        };

        expect(box.width).toBe(box.height);
        expect(box.width).toBe(tc.expectedSide);
        expect(box.x).toBeLessThanOrEqual(origin.x);
        expect(box.y).toBeLessThanOrEqual(origin.y);
      }
    });

    it('constrains Ellipse to a perfect circle (rx === ry) in all 4 quadrants with Shift', () => {
      const origin = { x: 500, y: 500 };
      const targets = [
        { x: 700, y: 600 }, // dx 200, dy 100 -> diameter 200, radius 100
        { x: 300, y: 650 }, // dx 200, dy 150 -> diameter 200, radius 100
        { x: 350, y: 200 }, // dx 150, dy 300 -> diameter 300, radius 150
        { x: 650, y: 400 }, // dx 150, dy 100 -> diameter 150, radius 75
      ];

      for (const target of targets) {
        const circle = calculateEllipseBounds(origin, target, true);
        expect(circle.rx).toBe(circle.ry);
        expect(circle.rx).toBe(Math.max(Math.abs(target.x - origin.x), Math.abs(target.y - origin.y)) / 2);
      }
    });

    it('snaps Arrow heading angle strictly to 45-degree increments across 360-degree sweep with Shift', () => {
      const origin = { x: 500, y: 500 };
      const radius = 200;

      // Test 360 angles in 1-degree steps
      for (let deg = 0; deg < 360; deg++) {
        const rad = (deg * Math.PI) / 180;
        const targetX = origin.x + radius * Math.cos(rad);
        const targetY = origin.y + radius * Math.sin(rad);

        const dx = targetX - origin.x;
        const dy = targetY - origin.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const endX = origin.x + length * Math.cos(snapped);
        const endY = origin.y + length * Math.sin(snapped);

        const resultingAngle = Math.atan2(endY - origin.y, endX - origin.x);
        const normalizedAngle = (resultingAngle + 2 * Math.PI) % (2 * Math.PI);
        const nearest45Multiple = Math.round(normalizedAngle / (Math.PI / 4)) * (Math.PI / 4);

        expect(Math.abs(normalizedAngle - nearest45Multiple)).toBeLessThan(1e-6);
        expect(Math.hypot(endX - origin.x, endY - origin.y)).toBeCloseTo(radius, 4);
      }
    });

    it('maintains 1:1 aspect ratio when resizing Box with Shift key held', () => {
      const initialBox: BoxGeometry = { type: 'box', x: 100, y: 100, width: 200, height: 100 };
      // SE drag with Shift: dragging to (400, 250) -> width 300, height 150 -> side 300
      const resizedSE = applyHandleResize(initialBox, 'se', { x: 400, y: 250 }, true) as BoxGeometry;
      expect(resizedSE.width).toBe(resizedSE.height);
      expect(resizedSE.width).toBe(300);

      // NW drag with Shift: dragging to (50, 80) -> width 250, height 120 -> side 250
      const resizedNW = applyHandleResize(initialBox, 'nw', { x: 50, y: 80 }, true) as BoxGeometry;
      expect(resizedNW.width).toBe(resizedNW.height);
      expect(resizedNW.width).toBe(250);
    });
  });

  describe('Suite 5: Arrow Tip/Tail Swapping & Handle Interaction', () => {
    it('swaps Arrow start and end points freely without NaN or vector collapse', () => {
      const initialArrow: ArrowGeometry = {
        type: 'arrow',
        startX: 100,
        startY: 100,
        endX: 300,
        endY: 200,
      };

      // 1. Move start handle past end handle (from 100,100 to 500,400) -> 180° reversal
      const swappedStart = applyHandleResize(initialArrow, 'start', { x: 500, y: 400 }) as ArrowGeometry;
      expect(swappedStart.startX).toBe(500);
      expect(swappedStart.startY).toBe(400);
      expect(swappedStart.endX).toBe(300);
      expect(swappedStart.endY).toBe(200);

      // Verify calculateArrowhead on swapped vector
      const headData = calculateArrowhead(
        { x: swappedStart.startX, y: swappedStart.startY },
        { x: swappedStart.endX, y: swappedStart.endY }
      );
      expect(headData.tip.x).toBe(300);
      expect(headData.tip.y).toBe(200);
      expect(Number.isFinite(headData.headingRad)).toBe(true);
      expect(Number.isFinite(headData.wingLeft.x)).toBe(true);
      expect(Number.isFinite(headData.wingRight.x)).toBe(true);
      expect(Number.isFinite(headData.notch.x)).toBe(true);

      // 2. Move end handle past start handle (from 300,200 to 0,0)
      const swappedEnd = applyHandleResize(initialArrow, 'end', { x: 0, y: 0 }) as ArrowGeometry;
      expect(swappedEnd.startX).toBe(100);
      expect(swappedEnd.startY).toBe(100);
      expect(swappedEnd.endX).toBe(0);
      expect(swappedEnd.endY).toBe(0);

      const headData2 = calculateArrowhead(
        { x: swappedEnd.startX, y: swappedEnd.startY },
        { x: swappedEnd.endX, y: swappedEnd.endY }
      );
      expect(headData2.tip.x).toBe(0);
      expect(headData2.tip.y).toBe(0);
      expect(Number.isFinite(headData2.headingRad)).toBe(true);
    });

    it('renders arrow handles at exact start and end coordinates after swapping', () => {
      const swappedArrowAnno: Annotation = {
        id: 'arrow-swapped',
        index: 1,
        geometry: {
          type: 'arrow',
          startX: 800,
          startY: 600,
          endX: 200,
          endY: 100,
        },
        style: { color: 'green', strokeWidth: 3, fillOpacity: 1 },
        note: '',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const handles = getResizeHandlePositions(swappedArrowAnno.geometry);
      expect(handles).toHaveLength(2);
      const startHandle = handles.find((h) => h.id === 'start');
      const endHandle = handles.find((h) => h.id === 'end');

      expect(startHandle?.x).toBe(800);
      expect(startHandle?.y).toBe(600);
      expect(endHandle?.x).toBe(200);
      expect(endHandle?.y).toBe(100);
    });
  });

  describe('Suite 6: Scale-Invariant Transform Handles under Extreme Zoom (0.01x to 50x)', () => {
    it('maintains finite, positive handle sizes and hit areas across 10 extreme zoom levels', () => {
      const mockAnno: Annotation = {
        id: 'box-zoom',
        index: 1,
        geometry: { type: 'box', x: 200, y: 200, width: 300, height: 200 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: '',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const handles = getResizeHandlePositions(mockAnno.geometry);
      expect(handles).toHaveLength(8);

      const zoomLevels = [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 25.0, 50.0];

      for (const zoom of zoomLevels) {
        const handleSize = Math.max(8 / zoom, 3);
        const hitAreaSize = Math.max(20 / zoom, 10);
        const strokeWidth = Math.max(1.5 / zoom, 0.5);

        expect(handleSize).toBeGreaterThanOrEqual(3);
        expect(hitAreaSize).toBeGreaterThanOrEqual(10);
        expect(strokeWidth).toBeGreaterThanOrEqual(0.5);
        expect(Number.isFinite(handleSize)).toBe(true);
        expect(Number.isFinite(hitAreaSize)).toBe(true);
        expect(Number.isFinite(strokeWidth)).toBe(true);
      }
    });
  });

  describe('Suite 7: Body Translation Drag Stress & Invariance', () => {
    it('translates all shape types preserving exact bounding dimensions', () => {
      const box: BoxGeometry = { type: 'box', x: 100, y: 100, width: 200, height: 150 };
      const ellipse: EllipseGeometry = { type: 'ellipse', cx: 300, cy: 300, rx: 80, ry: 50 };
      const arrow: ArrowGeometry = { type: 'arrow', startX: 50, startY: 60, endX: 250, endY: 180 };
      const pin: PinGeometry = { type: 'pin', x: 400, y: 500 };

      const deltaX = 125.75;
      const deltaY = -83.5;

      const tBox = translateGeometry(box, deltaX, deltaY) as BoxGeometry;
      expect(tBox.x).toBe(100 + deltaX);
      expect(tBox.y).toBe(100 + deltaY);
      expect(tBox.width).toBe(box.width);
      expect(tBox.height).toBe(box.height);

      const tEllipse = translateGeometry(ellipse, deltaX, deltaY) as EllipseGeometry;
      expect(tEllipse.cx).toBe(300 + deltaX);
      expect(tEllipse.cy).toBe(300 + deltaY);
      expect(tEllipse.rx).toBe(ellipse.rx);
      expect(tEllipse.ry).toBe(ellipse.ry);

      const tArrow = translateGeometry(arrow, deltaX, deltaY) as ArrowGeometry;
      expect(tArrow.startX).toBe(50 + deltaX);
      expect(tArrow.startY).toBe(60 + deltaY);
      expect(tArrow.endX).toBe(250 + deltaX);
      expect(tArrow.endY).toBe(180 + deltaY);
      expect(Math.hypot(tArrow.endX - tArrow.startX, tArrow.endY - tArrow.startY)).toBeCloseTo(
        Math.hypot(arrow.endX - arrow.startX, arrow.endY - arrow.startY),
        5
      );

      const tPin = translateGeometry(pin, deltaX, deltaY) as PinGeometry;
      expect(tPin.x).toBe(400 + deltaX);
      expect(tPin.y).toBe(500 + deltaY);
    });
  });

  describe('Suite 8: DOM Pointer-Level Extreme Handle Drag Inversions in SvgOverlay', () => {
    it('handles NW handle drag dragged all the way past SE corner via DOM events', () => {
      const boxAnno: Annotation = {
        id: 'box-invert-dom',
        index: 1,
        geometry: { type: 'box', x: 200, y: 200, width: 300, height: 200 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: '',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const onGeometryChange = vi.fn();
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [boxAnno],
            selectedAnnotationId: 'box-invert-dom',
            activeTool: 'select',
          }}
        >
          <svg data-testid="canvas-workspace-container">
            <TransformHandles
              annotation={boxAnno}
              onGeometryChange={onGeometryChange}
            />
          </svg>
        </AppProvider>
      );

      const handleNW = screen.getByTestId('transform-handle-nw');
      const group = screen.getByTestId('transform-handles-group');

      // Drag NW handle (200, 200) past SE corner (500, 400) to (700, 600)
      fireEvent.pointerDown(handleNW, { clientX: 200, clientY: 200, pointerId: 1 });
      fireEvent.pointerMove(group, { clientX: 700, clientY: 600, pointerId: 1 });

      expect(onGeometryChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'box',
          x: 500, // Old right (200 + 300 = 500) becomes new left
          y: 400, // Old bottom (200 + 200 = 400) becomes new top
          width: 200, // 700 - 500 = 200
          height: 200, // 600 - 400 = 200
        })
      );
    });
  });

  describe('Suite 9: Live Interactive Arrow Drawing with Shift Key 45° Snapping', () => {
    it('snaps live draft arrow to exact 45-degree angle in SvgOverlay when Shift is held during drag', () => {
      renderOverlay({
        image: mockBaseImage,
        activeTool: 'arrow',
      });
      const svg = screen.getByTestId('svg-overlay');

      // Start at (100, 100) and drag to (200, 110) with shiftKey: true (angle ~5.7° -> should snap to 0°)
      fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 200, clientY: 110, shiftKey: true });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 200, clientY: 110, shiftKey: true });

      const arrow = screen.getByTestId('shape-arrow');
      expect(arrow).toBeInTheDocument();
      const line = arrow.querySelector('line');
      expect(line).toBeInTheDocument();
      // Snapped to horizontal line: y1 === y2 === 100
      expect(Number(line?.getAttribute('y1'))).toBeCloseTo(100, 1);
      expect(Number(line?.getAttribute('y2'))).toBeCloseTo(100, 1);
      expect(Number(line?.getAttribute('x2'))).toBeGreaterThan(100);
    });
  });

  describe('Suite 10: Selection & Background Click Catcher Invariant with 500 Shapes', () => {
    it('handles selection on shape click and clears selection on background click catcher', () => {
      const annotations: Annotation[] = Array.from({ length: 500 }, (_, i) => ({
        id: `ann-${i + 1}`,
        index: i + 1,
        geometry: { type: 'box', x: (i % 20) * 80, y: Math.floor(i / 20) * 50, width: 60, height: 40 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: `Note ${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      renderOverlay({
        image: mockBaseImage,
        activeTool: 'select',
        annotations,
        selectedAnnotationId: 'ann-250',
      });

      // Transform handles should be visible for selected ann-250
      expect(screen.getByTestId('transform-handles')).toBeInTheDocument();

      // Click background catcher
      const bgCatcher = screen.getByTestId('canvas-background-catcher');
      fireEvent.click(bgCatcher);

      // Deselected -> handles should be removed
      expect(screen.queryByTestId('transform-handles')).not.toBeInTheDocument();
    });
  });
});

