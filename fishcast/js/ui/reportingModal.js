// Modal Handlers with Gamification - VERSION 3.5.0

import { storage } from '../services/storage.js';
import { renderFavorites } from './favorites.js';
import { showNotification } from './notifications.js';
import { createLogger } from '../utils/logger.js';

const debugLog = createLogger('reporting-modal');


function escapeHTML(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================
// FEATURE 2: MULTIPLE FAVORITES
// ============================================

// Favorites storage
let waterBodyFavorites = [];

// Load favorites from localStorage
function loadFavorites() {
    const stored = storage.getWaterBodyFavorites();
    if (Array.isArray(stored)) {
        waterBodyFavorites = stored;
        waterBodyFavorites.sort((a, b) =>
            new Date(b.lastUsed) - new Date(a.lastUsed)
        );
    } else {
        waterBodyFavorites = [];
    }
    return waterBodyFavorites;
}

// Save favorites to localStorage
function saveFavorites() {
    // Limit to 10 favorites
    if (waterBodyFavorites.length > 10) {
        waterBodyFavorites = waterBodyFavorites.slice(0, 10);
    }
    storage.saveWaterBodyFavorites(waterBodyFavorites);
    debugLog(`Saved ${waterBodyFavorites.length} favorites`);
}

// Add new favorite
function addFavorite(name, location, waterType) {
    // Check if already exists
    const exists = waterBodyFavorites.find(f => 
        f.name.toLowerCase() === name.toLowerCase() && 
        f.location.toLowerCase() === location.toLowerCase()
    );
    
    if (exists) {
        // Update lastUsed
        exists.lastUsed = new Date().toISOString();
        showNotification('Favorite updated.', 'success');
    } else {
        // Add new
        const favorite = {
            id: `fav_${Date.now()}`,
            name,
            location,
            waterType,
            lastUsed: new Date().toISOString()
        };
        waterBodyFavorites.unshift(favorite);
        showNotification('Added to favorites.', 'success');
    }
    
    saveFavorites();
    populateFavoriteSelector();
}

// Remove favorite
function removeFavorite(id) {
    waterBodyFavorites = waterBodyFavorites.filter(f => f.id !== id);
    saveFavorites();
    populateFavoriteSelector();
    showNotification('Favorite removed.', 'success');
}

// Populate dropdown
function populateFavoriteSelector() {
    const selector = document.getElementById('favoriteSelector');
    if (!selector) return;
    
    // Clear existing options
    selector.innerHTML = '<option value="">Select a favorite or add new...</option>';
    
    // Add favorites
    waterBodyFavorites.forEach(fav => {
        const option = document.createElement('option');
        option.value = fav.id;
        option.textContent = `${fav.name} (${fav.location})`;
        selector.appendChild(option);
    });
    
    // Add "Add new" option
    const addNewOption = document.createElement('option');
    addNewOption.value = 'ADD_NEW';
    addNewOption.textContent = '➕ Add new location...';
    selector.appendChild(addNewOption);
}

// Handle favorite selection
function onFavoriteSelected(favoriteId) {
    const manualFields = document.getElementById('manualEntryFields');
    
    if (favoriteId === 'ADD_NEW') {
        // Show manual entry fields
        if (manualFields) {
            manualFields.style.display = 'block';
        }
        document.getElementById('tempReportWaterbody').value = '';
        document.getElementById('tempReportLocation').value = '';
        document.getElementById('tempReportWaterBody').value = 'pond';
    } else if (favoriteId) {
        // Load favorite data
        const favorite = waterBodyFavorites.find(f => f.id === favoriteId);
        if (favorite) {
            document.getElementById('tempReportWaterbody').value = favorite.name;
            document.getElementById('tempReportLocation').value = favorite.location;
            document.getElementById('tempReportWaterBody').value = favorite.waterType;
            
            // Hide manual entry fields
            if (manualFields) {
                manualFields.style.display = 'none';
            }
            
            // Update lastUsed
            favorite.lastUsed = new Date().toISOString();
            saveFavorites();
            
            debugLog(`Loaded favorite: ${favorite.name}`);
        }
    } else {
        // Nothing selected - show manual fields
        if (manualFields) {
            manualFields.style.display = 'block';
        }
    }
}

// Open manage favorites modal
function openManageFavoritesModal() {
    const modalHTML = `
        <div id="manageFavoritesModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="manageFavoritesTitle" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2 id="manageFavoritesTitle">Manage saved locations</h2>
                    <button type="button" class="close-btn" aria-label="Close manage favorites" onclick="closeManageFavorites()">×</button>
                </div>
                
                <div class="modal-body">
                    <p style="color: #666; margin-bottom: 20px;">
                        Save up to 10 water bodies for quick reporting
                    </p>
                    
                    <div id="favoritesList">
                        ${renderFavoritesList()}
                    </div>
                    
                    ${waterBodyFavorites.length === 0 ? `
                        <div style="text-align: center; padding: 40px 20px; color: #999;">
                            <p>No favorites yet!</p>
                            <p style="font-size: 14px;">Submit a water temp report to add your first favorite.</p>
                        </div>
                    ` : ''}
                </div>
                
                <div class="modal-footer">
                    <button class="action-btn secondary" onclick="closeManageFavorites()">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Render favorites list
function renderFavoritesList() {
    if (waterBodyFavorites.length === 0) return '';
    
    return waterBodyFavorites.map(fav => `
        <div class="favorite-item">
            <div class="favorite-info">
                <strong>${escapeHTML(fav.name)}</strong>
                <small>${escapeHTML(fav.location)} · ${escapeHTML(fav.waterType.charAt(0).toUpperCase() + fav.waterType.slice(1))}</small>
            </div>
            <button class="delete-btn" onclick="deleteFavoriteFromModal('${fav.id}')" aria-label="Remove saved location">Remove</button>
        </div>
    `).join('');
}

// Delete favorite from modal
window.deleteFavoriteFromModal = function(id) {
    removeFavorite(id);
    // Refresh the list
    const list = document.getElementById('favoritesList');
    if (list) {
        list.innerHTML = renderFavoritesList();
        
        // If no favorites left, show empty message
        if (waterBodyFavorites.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #999;">
                    <p>No favorites yet!</p>
                    <p style="font-size: 14px;">Submit a water temp report to add your first favorite.</p>
                </div>
            `;
        }
    }
};

