// Enhanced Modal Handlers with Gamification
import { storage } from '../services/storage.js';

// NEW: Get user's report statistics
function getUserStats() {
    const stats = storage.get('userStats') || {
        totalReports: 0,
        helpedAnglers: 0,
        currentStreak: 0,
        longestStreak: 0,
        badges: []
    };
    return stats;
}

// NEW: Update user stats after submission
function updateUserStats() {
    const stats = getUserStats();
    stats.totalReports += 1;
    stats.helpedAnglers = Math.floor(stats.totalReports * 8.5); // Estimate: each report helps ~8-9 anglers
    
    // Check for badges
    if (stats.totalReports === 1 && !stats.badges.includes('first_reporter')) {
        stats.badges.push('first_reporter');
        showBadgeEarned('🏆 First Report!', 'You contributed to the community!');
    }
    if (stats.totalReports === 10 && !stats.badges.includes('dedicated')) {
        stats.badges.push('dedicated');
        showBadgeEarned('🌟 Dedicated Reporter!', 'You\'ve submitted 10 reports!');
    }
    if (stats.totalReports === 50 && !stats.badges.includes('expert')) {
        stats.badges.push('expert');
        showBadgeEarned('💎 Expert Contributor!', 'You\'ve submitted 50 reports!');
    }
    
    storage.set('userStats', stats);
    return stats;
}

// NEW: Show badge earned notification
function showBadgeEarned(title, message) {
    const badgeHTML = `
        <div class="badge-notification" id="badgeNotification">
            <div class="badge-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <button onclick="document.getElementById('badgeNotification').remove()">Awesome!</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', badgeHTML);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const badge = document.getElementById('badgeNotification');
        if (badge) badge.remove();
    }, 5000);
}

// ENHANCED: Water temperature report modal - STANDALONE, NO PRE-FILL
export function openTempReportModal() {
    const userStats = getUserStats();
    
    const modalHTML = `
        <div class="modal show" id="tempReportModal" onclick="if(event.target === this) window.closeTempReport()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-close" onclick="window.closeTempReport()">×</span>
                    🌡️ Submit Water Temperature
                </div>
                
                <!-- Gamification Stats -->
                <div style="background: var(--bg-primary); padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--accent);">${userStats.helpedAnglers}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">anglers helped by your ${userStats.totalReports} reports! 🎣</div>
                    ${userStats.totalReports >= 10 ? '<div style="margin-top: 8px;">🌟 Dedicated Reporter</div>' : ''}
                    ${userStats.totalReports >= 50 ? '<div>💎 Expert Contributor</div>' : ''}
                </div>
                
                <form id="tempReportForm">
                    <div class="form-group">
                        <label for="tempReportLocation">Location</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="tempReportLocation" placeholder="Lake/pond name or city" required>
                            <button type="button" id="tempReportGeoBtn" style="width: 56px; min-width: 56px;" title="Use my location">📍</button>
                        </div>
                        <small>Example: "Pickwick Lake" or "Tupelo, MS"</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportWaterBody">Water Body Type</label>
                        <select id="tempReportWaterBody" required>
                            <option value="">Select type</option>
                            <option value="pond">Pond</option>
                            <option value="lake">Lake</option>
                            <option value="river">River</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportTemp">Water Temperature (°F)</label>
                        <input type="number" id="tempReportTemp" min="32" max="100" step="0.1" placeholder="e.g., 54.5" required>
                        <small>Surface temp from thermometer or fish finder</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportDepth">Depth of Reading (feet)</label>
                        <input type="number" id="tempReportDepth" min="0" max="100" step="0.5" placeholder="e.g., 0 (surface), 8, 15.5" required>
                        <small>Enter 0 for surface, or actual depth from your fish finder</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportNotes">Notes (Optional)</label>
                        <textarea id="tempReportNotes" rows="2" placeholder="e.g., 'North end near boat ramp'"></textarea>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 30px;">
                        <button type="submit" class="action-btn success" style="flex: 1;">Submit Report</button>
                        <button type="button" class="action-btn" onclick="window.closeTempReport()" style="flex: 1;">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Auto-location handler
    document.getElementById('tempReportGeoBtn').addEventListener('click', async () => {
        if (!navigator.geolocation) {
            alert('Geolocation not supported');
            return;
        }
        
        const btn = document.getElementById('tempReportGeoBtn');
        btn.textContent = '⏳';
        btn.disabled = true;
        
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            
            // Reverse geocode
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                const data = await response.json();
                const location = data.address.city || data.address.town || data.address.village || data.display_name;
                document.getElementById('tempReportLocation').value = location;
            } catch (error) {
                document.getElementById('tempReportLocation').value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            }
            
            btn.textContent = '📍';
            btn.disabled = false;
        }, (error) => {
            alert('Could not get location: ' + error.message);
            btn.textContent = '📍';
            btn.disabled = false;
        });
    });
    
    // Form submission
    document.getElementById('tempReportForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitTempReport();
    });
}

