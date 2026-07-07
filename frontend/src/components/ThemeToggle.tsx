import { Moon, Sun } from 'lucide-react';
import { useUserPreferences, type ThemePreference } from '../preferences/UserPreferences';

export function ThemeToggle() {
  const { theme, setTheme } = useUserPreferences();
  const nextTheme: ThemePreference = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === 'light'}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
    >
      {theme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
    </button>
  );
}
