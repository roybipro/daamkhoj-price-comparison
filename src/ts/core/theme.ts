import type { ThemeName } from '../types.js';

const STORAGE_KEY = 'daamkhoj:theme';

/* The initial theme is resolved by an inline script in index.html before first paint,
   so this only reads what is already applied and remembers an explicit choice. */
export const currentTheme = (): ThemeName =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

export function setTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Private browsing or blocked storage: the toggle still works for this visit. */
  }
}

export function toggleTheme(): ThemeName {
  const next: ThemeName = currentTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
