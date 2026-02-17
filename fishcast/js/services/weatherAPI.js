// Weather data service using Open-Meteo API
import { API_CONFIG, APP_CONSTANTS } from '../config/constants.js';
import { storage } from './storage.js';

const WEATHER_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 2;
const WEATHER_UNITS = {
    temp: 'fahrenheit',
    wind: 'mph',
    precip: 'inch',
    pressure: 'hPa' // Open-Meteo surface_pressure is hPa (mb equivalent).
};
const WEATHER_TIMEZONE = 'auto';
const WEATHER_CACHE_VARIANT = `tz:${WEATHER_TIMEZONE}|tu:${WEATHER_UNITS.temp}|wu:${WEATHER_UNITS.wind}|pu:${WEATHER_UNITS.precip}|pr:${WEATHER_UNITS.pressure}`;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function toDateInTimeZoneParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;

    if (!year || !month || !day) {
        return null;
    }

    return { year, month, day };
}

function formatDateParts(parts) {
    if (!parts) return null;
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateParts(parts, daysDelta) {
    if (!parts) return null;
    const baseUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
    return toDateInTimeZoneParts(new Date(baseUtc + (daysDelta * 24 * 60 * 60 * 1000)), 'UTC');
}

function getArchiveDateRange(referenceDate = new Date()) {
    // Use local "today" and request timezone=auto so Open-Meteo aligns days to location-local boundaries.
    const localTodayParts = toDateInTimeZoneParts(referenceDate, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const endParts = shiftDateParts(localTodayParts, -1); // most recent complete local day
    const startParts = shiftDateParts(endParts, -29); // 30-day window including end date
    return {
        startDate: formatDateParts(startParts),
        endDate: formatDateParts(endParts)
    };
}

function getClosestNowHourIndex(hourlyTimes, now = new Date()) {
    if (!Array.isArray(hourlyTimes) || hourlyTimes.length === 0) return null;

    const nowMs = now.getTime();
    let closestIndex = 0;
    let closestDelta = Infinity;

    hourlyTimes.forEach((timeValue, index) => {
        const timestamp = Date.parse(timeValue);
        if (!Number.isFinite(timestamp)) return;
        const delta = Math.abs(timestamp - nowMs);
        if (delta < closestDelta) {
            closestDelta = delta;
            closestIndex = index;
        }
    });

    return Number.isFinite(closestDelta) ? closestIndex : null;
}

function validateAndNormalizeForecast(forecastData, nowIso) {
    const warnings = [];
    const forecast = forecastData && typeof forecastData === 'object' ? forecastData : {};
    const hourly = forecast.hourly && typeof forecast.hourly === 'object' ? forecast.hourly : {};
    const hourlyTimes = Array.isArray(hourly.time) ? [...hourly.time] : null;
    const seriesKeys = ['wind_speed_10m', 'wind_direction_10m', 'surface_pressure', 'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'dew_point_2m', 'cloud_cover', 'weather_code', 'precipitation', 'precipitation_probability', 'shortwave_radiation', 'vapour_pressure_deficit', 'et0_fao_evapotranspiration'];

    if (!hourlyTimes) {
        warnings.push('forecast.hourly.time missing or invalid');
    } else {
        seriesKeys.forEach((key) => {
            if (!Array.isArray(hourly[key])) {
                warnings.push(`forecast.hourly.${key} missing or invalid`);
            } else if (hourly[key].length !== hourlyTimes.length) {
                warnings.push(`forecast.hourly.${key} length mismatch`);
            }
        });

        let isSorted = true;
        for (let i = 1; i < hourlyTimes.length; i++) {
            if (Date.parse(hourlyTimes[i]) < Date.parse(hourlyTimes[i - 1])) {
                isSorted = false;
                break;
            }
        }

        if (!isSorted) {
            const sortedIndices = hourlyTimes
                .map((timeValue, index) => ({ index, ts: Date.parse(timeValue) }))
                .sort((a, b) => a.ts - b.ts)
                .map((item) => item.index);

            Object.keys(hourly).forEach((key) => {
                if (!Array.isArray(hourly[key])) return;
                if (hourly[key].length !== hourlyTimes.length) {
                    warnings.push(`forecast.hourly.${key} not reordered due to mismatched length`);
                    return;
                }
                hourly[key] = sortedIndices.map((idx) => hourly[key][idx]);
            });
            warnings.push('forecast.hourly.time was unsorted; hourly arrays reordered');
        }
    }

    const timezone = forecast.timezone || null;
    const nowHourIndex = getClosestNowHourIndex(hourly.time, new Date(nowIso));

    return {
        forecast,
        meta: {
            timezone,
            units: {
                temp: 'F',
                wind: 'mph',
                precip: 'in',
                pressure: 'hPa'
            },
            nowIso,
            nowHourIndex,
            ...(warnings.length ? { validationWarnings: warnings } : {})
        }
    };
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
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const cached = storage.getWeatherCache(lat, lon, days, WEATHER_CACHE_VARIANT);

    if (cached?.payload && cached.cachedAt && (now - cached.cachedAt) <= WEATHER_TTL_MS) {
        return { ...cached.payload, stale: false, fromCache: true };
    }

    const { startDate, endDate } = getArchiveDateRange(new Date(now));

    const historicalUrl = `${API_CONFIG.WEATHER.ARCHIVE_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `start_date=${startDate}&` +
        `end_date=${endDate}&` +
        `daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,cloud_cover_mean,wind_speed_10m_mean,wind_speed_10m_max,precipitation_sum&` +
        `temperature_unit=${WEATHER_UNITS.temp}&` +
        `windspeed_unit=${WEATHER_UNITS.wind}&` +
        `precipitation_unit=${WEATHER_UNITS.precip}&` +
        `timezone=${WEATHER_TIMEZONE}`;

    const forecastUrl = `${API_CONFIG.WEATHER.FORECAST_URL}?` +
        `latitude=${lat}&` +
        `longitude=${lon}&` +
        `current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation,vapour_pressure_deficit,et0_fao_evapotranspiration&` +
        `hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation,precipitation_probability,shortwave_radiation,vapour_pressure_deficit,et0_fao_evapotranspiration&` +
        `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_probability_max,precipitation_sum,wind_speed_10m_mean,wind_speed_10m_max,wind_direction_10m_dominant,cloud_cover_mean,sunrise,sunset,weather_code&` +
        `temperature_unit=${WEATHER_UNITS.temp}&` +
        `windspeed_unit=${WEATHER_UNITS.wind}&` +
        `precipitation_unit=${WEATHER_UNITS.precip}&` +
        `timezone=${WEATHER_TIMEZONE}&` +
        `forecast_days=${days}`;

    try {
        const [historicalData, rawForecastData] = await Promise.all([
            fetchJsonWithRetry(historicalUrl),
            fetchJsonWithRetry(forecastUrl)
        ]);

        const normalized = validateAndNormalizeForecast(rawForecastData, nowIso);
        const payload = {
            historical: historicalData,
            forecast: normalized.forecast,
            meta: normalized.meta
        };

        const isDev = typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';
        if (isDev && payload.meta?.validationWarnings?.length) {
            console.warn('[FishCast][weatherAPI] validation warnings:', payload.meta.validationWarnings);
        }

        storage.setWeatherCache(lat, lon, days, {
            payload,
            cachedAt: now
        }, WEATHER_CACHE_VARIANT);

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
        `current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,precipitation,vapour_pressure_deficit,et0_fao_evapotranspiration&` +
        `temperature_unit=${WEATHER_UNITS.temp}&` +
        `windspeed_unit=${WEATHER_UNITS.wind}&` +
        `precipitation_unit=${WEATHER_UNITS.precip}&` +
        `timezone=${WEATHER_TIMEZONE}`;

    return fetchJsonWithRetry(url);
}
