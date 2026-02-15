import test from 'node:test';
import assert from 'node:assert/strict';

const makeLocalStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
};

global.localStorage = makeLocalStorage();

const {
  buildDayWindows,
  applyStabilityControls,
  getStabilityStorageKey,
  calculateSpeciesAwareDayScore,
  scoreSpeciesByProfile
} = await import('../js/models/forecastEngine.js');

const weatherFixture = {
  historical: {
    daily: {
      precipitation_sum: [0, 2, 5]
    }
  },
  forecast: {
    current: { weather_code: 1 },
    daily: { precipitation_sum: [1, 0, 0], time: ['2026-05-01', '2026-05-02', '2026-05-03'] },
    hourly: {
      time: [
        '2026-05-01T00:00', '2026-05-01T01:00', '2026-05-01T02:00', '2026-05-01T03:00',
        '2026-05-02T00:00', '2026-05-02T01:00', '2026-05-02T02:00', '2026-05-02T03:00',
        '2026-05-03T00:00', '2026-05-03T01:00', '2026-05-03T02:00', '2026-05-03T03:00'
      ],
      surface_pressure: [1014, 1013, 1012, 1011, 1011, 1010, 1009, 1008, 1012, 1013, 1014, 1015],
      wind_speed_10m: [8, 9, 8, 7, 9, 10, 11, 10, 10, 12, 11, 10],
      cloud_cover: [30, 35, 40, 45, 50, 55, 60, 65, 45, 50, 55, 60],
      precipitation_probability: [10, 10, 20, 15, 20, 20, 25, 20, 25, 30, 30, 35],
      temperature_2m: [20, 20, 19, 19, 21, 21, 22, 22, 22, 23, 23, 24]
    }
  }
};

test('buildDayWindows slices local day correctly', () => {
  const { dayIndexes, dayFeatures } = buildDayWindows(weatherFixture, '2026-05-02');
  assert.deepEqual(dayIndexes, [4, 5, 6, 7]);
  assert.ok(Number.isFinite(dayFeatures.pressureAvg));
});

test('stability gate limits non-material jumps', () => {
  const locationKey = '34.000_-88.000';
  const dateKey = '2026-05-02';
  const speciesKey = 'bluegill';

  const first = applyStabilityControls({
    baseScore: 60,
    inputs: { pressureAvg: 1012, windAvgKmh: 10, precipProbAvg: 20, cloudAvg: 50, tempAvgC: 21, waterTempF: 72 },
    speciesKey,
    locationKey,
    dateKey,
    now: new Date('2026-05-01T18:00:00-05:00')
  });
  assert.equal(first.score, 60);

  const second = applyStabilityControls({
    baseScore: 90,
    inputs: { pressureAvg: 1012.5, windAvgKmh: 10, precipProbAvg: 22, cloudAvg: 52, tempAvgC: 21, waterTempF: 72.2 },
    speciesKey,
    locationKey,
    dateKey,
    now: new Date('2026-05-01T18:20:00-05:00')
  });

  assert.equal(second.score, 72);
});

test('freeze policy locks tomorrow after 7pm without major shift', () => {
  const speciesKey = 'bluegill';
  const locationKey = '34.000_-88.000';
  const dateKey = '2026-05-03';

  applyStabilityControls({
    baseScore: 67,
    inputs: { pressureAvg: 1011, windAvgKmh: 11, precipProbAvg: 28, cloudAvg: 55, tempAvgC: 22, waterTempF: 73 },
    speciesKey,
    locationKey,
    dateKey,
    now: new Date('2026-05-02T18:00:00-05:00')
  });

  const frozen = applyStabilityControls({
    baseScore: 76,
    inputs: { pressureAvg: 1011.5, windAvgKmh: 11.2, precipProbAvg: 27, cloudAvg: 56, tempAvgC: 22.2, waterTempF: 73.1 },
    speciesKey,
    locationKey,
    dateKey,
    now: new Date('2026-05-02T20:15:00-05:00')
  });

  assert.equal(frozen.score, 67);
});

test('deterministic score for identical inputs', () => {
  const payload = {
    weather: weatherFixture,
    speciesKey: 'bluegill',
    waterTemp: 72,
    coords: { lat: 34.2, lon: -88.7 }
  };

  const run1 = calculateSpeciesAwareDayScore({
    data: payload,
    dayKey: '2026-05-01',
    speciesKey: 'bluegill',
    waterTempF: 72,
    locationKey: '34.200_-88.700',
    now: new Date('2026-04-30T12:00:00-05:00')
  }).score;

  global.localStorage.clear();

  const run2 = calculateSpeciesAwareDayScore({
    data: payload,
    dayKey: '2026-05-01',
    speciesKey: 'bluegill',
    waterTempF: 72,
    locationKey: '34.200_-88.700',
    now: new Date('2026-04-30T12:00:00-05:00')
  }).score;

  assert.equal(run1, run2);
});

test('golden snapshot for bluegill day score', () => {
  global.localStorage.clear();
  const payload = {
    weather: weatherFixture,
    coords: { lat: 34.2, lon: -88.7 }
  };

  const output = calculateSpeciesAwareDayScore({
    data: payload,
    dayKey: '2026-05-02',
    speciesKey: 'bluegill',
    waterTempF: 72,
    locationKey: '34.200_-88.700',
    now: new Date('2026-05-01T10:00:00-05:00')
  });

  assert.equal(output.score, 92);
});

test('stability cache key includes location, species, and date', () => {
  const key = getStabilityStorageKey('34.2_-88.7', 'bluegill', '2026-05-01');
  assert.match(key, /34.2_-88.7/);
  assert.match(key, /bluegill/);
  assert.match(key, /2026-05-01/);
});


test('species profiles enforce realistic score ceilings for bass conditions', () => {
  const { score, profile } = scoreSpeciesByProfile({
    pressureAvg: 1012,
    windAvgKmh: 10,
    cloudAvg: 55,
    precipProbAvg: 30,
    tempAvgC: 29,
    pressureTrend: { trend: 'falling', rate: -0.6 }
  }, 84, '2026-08-10', 'bass');

  assert.equal(profile.ceiling, 90);
  assert.ok(score <= 90);
});

test('phase-aware scoring boosts prespawn windows and keeps cloud spawn adjustment phase-gated', () => {
  const baseFeatures = {
    pressureAvg: 1012,
    windAvgKmh: 8,
    cloudAvg: 85,
    precipProbAvg: 20,
    tempAvgC: 18,
    pressureTrend: { trend: 'stable', rate: 0 }
  };

  const preSpawn = scoreSpeciesByProfile(baseFeatures, 54, '2026-03-15', 'bass');
  const winter = scoreSpeciesByProfile(baseFeatures, 44, '2026-03-15', 'bass');

  assert.ok(preSpawn.score > winter.score);
  assert.ok(preSpawn.contributions.some((c) => c.factor === 'phase_pre_spawn'));
  assert.ok(preSpawn.contributions.some((c) => c.factor === 'spawn_cloud_adjustment'));
  assert.ok(!winter.contributions.some((c) => c.factor === 'spawn_cloud_adjustment'));
});
