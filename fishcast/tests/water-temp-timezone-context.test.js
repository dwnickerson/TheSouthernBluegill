import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWaterTempContext } from '../js/models/waterPayloadNormalize.js';

import { buildWaterTempView } from '../js/models/waterTemp.js';

test('normalizeWaterTempContext keeps timezone-auto local hourly alignment for naive timestamps', () => {
  const context = normalizeWaterTempContext({
    coords: { lat: 34.2576, lon: -88.7034 },
    waterType: 'pond',
    timezone: 'America/Chicago',
    nowOverride: '2026-02-19T12:35:00.000Z', // 06:35 local (CST)
    weatherPayload: {
      historical: { daily: { temperature_2m_mean: [45, 46, 47, 48, 49] } },
      forecast: {
        timezone: 'America/Chicago',
        hourly: {
          time: [
            '2026-02-19T04:00',
            '2026-02-19T05:00',
            '2026-02-19T06:00',
            '2026-02-19T07:00',
            '2026-02-19T08:00'
          ],
          temperature_2m: [40, 41, 42, 44, 46],
          cloud_cover: [90, 90, 88, 85, 80],
          wind_speed_10m: [4, 4, 5, 5, 6]
        },
        current: {
          temperature_2m: 42,
          wind_speed_10m: 5,
          relative_humidity_2m: 80,
          cloud_cover: 88,
          weather_code: 3,
          precipitation: 0
        },
        daily: {
          time: ['2026-02-19'],
          sunrise: ['2026-02-19T06:35'],
          sunset: ['2026-02-19T17:40']
        }
      },
      meta: {
        source: 'FIXTURE',
        units: { temp: 'F', wind: 'mph', precip: 'in' }
      }
    }
  });

  assert.equal(context.nowHourIndex, 3, 'closest local hour to 06:35 should be 07:00 index');
  assert.equal(context.anchorDateISOZ, '2026-02-19T07:00');
  assert.equal(context.hourlyNowTimeISOZ, '2026-02-19T07:00');
});


test('buildWaterTempView uses local timezone day key for UTC anchor timestamps', () => {
  const context = normalizeWaterTempContext({
    coords: { lat: 34.2576, lon: -88.7034 },
    waterType: 'pond',
    timezone: 'America/Chicago',
    nowOverride: '2026-02-20T00:30:00.000Z', // 18:30 local on 2026-02-19
    weatherPayload: {
      historical: { daily: { temperature_2m_mean: [45, 46, 47, 48, 49] } },
      forecast: {
        timezone: 'America/Chicago',
        hourly: {
          time: [
            '2026-02-20T00:00:00.000Z',
            '2026-02-20T01:00:00.000Z',
            '2026-02-20T12:00:00.000Z',
            '2026-02-20T13:00:00.000Z'
          ],
          temperature_2m: [58, 57, 41, 40],
          cloud_cover: [70, 72, 75, 78],
          wind_speed_10m: [5, 5, 5, 5]
        },
        current: {
          temperature_2m: 57,
          wind_speed_10m: 5,
          relative_humidity_2m: 78,
          cloud_cover: 70,
          weather_code: 3,
          precipitation: 0
        },
        daily: {
          time: ['2026-02-19', '2026-02-20'],
          sunrise: ['2026-02-19T06:33', '2026-02-20T06:32'],
          sunset: ['2026-02-19T17:42', '2026-02-20T17:43']
        }
      },
      meta: {
        source: 'FIXTURE',
        units: { temp: 'F', wind: 'mph', precip: 'in' }
      }
    }
  });

  const view = buildWaterTempView({
    dailySurfaceTemp: 57.0,
    waterType: 'pond',
    context
  });

  assert.ok(view.surfaceNow >= 55, `expected local-day evening anchor to remain on warmer prior local day, got ${view.surfaceNow.toFixed(1)}°F`);
});
