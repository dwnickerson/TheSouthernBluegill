// Modal Handlers with Gamification - VERSION 3.5.0
console.log('📦 modals.js VERSION 3.5.0 loaded - Multiple Favorites + Quick Report + Fixes');

import { storage } from '../services/storage.js';

// ============================================
// FEATURE 2: MULTIPLE FAVORITES
// ============================================

// Favorites storage
let waterBodyFavorites = [];

// Load favorites from localStorage
function loadFavorites() {
    const stored = localStorage.getItem('waterBodyFavorites');
    if (stored) {
        try {
            waterBodyFavorites = JSON.parse(stored);
            // Sort by lastUsed (most recent first)
            waterBodyFavorites.sort((a, b) => 
                new Date(b.lastUsed) - new Date(a.lastUsed)
            );
        } catch (e) {
            console.error('Error loading favorites:', e);
            waterBodyFavorites = [];
        }
    }
    return waterBodyFavorites;
}

// Save favorites to localStorage
function saveFavorites() {
    // Limit to 10 favorites
    if (waterBodyFavorites.length > 10) {
        waterBodyFavorites = waterBodyFavorites.slice(0, 10);
    }
    localStorage.setItem('waterBodyFavorites', JSON.stringify(waterBodyFavorites));
    console.log(`💾 Saved ${waterBodyFavorites.length} favorites`);
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
        showNotification('⭐ Favorite updated!', 'success');
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
        showNotification('⭐ Added to favorites!', 'success');
    }
    
    saveFavorites();
    populateFavoriteSelector();
}

// Remove favorite
function removeFavorite(id) {
    waterBodyFavorites = waterBodyFavorites.filter(f => f.id !== id);
    saveFavorites();
    populateFavoriteSelector();
    showNotification('🗑️ Favorite removed', 'success');
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
        option.textContent = `🌊 ${fav.name} (${fav.location})`;
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
            
            console.log(`🌊 Loaded favorite: ${favorite.name}`);
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
        <div id="manageFavoritesModal" class="modal" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>⭐ Manage Favorites</h2>
                    <button class="close-btn" onclick="closeManageFavorites()">×</button>
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
                <strong>🌊 ${fav.name}</strong>
                <small>${fav.location} · ${fav.waterType.charAt(0).toUpperCase() + fav.waterType.slice(1)}</small>
            </div>
            <button class="delete-btn" onclick="deleteFavoriteFromModal('${fav.id}')">🗑️</button>
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
    let recentReports = JSON.parse(localStorage.getItem('recentReports') || '[]');
    
    // Add new report
    recentReports.unshift({
        timestamp: reportData.timestamp || new Date().toISOString(),
        waterbodyName: reportData.waterbodyName,
        location: reportData.location,
        waterBody: reportData.waterBody
    });
    
    // Keep only last 10
    recentReports = recentReports.slice(0, 10);
    
    localStorage.setItem('recentReports', JSON.stringify(recentReports));
}

