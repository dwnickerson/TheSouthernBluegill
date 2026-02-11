// Modal UI Handlers
import { storage } from '../services/storage.js';
import { getCurrentDateTime } from '../utils/date.js';
import { getLocation } from '../services/geocoding.js';
import { API_CONFIG } from '../config/constants.js';

// Water Temperature Report Modal
export function openTempReport() {
    document.getElementById('reportDateTime').value = getCurrentDateTime();
    document.getElementById('tempReportModal').classList.add('show');
}

export function closeTempReport() {
    document.getElementById('tempReportModal').classList.remove('show');
    document.getElementById('tempReportForm').reset();
}

export async function submitTempReport(event) {
    event.preventDefault();
    
    const location = document.getElementById('reportLocation').value;
    const dateTime = document.getElementById('reportDateTime').value;
    const temp = document.getElementById('reportTemp').value;
    const waterBody = document.getElementById('reportWaterBody').value;
    const depth = document.getElementById('reportDepth').value;
    const notes = document.getElementById('reportNotes').value;
    
    if (!location || !dateTime || !temp || !waterBody) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    // Geocode the location
    let coords = { lat: 0, lon: 0 };
    try {
        const geoData = await getLocation(location);
        coords.lat = geoData.lat;
        coords.lon = geoData.lon;
    } catch (error) {
        console.error('Geocoding failed:', error);
        showNotification('Could not find location. Please check your entry and try again.', 'error');
        return;
    }
    
    const data = {
        timestamp: new Date(dateTime).toISOString(),
        location: location,
        latitude: coords.lat,
        longitude: coords.lon,
        waterBody: waterBody,
        temperature: parseFloat(temp),
        depth: depth ? parseInt(depth) : '',
        notes: notes,
        userAgent: navigator.userAgent
    };
    
    try {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '📤 Submitting...';
        submitBtn.disabled = true;
        
        await fetch(API_CONFIG.WEBHOOK.WATER_TEMP_SUBMIT, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        showNotification('Thank you! Your water temperature report helps improve accuracy for all anglers.', 'success');
        closeTempReport();
        
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        
    } catch (error) {
        console.error('Error submitting report:', error);
        showNotification('Could not submit report. Please check your internet connection and try again.', 'error');
        
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.textContent = '📤 Submit Report';
        submitBtn.disabled = false;
    }
}

// Catch Log Modal
export function openCatchLog() {
    document.getElementById('catchDateTime').value = getCurrentDateTime();
    document.getElementById('catchLogModal').classList.add('show');
}

export function closeCatchLog() {
    document.getElementById('catchLogModal').classList.remove('show');
    document.getElementById('catchLogForm').reset();
}

export function submitCatchLog(event) {
    event.preventDefault();
    
    const catchData = {
        id: Date.now(),
        species: document.getElementById('catchSpecies').value,
        count: parseInt(document.getElementById('catchCount').value),
        dateTime: document.getElementById('catchDateTime').value,
        location: document.getElementById('catchLocation').value,
        notes: document.getElementById('catchNotes').value
    };
    
    storage.addCatch(catchData);
    showNotification('Catch logged successfully!', 'success');
    closeCatchLog();
}

// Settings Modal
export function openSettings() {
    document.getElementById('settingsModal').classList.add('show');
    loadSettings();
}

export function closeSettings() {
    document.getElementById('settingsModal').classList.remove('show');
}

function loadSettings() {
    document.getElementById('defaultLocation').value = storage.getDefaultLocation();
    document.getElementById('defaultSpecies').value = storage.getDefaultSpecies();
    document.getElementById('defaultWaterBody').value = storage.getDefaultWaterBody();
}

export function saveSettings() {
    storage.setDefaultLocation(document.getElementById('defaultLocation').value);
    storage.setDefaultSpecies(document.getElementById('defaultSpecies').value);
    storage.setDefaultWaterBody(document.getElementById('defaultWaterBody').value);
    
    showNotification('Settings saved!', 'success');
    closeSettings();
}

export function exportAllData() {
    const data = {
        favorites: storage.getFavorites(),
        catches: storage.getCatches(),
        settings: {
            theme: storage.getTheme(),
            default_location: storage.getDefaultLocation(),
            default_species: storage.getDefaultSpecies(),
            default_water_body: storage.getDefaultWaterBody()
        },
        exported_at: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fishcast-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Data exported successfully!', 'success');
}

export function clearAllData() {
    if (!confirm('Are you sure you want to delete ALL data? This includes favorites, catches, and settings. This cannot be undone!')) {
        return;
    }
    
    if (!confirm('Really sure? This will permanently delete everything!')) {
        return;
    }
    
    storage.clearAll();
    showNotification('All data cleared!', 'error');
    closeSettings();
}

// About Modal
export function openAbout() {
    document.getElementById('aboutModal').classList.add('show');
}

export function closeAbout() {
    document.getElementById('aboutModal').classList.remove('show');
}

// Notification System
export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    if (type === 'success') {
        notification.style.background = '#27ae60';
    } else if (type === 'error') {
        notification.style.background = '#e74c3c';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Share Forecast
export function shareForecast() {
    if (!window.currentForecastData) {
        showNotification('Please generate a forecast first', 'error');
        return;
    }
    
    const { coords, waterTemp, speciesKey } = window.currentForecastData;
    const shareText = `FishCast Report - ${coords.name}: Water temp ${waterTemp.toFixed(1)}°F. Check it out at ${window.location.href}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'FishCast Report',
            text: shareText,
            url: window.location.href
        }).catch(err => console.log('Error sharing:', err));
    } else {
        navigator.clipboard.writeText(shareText);
        showNotification('Forecast copied to clipboard!', 'success');
    }
}

// Save Favorite
export function saveFavorite() {
    if (!window.currentForecastData) {
        showNotification('Please generate a forecast first', 'error');
        return;
    }
    
    const { coords, speciesKey, waterType } = window.currentForecastData;
    
    const favorite = {
        id: Date.now(),
        name: coords.name,
        lat: coords.lat,
        lon: coords.lon,
        species: speciesKey,
        waterType: waterType
    };
    
    storage.addFavorite(favorite);
    showNotification('Location saved to favorites!', 'success');
    renderFavorites();
}
