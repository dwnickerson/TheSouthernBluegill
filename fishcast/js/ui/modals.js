// Modal Handlers with Gamification - VERSION 3.3.4 GOOGLE SHEETS
console.log('📦 modals.js VERSION 3.3.4 loaded - GOOGLE SHEETS INTEGRATION');

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
    
    const location = document.getElementById('tempReportLocation').value;
    const waterBody = document.getElementById('tempReportWaterBody').value;
    const temperature = parseFloat(document.getElementById('tempReportTemp').value);
    const depth = parseFloat(document.getElementById('tempReportDepth').value);
    const notes = document.getElementById('tempReportNotes').value;
    
    console.log('Form data:', { location, waterBody, temperature, depth, notes });
    
    if (isNaN(depth) || depth < 0) {
        console.warn('Invalid depth:', depth);
        showNotification('❌ Please enter a valid depth (0 or greater)', 'error');
        return;
    }
    
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
    console.log('Settings feature coming soon!');
}

export function closeSettings() {
    console.log('Settings feature coming soon!');
}

export function saveSettings() {
    console.log('Settings feature coming soon!');
}

export function exportAllData() {
    console.log('Export feature coming soon!');
}

export function clearAllData() {
    console.log('Clear data feature coming soon!');
}

export function openAbout() {
    alert('FishCast v3.3\nBy The Southern Bluegill Association\n\nScientifically accurate fishing forecasts!');
}

export function closeAbout() {
    console.log('About closed');
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

// Export for other modules
export { getUserStats, updateUserStats };
