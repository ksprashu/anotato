import { Point, ViewportState } from '../types';

export const MIN_ZOOM = 0.05; // 5%
export const MAX_ZOOM = 20.0; // 2000%
export const DEFAULT_PADDING = 32;

/**
 * Clamps a numerical value between min and max bounds.
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new Error(`Invalid clamp range: min (${min}) > max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Converts a Screen / Viewport coordinate (CSS pixels relative to canvas)
 * into an Intrinsic Image coordinate.
 */
export function screenToImage(point: Point, viewport: ViewportState): Point {
  const { zoom, panX, panY } = viewport;
  if (zoom === 0) {
    return { x: point.x - panX, y: point.y - panY };
  }
  return {
    x: (point.x - panX) / zoom,
    y: (point.y - panY) / zoom,
  };
}

/**
 * Converts an Intrinsic Image coordinate into a Screen / Viewport coordinate.
 */
export function imageToScreen(point: Point, viewport: ViewportState): Point {
  const { zoom, panX, panY } = viewport;
  return {
    x: point.x * zoom + panX,
    y: point.y * zoom + panY,
  };
}

/**
 * Computes the updated ViewportState when zooming around a screen focal point
 * (such as cursor position on wheel zoom or pinch center).
 * Guarantees that the image pixel under focalPointScreen remains unchanged in screen space.
 */
export function computeZoomTransform(
  currentViewport: ViewportState,
  focalPointScreen: Point,
  targetZoom: number,
  minZoom: number = MIN_ZOOM,
  maxZoom: number = MAX_ZOOM
): ViewportState {
  const clampedZoom = clamp(targetZoom, minZoom, maxZoom);
  const { zoom: oldZoom, panX: oldPanX, panY: oldPanY } = currentViewport;

  if (oldZoom <= 0 || clampedZoom === oldZoom) {
    return {
      zoom: clampedZoom,
      panX: oldPanX,
      panY: oldPanY,
    };
  }

  const scaleRatio = clampedZoom / oldZoom;
  const newPanX = focalPointScreen.x - scaleRatio * (focalPointScreen.x - oldPanX);
  const newPanY = focalPointScreen.y - scaleRatio * (focalPointScreen.y - oldPanY);

  return {
    zoom: clampedZoom,
    panX: newPanX,
    panY: newPanY,
  };
}

/**
 * Calculates exponential zoom delta for smooth scroll wheel zooming.
 */
export function computeZoomDelta(
  currentZoom: number,
  deltaY: number,
  zoomSensitivity: number = 0.0015,
  minZoom: number = MIN_ZOOM,
  maxZoom: number = MAX_ZOOM
): number {
  // Exponential scaling provides uniform visual speed across small and large zoom factors
  const factor = Math.exp(-deltaY * zoomSensitivity);
  return clamp(currentZoom * factor, minZoom, maxZoom);
}

// =========================================================================
// Zoom Presets & Quantization
// =========================================================================

/**
 * Standard 10-step zoom preset ladder matching the UI selector:
 * 10%, 25%, 33%, 50%, 67%, 75%, 100%, 125%, 150%, 200%.
 */
export const ZOOM_PRESETS = [
  0.10, // 10%
  0.25, // 25%
  0.33, // 33%
  0.50, // 50%
  0.67, // 67%
  0.75, // 75%
  1.00, // 100%
  1.25, // 125%
  1.50, // 150%
  2.00, // 200%
] as const;

export type ZoomPreset = (typeof ZOOM_PRESETS)[number];

/**
 * Quantizes mouse wheel deltaY into monotonic single-step transitions
 * across the 10-preset zoom ladder:
 * - Negative deltaY (scroll up): zooms in by 1 preset step (clamped at 2.00)
 * - Positive deltaY (scroll down): zooms out by 1 preset step (clamped at 0.10)
 * - Zero deltaY: returns currentZoom unchanged
 * - Off-ladder zoom: snaps to the immediate adjacent preset without multi-tier leap
 * - Floating point tolerance epsilon = 0.005 absorbs precision drift
 */
export function quantizeWheelZoom(currentZoom: number, deltaY: number): number {
  if (deltaY === 0) return currentZoom;
  const zoomIn = deltaY < 0;

  if (zoomIn) {
    for (let i = 0; i < ZOOM_PRESETS.length; i++) {
      if (ZOOM_PRESETS[i] > currentZoom + 0.005) {
        return ZOOM_PRESETS[i];
      }
    }
    return ZOOM_PRESETS[ZOOM_PRESETS.length - 1];
  } else {
    for (let i = ZOOM_PRESETS.length - 1; i >= 0; i--) {
      if (ZOOM_PRESETS[i] < currentZoom - 0.005) {
        return ZOOM_PRESETS[i];
      }
    }
    return ZOOM_PRESETS[0];
  }
}

/**
 * Calculates the auto-fit ViewportState to center and fit an image within the viewport.
 */
export function getFitToViewportTransform(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding: number = DEFAULT_PADDING,
  allowUpscale: boolean = false,
  minZoom: number = MIN_ZOOM,
  maxZoom: number = MAX_ZOOM
): ViewportState {
  if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  const availWidth = Math.max(viewportWidth - 2 * padding, 10);
  const availHeight = Math.max(viewportHeight - 2 * padding, 10);

  const scaleX = availWidth / imageWidth;
  const scaleY = availHeight / imageHeight;
  let fitZoom = Math.min(scaleX, scaleY);

  if (!allowUpscale) {
    fitZoom = Math.min(fitZoom, 1.0);
  }

  const zoom = clamp(fitZoom, minZoom, maxZoom);
  const panX = (viewportWidth - imageWidth * zoom) / 2;
  const panY = (viewportHeight - imageHeight * zoom) / 2;

  return {
    zoom,
    panX,
    panY,
  };
}

/**
 * Computes pan translation delta from drag movement.
 */
export function applyPanDelta(
  currentViewport: ViewportState,
  deltaScreenX: number,
  deltaScreenY: number
): ViewportState {
  return {
    zoom: currentViewport.zoom,
    panX: currentViewport.panX + deltaScreenX,
    panY: currentViewport.panY + deltaScreenY,
  };
}
