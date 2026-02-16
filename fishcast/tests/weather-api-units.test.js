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
