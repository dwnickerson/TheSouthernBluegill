import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateWaterTempByPeriod } from '../js/models/waterTemp.js';

function buildHourlyDay({ date = '2026-02-12', temps = [], clouds = [], winds = [] }) {
  const time = [];
  const temperature_2m = [];
  const cloud_cover = [];
  const wind_speed_10m = [];

  for (let hour = 0; hour < 24; hour++) {
    const hh = String(hour).padStart(2, '0');
    time.push(`${date}T${hh}:00`);
    temperature_2m.push(temps[hour] ?? 50);
    cloud_cover.push(clouds[hour] ?? 40);
    wind_speed_10m.push(winds[hour] ?? 5);
  }

  return { time, temperature_2m, cloud_cover, wind_speed_10m };
}

test('pond period estimate captures daytime warming on clear calm day', () => {
  const hourly = buildHourlyDay({
    temps: [44, 43, 42, 41, 41, 42, 45, 49, 53, 57, 60, 63, 65, 66, 67, 66, 64, 61, 57, 53, 50, 48, 46, 45],
    clouds: Array(24).fill(15),
    winds: Array(24).fill(4)
  });

  const morning = estimateWaterTempByPeriod({
    dailySurfaceTemp: 52,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-02-12T15:00:00Z'),
    period: 'morning'
  });

  const afternoon = estimateWaterTempByPeriod({
    dailySurfaceTemp: 52,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-02-12T21:00:00Z'),
    period: 'midday'
  });

  assert.ok(afternoon > morning, `afternoon should exceed morning for clear calm setup (${afternoon} vs ${morning})`);
  assert.ok(afternoon - morning >= 1.5, `intraday spread should be meaningful, got ${(afternoon - morning).toFixed(1)}°F`);
});

test('cloud and wind damping suppress intraday spread', () => {
  const stableTemps = [44, 43, 42, 42, 41, 42, 45, 48, 52, 56, 60, 63, 65, 66, 66, 65, 62, 58, 54, 50, 48, 46, 45, 44];

  const calmClear = buildHourlyDay({
    date: '2026-02-13',
    temps: stableTemps,
    clouds: Array(24).fill(20),
    winds: Array(24).fill(4)
  });

  const windyCloudy = buildHourlyDay({
    date: '2026-02-13',
    temps: stableTemps,
    clouds: Array(24).fill(90),
    winds: Array(24).fill(18)
  });

  const clearSpread = estimateWaterTempByPeriod({
    dailySurfaceTemp: 50,
    waterType: 'pond',
    hourly: calmClear,
    timezone: 'UTC',
    date: new Date('2026-02-13T18:00:00Z'),
    period: 'midday'
  }) - estimateWaterTempByPeriod({
    dailySurfaceTemp: 50,
    waterType: 'pond',
    hourly: calmClear,
    timezone: 'UTC',
    date: new Date('2026-02-13T15:00:00Z'),
    period: 'morning'
  });

  const dampedSpread = estimateWaterTempByPeriod({
    dailySurfaceTemp: 50,
    waterType: 'pond',
    hourly: windyCloudy,
    timezone: 'UTC',
    date: new Date('2026-02-13T18:00:00Z'),
    period: 'afternoon'
  }) - estimateWaterTempByPeriod({
    dailySurfaceTemp: 50,
    waterType: 'pond',
    hourly: windyCloudy,
    timezone: 'UTC',
    date: new Date('2026-02-13T15:00:00Z'),
    period: 'morning'
  });

  assert.ok(dampedSpread < clearSpread, `damped spread (${dampedSpread.toFixed(1)}°F) should be lower than clear spread (${clearSpread.toFixed(1)}°F)`);
});

test('overcast pond setup tempers warm-air anomaly impact', () => {
  const hourly = buildHourlyDay({
    date: '2026-02-10',
    // Pattern mirrors Tupelo field conditions: cooler AM, warmer PM air.
    temps: [49, 48, 48, 47, 47, 48, 51, 54, 58, 61, 63, 65, 66, 67, 67, 67, 66, 65, 62, 59, 56, 54, 52, 51],
    clouds: Array(24).fill(100),
    winds: Array(24).fill(6)
  });

  const morning = estimateWaterTempByPeriod({
    dailySurfaceTemp: 48,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-02-10T07:00:00Z'),
    period: 'morning'
  });

  const afternoon = estimateWaterTempByPeriod({
    dailySurfaceTemp: 48,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-02-10T17:00:00Z'),
    period: 'afternoon'
  });

  const spread = afternoon - morning;
  assert.ok(spread <= 2.2, `fully overcast spread should stay muted, got ${spread.toFixed(1)}°F`);
  assert.ok(spread >= 0.4, `some daytime warming should remain, got ${spread.toFixed(1)}°F`);
});

test('sunrise and sunset timestamps anchor morning and afternoon period estimates', () => {
  const hourly = buildHourlyDay({
    date: '2026-06-20',
    temps: [61, 60, 59, 58, 58, 59, 62, 66, 71, 76, 80, 83, 85, 86, 87, 86, 83, 79, 75, 71, 68, 65, 63, 62],
    clouds: Array(24).fill(20),
    winds: Array(24).fill(5)
  });

  const sunriseTemp = estimateWaterTempByPeriod({
    dailySurfaceTemp: 74,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-06-20T12:00:00Z'),
    period: 'morning',
    sunriseTime: '2026-06-20T05:45',
    sunsetTime: '2026-06-20T20:30'
  });

  const legacyMorningTemp = estimateWaterTempByPeriod({
    dailySurfaceTemp: 74,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-06-20T12:00:00Z'),
    period: 'morning'
  });

  assert.ok(
    sunriseTemp < legacyMorningTemp,
    `sunrise-anchored morning (${sunriseTemp}°F) should be cooler than legacy 9 AM morning (${legacyMorningTemp}°F)`
  );
});
