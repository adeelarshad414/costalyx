import { Moon, Sun } from 'lucide-react';
import { useUserPreferences, type ThemeModePreference } from '../preferences/UserPreferences';
import { IconButton } from './Button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useUserPreferences();
  const nextTheme: ThemeModePreference = resolvedTheme === 'dark' ? 'light' : 'dark';

  return (
    <IconButton
      label={`Switch to ${nextTheme} theme`}
      aria-pressed={resolvedTheme === 'light'}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
      icon={resolvedTheme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
    />
  );
}