// Get recent reports
function getRecentReports() {
    return JSON.parse(localStorage.getItem('recentReports') || '[]');
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
    console.log('⚡ Opening Quick Report modal...');
    
    // Get available locations
    const locations = getQuickReportLocations();
    
    if (locations.length === 0) {
        // No saved locations - redirect to full form
        showNotification('ℹ️ No saved locations. Use full form for first report.', 'info');
        setTimeout(() => {
            openTempReportModal();
        }, 1000);
        return;
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="quickReportModal" class="modal" style="display: flex;">
            <div class="modal-content quick-report">
                <div class="modal-header">
                    <h2>⚡ Quick Report</h2>
                    <button class="close-btn" onclick="closeQuickReport()">×</button>
                </div>
                
                <div class="modal-body">
                    <!-- Location Selector -->
                    <div class="form-group">
                        <label>Reporting from:</label>
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
                        <label>Depth (optional)</label>
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
                        <label>Water Clarity (optional)</label>
                        <select id="quickReportClarity">
                            <option value="clear">Clear</option>
                            <option value="slightly_stained">Slightly Stained</option>
                            <option value="stained">Stained</option>
                            <option value="muddy">Muddy</option>
                        </select>
                    </div>
                    
                    <!-- Auto-filled Info -->
                    <div class="auto-info">
                        ✓ Date/Time: Now (${new Date().toLocaleString()})
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="action-btn secondary" onclick="closeQuickReport()">Cancel</button>
                    <button class="action-btn success" onclick="submitQuickReport()">
                        ⚡ Submit Report
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
                data-name="${loc.name}" 
                data-location="${loc.location}" 
                data-watertype="${loc.waterType}">
            ${loc.name} (${loc.location})
        </option>
    `).join('');
}

// Update helper text
function updateQuickReportHelper() {
    const selector = document.getElementById('quickReportLocation');
    const selected = selector.options[selector.selectedIndex];
    const helper = document.getElementById('locationHelper');
    
    if (selected && helper) {
        helper.textContent = `🌊 ${selected.dataset.name}, ${selected.dataset.location} · ${selected.dataset.watertype}`;
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
        showNotification('❌ Please enter water temperature', 'error');
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

console.log('✅ Multiple Favorites & Quick Report features loaded');


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
                    <!-- FAVORITES SELECTOR -->
                    <div class="form-group">
                        <label for="favoriteSelector">Water Body</label>
                        <div style="display: flex; gap: 10px;">
                            <select id="favoriteSelector" style="flex: 1;">
                                <option value="">Select a favorite or add new...</option>
                            </select>
                            <button type="button" id="manageFavoritesBtn" class="icon-btn" title="Manage favorites">
                                ⚙️
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
                                <button type="button" id="tempReportGeoBtn" style="width: 56px; height: 42px; padding: 8px;">📍</button>
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
                        
                        <button type="button" id="saveAsFavoriteBtn" class="action-btn secondary" style="width: 100%; margin-top: 10px;">
                            ⭐ Save as Favorite
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
    
    console.log('🔵 Inserting modal HTML into page...');
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('✅ Modal HTML inserted');
    
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
    
    console.log(`🕐 Default measurement time set to: ${dateInput.value} ${timeInput.value}`);
    
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
                showNotification('⚠️ Please fill in all fields first', 'error');
            }
        });
    }
    
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
                console.log('📍 Geolocated to:', location);
            } catch (error) {
                console.error('Reverse geocoding error:', error);
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
    console.log('🌡️ Water temp submission started...');
    
    // Prevent double-submit
    if (isSubmitting) {
        console.warn('⚠️ Submission already in progress, ignoring duplicate click');
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
            showNotification('❌ Please enter the date and time of your measurement', 'error');
            return;
        }
        
        // Create timestamp from user-entered date and time
        const measurementDateTime = new Date(`${measurementDate}T${measurementTime}`);
        const now = new Date();
        
        // Validate not in the future (allow 5 minute grace period for clock differences)
        if (measurementDateTime.getTime() > now.getTime() + (5 * 60 * 1000)) {
            resetSubmitButton();
            showNotification('❌ Measurement time cannot be in the future', 'error');
            return;
        }
        
        // Validate not too old (max 30 days in the past for data quality)
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        if (measurementDateTime.getTime() < thirtyDaysAgo.getTime()) {
            resetSubmitButton();
            showNotification('⚠️ Measurements older than 30 days may not be accurate. Please submit recent data.', 'error');
            return;
        }
        
        console.log('Form data:', { waterbodyName, location, waterBody, temperature, depth, clarity, notes, measurementDate, measurementTime });
        console.log('Measurement timestamp:', measurementDateTime.toISOString());
        console.log('Form data types:', {
            waterbodyName: typeof waterbodyName,
            waterBody: typeof waterBody,
            clarity: typeof clarity,
            notes: typeof notes
        });
        
        // Validate location format
        if (!location || location.trim().length < 3) {
            resetSubmitButton();
            showNotification('❌ Please enter a valid location (City, State)', 'error');
            return;
        }
        
        // Check for comma (suggests "City, State" format)
        if (!location.includes(',') && !location.includes(' ')) {
            resetSubmitButton();
            showNotification('⚠️ Location should be in "City, State" format (e.g., "Memphis, TN")', 'error');
            return;
        }
        
        if (isNaN(depth) || depth < 0) {
            console.warn('Invalid depth:', depth);
            resetSubmitButton();
            showNotification('❌ Please enter a valid depth (0 or greater)', 'error');
            return;
        }
        
        // Geocode the location to get lat/long
        console.log('🗺️ Geocoding location:', location);
        let lat = null, lon = null;
        
        // Try geocoding with retry logic
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`Geocoding attempt ${attempt}...`);
                const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;
                const geocodeResponse = await fetch(geocodeUrl);
                
                if (!geocodeResponse.ok) {
                    throw new Error(`Geocoding API error: ${geocodeResponse.status}`);
                }
                
                const geocodeData = await geocodeResponse.json();
                
                if (geocodeData && geocodeData.length > 0) {
                    lat = parseFloat(geocodeData[0].lat);
                    lon = parseFloat(geocodeData[0].lon);
                    console.log('✅ Geocoded:', { lat, lon });
                    break; // Success! Exit retry loop
                } else {
                    console.warn(`⚠️ No results for location: "${location}"`);
                    if (attempt === 2) {
                        // Last attempt failed
                        resetSubmitButton();
                        showNotification('❌ Could not find location. Please enter "City, State" format (e.g., "Memphis, TN")', 'error');
                        return;
                    }
                }
            } catch (error) {
                console.error(`❌ Geocoding error (attempt ${attempt}):`, error);
                if (attempt === 2) {
                    // Last attempt failed
                    resetSubmitButton();
                    showNotification('❌ Geocoding failed. Please check your internet connection and try again.', 'error');
                    return;
                }
                // Wait 1 second before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Final check - don't submit without coordinates
        if (lat === null || lon === null) {
            console.error('🚫 Geocoding failed completely. Not submitting.');
            resetSubmitButton();
            showNotification('❌ Cannot submit without location coordinates. Please try again.', 'error');
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
        
        console.log('Submitting data:', data);
        
        const jsonBody = JSON.stringify(data);
        console.log('📦 JSON body:', jsonBody);
        console.log('📦 JSON length:', jsonBody.length);
        
        // Send to Google Sheets
        console.log('📤 Sending to Google Sheets...');
        const response = await fetch('https://script.google.com/macros/s/AKfycbxmuReDxhNFGjFC_LaEcCiTB8R7uI9lJxMbMsEWSoIp_VRegLarMnnILlvk-2K7ghDYeg/exec', {
            method: 'POST',
            mode: 'no-cors', // Google Apps Script requires this
            headers: {
                'Content-Type': 'application/json',
            },
            body: jsonBody
        });
        
        console.log('✅ Data sent to Google Sheets');
        
        console.log('Updating stats...');
        const updatedStats = updateUserStats();
        console.log('Updated stats:', updatedStats);
        
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
        
        const impactMsg = updatedStats.totalReports === 1 
            ? 'Thank you for your first report! You\'re helping build the community database.' 
            : `Your ${updatedStats.totalReports} reports have helped ${updatedStats.helpedAnglers} anglers!`;
        
        // Show notification FIRST
        console.log('Showing notification...');
        showNotification(`✅ Report submitted! ${impactMsg}`, 'success');
        
        // Add closing animation and close modal
        setTimeout(() => {
            console.log('Closing modal...');
            const modal = document.getElementById('tempReportModal');
            if (modal) {
                // Add fade-out animation
                modal.style.opacity = '0';
                modal.style.transition = 'opacity 0.3s ease';
                
                // Remove after animation completes
                setTimeout(() => {
                    window.closeTempReport();
                }, 300);
            }
        }, 500);
        
    } catch (error) {
        console.error('❌ Error submitting to Google Sheets:', error);
        resetSubmitButton();
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
    console.log('🔵 closeTempReportModal called');
    
    // CRITICAL: Reset submission flag when modal closes
    isSubmitting = false;
    
    const modal = document.getElementById('tempReportModal');
    console.log('🔵 Modal element found:', modal);
    if (modal) {
        modal.remove();
        console.log('✅ Modal removed');
    } else {
        console.error('❌ Modal element not found! Cannot close.');
    }
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
            <div class="modal-content" onclick="event.stopPropagation()" style="max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <span class="modal-close" onclick="window.closeAbout()">×</span>
                    🎣 About FishCast
                </div>
                
                <div style="padding: 20px;">
                    <h3 style="margin-top: 0; color: var(--accent);">FishCast v3.4</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 25px;">
                        By <strong>The Southern Bluegill Association</strong><br>
                        <a href="mailto:info@thesouthernbluegill.com" style="color: var(--accent); text-decoration: none;">info@thesouthernbluegill.com</a>
                    </p>
                    
                    <!-- What is FishCast -->
                    <h4 style="color: var(--text-primary); margin-top: 25px; border-bottom: 2px solid var(--accent); padding-bottom: 8px;">
                        🎯 What is FishCast?
                    </h4>
                    <p style="color: var(--text-secondary); line-height: 1.7;">
                        FishCast is a <strong>science-based fishing forecast tool</strong> that predicts fish behavior using real biological data, physics-based water temperature modeling, and community-contributed observations. Unlike generic fishing apps, FishCast uses <strong>species-specific biology</strong> to tell you exactly what the fish are doing—spawning, feeding actively, or going dormant.
                    </p>
                    
                    <!-- How Forecasting Works -->
                    <h4 style="color: var(--text-primary); margin-top: 25px; border-bottom: 2px solid var(--accent); padding-bottom: 8px;">
                        🔬 How Our Forecasting Works
                    </h4>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong style="color: var(--accent);">1. Physics-Based Water Temperature Model</strong><br>
                        We don't just guess water temps—we calculate them using thermal physics:
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li><strong>Thermal Lag:</strong> Water resists temperature change based on water body size (ponds: 5 days, lakes: 10 days, reservoirs: 14 days)</li>
                        <li><strong>Solar Radiation:</strong> Clear skies warm water faster; cloudy days slow warming</li>
                        <li><strong>Wind Mixing:</strong> Strong winds cool warm water through evaporation and mix temperature layers</li>
                        <li><strong>Depth Stratification:</strong> Estimates temperature at 4ft, 10ft, and 20ft depths using thermocline modeling</li>
                        <li><strong>Community Calibration:</strong> Your water temp reports fine-tune our model for specific lakes and ponds</li>
                    </ul>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong style="color: var(--accent);">2. Species-Specific Biology</strong><br>
                        We track <strong>17 sunfish and bass species</strong>, each with unique temperature preferences:
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li><strong>Spawning Ranges:</strong> Each species spawns at specific temperatures (e.g., Bluegill: 67-75°F, Largemouth Bass: 60-68°F)</li>
                        <li><strong>Activity Phases:</strong> Dormant (too cold), Pre-Spawn, Spawn, Post-Spawn, Summer Peak, Fall Feed</li>
                        <li><strong>Behavioral Patterns:</strong> Feeding intensity, depth preferences, and location patterns for each phase</li>
                    </ul>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong style="color: var(--accent);">3. Weather Integration</strong><br>
                        Real-time and 7-day forecast data including:
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li>Air temperature, wind speed/direction, cloud cover</li>
                        <li>Precipitation probability and barometric pressure</li>
                        <li>Sunrise/sunset times and moon phase</li>
                        <li>All integrated into our water temp physics model</li>
                    </ul>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong style="color: var(--accent);">4. Solunar Theory</strong><br>
                        Moon position and phase influence fish feeding activity. We calculate:
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li>Major and minor feeding periods based on moon overhead/underfoot</li>
                        <li>Moon phase effects on nighttime activity</li>
                        <li>Combined with water temp for accurate bite time predictions</li>
                    </ul>
                    
                    <!-- Community Data & ML Plans -->
                    <h4 style="color: var(--text-primary); margin-top: 25px; border-bottom: 2px solid var(--accent); padding-bottom: 8px;">
                        🤝 Community Data & Machine Learning
                    </h4>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong style="color: var(--accent);">How Your Water Temp Reports Help:</strong>
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li><strong>Immediate Impact:</strong> Your report helps calibrate water temp estimates for YOUR specific water body</li>
                        <li><strong>Community Benefit:</strong> Aggregated data improves forecasts for all users in your region</li>
                        <li><strong>Accuracy Tracking:</strong> We compare our predictions against real measurements to continuously improve</li>
                        <li><strong>Local Patterns:</strong> Multiple reports from the same lake reveal unique thermal characteristics</li>
                    </ul>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong style="color: var(--accent);">🚀 Future: Machine Learning Models</strong><br>
                        We're building ML models trained on community data to:
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li><strong>Learn Local Anomalies:</strong> Springs, tributaries, shading, and other factors that make your lake unique</li>
                        <li><strong>Predict Spawn Timing:</strong> ML will identify when YOUR lake's fish typically spawn based on historical patterns</li>
                        <li><strong>Personalized Forecasts:</strong> The more reports from your lake, the more accurate your forecasts become</li>
                        <li><strong>Water Body Profiles:</strong> Automatic classification of thermal behavior (fast-warming vs. stable, shallow vs. deep)</li>
                        <li><strong>Catch Data Integration:</strong> Planned feature to correlate conditions with actual fishing success</li>
                    </ul>
                    
                    <p style="background: var(--bg-secondary); padding: 15px; border-left: 4px solid var(--accent); border-radius: 4px; color: var(--text-secondary); line-height: 1.7; margin-top: 15px;">
                        <strong>🎯 Example:</strong> If you report 68°F from "Smith Pond" on April 15, our ML model learns that Smith Pond reaches bluegill spawn temp in mid-April. Next year, it will predict spawn timing specifically for Smith Pond based on weather patterns, even before anyone reports!
                    </p>
                    
                    <!-- Privacy & Data Usage -->
                    <h4 style="color: var(--text-primary); margin-top: 25px; border-bottom: 2px solid var(--accent); padding-bottom: 8px;">
                        🔒 Privacy & Data Usage
                    </h4>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong>What We Collect:</strong>
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li><strong>Water Temperature Reports:</strong> Temperature, depth, water body name, city/state location, water clarity, optional notes</li>
                        <li><strong>Location Data:</strong> City and state only—NOT precise GPS coordinates. We geocode your city to get approximate coordinates for forecasting</li>
                        <li><strong>Device Type:</strong> Browser user-agent for debugging purposes only</li>
                        <li><strong>Anonymous Submissions:</strong> We do NOT collect names, email addresses, phone numbers, or user accounts</li>
                    </ul>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong>How We Use Your Data:</strong>
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li><strong>Improve Forecasts:</strong> Calibrate water temp models and validate physics predictions</li>
                        <li><strong>Train ML Models:</strong> Build machine learning models to predict spawn timing and water temp patterns</li>
                        <li><strong>Community Sharing:</strong> Aggregate data shown on the app (e.g., "42 anglers helped by your 5 reports")</li>
                        <li><strong>Research:</strong> Analyze regional patterns to improve biological models</li>
                    </ul>
                    
                    <p style="color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
                        <strong>What We DON'T Do:</strong>
                    </p>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px; margin-bottom: 15px;">
                        <li>❌ Sell or share your data with third parties</li>
                        <li>❌ Track you across websites (no cookies or tracking pixels)</li>
                        <li>❌ Collect precise GPS coordinates of your fishing spots</li>
                        <li>❌ Require accounts, logins, or personal information</li>
                        <li>❌ Send marketing emails or spam</li>
                    </ul>
                    
                    <p style="background: #1a472a; padding: 15px; border-left: 4px solid #4ade80; border-radius: 4px; color: var(--text-secondary); line-height: 1.7; margin-top: 15px;">
                        <strong>🛡️ Our Commitment:</strong> Your data powers better forecasts for the entire fishing community, but your privacy is paramount. All data is anonymized, aggregated, and used solely to improve fishing forecasts. We're anglers too—we respect your secret spots!
                    </p>
                    
                    <!-- Current Features -->
                    <h4 style="color: var(--text-primary); margin-top: 25px; border-bottom: 2px solid var(--accent); padding-bottom: 8px;">
                        ✨ Current Features
                    </h4>
                    <ul style="color: var(--text-secondary); line-height: 1.8; margin-left: 20px;">
                        <li><strong>17 Species:</strong> 12 Sunfish (Bluegill, Redear, Green Sunfish, Longear, Pumpkinseed, Redbreast, Warmouth, Rock Bass, Flier, Spotted Sunfish, Shadow Bass, Sacramento Perch) + 3 Bass (Largemouth, Smallmouth, Spotted) + 2 Crappie (Black, White)</li>
                        <li><strong>7-Day Physics-Based Forecasts:</strong> Water temp evolution using real weather data</li>
                        <li><strong>Current Conditions:</strong> Real-time weather, water temp estimate, fish phase</li>
                        <li><strong>Depth Analysis:</strong> Temperature estimates at surface, 4ft, 10ft, 20ft</li>
                        <li><strong>Fishing Scores:</strong> 0-100 rating based on all factors combined</li>
                        <li><strong>Technique Tips:</strong> What to use based on current conditions</li>
                        <li><strong>Community Reports:</strong> Submit and benefit from crowd-sourced water temps</li>
                        <li><strong>Mobile Friendly:</strong> Works on any device, no app install needed</li>
                    </ul>
                    
                    <!-- Contact -->
                    <div style="margin-top: 30px; padding: 20px; background: var(--bg-secondary); border-radius: 8px; text-align: center;">
                        <p style="color: var(--text-secondary); line-height: 1.7; margin: 0;">
                            <strong>Questions, feedback, or bug reports?</strong><br>
                            Email us at <a href="mailto:info@thesouthernbluegill.com" style="color: var(--accent); text-decoration: none; font-weight: bold;">info@thesouthernbluegill.com</a>
                        </p>
                    </div>
                    
                    <div style="margin-top: 25px; text-align: center;">
                        <button class="action-btn" onclick="window.closeAbout()" style="min-width: 150px;">Close</button>
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
