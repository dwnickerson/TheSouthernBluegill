// Weather data service using Open-Meteo API - v3.4.1
// NOW INCLUDES: wind, cloud cover, precipitation sum, mean temps
import { API_CONFIG, APP_CONSTANTS } from '../config/constants.js';

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
    
    const historicalResponse = await fetch(historicalUrl);
    if (!historicalResponse.ok) {
        throw new Error(`Historical weather request failed (${historicalResponse.status})`);
    }
    const historicalData = await historicalResponse.json();
    
    // Fetch forecast data
    const forecastUrl = `${API_CONFIG.WEATHER.FORECAST_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `current=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation&` +
        `hourly=temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation_probability&` +
        `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,cloud_cover_mean,sunrise,sunset,weather_code&` +
        `timezone=auto&` +
        `forecast_days=${days}`;
    
    const forecastResponse = await fetch(forecastUrl);
    if (!forecastResponse.ok) {
        throw new Error(`Forecast weather request failed (${forecastResponse.status})`);
    }
    const forecastData = await forecastResponse.json();
    
    return {
        historical: historicalData,
        forecast: forecastData
    };
}

export async function getCurrentWeather(lat, lon) {
    const url = `${API_CONFIG.WEATHER.FORECAST_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code&` +
        `timezone=auto`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Current weather request failed (${response.status})`);
    }
    return await response.json();
}
