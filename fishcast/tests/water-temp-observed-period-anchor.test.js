import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWaterTempView } from '../js/models/waterTemp.js';
import { normalizeWaterTempContext } from '../js/models/waterPayloadNormalize.js';
import { storage } from '../js/services/storage.js';

function buildContext(nowOverride = '2026-02-19T18:00:00.000Z') {
  return normalizeWaterTempContext({
    coords: { lat: 34.2576, lon: -88.7034 },
    waterType: 'pond',
    timezone: 'America/Chicago',
    nowOverride,
    weatherPayload: {
      historical: { daily: { temperature_2m_mean: [50, 52, 54, 56, 58] } },
      forecast: {
        timezone: 'America/Chicago',
        hourly: {
          time: [
            '2026-02-19T06:00', '2026-02-19T07:00', '2026-02-19T08:00', '2026-02-19T09:00',
            '2026-02-19T10:00', '2026-02-19T11:00', '2026-02-19T12:00', '2026-02-19T13:00',
            '2026-02-19T14:00', '2026-02-19T15:00', '2026-02-19T16:00', '2026-02-19T17:00'
          ],
          temperature_2m: [42, 44, 47, 50, 54, 58, 61, 63, 64, 63, 60, 56],
          cloud_cover: [90, 85, 75, 60, 45, 35, 30, 32, 38, 45, 60, 72],
          wind_speed_10m: [10, 9, 8, 7, 6, 6, 5, 5, 6, 7, 8, 9]
        },
        current: {
          temperature_2m: 61,
          wind_speed_10m: 5,
          relative_humidity_2m: 60,
          cloud_cover: 32,
          weather_code: 1,
          precipitation: 0
        },
        daily: {
          time: ['2026-02-19'],
          sunrise: ['2026-02-19T06:45'],
          sunset: ['2026-02-19T17:45']
        }
      },
      meta: {
        source: 'FIXTURE',
        units: { temp: 'F', wind: 'mph', precip: 'in' }
      }
    }
  });
}

test('same-day observed water temp anchors surface-now while keeping period projections stable', () => {
  storage.clearAll();

  const context = buildContext();
  const baseline = buildWaterTempView({ dailySurfaceTemp: 53.4, waterType: 'pond', context });

  storage.setWaterTempObserved(34.2576, -88.7034, 'pond', 55.4, '2026-02-19T18:00:00.000Z');
  const anchored = buildWaterTempView({ dailySurfaceTemp: 53.4, waterType: 'pond', context });

  assert.ok(Math.abs(anchored.surfaceNow - 55.4) <= 0.3, `surface-now should align to observed reading, got ${anchored.surfaceNow}`);
  assert.ok(Math.abs(anchored.surfaceNow - baseline.surfaceNow) >= 0.5, `observed anchor should materially adjust surface-now (${anchored.surfaceNow} vs ${baseline.surfaceNow})`);

  assert.ok(Math.abs(anchored.midday - baseline.midday) <= 0.1, 'observed anchor should not rewrite midday projection');
  assert.ok(Math.abs(anchored.sunrise - baseline.sunrise) <= 0.1, 'observed anchor should not rewrite sunrise projection');
  assert.ok(Math.abs(anchored.sunset - baseline.sunset) <= 0.1, 'observed anchor should not rewrite sunset projection');

  storage.clearAll();
});