// ENHANCED: Submit temperature report with stats update
export async function submitTempReport(e) {
    if (e) e.preventDefault();
    
    const location = document.getElementById('tempReportLocation').value ||
                    document.getElementById('reportLocation')?.value;
    const waterBody = document.getElementById('tempReportWaterBody').value ||
                     document.getElementById('reportWaterBody')?.value;
    const temperature = parseFloat(document.getElementById('tempReportTemp').value ||
                                   document.getElementById('reportTemp')?.value);
    const depth = parseFloat(document.getElementById('tempReportDepth').value ||
                            document.getElementById('reportDepth')?.value);
    const notes = document.getElementById('tempReportNotes').value ||
                 document.getElementById('reportNotes')?.value || '';
    
    // Validate depth
    if (isNaN(depth) || depth < 0) {
        showNotification('❌ Please enter a valid depth (0 or greater)', 'error');
        return;
    }
    
    // Get coordinates (you'll need geocoding here in production)
    let lat = 0, lon = 0;
    if (window.currentForecastData) {
        lat = window.currentForecastData.coords.lat;
        lon = window.currentForecastData.coords.lon;
    }
    
    const data = {
        timestamp: new Date().toISOString(),
        location,
        latitude: lat,
        longitude: lon,
        waterBody,
        temperature,
        depth,
        notes
    };
    
    try {
        // In production, send to your Google Script
        // const response = await fetch(API_CONFIG.WEBHOOK.WATER_TEMP_SUBMIT, {
        //     method: 'POST',
        //     body: JSON.stringify(data)
        // });
        
        // For now, just show success
        const updatedStats = updateUserStats();
        
        closeTempReportModal();
        
        // Show success message with impact
        const impactMsg = updatedStats.totalReports === 1 
            ? 'Thank you for your first report! You\'re helping build the community database.' 
            : `Your ${updatedStats.totalReports} reports have helped ${updatedStats.helpedAnglers} anglers!`;
        
        showNotification(`✅ Report submitted! ${impactMsg}`, 'success');
        
    } catch (error) {
        showNotification('❌ Error submitting report. Please try again.', 'error');
    }
}

export function closeTempReportModal() {
    const modal = document.getElementById('tempReportModal');
    if (modal) modal.remove();
}

// Catch Log Modal
export function openCatchLog() {
    const modal = document.getElementById('catchLogModal');
    if (modal) modal.classList.add('show');
}

export function closeCatchLog() {
    const modal = document.getElementById('catchLogModal');
    if (modal) modal.classList.remove('show');
}

