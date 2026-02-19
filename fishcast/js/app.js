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
   
    // Register service worker
    registerServiceWorker();
   
    debugLog('FishCast ready');
}


// Load default form values
function loadDefaults() {
    const defaultLocation = storage.getDefaultLocation();
    const defaultSpecies = storage.getDefaultSpecies();
    const defaultWaterBody = storage.getDefaultWaterBody();
    const defaultForecastDays = storage.getDefaultForecastDays();
   
    if (defaultLocation) {
        document.getElementById('location').value = defaultLocation;
    }
    if (defaultSpecies) {
        document.getElementById('species').value = defaultSpecies;
    }
    if (defaultWaterBody) {
        document.getElementById('waterType').value = defaultWaterBody;
    }
    if (defaultForecastDays) {
        document.getElementById('days').value = defaultForecastDays;
    }
}

// Initialize species memory feature
function initSpeciesMemory() {
    const speciesSelect = document.getElementById('species');
    
    // Remember last selected species
    const lastSpecies = storage.getLastSelectedSpecies();
    if (lastSpecies && speciesSelect) {
        // Check if the species still exists in the dropdown
        const option = speciesSelect.querySelector(`option[value="${lastSpecies}"]`);
        if (option) {
            speciesSelect.value = lastSpecies;
            debugLog(`Restored last species: ${lastSpecies}`);
        }
    }
    
    // Save species when changed
    if (speciesSelect) {
        speciesSelect.addEventListener('change', (e) => {
            const selectedSpecies = e.target.value;
            if (selectedSpecies) {
                storage.setLastSelectedSpecies(selectedSpecies);
                debugLog(`Saved species preference: ${selectedSpecies}`);
            }
        });
    }
}

// Main forecast generation
async function generateForecast(event) {
    event.preventDefault();
   
    const location = document.getElementById('location').value;
    const speciesKey = document.getElementById('species').value;
    const waterType = document.getElementById('waterType').value;
    const days = parseInt(document.getElementById('days').value);
   
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';
   
    showLoading();
   
    try {
        const runNow = new Date();

        // Get location coordinates
        const coords = await getLocation(location);
        if (coords.stale) {
            showNotification(`Using cached location data. ${coords.staleReason || ''}`.trim(), 'warning');
        }

        // Fetch weather data
        const weather = await getWeather(coords.lat, coords.lon, days);
        if (weather.stale) {
            showNotification(`Using cached weather data. ${weather.staleReason || ''}`.trim(), 'warning');
        }
       
        const waterContext = normalizeWaterTempContext({
            coords,
            waterType,
            timezone: weather?.forecast?.timezone || weather?.meta?.timezone || 'UTC',
            weatherPayload: {
                historical: weather.historical,
                forecast: weather.forecast,
                meta: { ...weather.meta, source: 'LIVE' }
            },
            nowOverride: runNow
        });

        // Estimate water temperature
        const waterTemp = await estimateWaterTemp(
            coords,
            waterType,
            new Date(waterContext.anchorDateISOZ),
            waterContext.payload,
            { context: waterContext }
        );

        const waterTempsEvolution = projectWaterTemps(
            waterTemp,
            weather.forecast,
            waterType,
            coords.lat,
            {
                anchorDate: runNow,
                tempUnit: weather?.meta?.units?.temp || 'F',
                precipUnit: weather?.meta?.units?.precip || 'in',
                historicalDaily: weather?.historical?.daily || {},
                context: waterContext,
                debug: localStorage.getItem('fishcast_debug_water_temp') === 'true'
            }
        );
        // Canonical "today" water temperature should come from estimateWaterTemp().
        // Projection day-0 is useful for trend continuity, but can diverge from the
        // direct estimate path and create confusing UI mismatches.
        const todayWaterTemp = waterTemp;

        const waterTempView = buildWaterTempView({
            dailySurfaceTemp: todayWaterTemp,
            waterType,
            context: waterContext
        });

        // Render the forecast
        renderForecast({
            coords,
            waterTemp: todayWaterTemp,
            waterTempView,
            waterContext,
            waterTempsEvolution,
            weather,
            speciesKey,
            waterType,
            days,
            runNow
        });
       
    } catch (error) {
        console.error('Error generating forecast:', error);
        showError(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate Forecast';
    }
}

// Geolocation
async function useCurrentLocation() {
    const btn = document.getElementById('geolocateBtn');
    btn.textContent = '…';
    btn.disabled = true;
   
    if (!navigator.geolocation) {
        showNotification('Geolocation not supported by your browser', 'error');
        btn.textContent = '◎';
        btn.disabled = false;
        return;
    }
   
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
               
                // Reverse geocode to get city name
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
                    { headers: { 'User-Agent': 'FishCast/2.0' } }
                );
                const data = await response.json();
               
                const city = data.address.city || data.address.town || data.address.village;
                const state = data.address.state;
               
                if (city && state) {
                    document.getElementById('location').value = `${city}, ${state}`;
                    showNotification('Location detected!', 'success');
                } else {
                    document.getElementById('location').value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                }
               
            } catch (error) {
                showNotification('Could not determine location name', 'error');
            } finally {
                btn.textContent = '◎';
                btn.disabled = false;
            }
        },
        (error) => {
            showNotification('Could not get location: ' + error.message, 'error');
            btn.textContent = '◎';
            btn.disabled = false;
        }
    );
}

// Setup all event listeners
function setupEventListeners() {
    // Forecast form
    document.getElementById('forecastForm')?.addEventListener('submit', generateForecast);
   
    // Geolocation
    document.getElementById('geolocateBtn')?.addEventListener('click', useCurrentLocation);

    // Save current location to favorites
    document.getElementById('saveLocationBtn')?.addEventListener('click', () => saveFavorite());
   
    // Settings links
    document.getElementById('settingsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        openSettings();
    });
   
    document.getElementById('aboutLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        openAbout();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        closeSettings();
        closeAbout();
    });
}


// Service worker registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/fishcast/sw.js')
            .then(() => debugLog('Service Worker registered'))
            .catch(err => debugLog('Service Worker registration failed:', err));
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
