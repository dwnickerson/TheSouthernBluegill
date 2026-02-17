import { readFileSync, writeFileSync } from 'node:fs';
import {
  estimateWaterTemp,
  explainWaterTempTerms,
  explainWaterTempProjectionDay,
  projectWaterTemps
} from '../models/waterTemp.js';
import { buildModelPayload, payloadFingerprint, safeGet } from './waterTempDebugShared.mjs';

const coords = { lat: 34.257607, lon: -88.703386 };
const waterType = 'pond';
const USE_LIVE = process.env.LIVE === '1';
const FIXTURE_URL = new URL('./fixtures/weatherPayload.sample.json', import.meta.url);

function dumpKeyFields(payload) {
  const nowHourIndex = safeGet(payload, 'meta.nowHourIndex', null);
  console.log('\n=== PAYLOAD KEY FIELDS ===');
  console.log('units:', safeGet(payload, 'meta.units', {}));
  console.log('meta.nowHourIndex:', nowHourIndex);
  console.log('forecast.hourly.time[nowHourIndex]:', safeGet(payload, `forecast.hourly.time.${nowHourIndex}`, null));
  console.log('forecast.hourly.temperature_2m[nowHourIndex]:', safeGet(payload, `forecast.hourly.temperature_2m.${nowHourIndex}`, null));
  console.log('forecast.current.temperature_2m:', safeGet(payload, 'forecast.current.temperature_2m', null));
  console.log('forecast.current.wind_speed_10m:', safeGet(payload, 'forecast.current.wind_speed_10m', null));
  console.log('forecast.current.relative_humidity_2m:', safeGet(payload, 'forecast.current.relative_humidity_2m', null));
  console.log('historical.daily.temperature_2m_mean[last]:', safeGet(payload, 'historical.daily.temperature_2m_mean', []).slice(-1)[0] ?? null);
  console.log('historical.daily.wind_speed_10m_mean[last]:', safeGet(payload, 'historical.daily.wind_speed_10m_mean', []).slice(-1)[0] ?? null);
  console.log('historical.daily.cloud_cover_mean[last]:', safeGet(payload, 'historical.daily.cloud_cover_mean', []).slice(-1)[0] ?? null);
}

async function loadPayload() {
  if (!USE_LIVE) return JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
  throw new Error('LIVE=1 set, but getWeather() is not wired.');
}

const payload = await loadPayload();
const modelPayload = buildModelPayload(payload);
const fp = payloadFingerprint(payload);

console.log('\n=== PAYLOAD FINGERPRINT ===');
console.log(JSON.stringify({
  coords,
  waterType,
  anchorDateISO: modelPayload.anchorDate.toISOString(),
  source: USE_LIVE ? 'LIVE' : 'FIXTURE',
  fp
}, null, 2));

writeFileSync(new URL('./debug_water_payload_fingerprint.json', import.meta.url), JSON.stringify({
  coords,
  waterType,
  anchorDateISO: modelPayload.anchorDate.toISOString(),
  source: USE_LIVE ? 'LIVE' : 'FIXTURE',
  fp
}, null, 2));

dumpKeyFields(payload);

const explainToday = await explainWaterTempTerms({ coords, waterType, ...modelPayload.explainArgs });
const estimatedToday = await estimateWaterTemp(coords, waterType, modelPayload.estimateArgs.currentDate, modelPayload.estimateArgs.historicalWeather);
const projected = projectWaterTemps(estimatedToday, { ...payload.forecast, meta: payload.meta }, waterType, coords.lat, modelPayload.projectionOptions);

console.log('\n=== explainWaterTempTerms(today) ===');
console.log(JSON.stringify(explainToday, null, 2));
console.log('final estimateWaterTemp:', estimatedToday);

const projectionExplainers = [];
for (let dayIndex = 1; dayIndex <= 3; dayIndex += 1) {
  const breakdown = explainWaterTempProjectionDay({
    initialWaterTemp: estimatedToday,
    forecastData: { ...payload.forecast, meta: payload.meta },
    waterType,
    latitude: coords.lat,
    dayIndex,
    options: modelPayload.projectionOptions
  });
  projectionExplainers.push({ dayIndex, breakdown, projected: projected[dayIndex] });
}

console.log('\n=== explainWaterTempProjectionDay(day 1..3) ===');
console.log(JSON.stringify(projectionExplainers, null, 2));
