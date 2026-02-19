import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateWaterTemp, explainWaterTempTerms } from '../js/models/waterTemp.js';
import { storage } from '../js/services/storage.js';

function setupStorage() {
  const storageMemo = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storageMemo.has(k) ? storageMemo.get(k) : null),
    setItem: (k, v) => { storageMemo.set(k, String(v)); },
    removeItem: (k) => { storageMemo.delete(k); }
  };
  return storageMemo;
}

test('cold-season overcast pond signal suppresses warm bias', async () => {
  const storageMemo = setupStorage();
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });

  const coords = { lat: 34.2576, lon: -88.7034 };
  const currentDate = new Date('2026-02-16T12:00:00Z');

  const buildWeather = (cloudValue) => ({
    daily: {
      temperature_2m_mean: [49, 50, 51, 52, 53, 54, 55],
      cloud_cover_mean: Array(7).fill(cloudValue),
      wind_speed_10m_mean: [6, 6, 6, 7, 7, 6, 6]
    }
  });

  const overcast = await estimateWaterTemp(coords, 'pond', currentDate, buildWeather(98));
  storageMemo.clear();
  const clear = await estimateWaterTemp(coords, 'pond', currentDate, buildWeather(15));

  assert.ok(overcast < clear, `overcast pond estimate should be cooler (${overcast} vs ${clear})`);
  assert.ok(overcast <= 50, `overcast winter pond estimate should stay bounded, got ${overcast}°F`);
});

test('trusted same-day local report can override warm memo bias for winter pond', async () => {
  const storageMemo = setupStorage();
  const coords = { lat: 34.2576, lon: -88.7034 };
  const currentDate = new Date('2026-02-16T17:00:00Z');
  const memoKey = `fishcast_water_temp_memo_${coords.lat.toFixed(4)}_${coords.lon.toFixed(4)}_pond`;

  storageMemo.set(memoKey, JSON.stringify({
    temp: 57.5,
    dayKey: '2026-02-16',
    modelVersion: '2.2.1'
  }));

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ([
      {
        latitude: 34.259,
        longitude: -88.704,
        timestamp: '2026-02-16T15:30:00Z',
        temperature: 51.4,
        waterBody: 'pond'
      },
      {
        latitude: 34.258,
        longitude: -88.703,
        timestamp: '2026-02-16T20:30:00Z',
        temperature: 54.3,
        waterBody: 'pond'
      }
    ])
  });

  const estimate = await estimateWaterTemp(coords, 'pond', currentDate, {
    daily: {
      temperature_2m_mean: [49, 50, 51, 52, 53, 54, 55],
      cloud_cover_mean: [92, 94, 95, 94, 93, 92, 91],
      wind_speed_10m_mean: [5, 5, 6, 6, 6, 5, 5]
    }
  });

  assert.ok(
    estimate <= 54.8,
    `trusted local reports should materially cool estimate below stale memo bias, got ${estimate}°F`
  );
  assert.ok(
    estimate >= 45.0,
    `trusted local reports should still remain physically plausible, got ${estimate}°F`
  );
});


test('trusted report matching is case-insensitive for water body type', async () => {
  const storageMemo = setupStorage();
  const coords = { lat: 34.2576, lon: -88.7034 };
  const currentDate = new Date('2026-02-16T17:00:00Z');
  const memoKey = `fishcast_water_temp_memo_${coords.lat.toFixed(4)}_${coords.lon.toFixed(4)}_pond`;

  storageMemo.set(memoKey, JSON.stringify({
    temp: 57.5,
    dayKey: '2026-02-16',
    modelVersion: '2.2.1'
  }));

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ([
      {
        latitude: 34.259,
        longitude: -88.704,
        timestamp: '2026-02-16T15:30:00Z',
        temperature: 51.4,
        waterBody: 'POND'
      }
    ])
  });

  const estimate = await estimateWaterTemp(coords, 'pond', currentDate, {
    daily: {
      temperature_2m_mean: [49, 50, 51, 52, 53, 54, 55],
      cloud_cover_mean: [92, 94, 95, 94, 93, 92, 91],
      wind_speed_10m_mean: [5, 5, 6, 6, 6, 5, 5]
    }
  });

  assert.ok(
    estimate <= 55.2,
    `case-insensitive trusted report should still cool estimate and bypass stale memo clamp, got ${estimate}°F`
  );
});


