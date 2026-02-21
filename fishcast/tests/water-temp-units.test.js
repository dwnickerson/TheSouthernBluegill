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


const { buildWaterTempView } = await import('../js/models/waterTemp.js');

test('buildWaterTempView uses timezone-local hour when hourly timestamps include Z offset', () => {
  const baseContext = {
    timezone: 'America/Chicago',
    anchorDateISOZ: '2026-05-15T18:00:00Z',
    hourlyNowTimeISOZ: '2026-05-15T20:00:00Z', // 15:00 local
    payload: {
      forecast: {
        daily: {
          time: ['2026-05-15'],
          sunrise: ['2026-05-15T06:10'],
          sunset: ['2026-05-15T19:50']
        },
        hourly: {
          cloud_cover: [25, 25, 25],
          wind_speed_10m: [3, 3, 3],
          shortwave_radiation: [120, 620, 300],
          temperature_2m: [68, 75.2, 78.8]
        }
      }
    }
  };

  const contextNaive = {
    ...baseContext,
    hourlyNowTimeISOZ: '2026-05-15T15:00',
    payload: {
      ...baseContext.payload,
      forecast: {
        ...baseContext.payload.forecast,
        hourly: {
          ...baseContext.payload.forecast.hourly,
          time: ['2026-05-15T09:00', '2026-05-15T12:00', '2026-05-15T15:00']
        }
      }
    }
  };

  const contextUtc = {
    ...baseContext,
    payload: {
      ...baseContext.payload,
      forecast: {
        ...baseContext.payload.forecast,
        hourly: {
          ...baseContext.payload.forecast.hourly,
          time: ['2026-05-15T14:00:00Z', '2026-05-15T17:00:00Z', '2026-05-15T20:00:00Z']
        }
      }
    }
  };

  const viewNaive = buildWaterTempView({ dailySurfaceTemp: 72, waterType: 'pond', context: contextNaive });
  const viewUtc = buildWaterTempView({ dailySurfaceTemp: 72, waterType: 'pond', context: contextUtc });

  assert.ok(Math.abs(viewNaive.surfaceNow - viewUtc.surfaceNow) < 0.2, `Expected matching surfaceNow, got ${viewNaive.surfaceNow} vs ${viewUtc.surfaceNow}`);
  assert.ok(Math.abs(viewNaive.midday - viewUtc.midday) < 0.2, `Expected matching midday, got ${viewNaive.midday} vs ${viewUtc.midday}`);
});
