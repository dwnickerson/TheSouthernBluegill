import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateWaterTemp } from '../js/models/waterTemp.js';

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
