function hasTimezoneSuffix(value) {
    return /(?:Z|[+-]\d\d:\d\d)$/.test(String(value));
}

function toIsoUtc(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!hasTimezoneSuffix(trimmed)) {
        // Keep timezone-naive local timestamps as local wall-clock strings.
        // Weather API calls use timezone=auto, so forcing a Z suffix can shift
        // local hour interpretation and break sunrise/"now" alignment.
        return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed.toISOString();
}

function normalizeHourlyTimeArray(hourlyTime = []) {
    if (!Array.isArray(hourlyTime)) return [];
    return hourlyTime.map((value) => toIsoUtc(value)).filter((value) => typeof value === 'string');
}

function parseNaiveTime(value) {
    if (typeof value !== 'string') return null;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    return { year, month, day, hour, minute };
}

function toUtcMillisFromNaive(parts) {
    if (!parts) return null;
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function formatPartsInTimezone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    return { year, month, day, hour, minute };
}

function getClosestHourIndex(hourlyTimesIso, nowIso, timezone = 'UTC') {
    if (!hourlyTimesIso.length) return null;

    const hasExplicitZones = hourlyTimesIso.some((value) => hasTimezoneSuffix(value));
    if (hasExplicitZones) {
        const nowTs = Date.parse(nowIso);
        if (!Number.isFinite(nowTs)) return null;

        let closestIndex = null;
        let closestDelta = Infinity;
        hourlyTimesIso.forEach((value, index) => {
            const ts = Date.parse(value);
            if (!Number.isFinite(ts)) return;
            const delta = Math.abs(ts - nowTs);
            if (delta < closestDelta) {
                closestDelta = delta;
                closestIndex = index;
            }
        });
        return closestIndex;
    }

    const nowLocalParts = formatPartsInTimezone(new Date(nowIso), timezone);
    const nowLocalTs = toUtcMillisFromNaive(nowLocalParts);
    if (!Number.isFinite(nowLocalTs)) return null;

    let closestIndex = null;
    let closestDelta = Infinity;
    hourlyTimesIso.forEach((value, index) => {
        const ts = toUtcMillisFromNaive(parseNaiveTime(value));
        if (!Number.isFinite(ts)) return;
        const delta = Math.abs(ts - nowLocalTs);
        if (delta < closestDelta) {
            closestDelta = delta;
            closestIndex = index;
        }
    });

    return closestIndex;
}

function normalizeDailyTimeArray(dailyTimes = []) {
    if (!Array.isArray(dailyTimes)) return [];
    return dailyTimes.map((value) => {
        if (typeof value !== 'string') return null;
        const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
    }).filter(Boolean);
}

function toNumberArray(values, converter) {
    if (!Array.isArray(values)) return values;
    return values.map((value) => (Number.isFinite(value) ? converter(Number(value)) : value));
}

function convertTempToF(value) {
    return (value * 9) / 5 + 32;
}

function convertWindToMph(value) {
    return value * 0.621371;
}

function convertPrecipToIn(value) {
    return value / 25.4;
}

function isDevEnvironment() {
    if (typeof process !== 'undefined' && process?.env?.NODE_ENV) {
        return process.env.NODE_ENV !== 'production';
    }
    if (typeof window !== 'undefined') {
        return window.location?.hostname === 'localhost' || window.__DEBUG_WATER_TEMP === true;
    }
    return true;
}

function logPayloadFingerprintDev(context) {
    if (!isDevEnvironment()) return;
    if (globalThis.__fishcastWaterTempFingerprintLogged) return;
    globalThis.__fishcastWaterTempFingerprintLogged = true;
    const nowHourIndex = context.nowHourIndex;
    const hourlyTempNow = Number.isInteger(nowHourIndex)
        ? context.payload?.forecast?.hourly?.temperature_2m?.[nowHourIndex]
        : null;
    console.info(
        `[FishCast][waterTemp][fingerprint] anchor=${context.anchorDateISOZ} idx=${context.nowHourIndex} ` +
        `hourlyNow=${context.hourlyNowTimeISOZ} currentT=${context.payload?.forecast?.current?.temperature_2m ?? null} ` +
        `hourlyT=${hourlyTempNow ?? null}`
    );
}

