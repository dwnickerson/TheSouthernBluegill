import { showNotification } from './notifications.js';
import { storage } from '../services/storage.js';
import { renderFavorites } from './favorites.js';

export function openAbout() {
    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal show" id="aboutModal" role="dialog" aria-modal="true" aria-labelledby="aboutTitle" onclick="if(event.target === this) window.closeAbout()">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <span id="aboutTitle">About FishCast</span>
                    <button type="button" class="modal-close" aria-label="Close about" onclick="window.closeAbout()">×</button>
                </div>
                <div style="padding:20px; line-height:1.55;">
                    <h3 style="margin-top:0; color:var(--accent);">FishCast Forecast Engine</h3>
                    <p style="color:var(--text-secondary); margin-bottom:14px;">FishCast is the Southern Bluegill Association's field-ready forecasting app built to help anglers make better timing decisions. Instead of relying on a single weather number, FishCast blends weather science, fish behavior, and practical on-the-water patterns into one readable forecast.</p>

                    <h4 style="margin:16px 0 8px;">What the forecast includes</h4>
                    <ul style="margin:0 0 14px 20px; padding:0;">
                        <li><strong>Hourly + multi-day outlooks</strong> tuned for your selected species and water body type.</li>
                        <li><strong>Modeled water temperature trends</strong> using air temperature and day/night transitions.</li>
                        <li><strong>Species phase logic</strong> (prespawn, spawn, postspawn, feeding windows, and stress periods).</li>
                        <li><strong>Weather pressure and wind context</strong> translated into practical fish activity expectations.</li>
                        <li><strong>Solunar signal weighting</strong> to highlight stronger feeding opportunities.</li>
                    </ul>

                    <h4 style="margin:16px 0 8px;">How FishCast scoring works</h4>
                    <p style="margin:0 0 10px;">Each forecast score is a weighted blend of environmental inputs and species behavior assumptions. The app evaluates trend direction (improving, stable, declining), then maps that to an easy-read activity score and confidence tier. The goal is not to promise a guaranteed bite, but to identify higher-probability windows and reduce guesswork.</p>

                    <h4 style="margin:16px 0 8px;">Best-use recommendations</h4>
                    <ul style="margin:0 0 14px 20px; padding:0;">
                        <li>Compare <strong>today vs. next 3-7 days</strong> before choosing your trip window.</li>
                        <li>Use the <strong>saved locations</strong> tool to track your regular waters quickly.</li>
                        <li>Keep your <strong>target species and water type accurate</strong>; this materially changes the guidance.</li>
                        <li>Pair FishCast with real-time observations (water clarity, bait presence, and recent fronts).</li>
                    </ul>

                    <h4 style="margin:16px 0 8px;">Important notes</h4>
                    <p style="margin:0 0 10px;">Forecasts are decision support, not certainty. Localized runoff, dam releases, fishing pressure, and micro-habitat conditions can shift outcomes quickly. For safety, always check local advisories and weather alerts before heading out.</p>


                    <h4 style="margin:16px 0 8px;">Privacy</h4>
                    <p style="margin:0 0 10px;">FishCast does not store your personal fishing data on our servers. Settings, saved locations, and notes are kept locally on your device unless you explicitly export or share them.</p>

                    <h4 style="margin:16px 0 8px;">Water temperature estimate coverage</h4>
                    <p style="margin:0 0 10px;">Estimated water temperatures are modeled for the general area so we can provide useful guidance for everyone. If you need a model tuned for a specific lake, pond, or river, email <a href="mailto:info@thesouthernbluegill.com">info@thesouthernbluegill.com</a> for more information.</p>

                    <h4 style="margin:16px 0 8px;">Contact & support</h4>
                    <p style="margin:0;">Questions, bug reports, or feature ideas: <a href="mailto:info@thesouthernbluegill.com">info@thesouthernbluegill.com</a></p>

                    <div style="margin-top:20px; text-align:center;">
                        <button class="action-btn modal-action-btn" onclick="window.closeAbout()">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `);
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
