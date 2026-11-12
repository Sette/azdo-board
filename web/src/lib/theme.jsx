import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { prefs } from './format.js';

const ThemeContext = createContext({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
  cycleTheme: () => {},
});

const ORDER = ['light', 'dark', 'system'];

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = prefs.get('theme', 'system');
    return ORDER.includes(saved) ? saved : 'system';
  });
  const [sysDark, setSysDark] = useState(systemPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const onChange = (e) => setSysDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next) => {
    const val = ORDER.includes(next) ? next : 'system';
    setThemeState(val);
    prefs.set('theme', val);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((cur) => {
      const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
      prefs.set('theme', next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme, cycleTheme }), [theme, resolvedTheme, setTheme, cycleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
