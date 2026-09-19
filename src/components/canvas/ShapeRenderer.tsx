import React from 'react';
import { AnnotationGeometry, AnnotationStyle } from '../../types';
import { PRESET_COLORS } from '../../constants/colors';
import { calculateArrowhead } from '../../math/geometry';
import { getBadgePositionForShape } from '../../math/badges';
import { BadgeRenderer } from './BadgeRenderer';

export interface ShapeRendererProps {
  annotation: {
    id?: string;
    index?: number;
    geometry: AnnotationGeometry;
    style: AnnotationStyle;
  };
  isSelected?: boolean;
  isHovered?: boolean;
  isDraft?: boolean;
  resolutionScale?: number;
  onClick?: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function hexToRgba(hex: string, opacity: number): string {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

export const ShapeRenderer: React.FC<ShapeRendererProps> = ({
  annotation,
  isSelected = false,
  isHovered = false,
  isDraft = false,
  resolutionScale = 1.0,
  onClick,
  onPointerDown,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { geometry, style, index = 1 } = annotation;
  const colorDef = PRESET_COLORS[style.color] || PRESET_COLORS.amber;
  const fillColor = hexToRgba(colorDef.hex, style.fillOpacity);

  const groupProps = {
    onClick,
    onPointerDown,
    onMouseEnter,
    onMouseLeave,
    className: isDraft ? 'pointer-events-none' : 'cursor-pointer',
  };

  switch (geometry.type) {
    case 'highlight': {
      const { x, y, width, height, borderRadius = 4 } = geometry;
      const badgePos = { x, y };

      return (
        <g data-testid="shape-highlight" {...groupProps}>
          {(isHovered || isSelected) && (
            <rect
              x={x - 3}
              y={y - 3}
              width={width + 6}
              height={height + 6}
              rx={borderRadius + 2}
              ry={borderRadius + 2}
              fill="none"
              stroke={colorDef.stroke}
              strokeWidth={style.strokeWidth + 6}
              strokeOpacity={isSelected ? 0.5 : 0.3}
              className="pointer-events-none"
            />
          )}
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={borderRadius}
            ry={borderRadius}
            fill="transparent"
            stroke={isHovered || isSelected ? colorDef.stroke : (isDraft ? colorDef.stroke : 'rgba(255, 255, 255, 0.4)')}
            strokeWidth={style.strokeWidth}
            strokeDasharray={isDraft ? '6 4' : (isHovered || isSelected ? '4 4' : undefined)}
          />
          <BadgeRenderer
            annotation={annotation.id ? { id: annotation.id, index, geometry, style, note: '', createdAt: 0, updatedAt: 0 } : undefined}
            index={index}
            position={badgePos}
            color={style.color}
            isSelected={isSelected}
            isHovered={isHovered}
            isDraft={isDraft}
            scale={resolutionScale}
          />
        </g>
      );
    }

    case 'blur': {
      const { x, y, width, height, borderRadius = 2 } = geometry;
      const badgePos = { x, y };

      return (
        <g data-testid="shape-blur" {...groupProps}>
          {(isHovered || isSelected) && (
            <rect
              x={x - 3}
              y={y - 3}
              width={width + 6}
              height={height + 6}
              rx={borderRadius + 2}
              ry={borderRadius + 2}
              fill="none"
              stroke={colorDef.stroke}
              strokeWidth={style.strokeWidth + 6}
              strokeOpacity={isSelected ? 0.5 : 0.3}
              className="pointer-events-none"
            />
          )}
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={borderRadius}
            ry={borderRadius}
            fill="transparent"
            stroke={isHovered || isSelected || isDraft ? colorDef.stroke : 'rgba(255, 255, 255, 0.45)'}
            strokeWidth={style.strokeWidth}
            strokeDasharray={isHovered || isSelected || isDraft ? '4 4' : undefined}
          />
          <BadgeRenderer
            annotation={annotation.id ? { id: annotation.id, index, geometry, style, note: '', createdAt: 0, updatedAt: 0 } : undefined}
            index={index}
            position={badgePos}
            color={style.color}
            isSelected={isSelected}
            isHovered={isHovered}
            isDraft={isDraft}
            scale={resolutionScale}
          />
        </g>
      );
    }

    case 'box': {
      const { x, y, width, height, borderRadius = 4 } = geometry;
      const badgePos = { x, y };

      return (
        <g data-testid="shape-box" {...groupProps}>
          {(isHovered || isSelected) && (
            <rect
              x={x - 3}
              y={y - 3}
              width={width + 6}
              height={height + 6}
              rx={borderRadius + 2}
              ry={borderRadius + 2}
              fill="none"
              stroke={colorDef.stroke}
              strokeWidth={style.strokeWidth + 6}
              strokeOpacity={isSelected ? 0.5 : 0.3}
              className="pointer-events-none"
            />
          )}
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={borderRadius}
            ry={borderRadius}
            fill={fillColor}
            stroke={colorDef.stroke}
            strokeWidth={style.strokeWidth}
            strokeDasharray={isDraft ? '6 4' : undefined}
          />
          <BadgeRenderer
            annotation={annotation.id ? { id: annotation.id, index, geometry, style, note: '', createdAt: 0, updatedAt: 0 } : undefined}
            index={index}
            position={badgePos}
            color={style.color}
            isSelected={isSelected}
            isHovered={isHovered}
            isDraft={isDraft}
            scale={resolutionScale}
          />
        </g>
      );
    }

    case 'ellipse': {
      const { cx, cy, rx, ry } = geometry;
      const badgePos = getBadgePositionForShape(geometry);

      return (
        <g data-testid="shape-ellipse" {...groupProps}>
          {(isHovered || isSelected) && (
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx + 3}
              ry={ry + 3}
              fill="none"
              stroke={colorDef.stroke}
              strokeWidth={style.strokeWidth + 6}
              strokeOpacity={isSelected ? 0.5 : 0.3}
              className="pointer-events-none"
            />
          )}
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill={fillColor}
            stroke={colorDef.stroke}
            strokeWidth={style.strokeWidth}
            strokeDasharray={isDraft ? '6 4' : undefined}
          />
          <BadgeRenderer
            annotation={annotation.id ? { id: annotation.id, index, geometry, style, note: '', createdAt: 0, updatedAt: 0 } : undefined}
            index={index}
            position={badgePos}
            color={style.color}
            isSelected={isSelected}
            isHovered={isHovered}
            isDraft={isDraft}
            scale={resolutionScale}
          />
        </g>
      );
    }

    case 'arrow': {
      const { startX, startY, endX, endY } = geometry;
      const arrowhead = calculateArrowhead({ x: startX, y: startY }, { x: endX, y: endY }, style.strokeWidth);
      const badgePos = { x: startX, y: startY };

      return (
        <g data-testid="shape-arrow" {...groupProps}>
          {(isHovered || isSelected) && (
            <line
              x1={startX}
              y1={startY}
              x2={arrowhead.shaftEnd.x}
              y2={arrowhead.shaftEnd.y}
              stroke={colorDef.stroke}
              strokeWidth={style.strokeWidth + 6}
              strokeOpacity={isSelected ? 0.5 : 0.3}
              strokeLinecap="round"
              className="pointer-events-none"
            />
          )}
          <g data-testid="arrow-graphic" filter="url(#arrow-drop-shadow)">
            {/* Underlay casing shaft */}
            <line
              ref={(el) => {
                if (el) el.setAttribute('className', 'arrow-casing');
              }}
              x1={startX}
              y1={startY}
              x2={arrowhead.shaftEnd.x}
              y2={arrowhead.shaftEnd.y}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={style.strokeWidth + 3.5}
              strokeLinecap="round"
              className="arrow-casing pointer-events-none"
            />
            {/* Underlay casing arrowhead polygon */}
            <polygon
              points={`${arrowhead.tip.x},${arrowhead.tip.y} ${arrowhead.left.x},${arrowhead.left.y} ${arrowhead.notch.x},${arrowhead.notch.y} ${arrowhead.right.x},${arrowhead.right.y}`}
              stroke="rgba(0,0,0,0.55)"
              fill="rgba(0,0,0,0.55)"
              strokeWidth={3.5}
              strokeLinejoin="round"
            />
            {/* Foreground shaft line */}
            <line
              x1={startX}
              y1={startY}
              x2={arrowhead.shaftEnd.x}
              y2={arrowhead.shaftEnd.y}
              stroke={colorDef.stroke}
              strokeWidth={style.strokeWidth}
              strokeLinecap="round"
              strokeDasharray={isDraft ? '6 4' : undefined}
            />
            {/* Foreground arrowhead polygon */}
            <path
              d={arrowhead.pathString}
              fill={colorDef.stroke}
              stroke={colorDef.stroke}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          </g>
          <BadgeRenderer
            annotation={annotation.id ? { id: annotation.id, index, geometry, style, note: '', createdAt: 0, updatedAt: 0 } : undefined}
            index={index}
            position={badgePos}
            color={style.color}
            isSelected={isSelected}
            isHovered={isHovered}
            isDraft={isDraft}
            scale={resolutionScale}
          />
        </g>
      );
    }

    case 'pin': {
      const { x, y } = geometry;
      const safeScale = typeof resolutionScale === 'number' && Number.isFinite(resolutionScale) && resolutionScale > 0 ? resolutionScale : 1.0;
      const headRadius = Math.round(14 * safeScale);
      const pointerHeight = Math.round(20 * safeScale);
      const headCenterY = y - pointerHeight;
      const fontSize = Math.round(12 * safeScale);
      const ringRadius = headRadius + Math.round(3 * safeScale);

      return (
        <g data-testid="shape-pin" data-annotation-id={annotation.id} {...groupProps}>
          <g
            data-testid={`annotation-badge-${index}`}
            data-annotation-id={annotation.id}
            className={isDraft ? 'pointer-events-none select-none' : 'cursor-pointer transition-transform duration-150 ease-out'}
            style={{
              transformOrigin: `${x}px ${headCenterY}px`,
              transform: isHovered ? 'scale(1.15)' : 'scale(1)',
            }}
            onClick={groupProps.onClick}
            onPointerEnter={groupProps.onMouseEnter}
            onMouseEnter={groupProps.onMouseEnter}
            onPointerLeave={groupProps.onMouseLeave}
            onMouseLeave={groupProps.onMouseLeave}
          >
            {(isHovered || isSelected) && (
              <path
                d={`M ${x} ${y} C ${x - Math.round(6 * safeScale)} ${y - Math.round(8 * safeScale)} ${x - ringRadius} ${y - Math.round(14 * safeScale)} ${x - ringRadius} ${headCenterY} A ${ringRadius} ${ringRadius} 0 1 1 ${x + ringRadius} ${headCenterY} C ${x + ringRadius} ${y - Math.round(14 * safeScale)} ${x + Math.round(6 * safeScale)} ${y - Math.round(8 * safeScale)} ${x} ${y} Z`}
                fill="none"
                stroke={colorDef.stroke}
                strokeWidth={Math.max(4, 4 * safeScale)}
                strokeOpacity={isSelected ? 0.6 : 0.35}
                className="pointer-events-none"
              />
            )}
            <path
              d={`M ${x} ${y} C ${x - Math.round(4 * safeScale)} ${y - Math.round(8 * safeScale)} ${x - Math.round(14 * safeScale)} ${y - Math.round(14 * safeScale)} ${x - headRadius} ${headCenterY} A ${headRadius} ${headRadius} 0 1 1 ${x + headRadius} ${headCenterY} C ${x + Math.round(14 * safeScale)} ${y - Math.round(14 * safeScale)} ${x + Math.round(4 * safeScale)} ${y - Math.round(8 * safeScale)} ${x} ${y} Z`}
              fill={colorDef.badgeBg}
              stroke="#FFFFFF"
              strokeWidth={Math.max(1.5, 1.5 * safeScale)}
              strokeDasharray={isDraft ? '4 3' : undefined}
              filter="url(#badge-drop-shadow)"
            />
            <text
              data-testid={`badge-text-${index}`}
              x={x}
              y={headCenterY}
              textAnchor="middle"
              dominantBaseline="central"
              fill={colorDef.badgeText}
              fontSize={fontSize}
              fontWeight="700"
              fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
              className="select-none pointer-events-none"
            >
              {index}
            </text>
          </g>
        </g>
      );
    }
  }
};

export default ShapeRenderer;
