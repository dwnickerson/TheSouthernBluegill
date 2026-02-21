import test from 'node:test';
import assert from 'node:assert/strict';

import { getWeather } from '../js/services/weatherAPI.js';

test('weather API requests mph units and forecast daily mean wind series', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    calls.push(String(url));

    if (String(url).includes('/v1/archive')) {
      return {
        ok: true,
        async json() {
          return { daily: { temperature_2m_mean: [70] } };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          timezone: 'UTC',
          hourly: {
            time: ['2026-06-01T00:00'],
            wind_speed_10m: [5],
            surface_pressure: [1012],
            temperature_2m: [70],
            precipitation_probability: [0],
            cloud_cover: [20]
          }
        };
      }
    };
  };

  try {
    await getWeather(35.0, -90.0, 3);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(calls.length, 2, 'expected archive and forecast weather calls');

  const forecastUrl = calls.find((value) => value.includes('/v1/forecast'));
  assert.ok(forecastUrl, 'forecast URL should be requested');
  assert.match(forecastUrl, /windspeed_unit=mph/, 'forecast request should explicitly request mph wind units');
  assert.match(forecastUrl, /daily=[^&]*wind_speed_10m_mean/, 'forecast request daily fields should include wind_speed_10m_mean');

  const archiveUrl = calls.find((value) => value.includes('/v1/archive'));
  assert.ok(archiveUrl, 'archive URL should be requested');
  assert.match(archiveUrl, /windspeed_unit=mph/, 'archive request should explicitly request mph wind units');
});


test('weather API still returns live forecast payload when archive endpoint fails', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    const raw = String(url);
    calls.push(raw);

    if (raw.includes('/v1/archive')) {
      return { ok: false, status: 500 };
    }

    return {
      ok: true,
      async json() {
        return {
          timezone: 'UTC',
          hourly: {
            time: ['2026-06-01T00:00'],
            wind_speed_10m: [5],
            wind_direction_10m: [180],
            surface_pressure: [1012],
            temperature_2m: [70],
            apparent_temperature: [70],
            relative_humidity_2m: [55],
            cloud_cover: [20],
            weather_code: [0],
            precipitation: [0],
            precipitation_probability: [0],
            shortwave_radiation: [350]
          },
          current: {
            temperature_2m: 70,
            apparent_temperature: 70,
            relative_humidity_2m: 55,
            surface_pressure: 1012,
            wind_speed_10m: 5,
            wind_direction_10m: 180,
            cloud_cover: 20,
            weather_code: 0,
            precipitation: 0,
            shortwave_radiation: 350
          },
          daily: {
            time: ['2026-06-01'],
            temperature_2m_max: [78],
            temperature_2m_min: [63],
            temperature_2m_mean: [70],
            precipitation_probability_max: [5],
            precipitation_sum: [0],
            wind_speed_10m_mean: [5],
            wind_speed_10m_max: [10],
            wind_direction_10m_dominant: [180],
            cloud_cover_mean: [20],
            sunrise: ['2026-06-01T05:45'],
            sunset: ['2026-06-01T20:10'],
            weather_code: [0]
          }
        };
      }
    };
  };

  try {
    const payload = await getWeather(35.7, -90.4, 3);
    assert.equal(payload.stale, false);
    assert.equal(payload.fromCache, false);
    assert.equal(payload.partial, true);
    assert.match(payload.partialReason, /Historical weather fallback/);
    assert.equal(payload.meta?.source, 'LIVE_FORECAST_FALLBACK');
    assert.equal(payload.forecast?.daily?.temperature_2m_mean?.[0], 70);
  } finally {
    global.fetch = originalFetch;
  }

  assert.ok(calls.length >= 2, 'expected archive + forecast request attempts');
  assert.ok(calls.some((value) => value.includes('/v1/archive')), 'archive should be attempted');
  assert.ok(calls.some((value) => value.includes('/v1/forecast')), 'forecast should be attempted');
});
