import { buildForecastState } from './state.js';
import { renderApp } from '../ui/render.js';

const DEFAULT_COORDS = { lat: 34.2576, lon: -88.7034, name: 'Tupelo Pond (v2)' };
const DEFAULT_DAYS = 5;

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

function buildModelPayload(forecastResponse) {
  const nowHourIndex = Array.isArray(forecastResponse?.hourly?.time)
    ? forecastResponse.hourly.time.findIndex((value) => value === forecastResponse?.current?.time)
    : -1;

  return {
    historical: null,
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
      source: 'open-meteo-live'
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
  const response = await fetch(buildForecastUrl({ lat: coords.lat, lon: coords.lon, days }));
  if (!response.ok) {
    throw new Error(`Live forecast request failed (${response.status})`);
  }

  const live = await response.json();
  return buildModelPayload(live);
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

  const coords = DEFAULT_COORDS;
  const days = DEFAULT_DAYS;

  try {
    const weatherPayload = await loadWeatherPayload({ coords, days });
    const state = await buildForecastState({
      coords,
      waterType: 'pond',
      speciesKey: 'bluegill',
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
