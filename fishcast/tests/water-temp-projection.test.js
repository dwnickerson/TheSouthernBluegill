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




test('extended warming trend avoids persistent cold bias', () => {
  const forecast = {
    daily: {
      ...forecastDailyTemplate,
      temperature_2m_mean: [52, 54, 57, 60, 63, 66],
      temperature_2m_min: [45, 47, 49, 52, 55, 58],
      temperature_2m_max: [59, 61, 65, 68, 71, 74],
      cloud_cover_mean: [58, 55, 52, 49, 46, 43],
      wind_speed_10m_mean: [6, 7, 7, 8, 8, 9],
      wind_speed_10m_max: [12, 13, 14, 15, 16, 17]
    }
  };

  const projected = projectWaterTemps(50, forecast, 'lake', 34.5, {
    anchorDate: new Date('2026-03-01T12:00:00Z')
  });

  const day5Change = projected[5] - projected[0];
  assert.ok(day5Change >= 3.5, `warming sequence should materially rise by day 5, got ${day5Change.toFixed(2)}°F`);
});
test('projection respects km/h wind units from forecast metadata', () => {
  const forecast = {
    daily_units: {
      wind_speed_10m_mean: 'km/h',
      wind_speed_10m_max: 'km/h'
    },
    daily: {
      ...forecastDailyTemplate,
      temperature_2m_mean: [78, 77, 77, 76, 76, 75],
      cloud_cover_mean: [40, 42, 44, 45, 46, 47],
      wind_speed_10m_mean: [16, 22, 24, 20, 18, 16],
      wind_speed_10m_max: [28, 34, 36, 30, 28, 26]
    }
  };

  const projected = projectWaterTemps(79, forecast, 'lake', 34.8, {
    anchorDate: new Date('2026-06-01T12:00:00Z')
  });

  const day1Drop = projected[1] - projected[0];
  assert.ok(day1Drop > -2.5, `km/h winds should not be treated as mph; got day-1 change ${day1Drop.toFixed(2)}°F`);
});


test('synoptic events can drive large physically plausible changes for lakes and ponds', () => {
  const forecast = {
    daily: {
      ...forecastDailyTemplate,
      temperature_2m_mean: [58, 74, 77, 79, 80, 81],
      temperature_2m_min: [50, 67, 70, 72, 73, 74],
      temperature_2m_max: [66, 81, 84, 86, 87, 88],
      cloud_cover_mean: [80, 35, 28, 26, 30, 32],
      precipitation_sum: [0.0, 22, 16, 8, 2, 0],
      wind_speed_10m_mean: [6, 22, 20, 16, 12, 10],
      wind_speed_10m_max: [10, 38, 35, 28, 20, 16]
    }
  };

  const lakeProjected = projectWaterTemps(56, forecast, 'lake', 34.2, {
    anchorDate: new Date('2026-03-20T12:00:00Z')
  });
  const pondProjected = projectWaterTemps(56, forecast, 'pond', 34.2, {
    anchorDate: new Date('2026-03-20T12:00:00Z')
  });

  const lakeDay1Rise = lakeProjected[1] - lakeProjected[0];
  const pondDay1Rise = pondProjected[1] - pondProjected[0];

  assert.ok(lakeDay1Rise >= 2.0, `lake should respond to strong front-driven warming, got ${lakeDay1Rise.toFixed(2)}°F`);
  assert.ok(pondDay1Rise >= 3.0, `pond should respond strongly to front-driven warming, got ${pondDay1Rise.toFixed(2)}°F`);
});

test('reservoir remains more inertial than lakes during the same synoptic event', () => {
  const forecast = {
    daily: {
      ...forecastDailyTemplate,
      temperature_2m_mean: [58, 74, 77, 79, 80, 81],
      temperature_2m_min: [50, 67, 70, 72, 73, 74],
      temperature_2m_max: [66, 81, 84, 86, 87, 88],
      cloud_cover_mean: [80, 35, 28, 26, 30, 32],
      precipitation_sum: [0.0, 22, 16, 8, 2, 0],
      wind_speed_10m_mean: [6, 22, 20, 16, 12, 10],
      wind_speed_10m_max: [10, 38, 35, 28, 20, 16]
    }
  };

  const reservoirProjected = projectWaterTemps(56, forecast, 'reservoir', 34.2, {
    anchorDate: new Date('2026-03-20T12:00:00Z')
  });
  const lakeProjected = projectWaterTemps(56, forecast, 'lake', 34.2, {
    anchorDate: new Date('2026-03-20T12:00:00Z')
  });

  const reservoirDay1Rise = reservoirProjected[1] - reservoirProjected[0];
  const lakeDay1Rise = lakeProjected[1] - lakeProjected[0];

  assert.ok(reservoirDay1Rise > 0.8, `reservoir should still react to major forcing, got ${reservoirDay1Rise.toFixed(2)}°F`);
  assert.ok(reservoirDay1Rise < lakeDay1Rise, `reservoir should warm less than lake under same forcing (${reservoirDay1Rise.toFixed(2)} vs ${lakeDay1Rise.toFixed(2)}°F)`);
});

