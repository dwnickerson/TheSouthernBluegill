import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeWaterTempContext } from '../js/models/waterPayloadNormalize.js';
import { estimateWaterTemp, explainWaterTempTerms, buildWaterTempView } from '../js/models/waterTemp.js';

const coords = { lat: 34.25807, lon: -88.70464 };
const waterType = 'pond';

function setupStorage() {
  const storageMemo = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storageMemo.has(k) ? storageMemo.get(k) : null),
    setItem: (k, v) => { storageMemo.set(k, String(v)); },
    removeItem: (k) => { storageMemo.delete(k); }
  };
}

async function runDeterministicAssertions(payloadPath) {
  setupStorage();
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

  const contextA = normalizeWaterTempContext({
    coords,
    waterType,
    timezone: payload?.forecast?.timezone || payload?.meta?.timezone || 'UTC',
    weatherPayload: payload,
    nowOverride: payload?.meta?.nowIso || '2026-02-17T17:00:00Z'
  });
  const contextB = normalizeWaterTempContext({
    coords,
    waterType,
    timezone: payload?.forecast?.timezone || payload?.meta?.timezone || 'UTC',
    weatherPayload: payload,
    nowOverride: payload?.meta?.nowIso || '2026-02-17T17:00:00Z'
  });

  assert.deepEqual(contextA, contextB, 'normalized context should be deterministic across repeated runs');

  const estimate = await estimateWaterTemp(
    coords,
    waterType,
    new Date(contextA.anchorDateISOZ),
    contextA.payload,
    { context: contextA }
  );

  const explain = await explainWaterTempTerms({
    coords,
    waterType,
    date: new Date(contextA.anchorDateISOZ),
    weatherPayload: contextA.payload,
    context: contextA
  });

  assert.ok(Math.abs(estimate - explain.final) <= 0.1, `estimate (${estimate}) must align with explain.final (${explain.final})`);

  const waterTempView = buildWaterTempView({
    dailySurfaceTemp: estimate,
    waterType,
    context: contextA
  });

  const summaryCardValue = Number(waterTempView.surfaceNow.toFixed(1));
  assert.equal(summaryCardValue, waterTempView.surfaceNow, 'summary card mapping must use model surfaceNow exactly');

  const waterTempViewAgain = buildWaterTempView({
    dailySurfaceTemp: estimate,
    waterType,
    context: contextB
  });
  assert.deepEqual(waterTempView, waterTempViewAgain, 'waterTempView should be deterministic for identical payload/context');
}

test('deterministic water-temp context and model outputs with sample fixture', async () => {
  const fixturePath = new URL('../js/tools/fixtures/weatherPayload.sample.json', import.meta.url);
  await runDeterministicAssertions(fixturePath);
});

test('deterministic debug-live style path with saved live fixture', async () => {
  const livePath = new URL('../js/tools/fixtures/weatherPayload.live.json', import.meta.url);
  await runDeterministicAssertions(livePath);
});