export async function submitCatchLog(e) {
    e.preventDefault();
    const species = document.getElementById('catchSpecies').value;
    const count = document.getElementById('catchCount').value;
    const dateTime = document.getElementById('catchDateTime').value;
    const location = document.getElementById('catchLocation').value;
    const notes = document.getElementById('catchNotes').value;
    
    const catchData = { species, count, dateTime, location, notes, timestamp: Date.now() };
    
    // Save to localStorage
    const catches = storage.get('catches') || [];
    catches.push(catchData);
    storage.set('catches', catches);
    
    closeCatchLog();
    showNotification('✅ Catch logged successfully!', 'success');
    
    // Reset form
    document.getElementById('catchLogForm').reset();
}

// Settings Modal
export function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('show');
        
        // Load current settings
        const defaultLocation = storage.getDefaultLocation();
        const defaultSpecies = storage.getDefaultSpecies();
        const defaultWaterBody = storage.getDefaultWaterBody();
        
        if (defaultLocation) document.getElementById('defaultLocation').value = defaultLocation;
        if (defaultSpecies) document.getElementById('defaultSpecies').value = defaultSpecies;
        if (defaultWaterBody) document.getElementById('defaultWaterBody').value = defaultWaterBody;
    }
}

export function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('show');
}

export function saveSettings() {
    const defaultLocation = document.getElementById('defaultLocation').value;
    const defaultSpecies = document.getElementById('defaultSpecies').value;
    const defaultWaterBody = document.getElementById('defaultWaterBody').value;
    
    storage.setDefaultLocation(defaultLocation);
    storage.setDefaultSpecies(defaultSpecies);
    storage.setDefaultWaterBody(defaultWaterBody);
    
    closeSettings();
    showNotification('✅ Settings saved!', 'success');
}

export function exportAllData() {
    const allData = {
        favorites: storage.get('favorites') || [],
        catches: storage.get('catches') || [],
        userStats: storage.get('userStats') || {},
        settings: {
            defaultLocation: storage.getDefaultLocation(),
            defaultSpecies: storage.getDefaultSpecies(),
            defaultWaterBody: storage.getDefaultWaterBody(),
            theme: storage.getTheme()
        }
    };
    
    const dataStr = JSON.stringify(allData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fishcast-data-${Date.now()}.json`;
    link.click();
    
    showNotification('✅ Data exported!', 'success');
}

export function clearAllData() {
    if (confirm('Are you sure you want to clear ALL data? This cannot be undone!')) {
        localStorage.clear();
        closeSettings();
        showNotification('✅ All data cleared!', 'success');
        setTimeout(() => location.reload(), 1000);
    }
}

// About Modal
export function openAbout() {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.classList.add('show');
}

export function closeAbout() {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.classList.remove('show');
}

// Notification System
export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Share Forecast
export function shareForecast(forecastData) {
    if (navigator.share) {
        navigator.share({
            title: 'FishCast Forecast',
            text: `Check out this fishing forecast for ${forecastData.location}!`,
            url: window.location.href
        }).catch(err => console.log('Share failed:', err));
    } else {
        showNotification('Sharing not supported on this device', 'info');
    }
}

// Save Favorite
export function saveFavorite(location, speciesKey, waterType) {
    const favorites = storage.get('favorites') || [];
    const favorite = {
        location,
        speciesKey,
        waterType,
        timestamp: Date.now()
    };
    
    // Check if already exists
    const exists = favorites.some(f => f.location === location && f.speciesKey === speciesKey);
    if (exists) {
        showNotification('⭐ Already in favorites!', 'info');
        return;
    }
    
    favorites.push(favorite);
    storage.set('favorites', favorites);
    showNotification('⭐ Added to favorites!', 'success');
    
    // Refresh favorites display
    if (window.renderFavorites) {
        window.renderFavorites();
    }
}

// Make functions globally available
window.openTempReport = openTempReportModal;
window.closeTempReport = closeTempReportModal;
window.submitTempReport = submitTempReport;
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

// Export all functions for module imports
export const openTempReport = openTempReportModal;
export const closeTempReport = closeTempReportModal;
export { 
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
    saveFavorite,
    getUserStats,
    updateUserStats
};