export function normalizeWaterTempContext({ coords, waterType, timezone, weatherPayload, nowOverride } = {}) {
    const forecast = weatherPayload?.forecast && typeof weatherPayload.forecast === 'object'
        ? weatherPayload.forecast
        : (typeof weatherPayload === 'object' ? weatherPayload : {});
    const historicalDailyRaw = weatherPayload?.historical?.daily || weatherPayload?.daily || {};
    const historicalDaily = { ...historicalDailyRaw };

    const hourly = forecast?.hourly && typeof forecast.hourly === 'object' ? forecast.hourly : {};
    const hourlyUnits = forecast?.hourly_units || {};
    const dailyUnits = forecast?.daily_units || {};
    const currentUnits = forecast?.current_units || {};
    const resolvedTimezone = timezone || forecast?.timezone || weatherPayload?.meta?.timezone || 'UTC';
    const inputTempUnit = String(weatherPayload?.meta?.units?.temp || hourlyUnits.temperature_2m || currentUnits.temperature_2m || dailyUnits.temperature_2m_max || 'F').toLowerCase();
    const inputWindUnit = String(weatherPayload?.meta?.units?.wind || hourlyUnits.wind_speed_10m || currentUnits.wind_speed_10m || dailyUnits.wind_speed_10m_mean || 'mph').toLowerCase();
    const inputPrecipUnit = String(weatherPayload?.meta?.units?.precip || dailyUnits.precipitation_sum || currentUnits.precipitation || 'in').toLowerCase();
    const normalizedHourlyTime = normalizeHourlyTimeArray(hourly.time || []);
    const nowIso = toIsoUtc(nowOverride || weatherPayload?.meta?.nowIso || new Date().toISOString()) || new Date().toISOString();
    const nowHourIndex = getClosestHourIndex(normalizedHourlyTime, nowIso, resolvedTimezone);
    const safeIndex = Number.isInteger(nowHourIndex) ? nowHourIndex : 0;
    const hourlyNowTimeISOZ = normalizedHourlyTime[safeIndex] || nowIso;
    const anchorDateISOZ = hourlyNowTimeISOZ;

    const normalizedHourly = {
        ...hourly,
        time: normalizedHourlyTime
    };
    const normalizedCurrent = { ...(forecast?.current || {}) };
    const normalizedDaily = {
        ...(forecast?.daily || {}),
        time: normalizeDailyTimeArray(forecast?.daily?.time || [])
    };

    if (inputTempUnit.startsWith('c')) {
        historicalDaily.temperature_2m_mean = toNumberArray(historicalDaily.temperature_2m_mean, convertTempToF);
        historicalDaily.temperature_2m_min = toNumberArray(historicalDaily.temperature_2m_min, convertTempToF);
        historicalDaily.temperature_2m_max = toNumberArray(historicalDaily.temperature_2m_max, convertTempToF);
        normalizedHourly.temperature_2m = toNumberArray(normalizedHourly.temperature_2m, convertTempToF);
        if (Number.isFinite(normalizedCurrent.temperature_2m)) normalizedCurrent.temperature_2m = convertTempToF(normalizedCurrent.temperature_2m);
        if (Number.isFinite(normalizedCurrent.apparent_temperature)) normalizedCurrent.apparent_temperature = convertTempToF(normalizedCurrent.apparent_temperature);
        normalizedDaily.temperature_2m_mean = toNumberArray(normalizedDaily.temperature_2m_mean, convertTempToF);
        normalizedDaily.temperature_2m_min = toNumberArray(normalizedDaily.temperature_2m_min, convertTempToF);
        normalizedDaily.temperature_2m_max = toNumberArray(normalizedDaily.temperature_2m_max, convertTempToF);
    }

    if (inputWindUnit.includes('km')) {
        historicalDaily.wind_speed_10m_mean = toNumberArray(historicalDaily.wind_speed_10m_mean, convertWindToMph);
        historicalDaily.wind_speed_10m_max = toNumberArray(historicalDaily.wind_speed_10m_max, convertWindToMph);
        normalizedHourly.wind_speed_10m = toNumberArray(normalizedHourly.wind_speed_10m, convertWindToMph);
        if (Number.isFinite(normalizedCurrent.wind_speed_10m)) normalizedCurrent.wind_speed_10m = convertWindToMph(normalizedCurrent.wind_speed_10m);
        normalizedDaily.wind_speed_10m_mean = toNumberArray(normalizedDaily.wind_speed_10m_mean, convertWindToMph);
        normalizedDaily.wind_speed_10m_max = toNumberArray(normalizedDaily.wind_speed_10m_max, convertWindToMph);
    }

    if (inputPrecipUnit.includes('mm')) {
        historicalDaily.precipitation_sum = toNumberArray(historicalDaily.precipitation_sum, convertPrecipToIn);
        if (Number.isFinite(normalizedCurrent.precipitation)) normalizedCurrent.precipitation = convertPrecipToIn(normalizedCurrent.precipitation);
        normalizedDaily.precipitation_sum = toNumberArray(normalizedDaily.precipitation_sum, convertPrecipToIn);
    }

    const normalizedPayload = {
        historical: { daily: historicalDaily },
        forecast: {
            ...forecast,
            hourly: normalizedHourly,
            current: normalizedCurrent,
            daily: normalizedDaily
        },
        meta: {
            ...(weatherPayload?.meta || {}),
            timezone: resolvedTimezone,
            source: weatherPayload?.meta?.source || 'UNKNOWN',
            nowIso,
            nowHourIndex,
            anchorDateISOZ,
            hourlyNowTimeISOZ,
            units: {
                temp: 'F',
                wind: 'mph',
                precip: 'in',
                pressure: weatherPayload?.meta?.units?.pressure || 'hPa'
            }
        }
    };

    const context = {
        coords,
        waterType,
        timezone: normalizedPayload.meta.timezone,
        anchorDateISOZ,
        nowHourIndex,
        hourlyNowTimeISOZ,
        units: normalizedPayload.meta.units,
        payload: normalizedPayload
    };

    logPayloadFingerprintDev(context);
    return context;
}
