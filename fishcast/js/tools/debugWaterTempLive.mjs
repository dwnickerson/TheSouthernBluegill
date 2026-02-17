import { getWeather } from '../services/weatherAPI.js';
import {
  estimateTempByDepth,
  estimateWaterTemp,
  estimateWaterTempByPeriod,
  explainWaterTempTerms
} from '../models/waterTemp.js';
import fs from 'node:fs';
import { buildModelPayload, payloadFingerprint } from './waterTempDebugShared.mjs';

const coords = { lat: 34.25807, lon: -88.70464 };
const waterType = 'pond';

function estimateShallowDepthTemp(periodSurfaceTemp, depthFt, date) {
  const at2ft = estimateTempByDepth(periodSurfaceTemp, waterType, 2, date);
  if (depthFt <= 0) return periodSurfaceTemp;
  if (depthFt >= 2) return estimateTempByDepth(periodSurfaceTemp, waterType, depthFt, date);
  const ratio = depthFt / 2;
  return periodSurfaceTemp + ((at2ft - periodSurfaceTemp) * ratio);
}

let weather;
let source = 'LIVE';
try {
  weather = await getWeather(coords.lat, coords.lon, 7);
} catch (error) {
  source = 'FIXTURE_FALLBACK';
  const fixturePath = new URL('./fixtures/weatherPayload.sample.json', import.meta.url);
  weather = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  console.warn('Live weather fetch failed; using fixture fallback:', error?.message || error);
}

const modelPayload = buildModelPayload(weather, { source });
const payload = modelPayload.normalized;
const sharedDate = modelPayload.anchorDate;
const todayEstimate = await estimateWaterTemp(coords, waterType, sharedDate, modelPayload.estimateArgs.historicalWeather);
const todayExplain = await explainWaterTempTerms({ coords, waterType, date: sharedDate, weatherPayload: modelPayload.explainArgs.weatherPayload });
const timezone = payload?.meta?.timezone || 'America/Chicago';
const sunriseTime = payload?.forecast?.daily?.sunrise?.[0] || null;
const sunsetTime = payload?.forecast?.daily?.sunset?.[0] || null;

const sunrise = estimateWaterTempByPeriod({ dailySurfaceTemp: todayEstimate, waterType, hourly: payload.forecast.hourly, timezone, date: sharedDate, period: 'morning', sunriseTime, sunsetTime });
const midday = estimateWaterTempByPeriod({ dailySurfaceTemp: todayEstimate, waterType, hourly: payload.forecast.hourly, timezone, date: sharedDate, period: 'midday', sunriseTime, sunsetTime });
const sunset = estimateWaterTempByPeriod({ dailySurfaceTemp: todayEstimate, waterType, hourly: payload.forecast.hourly, timezone, date: sharedDate, period: 'afternoon', sunriseTime, sunsetTime });

const depth17 = estimateShallowDepthTemp(sunrise, 1.7, sharedDate);

console.log('=== Live Water Temp Debug ===');
console.log(JSON.stringify({
  coords,
  waterType,
  source: payload.meta.source,
  anchorDateISO: sharedDate.toISOString(),
  localDayKey: modelPayload.localDayKey,
  fp: payloadFingerprint(payload)
}, null, 2));
console.log('terms:', {
  seasonalBase: todayExplain.seasonalBase,
  solarEffect: todayExplain.solarEffect,
  airEffect: todayExplain.airEffect,
  windEffect: todayExplain.windEffect,
  coldSeasonPondCorrection: todayExplain.coldSeasonPondCorrection,
  final: todayExplain.final
});
console.log('period temps:', { sunrise, midday, sunset });
console.log('depth temp at ~1.7ft (sunrise):', Math.round(depth17 * 10) / 10);
