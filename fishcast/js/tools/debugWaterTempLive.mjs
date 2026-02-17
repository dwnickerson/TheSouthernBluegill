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

function findSunTimes(weather, date) {
  const timezone = weather?.forecast?.timezone || 'America/Chicago';
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  const daily = weather?.forecast?.daily || {};
  const dayIndex = (daily.time || []).findIndex((day) => day === dateKey);
  const i = dayIndex >= 0 ? dayIndex : 0;
  return {
    timezone,
    sunriseTime: daily?.sunrise?.[i] || null,
    sunsetTime: daily?.sunset?.[i] || null
  };
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
const modelPayload = buildModelPayload(weather);
const sharedDate = modelPayload.anchorDate;
modelPayload.estimateArgs.currentDate = sharedDate;
modelPayload.explainArgs.date = sharedDate;
const anchorDate = sharedDate;
const todayEstimate = await estimateWaterTemp(coords, waterType, sharedDate, modelPayload.estimateArgs.historicalWeather);
const todayExplain = await explainWaterTempTerms({
  coords,
  waterType,
  date: sharedDate,
  weatherPayload: modelPayload.explainArgs.weatherPayload
});
const deltaEstimateVsExplain = Math.abs(todayEstimate - todayExplain.final);

const { timezone, sunriseTime, sunsetTime } = findSunTimes(weather, anchorDate);
const sunrise = estimateWaterTempByPeriod({
  dailySurfaceTemp: todayEstimate,
  waterType,
  hourly: weather.forecast.hourly,
  timezone,
  date: anchorDate,
  period: 'morning',
  sunriseTime,
  sunsetTime
});
const midday = estimateWaterTempByPeriod({
  dailySurfaceTemp: todayEstimate,
  waterType,
  hourly: weather.forecast.hourly,
  timezone,
  date: anchorDate,
  period: 'midday',
  sunriseTime,
  sunsetTime
});
const sunset = estimateWaterTempByPeriod({
  dailySurfaceTemp: todayEstimate,
  waterType,
  hourly: weather.forecast.hourly,
  timezone,
  date: anchorDate,
  period: 'afternoon',
  sunriseTime,
  sunsetTime
});

const depth17 = estimateShallowDepthTemp(sunrise, 1.7, anchorDate);

console.log('=== Live Water Temp Debug ===');
console.log(JSON.stringify({
  coords,
  waterType,
  anchorDateISO: anchorDate.toISOString(),
  source,
  fp: payloadFingerprint(weather)
}, null, 2));
console.log('coords:', coords, 'waterType:', waterType, 'timezone:', timezone);
console.log('sharedDateISO:', sharedDate.toISOString());
console.log('estimateWaterTemp() final:', todayEstimate);
console.log('period temps:', { sunrise, midday, sunset });
console.log('depth temp at ~1.7ft (sunrise):', Math.round(depth17 * 10) / 10);
console.log('\n=== explainWaterTempTerms(today) ===');
console.log(JSON.stringify(todayExplain, null, 2));
console.log('explainWaterTempTerms(today).final:', todayExplain.final);
console.log('delta (|estimate - explain.final|):', deltaEstimateVsExplain);
console.log('\nUSED FIELDS (prefixes):');
console.log((todayExplain?.usedFields?.prefixes || []).join('\n'));
