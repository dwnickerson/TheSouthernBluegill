import { openSettings, openAbout, closeSettings, closeAbout, saveSettings } from './ui/modals.js';

function goHome() {
    window.location.href = '/fishcast/';
}

window.closeSettings = () => {
    closeSettings();
    goHome();
};

window.closeAbout = () => {
    closeAbout();
    goHome();
};

window.saveSettings = () => {
    saveSettings();
    goHome();
};

const params = new URLSearchParams(window.location.search);
const panel = (params.get('panel') || '').toLowerCase();

if (panel === 'settings') {
    openSettings();
} else if (panel === 'about') {
    openAbout();
} else {
    goHome();
}
