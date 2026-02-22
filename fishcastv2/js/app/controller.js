import { buildForecastState } from './state.js';
import { renderApp } from '../ui/render.js';

const DEFAULT_COORDS = { lat: 34.2576, lon: -88.7034, name: 'Tupelo Pond (v2)' };
const DEFAULT_DAYS = 5;

function parseUrlConfig() {
  const params = new URLSearchParams(window.location.search || '');
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const days = Number(params.get('days'));
  const waterType = params.get('waterType') || 'pond';
  const species = params.get('species') || 'bluegill';
  const name = params.get('name') || DEFAULT_COORDS.name;

  return {
    coords: {
      lat: Number.isFinite(lat) ? lat : DEFAULT_COORDS.lat,
      lon: Number.isFinite(lon) ? lon : DEFAULT_COORDS.lon,
      name
    },
    days: Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 10) : DEFAULT_DAYS,
    waterType,
    species
  };
}

function buildArchiveDateRange(now = new Date()) {
  const end = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const start = new Date(end.getTime() - (13 * 24 * 60 * 60 * 1000));
  const toIsoDate = (value) => value.toISOString().slice(0, 10);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function buildForecastUrl({ lat, lon, days }) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'auto',
    forecast_days: String(days),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum,et0_fao_evapotranspiration'
  }).toString();
  return url.toString();
}

function buildHistoricalUrl({ lat, lon }) {
  const { startDate, endDate } = buildArchiveDateRange();
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,cloud_cover_mean,wind_speed_10m_mean,wind_speed_10m_max,precipitation_sum'
  }).toString();
  return url.toString();
}

function buildModelPayload({ forecastResponse, historicalResponse = null, source = 'open-meteo-live' }) {
  const nowHourIndex = Array.isArray(forecastResponse?.hourly?.time)
    ? forecastResponse.hourly.time.findIndex((value) => value === forecastResponse?.current?.time)
    : -1;

  return {
    historical: historicalResponse,
    forecast: forecastResponse,
    meta: {
      units: {
        temp: 'F',
        wind: 'mph',
        precip: 'in',
        pressure: 'hPa'
      },
      nowIso: forecastResponse?.current?.time || new Date().toISOString(),
      nowHourIndex: nowHourIndex >= 0 ? nowHourIndex : undefined,
      source
    }
  };
}

async function loadFixturePayload() {
  const response = await fetch('../fishcast/js/tools/fixtures/weatherPayload.sample.json');
  if (!response.ok) {
    throw new Error(`Unable to load fixture payload (${response.status})`);
  }
  return response.json();
}

async function loadLiveForecastPayload({ coords, days }) {
  const [forecastResult, historicalResult] = await Promise.allSettled([
    fetch(buildForecastUrl({ lat: coords.lat, lon: coords.lon, days })),
    fetch(buildHistoricalUrl({ lat: coords.lat, lon: coords.lon }))
  ]);

  if (forecastResult.status !== 'fulfilled') {
    throw forecastResult.reason;
  }

  const forecastResponse = forecastResult.value;
  if (!forecastResponse.ok) {
    throw new Error(`Live forecast request failed (${forecastResponse.status})`);
  }

  const live = await forecastResponse.json();

  if (historicalResult.status !== 'fulfilled') {
    return buildModelPayload({
      forecastResponse: live,
      historicalResponse: null,
      source: 'open-meteo-live-forecast-only'
    });
  }

  const historicalResponse = historicalResult.value;
  if (!historicalResponse.ok) {
    return buildModelPayload({
      forecastResponse: live,
      historicalResponse: null,
      source: `open-meteo-live-forecast-only(historical-${historicalResponse.status})`
    });
  }

  const historical = await historicalResponse.json();
  return buildModelPayload({
    forecastResponse: live,
    historicalResponse: historical,
    source: 'open-meteo-live+archive'
  });
}

async function loadWeatherPayload({ coords, days }) {
  try {
    return await loadLiveForecastPayload({ coords, days });
  } catch (error) {
    console.warn('[FishCast v2] Falling back to fixture payload:', error);
    return loadFixturePayload();
  }
}

async function main() {
  const root = document.querySelector('#app');
  if (!root) return;

  const runtime = parseUrlConfig();
  const { coords, days, waterType, species } = runtime;

  try {
    const weatherPayload = await loadWeatherPayload({ coords, days });
    const state = await buildForecastState({
      coords,
      waterType,
      speciesKey: species,
      days,
      weatherPayload
    });

    renderApp(root, state);
    window.__FISHCAST_V2_STATE__ = state;
  } catch (error) {
    root.innerHTML = `<p>Failed to build forecast state: ${error.message}</p>`;
  }
}

main();
