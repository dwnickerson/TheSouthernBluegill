import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

// Model funcs
import {
  estimateWaterTemp,
  explainWaterTempTerms,
  explainWaterTempProjectionDay,
  projectWaterTemps
} from '../models/waterTemp.js';

// OPTIONAL: if you have a getWeather util already, wire it here.
// Try one of these imports in your repo; if it fails, comment it out.
// import { getWeather } from '../services/weatherAPI.js';
// import { getWeather } from '../services/weather.js';
// import { getWeather } from '../api/weather.js';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

// Use YOUR real measurement coords
const coords = { lat: 34.257607, lon: -88.703386 };
const waterType = 'pond';

// If LIVE=1 is set, we try to fetch live payload; otherwise fixture is used.
const USE_LIVE = process.env.LIVE === '1';

// If you use fixture mode, this is the fixture path:
const FIXTURE_URL = new URL('./fixtures/weatherPayload.sample.json', import.meta.url);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function safeGet(obj, path, fallback = undefined) {
  try {
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj) ?? fallback;
  } catch {
    return fallback;
  }
}

function payloadFingerprint(payload) {
  const nowHourIndex = safeGet(payload, 'meta.nowHourIndex', null);
  const hourlyTime = safeGet(payload, `forecast.hourly.time.${nowHourIndex}`, null);
  const hourlyTemp = safeGet(payload, `forecast.hourly.temperature_2m.${nowHourIndex}`, null);

  return {
    units: safeGet(payload, 'meta.units', {}),
    nowHourIndex,
    hourlyNowTime: hourlyTime,
    hourlyNowTemp: hourlyTemp,
    current: {
      temperature_2m: safeGet(payload, 'forecast.current.temperature_2m', null),
      wind_speed_10m: safeGet(payload, 'forecast.current.wind_speed_10m', null),
      relative_humidity_2m: safeGet(payload, 'forecast.current.relative_humidity_2m', null),
      precipitation: safeGet(payload, 'forecast.current.precipitation', null),
      weather_code: safeGet(payload, 'forecast.current.weather_code', null)
    },
    historicalLast: {
      temperature_2m_mean: safeGet(payload, 'historical.daily.temperature_2m_mean', []).slice(-1)[0] ?? null,
      wind_speed_10m_mean: safeGet(payload, 'historical.daily.wind_speed_10m_mean', []).slice(-1)[0] ?? null,
      cloud_cover_mean: safeGet(payload, 'historical.daily.cloud_cover_mean', []).slice(-1)[0] ?? null
    },
    forecastDaily0: {
      time: safeGet(payload, 'forecast.daily.time.0', null),
      tmean: safeGet(payload, 'forecast.daily.temperature_2m_mean.0', null),
      tmin: safeGet(payload, 'forecast.daily.temperature_2m_min.0', null),
      tmax: safeGet(payload, 'forecast.daily.temperature_2m_max.0', null),
      cloud_cover_mean: safeGet(payload, 'forecast.daily.cloud_cover_mean.0', null),
      wind_speed_10m_mean: safeGet(payload, 'forecast.daily.wind_speed_10m_mean.0', null),
      wind_speed_10m_max: safeGet(payload, 'forecast.daily.wind_speed_10m_max.0', null)
    }
  };
}

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
  console.log('forecast.current.precipitation:', safeGet(payload, 'forecast.current.precipitation', null));
  console.log('forecast.current.weather_code:', safeGet(payload, 'forecast.current.weather_code', null));

  console.log('historical.daily.temperature_2m_mean[last]:', safeGet(payload, 'historical.daily.temperature_2m_mean', []).slice(-1)[0] ?? null);
  console.log('historical.daily.wind_speed_10m_mean[last]:', safeGet(payload, 'historical.daily.wind_speed_10m_mean', []).slice(-1)[0] ?? null);
  console.log('historical.daily.cloud_cover_mean[last]:', safeGet(payload, 'historical.daily.cloud_cover_mean', []).slice(-1)[0] ?? null);
}

async function loadPayload() {
  if (!USE_LIVE) {
    const payload = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
    return payload;
  }

  // LIVE MODE: You must wire getWeather() import above to match your repo.
  // Expected: getWeather(coords, days) => payload with { forecast, historical, meta }
  //
  // Example:
  // const payload = await getWeather(coords, 7, { waterType });
  // return payload;

  throw new Error(
    'LIVE=1 set, but getWeather() is not wired. Uncomment/fix an import for getWeather() and implement the call in loadPayload().'
  );
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

const payload = await loadPayload();

// Anchor date:
// Use daily.time[0] as the “day” anchor, but set time to midday Z so indices resolve consistently.
const nowIdx = payload.meta?.nowHourIndex ?? 0;
const nowIsoLocal = payload.forecast.hourly.time[nowIdx]; // e.g. "2026-02-11T06:00" (no Z)
const today = new Date(`${nowIsoLocal}:00Z`);


// Fingerprint (so you can compare browser vs node)
const fp = payloadFingerprint(payload);
console.log('\n=== PAYLOAD FINGERPRINT ===');
console.log(JSON.stringify({ coords, waterType, anchorDateISO: today.toISOString(), source: USE_LIVE ? 'LIVE' : 'FIXTURE', fp }, null, 2));

// Optional: write fingerprint to disk so you can paste/compare easily
try {
  writeFileSync(new URL('./debug_water_payload_fingerprint.json', import.meta.url), JSON.stringify({ coords, waterType, anchorDateISO: today.toISOString(), source: USE_LIVE ? 'LIVE' : 'FIXTURE', fp }, null, 2));
  console.log('\nWrote debug_water_payload_fingerprint.json next to this script.');
} catch {
  // ignore
}

dumpKeyFields(payload);

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