// Close manage favorites modal
window.closeManageFavorites = function() {
    const modal = document.getElementById('manageFavoritesModal');
    if (modal) {
        modal.remove();
    }
};

// ============================================
// FEATURE 3: QUICK REPORT
// ============================================

// Track recent reports in localStorage
function trackRecentReport(reportData) {
    let recentReports = storage.getRecentReports();
    
    // Add new report
    recentReports.unshift({
        timestamp: reportData.timestamp || new Date().toISOString(),
        waterbodyName: reportData.waterbodyName,
        location: reportData.location,
        waterBody: reportData.waterBody
    });
    
    // Keep only last 10
    recentReports = recentReports.slice(0, 10);
    
    storage.saveRecentReports(recentReports);
}

// Get recent reports
function getRecentReports() {
    return storage.getRecentReports();
}

// Get locations for quick report (favorites + recent)
function getQuickReportLocations() {
    let locations = [];
    
    // Add favorites (already sorted by lastUsed)
    const favorites = loadFavorites();
    locations.push(...favorites.map(fav => ({
        id: fav.id,
        name: fav.name,
        location: fav.location,
        waterType: fav.waterType,
        source: 'favorite'
    })));
    
    // Add recent reports (not already in favorites)
    const recentReports = getRecentReports();
    recentReports.forEach(report => {
        const exists = locations.find(loc => 
            loc.name === report.waterbodyName && 
            loc.location === report.location
        );
        if (!exists) {
            locations.push({
                id: `recent_${report.timestamp}`,
                name: report.waterbodyName,
                location: report.location,
                waterType: report.waterBody,
                source: 'recent'
            });
        }
    });
    
    // Limit to 10
    return locations.slice(0, 10);
}

