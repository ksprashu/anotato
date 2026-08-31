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
          <path
            d={arrowhead.pathString}
            fill={colorDef.stroke}
            stroke={colorDef.stroke}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <BadgeRenderer
            annotation={annotation.id ? { id: annotation.id, index, geometry, style, note: '', createdAt: 0, updatedAt: 0 } : undefined}
            index={index}
            position={badgePos}
            color={style.color}
            isSelected={isSelected}
            isHovered={isHovered}
            isDraft={isDraft}
          />
        </g>
      );
    }

    case 'pin': {
      const { x, y } = geometry;

      return (
        <g data-testid="shape-pin" data-annotation-id={annotation.id} {...groupProps}>
          <g
            data-testid={`annotation-badge-${index}`}
            data-annotation-id={annotation.id}
            className={isDraft ? 'pointer-events-none select-none' : 'cursor-pointer transition-transform duration-150 ease-out'}
            style={{
              transformOrigin: `${x}px ${y - 20}px`,
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
                d={`M ${x} ${y} C ${x - 6} ${y - 8} ${x - 17} ${y - 14} ${x - 17} ${y - 20} A 17 17 0 1 1 ${x + 17} ${y - 20} C ${x + 17} ${y - 14} ${x + 6} ${y - 8} ${x} ${y} Z`}
                fill="none"
                stroke={colorDef.stroke}
                strokeWidth={4}
                strokeOpacity={isSelected ? 0.6 : 0.35}
                className="pointer-events-none"
              />
            )}
            <path
              d={`M ${x} ${y} C ${x - 4} ${y - 8} ${x - 14} ${y - 14} ${x - 14} ${y - 20} A 14 14 0 1 1 ${x + 14} ${y - 20} C ${x + 14} ${y - 14} ${x + 4} ${y - 8} ${x} ${y} Z`}
              fill={colorDef.badgeBg}
              stroke="#FFFFFF"
              strokeWidth={1.5}
              strokeDasharray={isDraft ? '4 3' : undefined}
              filter="url(#badge-drop-shadow)"
            />
            <text
              data-testid={`badge-text-${index}`}
              x={x}
              y={y - 20}
              textAnchor="middle"
              dominantBaseline="central"
              fill={colorDef.badgeText}
              fontSize={12}
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
