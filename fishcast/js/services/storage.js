// LocalStorage wrapper service
import { CACHE_KEYS } from '../config/constants.js';

const STORAGE_VERSION = 2;

function getAllLocalStorageKeys() {
    return Object.keys(localStorage);
}

function migrateToV2() {
    const migrations = [
        ['lastSelectedSpecies', CACHE_KEYS.LAST_SELECTED_SPECIES],
        ['waterBodyFavorites', CACHE_KEYS.WATER_BODY_FAVORITES],
        ['recentReports', CACHE_KEYS.RECENT_REPORTS]
    ];

    migrations.forEach(([legacyKey, nextKey]) => {
        if (localStorage.getItem(nextKey) === null) {
            const legacyValue = localStorage.getItem(legacyKey);
            if (legacyValue !== null) {
                localStorage.setItem(nextKey, legacyValue);
            }
        }
    });

    getAllLocalStorageKeys()
        .filter(key => key.startsWith('waterTemp_'))
        .forEach(key => {
            const nextKey = `${CACHE_KEYS.WATER_TEMP_PREFIX}${key.replace('waterTemp_', '')}`;
            if (localStorage.getItem(nextKey) === null) {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    localStorage.setItem(nextKey, value);
                }
            }
        });
}

function runStorageMigrations() {
    const currentVersion = parseInt(localStorage.getItem(CACHE_KEYS.STORAGE_VERSION) || '1', 10);
    if (currentVersion < 2) {
        migrateToV2();
    }
    localStorage.setItem(CACHE_KEYS.STORAGE_VERSION, String(STORAGE_VERSION));
}

export const storage = {
    init() {
        try {
            runStorageMigrations();
            return true;
        } catch (error) {
            console.error('Error running storage migrations:', error);
            return false;
        }
    },

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

    // Clear all app data
    clearAll(options = {}) {
        const { includeDerived = true } = options;

        Object.values(CACHE_KEYS)
            .filter(key => !key.endsWith('_PREFIX'))
            .forEach(key => {
                this.remove(key);
            });

        // Remove legacy keys as part of migration-safe clear behavior
        ['lastSelectedSpecies', 'waterBodyFavorites', 'recentReports'].forEach(key => this.remove(key));

        if (includeDerived) {
            getAllLocalStorageKeys()
                .filter(key => key.startsWith(CACHE_KEYS.WATER_TEMP_PREFIX) || key.startsWith('waterTemp_'))
                .forEach(key => this.remove(key));
        }
    },

    // Backward compatibility for older callers
    clear() {
        return this.clearAll();
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

    // Water-body favorite presets (used in reporting)
    getWaterBodyFavorites() {
        return this.get(CACHE_KEYS.WATER_BODY_FAVORITES, []);
    },

    setWaterBodyFavorites(favorites) {
        return this.set(CACHE_KEYS.WATER_BODY_FAVORITES, favorites);
    },

    // Recent report shortcuts
    getRecentReports() {
        return this.get(CACHE_KEYS.RECENT_REPORTS, []);
    },

    setRecentReports(reports) {
        return this.set(CACHE_KEYS.RECENT_REPORTS, reports);
    },

    // Cached API data for stale fallbacks
    getWeatherCache() {
        return this.get(CACHE_KEYS.WEATHER_CACHE, {});
    },

    setWeatherCache(cache) {
        return this.set(CACHE_KEYS.WEATHER_CACHE, cache);
    },

    getGeocodeCache() {
        return this.get(CACHE_KEYS.GEOCODE_CACHE, {});
    },

    setGeocodeCache(cache) {
        return this.set(CACHE_KEYS.GEOCODE_CACHE, cache);
    },

    // Last selected species memory
    getLastSelectedSpecies() {
        return localStorage.getItem(CACHE_KEYS.LAST_SELECTED_SPECIES) || '';
    },

    setLastSelectedSpecies(species) {
        localStorage.setItem(CACHE_KEYS.LAST_SELECTED_SPECIES, species);
    },

    // Water temp memoized values
    getWaterTempEstimate(key) {
        return localStorage.getItem(`${CACHE_KEYS.WATER_TEMP_PREFIX}${key}`);
    },

    setWaterTempEstimate(key, value) {
        localStorage.setItem(`${CACHE_KEYS.WATER_TEMP_PREFIX}${key}`, value);
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
        catches.unshift(catchData); // Add to beginning
        return this.saveCatches(catches);
    },

    // Theme management
    getTheme() {
        return this.get(CACHE_KEYS.THEME, 'light');
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

    setDefaultLocation(location) {
        localStorage.setItem(CACHE_KEYS.DEFAULT_LOCATION, location);
    },

    setDefaultSpecies(species) {
        localStorage.setItem(CACHE_KEYS.DEFAULT_SPECIES, species);
    },

    setDefaultWaterBody(waterBody) {
        localStorage.setItem(CACHE_KEYS.DEFAULT_WATER_BODY, waterBody);
    }
};
