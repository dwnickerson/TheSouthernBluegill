import { getLocalDayKey, normalizeWeatherPayload, parseHourlyTimestamp } from '../utils/weatherPayload.js';

export function safeGet(obj, path, fallback = undefined) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj) ?? fallback;
}

export function buildAnchorDate(payload) {
  const nowIdx = payload?.meta?.nowHourIndex ?? 0;
  const nowIsoLocal = safeGet(payload, `forecast.hourly.time.${nowIdx}`, null);
  const timezone = payload?.meta?.timezone || payload?.forecast?.timezone || 'UTC';
  if (!nowIsoLocal) {
    return new Date(payload?.meta?.nowIso || Date.now());
  }
  const ts = parseHourlyTimestamp(nowIsoLocal, timezone);
  return Number.isFinite(ts) ? new Date(ts) : new Date(payload?.meta?.nowIso || Date.now());
}

export function payloadFingerprint(payload) {
  const nowHourIndex = safeGet(payload, 'meta.nowHourIndex', null);
  return {
    source: safeGet(payload, 'meta.source', 'UNKNOWN'),
    timezone: safeGet(payload, 'meta.timezone', safeGet(payload, 'forecast.timezone', null)),
    units: safeGet(payload, 'meta.units', {}),
    nowHourIndex,
    hourlyNowTime: safeGet(payload, `forecast.hourly.time.${nowHourIndex}`, null),
    hourlyNowTemp: safeGet(payload, `forecast.hourly.temperature_2m.${nowHourIndex}`, null),
    current: {
      temperature_2m: safeGet(payload, 'forecast.current.temperature_2m', null),
      wind_speed_10m: safeGet(payload, 'forecast.current.wind_speed_10m', null),
      relative_humidity_2m: safeGet(payload, 'forecast.current.relative_humidity_2m', null)
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
      wind_speed_10m_mean: safeGet(payload, 'forecast.daily.wind_speed_10m_mean.0', null)
    }
  };
}

export function buildModelPayload(payload, options = {}) {
  const normalized = normalizeWeatherPayload(payload, {
    now: options.now || new Date(payload?.meta?.nowIso || Date.now()),
    source: options.source || payload?.meta?.source || 'FIXTURE'
  });
  const anchorDate = buildAnchorDate(normalized);
  const units = normalized?.meta?.units || {};
  return {
    normalized,
    anchorDate,
    localDayKey: getLocalDayKey(anchorDate, normalized?.meta?.timezone || 'UTC'),
    estimateArgs: {
      currentDate: anchorDate,
      historicalWeather: normalized
    },
    explainArgs: {
      date: anchorDate,
      weatherPayload: normalized
    },
    projectionOptions: {
      tempUnit: units.temp || 'F',
      windUnit: units.wind || 'mph',
      precipUnit: units.precip || 'inch',
      historicalDaily: normalized?.historical?.daily,
      anchorDate
    }
  };
}
