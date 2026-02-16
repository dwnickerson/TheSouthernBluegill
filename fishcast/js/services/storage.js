// LocalStorage wrapper service
import { CACHE_KEYS } from '../config/constants.js';

const STORAGE_VERSION = 1;

const LEGACY_KEYS = {
    LAST_SELECTED_SPECIES: 'lastSelectedSpecies',
    WATER_BODY_FAVORITES: 'waterBodyFavorites',
    RECENT_REPORTS: 'recentReports',
    GEOCODE_CACHE_PREFIX: 'geocode_',
    WEATHER_CACHE_PREFIX: 'weather_',
    WATER_TEMP_MEMO_PREFIX: 'waterTemp_'
};

function safeGetRaw(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.error(`Error reading localStorage key (${key}):`, error);
        return null;
    }
}

function safeSetRaw(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.error(`Error writing localStorage key (${key}):`, error);
        return false;
    }
}

function migrateLegacyKey(legacyKey, newKey) {
    const legacyValue = safeGetRaw(legacyKey);
    const existingValue = safeGetRaw(newKey);
    if (legacyValue !== null && existingValue === null) {
        safeSetRaw(newKey, legacyValue);
    }
}

function migratePrefixedKeys(legacyPrefix, newPrefix) {
    try {
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
            if (!key.startsWith(legacyPrefix)) return;
            const suffix = key.slice(legacyPrefix.length);
            const newKey = `${newPrefix}${suffix}`;
            if (safeGetRaw(newKey) === null) {
                const raw = safeGetRaw(key);
                if (raw !== null) {
                    safeSetRaw(newKey, raw);
                }
            }
        });
    } catch (error) {
        console.error('Error migrating prefixed localStorage keys:', error);
    }
}

