import { storage } from '../services/storage.js';

const VALID_THEMES = new Set(['light', 'dark', 'bluegill', 'largemouth-bass', 'crappie']);

export function applySavedTheme() {
    const savedTheme = storage.getTheme();
    const theme = VALID_THEMES.has(savedTheme) ? savedTheme : 'light';

    document.documentElement.setAttribute('data-theme', theme);
    return theme;
}