test('solarEffect is never negative under heavy overcast winter payload', async () => {
  setupStorage();
  const coords = { lat: 34.2576, lon: -88.7034 };
  const currentDate = new Date('2026-02-16T17:00:00Z');

  const weatherPayload = {
    historical: {
      daily: {
        temperature_2m_mean: [48, 49, 50, 50, 51, 52, 53],
        cloud_cover_mean: [95, 96, 97, 98, 96, 95, 94],
        wind_speed_10m_mean: [12, 11, 10, 12, 11, 10, 9]
      }
    },
    forecast: {
      current: {
        temperature_2m: 50,
        wind_speed_10m: 12,
        relative_humidity_2m: 85,
        weather_code: 3,
        precipitation: 0
      },
      hourly: {
        time: ['2026-02-16T15:00', '2026-02-16T16:00', '2026-02-16T17:00', '2026-02-16T18:00'],
        cloud_cover: [98, 99, 99, 98],
        weather_code: [3, 3, 3, 3],
        precipitation_probability: [40, 50, 55, 45],
        wind_speed_10m: [12, 12, 11, 10],
        surface_pressure: [1010, 1009, 1008, 1008]
      }
    },
    meta: { nowHourIndex: 2, units: { temp: 'F', wind: 'mph', precip: 'in' } }
  };

  const explained = await explainWaterTempTerms({
    coords,
    waterType: 'pond',
    date: currentDate,
    weatherPayload
  });

  assert.ok(explained.solarEffect >= 0, `solarEffect should be non-negative, got ${explained.solarEffect}`);
});

test('cloudy windy day damps intraday spread without extreme cold stacking', async () => {
  const storageMemo = setupStorage();
  const coords = { lat: 34.2576, lon: -88.7034 };
  const currentDate = new Date('2026-02-17T18:00:00Z');

  const mildAirWeather = {
    daily: {
      temperature_2m_mean: [51, 51, 52, 52, 53, 52, 51],
      cloud_cover_mean: [96, 95, 94, 95, 96, 95, 94],
      wind_speed_10m_mean: [15, 14, 16, 15, 14, 15, 16],
      wind_speed_10m_max: [21, 20, 22, 21, 20, 22, 23]
    },
    forecast: {
      current: {
        temperature_2m: 52,
        wind_speed_10m: 16,
        relative_humidity_2m: 82,
        weather_code: 3,
        precipitation: 0
      },
      hourly: {
        wind_speed_10m: Array(72).fill(15),
        surface_pressure: Array(72).fill(1010),
        cloud_cover: Array(72).fill(95),
        weather_code: Array(72).fill(3),
        precipitation_probability: Array(72).fill(35)
      }
    },
    meta: { nowHourIndex: 24, units: { temp: 'F', wind: 'mph', precip: 'in' } }
  };

  const clearWeather = {
    ...mildAirWeather,
    daily: {
      ...mildAirWeather.daily,
      cloud_cover_mean: [18, 16, 15, 20, 18, 16, 15],
      wind_speed_10m_mean: [4, 4, 5, 5, 4, 4, 5],
      wind_speed_10m_max: [8, 8, 9, 9, 8, 8, 9]
    },
    forecast: {
      ...mildAirWeather.forecast,
      current: { ...mildAirWeather.forecast.current, wind_speed_10m: 5, relative_humidity_2m: 65 },
      hourly: {
        ...mildAirWeather.forecast.hourly,
        wind_speed_10m: Array(72).fill(5),
        cloud_cover: Array(72).fill(18),
        precipitation_probability: Array(72).fill(5)
      }
    }
  };

  const overcast = await estimateWaterTemp(coords, 'pond', currentDate, mildAirWeather);
  storageMemo.clear();
  const clear = await estimateWaterTemp(coords, 'pond', currentDate, clearWeather);

  assert.ok(overcast < clear, `overcast/windy case should still be cooler than clear/calm (${overcast} vs ${clear})`);

  const seasonalFloorBound = 2.2;
  assert.ok(overcast >= 51 - seasonalFloorBound, `mild-air overcast should not crash far below seasonal base; got ${overcast}`);
});