export const storage = {
    // Get item from localStorage
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Error reading from localStorage (${key}):`, error);
            return defaultValue;
        }
    },

    // Set item in localStorage
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Error writing to localStorage (${key}):`, error);
            return false;
        }
    },

    // Remove item from localStorage
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`Error removing from localStorage (${key}):`, error);
            return false;
        }
    },

    runMigrations() {
        const storedVersion = Number.parseInt(safeGetRaw(CACHE_KEYS.STORAGE_VERSION) || '0', 10);
        if (storedVersion >= STORAGE_VERSION) {
            return;
        }

        migrateLegacyKey(LEGACY_KEYS.LAST_SELECTED_SPECIES, CACHE_KEYS.LAST_SELECTED_SPECIES);
        migrateLegacyKey(LEGACY_KEYS.WATER_BODY_FAVORITES, CACHE_KEYS.WATER_BODY_FAVORITES);
        migrateLegacyKey(LEGACY_KEYS.RECENT_REPORTS, CACHE_KEYS.RECENT_REPORTS);

        migratePrefixedKeys(LEGACY_KEYS.GEOCODE_CACHE_PREFIX, CACHE_KEYS.GEOCODE_CACHE_PREFIX);
        migratePrefixedKeys(LEGACY_KEYS.WEATHER_CACHE_PREFIX, CACHE_KEYS.WEATHER_CACHE_PREFIX);
        migratePrefixedKeys(LEGACY_KEYS.WATER_TEMP_MEMO_PREFIX, CACHE_KEYS.WATER_TEMP_MEMO_PREFIX);

        safeSetRaw(CACHE_KEYS.STORAGE_VERSION, String(STORAGE_VERSION));
    },

    // Clear all app data
    clearAll() {
        Object.values(CACHE_KEYS).forEach(key => {
            if (key.endsWith('_PREFIX')) return;
            this.remove(key);
        });

        const prefixList = [
            CACHE_KEYS.GEOCODE_CACHE_PREFIX,
            CACHE_KEYS.WEATHER_CACHE_PREFIX,
            CACHE_KEYS.WATER_TEMP_MEMO_PREFIX,
            LEGACY_KEYS.GEOCODE_CACHE_PREFIX,
            LEGACY_KEYS.WEATHER_CACHE_PREFIX,
            LEGACY_KEYS.WATER_TEMP_MEMO_PREFIX
        ];

        const legacyDiscreteKeys = [
            LEGACY_KEYS.LAST_SELECTED_SPECIES,
            LEGACY_KEYS.WATER_BODY_FAVORITES,
            LEGACY_KEYS.RECENT_REPORTS
        ];

        try {
            Object.keys(localStorage).forEach((key) => {
                if (legacyDiscreteKeys.includes(key) || prefixList.some(prefix => key.startsWith(prefix))) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.error('Error clearing prefixed localStorage keys:', error);
        }
    },

    // Backward compatibility for older callers
    clear() {
        return this.clearAll();
    },

    getLastSelectedSpecies() {
        return safeGetRaw(CACHE_KEYS.LAST_SELECTED_SPECIES) || '';
    },

    setLastSelectedSpecies(species) {
        return safeSetRaw(CACHE_KEYS.LAST_SELECTED_SPECIES, species);
    },

    getWaterBodyFavorites() {
        return this.get(CACHE_KEYS.WATER_BODY_FAVORITES, []);
    },

    saveWaterBodyFavorites(favorites) {
        return this.set(CACHE_KEYS.WATER_BODY_FAVORITES, favorites);
    },

    getRecentReports() {
        return this.get(CACHE_KEYS.RECENT_REPORTS, []);
    },

    saveRecentReports(reports) {
        return this.set(CACHE_KEYS.RECENT_REPORTS, reports);
    },

    getGeocodeCache(input) {
        return this.get(`${CACHE_KEYS.GEOCODE_CACHE_PREFIX}${String(input).toLowerCase().trim()}`);
    },

    setGeocodeCache(input, value) {
        return this.set(`${CACHE_KEYS.GEOCODE_CACHE_PREFIX}${String(input).toLowerCase().trim()}`, value);
    },

    getWeatherCacheKey(lat, lon, days, variant = 'default') {
        return `${CACHE_KEYS.WEATHER_CACHE_PREFIX}${Number(lat).toFixed(4)}_${Number(lon).toFixed(4)}_${days}_${variant}`;
    },

    getWeatherCache(lat, lon, days, variant = 'default') {
        return this.get(this.getWeatherCacheKey(lat, lon, days, variant));
    },

    setWeatherCache(lat, lon, days, value, variant = 'default') {
        return this.set(this.getWeatherCacheKey(lat, lon, days, variant), value);
    },

    getWaterTempMemoKey(lat, lon, waterType) {
        return `${CACHE_KEYS.WATER_TEMP_MEMO_PREFIX}${Number(lat).toFixed(4)}_${Number(lon).toFixed(4)}_${waterType}`;
    },

    getWaterTempMemo(lat, lon, waterType) {
        const key = this.getWaterTempMemoKey(lat, lon, waterType);
        const value = safeGetRaw(key);
        return value === null ? null : Number.parseFloat(value);
    },

    setWaterTempMemo(lat, lon, waterType, temp) {
        const key = this.getWaterTempMemoKey(lat, lon, waterType);
        return safeSetRaw(key, Number(temp).toFixed(1));
    },

    // Favorites management
    getFavorites() {
        return this.get(CACHE_KEYS.FAVORITES, []);
    },

    saveFavorites(favorites) {
        return this.set(CACHE_KEYS.FAVORITES, favorites);
    },

    addFavorite(favorite) {
        const favorites = this.getFavorites();
        favorites.push(favorite);
        return this.saveFavorites(favorites);
    },

    removeFavorite(id) {
        const favorites = this.getFavorites();
        const filtered = favorites.filter(fav => fav.id !== id);
        return this.saveFavorites(filtered);
    },

    // Catches management
    getCatches() {
        return this.get(CACHE_KEYS.CATCHES, []);
    },

    saveCatches(catches) {
        return this.set(CACHE_KEYS.CATCHES, catches);
    },

    addCatch(catchData) {
        const catches = this.getCatches();
        catches.unshift(catchData);
        return this.saveCatches(catches);
    },

    // Theme management
    getTheme() {
        const rawTheme = safeGetRaw(CACHE_KEYS.THEME);
        if (rawTheme === null) return 'light';

        const validThemes = new Set(['light', 'dark', 'bluegill', 'largemouth-bass', 'crappie', 'sba', 'river-mist']);

        try {
            const parsedTheme = JSON.parse(rawTheme);
            return validThemes.has(parsedTheme) ? parsedTheme : 'light';
        } catch (error) {
            // Backward compatibility for legacy raw string values (e.g. dark)
            return validThemes.has(rawTheme) ? rawTheme : 'light';
        }
    },

    setTheme(theme) {
        return this.set(CACHE_KEYS.THEME, theme);
    },

    // Settings management
    getDefaultLocation() {
        return localStorage.getItem(CACHE_KEYS.DEFAULT_LOCATION) || '';
    },

    getDefaultSpecies() {
        return localStorage.getItem(CACHE_KEYS.DEFAULT_SPECIES) || '';
    },

    getDefaultWaterBody() {
        return localStorage.getItem(CACHE_KEYS.DEFAULT_WATER_BODY) || '';
    },

    getDefaultForecastDays() {
        return localStorage.getItem(CACHE_KEYS.DEFAULT_FORECAST_DAYS) || '';
    },

    setDefaultLocation(location) {
        localStorage.setItem(CACHE_KEYS.DEFAULT_LOCATION, location);
    },

    setDefaultSpecies(species) {
        localStorage.setItem(CACHE_KEYS.DEFAULT_SPECIES, species);
    },

    setDefaultWaterBody(waterBody) {
        localStorage.setItem(CACHE_KEYS.DEFAULT_WATER_BODY, waterBody);
    },

    setDefaultForecastDays(days) {
        localStorage.setItem(CACHE_KEYS.DEFAULT_FORECAST_DAYS, String(days));
    }
};
