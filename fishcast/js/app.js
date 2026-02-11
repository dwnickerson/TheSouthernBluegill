// FishCast Main Application
// Entry point and coordinator for all modules

// Debug logging for module loading
console.log('🚀 Starting FishCast V2.0...');
console.log('📍 Current URL:', window.location.href);
console.log('🔧 Module import starting...');

import { storage } from './services/storage.js';
import { getLocation } from './services/geocoding.js';
import { getWeather } from './services/weatherAPI.js';
import { estimateWaterTemp } from './models/waterTemp.js';
import { renderForecast, showLoading, showError } from './ui/forecast.js';
import { renderFavorites } from './ui/favorites.js';
import {
    openTempReport,
    closeTempReport,
    submitTempReport,
    openCatchLog,
    closeCatchLog,
    submitCatchLog,
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
import { cToF } from './utils/math.js';

// Initialize application
function init() {
    console.log('🎣 FishCast V2.0 Initializing...');
    
    // Initialize theme
    initTheme();
    
    // Render favorites
    renderFavorites();
    
    // Load default settings
    loadDefaults();
    
    // Setup event listeners
    setupEventListeners();
    
    // Register service worker
    registerServiceWorker();
    
    console.log('✅ FishCast V2.0 Ready!');
}

// Theme management
function initTheme() {
    const theme = storage.getTheme();
    document.documentElement.setAttribute('data-theme', theme);
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', next);
    storage.setTheme(next);
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
    }
}

// Load default form values
function loadDefaults() {
    const defaultLocation = storage.getDefaultLocation();
    const defaultSpecies = storage.getDefaultSpecies();
    const defaultWaterBody = storage.getDefaultWaterBody();
    
    if (defaultLocation) {
        document.getElementById('location').value = defaultLocation;
    }
    if (defaultSpecies) {
        document.getElementById('species').value = defaultSpecies;
    }
    if (defaultWaterBody) {
        document.getElementById('waterType').value = defaultWaterBody;
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
        // Get location coordinates
        const coords = await getLocation(location);
        
        // Fetch weather data
        const weather = await getWeather(coords.lat, coords.lon, days);
        
        // Convert historical temps to Fahrenheit
        const historical_F = {
            daily: {
                temperature_2m_mean: weather.historical.daily.temperature_2m_mean.map(t => cToF(t)),
                cloud_cover_mean: weather.historical.daily.cloud_cover,
                wind_speed_10m_max: weather.historical.daily.wind_speed_10m_max
            }
        };
        
        // Estimate water temperature
        const waterTemp = await estimateWaterTemp(
            coords,
            waterType,
            new Date(),
            historical_F
        );
        
        // Render the forecast
        renderForecast({
            coords,
            waterTemp,
            weather,
            speciesKey,
            waterType,
            days
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
    btn.textContent = '⏳';
    btn.disabled = true;
    
    if (!navigator.geolocation) {
        showNotification('Geolocation not supported by your browser', 'error');
        btn.textContent = '📍';
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
                btn.textContent = '📍';
                btn.disabled = false;
            }
        },
        (error) => {
            showNotification('Could not get location: ' + error.message, 'error');
            btn.textContent = '📍';
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
    
    // Theme toggle
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    document.getElementById('waterTempBtn')?.addEventListener('click', openTempReport);
    
    // Note: tempReportForm listener is in modals.js (form is created dynamically)
    
    // Catch log form
    document.getElementById('catchLogForm')?.addEventListener('submit', submitCatchLog);
    
    // Settings links
    document.getElementById('settingsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        openSettings();
    });
    
    document.getElementById('aboutLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        openAbout();
    });
}

// Service worker registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/fishcast/sw.js')
            .then(reg => console.log('✅ Service Worker registered'))
            .catch(err => console.log('❌ Service Worker registration failed:', err));
    }
}

// Make functions available globally for onclick handlers
window.openTempReport = openTempReport;
window.closeTempReport = closeTempReport;
window.openCatchLog = openCatchLog;
window.closeCatchLog = closeCatchLog;
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
