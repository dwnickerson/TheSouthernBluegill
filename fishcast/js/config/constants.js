// API URLs and configuration constants
export const API_CONFIG = {
    WEATHER: {
        ARCHIVE_URL: 'https://archive-api.open-meteo.com/v1/archive',
        FORECAST_URL: 'https://api.open-meteo.com/v1/forecast'
    },
    GEOCODING: {
        NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search',
        USER_AGENT: 'FishCast/2.0'
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
    STORAGE_VERSION: 'fishcast_storage_version',
    FAVORITES: 'fishcast_favorites',
    WATER_BODY_FAVORITES: 'fishcast_water_body_favorites',
    RECENT_REPORTS: 'fishcast_recent_reports',
    LAST_SELECTED_SPECIES: 'fishcast_last_selected_species',
    CATCHES: 'fishcast_catches',
    THEME: 'theme',
    DEFAULT_LOCATION: 'default_location',
    DEFAULT_SPECIES: 'default_species',
    DEFAULT_WATER_BODY: 'default_water_body',
    DEFAULT_FORECAST_DAYS: 'default_forecast_days',
    NOTIFICATIONS_ENABLED: 'notifications_enabled',
    GEOCODE_CACHE_PREFIX: 'fishcast_geocode_cache_',
    WEATHER_CACHE_PREFIX: 'fishcast_weather_cache_',
    WATER_TEMP_MEMO_PREFIX: 'fishcast_water_temp_memo_'
};
