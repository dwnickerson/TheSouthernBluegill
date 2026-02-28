import { storage } from '../services/storage.js';
import { showNotification } from './notifications.js';
import { getUserStats } from './reportingModal.js';

export function openCatchLog() {
    const modal = document.getElementById('catchLogModal');
    if (!modal) {
        showNotification('Catch log modal is unavailable right now.', 'error');
        return;
    }
    const now = new Date();
    const dateTimeInput = document.getElementById('catchDateTime');
    const locationInput = document.getElementById('catchLocation');
    const speciesInput = document.getElementById('catchSpecies');
    const selectedSpecies = document.getElementById('species')?.value;
    if (dateTimeInput && !dateTimeInput.value) dateTimeInput.value = now.toISOString().slice(0, 16);
    if (locationInput && !locationInput.value) locationInput.value = document.getElementById('location')?.value || '';
    if (speciesInput && selectedSpecies) {
        const speciesMap = { bluegill: 'bluegill', coppernose: 'bluegill', redear: 'bluegill', green_sunfish: 'bluegill', warmouth: 'bluegill', longear: 'bluegill', rock_bass: 'bass', bass: 'bass', smallmouth: 'bass', spotted: 'bass', white_crappie: 'crappie', black_crappie: 'crappie' };
        speciesInput.value = speciesMap[selectedSpecies] || 'bluegill';
    }
    modal.classList.add('show');
}

export function closeCatchLog() {
    document.getElementById('catchLogModal')?.classList.remove('show');
}

export function submitCatchLog(event) {
    event?.preventDefault();
    const species = document.getElementById('catchSpecies')?.value;
    const count = parseInt(document.getElementById('catchCount')?.value || '0', 10);
    const dateTime = document.getElementById('catchDateTime')?.value;
    const location = document.getElementById('catchLocation')?.value?.trim();
    const notes = document.getElementById('catchNotes')?.value?.trim() || '';
    if (!species || !count || !dateTime || !location) {
        showNotification('Please complete all required catch log fields.', 'error');
        return;
    }
    const saved = storage.addCatch({ id: `catch_${Date.now()}`, species, count, dateTime, location, notes, createdAt: new Date().toISOString() });
    if (!saved) return showNotification('Unable to save catch log. Please try again.', 'error');
    document.getElementById('catchLogForm')?.reset();
    closeCatchLog();
    showNotification(`Catch log saved (${count} ${species})`, 'success');
}

export function openSettings() { /* unchanged behavior, condensed */
    const selectedTheme = storage.getTheme();
    const defaultLocation = storage.getDefaultLocation();
    const defaultSpecies = storage.getDefaultSpecies();
    const defaultWaterBody = storage.getDefaultWaterBody();
    const defaultForecastDays = storage.getDefaultForecastDays();
    const speciesOptions = Array.from(document.querySelectorAll('#species option')).map(option => `<option value="${option.value}">${option.textContent}</option>`).join('');
    const waterTypeOptions = Array.from(document.querySelectorAll('#waterType option')).map(option => `<option value="${option.value}">${option.textContent}</option>`).join('');
    const daysOptions = Array.from(document.querySelectorAll('#days option')).map(option => `<option value="${option.value}">${option.textContent}</option>`).join('');
    document.body.insertAdjacentHTML('beforeend', `<div class="modal show" id="settingsModal" role="dialog" aria-modal="true" aria-labelledby="settingsTitle" onclick="if(event.target === this) window.closeSettings()"><div class="modal-content" onclick="event.stopPropagation()"><div class="modal-header"><button type="button" class="modal-close" aria-label="Close settings" onclick="window.closeSettings()">×</button><span id="settingsTitle">Settings</span></div><div style="padding: 20px;"><h4 style="margin-top: 0; color: var(--text-primary);">Appearance</h4><div style="margin: 15px 0; padding: 15px; background: var(--bg-primary); border-radius: 8px;"><label for="themeSelect" style="display: block; margin-bottom: 6px; color: var(--text-primary); font-weight: 600;">Theme</label><select id="themeSelect" style="width: 100%;"><option value="light">Light</option><option value="dark">Dark</option><option value="largemouth-bass">Largemouth Bass</option><option value="crappie">Crappie</option><option value="sba">SBA</option><option value="bluegill">Bluegill</option></select></div><h4 style="margin-top: 30px; color: var(--text-primary);">Forecast Request Defaults</h4><div style="display: grid; gap: 12px; margin: 15px 0;"><div><label for="defaultLocation">Location</label><input type="text" id="defaultLocation" value="${defaultLocation}" placeholder="City, State or ZIP code" style="width: 100%;"></div><div><label for="defaultSpecies">Target Species</label><select id="defaultSpecies" style="width: 100%;"><option value="">Use form default</option>${speciesOptions}</select></div><div><label for="defaultWaterBody">Water Body Type</label><select id="defaultWaterBody" style="width: 100%;"><option value="">Use form default</option>${waterTypeOptions}</select></div><div><label for="defaultForecastDays">Forecast Days</label><select id="defaultForecastDays" style="width: 100%;"><option value="">Use form default</option>${daysOptions}</select></div></div><div style="margin-top: 30px; text-align: center;"><button class="action-btn modal-action-btn" onclick="window.saveSettings()" style="min-width: 96px;">Save</button></div></div></div></div>`);
    document.getElementById('defaultSpecies').value = defaultSpecies;
    document.getElementById('defaultWaterBody').value = defaultWaterBody;
    document.getElementById('defaultForecastDays').value = defaultForecastDays;
    const themeSelect = document.getElementById('themeSelect');
    themeSelect.value = selectedTheme;
    themeSelect.addEventListener('change', (e) => document.documentElement.setAttribute('data-theme', e.target.value));
}

export function closeSettings() { document.getElementById('settingsModal')?.remove(); }

export function saveSettings() {
    const theme = document.getElementById('themeSelect')?.value;
    if (theme) {
        document.documentElement.setAttribute('data-theme', theme);
        storage.setTheme(theme);
    }
    const defaultLocationInput = document.getElementById('defaultLocation');
    const defaultSpeciesInput = document.getElementById('defaultSpecies');
    const defaultWaterBodyInput = document.getElementById('defaultWaterBody');
    const defaultForecastDaysInput = document.getElementById('defaultForecastDays');
    if (defaultLocationInput) storage.setDefaultLocation(defaultLocationInput.value.trim());
    if (defaultSpeciesInput) storage.setDefaultSpecies(defaultSpeciesInput.value);
    if (defaultWaterBodyInput) storage.setDefaultWaterBody(defaultWaterBodyInput.value);
    if (defaultForecastDaysInput) storage.setDefaultForecastDays(defaultForecastDaysInput.value);
    showNotification('Settings saved!', 'success');
    closeSettings();
}

export function exportAllData() {
    const data = { exportDate: new Date().toISOString(), version: '3.3.7', userStats: getUserStats(), settings: { theme: storage.getTheme() } };
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
    storage.clearAll();
    showNotification('All local data cleared.', 'success');
    setTimeout(() => window.location.reload(), 1500);
}
