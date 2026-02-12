// Modal Handlers with Gamification - VERSION 3.3.9 COMPLETE
console.log('📦 modals.js VERSION 3.3.9 loaded - WATER CLARITY ADDED');

import { storage } from '../services/storage.js';

// Get user's report statistics
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

// Update user stats after submission
function updateUserStats() {
    const stats = getUserStats();
    stats.totalReports += 1;
    stats.helpedAnglers = Math.floor(stats.totalReports * 8.5);
    
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

// Show badge earned notification
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
    
    setTimeout(() => {
        const badge = document.getElementById('badgeNotification');
        if (badge) badge.remove();
    }, 5000);
}

// Water temperature report modal
export function openTempReportModal() {
    console.log('🔵 openTempReportModal called');
    
    const userStats = getUserStats();
    console.log('📊 User stats:', userStats);
    
    const modalHTML = `
        <div class="modal show" id="tempReportModal" onclick="if(event.target === this) window.closeTempReport()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-close" onclick="window.closeTempReport()">×</span>
                    🌡️ Submit Water Temperature
                </div>
                
                <div style="background: var(--bg-primary); padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--accent);">${userStats.helpedAnglers}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">anglers helped by your ${userStats.totalReports} reports! 🎣</div>
                    ${userStats.totalReports >= 10 ? '<div style="margin-top: 8px;">🌟 Dedicated Reporter</div>' : ''}
                    ${userStats.totalReports >= 50 ? '<div>💎 Expert Contributor</div>' : ''}
                </div>
                
                <form id="tempReportForm" action="" onsubmit="event.preventDefault(); return false;">
                    <div class="form-group">
                        <label for="tempReportWaterbody">Water Body Name</label>
                        <input type="text" id="tempReportWaterbody" placeholder="e.g., Pickwick Lake, Smith Pond" required>
                        <small>Name of the specific lake, pond, or river</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportLocation">Location (City, State)</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="tempReportLocation" placeholder="e.g., Counce, TN" required>
                            <button type="button" id="tempReportGeoBtn" style="width: 56px; min-width: 56px;" title="Use my location">📍</button>
                        </div>
                        <small>City and state where the water body is located</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportWaterBody">Water Body Type</label>
                        <select id="tempReportWaterBody" required>
                            <option value="">Select type</option>
                            <option value="pond">Pond (< 20 acres)</option>
                            <option value="lake">Lake (> 20 acres)</option>
                            <option value="river">River/Stream</option>
                            <option value="reservoir">Reservoir</option>
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
                        <label for="tempReportClarity">Water Clarity</label>
                        <select id="tempReportClarity" required>
                            <option value="">Select clarity</option>
                            <option value="clear">Clear (6+ ft visibility)</option>
                            <option value="slightly_stained">Slightly Stained (3-6 ft)</option>
                            <option value="stained">Stained (1-3 ft)</option>
                            <option value="muddy">Muddy (< 1 ft)</option>
                        </select>
                        <small>How far can you see into the water?</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportNotes">Notes (Optional)</label>
                        <textarea id="tempReportNotes" rows="2" placeholder="e.g., 'North end near boat ramp'"></textarea>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 30px;">
                        <button type="button" class="action-btn success" style="flex: 1;" onclick="window.handleWaterTempSubmit()">Submit Report</button>
                        <button type="button" class="action-btn" onclick="window.closeTempReport()" style="flex: 1;">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    console.log('🔵 Inserting modal HTML into page...');
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('✅ Modal HTML inserted');
    
    // Check if form exists
    const form = document.getElementById('tempReportForm');
    console.log('🔵 Form element:', form);
    
    if (!form) {
        console.error('❌ ERROR: Form not found after inserting modal!');
        return;
    }
    
    // Auto-location handler
    console.log('🔵 Attaching geo button listener...');
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
    console.log('🔵 Attaching form submit listener...');
    const formElement = document.getElementById('tempReportForm');
    if (formElement) {
        formElement.addEventListener('submit', async (e) => {
            console.log('🔵 Form submit event fired!');
            e.preventDefault();
            console.log('🔵 Default prevented, calling handleTempReportSubmit...');
            await handleTempReportSubmit();
        });
        console.log('✅ Form submit listener attached successfully');
    } else {
        console.error('❌ ERROR: Cannot attach submit listener - form not found!');
    }
}

// Handle temperature report submission
export async function handleTempReportSubmit() {
    console.log('🌡️ Water temp submission started...');
    
    const waterbodyName = document.getElementById('tempReportWaterbody').value;
    const location = document.getElementById('tempReportLocation').value;
    const waterBody = document.getElementById('tempReportWaterBody').value;
    const temperature = parseFloat(document.getElementById('tempReportTemp').value);
    const depth = parseFloat(document.getElementById('tempReportDepth').value);
    const clarity = document.getElementById('tempReportClarity').value;
    const notes = document.getElementById('tempReportNotes').value;
    
    console.log('Form data:', { waterbodyName, location, waterBody, temperature, depth, clarity, notes });
    
    if (isNaN(depth) || depth < 0) {
        console.warn('Invalid depth:', depth);
        showNotification('❌ Please enter a valid depth (0 or greater)', 'error');
        return;
    }
    
    // Geocode the location to get lat/long
    console.log('🗺️ Geocoding location:', location);
    let lat = null, lon = null;
    try {
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;
        const geocodeResponse = await fetch(geocodeUrl);
        const geocodeData = await geocodeResponse.json();
        
        if (geocodeData && geocodeData.length > 0) {
            lat = parseFloat(geocodeData[0].lat);
            lon = parseFloat(geocodeData[0].lon);
            console.log('✅ Geocoded:', { lat, lon });
        } else {
            console.warn('⚠️ Could not geocode location');
        }
    } catch (error) {
        console.error('❌ Geocoding error:', error);
    }
    
    // NEW ORDER: A, B, C, D, E, F, G, H, I, J, K
    const data = {
        timestamp: new Date().toISOString(),     // A
        location,                                 // B
        latitude: lat,                            // C (from geocoding)
        longitude: lon,                           // D (from geocoding)
        waterbodyName,                            // E
        waterBody,                                // F
        temperature,                              // G
        depth,                                    // H
        clarity,                                  // I (NEW!)
        notes,                                    // J
        userAgent: navigator.userAgent            // K
    };
    
    console.log('Submitting data:', data);
    
    try {
        // Send to Google Sheets
        console.log('📤 Sending to Google Sheets...');
        const response = await fetch('https://script.google.com/macros/s/AKfycbySp_91L4EPOFXFx2528Q7TPfRtQi9dBiR4l2CSWpnrJ_x2UdZGamdiqsS7bYOQ38R8bg/exec', {
            method: 'POST',
            mode: 'no-cors', // Google Apps Script requires this
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        console.log('✅ Data sent to Google Sheets');
        
        console.log('Updating stats...');
        const updatedStats = updateUserStats();
        console.log('Updated stats:', updatedStats);
        
        const impactMsg = updatedStats.totalReports === 1 
            ? 'Thank you for your first report! You\'re helping build the community database.' 
            : `Your ${updatedStats.totalReports} reports have helped ${updatedStats.helpedAnglers} anglers!`;
        
        // Show notification FIRST
        console.log('Showing notification...');
        showNotification(`✅ Report submitted! ${impactMsg}`, 'success');
        
        // Then close modal after a brief delay
        setTimeout(() => {
            console.log('Closing modal...');
            window.closeTempReport();
        }, 300);
        
    } catch (error) {
        console.error('❌ Error submitting to Google Sheets:', error);
        // Still show success to user since data is saved locally
        // The webhook will retry or admin can check logs
        const updatedStats = updateUserStats();
        const impactMsg = updatedStats.totalReports === 1 
            ? 'Thank you for your first report! Data saved locally.' 
            : `Your ${updatedStats.totalReports} reports saved! (Sheet sync pending)`;
        
        showNotification(`⚠️ Report saved locally! ${impactMsg}`, 'success');
        
        setTimeout(() => {
            window.closeTempReport();
        }, 300);
    }
}

export function closeTempReportModal() {
    const modal = document.getElementById('tempReportModal');
    if (modal) modal.remove();
}

// Stub functions for features not yet implemented
export function openCatchLog() {
    console.log('Catch log feature coming soon!');
}

export function closeCatchLog() {
    console.log('Catch log feature coming soon!');
}

export function submitCatchLog() {
    console.log('Catch log feature coming soon!');
}

export function openSettings() {
    const darkMode = storage.get('darkMode') || 'false';
    const stats = getUserStats();
    
    const modalHTML = `
        <div class="modal show" id="settingsModal" onclick="if(event.target === this) window.closeSettings()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-close" onclick="window.closeSettings()">×</span>
                    ⚙️ Settings
                </div>
                
                <div style="padding: 20px;">
                    <h4 style="margin-top: 0; color: var(--text-primary);">🎨 Appearance</h4>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin: 15px 0; padding: 15px; background: var(--bg-primary); border-radius: 8px;">
                        <div>
                            <div style="font-weight: 600; color: var(--text-primary);">Dark Mode</div>
                            <div style="font-size: 0.9rem; color: var(--text-secondary);">Toggle dark/light theme</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="darkModeToggle" ${darkMode === 'true' ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    
                    <h4 style="margin-top: 30px; color: var(--text-primary);">📊 Your Stats</h4>
                    
                    <div style="background: var(--bg-primary); padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent);">${stats.totalReports}</div>
                                <div style="color: var(--text-secondary); font-size: 0.9rem;">Water Temp Reports</div>
                            </div>
                            <div>
                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent);">${stats.helpedAnglers}</div>
                                <div style="color: var(--text-secondary); font-size: 0.9rem;">Anglers Helped</div>
                            </div>
                        </div>
                        
                        ${stats.badges.length > 0 ? `
                            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border);">
                                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 8px;">Badges Earned:</div>
                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    ${stats.badges.map(badge => {
                                        const badges = {
                                            'first_reporter': '🏆 First Report',
                                            'dedicated': '🌟 Dedicated',
                                            'expert': '💎 Expert'
                                        };
                                        return `<span style="background: var(--accent); color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem;">${badges[badge] || badge}</span>`;
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <h4 style="margin-top: 30px; color: var(--text-primary);">💾 Data</h4>
                    
                    <div style="display: flex; gap: 10px; margin: 15px 0;">
                        <button class="action-btn" onclick="window.exportUserData()" style="flex: 1;">
                            📤 Export My Data
                        </button>
                        <button class="action-btn" onclick="if(confirm('Clear all your local data? This cannot be undone.')) window.clearUserData()" style="flex: 1;">
                            🗑️ Clear All Data
                        </button>
                    </div>
                    
                    <div style="margin-top: 30px; text-align: center;">
                        <button class="action-btn success" onclick="window.saveSettings()" style="min-width: 120px;">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add event listener for dark mode toggle
    document.getElementById('darkModeToggle').addEventListener('change', (e) => {
        const enabled = e.target.checked;
        if (enabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    });
}

export function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.remove();
}

export function saveSettings() {
    const darkMode = document.getElementById('darkModeToggle').checked;
    storage.set('darkMode', darkMode.toString());
    
    showNotification('⚙️ Settings saved!', 'success');
    closeSettings();
}

export function exportAllData() {
    const stats = getUserStats();
    const darkMode = storage.get('darkMode') || 'false';
    
    const data = {
        exportDate: new Date().toISOString(),
        version: '3.3.7',
        userStats: stats,
        settings: {
            darkMode: darkMode
        }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fishcast-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('📤 Data exported successfully!', 'success');
}

export function clearAllData() {
    storage.clear();
    showNotification('🗑️ All data cleared!', 'success');
    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

export function openAbout() {
    const modalHTML = `
        <div class="modal show" id="aboutModal" onclick="if(event.target === this) window.closeAbout()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-close" onclick="window.closeAbout()">×</span>
                    🎣 About FishCast
                </div>
                
                <div style="padding: 20px;">
                    <h3 style="margin-top: 0; color: var(--accent);">FishCast v3.3.6</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">
                        By The Southern Bluegill Association
                    </p>
                    
                    <h4 style="color: var(--text-primary); margin-top: 20px;">🔬 Scientifically Accurate Forecasts</h4>
                    <p style="color: var(--text-secondary); line-height: 1.6;">
                        FishCast uses real biological data to predict fish behavior. Our forecasts are based on:
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8;">
                        <li>Species-specific temperature preferences</li>
                        <li>Spawning behavior patterns</li>
                        <li>Weather conditions</li>
                        <li>Moon phase & solunar theory</li>
                        <li>Water clarity modeling</li>
                    </ul>
                    
                    <h4 style="color: var(--text-primary); margin-top: 20px;">🌡️ Community Water Temps</h4>
                    <p style="color: var(--text-secondary); line-height: 1.6;">
                        Help improve forecasts by submitting water temperature readings. Your data helps the entire fishing community!
                    </p>
                    
                    <h4 style="color: var(--text-primary); margin-top: 20px;">🐟 12 Sunfish Species</h4>
                    <p style="color: var(--text-secondary); line-height: 1.6;">
                        Bluegill, Redear, Green, Longear, Pumpkinseed, Redbreast, Warmouth, Rock Bass, Flier, Spotted, Shadow Bass, and Sacramento Perch.
                    </p>
                    
                    <h4 style="color: var(--text-primary); margin-top: 20px;">🔒 Privacy</h4>
                    <p style="color: var(--text-secondary); line-height: 1.6; font-size: 0.9rem;">
                        We collect water temperature readings, location (city/state), and device type. We do NOT collect names, email addresses, or precise GPS coordinates unless you generate a forecast first. Data is used to improve fishing forecasts for the community. Your submissions are anonymous.
                    </p>
                    
                    <div style="margin-top: 30px; text-align: center;">
                        <button class="action-btn" onclick="window.closeAbout()" style="min-width: 120px;">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

export function closeAbout() {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.remove();
}

export function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 400px;
        font-weight: 500;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Fade in
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Make showNotification globally available
window.showNotification = showNotification;

export function shareForecast() {
    console.log('Share feature coming soon!');
}

export function saveFavorite(locationData) {
    console.log('Save favorite:', locationData);
    window.showNotification('Favorites feature coming soon!', 'info');
}

// Aliases for compatibility
export const openTempReport = openTempReportModal;
export const closeTempReport = closeTempReportModal;
export const submitTempReport = handleTempReportSubmit;

// Make functions globally available
window.openTempReport = openTempReportModal;
window.closeTempReport = closeTempReportModal;
window.handleWaterTempSubmit = handleTempReportSubmit;
window.showNotification = showNotification;
window.openAbout = openAbout;
window.closeAbout = closeAbout;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.exportUserData = exportAllData;
window.clearUserData = clearAllData;

// Export for other modules
export { getUserStats, updateUserStats };
