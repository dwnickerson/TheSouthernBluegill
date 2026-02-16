import test from 'node:test';
import assert from 'node:assert/strict';

const makeLocalStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i],
    get length() { return map.size; }
  };
};

global.localStorage = makeLocalStorage();
global.fetch = async () => ({ ok: true, json: async () => [] });

const { estimateWaterTemp } = await import('../js/models/waterTemp.js');

const coords = { lat: 33.75, lon: -84.39 };
const currentDate = new Date('2026-05-15T12:00:00Z');

function toC(f) {
  return (f - 32) * 5 / 9;
}

test('estimateWaterTemp respects weather temperature units metadata', async () => {
  const fahrenheitWeather = {
    daily: {
      temperature_2m_mean: [68, 69, 70, 71, 72, 73, 74],
      cloud_cover_mean: [40, 42, 44, 46, 45, 43, 41],
      wind_speed_10m_mean: [7, 8, 8, 9, 8, 7, 7],
      wind_speed_10m_max: [15, 16, 17, 18, 17, 16, 15],
      precipitation_sum: [0, 0, 0.1, 0, 0, 0, 0]
    },
    forecast: { hourly: { wind_speed_10m: Array(72).fill(8) } },
    meta: { nowHourIndex: 24, units: { temp: 'F' } }
  };

  const celsiusWeather = {
    daily: {
      ...fahrenheitWeather.daily,
      temperature_2m_mean: fahrenheitWeather.daily.temperature_2m_mean.map(toC)
    },
    forecast: fahrenheitWeather.forecast,
    meta: { nowHourIndex: 24, units: { temp: 'C' } }
  };

  localStorage.clear();
  const fromF = await estimateWaterTemp(coords, 'lake', currentDate, fahrenheitWeather);

  localStorage.clear();
  const fromC = await estimateWaterTemp(coords, 'lake', currentDate, celsiusWeather);

  assert.ok(Math.abs(fromF - fromC) < 0.2, `Expected unit-normalized results to match, got ${fromF} vs ${fromC}`);
});
