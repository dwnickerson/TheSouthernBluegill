import {
    openQuickReportModal,
    openTempReportModal,
    closeTempReportModal,
    handleTempReportSubmit,
    getUserStats,
    updateUserStats
} from './reportingModal.js';
import {
    openCatchLog,
    closeCatchLog,
    submitCatchLog,
    openSettings,
    closeSettings,
    saveSettings,
    exportAllData,
    clearAllData
} from './settingsModal.js';
import { openAbout, closeAbout, shareForecast, saveFavorite } from './helpModal.js';
import { showNotification } from './notifications.js';

export {
    openQuickReportModal,
    openTempReportModal,
    closeTempReportModal,
    handleTempReportSubmit,
    getUserStats,
    updateUserStats,
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
    saveFavorite
};

export const openTempReport = openTempReportModal;
export const closeTempReport = closeTempReportModal;
export const submitTempReport = handleTempReportSubmit;

window.openTempReport = openTempReportModal;
window.closeTempReport = closeTempReportModal;
window.handleWaterTempSubmit = handleTempReportSubmit;
window.openAbout = openAbout;
window.closeAbout = closeAbout;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.exportUserData = exportAllData;
window.clearUserData = clearAllData;
window.shareForecast = shareForecast;
window.openCatchLog = openCatchLog;
window.saveFavorite = saveFavorite;