test('recent observed temp applies bounded decay calibration only for matching coords and water type', async () => {
  const storageMemo = setupStorage();
  const coords = { lat: 34.2576, lon: -88.7034 };
  const currentDate = new Date('2026-02-17T18:00:00Z');

  const weather = {
    daily: {
      temperature_2m_mean: [50, 50, 51, 51, 52, 52, 53],
      cloud_cover_mean: [70, 72, 68, 70, 69, 71, 70],
      wind_speed_10m_mean: [8, 8, 9, 9, 8, 8, 9],
      wind_speed_10m_max: [13, 12, 13, 14, 13, 12, 13]
    },
    forecast: { hourly: { wind_speed_10m: Array(72).fill(8), surface_pressure: Array(72).fill(1011), cloud_cover: Array(72).fill(70), weather_code: Array(72).fill(2), precipitation_probability: Array(72).fill(10) }, current: { temperature_2m: 52, wind_speed_10m: 8, relative_humidity_2m: 70, weather_code: 2, precipitation: 0 } },
    meta: { nowHourIndex: 24, units: { temp: 'F', wind: 'mph', precip: 'in' } }
  };

  const base = await estimateWaterTemp(coords, 'pond', currentDate, weather);
  storageMemo.clear();
  storage.clearAll();

  storage.setWaterTempObserved(coords.lat, coords.lon, 'pond', 56.8, '2026-02-17T12:00:00-06:00');

  const calibrated = await estimateWaterTemp(coords, 'pond', currentDate, weather);
  assert.ok(calibrated > base, `expected positive observed calibration, got base=${base} calibrated=${calibrated}`);
  assert.ok(calibrated - base <= 6.01, `observed calibration offset must be bounded to ±6°F, got ${calibrated - base}`);

  storageMemo.clear();
  storage.clearAll();
  storage.setWaterTempObserved(coords.lat, coords.lon, 'lake', 60, '2026-02-17T12:00:00-06:00');
  const wrongType = await estimateWaterTemp(coords, 'pond', currentDate, weather);
  assert.equal(wrongType, base, 'mismatched water type should not apply observed calibration');
});


test('LIVE-only pond guardrail softens extreme cloudy cold-season under-shoot by at most +1°F', async () => {
  setupStorage();
  const coords = { lat: 34.2576, lon: -88.7034 };
  const currentDate = new Date('2026-02-17T18:00:00Z');

  const weather = {
    historical: {
      daily: {
        temperature_2m_mean: [47, 48, 49, 49, 50, 50, 51],
        cloud_cover_mean: [96, 97, 98, 96, 97, 98, 96],
        wind_speed_10m_mean: [11, 12, 12, 11, 12, 11, 12]
      }
    },
    forecast: {
      current: {
        temperature_2m: 54,
        wind_speed_10m: 11,
        relative_humidity_2m: 86,
        weather_code: 3,
        precipitation: 0
      },
      hourly: {
        time: Array.from({ length: 48 }, (_, i) => `2026-02-${String(17 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
        cloud_cover: Array(48).fill(96),
        weather_code: Array(48).fill(3),
        precipitation_probability: Array(48).fill(45),
        wind_speed_10m: Array(48).fill(11),
        surface_pressure: Array(48).fill(1010),
        temperature_2m: Array(48).fill(54)
      }
    },
    meta: {
      timezone: 'America/Chicago',
      nowHourIndex: 24,
      units: { temp: 'F', wind: 'mph', precip: 'in' }
    }
  };

  const fixtureEstimate = await estimateWaterTemp(coords, 'pond', currentDate, {
    ...weather,
    meta: { ...weather.meta, source: 'FIXTURE' }
  });
  const liveEstimate = await estimateWaterTemp(coords, 'pond', currentDate, {
    ...weather,
    meta: { ...weather.meta, source: 'LIVE' }
  });

  assert.ok(liveEstimate >= fixtureEstimate, `LIVE guardrail should not cool below fixture (${liveEstimate} vs ${fixtureEstimate})`);
  assert.ok(liveEstimate - fixtureEstimate <= 1.01, `LIVE guardrail must be capped to +1°F, got ${liveEstimate - fixtureEstimate}`);
});
