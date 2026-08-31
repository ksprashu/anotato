import { Point, AnnotationGeometry } from '../types';

export interface BadgeDimensions {
  width: number;
  height: number;
  radius: number;
  isPill: boolean;
  fontSize: number;
}

/**
 * Returns the anchor point in image coordinates where the numbered badge
 * should be centered for a given annotation shape.
 */
export function getBadgePositionForShape(geometry: AnnotationGeometry): Point {
  switch (geometry.type) {
    case 'box':
      // Anchored at top-left corner
      return {
        x: geometry.x,
        y: geometry.y,
      };

    case 'ellipse': {
      // Anchored at the top-left diagonal apex (angle = 225 deg = 5pi/4)
      const cos225 = -Math.SQRT1_2; // approx -0.7071
      const sin225 = -Math.SQRT1_2;
      return {
        x: geometry.cx + geometry.rx * cos225,
        y: geometry.cy + geometry.ry * sin225,
      };
    }

    case 'arrow':
      // CRITICAL: Badge is ALWAYS placed at the tail start point so arrowhead is unobstructed
      return {
        x: geometry.startX,
        y: geometry.startY,
      };

    case 'pin':
      // Placed at the pin head circle center
      return {
        x: geometry.x,
        y: geometry.y - 20,
      };
  }
}

/**
 * Computes responsive badge dimensions and pill flag based on the index number.
 */
export function getBadgeDimensions(index: number): BadgeDimensions {
  const text = String(Math.max(1, index));
  const digits = text.length;

  if (digits <= 1) {
    return {
      width: 24,
      height: 24,
      radius: 12,
      isPill: false,
      fontSize: 13,
    };
  }

  const width = Math.max(32, 24 + (digits - 1) * 8);
  return {
    width,
    height: 24,
    radius: 12,
    isPill: true,
    fontSize: 12,
  };
}
