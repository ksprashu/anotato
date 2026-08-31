import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, ChevronDown } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_PADDING,
  computeZoomTransform,
  getFitToViewportTransform,
} from '../../math/coordinates';
import { Point } from '../../types';

export const ZOOM_PRESETS = [
  0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0, 8.0, 10.0, 20.0,
];

export function getNextZoomIn(currentZoom: number): number {
  const nextPreset = ZOOM_PRESETS.find((z) => z > currentZoom + 0.005);
  if (nextPreset !== undefined) return Math.min(nextPreset, MAX_ZOOM);
  return Math.min(currentZoom * 1.25, MAX_ZOOM);
}

export function getNextZoomOut(currentZoom: number): number {
  const prevPresets = [...ZOOM_PRESETS].reverse();
  const prevPreset = prevPresets.find((z) => z < currentZoom - 0.005);
  if (prevPreset !== undefined) return Math.max(prevPreset, MIN_ZOOM);
  return Math.max(currentZoom / 1.25, MIN_ZOOM);
}

export interface ZoomControlsProps {
  className?: string;
  containerWidth?: number;
  containerHeight?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitToScreen?: () => void;
  onActualSize?: () => void;
  onSetZoom?: (zoom: number) => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  className = '',
  containerWidth = 1000,
  containerHeight = 700,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onActualSize,
  onSetZoom,
}) => {
  const { state, dispatch } = useApp();
  const { viewport, image } = state;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const disabled = !image;
  const currentZoom = viewport.zoom;
  const zoomPercentage = Math.round(currentZoom * 100);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const centerPoint: Point = {
    x: containerWidth / 2,
    y: containerHeight / 2,
  };

  const handleZoomIn = () => {
    if (onZoomIn) {
      onZoomIn();
      return;
    }
    const nextZoom = getNextZoomIn(currentZoom);
    const nextViewport = computeZoomTransform(viewport, centerPoint, nextZoom);
    dispatch({ type: 'SET_VIEWPORT', payload: nextViewport });
  };

  const handleZoomOut = () => {
    if (onZoomOut) {
      onZoomOut();
      return;
    }
    const nextZoom = getNextZoomOut(currentZoom);
    const nextViewport = computeZoomTransform(viewport, centerPoint, nextZoom);
    dispatch({ type: 'SET_VIEWPORT', payload: nextViewport });
  };

  const handleFitToScreen = () => {
    if (onFitToScreen) {
      onFitToScreen();
      return;
    }
    if (!image) return;
    const fitTransform = getFitToViewportTransform(
      image.naturalWidth,
      image.naturalHeight,
      containerWidth,
      containerHeight,
      DEFAULT_PADDING,
      false
    );
    dispatch({ type: 'SET_VIEWPORT', payload: fitTransform });
  };

  const handleActualSize = () => {
    if (onActualSize) {
      onActualSize();
      return;
    }
    if (!image) {
      dispatch({ type: 'SET_VIEWPORT', payload: { zoom: 1.0, panX: 0, panY: 0 } });
      return;
    }
    const panX = (containerWidth - image.naturalWidth) / 2;
    const panY = (containerHeight - image.naturalHeight) / 2;
    dispatch({ type: 'SET_VIEWPORT', payload: { zoom: 1.0, panX, panY } });
  };

  const handleSelectPreset = (presetZoom: number) => {
    setIsDropdownOpen(false);
    if (onSetZoom) {
      onSetZoom(presetZoom);
      return;
    }
    const nextViewport = computeZoomTransform(viewport, centerPoint, presetZoom);
    dispatch({ type: 'SET_VIEWPORT', payload: nextViewport });
  };

  return (
    <div
      className={`flex items-center gap-1 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-lg p-1 text-slate-700 dark:text-slate-200 shadow-sm select-none ${className}`}
      role="toolbar"
      aria-label="Zoom controls"
      data-testid="zoom-controls-toolbar"
    >
      {/* Zoom Out Button */}
      <button
        type="button"
        onClick={handleZoomOut}
        disabled={disabled || currentZoom <= MIN_ZOOM}
        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white active:scale-95 cursor-pointer"
        title="Zoom Out (-)"
        aria-label="Zoom Out"
        data-testid="zoom-out-btn"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Zoom Percentage Dropdown Trigger */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsDropdownOpen((prev) => !prev)}
          disabled={disabled}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-xs font-mono font-medium text-slate-700 dark:text-slate-200 min-w-[62px] justify-between cursor-pointer"
          title="Zoom Level (Click to choose preset)"
          aria-label={`Zoom level: ${zoomPercentage}%`}
          data-testid="zoom-level-dropdown-btn"
        >
          <span>{zoomPercentage}%</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {/* Preset Menu */}
        {isDropdownOpen && (
          <div
            className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-50 text-xs"
            role="menu"
            aria-label="Zoom presets"
            data-testid="zoom-preset-menu"
          >
            <div className="px-2 py-1 text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
              Zoom Presets
            </div>
            {[0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 4.0].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer ${
                  Math.round(currentZoom * 100) === Math.round(preset * 100)
                    ? 'text-amber-600 dark:text-amber-400 font-semibold bg-slate-100 dark:bg-slate-800/60'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
                role="menuitem"
                data-testid={`zoom-preset-${Math.round(preset * 100)}`}
              >
                <span>{Math.round(preset * 100)}%</span>
                {preset === 1.0 && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">1</span>}
              </button>
            ))}
            <div className="border-t border-slate-200 dark:border-slate-800 my-1" />
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                handleFitToScreen();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              role="menuitem"
              data-testid="zoom-menu-fit-to-screen"
            >
              <span>Fit to Screen</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">0</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                handleActualSize();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              role="menuitem"
              data-testid="zoom-menu-actual-size"
            >
              <span>Actual Size (100%)</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">1</span>
            </button>
          </div>
        )}
      </div>

      {/* Zoom In Button */}
      <button
        type="button"
        onClick={handleZoomIn}
        disabled={disabled || currentZoom >= MAX_ZOOM}
        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white active:scale-95 cursor-pointer"
        title="Zoom In (+)"
        aria-label="Zoom In"
        data-testid="zoom-in-btn"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* Fit to Screen Button */}
      <button
        type="button"
        onClick={handleFitToScreen}
        disabled={disabled}
        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 text-xs active:scale-95 cursor-pointer"
        title="Fit image to screen (0)"
        aria-label="Fit to screen"
        data-testid="fit-screen-btn"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {/* 100% Actual Size Button */}
      <button
        type="button"
        onClick={handleActualSize}
        disabled={disabled}
        className="px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-mono text-[11px] font-medium active:scale-95 cursor-pointer"
        title="Reset zoom to 100% (1)"
        aria-label="Actual size 100%"
        data-testid="actual-size-btn"
      >
        1:1
      </button>
    </div>
  );
};

export default ZoomControls;
