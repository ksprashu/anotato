import { useTheme } from '../theme/ThemeContext';

export {
  useTheme,
  ThemeProvider,
  THEME_STORAGE_KEY,
  getStoredTheme,
  setStoredTheme,
  getSystemTheme,
} from '../theme/ThemeContext';
export type { ThemeMode, ResolvedTheme, ThemeContextValue, ThemeProviderProps } from '../theme/ThemeContext';
export default useTheme;
