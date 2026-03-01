import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWaterTempView } from '../js/models/waterTemp.js';
import { normalizeWaterTempContext } from '../js/models/waterPayloadNormalize.js';
import { storage } from '../js/services/storage.js';

function buildContext(nowOverride = '2026-02-19T19:00:00.000Z') {
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

  storage.setWaterTempObserved(34.2576, -88.7034, 'pond', 58.4, '2026-02-19T18:00:00.000Z');
  const anchored = buildWaterTempView({ dailySurfaceTemp: 53.4, waterType: 'pond', context });

  assert.ok(anchored.surfaceNow > baseline.surfaceNow, `warmer observation should nudge surface-now upward (${anchored.surfaceNow} vs ${baseline.surfaceNow})`);
  assert.ok(anchored.surfaceNow - baseline.surfaceNow >= 0.4, `observed anchor should materially adjust surface-now (${anchored.surfaceNow} vs ${baseline.surfaceNow})`);

  assert.ok(Math.abs(anchored.midday - baseline.midday) <= 0.1, 'observed anchor should not rewrite midday projection');
  assert.ok(Math.abs(anchored.sunrise - baseline.sunrise) <= 0.1, 'observed anchor should not rewrite sunrise projection');
  assert.ok(Math.abs(anchored.sunset - baseline.sunset) <= 0.1, 'observed anchor should not rewrite sunset projection');

  storage.clearAll();
});


test('same-day observed anchor decays after several hours instead of hard-locking surface-now', () => {
  storage.clearAll();

  const context = buildContext('2026-02-19T23:00:00.000Z');
  const baseline = buildWaterTempView({ dailySurfaceTemp: 53.4, waterType: 'pond', context });

  storage.setWaterTempObserved(34.2576, -88.7034, 'pond', 60.4, '2026-02-19T18:00:00.000Z');
  const anchored = buildWaterTempView({ dailySurfaceTemp: 53.4, waterType: 'pond', context });

  assert.ok(anchored.surfaceNow > baseline.surfaceNow + 0.1, 'observed reading should still influence surface-now');
  assert.ok(anchored.surfaceNow < baseline.surfaceNow + 2.2, `older same-day report should be partially decayed, got ${anchored.surfaceNow}`);

  storage.clearAll();
});

test('stale same-day observed anchor is ignored after long age window', () => {
  storage.clearAll();

  const context = buildContext('2026-02-19T23:30:00.000Z');
  const baseline = buildWaterTempView({ dailySurfaceTemp: 53.4, waterType: 'pond', context });

  storage.setWaterTempObserved(34.2576, -88.7034, 'pond', 60.4, '2026-02-19T06:00:00.000Z');
  const anchored = buildWaterTempView({ dailySurfaceTemp: 53.4, waterType: 'pond', context });

  assert.equal(anchored.surfaceNow, baseline.surfaceNow, 'stale same-day observation should not alter surface-now');

  storage.clearAll();
});
