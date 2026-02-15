// Weather data service using Open-Meteo API
import { API_CONFIG, APP_CONSTANTS } from '../config/constants.js';
import { storage } from './storage.js';

const WEATHER_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 2;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Weather request failed (${response.status})`);
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (attempt < MAX_ATTEMPTS) {
                await delay(300 * attempt);
            }
        }
    }
    throw lastError;
}

export async function getWeather(lat, lon, days = APP_CONSTANTS.DEFAULT_FORECAST_DAYS) {
    const cached = storage.getWeatherCache(lat, lon, days);
    const now = Date.now();

    if (cached?.payload && cached.cachedAt && (now - cached.cachedAt) <= WEATHER_TTL_MS) {
        return { ...cached.payload, stale: false, fromCache: true };
    }

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const historicalUrl = `${API_CONFIG.WEATHER.ARCHIVE_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `start_date=${startDate}&` +
        `end_date=${endDate}&` +
        `daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,cloud_cover_mean,wind_speed_10m_max,precipitation_sum&` +
        `timezone=America/Chicago`;

    const forecastUrl = `${API_CONFIG.WEATHER.FORECAST_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `current=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation,uv_index&` +
        `hourly=temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation_probability,precipitation,uv_index&` +
        `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,cloud_cover_mean,sunrise,sunset,weather_code,uv_index_max&` +
        `timezone=America/Chicago&` +
        `forecast_days=${days}`;

    try {
        const [historicalData, forecastData] = await Promise.all([
            fetchJsonWithRetry(historicalUrl),
            fetchJsonWithRetry(forecastUrl)
        ]);

        const payload = {
            historical: historicalData,
            forecast: forecastData
        };

        storage.setWeatherCache(lat, lon, days, {
            payload,
            cachedAt: now
        });

        return {
            ...payload,
            stale: false,
            fromCache: false
        };
    } catch (error) {
        if (cached?.payload) {
            return {
                ...cached.payload,
                stale: true,
                staleReason: `Weather fallback: ${error.message}`,
                staleAt: cached.cachedAt || null,
                fromCache: true
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
        `timezone=America/Chicago`;

    return fetchJsonWithRetry(url);
}