test('late-winter warm front can produce an approximately 2°F day-over-day lake increase', () => {
  const forecast = {
    daily: {
      time: [
        '2026-02-16',
        '2026-02-17',
        '2026-02-18',
        '2026-02-19',
        '2026-02-20',
        '2026-02-21',
        '2026-02-22'
      ],
      temperature_2m_mean: [50, 52, 63.5, 67.5, 61, 54.5, 42.5],
      temperature_2m_min: [43, 45, 58, 59, 53, 46, 36],
      temperature_2m_max: [57, 59, 69, 76, 69, 63, 49],
      cloud_cover_mean: [60, 58, 52, 68, 72, 70, 62],
      precipitation_sum: [0, 0, 0.05, 0.3, 0.3, 0.2, 0.1],
      wind_speed_10m_mean: [10, 13, 14, 20, 14, 18, 19],
      wind_speed_10m_max: [15, 18, 20, 27, 20, 25, 26]
    }
  };

  const projected = projectWaterTemps(47.8, forecast, 'lake', 34.5, {
    anchorDate: new Date('2026-02-16T12:00:00Z')
  });

  const feb18ToFeb19Rise = projected[3] - projected[2];

  assert.ok(feb18ToFeb19Rise >= 1.8, `late-winter frontal setup should allow roughly 2°F rises, got ${feb18ToFeb19Rise.toFixed(2)}°F`);
  assert.ok(feb18ToFeb19Rise <= 3.1, `lake response should remain physically bounded, got ${feb18ToFeb19Rise.toFixed(2)}°F`);
});


test('synoptic precipitation signal is tempered when rain probability is low', () => {
  const forecastLowProb = {
    daily_units: { precipitation_sum: 'inch' },
    daily: {
      ...forecastDailyTemplate,
      temperature_2m_mean: [54, 58, 59, 58, 57, 56],
      precipitation_sum: [0, 1.0, 0.8, 0.2, 0, 0],
      precipitation_probability_max: [0, 10, 10, 20, 5, 5],
      wind_speed_10m_mean: [8, 16, 14, 10, 8, 8],
      wind_speed_10m_max: [12, 24, 20, 14, 12, 12]
    }
  };

  const forecastHighProb = {
    daily_units: { precipitation_sum: 'inch' },
    daily: {
      ...forecastLowProb.daily,
      precipitation_probability_max: [0, 95, 90, 75, 20, 20]
    }
  };

  const lowProb = projectWaterTemps(52, forecastLowProb, 'lake', 34.1, {
    anchorDate: new Date('2026-03-01T12:00:00Z')
  });
  const highProb = projectWaterTemps(52, forecastHighProb, 'lake', 34.1, {
    anchorDate: new Date('2026-03-01T12:00:00Z')
  });

  const lowProbDay1Change = lowProb[1] - lowProb[0];
  const highProbDay1Change = highProb[1] - highProb[0];

  assert.ok(
    highProbDay1Change > lowProbDay1Change,
    `higher executed rain signal should increase synoptic forcing (${highProbDay1Change.toFixed(2)} vs ${lowProbDay1Change.toFixed(2)}°F)`
  );
});

test('projection trend bootstrap incorporates recent historical air temperatures', () => {
  const forecast = {
    daily: {
      ...forecastDailyTemplate,
      temperature_2m_mean: [52, 53, 54, 55, 56, 57],
      cloud_cover_mean: [45, 44, 43, 42, 41, 40],
      wind_speed_10m_mean: [6, 6, 6, 6, 6, 6],
      wind_speed_10m_max: [10, 10, 10, 10, 10, 10]
    }
  };

  const withoutHistory = projectWaterTemps(49.5, forecast, 'lake', 34.7, {
    anchorDate: new Date('2026-02-20T12:00:00Z')
  });
  const withHistory = projectWaterTemps(49.5, forecast, 'lake', 34.7, {
    anchorDate: new Date('2026-02-20T12:00:00Z'),
    historicalDaily: {
      temperature_2m_mean: [44, 47, 50, 51],
      cloud_cover_mean: [70, 68, 65, 60]
    }
  });

  const day1Delta = Math.abs(withHistory[1] - withoutHistory[1]);
  assert.ok(
    day1Delta >= 0.2,
    `historical context should materially influence day-1 projection, got ${day1Delta.toFixed(2)}°F`
  );
});
