import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { estimateWaterTemp, explainWaterTempTerms } from '../js/models/waterTemp.js';
import { buildModelPayload } from '../js/tools/waterTempDebugShared.mjs';

function setupStorage() {
  const storageMemo = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storageMemo.has(k) ? storageMemo.get(k) : null),
    setItem: (k, v) => { storageMemo.set(k, String(v)); },
    removeItem: (k) => { storageMemo.delete(k); }
  };
}

async function assertEstimateAndExplainMatch({ label, coords, waterType, payload }) {
  setupStorage();
  const modelPayload = buildModelPayload(payload);
  const sharedDate = modelPayload.anchorDate;

  const estimate = await estimateWaterTemp(
    coords,
    waterType,
    sharedDate,
    modelPayload.estimateArgs.historicalWeather
  );

  const explain = await explainWaterTempTerms({
    coords,
    waterType,
    date: sharedDate,
    weatherPayload: modelPayload.explainArgs.weatherPayload
  });

  const delta = Math.abs(estimate - explain.final);
  assert.ok(
    delta <= 0.01,
    `${label}: estimate (${estimate}) and explain.final (${explain.final}) diverged by ${delta}`
  );
}

test('estimateWaterTemp and explainWaterTempTerms.final stay aligned for fixture payload', async () => {
  const fixturePath = new URL('../js/tools/fixtures/weatherPayload.sample.json', import.meta.url);
  const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  await assertEstimateAndExplainMatch({
    label: 'fixture',
    coords: { lat: 34.25807, lon: -88.70464 },
    waterType: 'pond',
    payload
  });
});

test('estimateWaterTemp and explainWaterTempTerms.final stay aligned for captured live payload when available', async (t) => {
  const candidates = [
    new URL('../js/tools/fixtures/weatherPayload.live.json', import.meta.url),
    new URL('../js/tools/fixtures/weatherPayload.captured.json', import.meta.url)
  ];
  const existing = candidates.find((url) => fs.existsSync(url));
  if (!existing) {
    t.diagnostic('No captured live payload fixture found; skipping live consistency check.');
    return;
  }

  const payload = JSON.parse(fs.readFileSync(existing, 'utf8'));
  await assertEstimateAndExplainMatch({
    label: 'captured-live',
    coords: { lat: 34.25807, lon: -88.70464 },
    waterType: 'pond',
    payload
  });
});
