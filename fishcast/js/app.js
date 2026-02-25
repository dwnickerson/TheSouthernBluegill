// FishCast Main Application
// Entry point and coordinator for all modules
import { createLogger } from './utils/logger.js';

const debugLog = createLogger('app');
debugLog('FishCast starting', window.location.href);

import { storage } from './services/storage.js';
import { getLocation } from './services/geocoding.js';
import { getWeather } from './services/weatherAPI.js';
import { estimateWaterTemp, buildWaterTempView, projectWaterTemps } from './models/waterTemp.js';
import { renderForecast, showLoading, showError } from './ui/forecast.js';
import { normalizeWaterTempContext } from './models/waterPayloadNormalize.js';
import { applySavedTheme } from './utils/theme.js';
import { renderFavorites } from './ui/favorites.js';
import {
    openSettings,
    closeSettings,
    saveSettings,
    exportAllData,
    clearAllData,
    openAbout,
    closeAbout,
    showNotification,
    shareForecast,
    saveFavorite
} from './ui/modals.js';

// Initialize application
function init() {
    debugLog('FishCast initializing');
   
    storage.runMigrations();

    // Apply theme as early as possible
    applySavedTheme();

    // Render favorites
    renderFavorites();
   
    // Load default settings
    loadDefaults();
   
    // Setup event listeners
    setupEventListeners();
   
    // Initialize species memory feature
    initSpeciesMemory();
   
    // Register service worker with update handling
    registerServiceWorker();
   
    debugLog('FishCast ready');
}

// ... (keep loadDefaults, initSpeciesMemory, generateForecast, useCurrentLocation, setupEventListeners unchanged)

// Service worker registration with forced updates + auto-reload
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        const SW_VERSION = '5.0.0';  // ← SYNC THIS with your SW CACHE_VERSION and asset ?v= in HTML

        navigator.serviceWorker.register(`/fishcast/sw.js?v=${SW_VERSION}`, {
            scope: '/fishcast/',
            updateViaCache: 'none'  // ← Forces browser to ALWAYS fetch fresh sw.js (bypasses HTTP cache)
        })
        .then(registration => {
            debugLog(`Service Worker registered (v${SW_VERSION})`);

            // Force immediate update check (helps detect changes faster)
            registration.update();

            // Auto-reload page when new SW takes control (fixes "stuck after activation")
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                debugLog('New SW controller detected - reloading for fresh assets');
                window.location.reload();
            });

            // Optional: Detect waiting SW and auto-activate (or prompt)
            if (registration.waiting) {
                debugLog('Waiting SW found - sending SKIP_WAITING');
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            // Listen for future waiting states
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            debugLog('New SW installed & waiting - activating');
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                        }
                    });
                }
            });
        })
        .catch(err => debugLog('Service Worker registration failed:', err));
    } else {
        debugLog('Service Worker not supported in this browser');
    }
}

// Make functions available globally for onclick handlers
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.exportAllData = exportAllData;
window.clearAllData = clearAllData;
window.openAbout = openAbout;
window.closeAbout = closeAbout;
window.shareForecast = shareForecast;
window.saveFavorite = saveFavorite;
window.renderFavorites = renderFavorites;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
