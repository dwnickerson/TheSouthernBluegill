import { readFileSync, writeFileSync } from 'node:fs';
import {
  estimateWaterTemp,
  explainWaterTempTerms,
  explainWaterTempProjectionDay,
  estimateWaterTempByPeriod,
  projectWaterTemps
} from '../models/waterTemp.js';
import { buildModelPayload, payloadFingerprint } from './waterTempDebugShared.mjs';

const coords = { lat: 34.257607, lon: -88.703386 };
const waterType = 'pond';
const FIXTURE_URL = new URL('./fixtures/weatherPayload.sample.json', import.meta.url);

const rawPayload = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
const modelPayload = buildModelPayload(rawPayload, { source: 'FIXTURE' });
const payload = modelPayload.normalized;
const fp = payloadFingerprint(payload);

const todayExplain = await explainWaterTempTerms({ coords, waterType, ...modelPayload.explainArgs });
const estimatedToday = await estimateWaterTemp(coords, waterType, modelPayload.estimateArgs.currentDate, modelPayload.estimateArgs.historicalWeather);
const projected = projectWaterTemps(estimatedToday, { ...payload.forecast, meta: payload.meta }, waterType, coords.lat, modelPayload.projectionOptions);

const timezone = payload.meta.timezone || 'UTC';
const sunrise = estimateWaterTempByPeriod({ dailySurfaceTemp: estimatedToday, waterType, hourly: payload.forecast.hourly, timezone, date: modelPayload.anchorDate, period: 'morning', sunriseTime: payload.forecast.daily?.sunrise?.[0], sunsetTime: payload.forecast.daily?.sunset?.[0] });
const midday = estimateWaterTempByPeriod({ dailySurfaceTemp: estimatedToday, waterType, hourly: payload.forecast.hourly, timezone, date: modelPayload.anchorDate, period: 'midday', sunriseTime: payload.forecast.daily?.sunrise?.[0], sunsetTime: payload.forecast.daily?.sunset?.[0] });
const sunset = estimateWaterTempByPeriod({ dailySurfaceTemp: estimatedToday, waterType, hourly: payload.forecast.hourly, timezone, date: modelPayload.anchorDate, period: 'afternoon', sunriseTime: payload.forecast.daily?.sunrise?.[0], sunsetTime: payload.forecast.daily?.sunset?.[0] });

console.log('\n=== PAYLOAD FINGERPRINT ===');
console.log(JSON.stringify({
  coords,
  waterType,
  source: payload.meta.source,
  anchorDateISO: modelPayload.anchorDate.toISOString(),
  timezone: payload.meta.timezone || 'UTC',
  metaNowHourIndex: payload.meta.nowHourIndex ?? null,
  forecastNowHourTime: Number.isInteger(payload.meta.nowHourIndex) ? payload?.forecast?.hourly?.time?.[payload.meta.nowHourIndex] ?? null : null,
  forecastCurrentTemp: payload?.forecast?.current?.temperature_2m ?? null,
  localDayKey: modelPayload.localDayKey,
  fp
}, null, 2));

writeFileSync(new URL('./debug_water_payload_fingerprint.json', import.meta.url), JSON.stringify({
  coords,
  waterType,
  source: payload.meta.source,
  anchorDateISO: modelPayload.anchorDate.toISOString(),
  timezone: payload.meta.timezone || 'UTC',
  metaNowHourIndex: payload.meta.nowHourIndex ?? null,
  forecastNowHourTime: Number.isInteger(payload.meta.nowHourIndex) ? payload?.forecast?.hourly?.time?.[payload.meta.nowHourIndex] ?? null : null,
  forecastCurrentTemp: payload?.forecast?.current?.temperature_2m ?? null,
  localDayKey: modelPayload.localDayKey,
  fp
}, null, 2));

console.log('\n=== explainWaterTempTerms(today) ===');
console.log(JSON.stringify(todayExplain, null, 2));
console.log('terms:', {
  seasonalBase: todayExplain.seasonalBase,
  solarEffect: todayExplain.solarEffect,
  airEffect: todayExplain.airEffect,
  windEffect: todayExplain.windEffect,
  coldSeasonPondCorrection: todayExplain.coldSeasonPondCorrection,
  final: todayExplain.final
});
console.log('final estimateWaterTemp:', estimatedToday);
console.log('periods:', { sunrise, midday, sunset });

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
