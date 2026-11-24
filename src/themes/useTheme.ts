import { useEffect, useState } from 'react';
import { DEFAULT_THEME, getTheme, isThemeId, type ThemeId } from '../../shared/themes';

const STORAGE_KEY = 'domino-theme';

function storedTheme(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isThemeId(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function useTheme() {
  const [themeId, setThemeId] = useState(storedTheme);
  useEffect(() => {
    const theme = getTheme(themeId);
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    for (const [key, value] of Object.entries(theme.palette))
      root.style.setProperty(`--theme-${key}`, value);
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      // The selected theme still applies when storage is unavailable.
    }
  }, [themeId]);
  return { themeId, setThemeId };
}
