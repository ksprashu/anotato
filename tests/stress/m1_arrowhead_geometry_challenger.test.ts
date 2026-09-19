import { describe, it, expect } from 'vitest';
import { calculateArrowhead } from '../../src/math/geometry';
import { Point } from '../../src/types';

/**
 * Helper: Euclidean distance between two points.
 */
function distance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Helper: Dot product of two 2D vectors.
 */
function dotProduct(v1: Point, v2: Point): number {
  return v1.x * v2.x + v1.y * v2.y;
}

/**
 * Helper: Normalize angle to [-PI, PI].
 */
function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

describe('M1 Arrowhead Geometry Empirical Challenger & Adversarial Oracle Suite', () => {
  // =========================================================================
  // SECTION 1: Extreme Coordinates & Numerical Robustness
  // =========================================================================
  describe('1. Extreme Coordinates & Numerical Stability', () => {
    it('handles massive coordinates (+-1,000,000) across all 4 quadrants without overflow or NaN', () => {
      const massiveVectors: { start: Point; end: Point; label: string }[] = [
        {
          start: { x: 1_000_000, y: 1_000_000 },
          end: { x: 1_000_100, y: 1_000_100 },
          label: 'Quadrant 1: massive +X, +Y',
        },
        {
          start: { x: -1_000_000, y: 1_000_000 },
          end: { x: -1_000_100, y: 1_000_100 },
          label: 'Quadrant 2: massive -X, +Y',
        },
        {
          start: { x: -1_000_000, y: -1_000_000 },
          end: { x: -1_000_100, y: -1_000_100 },
          label: 'Quadrant 3: massive -X, -Y',
        },
        {
          start: { x: 1_000_000, y: -1_000_000 },
          end: { x: 1_000_100, y: -1_000_100 },
          label: 'Quadrant 4: massive +X, -Y',
        },
        {
          start: { x: -1_000_000, y: -1_000_000 },
          end: { x: 1_000_000, y: 1_000_000 },
          label: 'Diagonal span across entire 2,000,000 coordinate space',
        },
        {
          start: { x: 999_999.123456, y: -888_888.654321 },
          end: { x: -777_777.987654, y: 666_666.112233 },
          label: 'Arbitrary high-precision float coordinates in extreme space',
        },
      ];

      for (const { start, end, label } of massiveVectors) {
        const arrow = calculateArrowhead(start, end, 6);

        // Verify all point coordinates are finite
        expect(Number.isFinite(arrow.tip.x), `${label} tip.x finite`).toBe(true);
        expect(Number.isFinite(arrow.tip.y), `${label} tip.y finite`).toBe(true);
        expect(Number.isFinite(arrow.left.x), `${label} left.x finite`).toBe(true);
        expect(Number.isFinite(arrow.left.y), `${label} left.y finite`).toBe(true);
        expect(Number.isFinite(arrow.right.x), `${label} right.x finite`).toBe(true);
        expect(Number.isFinite(arrow.right.y), `${label} right.y finite`).toBe(true);
        expect(Number.isFinite(arrow.wingLeft.x), `${label} wingLeft.x finite`).toBe(true);
        expect(Number.isFinite(arrow.wingLeft.y), `${label} wingLeft.y finite`).toBe(true);
        expect(Number.isFinite(arrow.wingRight.x), `${label} wingRight.x finite`).toBe(true);
        expect(Number.isFinite(arrow.wingRight.y), `${label} wingRight.y finite`).toBe(true);
        expect(Number.isFinite(arrow.notch.x), `${label} notch.x finite`).toBe(true);
        expect(Number.isFinite(arrow.notch.y), `${label} notch.y finite`).toBe(true);
        expect(Number.isFinite(arrow.shaftEnd.x), `${label} shaftEnd.x finite`).toBe(true);
        expect(Number.isFinite(arrow.shaftEnd.y), `${label} shaftEnd.y finite`).toBe(true);

        // Verify scalar values
        expect(Number.isFinite(arrow.headingRad), `${label} headingRad finite`).toBe(true);
        expect(Number.isFinite(arrow.headLength), `${label} headLength finite`).toBe(true);
        expect(Number.isFinite(arrow.headWidth), `${label} headWidth finite`).toBe(true);
        expect(Number.isFinite(arrow.casingStrokeWidth!), `${label} casingStrokeWidth finite`).toBe(true);

        // Verify path string validity
        expect(arrow.pathString).not.toContain('NaN');
        expect(arrow.pathString).not.toContain('Infinity');
        expect(arrow.pathString).not.toContain('undefined');
        expect(arrow.pathString).toMatch(/^M\s+[-0-9.e+]+\s+[-0-9.e+]+\s+L\s+[-0-9.e+]+\s+[-0-9.e+]+\s+L\s+[-0-9.e+]+\s+[-0-9.e+]+\s+L\s+[-0-9.e+]+\s+[-0-9.e+]+\s+Z$/i);
      }
    });

    it('handles micro-lengths (< 0.001px down to 1e-15px) without NaN or numerical explosion', () => {
      const microLengths = [0.00099, 1e-4, 1e-6, 1e-9, 1e-12, 1e-15];
      // Origin at 0 to preserve sub-epsilon float precision down to 1e-15 without machine epsilon truncation
      const start: Point = { x: 0, y: 0 };

      for (const len of microLengths) {
        const end: Point = { x: start.x + len, y: start.y };
        const arrow = calculateArrowhead(start, end, 6);

        expect(Number.isFinite(arrow.tip.x)).toBe(true);
        expect(Number.isFinite(arrow.tip.y)).toBe(true);
        expect(Number.isFinite(arrow.shaftEnd.x)).toBe(true);
        expect(Number.isFinite(arrow.shaftEnd.y)).toBe(true);
        expect(Number.isFinite(arrow.headLength)).toBe(true);

        // Clamped head length must never exceed 0.45 * length
        expect(arrow.headLength).toBeLessThanOrEqual(len * 0.45 + 1e-18);

        // shaftEnd must strictly collapse to start for micro-vectors
        expect(arrow.shaftEnd.x).toBe(start.x);
        expect(arrow.shaftEnd.y).toBe(start.y);

        expect(arrow.pathString).not.toContain('NaN');
        expect(arrow.pathString).not.toContain('undefined');
      }

      // Even when floating-point addition at non-zero coordinates truncates to identical points:
      const truncatedEnd: Point = { x: 250 + 1e-16, y: 250 };
      const truncatedArrow = calculateArrowhead({ x: 250, y: 250 }, truncatedEnd, 6);
      expect(Number.isFinite(truncatedArrow.headLength)).toBe(true);
      expect(truncatedArrow.shaftEnd.x).toBe(250);
      expect(truncatedArrow.shaftEnd.y).toBe(250);
      expect(truncatedArrow.pathString).not.toContain('NaN');
    });

    it('handles zero-length arrows (start == end) across various coordinate origins', () => {
      const origins: Point[] = [
        { x: 0, y: 0 },
        { x: 500, y: 500 },
        { x: -1_000_000, y: -1_000_000 },
        { x: 1_000_000, y: 1_000_000 },
      ];

      for (const pt of origins) {
        const arrow = calculateArrowhead(pt, pt, 6);

        expect(arrow.tip.x).toBe(pt.x);
        expect(arrow.tip.y).toBe(pt.y);
        expect(arrow.shaftEnd.x).toBe(pt.x);
        expect(arrow.shaftEnd.y).toBe(pt.y);

        expect(Number.isFinite(arrow.headingRad)).toBe(true);
        expect(Number.isFinite(arrow.headLength)).toBe(true);
        expect(Number.isFinite(arrow.notch.x)).toBe(true);
        expect(Number.isFinite(arrow.notch.y)).toBe(true);

        expect(arrow.pathString).not.toContain('NaN');
        expect(arrow.pathString).not.toContain('Infinity');
      }
    });
  });

  // =========================================================================
  // SECTION 2: Stroke Width Extremes
  // =========================================================================
  describe('2. Stroke Width Extremes: [0, 0.1, 1, 6, 20, 100, 1000]', () => {
    const strokeWidths = [0, 0.1, 1, 6, 20, 100, 1000];
    const start: Point = { x: 100, y: 100 };
    const end: Point = { x: 300, y: 100 }; // 200px long arrow pointing right

    it.each(strokeWidths)('handles strokeWidth = %s with valid casing, clearance, and bounds', (sw) => {
      const arrow = calculateArrowhead(start, end, sw);

      // Casing stroke width must strictly equal strokeWidth + 3.5
      expect(arrow.casingStrokeWidth).toBe(sw + 3.5);

      // Verify base head length clamping logic: Math.min(Math.max(16 + sw * 2, 14), 36)
      const expectedBaseLength = Math.min(Math.max(16 + sw * 2, 14), 36);
      expect(expectedBaseLength).toBeGreaterThanOrEqual(14);
      expect(expectedBaseLength).toBeLessThanOrEqual(36);

      // On a 200px arrow, length > baseHeadLength / 0.45, so headLength should match expectedBaseLength
      expect(arrow.headLength).toBeCloseTo(expectedBaseLength, 5);
      expect(arrow.headWidth).toBeCloseTo(arrow.headLength, 5);

      // Coordinates must all be finite
      expect(Number.isFinite(arrow.tip.x)).toBe(true);
      expect(Number.isFinite(arrow.notch.x)).toBe(true);
      expect(Number.isFinite(arrow.shaftEnd.x)).toBe(true);
      expect(Number.isFinite(arrow.left.x)).toBe(true);
      expect(Number.isFinite(arrow.right.x)).toBe(true);

      // Verify contract aliases
      expect(arrow.left).toBe(arrow.wingLeft);
      expect(arrow.right).toBe(arrow.wingRight);
    });

    it('collapses shaftEnd to start when extreme strokeWidth exceeds available shaft length', () => {
      // With strokeWidth = 1000, clearance = 500px.
      // For an arrow of length 200px, distToNotch - clearance is negative.
      const massiveStrokeArrow = calculateArrowhead(start, end, 1000);
      expect(massiveStrokeArrow.shaftEnd.x).toBe(start.x);
      expect(massiveStrokeArrow.shaftEnd.y).toBe(start.y);

      // With strokeWidth = 100, clearance = 50px.
      // distToNotch = 200 - 36 * 0.75 = 200 - 27 = 173px.
      // shaftLength = 173 - 50 = 123px > 0, so shaftEnd should be placed 50px before notch.
      const arrow100 = calculateArrowhead(start, end, 100);
      expect(arrow100.shaftEnd.x).toBeCloseTo(arrow100.notch.x - 50, 4);
    });
  });

  // =========================================================================
  // SECTION 3: 360-Degree Rotation Symmetry Around Unit Circle
  // =========================================================================
  describe('3. Rotation Symmetry Across 360 Individual Angles', () => {
    const center: Point = { x: 500, y: 500 };
    const radius = 200; // 200px arrow length
    const strokeWidth = 6;

    it('preserves all geometric invariants, angles, and symmetry at every integer degree (0° to 359°)', () => {
      for (let deg = 0; deg < 360; deg++) {
        const rad = (deg * Math.PI) / 180;
        const end: Point = {
          x: center.x + radius * Math.cos(rad),
          y: center.y + radius * Math.sin(rad),
        };

        const arrow = calculateArrowhead(center, end, strokeWidth);

        // 1. Heading alignment: headingRad must match rad (modulo [-PI, PI])
        const normExpected = normalizeAngle(rad);
        const normActual = normalizeAngle(arrow.headingRad);
        expect(normActual).toBeCloseTo(normExpected, 4);

        // 2. Head length must match base head length (28 for strokeWidth=6)
        expect(arrow.headLength).toBeCloseTo(28, 4);

        // 3. Wing length symmetry: distance from tip to wingLeft == distance from tip to wingRight == headLength
        const distLeft = distance(arrow.tip, arrow.wingLeft);
        const distRight = distance(arrow.tip, arrow.wingRight);
        expect(distLeft).toBeCloseTo(28, 4);
        expect(distRight).toBeCloseTo(28, 4);
        expect(Math.abs(distLeft - distRight)).toBeLessThan(1e-9);

        // 4. Wing angle: exactly 30 degrees (Math.PI / 6) relative to shaft axis
        // Vector from tip to start:
        const vAxis = { x: center.x - arrow.tip.x, y: center.y - arrow.tip.y };
        const vLeft = { x: arrow.wingLeft.x - arrow.tip.x, y: arrow.wingLeft.y - arrow.tip.y };
        const vRight = { x: arrow.wingRight.x - arrow.tip.x, y: arrow.wingRight.y - arrow.tip.y };

        const cosLeft = dotProduct(vAxis, vLeft) / (radius * 28);
        const cosRight = dotProduct(vAxis, vRight) / (radius * 28);
        expect(cosLeft).toBeCloseTo(Math.cos(Math.PI / 6), 4);
        expect(cosRight).toBeCloseTo(Math.cos(Math.PI / 6), 4);

        // 5. Notch alignment: notch lies collinear with arrow axis at distance 0.75 * headLength from tip
        const distNotchToTip = distance(arrow.tip, arrow.notch);
        expect(distNotchToTip).toBeCloseTo(28 * 0.75, 4); // 21px

        // Notch collinearity: notch must lie on the line segment [center, end]
        const notchUnitX = (arrow.notch.x - center.x) / (radius - 21);
        const notchUnitY = (arrow.notch.y - center.y) / (radius - 21);
        expect(notchUnitX).toBeCloseTo(Math.cos(rad), 4);
        expect(notchUnitY).toBeCloseTo(Math.sin(rad), 4);

        // 6. ShaftEnd alignment: recessed by strokeWidth * 0.5 (3px) from notch
        const distShaftEndToNotch = distance(arrow.notch, arrow.shaftEnd);
        expect(distShaftEndToNotch).toBeCloseTo(3, 4);

        // ShaftEnd distance from tip along axis: 21 + 3 = 24px
        const distShaftEndToTip = distance(arrow.tip, arrow.shaftEnd);
        expect(distShaftEndToTip).toBeCloseTo(24, 4);

        // 7. Aliasing contract
        expect(arrow.left).toEqual(arrow.wingLeft);
        expect(arrow.right).toEqual(arrow.wingRight);
      }
    });
  });

  // =========================================================================
  // SECTION 4: Mathematical Proof & Oracle — Linecap Apex vs Notch Apex
  // =========================================================================
  describe('4. Mathematical Proof: ShaftEnd Round Linecap Apex Never Extends Past Notch Apex', () => {
    /**
     * MATHEMATICAL PROOF FORMULATION:
     *
     * Let u = (cos(headingRad), sin(headingRad)) be the unit direction vector along the arrow axis.
     * The shaft is stroked with lineWidth = strokeWidth and strokeLinecap = 'round'.
     * A round linecap at shaftEnd forms a semicircle of radius R_cap = strokeWidth / 2 centered at shaftEnd.
     * The forward-most point (apex) of this linecap along the arrow direction vector u is:
     *   P_apex = shaftEnd + R_cap * u = shaftEnd + (strokeWidth * 0.5) * u.
     *
     * When shaftLength > 0 (normal non-collapsed shaft):
     *   shaftEnd is defined as:
     *   shaftEnd = notch - clearance * u, where clearance = strokeWidth * 0.5.
     *
     * Substituting shaftEnd into P_apex:
     *   P_apex = (notch - clearance * u) + (strokeWidth * 0.5) * u
     *          = notch - (strokeWidth * 0.5) * u + (strokeWidth * 0.5) * u
     *          = notch.
     *
     * Projection along u from start:
     *   proj_apex = dot(P_apex - start, u)
     *   proj_notch = dot(notch - start, u)
     *
     * Since P_apex == notch, proj_apex == proj_notch identically for all stroke widths!
     * Hence: proj_apex <= proj_notch holds as an exact equality: the round linecap touches the
     * notch apex at tangency without penetrating into the arrowhead hollow.
     */

    const sweepStrokeWidths = [0, 0.1, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 20, 50, 100];
    const sweepLengths = [25, 40, 50, 75, 100, 150, 200, 500, 1000];
    const sweepAngles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, -Math.PI / 2];

    it('proves that linecap apex coincides with notch apex with sub-nanometer precision for all uncollapsed shafts', () => {
      let testedCombinations = 0;

      for (const sw of sweepStrokeWidths) {
        for (const len of sweepLengths) {
          for (const angle of sweepAngles) {
            const start: Point = { x: 300, y: 300 };
            const end: Point = {
              x: start.x + len * Math.cos(angle),
              y: start.y + len * Math.sin(angle),
            };

            const arrow = calculateArrowhead(start, end, sw);

            // Check if shaft is uncollapsed (shaftEnd !== start)
            const isCollapsed = arrow.shaftEnd.x === start.x && arrow.shaftEnd.y === start.y;
            if (!isCollapsed) {
              testedCombinations++;

              const u = {
                x: Math.cos(arrow.headingRad),
                y: Math.sin(arrow.headingRad),
              };

              // Apex of the round linecap
              const rCap = sw * 0.5;
              const apex: Point = {
                x: arrow.shaftEnd.x + rCap * u.x,
                y: arrow.shaftEnd.y + rCap * u.y,
              };

              // 1. Distance between apex and notch must be zero (<= 1e-9)
              const distApexToNotch = distance(apex, arrow.notch);
              expect(distApexToNotch, `dist(apex, notch) for sw=${sw}, len=${len}, angle=${angle}`).toBeLessThan(1e-9);

              // 2. Vector projection comparison along heading
              const projApex = dotProduct({ x: apex.x - start.x, y: apex.y - start.y }, u);
              const projNotch = dotProduct({ x: arrow.notch.x - start.x, y: arrow.notch.y - start.y }, u);

              expect(projApex).toBeCloseTo(projNotch, 5);
              expect(projApex).toBeLessThanOrEqual(projNotch + 1e-9);
            }
          }
        }
      }

      // Ensure we tested a statistically significant number of non-degenerate combinations
      expect(testedCombinations).toBeGreaterThan(500);
    });
  });

  // =========================================================================
  // SECTION 5: Micro-Arrow Clamping & Short Vector Transitions
  // =========================================================================
  describe('5. Micro-Arrow Clamping (shaftEnd strictly collapses to start when length <= headLength or shaftLength <= 0)', () => {
    it('strictly collapses shaftEnd to start when length === 0', () => {
      const pt: Point = { x: 42, y: 84 };
      const arrow = calculateArrowhead(pt, pt, 6);
      expect(arrow.shaftEnd).toEqual({ x: 42, y: 84 });
    });

    it('identifies exact critical length L_crit where shaft transitions from collapsed to active', () => {
      /**
       * In calculateArrowhead:
       * When length is short (e.g. length <= baseHeadLength / 0.45):
       *   headLength = length * 0.45
       *   distToNotch = length - 0.75 * (length * 0.45) = length * (1 - 0.3375) = 0.6625 * length
       *   shaftLength = distToNotch - clearance = 0.6625 * length - strokeWidth * 0.5
       *
       * Setting shaftLength = 0:
       *   0.6625 * L_crit = 0.5 * strokeWidth
       *   L_crit = (0.5 / 0.6625) * strokeWidth = (40 / 53) * strokeWidth ≈ 0.754717 * strokeWidth.
       */
      const sw = 6;
      const lCrit = (0.5 / 0.6625) * sw; // ≈ 4.5283 px
      const start: Point = { x: 100, y: 100 };

      // Below critical length: shaftEnd must strictly equal start
      const subCritLengths = [0, 0.001, 1.0, 2.0, 3.0, 4.0, lCrit - 0.001, lCrit];
      for (const len of subCritLengths) {
        const end: Point = { x: start.x + len, y: start.y };
        const arrow = calculateArrowhead(start, end, sw);

        expect(arrow.shaftEnd.x, `length ${len} shaftEnd.x collapses`).toBe(start.x);
        expect(arrow.shaftEnd.y, `length ${len} shaftEnd.y collapses`).toBe(start.y);
      }

      // Above critical length: shaftEnd must be uncollapsed and strictly advance towards notch
      const superCritLengths = [lCrit + 0.01, 5.0, 6.0, 10.0, 20.0, 50.0];
      for (const len of superCritLengths) {
        const end: Point = { x: start.x + len, y: start.y };
        const arrow = calculateArrowhead(start, end, sw);

        expect(arrow.shaftEnd.x, `length ${len} shaftEnd.x advances`).toBeGreaterThan(start.x);
        expect(arrow.shaftEnd.x, `length ${len} shaftEnd.x stays behind notch`).toBeLessThanOrEqual(arrow.notch.x);
      }
    });

    it('shaftLength monotonically increases as arrow length increases beyond critical threshold', () => {
      const sw = 6;
      const start: Point = { x: 0, y: 0 };
      let previousShaftDist = 0;

      for (let len = 5; len <= 100; len += 5) {
        const end: Point = { x: len, y: 0 };
        const arrow = calculateArrowhead(start, end, sw);

        const currentShaftDist = arrow.shaftEnd.x - start.x;
        expect(currentShaftDist).toBeGreaterThan(previousShaftDist);
        previousShaftDist = currentShaftDist;
      }
    });
  });

  // =========================================================================
  // SECTION 6: Interface Contract & ShapeRenderer / CanvasExporter Parity
  // =========================================================================
  describe('6. Interface Contract & Data Integrity', () => {
    it('returns all required properties according to PROJECT.md Contract §1', () => {
      const arrow = calculateArrowhead({ x: 0, y: 0 }, { x: 100, y: 0 }, 6);

      // Contract specifies: { headLength, headWidth, left, right, notch, tip, shaftEnd }
      expect(arrow).toHaveProperty('headLength');
      expect(arrow).toHaveProperty('headWidth');
      expect(arrow).toHaveProperty('left');
      expect(arrow).toHaveProperty('right');
      expect(arrow).toHaveProperty('notch');
      expect(arrow).toHaveProperty('tip');
      expect(arrow).toHaveProperty('shaftEnd');

      // Backward-compatible properties
      expect(arrow).toHaveProperty('wingLeft');
      expect(arrow).toHaveProperty('wingRight');
      expect(arrow).toHaveProperty('headingRad');
      expect(arrow).toHaveProperty('pathString');
      expect(arrow).toHaveProperty('casingStrokeWidth');
    });

    it('generates valid SVG polygon pathString matching Annotely standard', () => {
      const start: Point = { x: 10, y: 20 };
      const end: Point = { x: 110, y: 20 };
      const arrow = calculateArrowhead(start, end, 6);

      // Expected path string format: "M tipX tipY L leftX leftY L notchX notchY L rightX rightY Z"
      const expected = `M ${end.x} ${end.y} L ${arrow.wingLeft.x} ${arrow.wingLeft.y} L ${arrow.notch.x} ${arrow.notch.y} L ${arrow.wingRight.x} ${arrow.wingRight.y} Z`;
      expect(arrow.pathString).toBe(expected);
    });
  });
});
