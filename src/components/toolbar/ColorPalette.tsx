import React from 'react';
import { useApp } from '../../state/AppContext';
import { PRESET_COLORS, COLOR_KEYS } from '../../constants/colors';
import { PresetColor } from '../../types';

export const STROKE_WIDTH_OPTIONS = [2, 4, 8] as const;
export const FILL_OPACITY_OPTIONS = [
  { value: 0, label: '0%', title: 'Outline (0% fill)' },
  { value: 0.15, label: '15%', title: 'Subtle (15% fill)' },
  { value: 0.3, label: '30%', title: 'Medium (30% fill)' },
  { value: 0.5, label: '50%', title: 'Semi-solid (50% fill)' },
] as const;

export interface ColorPaletteProps {
  className?: string;
  disabled?: boolean;
  onColorChange?: (color: PresetColor) => void;
  onStrokeWidthChange?: (width: number) => void;
  onFillOpacityChange?: (opacity: number) => void;
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({
  className = '',
  disabled = false,
  onColorChange,
  onStrokeWidthChange,
  onFillOpacityChange,
}) => {
  let appState = null;
  let appDispatch = null;
  try {
    const app = useApp();
    appState = app.state;
    appDispatch = app.dispatch;
  } catch {
    // Rendered outside AppProvider in isolated unit tests
  }

  const selectedAnnotationId = appState?.selectedAnnotationId ?? null;
  const annotations = appState?.annotations ?? [];
  const activeColor = appState?.activeColor ?? 'amber';
  const activeStrokeWidth = appState?.activeStrokeWidth ?? 2;
  const activeFillOpacity = appState?.activeFillOpacity ?? 0.15;

  // Resolve active styling: selected annotation takes precedence over default creation state
  const selectedAnnotation = selectedAnnotationId
    ? annotations.find((ann) => ann.id === selectedAnnotationId)
    : null;

  const currentColor = selectedAnnotation ? selectedAnnotation.style.color : activeColor;
  const currentStrokeWidth = selectedAnnotation ? selectedAnnotation.style.strokeWidth : activeStrokeWidth;
  const currentFillOpacity = selectedAnnotation ? selectedAnnotation.style.fillOpacity : activeFillOpacity;

  const handleColorSelect = (colorKey: PresetColor) => {
    if (disabled) return;
    if (onColorChange) {
      onColorChange(colorKey);
    } else if (appDispatch) {
      appDispatch({ type: 'SET_ACTIVE_COLOR', payload: colorKey });
    }
  };

  const handleStrokeWidthSelect = (width: number) => {
    if (disabled) return;
    if (onStrokeWidthChange) {
      onStrokeWidthChange(width);
    } else if (appDispatch) {
      appDispatch({ type: 'SET_ACTIVE_STROKE_WIDTH', payload: width });
    }
  };

  const handleFillOpacitySelect = (opacity: number) => {
    if (disabled) return;
    if (onFillOpacityChange) {
      onFillOpacityChange(opacity);
    } else if (appDispatch) {
      appDispatch({ type: 'SET_ACTIVE_FILL_OPACITY', payload: opacity });
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-lg p-1 px-2 text-slate-700 dark:text-slate-200 shadow-sm select-none ${className}`}
      role="toolbar"
      aria-label="Color and style palette"
      data-testid="color-palette"
    >
      {/* 1. Color Preset Swatches */}
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Color presets">
        {COLOR_KEYS.map((key) => {
          const colorDef = PRESET_COLORS[key];
          const isSelected = currentColor === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleColorSelect(key)}
              disabled={disabled}
              className={`w-5 h-5 rounded-full transition-all duration-150 flex items-center justify-center relative active:scale-95 cursor-pointer ${
                isSelected
                  ? 'ring-2 ring-slate-800 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-slate-900 scale-110 shadow-md'
                  : 'hover:scale-105 opacity-85 hover:opacity-100'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              style={{ backgroundColor: colorDef.hex }}
              title={`Color: ${colorDef.name}`}
              aria-label={`Color ${colorDef.name}`}
              aria-checked={isSelected}
              role="radio"
              data-testid={`color-btn-${key}`}
            >
              {isSelected && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: colorDef.badgeText === '#FFFFFF' ? '#FFFFFF' : '#1E293B' }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* 2. Stroke Width Controls (2px, 4px, 8px) */}
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Stroke width">
        {STROKE_WIDTH_OPTIONS.map((width) => {
          const isSelected = currentStrokeWidth === width;

          return (
            <button
              key={width}
              type="button"
              onClick={() => handleStrokeWidthSelect(width)}
              disabled={disabled}
              className={`px-1.5 py-1 rounded text-[11px] font-mono font-medium transition-colors flex items-center gap-1 active:scale-95 cursor-pointer ${
                isSelected
                  ? 'bg-slate-200 dark:bg-slate-700 text-amber-700 dark:text-amber-400 font-bold border border-slate-300 dark:border-slate-600'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={`Stroke width: ${width}px`}
              aria-label={`Stroke width ${width}px`}
              aria-checked={isSelected}
              role="radio"
              data-testid={`stroke-btn-${width}`}
            >
              <span
                className="inline-block w-3 rounded-full bg-current"
                style={{ height: `${width === 8 ? 6 : Math.max(2, width - 1)}px` }}
              />
              <span>{width}px</span>
            </button>
          );
        })}
      </div>

      <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* 3. Fill Opacity Controls (0%, 15%, 30%, 50%) */}
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Fill opacity">
        <span
          data-testid="fill-opacity-label"
          className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-0.5 select-none"
        >
          Fill
        </span>
        {FILL_OPACITY_OPTIONS.map((option) => {
          const isSelected = Math.abs(currentFillOpacity - option.value) < 0.05;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleFillOpacitySelect(option.value)}
              disabled={disabled}
              className={`px-1.5 py-1 rounded text-[11px] font-mono font-medium transition-colors active:scale-95 cursor-pointer ${
                isSelected
                  ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={option.title}
              aria-label={`Fill opacity ${option.label}`}
              aria-checked={isSelected}
              role="radio"
              data-testid={`opacity-btn-${Math.round(option.value * 100)}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ColorPalette;
