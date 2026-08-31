import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  getStoredTheme,
  setStoredTheme,
  getSystemTheme,
} from '../../src/theme/ThemeContext';

describe('Theme Engine Unit Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    vi.restoreAllMocks();
  });

  describe('Suite 1: LocalStorage Storage Helpers', () => {
    it('returns defaultTheme when localStorage has no entry', () => {
      expect(getStoredTheme('system')).toBe('system');
      expect(getStoredTheme('dark')).toBe('dark');
      expect(getStoredTheme('light')).toBe('light');
    });

    it('retrieves valid theme strings from localStorage', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');

      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      expect(getStoredTheme()).toBe('light');

      localStorage.setItem(THEME_STORAGE_KEY, 'system');
      expect(getStoredTheme()).toBe('system');
    });

    it('falls back to default when localStorage contains invalid theme string', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid_theme');
      expect(getStoredTheme('dark')).toBe('dark');
    });

    it('writes theme modes to localStorage with setStoredTheme', () => {
      setStoredTheme('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

      setStoredTheme('light');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    });

    it('gracefully handles localStorage exceptions without throwing', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: Access Denied');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => getStoredTheme('dark')).not.toThrow();
      expect(getStoredTheme('dark')).toBe('dark');

      expect(() => setStoredTheme('light')).not.toThrow();
    });
  });

  describe('Suite 2: System Preference Detection', () => {
    it('detects dark preference from window.matchMedia', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(getSystemTheme()).toBe('dark');
    });

    it('detects light preference when matchMedia dark matches is false', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(getSystemTheme()).toBe('light');
    });
  });
});
