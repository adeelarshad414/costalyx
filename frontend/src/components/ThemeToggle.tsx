import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const storageKey = 'costalyx-theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';

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

function readInitialTheme(): Theme {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 'dark';
  }
  const stored = window.localStorage.getItem(storageKey);
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
