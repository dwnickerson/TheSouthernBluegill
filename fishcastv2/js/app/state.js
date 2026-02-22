import {
  buildWaterContext,
  computeDailySurface,
  computeExplainTerms,
  computePeriodsForDay,
  computeSurfaceNow
} from '../../domain/waterTempModel.js';

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function toYmdInTz(isoLike, timezone) {
  const dt = new Date(isoLike);
  if (!Number.isFinite(dt.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(dt);
}

function sanitizeHourlyTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function getDayKeyForHourlyValue(hourValue, timezone) {
  const value = sanitizeHourlyTime(hourValue);
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return value.slice(0, 10);
  }
  return toYmdInTz(value, timezone);
}

function pickTodayIndex(dailyTimes, timezone, nowISO) {
  const dayKeyNow = toYmdInTz(nowISO, timezone);
  const idx = dailyTimes.findIndex((dayKey) => dayKey === dayKeyNow);
  return idx >= 0 ? idx : 0;
}

function normalizeWeather(weatherPayload, context) {
  const forecast = context.payload.forecast || {};
  return {
    current: forecast.current || {},
    hourly: forecast.hourly || {},
    daily: forecast.daily || {}
  };
}

function buildDailyWater({ dailyTimes, dailySurface, sunriseArr, sunsetArr, waterType, context }) {
  return dailyTimes.map((dayKey, dayIndex) => {
    const periods = computePeriodsForDay({
      dailySurfaceTemp: dailySurface[dayIndex],
      waterType,
      context,
      sunriseTime: sunriseArr[dayIndex],
      sunsetTime: sunsetArr[dayIndex],
      dayKey
    });

    return {
      dayKey,
      surfaceDaily: round1(dailySurface[dayIndex]),
      periods: {
        sunrise: round1(periods.sunrise),
        midday: round1(periods.midday),
        sunset: round1(periods.sunset)
      }
    };
  });
}

function getNowPeriod(hourlyTimes, nowHourIndex, timezone) {
  const value = Number.isInteger(nowHourIndex) ? hourlyTimes[nowHourIndex] : null;
  const safe = sanitizeHourlyTime(value);
  if (!safe) return 'midday';

  const hour = /^\d{4}-\d{2}-\d{2}T(\d{2})/.test(safe)
    ? Number.parseInt(safe.slice(11, 13), 10)
    : Number.NaN;
  if (Number.isFinite(hour)) {
    if (hour < 11) return 'sunrise';
    if (hour < 15) return 'midday';
    return 'sunset';
  }

  const asDate = new Date(safe);
  if (Number.isFinite(asDate.getTime())) {
    const hr = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: timezone }).format(asDate));
    if (hr < 11) return 'sunrise';
    if (hr < 15) return 'midday';
    return 'sunset';
  }

  return 'midday';
}

export async function buildForecastState({ coords, waterType, speciesKey, days, weatherPayload }) {
  const timezone = weatherPayload?.forecast?.timezone || weatherPayload?.meta?.timezone || 'UTC';
  const nowISO = weatherPayload?.meta?.nowIso || new Date().toISOString();
  const context = buildWaterContext({ coords, waterType, timezone, weatherPayload, nowISO });
  const nowDate = new Date(nowISO);

  const surfaceNowRaw = await computeSurfaceNow({
    coords,
    waterType,
    nowDate,
    weatherPayload,
    context
  });

  const weather = normalizeWeather(weatherPayload, context);
  const dailyTimes = (weather.daily.time || []).slice(0, days);
  const sunriseArr = Array.isArray(weather.daily.sunrise) ? weather.daily.sunrise : [];
  const sunsetArr = Array.isArray(weather.daily.sunset) ? weather.daily.sunset : [];

  const dailySurface = computeDailySurface({
    surfaceNow: surfaceNowRaw,
    forecastData: context.payload.forecast,
    waterType,
    latitude: coords.lat,
    context,
    historicalDaily: context.payload.historical?.daily || {},
    units: context.payload.meta?.units
  }).slice(0, days);

  const daily = buildDailyWater({
    dailyTimes,
    dailySurface,
    sunriseArr,
    sunsetArr,
    waterType,
    context
  });

  const todayIndex = pickTodayIndex(dailyTimes, timezone, nowISO);
  const today = daily[todayIndex] || daily[0] || {
    periods: { sunrise: null, midday: null, sunset: null },
    surfaceDaily: null
  };

  const nowPeriod = getNowPeriod(weather.hourly.time || [], context.nowHourIndex, timezone);

  // Keep "surface now" anchored to the model's real-time estimate (which can
  // include observed calibration and current-hour forcing) rather than the
  // derived sunrise/midday/sunset display buckets. Buckets are for intraday
  // shape; they should not overwrite the current surface estimate.
  const surfaceNow = round1(surfaceNowRaw ?? today.periods[nowPeriod] ?? today.surfaceDaily);

  const explainToday = await computeExplainTerms({ coords, waterType, date: nowDate, weatherPayload, context });
  const explainFuture = await Promise.all(
    daily.slice(0, 3).map((_, i) => {
      const d = new Date(nowDate.getTime() + (i * 24 * 60 * 60 * 1000));
      return computeExplainTerms({ coords, waterType, date: d, weatherPayload, context });
    })
  );

  const debugBreakdown = {
    today: explainToday,
    firstThreeDays: explainFuture
  };

  return {
    meta: {
      buildId: `v2-${Date.now()}`,
      timezone,
      nowISO,
      units: context.payload.meta?.units || { temp: 'F', wind: 'mph', precip: 'in' }
    },
    inputs: { coords, waterType, speciesKey, days },
    coords: {
      lat: coords.lat,
      lon: coords.lon,
      name: coords.name || 'Unknown water body'
    },
    weather: {
      current: weather.current,
      hourly: weather.hourly,
      daily: weather.daily
    },
    water: {
      surfaceNow,
      periodsToday: {
        sunrise: today.periods.sunrise,
        midday: today.periods.midday,
        sunset: today.periods.sunset
      },
      daily,
      debugBreakdown
    }
  };
}

export function deriveDayKeyFromHourly(hourlyTimeValue, timezone) {
  return getDayKeyForHourlyValue(hourlyTimeValue, timezone);
}
