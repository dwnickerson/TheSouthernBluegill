// API URLs and configuration constants
export const API_CONFIG = {
    WEATHER: {
        ARCHIVE_URL: 'https://archive-api.open-meteo.com/v1/archive',
        FORECAST_URL: 'https://api.open-meteo.com/v1/forecast'
    },
    GEOCODING: {
        NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search',
        USER_AGENT: 'FishCast/2.0'
    },
    WEBHOOK: {
        WATER_TEMP_SUBMIT: 'https://script.google.com/macros/s/AKfycbySp_91L4EPOFXFx2528Q7TPfRtQi9dBiR4l2CSWpnrJ_x2UdZGamdiqsS7bYOQ38R8bg/exec'
    }
};

// Application constants
export const APP_CONSTANTS = {
    MAX_FORECAST_DAYS: 7,
    DEFAULT_FORECAST_DAYS: 3,
    WATER_TEMP_REPORT_RADIUS_MILES: 25,
    WATER_TEMP_REPORT_DAYS_BACK: 7
};

// Cache keys for localStorage
export const CACHE_KEYS = {
    FAVORITES: 'fishcast_favorites',
    CATCHES: 'fishcast_catches',
    THEME: 'theme',
    DEFAULT_LOCATION: 'default_location',
    DEFAULT_SPECIES: 'default_species',
    DEFAULT_WATER_BODY: 'default_water_body',
    NOTIFICATIONS_ENABLED: 'notifications_enabled'
};
