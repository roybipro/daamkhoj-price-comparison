import type { ThemeName } from '../types.js';

const STORAGE_KEY = 'daamkhoj:theme';

/* The initial theme is resolved by an inline script in index.html before first paint,
   so this only reads what is already applied and remembers an explicit choice. */
export const currentTheme = (): ThemeName =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

/* The browser bar colour, matching each theme's page background. */
const BAR_COLOUR: Record<ThemeName, string> = { light: '#f7f5f0', dark: '#141311' };

export function setTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOUR[theme]);
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
