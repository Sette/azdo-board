import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { prefs } from './format.js';

const ThemeContext = createContext({
  theme: 'system',
  purple: false,
  resolvedTheme: 'light',
  setTheme: () => {},
  cycleTheme: () => {},
  setPurple: () => {},
  togglePurple: () => {},
});

const ORDER = ['light', 'dark', 'system'];

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = prefs.get('theme', 'system');
    if (saved === 'purple') {
      prefs.set('theme', 'system');
      prefs.set('palette', 'purple');
      return 'system';
    }
    return ORDER.includes(saved) ? saved : 'system';
  });
  const [purple, setPurpleState] = useState(() => {
    const savedPalette = prefs.get('palette', 'default');
    const savedTheme = prefs.get('theme', 'system');
    return savedPalette === 'purple' || savedTheme === 'purple';
  });
  const [sysDark, setSysDark] = useState(systemPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const onChange = (e) => setSysDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && sysDark);
  const resolvedTheme = purple ? (isDark ? 'purple-dark' : 'purple') : isDark ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [resolvedTheme, isDark]);

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

  const setPurple = useCallback((enabled) => {
    const val = Boolean(enabled);
    setPurpleState(val);
    prefs.set('palette', val ? 'purple' : 'default');
  }, []);

  const togglePurple = useCallback(() => {
    setPurpleState((cur) => {
      const next = !cur;
      prefs.set('palette', next ? 'purple' : 'default');
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, purple, resolvedTheme, setTheme, cycleTheme, setPurple, togglePurple }),
    [theme, purple, resolvedTheme, setTheme, cycleTheme, setPurple, togglePurple],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
