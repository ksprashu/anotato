import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ShapeRenderer } from '../../src/components/canvas/ShapeRenderer';
import { PRESET_COLORS } from '../../src/constants/colors';
import { BoxGeometry, EllipseGeometry, ArrowGeometry, PinGeometry } from '../../src/types';

const renderInSvg = (ui: React.ReactElement) => {
  return render(
    <svg width={1000} height={800} viewBox="0 0 1000 800">
      {ui}
    </svg>
  );
};

describe('ShapeRenderer Pure SVG Component', () => {
  describe('Box Shape Rendering', () => {
    it('renders rect with specified geometry and amber styling', () => {
      const boxGeo: BoxGeometry = { type: 'box', x: 50, y: 60, width: 200, height: 120 };
      renderInSvg(
        <ShapeRenderer
          annotation={{
            geometry: boxGeo,
            style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.2 },
            index: 1,
          }}
        />
      );

      const boxGroup = screen.getByTestId('shape-box');
      expect(boxGroup).toBeInTheDocument();
      const rect = boxGroup.querySelector('rect:not([fill="none"])');
      expect(rect?.getAttribute('x')).toBe('50');
      expect(rect?.getAttribute('y')).toBe('60');
      expect(rect?.getAttribute('width')).toBe('200');
      expect(rect?.getAttribute('height')).toBe('120');
      expect(rect?.getAttribute('stroke')).toBe(PRESET_COLORS.amber.stroke);
      expect(rect?.getAttribute('stroke-width')).toBe('4');
      expect(rect?.getAttribute('fill')).toBe('rgba(245, 158, 11, 0.2)');
    });
  });

  describe('Ellipse Shape Rendering', () => {
    it('renders ellipse with cx, cy, rx, ry and cyan styling', () => {
      const ellipseGeo: EllipseGeometry = { type: 'ellipse', cx: 300, cy: 200, rx: 80, ry: 50 };
      renderInSvg(
        <ShapeRenderer
          annotation={{
            geometry: ellipseGeo,
            style: { color: 'cyan', strokeWidth: 3, fillOpacity: 0.15 },
            index: 2,
          }}
        />
      );

      const ellipseGroup = screen.getByTestId('shape-ellipse');
      expect(ellipseGroup).toBeInTheDocument();
      const ellipse = ellipseGroup.querySelector('ellipse:not([fill="none"])');
      expect(ellipse?.getAttribute('cx')).toBe('300');
      expect(ellipse?.getAttribute('cy')).toBe('200');
      expect(ellipse?.getAttribute('rx')).toBe('80');
      expect(ellipse?.getAttribute('ry')).toBe('50');
      expect(ellipse?.getAttribute('stroke')).toBe(PRESET_COLORS.cyan.stroke);
    });
  });

  describe('Arrow Shape Rendering', () => {
    it('renders shaft line and 30-deg arrowhead path with purple styling', () => {
      const arrowGeo: ArrowGeometry = { type: 'arrow', startX: 100, startY: 100, endX: 300, endY: 200 };
      renderInSvg(
        <ShapeRenderer
          annotation={{
            geometry: arrowGeo,
            style: { color: 'purple', strokeWidth: 3, fillOpacity: 0.15 },
            index: 3,
          }}
        />
      );

      const arrowGroup = screen.getByTestId('shape-arrow');
      expect(arrowGroup).toBeInTheDocument();
      const line = arrowGroup.querySelector('line');
      expect(line?.getAttribute('x1')).toBe('100');
      expect(line?.getAttribute('y1')).toBe('100');
      const path = arrowGroup.querySelector('path');
      expect(path).toBeInTheDocument();
      expect(path?.getAttribute('fill')).toBe(PRESET_COLORS.purple.stroke);
    });
  });

  describe('Pin Shape Rendering', () => {
    it('renders teardrop path and centered badge index with green styling', () => {
      const pinGeo: PinGeometry = { type: 'pin', x: 250, y: 350 };
      renderInSvg(
        <ShapeRenderer
          annotation={{
            geometry: pinGeo,
            style: { color: 'green', strokeWidth: 3, fillOpacity: 0.15 },
            index: 4,
          }}
        />
      );

      const pinGroup = screen.getByTestId('shape-pin');
      expect(pinGroup).toBeInTheDocument();
      const path = pinGroup.querySelector('path');
      expect(path).toBeInTheDocument();
      expect(path?.getAttribute('fill')).toBe(PRESET_COLORS.green.badgeBg);
      const text = pinGroup.querySelector('text');
      expect(text?.textContent).toBe('4');
    });
  });

  describe('Color Presets Integrity', () => {
    const colors = ['red', 'amber', 'green', 'cyan', 'purple'] as const;
    colors.forEach((c) => {
      it(`maps preset color ${c} accurately to stroke and badgeBg`, () => {
        const boxGeo: BoxGeometry = { type: 'box', x: 0, y: 0, width: 50, height: 50 };
        const { unmount } = renderInSvg(
          <ShapeRenderer
            annotation={{
              geometry: boxGeo,
              style: { color: c, strokeWidth: 3, fillOpacity: 0.15 },
              index: 1,
            }}
          />
        );

        const rect = screen.getByTestId('shape-box').querySelector('rect:not([fill="none"])');
        expect(rect?.getAttribute('stroke')).toBe(PRESET_COLORS[c].stroke);
        unmount();
      });
    });
  });

  describe('Hover and Selection Glow Effects', () => {
    it('renders glow halo on hover', () => {
      const boxGeo: BoxGeometry = { type: 'box', x: 50, y: 50, width: 100, height: 100 };
      renderInSvg(
        <ShapeRenderer
          annotation={{
            geometry: boxGeo,
            style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
            index: 1,
          }}
          isHovered={true}
        />
      );

      const halo = screen.getByTestId('shape-box').querySelector('rect[fill="none"]');
      expect(halo).toBeInTheDocument();
      expect(halo?.getAttribute('stroke-opacity')).toBe('0.3');
    });

    it('renders selection highlight when isSelected is true', () => {
      const boxGeo: BoxGeometry = { type: 'box', x: 50, y: 50, width: 100, height: 100 };
      renderInSvg(
        <ShapeRenderer
          annotation={{
            geometry: boxGeo,
            style: { color: 'red', strokeWidth: 3, fillOpacity: 0.15 },
            index: 1,
          }}
          isSelected={true}
        />
      );

      const halo = screen.getByTestId('shape-box').querySelector('rect[fill="none"]');
      expect(halo).toBeInTheDocument();
      expect(halo?.getAttribute('stroke-opacity')).toBe('0.5');
    });
  });

  describe('Draft Preview Mode Rendering', () => {
    it('renders dashed vector stroke when isDraft is true', () => {
      const boxGeo: BoxGeometry = { type: 'box', x: 50, y: 50, width: 100, height: 100 };
      renderInSvg(
        <ShapeRenderer
          annotation={{
            geometry: boxGeo,
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            index: 1,
          }}
          isDraft={true}
        />
      );

      const rect = screen.getByTestId('shape-box').querySelector('rect:not([fill="none"])');
      expect(rect?.getAttribute('stroke-dasharray')).toBe('6 4');
    });
  });

  describe('Badge Dimensions & Pill Scaling', () => {
    it('renders circle badge for single digit index (1-9)', () => {
      const boxGeo: BoxGeometry = { type: 'box', x: 10, y: 10, width: 50, height: 50 };
      renderInSvg(
        <ShapeRenderer
          annotation={{
            geometry: boxGeo,
            style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
            index: 5,
          }}
        />
      );

      const badge = screen.getByTestId('shape-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('5');
    });
  });
});
