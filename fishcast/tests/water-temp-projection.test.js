import test from 'node:test';
import assert from 'node:assert/strict';

import { projectWaterTemps } from '../js/models/waterTemp.js';

const forecastDailyTemplate = {
  time: [
    '2026-06-01',
    '2026-06-02',
    '2026-06-03',
    '2026-06-04',
    '2026-06-05',
    '2026-06-06'
  ],
  temperature_2m_mean: [76, 77, 78, 79, 80, 80],
  temperature_2m_min: [70, 71, 72, 73, 74, 74],
  temperature_2m_max: [82, 83, 84, 85, 86, 86],
  cloud_cover_mean: [35, 35, 32, 34, 36, 38],
  wind_speed_10m_mean: [6, 6, 7, 7, 6, 6],
  wind_speed_10m_max: [12, 12, 14, 14, 12, 12]
};

test('projection keeps day-0 anchor and aligns one value per daily date', () => {
  const initialWaterTemp = 75.2;
  const forecast = { daily: { ...forecastDailyTemplate } };

  const projected = projectWaterTemps(initialWaterTemp, forecast, 'lake', 33.75, {
    anchorDate: new Date('2026-06-01T12:00:00Z')
  });

  assert.equal(projected.length, forecast.daily.time.length, 'projection should align with daily dates');
  assert.equal(projected[0], initialWaterTemp, 'day-0 should remain current anchored temp');
  assert.notEqual(projected[1], projected[0], 'day-1 should reflect tomorrow forcing, not duplicate day-0');
});

test('warm stable pattern does not exhibit artificial cooling drift', () => {
  const forecast = {
    daily: {
      ...forecastDailyTemplate,
      temperature_2m_mean: [81, 81, 82, 82, 82, 81],
      cloud_cover_mean: [20, 22, 24, 26, 25, 24],
      wind_speed_10m_mean: [5, 5, 5, 6, 5, 5],
      wind_speed_10m_max: [9, 9, 10, 10, 9, 9]
    }
  };

  const projected = projectWaterTemps(79.5, forecast, 'pond', 32.1, {
    anchorDate: new Date('2026-06-01T12:00:00Z')
  });

  const netChange = projected[projected.length - 1] - projected[0];
  assert.ok(netChange > -1.5, `expected no strong cooling drift in warm stable setup, got ${netChange.toFixed(2)}°F`);
});

test('high-wind day cooling is bounded for warm-water/cool-air setup', () => {
  const forecast = {
    daily: {
      ...forecastDailyTemplate,
      temperature_2m_mean: [70, 66, 66, 67, 68, 69],
      cloud_cover_mean: [60, 62, 64, 60, 58, 56],
      wind_speed_10m_mean: [8, 18, 10, 9, 8, 8],
      wind_speed_10m_max: [14, 34, 20, 18, 15, 14]
    }
  };

  const projected = projectWaterTemps(78, forecast, 'lake', 35.5, {
    anchorDate: new Date('2026-06-01T12:00:00Z')
  });

  const day1Drop = projected[1] - projected[0];
  assert.ok(day1Drop >= -3.1, `cooling should be bounded, got ${day1Drop.toFixed(2)}°F`);
  assert.ok(day1Drop <= 0.5, `setup should not spuriously warm on high-wind cool-air day, got ${day1Drop.toFixed(2)}°F`);
});
