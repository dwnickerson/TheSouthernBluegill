import { showNotification } from './notifications.js';
import { storage } from '../services/storage.js';
import { renderFavorites } from './favorites.js';

export function openAbout() {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal show" id="aboutModal" role="dialog" aria-modal="true" aria-labelledby="aboutTitle" onclick="if(event.target === this) window.closeAbout()"><div class="modal-content" onclick="event.stopPropagation()" style="max-height: 90vh; overflow-y: auto;"><div class="modal-header"><button type="button" class="modal-close" aria-label="Close about" onclick="window.closeAbout()">×</button><span id="aboutTitle">About FishCast</span></div><div style="padding:20px;"><h3 style="margin-top:0;color:var(--accent);">FishCast</h3><p style="color:var(--text-secondary)">Science-based fishing forecasts with community water reports.</p><h4>How it works</h4><ul><li>Physics-based water temperature modeling.</li><li>Species-specific behavior phases.</li><li>Weather + solunar signal integration.</li></ul><h4>Need help?</h4><p>Email <a href="mailto:info@thesouthernbluegill.com">info@thesouthernbluegill.com</a></p><div style="margin-top:20px;text-align:center;"><button class="action-btn" onclick="window.closeAbout()">Close</button></div></div></div></div>`);
}

export function closeAbout() {
    document.getElementById('aboutModal')?.remove();
}

export function shareForecast() {
    const score = document.querySelector('.score-display')?.textContent?.trim();
    const rating = document.querySelector('.rating')?.textContent?.trim();
    if (!score || !rating) return showNotification('Generate a forecast before sharing.', 'error');
    const location = document.getElementById('location')?.value?.trim();
    const speciesLabel = document.querySelector('#species option:checked')?.textContent?.trim();
    const shareText = ['FishCast Forecast', `${location || 'My spot'} · ${speciesLabel || 'Fishing'}`, `Score: ${score} (${rating})`, `Check yours: ${window.location.href}`].join('\n');
    if (navigator.share) return navigator.share({ title: 'FishCast Forecast', text: shareText, url: window.location.href }).catch(() => {});
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(shareText).then(() => showNotification('📋 Forecast copied to clipboard!', 'success')).catch(() => showNotification('Unable to copy forecast text.', 'error'));
    showNotification('Sharing is not supported on this browser.', 'error');
}

export function saveFavorite(locationData) {
    const locationName = locationData?.name || document.getElementById('location')?.value?.trim();
    const species = locationData?.species || document.getElementById('species')?.value;
    const waterType = locationData?.waterType || document.getElementById('waterType')?.value;
    const forecastDays = locationData?.forecastDays || document.getElementById('days')?.value;
    if (!locationName) return showNotification('Enter a location before saving.', 'error');
    const favorites = storage.getFavorites();
    const duplicate = favorites.find(fav => fav.name.toLowerCase() === locationName.toLowerCase() && fav.species === species && fav.waterType === waterType && String(fav.forecastDays || '') === String(forecastDays || ''));
    if (duplicate) return showNotification('Location is already saved.', 'info');
    storage.addFavorite({ id: Date.now(), name: locationName, species, waterType, forecastDays });
    renderFavorites();
    showNotification('Location saved.', 'success');
}
