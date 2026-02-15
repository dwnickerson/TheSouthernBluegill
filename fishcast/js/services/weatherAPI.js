// Weather data service using Open-Meteo API - v3.4.1
// NOW INCLUDES: wind, cloud cover, precipitation sum, mean temps
import { API_CONFIG, APP_CONSTANTS } from '../config/constants.js';
import { storage } from './storage.js';

const RETRY_DELAYS_MS = [500, 1000];
const WEATHER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function getWeatherCacheKey(lat, lon, days) {
    return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)},${days}`;
}

function getCachedWeather(lat, lon, days) {
    const key = getWeatherCacheKey(lat, lon, days);
    const cache = storage.getWeatherCache();
    const entry = cache[key];

    if (!entry) {
        return null;
    }

    const isFresh = Date.now() - entry.savedAt <= WEATHER_CACHE_TTL_MS;
    return {
        ...entry.value,
        stale: !isFresh
    };
}

function cacheWeather(lat, lon, days, value) {
    const key = getWeatherCacheKey(lat, lon, days);
    const cache = storage.getWeatherCache();
    cache[key] = {
        savedAt: Date.now(),
        value
    };
    storage.setWeatherCache(cache);
}

async function fetchJsonWithRetry(url, resourceName) {
    let lastError;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`${resourceName} request failed (${response.status})`);
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (attempt < RETRY_DELAYS_MS.length) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
            }
        }
    }

    throw lastError;
}

export async function getWeather(lat, lon, days = APP_CONSTANTS.DEFAULT_FORECAST_DAYS) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch historical weather data (last 30 days)
    const historicalUrl = `${API_CONFIG.WEATHER.ARCHIVE_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `start_date=${startDate}&` +
        `end_date=${endDate}&` +
        `daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,cloud_cover_mean,wind_speed_10m_max,precipitation_sum&` +
        `timezone=auto`;

    // Fetch forecast data
    const forecastUrl = `${API_CONFIG.WEATHER.FORECAST_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `current=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation&` +
        `hourly=temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation_probability&` +
        `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,cloud_cover_mean,sunrise,sunset,weather_code&` +
        `timezone=auto&` +
        `forecast_days=${days}`;

    try {
        const [historicalData, forecastData] = await Promise.all([
            fetchJsonWithRetry(historicalUrl, 'Historical weather'),
            fetchJsonWithRetry(forecastUrl, 'Forecast weather')
        ]);

        const result = {
            historical: historicalData,
            forecast: forecastData,
            stale: false
        };
        cacheWeather(lat, lon, days, {
            historical: historicalData,
            forecast: forecastData
        });
        return result;
    } catch (error) {
        const cached = getCachedWeather(lat, lon, days);
        if (cached) {
            return {
                historical: cached.historical,
                forecast: cached.forecast,
                stale: true,
                staleReason: 'Using last successful weather response due to network/API issue.'
            };
        }
        throw error;
    }
}

export async function getCurrentWeather(lat, lon) {
    const url = `${API_CONFIG.WEATHER.FORECAST_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code&` +
        `timezone=auto`;

    return await fetchJsonWithRetry(url, 'Current weather');
}
