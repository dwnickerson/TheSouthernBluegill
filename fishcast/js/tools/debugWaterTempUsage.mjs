import { readFileSync } from 'node:fs';

const payload = JSON.parse(readFileSync(new URL('./fixtures/weatherPayload.sample.json', import.meta.url), 'utf8'));
import { estimateWaterTemp, explainWaterTempTerms, explainWaterTempProjectionDay, projectWaterTemps } from '../models/waterTemp.js';

const coords = { lat: 34.25, lon: -88.7 };
const waterType = 'pond';
const today = new Date(`${payload.forecast.daily.time[0]}T12:00:00Z`);

const explainToday = await explainWaterTempTerms({
  coords,
  waterType,
  date: today,
  weatherPayload: payload
});

const estimatedToday = await estimateWaterTemp(coords, waterType, today, payload);
const projected = projectWaterTemps(
  estimatedToday,
  { ...payload.forecast, meta: payload.meta },
  waterType,
  coords.lat,
  {
    tempUnit: payload.meta?.units?.temp || 'F',
    windUnit: payload.meta?.units?.wind || 'mph',
    precipUnit: payload.meta?.units?.precip || 'inch',
    historicalDaily: payload.historical.daily,
    anchorDate: today
  }
);

console.log('=== explainWaterTempTerms(today) ===');
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
    options: {
      tempUnit: payload.meta?.units?.temp || 'F',
      windUnit: payload.meta?.units?.wind || 'mph',
      precipUnit: payload.meta?.units?.precip || 'inch',
      historicalDaily: payload.historical.daily,
      anchorDate: today
    }
  });
  projectionExplainers.push({ dayIndex, breakdown, projected: projected[dayIndex] });
}

console.log('\n=== explainWaterTempProjectionDay(day 1..3) ===');
console.log(JSON.stringify(projectionExplainers, null, 2));

const usedPrefixSet = new Set([
  ...(explainToday.usedFields?.prefixes || []),
  ...projectionExplainers.flatMap((entry) => entry.breakdown?.usedFields?.prefixes || [])
]);
console.log('\nUSED FIELDS (prefixes):');
console.log([...usedPrefixSet].sort().join('\n'));
