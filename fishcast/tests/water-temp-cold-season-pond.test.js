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
