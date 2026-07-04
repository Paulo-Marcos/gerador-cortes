import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeName = 'light' | 'dark';

export interface ThemeOption {
  name: ThemeName;
  label: string;
  preview: string;
}

const STORAGE_KEY = 'cortador-live-workbench-theme';
const DEFAULT_THEME: ThemeName = 'light';

export const THEMES: ThemeOption[] = [
  { name: 'light', label: 'Claro', preview: 'oklch(0.97 0.008 75)' },
  { name: 'dark', label: 'Escuro', preview: 'oklch(0.155 0.01 60)' },
];

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  themes: ThemeOption[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeName(value: string | null): value is ThemeName {
  return value === 'light' || value === 'dark';
}

function readStoredTheme(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isThemeName(stored) ? stored : DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-wb-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((current) => (current === 'light' ? 'dark' : 'light')),
      themes: THEMES,
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
