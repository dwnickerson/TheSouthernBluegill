import test from 'node:test';
import assert from 'node:assert/strict';

import { computeLongwaveLoss } from '../js/app/model-physics.mjs';

const FEB_21_LIKE = {
  tMean: 53.5,
  tMax: 57,
  tMin: 49,
  windMean: 4,
  solar: 6,
  longwaveFactor: 1,
  depthFluxScale: 1
};

test('cloudier sky reduces longwave cooling instead of increasing it', () => {
  const clearSky = computeLongwaveLoss(0, FEB_21_LIKE.longwaveFactor, FEB_21_LIKE.depthFluxScale);
  const overcastSky = computeLongwaveLoss(100, FEB_21_LIKE.longwaveFactor, FEB_21_LIKE.depthFluxScale);

  assert.ok(clearSky.longwaveLoss > 0, 'clear-sky longwave cooling should remain positive');
  assert.ok(overcastSky.longwaveLoss > 0, 'overcast longwave cooling should remain positive');
  assert.ok(overcastSky.longwaveLoss < clearSky.longwaveLoss, 'clouds should reduce longwave cooling');
  assert.equal(overcastSky.cloudFrac, 1);
  assert.equal(clearSky.cloudFrac, 0);
});

test('increasing cloud cover does not increase net cloud-related cooling in Feb-21-like scenario', () => {
  const lowCloud = computeLongwaveLoss(0, FEB_21_LIKE.longwaveFactor, FEB_21_LIKE.depthFluxScale);
  const highCloud = computeLongwaveLoss(100, FEB_21_LIKE.longwaveFactor, FEB_21_LIKE.depthFluxScale);

  // cloudCool is intentionally retired (0) in the main model; this is the net cloud-sensitive cooling term.
  const lowCloudCooling = lowCloud.longwaveLoss;
  const highCloudCooling = highCloud.longwaveLoss;

  const coolingIncrease = highCloudCooling - lowCloudCooling;
  assert.ok(coolingIncrease <= 0.05, `cloud increase should not add material cooling; got ${coolingIncrease.toFixed(3)}°F/day-term`);
});
