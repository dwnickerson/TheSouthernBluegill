import test from 'node:test';
import assert from 'node:assert/strict';

import { storage } from '../js/services/storage.js';
import { normalizeWaterTempContext } from '../js/models/waterPayloadNormalize.js';
import { buildWaterTempView } from '../js/models/waterTemp.js';

function buildFixtureContext() {
  return normalizeWaterTempContext({
    coords: { lat: 34.2576, lon: -88.7034 },
    waterType: 'pond',
    timezone: 'America/Chicago',
    nowOverride: '2026-02-20T16:00:00.000Z',
    weatherPayload: {
      historical: { daily: { temperature_2m_mean: [45, 46, 47, 48, 49] } },
      forecast: {
        timezone: 'America/Chicago',
        hourly: {
          time: [
            '2026-02-20T06:00',
            '2026-02-20T09:00',
            '2026-02-20T12:00',
            '2026-02-20T15:00',
            '2026-02-20T18:00'
          ],
          temperature_2m: [53, 55, 58, 57, 54],
          cloud_cover: [80, 70, 45, 50, 70],
          wind_speed_10m: [5, 6, 8, 8, 6]
        },
        current: {
          temperature_2m: 57,
          wind_speed_10m: 8,
          relative_humidity_2m: 65,
          cloud_cover: 50,
          weather_code: 3,
          precipitation: 0
        },
        daily: {
          time: ['2026-02-20'],
          sunrise: ['2026-02-20T06:32'],
          sunset: ['2026-02-20T17:43']
        }
      },
      meta: {
        source: 'FIXTURE',
        units: { temp: 'F', wind: 'mph', precip: 'in' }
      }
    }
  });
}

test('observed report calibrates only surface-now while preserving projected period anchors', () => {
  const context = buildFixtureContext();

  const baseline = buildWaterTempView({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    context
  });

  storage.setWaterTempObserved(
    context.coords.lat,
    context.coords.lon,
    'pond',
    61,
    '2026-02-20T15:00:00.000Z'
  );

  const withObserved = buildWaterTempView({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    context
  });

  assert.equal(withObserved.sunrise, baseline.sunrise, 'sunrise period should stay on projection values');
  assert.equal(withObserved.midday, baseline.midday, 'midday period should stay on projection values');
  assert.equal(withObserved.sunset, baseline.sunset, 'sunset period should stay on projection values');
  assert.notEqual(withObserved.surfaceNow, baseline.surfaceNow, 'surface-now should still calibrate to observed report');
});
