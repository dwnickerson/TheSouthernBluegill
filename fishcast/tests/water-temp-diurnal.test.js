import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateWaterTempByPeriod } from '../js/models/waterTemp.js';

function buildHourlyDay({ date = '2026-02-12', temps = [], clouds = [], winds = [], shortwave = [] }) {
  const time = [];
  const temperature_2m = [];
  const cloud_cover = [];
  const wind_speed_10m = [];
  const shortwave_radiation = [];

  for (let hour = 0; hour < 24; hour++) {
    const hh = String(hour).padStart(2, '0');
    time.push(`${date}T${hh}:00`);
    temperature_2m.push(temps[hour] ?? 50);
    cloud_cover.push(clouds[hour] ?? 40);
    wind_speed_10m.push(winds[hour] ?? 5);
    shortwave_radiation.push(shortwave[hour] ?? 0);
  }

  return { time, temperature_2m, cloud_cover, wind_speed_10m, shortwave_radiation };
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

test('midday period anchors to solar midpoint between sunrise and sunset', () => {
  const hourly = buildHourlyDay({
    date: '2026-06-20',
    temps: [61, 60, 59, 58, 58, 59, 62, 66, 71, 76, 80, 83, 85, 86, 87, 86, 83, 79, 75, 71, 68, 65, 63, 62],
    clouds: Array(24).fill(20),
    winds: Array(24).fill(5)
  });

  const legacyNoonMidday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 74,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-06-20T12:00:00Z'),
    period: 'midday'
  });

  const solarNoonAnchoredMidday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 74,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-06-20T12:00:00Z'),
    period: 'midday',
    sunriseTime: '2026-06-20T05:45',
    sunsetTime: '2026-06-20T20:30'
  });

  const explicitNoon = estimateWaterTempByPeriod({
    dailySurfaceTemp: 74,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-06-20T12:00:00Z'),
    period: 'midday',
    targetHour: 12
  });

  const explicitSolarMidpoint = estimateWaterTempByPeriod({
    dailySurfaceTemp: 74,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-06-20T12:00:00Z'),
    period: 'midday',
    targetHour: 13 + (7.5 / 60)
  });

  assert.equal(legacyNoonMidday, explicitNoon, 'legacy midday behavior should resolve to fixed 12:00 without solar anchors');
  assert.ok(
    Math.abs(solarNoonAnchoredMidday - explicitSolarMidpoint) <= 0.3,
    `midday should resolve near sunrise/sunset solar midpoint when provided (${solarNoonAnchoredMidday} vs ${explicitSolarMidpoint})`
  );
});



test('midday estimate responds to local noon calming versus all-day mean wind', () => {
  const breezyMorningCalmNoon = buildHourlyDay({
    date: '2026-04-02',
    temps: [44, 43, 42, 42, 42, 43, 46, 50, 55, 60, 64, 67, 69, 70, 70, 69, 66, 62, 58, 54, 51, 49, 47, 46],
    clouds: Array(24).fill(35),
    winds: [16, 16, 15, 15, 14, 14, 13, 12, 10, 9, 8, 7, 4, 4, 5, 6, 8, 10, 11, 12, 13, 14, 15, 16]
  });

  const breezyAllDay = buildHourlyDay({
    date: '2026-04-02',
    temps: [44, 43, 42, 42, 42, 43, 46, 50, 55, 60, 64, 67, 69, 70, 70, 69, 66, 62, 58, 54, 51, 49, 47, 46],
    clouds: Array(24).fill(35),
    winds: Array(24).fill(12)
  });

  const calmNoonMidday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 54,
    waterType: 'pond',
    hourly: breezyMorningCalmNoon,
    date: new Date('2026-04-02T12:00:00Z'),
    period: 'midday',
    sunriseTime: '2026-04-02T06:40',
    sunsetTime: '2026-04-02T19:20'
  });

  const windyMidday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 54,
    waterType: 'pond',
    hourly: breezyAllDay,
    date: new Date('2026-04-02T12:00:00Z'),
    period: 'midday',
    sunriseTime: '2026-04-02T06:40',
    sunsetTime: '2026-04-02T19:20'
  });

  assert.ok(calmNoonMidday > windyMidday, `calmer local midday wind should warm water estimate (${calmNoonMidday} vs ${windyMidday})`);
});

