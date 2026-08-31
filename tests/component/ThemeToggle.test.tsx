import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ThemeProvider, useTheme } from '../../src/theme/ThemeContext';
import { ThemeToggle } from '../../src/components/toolbar/ThemeToggle';

// Test consumer to display active context values
const ThemeStatusDisplay: React.FC = () => {
  const { theme, resolvedTheme, isDark } = useTheme();
  return (
    <div>
      <span data-testid="active-theme">{theme}</span>
      <span data-testid="active-resolved">{resolvedTheme}</span>
      <span data-testid="active-is-dark">{isDark ? 'true' : 'false'}</span>
    </div>
  );
};

describe('ThemeToggle Component Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    vi.restoreAllMocks();
  });

  it('renders theme toggle button with accessible aria attributes', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle />
      </ThemeProvider>
    );

    const btn = screen.getByTestId('theme-toggle-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('role', 'button');
    expect(btn).toHaveAttribute('aria-label', 'Switch to light theme');
    expect(screen.getByTestId('icon-sun')).toBeInTheDocument();
  });

  it('toggles theme from dark to light on click and updates documentElement class', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle />
        <ThemeStatusDisplay />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('active-resolved')).toHaveTextContent('dark');

    const btn = screen.getByTestId('theme-toggle-btn');
    await user.click(btn);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(screen.getByTestId('active-resolved')).toHaveTextContent('light');
    expect(screen.getByTestId('icon-moon')).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Switch to dark theme');
  });

  it('toggles back from light to dark on second click', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeToggle />
        <ThemeStatusDisplay />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    const btn = screen.getByTestId('theme-toggle-btn');

    await user.click(btn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('active-resolved')).toHaveTextContent('dark');
  });

  it('invokes custom onToggle callback if provided as prop', async () => {
    const user = userEvent.setup();
    const mockOnToggle = vi.fn();

    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    await user.click(screen.getByTestId('theme-toggle-btn'));
    expect(mockOnToggle).toHaveBeenCalledWith('light');
  });

  it('respects disabled prop and prevents clicks', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle disabled={true} />
        <ThemeStatusDisplay />
      </ThemeProvider>
    );

    const btn = screen.getByTestId('theme-toggle-btn');
    expect(btn).toBeDisabled();

    await user.click(btn);
    expect(screen.getByTestId('active-resolved')).toHaveTextContent('dark');
  });
});
