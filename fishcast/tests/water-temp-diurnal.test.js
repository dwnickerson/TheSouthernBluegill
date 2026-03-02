import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWaterTempView, estimateWaterTempByPeriod } from '../js/models/waterTemp.js';

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


test('Tupelo cloudy cold-season profile keeps midday muted while allowing late-day recovery', () => {
  const hourly = buildHourlyDay({
    date: '2026-02-16',
    temps: [54, 53, 53, 52, 52, 53, 54, 56, 58, 59, 60, 61, 61, 62, 62, 61, 60, 59, 58, 57, 56, 55, 55, 54],
    clouds: [96, 96, 96, 95, 95, 94, 94, 93, 92, 92, 93, 94, 95, 95, 96, 96, 95, 94, 93, 93, 94, 95, 96, 96],
    winds: [6, 6, 6, 5, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 8, 7, 7, 6, 6, 6, 6, 6, 6, 6],
    shortwave: [
      0, 0, 0, 0, 0, 20, 50, 90, 130, 170, 210, 235,
      250, 240, 210, 170, 120, 70, 25, 5, 0, 0, 0, 0
    ]
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 58.8,
    waterType: 'pond',
    hourly,
    timezone: 'America/Chicago',
    date: new Date('2026-02-16T18:00:00Z'),
    period: 'midday',
    targetHour: 12
  });

  const sunset = estimateWaterTempByPeriod({
    dailySurfaceTemp: 58.8,
    waterType: 'pond',
    hourly,
    timezone: 'America/Chicago',
    date: new Date('2026-02-16T23:30:00Z'),
    period: 'afternoon',
    targetHour: 17.5
  });

  assert.ok(midday <= 59.3, `cloudy cold-season midday should stay muted versus daily baseline, got ${midday}°F`);
  assert.ok(sunset >= 59.0, `late-day pond temp should recover toward observed sunset level, got ${sunset}°F`);
  assert.ok(sunset >= midday - 0.2, `sunset should stay near midday under this profile (${midday}°F -> ${sunset}°F)`);
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



test('pond late-afternoon heat retention can keep sunset near/above midday on clear warm days', () => {
  const hourly = buildHourlyDay({
    date: '2026-06-28',
    temps: [68, 67, 66, 65, 65, 66, 69, 73, 78, 83, 87, 90, 92, 93, 94, 94, 93, 91, 88, 84, 80, 76, 73, 71],
    clouds: Array(24).fill(12),
    winds: [4, 4, 4, 4, 4, 4, 5, 5, 5, 4, 4, 4, 4, 4, 5, 5, 4, 4, 3, 3, 3, 3, 3, 3],
    shortwave: [0, 0, 0, 0, 0, 20, 80, 180, 340, 520, 680, 760, 820, 830, 780, 650, 500, 340, 180, 80, 20, 0, 0, 0]
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 86,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-06-28T14:00:00Z'),
    period: 'midday',
    sunriseTime: '2026-06-28T05:52',
    sunsetTime: '2026-06-28T20:15'
  });

  const sunset = estimateWaterTempByPeriod({
    dailySurfaceTemp: 86,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-06-28T19:00:00Z'),
    period: 'afternoon',
    sunriseTime: '2026-06-28T05:52',
    sunsetTime: '2026-06-28T20:15'
  });

  assert.ok(
    sunset >= midday - 0.9,
    `sunset should stay close to/above midday for heat-retaining pond setup (${sunset} vs ${midday})`
  );
});


test('lake late-afternoon estimate avoids abrupt drop below midday under clear calm warm forcing', () => {
  const hourly = buildHourlyDay({
    date: '2026-07-03',
    temps: [70, 69, 68, 67, 67, 68, 71, 75, 80, 84, 88, 91, 93, 94, 95, 95, 94, 92, 89, 85, 82, 78, 75, 73],
    clouds: Array(24).fill(15),
    winds: Array(24).fill(4),
    shortwave: [0, 0, 0, 0, 0, 25, 90, 210, 380, 560, 710, 790, 840, 845, 800, 670, 520, 360, 190, 90, 25, 0, 0, 0]
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 84,
    waterType: 'lake',
    hourly,
    timezone: 'UTC',
    period: 'midday',
    sunriseTime: '2026-07-03T05:55',
    sunsetTime: '2026-07-03T20:22'
  });

  const sunset = estimateWaterTempByPeriod({
    dailySurfaceTemp: 84,
    waterType: 'lake',
    hourly,
    timezone: 'UTC',
    period: 'afternoon',
    sunriseTime: '2026-07-03T05:55',
    sunsetTime: '2026-07-03T20:22'
  });

  assert.ok(sunset >= midday - 1.5, `lake sunset should not crash too far below midday (${sunset} vs ${midday})`);
});

test('reservoir late-afternoon estimate preserves gradual cooling versus midday on warm clear days', () => {
  const hourly = buildHourlyDay({
    date: '2026-07-03',
    temps: [70, 69, 68, 67, 67, 68, 71, 75, 80, 84, 88, 91, 93, 94, 95, 95, 94, 92, 89, 85, 82, 78, 75, 73],
    clouds: Array(24).fill(15),
    winds: Array(24).fill(4),
    shortwave: [0, 0, 0, 0, 0, 25, 90, 210, 380, 560, 710, 790, 840, 845, 800, 670, 520, 360, 190, 90, 25, 0, 0, 0]
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 81,
    waterType: 'reservoir',
    hourly,
    timezone: 'UTC',
    period: 'midday',
    sunriseTime: '2026-07-03T05:55',
    sunsetTime: '2026-07-03T20:22'
  });

  const sunset = estimateWaterTempByPeriod({
    dailySurfaceTemp: 81,
    waterType: 'reservoir',
    hourly,
    timezone: 'UTC',
    period: 'afternoon',
    sunriseTime: '2026-07-03T05:55',
    sunsetTime: '2026-07-03T20:22'
  });

  assert.ok(sunset >= midday - 1.8, `reservoir sunset should cool gradually from midday (${sunset} vs ${midday})`);
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


test('late-winter pond midday estimate stays bounded under warm clear anomaly', () => {
  const hourly = buildHourlyDay({
    date: '2026-02-28',
    temps: [43, 42, 41, 40, 40, 41, 45, 50, 56, 62, 68, 72, 75, 75, 74, 72, 69, 65, 60, 56, 52, 49, 47, 45],
    clouds: Array(24).fill(6),
    winds: Array(24).fill(5),
    shortwave: [
      0, 0, 0, 0, 0, 30, 120, 260, 430, 610, 760, 860,
      920, 900, 810, 650, 430, 220, 80, 20, 0, 0, 0, 0
    ]
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 56,
    waterType: 'pond',
    hourly,
    timezone: 'America/Chicago',
    date: new Date('2026-02-28T19:00:00Z'),
    period: 'midday',
    targetHour: 13
  });

  assert.ok(midday <= 60.0, `late-winter warm anomaly should remain bounded (got ${midday}°F)`);
});


test('cold-season pond midday avoids >2°F jump on mild clear Tupelo-style forcing', () => {
  const hourly = buildHourlyDay({
    date: '2026-02-21',
    temps: [46, 45, 45, 44, 44, 45, 48, 52, 56, 60, 62, 63, 63, 62, 61, 59, 57, 55, 53, 51, 49, 48, 47, 46],
    clouds: Array(24).fill(12),
    winds: Array(24).fill(4)
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    hourly,
    timezone: 'America/Chicago',
    date: new Date('2026-02-21T18:00:00Z'),
    period: 'midday',
    targetHour: 12
  });

  assert.ok(midday <= 59.0, `mild-air late-winter midday should stay near observed range, got ${midday}°F`);
});

test('cold-season pond midday warming is capped for mild-air clear mornings', () => {
  const hourly = buildHourlyDay({
    date: '2026-02-21',
    temps: [46, 45, 45, 44, 44, 45, 48, 52, 56, 60, 62, 63, 63, 62, 61, 59, 57, 55, 53, 51, 49, 48, 47, 46],
    clouds: Array(24).fill(12),
    winds: Array(24).fill(4)
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    hourly,
    timezone: 'UTC',
    date: new Date('2026-02-21T16:00:00Z'),
    period: 'midday'
  });

  assert.ok(midday <= 59.8, `cold-season mild-air midday should stay bounded near observed reality, got ${midday}°F`);
  assert.ok(midday >= 57.5, `midday should still allow some warming signal, got ${midday}°F`);
});

test('cold-season cloudy Tupelo pond midday stays near observed lag while sunset recovers', () => {
  const hourly = buildHourlyDay({
    date: '2026-03-01',
    temps: [
      55, 54, 54, 53, 53, 54, 55, 56, 57, 58, 59, 60,
      61, 61, 61, 60, 60, 59, 58, 58, 57, 56, 56, 55
    ],
    clouds: [
      88, 88, 88, 87, 87, 86, 85, 84, 84, 85, 86, 87,
      86, 84, 82, 80, 78, 76, 75, 76, 78, 82, 86, 88
    ],
    winds: [
      5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7,
      7, 7, 7, 7, 6, 6, 6, 6, 6, 5, 5, 5
    ],
    shortwave: [
      0, 0, 0, 0, 0, 15, 35, 65, 95, 130, 165, 185,
      195, 185, 160, 130, 90, 45, 15, 5, 0, 0, 0, 0
    ]
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    hourly,
    timezone: 'America/Chicago',
    date: new Date('2026-03-01T18:00:00Z'),
    period: 'midday',
    targetHour: 12
  });

  const sunset = estimateWaterTempByPeriod({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    hourly,
    timezone: 'America/Chicago',
    date: new Date('2026-03-01T23:30:00Z'),
    period: 'afternoon',
    targetHour: 17.5
  });

  assert.ok(midday <= 57.4, `cloudy cold-season midday should stay near observed 57°F, got ${midday}°F`);
  assert.ok(sunset >= midday - 0.3, `sunset should hold near midday rather than collapsing (${midday}°F -> ${sunset}°F)`);
});


test('near-term cold-season pond midday rise is rate-limited within ~2 hours of now', () => {
  const hourly = buildHourlyDay({
    date: '2026-02-24',
    temps: [45, 44, 44, 43, 43, 44, 47, 51, 56, 60, 64, 67, 69, 70, 69, 67, 63, 59, 55, 52, 49, 47, 46, 45],
    clouds: Array(24).fill(10),
    winds: Array(24).fill(4),
    shortwave: [
      0, 0, 0, 0, 0, 20, 90, 210, 390, 560, 730, 850,
      920, 900, 760, 560, 340, 130, 30, 8, 0, 0, 0, 0
    ]
  });

  const context = {
    timezone: 'America/Chicago',
    anchorDateISOZ: '2026-02-24T17:30:00.000Z',
    hourlyNowTimeISOZ: '2026-02-24T17:30:00.000Z',
    payload: {
      meta: { timezone: 'America/Chicago', source: 'LIVE' },
      forecast: {
        timezone: 'America/Chicago',
        daily: {
          time: ['2026-02-24'],
          sunrise: ['2026-02-24T06:40'],
          sunset: ['2026-02-24T17:50']
        },
        hourly
      }
    }
  };

  const view = buildWaterTempView({
    dailySurfaceTemp: 57,
    waterType: 'pond',
    context
  });

  assert.ok(view.midday - view.surfaceNow <= 1.2, `midday should not jump unrealistically within ~2h (${view.surfaceNow} -> ${view.midday})`);
});
