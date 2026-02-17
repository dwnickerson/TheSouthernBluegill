import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { estimateWaterTemp, explainWaterTempTerms } from './waterTemp.js';
import { buildModelPayload } from '../tools/waterTempDebugShared.mjs';

function setupStorage() {
  const storageMemo = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storageMemo.has(k) ? storageMemo.get(k) : null),
    setItem: (k, v) => { storageMemo.set(k, String(v)); },
    removeItem: (k) => { storageMemo.delete(k); }
  };
}

test('estimateWaterTemp and explainWaterTempTerms stay in parity for captured fixture', async () => {
  setupStorage();
  const fixturePath = new URL('../tools/fixtures/weatherPayload.sample.json', import.meta.url);
  const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const modelPayload = buildModelPayload(payload, { source: 'FIXTURE' });

  const estimate = await estimateWaterTemp(
    { lat: 34.25807, lon: -88.70464 },
    'pond',
    modelPayload.anchorDate,
    modelPayload.estimateArgs.historicalWeather
  );

  const explain = await explainWaterTempTerms({
    coords: { lat: 34.25807, lon: -88.70464 },
    waterType: 'pond',
    date: modelPayload.explainArgs.date,
    weatherPayload: modelPayload.explainArgs.weatherPayload
  });

  assert.ok(Math.abs(estimate - explain.final) <= 0.1, `expected estimate (${estimate}) to match explain.final (${explain.final})`);
});
