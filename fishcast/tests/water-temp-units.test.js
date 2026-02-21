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

test('buildWaterTempView period estimates respect hourly Celsius metadata', () => {
  const hourlyTimes = [
    '2026-05-15T09:00',
    '2026-05-15T12:00',
    '2026-05-15T15:00'
  ];
  const hourlyC = [20, 24, 26]; // 68F, 75.2F, 78.8F
  const contextC = {
    timezone: 'America/Chicago',
    anchorDateISOZ: '2026-05-15T18:00:00Z',
    hourlyNowTimeISOZ: '2026-05-15T15:00',
    payload: {
      forecast: {
        daily: {
          time: ['2026-05-15'],
          sunrise: ['2026-05-15T06:10'],
          sunset: ['2026-05-15T19:50']
        },
        hourly: {
          time: hourlyTimes,
          temperature_2m: hourlyC,
          cloud_cover: [25, 25, 25],
          wind_speed_10m: [3, 3, 3],
          shortwave_radiation: [120, 620, 300]
        }
      },
      meta: {
        units: { temp: 'C' }
      }
    }
  };

  const contextF = {
    ...contextC,
    payload: {
      ...contextC.payload,
      forecast: {
        ...contextC.payload.forecast,
        hourly: {
          ...contextC.payload.forecast.hourly,
          temperature_2m: [68, 75.2, 78.8]
        }
      },
      meta: {
        units: { temp: 'F' }
      }
    }
  };

  const viewFromC = buildWaterTempView({ dailySurfaceTemp: 72, waterType: 'pond', context: contextC });
  const viewFromF = buildWaterTempView({ dailySurfaceTemp: 72, waterType: 'pond', context: contextF });

  assert.ok(Math.abs(viewFromC.surfaceNow - viewFromF.surfaceNow) < 0.2, `Expected matching surfaceNow, got ${viewFromC.surfaceNow} vs ${viewFromF.surfaceNow}`);
  assert.ok(Math.abs(viewFromC.midday - viewFromF.midday) < 0.2, `Expected matching midday, got ${viewFromC.midday} vs ${viewFromF.midday}`);
});
