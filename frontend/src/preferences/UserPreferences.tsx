import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeModePreference = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';
export type AccentPreference = 'default' | 'terracotta';
export type DensityPreference = 'comfortable' | 'compact';

interface UserPreferencesContextValue {
  theme: ThemeModePreference;
  resolvedTheme: ResolvedTheme;
  accent: AccentPreference;
  density: DensityPreference;
  setTheme: (theme: ThemeModePreference) => void;
  setAccent: (accent: AccentPreference) => void;
  setDensity: (density: DensityPreference) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);
const themeStorageKey = 'costalyx-theme';
const accentStorageKey = 'costalyx-accent';
const densityStorageKey = 'costalyx-density';

interface UserPreferencesProviderProps {
  children: React.ReactNode;
}

export function UserPreferencesProvider({ children }: UserPreferencesProviderProps) {
  const [theme, setTheme] = useState<ThemeModePreference>(() => readInitialTheme());
  const [accent, setAccent] = useState<AccentPreference>(() => readInitialAccent());
  const [density, setDensity] = useState<DensityPreference>(() => readInitialDensity());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => readSystemTheme());
  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const syncSystemTheme = (event: MediaQueryList | MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'light' : 'dark');
    };
    syncSystemTheme(query);
    query.addEventListener?.('change', syncSystemTheme);
    return () => query.removeEventListener?.('change', syncSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [resolvedTheme, theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    window.localStorage.setItem(accentStorageKey, accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    window.localStorage.setItem(densityStorageKey, density);
  }, [density]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, accent, density, setTheme, setAccent, setDensity }),
    [accent, density, resolvedTheme, theme]
  );

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences(): UserPreferencesContextValue {
  const value = useContext(UserPreferencesContext);
  if (!value) {
    throw new Error('useUserPreferences must be used within UserPreferencesProvider.');
  }
  return value;
}

function readInitialTheme(): ThemeModePreference {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 'dark';
  }
  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === 'system' || stored === 'dark' || stored === 'light') {
    return stored;
  }
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function readInitialAccent(): AccentPreference {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 'default';
  }
  const stored = window.localStorage.getItem(accentStorageKey);
  if (stored === 'default' || stored === 'terracotta') {
    return stored;
  }
  return document.documentElement.dataset.accent === 'terracotta' ? 'terracotta' : 'default';
}

function readInitialDensity(): DensityPreference {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 'comfortable';
  }
  const stored = window.localStorage.getItem(densityStorageKey);
  if (stored === 'comfortable' || stored === 'compact') {
    return stored;
  }
  return document.documentElement.dataset.density === 'compact' ? 'compact' : 'comfortable';
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
