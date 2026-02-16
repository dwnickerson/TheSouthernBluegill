import { storage } from '../services/storage.js';

const VALID_THEMES = new Set(['light', 'dark', 'largemouth-bass', 'crappie', 'sba', 'bluegill']);

export function applySavedTheme() {
    const savedTheme = storage.getTheme();
    const theme = VALID_THEMES.has(savedTheme) ? savedTheme : 'sba';

    document.documentElement.setAttribute('data-theme', theme);
    return theme;
}
