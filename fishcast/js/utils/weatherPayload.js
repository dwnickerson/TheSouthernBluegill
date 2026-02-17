function getFormatter(timeZone, options = {}) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options
  });
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup = (type) => Number(parts.find((p) => p.type === type)?.value);
  const y = lookup('year');
  const m = lookup('month');
  const d = lookup('day');
  const h = lookup('hour');
  const min = lookup('minute');
  const sec = lookup('second');
  const asUtc = Date.UTC(y, m - 1, d, h, min, sec);
  return asUtc - date.getTime();
}

function parseLocalIsoParts(localIso) {
  if (typeof localIso !== 'string') return null;
  const m = localIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5] || 0)
  };
}

export function parseHourlyTimestamp(timeValue, timeZone = 'UTC') {
  const parsedDirect = Date.parse(timeValue);
  if (Number.isFinite(parsedDirect) && /(?:Z|[+-]\d\d:\d\d)$/.test(String(timeValue))) {
    return parsedDirect;
  }

  const parts = parseLocalIsoParts(timeValue);
  if (!parts) return Number.isFinite(parsedDirect) ? parsedDirect : NaN;

  let utcTs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utcTs), timeZone);
    utcTs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0) - offset;
  }
  return utcTs;
}

export function getClosestNowHourIndex(hourlyTimes, now = new Date(), timeZone = 'UTC') {
  if (!Array.isArray(hourlyTimes) || hourlyTimes.length === 0) return null;
  const nowMs = now.getTime();
  let closestIndex = null;
  let closestDelta = Infinity;

  hourlyTimes.forEach((timeValue, index) => {
    const ts = parseHourlyTimestamp(timeValue, timeZone);
    if (!Number.isFinite(ts)) return;
    const delta = Math.abs(ts - nowMs);
    if (delta < closestDelta) {
      closestDelta = delta;
      closestIndex = index;
    }
  });

  return closestIndex;
}

export function getLocalDayKey(date = new Date(), timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function normalizeWeatherPayload(weatherPayload = {}, { now = new Date(), source = null } = {}) {
  const historicalDaily = weatherPayload?.historical?.daily || weatherPayload?.daily || {};
  const forecast = weatherPayload?.forecast && typeof weatherPayload.forecast === 'object'
    ? weatherPayload.forecast
    : {};
  const timezone = forecast?.timezone || weatherPayload?.meta?.timezone || 'UTC';
  const hourly = forecast?.hourly || {};
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  const computedNowHourIndex = getClosestNowHourIndex(hourlyTimes, now, timezone);

  const existingMeta = weatherPayload?.meta && typeof weatherPayload.meta === 'object' ? weatherPayload.meta : {};
  const existingUnits = existingMeta.units && typeof existingMeta.units === 'object' ? existingMeta.units : {};

  return {
    historical: { daily: historicalDaily },
    forecast,
    meta: {
      ...existingMeta,
      timezone,
      source: existingMeta.source || source || 'UNKNOWN',
      units: {
        temp: String(existingUnits.temp || '').toLowerCase().startsWith('c') ? existingUnits.temp : 'F',
        wind: existingUnits.wind || 'mph',
        precip: existingUnits.precip || 'in',
        pressure: existingUnits.pressure || 'hPa'
      },
      nowIso: existingMeta.nowIso || now.toISOString(),
      nowHourIndex: Number.isInteger(computedNowHourIndex)
        ? computedNowHourIndex
        : (Number.isInteger(existingMeta.nowHourIndex) ? existingMeta.nowHourIndex : null)
    }
  };
}