// Open Quick Report Modal
export function openQuickReportModal() {
    debugLog('Opening Quick Report modal...');
    
    // Get available locations
    const locations = getQuickReportLocations();
    
    if (locations.length === 0) {
        // No saved locations - redirect to full form
        showNotification('No saved locations yet. Use full report for your first entry.', 'info');
        setTimeout(() => {
            openTempReportModal();
        }, 1000);
        return;
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="quickReportModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="quickReportTitle" style="display: flex;">
            <div class="modal-content quick-report">
                <div class="modal-header">
                    <h2 id="quickReportTitle">Quick report</h2>
                    <button type="button" class="close-btn" aria-label="Close quick report" onclick="closeQuickReport()">×</button>
                </div>
                
                <div class="modal-body">
                    <!-- Location Selector -->
                    <div class="form-group">
                        <label for="quickReportLocation">Reporting from:</label>
                        <select id="quickReportLocation">
                            ${renderQuickReportLocations(locations)}
                        </select>
                        <small class="helper-text" id="locationHelper"></small>
                    </div>
                    
                    <!-- Temperature (Main Input) -->
                    <div class="form-group highlight">
                        <label for="quickReportTemp">Water Temperature</label>
                        <div class="temp-input">
                            <input type="number" id="quickReportTemp" 
                                   placeholder="65" 
                                   step="0.1" 
                                   autofocus 
                                   style="font-size: 32px; text-align: center; max-width: 150px;">
                            <span class="unit">°F</span>
                        </div>
                    </div>
                    
                    <!-- Optional: Depth -->
                    <div class="form-group optional">
                        <label for="quickReportDepth">Depth (optional)</label>
                        <select id="quickReportDepth">
                            <option value="0">Surface (0 ft)</option>
                            <option value="5">Shallow (5 ft)</option>
                            <option value="10">Medium (10 ft)</option>
                            <option value="15">Deep (15 ft)</option>
                            <option value="20">Very Deep (20+ ft)</option>
                        </select>
                    </div>
                    
                    <!-- Optional: Clarity -->
                    <div class="form-group optional">
                        <label for="quickReportClarity">Water Clarity (optional)</label>
                        <select id="quickReportClarity">
                            <option value="clear">Clear</option>
                            <option value="slightly_stained">Slightly Stained</option>
                            <option value="stained">Stained</option>
                            <option value="muddy">Muddy</option>
                        </select>
                    </div>
                    
                    <!-- Auto-filled Info -->
                    <div class="auto-info">
                        Date/time: Now (${new Date().toLocaleString()})
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="action-btn secondary" onclick="closeQuickReport()">Cancel</button>
                    <button class="action-btn success" onclick="submitQuickReport()">
                        Submit report
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Update helper text
    updateQuickReportHelper();
    
    // Attach location selector listener
    document.getElementById('quickReportLocation').addEventListener('change', updateQuickReportHelper);
    
    // Focus on temperature input
    setTimeout(() => {
        document.getElementById('quickReportTemp').focus();
    }, 100);
}

// Render locations dropdown
function renderQuickReportLocations(locations) {
    return locations.map(loc => `
        <option value="${loc.id}" 
                data-name="${escapeHTML(loc.name)}" 
                data-location="${escapeHTML(loc.location)}" 
                data-watertype="${escapeHTML(loc.waterType)}">
            ${escapeHTML(loc.name)} (${escapeHTML(loc.location)})
        </option>
    `).join('');
}

// Update helper text
function updateQuickReportHelper() {
    const selector = document.getElementById('quickReportLocation');
    const selected = selector.options[selector.selectedIndex];
    const helper = document.getElementById('locationHelper');
    
    if (selected && helper) {
        helper.textContent = `${selected.dataset.name}, ${selected.dataset.location} · ${selected.dataset.watertype}`;
    }
}

// Submit quick report
window.submitQuickReport = async function() {
    const locationSelector = document.getElementById('quickReportLocation');
    const selected = locationSelector.options[locationSelector.selectedIndex];
    
    const temperature = parseFloat(document.getElementById('quickReportTemp').value);
    const depth = parseFloat(document.getElementById('quickReportDepth').value);
    const clarity = document.getElementById('quickReportClarity').value;
    
    // Validate temperature
    if (!temperature || isNaN(temperature)) {
        showNotification('Enter water temperature.', 'error');
        return;
    }
    
    // Close quick report modal
    closeQuickReport();
    
    // Open temp report modal with pre-filled data
    openTempReportModal();
    
    // Wait for modal to be ready
    setTimeout(() => {
        // Fill in the form
        document.getElementById('tempReportWaterbody').value = selected.dataset.name;
        document.getElementById('tempReportLocation').value = selected.dataset.location;
        document.getElementById('tempReportWaterBody').value = selected.dataset.watertype;
        document.getElementById('tempReportTemp').value = temperature;
        document.getElementById('tempReportDepth').value = depth || 0;
        document.getElementById('tempReportClarity').value = clarity;
        
        // Auto-submit
        window.handleWaterTempSubmit();
    }, 300);
};

// Close quick report modal
window.closeQuickReport = function() {
    const modal = document.getElementById('quickReportModal');
    if (modal) {
        modal.remove();
    }
};

debugLog('Multiple Favorites & Quick Report features loaded');


// Get user's report statistics
export function getUserStats() {
    return storage.get('userStats') || {
        totalReports: 0,
        lastReportedAt: null
    };
}

// Update user stats after submission
export function updateUserStats() {
    const stats = getUserStats();
    stats.totalReports += 1;
    stats.lastReportedAt = new Date().toISOString();
    storage.set('userStats', stats);
    return stats;
}

// Water temperature report modal
export function openTempReportModal() {
    debugLog('openTempReportModal called');
    
        const modalHTML = `
        <div class="modal show" id="tempReportModal" role="dialog" aria-modal="true" aria-labelledby="tempReportTitle" onclick="if(event.target === this) window.closeTempReport()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <button type="button" class="modal-close" aria-label="Close submit temperature modal" onclick="window.closeTempReport()">×</button>
                    <span id="tempReportTitle">Submit water temperature</span>
                </div>
                <form id="tempReportForm" action="" onsubmit="event.preventDefault(); return false;">
                    <!-- FAVORITES SELECTOR -->
                    <div class="form-group">
                        <label for="favoriteSelector">Water Body</label>
                        <div style="display: flex; gap: 10px;">
                            <select id="favoriteSelector" style="flex: 1;">
                                <option value="">Select a favorite or add new...</option>
                            </select>
                            <button type="button" id="manageFavoritesBtn" class="icon-btn" title="Manage favorites" aria-label="Manage favorites">
                                Settings
                            </button>
                        </div>
                    </div>

                    <!-- MANUAL ENTRY FIELDS (shown when "Add new" selected) -->
                    <div id="manualEntryFields" style="display: block;">
                        <div class="form-group">
                            <label for="tempReportWaterbody">Water Body Name</label>
                            <input type="text" id="tempReportWaterbody" placeholder="e.g., Pickwick Lake" required>
                            <small>Name of the specific lake, pond, or river</small>
                        </div>
                        
                        <div class="form-group">
                            <label for="tempReportLocation">Location (City, State)</label>
                            <div style="display: flex; gap: 10px;">
                                <input type="text" id="tempReportLocation" placeholder="e.g., Counce, TN" required style="flex: 1;">
                                <button type="button" id="tempReportGeoBtn" style="width: 56px; height: 42px; padding: 8px;" title="Use current location" aria-label="Use current location for report">◎</button>
                            </div>
                            <small>City and state where the water body is located</small>
                        </div>
                        
                        <div class="form-group">
                            <label for="tempReportWaterBody">Water Body Type</label>
                            <select id="tempReportWaterBody" required>
                                <option value="">Select type</option>
                                <option value="pond">Pond (≤ 5 acres)</option>
                                <option value="lake">Lake (> 5 acres)</option>
                                <option value="river">River/Stream</option>
                                <option value="reservoir">Reservoir</option>
                            </select>
                        </div>
                        
                        <button type="button" id="saveAsFavoriteBtn" class="action-btn secondary" style="width: 100%; margin-top: 10px;">
                            Save as favorite
                        </button>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportDate">Date of Measurement</label>
                        <input type="date" id="tempReportDate" required>
                        <small>When did you take this reading?</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="tempReportTime">Time of Measurement</label>
                        <input type="time" id="tempReportTime" required>
                        <small>What time did you take this reading?</small>
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
    
    debugLog('🔵 Inserting modal HTML into page...');
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    
    // Set default date and time to NOW
    const now = new Date();
    const dateInput = document.getElementById('tempReportDate');
    const timeInput = document.getElementById('tempReportTime');
    
    // Format date as YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
    
    // Format time as HH:MM
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hours}:${minutes}`;
    
    debugLog(`🕐 Default measurement time set to: ${dateInput.value} ${timeInput.value}`);
    
    // Initialize favorites
    loadFavorites();
    populateFavoriteSelector();

    // Attach favorite selector listener
    const favoriteSelector = document.getElementById('favoriteSelector');
    if (favoriteSelector) {
        favoriteSelector.addEventListener('change', (e) => {
            onFavoriteSelected(e.target.value);
        });
    }

    // Attach manage favorites button
    const manageFavoritesBtn = document.getElementById('manageFavoritesBtn');
    if (manageFavoritesBtn) {
        manageFavoritesBtn.addEventListener('click', () => {
            openManageFavoritesModal();
        });
    }

    // Attach save as favorite button
    const saveAsFavoriteBtn = document.getElementById('saveAsFavoriteBtn');
    if (saveAsFavoriteBtn) {
        saveAsFavoriteBtn.addEventListener('click', () => {
            const name = document.getElementById('tempReportWaterbody').value;
            const location = document.getElementById('tempReportLocation').value;
            const waterType = document.getElementById('tempReportWaterBody').value;
            
            if (name && location && waterType) {
                addFavorite(name, location, waterType);
            } else {
                showNotification('Please fill in all fields first', 'error');
            }
        });
    }
    
    // Check if form exists
    const form = document.getElementById('tempReportForm');
    debugLog('🔵 Form element:', form);
    
    if (!form) {
        console.error('ERROR: Form not found after inserting modal!');
        return;
    }
    
    // Auto-location handler
    debugLog('🔵 Attaching geo button listener...');
    document.getElementById('tempReportGeoBtn').addEventListener('click', async () => {
        if (!navigator.geolocation) {
            alert('Geolocation not supported');
            return;
        }
        
        const btn = document.getElementById('tempReportGeoBtn');
        btn.textContent = '…';
        btn.disabled = true;
        
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                const data = await response.json();
                
                // Build "City, State" format
                const city = data.address.city || data.address.town || data.address.village || data.address.county;
                const state = data.address.state;
                
                let location;
                if (city && state) {
                    // Perfect: "Memphis, TN"
                    location = `${city}, ${state}`;
                } else if (city) {
                    // Just city: "Memphis"
                    location = city;
                } else if (state) {
                    // Just state (rare): "Tennessee"
                    location = state;
                } else {
                    // Fallback to coordinates
                    location = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                }
                
                document.getElementById('tempReportLocation').value = location;
                debugLog('Geolocated to:', location);
            } catch (error) {
                console.error('Reverse geocoding error:', error);
                document.getElementById('tempReportLocation').value = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            }
            
            btn.textContent = '◎';
            btn.disabled = false;
        }, (error) => {
            alert('Could not get location: ' + error.message);
            btn.textContent = '◎';
            btn.disabled = false;
        });
    });
    
    // Form submission
    debugLog('🔵 Attaching form submit listener...');
    const formElement = document.getElementById('tempReportForm');
    if (formElement) {
        formElement.addEventListener('submit', async (e) => {
            debugLog('🔵 Form submit event fired!');
            e.preventDefault();
            debugLog('🔵 Default prevented, calling handleTempReportSubmit...');
            await handleTempReportSubmit();
        });
        debugLog('Form submit listener attached successfully');
    } else {
        console.error('ERROR: Cannot attach submit listener - form not found!');
    }
}

