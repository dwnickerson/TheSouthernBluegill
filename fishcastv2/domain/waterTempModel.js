import {
  estimateWaterTemp,
  estimateWaterTempByPeriod,
  explainWaterTempTerms,
  projectWaterTemps
} from '../../fishcast/js/models/waterTemp.js';
import { normalizeWaterTempContext } from '../../fishcast/js/models/waterPayloadNormalize.js';

export function buildWaterContext({ coords, waterType, timezone, weatherPayload, nowISO }) {
  return normalizeWaterTempContext({
    coords,
    waterType,
    timezone,
    weatherPayload,
    nowOverride: nowISO
  });
}

export async function computeSurfaceNow({ coords, waterType, nowDate, weatherPayload, context }) {
  return estimateWaterTemp(coords, waterType, nowDate, weatherPayload, { context });
}

export function computeDailySurface({ surfaceNow, forecastData, waterType, latitude, context, historicalDaily, units }) {
  return projectWaterTemps(surfaceNow, forecastData, waterType, latitude, {
    context,
    historicalDaily,
    tempUnit: units?.temp,
    windUnit: units?.wind,
    precipUnit: units?.precip
  });
}

export function computePeriodsForDay({ dailySurfaceTemp, waterType, context, sunriseTime, sunsetTime, dayKey }) {
  const sunrise = estimateWaterTempByPeriod({
    dailySurfaceTemp,
    waterType,
    context,
    period: 'morning',
    sunriseTime,
    sunsetTime,
    dayKey
  });

  const midday = estimateWaterTempByPeriod({
    dailySurfaceTemp,
    waterType,
    context,
    period: 'midday',
    sunriseTime,
    sunsetTime,
    dayKey
  });

  const sunset = estimateWaterTempByPeriod({
    dailySurfaceTemp,
    waterType,
    context,
    period: 'afternoon',
    sunriseTime,
    sunsetTime,
    dayKey
  });

  return { sunrise, midday, sunset };
}

export async function computeExplainTerms({ coords, waterType, date, weatherPayload, context }) {
  return explainWaterTempTerms({
    coords,
    waterType,
    date,
    weatherPayload,
    context
  });
}
