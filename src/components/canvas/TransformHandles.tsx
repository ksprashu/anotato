import React, { useRef, useCallback } from 'react';
import {
  Annotation,
  AnnotationGeometry,
  Point,
} from '../../types';
import {
  getGeometryBoundingBox,
  getResizeHandlePositions,
  applyHandleResize,
  HandleType,
  ResizeHandle,
} from '../../math/geometry';
import { useApp } from '../../state/AppContext';
import { screenToImage } from '../../math/coordinates';

export interface TransformHandlesProps {
  annotation: Annotation;
  zoom?: number;
  resolutionScale?: number;
  onGeometryChange?: (geometry: AnnotationGeometry) => void;
  onDragStart?: () => void;
  onDragEnd?: (finalGeometry: AnnotationGeometry) => void;
}

export const TransformHandles: React.FC<TransformHandlesProps> = ({
  annotation,
  zoom = 1.0,
  resolutionScale = 1.0,
  onGeometryChange,
  onDragStart,
  onDragEnd,
}) => {
  let appState = null;
  let appDispatch = null;
  let appTxManager = null;
  let appCommitGesture = null;

  try {
    const app = useApp();
    appState = app.state;
    appDispatch = app.dispatch;
    appTxManager = app.txManager;
    appCommitGesture = app.commitGesture;
  } catch {
    // Rendered outside AppProvider in isolated unit tests
  }

  const effectiveZoom = zoom > 0 ? zoom : appState?.viewport.zoom ?? 1.0;
  const safeScale = typeof resolutionScale === 'number' && Number.isFinite(resolutionScale) && resolutionScale > 0 ? resolutionScale : 1.0;

  const isDraggingRef = useRef(false);
  const activeHandleRef = useRef<HandleType | null>(null);
  const initialGeometryRef = useRef<AnnotationGeometry>(annotation.geometry);
  const currentGeometryRef = useRef<AnnotationGeometry>(annotation.geometry);
  currentGeometryRef.current = annotation.geometry;

  const handles = getResizeHandlePositions(annotation.geometry);
  const bbox = getGeometryBoundingBox(annotation.geometry, safeScale);

  // Scale-invariant sizing balanced with resolution scale
  const handleSize = Math.max((8 * safeScale) / effectiveZoom, 3 * safeScale);
  const hitAreaSize = Math.max((20 * safeScale) / effectiveZoom, 10 * safeScale);
  const strokeWidth = Math.max((1.5 * safeScale) / effectiveZoom, 0.5 * safeScale);
  const dashArray = `${(4 * safeScale) / effectiveZoom} ${(4 * safeScale) / effectiveZoom}`;

  // Handle Pointer Down on a specific resize handle
  const handleHandlePointerDown = useCallback(
    (e: React.PointerEvent, handleId: HandleType) => {
      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      activeHandleRef.current = handleId;
      initialGeometryRef.current = annotation.geometry;

      if (appTxManager && appState) {
        appTxManager.beginTransaction({
          annotations: appState.annotations,
          selectedAnnotationId: appState.selectedAnnotationId,
        });
      }

      if (onDragStart) {
        onDragStart();
      }

      const target = e.currentTarget as Element;
      if (typeof target.setPointerCapture === 'function') {
        try {
          target.setPointerCapture(e.pointerId);
        } catch (_err) {
          // Pointer capture unsupported in test environments
        }
      }
    },
    [annotation.geometry, appState, appTxManager, onDragStart]
  );

  // Handle Pointer Move during handle drag
  const handleHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current || !activeHandleRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const container = (e.currentTarget as Element).closest('[data-testid="canvas-workspace-container"]');
      const rect = container?.getBoundingClientRect() || { left: 0, top: 0 };

      const screenPoint: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const viewport = appState?.viewport ?? { zoom: effectiveZoom, panX: 0, panY: 0 };
      const currentImagePoint = screenToImage(screenPoint, viewport);

      const updatedGeometry = applyHandleResize(
        initialGeometryRef.current,
        activeHandleRef.current,
        currentImagePoint,
        e.shiftKey
      );

      currentGeometryRef.current = updatedGeometry;

      if (onGeometryChange) {
        onGeometryChange(updatedGeometry);
      } else if (appDispatch) {
        appDispatch({
          type: 'UPDATE_ANNOTATION_GEOMETRY',
          payload: {
            id: annotation.id,
            geometry: updatedGeometry,
          },
        });
      }
    },
    [appState?.viewport, effectiveZoom, annotation.id, appDispatch, onGeometryChange]
  );

  // Handle Pointer Up / Cancel
  const handleHandlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = false;
      activeHandleRef.current = null;

      const target = e.currentTarget as Element;
      if (typeof target.releasePointerCapture === 'function') {
        try {
          target.releasePointerCapture(e.pointerId);
        } catch (_err) {
          // Pointer capture unsupported in test environments
        }
      }

      if (appCommitGesture) {
        appCommitGesture();
      }

      if (onDragEnd) {
        onDragEnd(currentGeometryRef.current);
      }
    },
    [appCommitGesture, onDragEnd]
  );

  const isBoxOrEllipse =
    annotation.geometry.type === 'box' ||
    annotation.geometry.type === 'ellipse' ||
    annotation.geometry.type === 'highlight' ||
    annotation.geometry.type === 'blur';

  return (
    <g
      data-testid="transform-handles"
      className="select-none"
    >
      <g
        data-testid="transform-handles-group"
        onPointerMove={handleHandlePointerMove}
        onPointerUp={handleHandlePointerUp}
        onPointerCancel={handleHandlePointerUp}
      >
        {/* Bounding Box Outline for Box and Ellipse */}
        {isBoxOrEllipse && (
          <rect
            data-testid="transform-bounding-box"
            x={bbox.x}
            y={bbox.y}
            width={bbox.width}
            height={bbox.height}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            pointerEvents="none"
          />
        )}

        {/* Resize Handles */}
        {handles.map((handle: ResizeHandle) => (
          <g key={`handle-group-${handle.id}`}>
            {/* Invisible larger hit target area */}
            <rect
              data-testid={`transform-handle-hitarea-${handle.id}`}
              x={handle.x - hitAreaSize / 2}
              y={handle.y - hitAreaSize / 2}
              width={hitAreaSize}
              height={hitAreaSize}
              fill="transparent"
              style={{ cursor: handle.cursor }}
              onPointerDown={(e) => handleHandlePointerDown(e, handle.id)}
            />

            {/* Visible Handle Marker */}
            {annotation.geometry.type === 'arrow' || annotation.geometry.type === 'pin' ? (
              <circle
                data-testid={`transform-handle-${handle.id}`}
                cx={handle.x}
                cy={handle.y}
                r={handleSize / 2}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={strokeWidth}
                style={{ cursor: handle.cursor }}
                onPointerDown={(e) => handleHandlePointerDown(e, handle.id)}
              />
            ) : (
              <rect
                data-testid={`transform-handle-${handle.id}`}
                x={handle.x - handleSize / 2}
                y={handle.y - handleSize / 2}
                width={handleSize}
                height={handleSize}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={strokeWidth}
                style={{ cursor: handle.cursor }}
                onPointerDown={(e) => handleHandlePointerDown(e, handle.id)}
              />
            )}
          </g>
        ))}
      </g>
    </g>
  );
};

export default TransformHandles;
