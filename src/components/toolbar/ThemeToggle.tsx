import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme, ThemeMode } from '../../theme/ThemeContext';

export interface ThemeToggleProps {
  className?: string;
  disabled?: boolean;
  onToggle?: (nextTheme: ThemeMode) => void;
  showModeLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  disabled = false,
  onToggle,
  showModeLabel = false,
}) => {
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  const handleToggle = () => {
    if (disabled) return;
    if (onToggle) {
      const nextTheme: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
      onToggle(nextTheme);
    } else {
      toggleTheme();
    }
  };

  const isDarkMode = resolvedTheme === 'dark';
  const tooltipText = isDarkMode ? 'Switch to light theme (⌘D)' : 'Switch to dark theme (⌘D)';
  const ariaLabel = isDarkMode ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        data-testid="theme-toggle-btn"
        onClick={handleToggle}
        disabled={disabled}
        className={`p-2 rounded-lg border transition-all duration-150 flex items-center gap-1.5 cursor-pointer select-none active:scale-95 ${
          isDarkMode
            ? 'bg-slate-900/90 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border-slate-700/80 shadow-sm'
            : 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200 shadow-sm'
        } disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
        title={tooltipText}
        aria-label={ariaLabel}
        aria-pressed={isDarkMode}
        role="button"
      >
        {isDarkMode ? (
          <Sun className="w-4 h-4 text-amber-400 transition-transform hover:rotate-45" data-testid="icon-sun" />
        ) : (
          <Moon className="w-4 h-4 text-slate-700 transition-transform hover:-rotate-12" data-testid="icon-moon" />
        )}
        {showModeLabel && (
          <span className="text-xs font-medium capitalize">
            {theme === 'system' ? `System (${resolvedTheme})` : resolvedTheme}
          </span>
        )}
      </button>
    </div>
  );
};

export default ThemeToggle;
