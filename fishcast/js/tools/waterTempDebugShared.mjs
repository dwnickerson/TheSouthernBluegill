export function safeGet(obj, path, fallback = undefined) {
  try {
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj) ?? fallback;
  } catch {
    return fallback;
  }
}

export function buildAnchorDate(payload) {
  const nowIdx = payload?.meta?.nowHourIndex ?? 0;
  const nowIsoLocal = safeGet(payload, `forecast.hourly.time.${nowIdx}`, null);
  if (!nowIsoLocal) return new Date();
  return new Date(`${nowIsoLocal}:00Z`);
}

export function payloadFingerprint(payload) {
  const nowHourIndex = safeGet(payload, 'meta.nowHourIndex', null);
  return {
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

export function buildModelPayload(payload) {
  const anchorDate = buildAnchorDate(payload);
  const units = payload?.meta?.units || {};
  return {
    anchorDate,
    estimateArgs: {
      currentDate: anchorDate,
      historicalWeather: payload
    },
    explainArgs: {
      date: anchorDate,
      weatherPayload: payload
    },
    projectionOptions: {
      tempUnit: units.temp || 'F',
      windUnit: units.wind || 'mph',
      precipUnit: units.precip || 'inch',
      historicalDaily: payload?.historical?.daily,
      anchorDate
    }
  };
}
