// Favorites Manager
import { storage } from '../services/storage.js';
import { SPECIES_DATA } from '../config/species.js';

function escapeHTML(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderFavorites() {
    const favorites = storage.getFavorites();
    const favoritesSection = document.getElementById('favoritesSection');
    const favoritesList = document.getElementById('favoritesList');
    const favoriteLocationOptions = document.getElementById('favoriteLocationOptions');
    
    if (favoriteLocationOptions) {
        const uniqueLocations = [...new Set(favorites.map(fav => fav.name).filter(Boolean))];
        favoriteLocationOptions.innerHTML = uniqueLocations
            .map(location => `<option value="${escapeHTML(location)}"></option>`)
            .join('');
    }

    if (favorites.length === 0) {
        favoritesSection.style.display = 'none';
        return;
    }
    
    favoritesSection.style.display = 'block';
    
    let html = '';
    favorites.forEach(fav => {
        const speciesName = SPECIES_DATA[fav.species]?.name || fav.species;
        html += `
            <div class="favorite-item" onclick="loadFavorite(${fav.id})">
                <div>
                    <div class="favorite-name">${escapeHTML(fav.name)}</div>
                    <div class="favorite-location">${escapeHTML(speciesName)} • ${escapeHTML(fav.waterType)}</div>
                </div>
                <span class="favorite-remove" onclick="event.stopPropagation(); removeFavorite(${fav.id})">✕</span>
            </div>
        `;
    });
    
    favoritesList.innerHTML = html;
}

export function loadFavorite(id) {
    const favorites = storage.getFavorites();
    const favorite = favorites.find(f => f.id === id);
    
    if (!favorite) return;
    
    // Fill in the form
    document.getElementById('location').value = favorite.name;
    document.getElementById('species').value = favorite.species;
    document.getElementById('waterType').value = favorite.waterType;
    
    // Scroll to form
    document.getElementById('forecastForm').scrollIntoView({ behavior: 'smooth' });
}

export function removeFavorite(id) {
    if (!confirm('Remove this favorite location?')) return;
    
    storage.removeFavorite(id);
    renderFavorites();
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = 'Favorite removed';
    notification.style.background = '#e74c3c';
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 2000);
}

// Make functions available globally
window.loadFavorite = loadFavorite;
window.removeFavorite = removeFavorite;
