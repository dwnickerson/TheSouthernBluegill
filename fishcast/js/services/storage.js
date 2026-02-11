// LocalStorage wrapper service
import { CACHE_KEYS } from '../config/constants.js';

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
    
    // Clear all app data
    clearAll() {
        Object.values(CACHE_KEYS).forEach(key => {
            this.remove(key);
        });
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