test('targetHour supports minute-level now interpolation without period bucket snapping', () => {
  const hourly = buildHourlyDay({
    date: '2026-04-18',
    temps: [48, 47, 46, 45, 45, 46, 49, 53, 58, 63, 67, 70, 72, 73, 73, 72, 69, 65, 60, 56, 53, 51, 50, 49],
    clouds: Array(24).fill(30),
    winds: Array(24).fill(5)
  });

  const sunrise = estimateWaterTempByPeriod({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    hourly,
    period: 'morning',
    sunriseTime: '2026-04-18T06:35',
    sunsetTime: '2026-04-18T19:35'
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    hourly,
    period: 'midday',
    sunriseTime: '2026-04-18T06:35',
    sunsetTime: '2026-04-18T19:35'
  });

  const now0635 = estimateWaterTempByPeriod({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    hourly,
    period: 'midday',
    sunriseTime: '2026-04-18T06:35',
    sunsetTime: '2026-04-18T19:35',
    targetHour: 6 + (35 / 60)
  });

  assert.ok(now0635 <= sunrise + 0.6, `06:35 now (${now0635}) should remain close to sunrise (${sunrise})`);
  assert.ok(now0635 <= midday, `06:35 now (${now0635}) should not exceed midday (${midday})`);
});



test('pond now estimate can exceed legacy 4.6°F cap during hot bright calm afternoons', () => {
  const hourly = buildHourlyDay({
    date: '2026-05-28',
    temps: [58,57,56,55,55,56,60,66,73,80,86,91,95,97,96,93,88,82,76,71,67,64,62,60],
    clouds: Array(24).fill(10),
    winds: Array(24).fill(3),
    shortwave: [
      0,0,0,0,0,30,120,260,430,610,760,860,
      920,900,810,650,430,220,80,20,0,0,0,0
    ]
  });

  const afternoon = estimateWaterTempByPeriod({
    dailySurfaceTemp: 53,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-05-28T19:00:00Z'),
    period: 'midday',
    targetHour: 14
  });

  assert.ok(afternoon >= 59.5, `hot bright calm afternoon should exceed legacy cap, got ${afternoon}°F`);
});

test('shortwave radiation boosts midday estimate in shallow pond despite similar air profile', () => {
  const temps = [44, 43, 42, 42, 42, 43, 46, 50, 55, 60, 64, 67, 69, 70, 70, 69, 66, 62, 58, 54, 51, 49, 47, 46];
  const clouds = Array(24).fill(35);
  const winds = Array(24).fill(6);

  const dimDay = buildHourlyDay({
    date: '2026-04-03',
    temps,
    clouds,
    winds,
    shortwave: Array(24).fill(80)
  });

  const brightMidday = buildHourlyDay({
    date: '2026-04-03',
    temps,
    clouds,
    winds,
    shortwave: [
      0, 0, 0, 0, 0, 20, 80, 150, 260, 380, 500, 620,
      720, 760, 700, 560, 380, 220, 90, 20, 0, 0, 0, 0
    ]
  });

  const dimMidday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 54,
    waterType: 'pond',
    hourly: dimDay,
    date: new Date('2026-04-03T12:00:00Z'),
    period: 'midday'
  });

  const brightMiddayTemp = estimateWaterTempByPeriod({
    dailySurfaceTemp: 54,
    waterType: 'pond',
    hourly: brightMidday,
    date: new Date('2026-04-03T12:00:00Z'),
    period: 'midday'
  });

  assert.ok(brightMiddayTemp > dimMidday, `higher shortwave should raise midday estimate (${brightMiddayTemp} vs ${dimMidday})`);
});