// Handle temperature report submission
let isSubmitting = false; // Prevent double-submit

// Helper function to reset submit button state
function resetSubmitButton() {
    const submitBtn = document.querySelector('.action-btn.success');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    }
    isSubmitting = false;
}

export async function handleTempReportSubmit() {
    debugLog('Water temp submission started...');
    
    // Prevent double-submit
    if (isSubmitting) {
        debugLog('Submission already in progress, ignoring duplicate click');
        return;
    }
    
    // Disable submit button
    const submitBtn = document.querySelector('.action-btn.success');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        submitBtn.style.opacity = '0.6';
        submitBtn.style.cursor = 'not-allowed';
    }
    
    isSubmitting = true;
    
    try {
        const waterbodyName = document.getElementById('tempReportWaterbody').value || '';
        const location = document.getElementById('tempReportLocation').value || '';
        const waterBody = document.getElementById('tempReportWaterBody').value || '';
        const temperature = parseFloat(document.getElementById('tempReportTemp').value);
        const depth = parseFloat(document.getElementById('tempReportDepth').value);
        const clarity = document.getElementById('tempReportClarity').value || '';
        const notes = document.getElementById('tempReportNotes').value || '';
        
        // Get measurement date and time
        const measurementDate = document.getElementById('tempReportDate').value;
        const measurementTime = document.getElementById('tempReportTime').value;
        
        // Validate date/time
        if (!measurementDate || !measurementTime) {
            resetSubmitButton();
            showNotification('Please enter the date and time of your measurement', 'error');
            return;
        }
        
        // Create timestamp from user-entered date and time
        const measurementDateTime = new Date(`${measurementDate}T${measurementTime}`);
        const now = new Date();
        
        // Validate not in the future (allow 5 minute grace period for clock differences)
        if (measurementDateTime.getTime() > now.getTime() + (5 * 60 * 1000)) {
            resetSubmitButton();
            showNotification('Measurement time cannot be in the future', 'error');
            return;
        }
        
        // Validate not too old (max 30 days in the past for data quality)
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        if (measurementDateTime.getTime() < thirtyDaysAgo.getTime()) {
            resetSubmitButton();
            showNotification('Measurements older than 30 days may not be accurate. Please submit recent data.', 'error');
            return;
        }
        
        debugLog('Form data:', { waterbodyName, location, waterBody, temperature, depth, clarity, notes, measurementDate, measurementTime });
        debugLog('Measurement timestamp:', measurementDateTime.toISOString());
        debugLog('Form data types:', {
            waterbodyName: typeof waterbodyName,
            waterBody: typeof waterBody,
            clarity: typeof clarity,
            notes: typeof notes
        });
        
        // Validate location format
        if (!location || location.trim().length < 3) {
            resetSubmitButton();
            showNotification('Please enter a valid location (City, State).', 'error');
            return;
        }
        
        // Check for comma (suggests "City, State" format)
        if (!location.includes(',') && !location.includes(' ')) {
            resetSubmitButton();
            showNotification('Use "City, State" format (example: "Memphis, TN").', 'error');
            return;
        }
        
        if (isNaN(depth) || depth < 0) {
            debugLog('Invalid depth:', depth);
            resetSubmitButton();
            showNotification('Please enter a valid depth (0 or greater).', 'error');
            return;
        }
        
        // Geocode the location to get lat/long
        debugLog('Geocoding location', location);
        let lat = null, lon = null;
        
        // Try geocoding with retry logic
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                debugLog(`Geocoding attempt ${attempt}...`);
                const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;
                const geocodeResponse = await fetch(geocodeUrl);
                
                if (!geocodeResponse.ok) {
                    throw new Error(`Geocoding API error: ${geocodeResponse.status}`);
                }
                
                const geocodeData = await geocodeResponse.json();
                
                if (geocodeData && geocodeData.length > 0) {
                    lat = parseFloat(geocodeData[0].lat);
                    lon = parseFloat(geocodeData[0].lon);
                    debugLog('Geocoded:', { lat, lon });
                    break; // Success! Exit retry loop
                } else {
                    debugLog(`No results for location: "${location}"`);
                    if (attempt === 2) {
                        // Last attempt failed
                        resetSubmitButton();
                        showNotification('Location not found. Please use "City, State" format.', 'error');
                        return;
                    }
                }
            } catch (error) {
                console.error(`Geocoding error (attempt ${attempt}):`, error);
                if (attempt === 2) {
                    // Last attempt failed
                    resetSubmitButton();
                    showNotification('Geocoding failed. Check connection and try again.', 'error');
                    return;
                }
                // Wait 1 second before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Final check - don't submit without coordinates
        if (lat === null || lon === null) {
            console.error('Geocoding failed completely. Not submitting.');
            resetSubmitButton();
            showNotification('Cannot submit without location coordinates.', 'error');
            return;
        }
        
        // NEW ORDER: A, B, C, D, E, F, G, H, I, J, K
        const data = {
            timestamp: measurementDateTime.toISOString(),  // A - ACTUAL measurement time, not submission time
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
        
        debugLog('Submitting data:', data);
        
        const jsonBody = JSON.stringify(data);
        debugLog('📦 JSON body:', jsonBody);
        debugLog('📦 JSON length:', jsonBody.length);
        
        const reports = storage.get('waterTempReports') || [];
        reports.unshift(data);
        storage.set('waterTempReports', reports.slice(0, 200));
        debugLog('Updating stats...');
        const updatedStats = updateUserStats();
        debugLog('Updated stats:', updatedStats);
        
        // Track for quick report recent locations
        trackRecentReport({
            timestamp: measurementDateTime.toISOString(),
            waterbodyName,
            location,
            waterBody
        });
        
        // Auto-save as favorite if not already saved
        const isFavorite = waterBodyFavorites.find(f => 
            f.name.toLowerCase() === waterbodyName.toLowerCase() && 
            f.location.toLowerCase() === location.toLowerCase()
        );
        
        if (!isFavorite && waterBodyFavorites.length < 10) {
            addFavorite(waterbodyName, location, waterBody);
        }
        
        // Show notification FIRST
        debugLog('Showing notification...');
        showNotification('Report submitted successfully. Thank you for contributing water temperature data.', 'success');
        
        // Add closing animation and close modal
        setTimeout(() => {
            debugLog('Closing modal...');
            const modal = document.getElementById('tempReportModal');
            if (modal) {
                // Add fade-out animation
                modal.style.opacity = '0';
                modal.style.transition = 'opacity 0.3s ease';
                
                // Remove after animation completes
                setTimeout(() => {
                    // Reset button BEFORE closing modal
                    resetSubmitButton();
                    window.closeTempReport();
                }, 300);
            }
        }, 500);
        
    } catch (error) {
        console.error('Error saving report:', error);
        resetSubmitButton();
        showNotification('Unable to save report. Please try again.', 'error');
        
        setTimeout(() => {
            resetSubmitButton();
            window.closeTempReport();
        }, 300);
    }
}

export function closeTempReportModal() {
    debugLog('🔵 closeTempReportModal called');
    
    // CRITICAL: Reset submission flag when modal closes
    isSubmitting = false;
    
    const modal = document.getElementById('tempReportModal');
    debugLog('🔵 Modal element found:', modal);
    if (modal) {
        modal.remove();
        debugLog('Modal removed');
    } else {
        console.error('Modal element not found! Cannot close.');
    }
}

