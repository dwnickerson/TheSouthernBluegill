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
