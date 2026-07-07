import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'dark' | 'light';
export type DensityPreference = 'comfortable' | 'compact';

interface UserPreferencesContextValue {
  theme: ThemePreference;
  density: DensityPreference;
  setTheme: (theme: ThemePreference) => void;
  setDensity: (density: DensityPreference) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);
const themeStorageKey = 'costalyx-theme';
const densityStorageKey = 'costalyx-density';

interface UserPreferencesProviderProps {
  children: React.ReactNode;
}

export function UserPreferencesProvider({ children }: UserPreferencesProviderProps) {
  const [theme, setTheme] = useState<ThemePreference>(() => readInitialTheme());
  const [density, setDensity] = useState<DensityPreference>(() => readInitialDensity());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    window.localStorage.setItem(densityStorageKey, density);
  }, [density]);

  const value = useMemo(() => ({ theme, density, setTheme, setDensity }), [density, theme]);

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences(): UserPreferencesContextValue {
  const value = useContext(UserPreferencesContext);
  if (!value) {
    throw new Error('useUserPreferences must be used within UserPreferencesProvider.');
  }
  return value;
}

function readInitialTheme(): ThemePreference {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 'dark';
  }
  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
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
