import fs from 'node:fs';
import { getWeather } from '../services/weatherAPI.js';
import { estimateTempByDepth, estimateWaterTemp, estimateWaterTempByPeriod } from '../models/waterTemp.js';
import { buildModelPayload } from './waterTempDebugShared.mjs';

const coords = { lat: 34.25807, lon: -88.70464 };
const waterType = 'pond';

async function loadLiveOrFixture() {
  try {
    const live = await getWeather(coords.lat, coords.lon, 7);
    return buildModelPayload(live, { source: 'LIVE' });
  } catch {
    const fixturePath = new URL('./fixtures/weatherPayload.sample.json', import.meta.url);
    return buildModelPayload(JSON.parse(fs.readFileSync(fixturePath, 'utf8')), { source: 'FIXTURE' });
  }
}

function computeDaily(model) {
  const payload = model.normalized;
  const timezone = payload.meta.timezone;
  const sunriseTime = payload?.forecast?.daily?.sunrise?.[0] || null;
  const sunsetTime = payload?.forecast?.daily?.sunset?.[0] || null;
  return estimateWaterTemp(coords, waterType, model.anchorDate, payload).then((todayFinal) => {
    const sunrise = estimateWaterTempByPeriod({ dailySurfaceTemp: todayFinal, waterType, hourly: payload.forecast.hourly, timezone, date: model.anchorDate, period: 'morning', sunriseTime, sunsetTime });
    const midday = estimateWaterTempByPeriod({ dailySurfaceTemp: todayFinal, waterType, hourly: payload.forecast.hourly, timezone, date: model.anchorDate, period: 'midday', sunriseTime, sunsetTime });
    const sunset = estimateWaterTempByPeriod({ dailySurfaceTemp: todayFinal, waterType, hourly: payload.forecast.hourly, timezone, date: model.anchorDate, period: 'afternoon', sunriseTime, sunsetTime });
    const at2 = estimateTempByDepth(sunrise, waterType, 2, model.anchorDate);
    const depth17 = sunrise + ((at2 - sunrise) * (1.7 / 2));
    return { todayFinal, sunrise, midday, sunset, depth17 };
  });
}

const fixture = buildModelPayload(JSON.parse(fs.readFileSync(new URL('./fixtures/weatherPayload.sample.json', import.meta.url), 'utf8')), { source: 'FIXTURE' });
const live = await loadLiveOrFixture();
const fixtureOut = await computeDaily(fixture);
const liveOut = await computeDaily(live);

const delta = Object.fromEntries(Object.keys(fixtureOut).map((k) => [k, Number((liveOut[k] - fixtureOut[k]).toFixed(2))]));
console.log(JSON.stringify({ coords, waterType, fixture: fixtureOut, live: liveOut, delta }, null, 2));
