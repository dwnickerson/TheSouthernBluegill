// Water Temperature Prediction Model V2.0
// Science-based estimation using seasonal physics + user data calibration
// Unit contract: all model temperatures are expected in °F from weatherAPI (temperature_unit=fahrenheit).

import { WATER_BODIES_V2 } from '../config/waterBodies.js';
import { APP_CONSTANTS } from '../config/constants.js';
import { getDayOfYear } from '../utils/date.js';
import { calculateDistance } from '../utils/math.js';
import { storage } from '../services/storage.js';
import { createLogger } from '../utils/logger.js';
import { getPressureRate } from './fishingScore.js';
import { toWindMph } from '../utils/units.js';
import { getLocalDayKey, parseHourlyTimestamp } from '../utils/weatherPayload.js';
import { normalizeWaterTempContext } from './waterPayloadNormalize.js';

const debugLog = createLogger('water-temp');

const WIND_FALLBACK_MAX_REDUCTION = 0.6;
const FORECAST_MAX_WIND_GUST_WEIGHT = 0.2;
const EXTERNAL_REPORTS_ENABLED = false;
export const WATER_TEMP_MODEL_VERSION = '2.5.0';
// Field checks in small southern ponds can diverge by >3°F from the physics baseline
// after abrupt fronts. Cap retained for safety, but widened so fresh observed reports
// can pull the model back into alignment instead of getting stuck warm-biased.
const OBSERVED_TEMP_CALIBRATION_MAX_OFFSET_F = 6;
const OBSERVED_TEMP_CALIBRATION_DECAY_HOURS = 60;

function warnIfUnitMismatch(message) {
    const isDev = typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';
    if (isDev) {
        console.warn(`[FishCast][waterTemp][units] ${message}`);
    }
}

export function getField(container, path, trace = null) {
    if (!container || typeof path !== 'string') return undefined;
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.').filter(Boolean);

    let current = container;
    let resolvedPath = '';
    for (const part of parts) {
        resolvedPath = resolvedPath ? `${resolvedPath}.${part}` : part;
        if (trace && current && Object.prototype.hasOwnProperty.call(current, part)) {
            const asIndex = Number.parseInt(part, 10);
            const pathWithIndex = Number.isInteger(asIndex)
                ? `${resolvedPath.replace(/\.(\d+)$/, '')}[${asIndex}]`
                : resolvedPath;
            trace.add(pathWithIndex);
        }
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}


function average(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return null;
    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function normalizeWaterBodyType(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
}

function buildObservedCalibration(coords, waterType, currentDate) {
    const observed = storage.getWaterTempObserved(coords.lat, coords.lon, waterType);
    if (!observed || !Number.isFinite(observed.tempF) || typeof observed.timestamp !== 'string') {
        return null;
    }

    const observedAt = new Date(observed.timestamp);
    if (!Number.isFinite(observedAt.getTime())) return null;
    const ageHours = (currentDate.getTime() - observedAt.getTime()) / (1000 * 60 * 60);
    if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours > 72) return null;

    return { observedTempF: observed.tempF, observedTimestamp: observed.timestamp, ageHours };
}

function applyObservedCalibrationOffset(estimatedTemp, observedCalibration) {
    if (!Number.isFinite(estimatedTemp) || !observedCalibration) {
        return { calibratedTemp: estimatedTemp, offset: 0, decayWeight: 0 };
    }

    const decayWeight = clamp(1 - (observedCalibration.ageHours / OBSERVED_TEMP_CALIBRATION_DECAY_HOURS), 0, 1);
    if (decayWeight <= 0) {
        return { calibratedTemp: estimatedTemp, offset: 0, decayWeight };
    }

    const rawOffset = observedCalibration.observedTempF - estimatedTemp;
    const boundedOffset = clamp(rawOffset, -OBSERVED_TEMP_CALIBRATION_MAX_OFFSET_F, OBSERVED_TEMP_CALIBRATION_MAX_OFFSET_F);
    const offset = boundedOffset * decayWeight;

    return {
        calibratedTemp: estimatedTemp + offset,
        offset,
        decayWeight
    };
}

function getDiurnalResponseByWaterType(waterType) {
    if (waterType === 'pond') {
        return {
            // Tuned against Tupelo field observations. Pond intraday swings should
            // respond to clear/calm conditions, but earlier weights over-reacted and
            // produced +5°F to +7°F offsets versus reported surface checks.
            solarGain: 0.19,
            airCoupling: 0.11,
            shortwaveCoupling: 0.9,
            windDamping: 0.035
        };
    }
    if (waterType === 'lake') {
        return {
            solarGain: 0.2,
            airCoupling: 0.18,
            shortwaveCoupling: 0.55,
            windDamping: 0.02
        };
    }
    return {
        solarGain: 0.14,
        airCoupling: 0.12,
        shortwaveCoupling: 0.4,
        windDamping: 0.015
    };
}

function getDiurnalAdjustmentLimit(waterType, { dailyAirRange = 0, cloudBlend = 50, windBlend = 0, targetShortwave = null } = {}) {
    if (waterType === 'pond') {
        const rangeSignal = clamp((dailyAirRange - 14) / 14, 0, 1);
        const clearSignal = clamp((55 - cloudBlend) / 45, 0, 1);
        const calmSignal = clamp((9 - windBlend) / 9, 0, 1);
        const shortwaveSignal = Number.isFinite(targetShortwave)
            ? clamp((targetShortwave - 280) / 420, 0, 1)
            : 0;

        // Allow stronger daytime warm spikes for shallow ponds when hourly forcing is
        // hot/bright/calm. This helps "surface now" match sunny afternoon checks
        // without relaxing cloudy or windy regimes.
        const warmBoost = (rangeSignal * 1.4) + (clearSignal * 0.9) + (calmSignal * 0.8) + (shortwaveSignal * 1.3);
        return 4.6 + (warmBoost * 1.45);
    }
    if (waterType === 'lake') return 2.3;
    return 1.8;
}

function getColdSeasonPondDiurnalWarmCap({
    date,
    dailySurfaceTemp,
    targetAir,
    cloudBlend,
    windBlend,
    targetShortwave
}) {
    if (!(date instanceof Date) || !Number.isFinite(dailySurfaceTemp)) return null;

    const dayOfYear = getDayOfYear(date);
    const winterDistance = Math.min(
        Math.abs(dayOfYear - 15),
        Math.abs(dayOfYear + 365 - 15),
        Math.abs(dayOfYear - 365 - 15)
    );
    const winterFactor = clamp(1 - (winterDistance / 115), 0, 1);
    const isColdSeasonWindow = dayOfYear <= 80 || dayOfYear >= 330;
    if (!isColdSeasonWindow || winterFactor <= 0) return null;

    // Guardrail should only apply to late-winter/early-spring cold-water setups.
    const coldWaterSignal = clamp((60 - dailySurfaceTemp) / 10, 0, 1);
    if (coldWaterSignal <= 0) return null;

    const clearSignal = clamp((60 - cloudBlend) / 60, 0, 1);
    const calmSignal = clamp((9 - windBlend) / 9, 0, 1);
    const shortwaveSignal = Number.isFinite(targetShortwave)
        ? clamp((targetShortwave - 260) / 520, 0, 1)
        : 0;
    const airWaterSpread = Number.isFinite(targetAir)
        ? Math.max(0, targetAir - dailySurfaceTemp)
        : 0;
    if (airWaterSpread < 16 || !Number.isFinite(targetAir) || targetAir < 68) return null;

    // Base cold-season cap keeps noon spikes from jumping 6°F–8°F above the daily
    // projection in shallow southern ponds after a single warm/dry air surge.
    const atmosphericLift = (clearSignal * 0.9) + (calmSignal * 0.75) + (shortwaveSignal * 0.85);
    const spreadCap = clamp((airWaterSpread * 0.11) + 0.55, 0.9, 3.3);
    const seasonalCap = 1.6 + (atmosphericLift * 1.25) + (winterFactor * 0.35);

    // As water approaches 60°F or winter influence weakens, gradually release cap.
    const blendWeight = clamp((winterFactor * 0.65) + (coldWaterSignal * 0.55), 0, 1);
    return clamp((seasonalCap * blendWeight) + (spreadCap * (1 - blendWeight)), 1.2, 3.9);
}


function getColdSeasonModerateAirPondCap({
    date,
    dailySurfaceTemp,
    targetAir,
    cloudBlend,
    windBlend,
    period
}) {
    if (!(date instanceof Date) || !Number.isFinite(dailySurfaceTemp) || !Number.isFinite(targetAir)) return null;

    const dayOfYear = getDayOfYear(date);
    const isColdSeasonWindow = dayOfYear <= 80 || dayOfYear >= 330;
    if (!isColdSeasonWindow) return null;

    if (dailySurfaceTemp < 55) return null;

    const coldWaterSignal = clamp((61 - dailySurfaceTemp) / 11, 0, 1);
    if (coldWaterSignal <= 0) return null;

    const airWaterSpread = Math.max(0, targetAir - dailySurfaceTemp);
    if (airWaterSpread < 3 || airWaterSpread > 9 || targetAir > 64) return null;

    const clearSignal = clamp((55 - cloudBlend) / 55, 0, 1);
    const calmSignal = clamp((8 - windBlend) / 8, 0, 1);
    const periodBoost = period === 'afternoon' ? 0.2 : (period === 'midday' ? 0.12 : 0);

    const baseCap = 1.2 + (airWaterSpread * 0.2);
    const atmosphereBoost = (clearSignal * 0.35) + (calmSignal * 0.3);
    const coldSeasonCap = (baseCap + atmosphereBoost + periodBoost) * (0.7 + (coldWaterSignal * 0.3));
    return clamp(coldSeasonCap, 1.1, 2.0);
}


function getNearTermPondWarmRateCap({ date, dailySurfaceTemp }) {
    if (!(date instanceof Date) || !Number.isFinite(dailySurfaceTemp)) return null;

    const dayOfYear = getDayOfYear(date);
    const isColdSeasonWindow = dayOfYear <= 80 || dayOfYear >= 330;
    if (!isColdSeasonWindow) return null;

    const coldWaterSignal = clamp((61 - dailySurfaceTemp) / 11, 0, 1);
    if (coldWaterSignal <= 0) return null;

    // Keep near-term cold-season pond warming physically plausible when users are
    // comparing "surface now" to the next period card inside a short (<2h) window.
    return 0.65 + (coldWaterSignal * 0.2);
}

function getHourInTimezone(timestamp, timezone = 'UTC') {
    if (typeof timestamp !== 'string') return null;
    const ts = parseHourlyTimestamp(timestamp, timezone);
    if (!Number.isFinite(ts)) return parseHourFromTimestamp(timestamp);

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(new Date(ts));
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour + (minute / 60);
}

function parseHourFromTimestamp(timestamp) {
    if (typeof timestamp !== 'string') return null;
    const match = timestamp.match(/T(\d{2}):(\d{2})/);
    if (!match) return null;

    const hour = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minutes)) return null;
    return hour + (minutes / 60);
}

function getResolvedDayKey(timeValue, timezone = 'UTC') {
    if (typeof timeValue !== 'string' || !timeValue) return null;
    const parsedTs = parseHourlyTimestamp(timeValue, timezone);
    if (Number.isFinite(parsedTs)) {
        return getLocalDayKey(new Date(parsedTs), timezone);
    }
    return timeValue.slice(0, 10);
}

function getPeriodTargetHour(period, { sunriseTime, sunsetTime } = {}) {
    const sunriseHour = parseHourFromTimestamp(sunriseTime);
    const sunsetHour = parseHourFromTimestamp(sunsetTime);

    if (period === 'morning') {
        return Number.isFinite(sunriseHour) ? sunriseHour : 9;
    }
    if (period === 'midday') {
        if (Number.isFinite(sunriseHour) && Number.isFinite(sunsetHour) && sunsetHour > sunriseHour) {
            return sunriseHour + ((sunsetHour - sunriseHour) / 2);
        }
        return 12;
    }
    if (period === 'afternoon') {
        return Number.isFinite(sunsetHour) ? sunsetHour : 15;
    }
    return 12;
}

function normalizeAirTempToF(value, tempUnit = 'F') {
    if (!Number.isFinite(value)) return null;
    if (value > 140 || value < -90) return null;

    const normalizedUnit = String(tempUnit || 'F').toLowerCase();
    if (normalizedUnit.startsWith('c')) {
        return (value * 9) / 5 + 32;
    }


    return value;
}

function normalizeLikelyWindMph(value, unitHint = '') {
    if (!Number.isFinite(value)) return null;
    if (value > 130 || value < 0) return null;

    const normalizedUnit = String(unitHint || '').toLowerCase();
    if (normalizedUnit.includes('mph')) {
        if (value > 45) {
            warnIfUnitMismatch(`wind unit hint is mph but value ${value} triggered legacy km/h fallback conversion.`);
        }
        return value;
    }

    // Legacy km/h cache may still appear; convert only when values look implausible for mph.
    if (value > 45) {
        return value * 0.621371;
    }
    return value;
}

function getForecastWindUnit(forecastData) {
    const dailyUnits = forecastData?.daily_units || {};
    const hourlyUnits = forecastData?.hourly_units || {};
    const currentUnits = forecastData?.current_units || {};
    return (
        hourlyUnits.wind_speed_10m ||
        currentUnits.wind_speed_10m ||
        dailyUnits.wind_speed_10m_mean ||
        dailyUnits.wind_speed_10m_max ||
        ''
    );
}

function normalizePrecipToInches(value, unitHint = '') {
    if (!Number.isFinite(value) || value < 0) return 0;
    const normalizedUnit = String(unitHint || '').toLowerCase();

    if (!normalizedUnit || normalizedUnit.includes('inch') || normalizedUnit === 'in') {
        if (value > 3) {
            warnIfUnitMismatch(`precipitation unit hint is inch but value ${value} is unusually large for daily inches; verify no hidden mm→in conversion upstream.`);
        }
        return value;
    }
    if (normalizedUnit.includes('mm')) return value / 25.4;
    if (normalizedUnit.includes('cm')) return value / 2.54;

    return value;
}

function getForecastPrecipUnit(forecastData) {
    const dailyUnits = forecastData?.daily_units || {};
    const currentUnits = forecastData?.current_units || {};
    return dailyUnits.precipitation_sum || currentUnits.precipitation || '';
}

function calculateEvaporativeCoolingProxy({ relativeHumidity, windMph, evaporationMultiplier = 1 }) {
    const humidity = Number(relativeHumidity);
    const wind = Number(windMph);
    const humidityDeficit = Number.isFinite(humidity) ? clamp((78 - humidity) / 48, 0, 1) : 0;
    const breezeSignal = Number.isFinite(wind) ? clamp(wind / 18, 0, 1) : 0;

    const multiplier = clamp(Number(evaporationMultiplier) || 1, 0.5, 1.5);

    // Clamp to <= 1.0°F/day cooling contribution before multiplier, then re-clamp to safety range.
    return -clamp(clamp(humidityDeficit * breezeSignal, 0, 1) * multiplier, 0, 1.5);
}

function getSolarSensitivity(waterType, body) {
    if (waterType === 'river') return 0.65;
    if (waterType === 'reservoir') return 0.85;
    if (waterType === 'pond') return 1.25;

    const lagFactor = clamp(1.15 - (body.thermal_lag_days / 15), 0.65, 1.2);
    const depthFactor = clamp(1.2 - (Math.log1p(body.depth || 10) / 4.5), 0.7, 1.2);
    return clamp((lagFactor + depthFactor) / 2, 0.65, 1.25);
}

function getSmoothTrendKicker(trendFPerDay) {
    const absTrend = Math.abs(trendFPerDay);
    const ramp = clamp((absTrend - 0.5) / (3.0 - 0.5), 0, 1);
    return ramp * trendFPerDay * 0.5;
}

function getWaterTypeTrendGain(waterType, synopticEventStrength = 0) {
    // Forecast trend forcing should be damped by thermal mass, but strong fronts should still move water temps.
    const baseGain = waterType === 'reservoir' ? 0.2 : waterType === 'lake' ? 0.55 : 0.75;
    return clamp(baseGain + (synopticEventStrength * (1 - baseGain)), baseGain, 1);
}


function getTrendKickerLimit(waterType, synopticEventStrength) {
    const base = waterType === 'reservoir' ? 0.7 : waterType === 'lake' ? 1.2 : 1.8;
    return base + (synopticEventStrength * 0.8);
}


function getDailyDeltaEnvelope(waterType, synopticEventStrength) {
    const base = waterType === 'reservoir' ? 1.4 : waterType === 'lake' ? 2.4 : 3.4;
    const surge = waterType === 'reservoir' ? 1.6 : waterType === 'lake' ? 1.8 : 2.4;
    return base + (synopticEventStrength * surge);
}

function getPhysicallyBoundedDeltaRange({
    waterType,
    prevTemp,
    airTemp,
    prevAirTemp,
    synopticEventStrength
}) {
    const body = WATER_BODIES_V2[waterType];
    if (!body || waterType !== 'reservoir') {
        return { minDelta: -Infinity, maxDelta: Infinity };
    }

    const airWaterDelta = Number.isFinite(airTemp) ? airTemp - prevTemp : 0;
    const thermalStep = clamp(Math.abs(airWaterDelta) / Math.max(body.thermal_lag_days, 1), 0.15, 1.25);

    // Synoptic events (fronts, high wind, precipitation) can accelerate mixing/turnover.
    const eventSurge = synopticEventStrength * 0.7;

    let maxWarm = Math.min(thermalStep + eventSurge, 1.6);
    let maxCool = -(thermalStep * 0.9 + (synopticEventStrength * 0.9));

    const warmingRegime = (!Number.isFinite(prevAirTemp) || airTemp >= prevAirTemp) && airTemp >= (prevTemp + 2);
    if (warmingRegime && synopticEventStrength < 0.75) {
        // Large reservoirs can flatten during warmups but should not show deep cooling reversals.
        maxCool = Math.max(maxCool, -0.25);
    }

    return {
        minDelta: maxCool,
        maxDelta: maxWarm
    };
}

function getSynopticEventStrength(daily, dayIndex, prevAirTemp, airTemp, windMph, precipUnit = '') {
    const airJumpSignal = Number.isFinite(prevAirTemp)
        ? clamp(Math.abs(airTemp - prevAirTemp) / 12, 0, 1)
        : 0;

    // Mixing and turnover risks increase during windy frontal passages.
    const windSignal = clamp(((Number.isFinite(windMph) ? windMph : 0) - 10) / 20, 0, 1);

    const precipIn = normalizePrecipToInches(daily?.precipitation_sum?.[dayIndex], precipUnit);
    const precipProbability = Number.isFinite(daily?.precipitation_probability_max?.[dayIndex])
        ? clamp(daily.precipitation_probability_max[dayIndex] / 100, 0, 1)
        : null;
    const executedPrecipIn = Number.isFinite(precipProbability)
        ? precipIn * (0.35 + (0.65 * precipProbability))
        : precipIn;
    const precipSignal = clamp(executedPrecipIn / 1.2, 0, 1);

    return clamp((airJumpSignal * 0.55) + (windSignal * 0.25) + (precipSignal * 0.2), 0, 1);
}


function getPressureMixingBoost(hourly = {}) {
    const pressures = Array.isArray(hourly.surface_pressure) ? hourly.surface_pressure : [];
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    const analysis = getPressureRate(pressures, times);
    const slopeMagnitude = clamp(Math.abs(analysis.rate) / 2.2, 0, 1);
    return clamp(slopeMagnitude * 0.15, 0, 0.15);
}

function getWeatherMixingSignals({ current = {}, hourly = {}, dayIndex = 0, nowHourIndex = null, evaporationMultiplier = 1 }) {
    const humidity = Number(current.relative_humidity_2m);
    const airTempF = Number(current.temperature_2m);
    const windMph = Number(current.wind_speed_10m);
    const weatherCode = Number(current.weather_code);
    const precipNowIn = Number(current.precipitation);

    const humidityTerm = Number.isFinite(humidity) ? clamp((70 - humidity) / 55, 0, 1) : 0;
    const windTerm = Number.isFinite(windMph) ? clamp(windMph / 20, 0, 1) : 0;
    const evaporationCooling = calculateEvaporativeCoolingProxy({
        relativeHumidity: humidity,
        windMph,
        evaporationMultiplier
    });

    const hourlyCodes = Array.isArray(hourly.weather_code) ? hourly.weather_code : [];
    const codeWindowStart = Number.isFinite(nowHourIndex) ? Math.max(0, nowHourIndex - 2) : 0;
    const codeWindowEnd = Number.isFinite(nowHourIndex) ? nowHourIndex + 4 : Math.min(hourlyCodes.length, 6);
    const nearTermCodes = hourlyCodes.slice(codeWindowStart, codeWindowEnd).filter(Number.isFinite);
    const stormyCode = [95, 96, 99].includes(weatherCode) || nearTermCodes.some((code) => [95, 96, 99, 65, 82].includes(code));

    const hourlyPrecipProb = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
    const precipProb = Number.isFinite(hourlyPrecipProb[dayIndex]) ? hourlyPrecipProb[dayIndex] : 0;
    const wetSignal = clamp((Number.isFinite(precipNowIn) ? precipNowIn : 0) / 0.35, 0, 1);
    const precipProbSignal = clamp(precipProb / 100, 0, 1);

    const cloudCover = Array.isArray(hourly.cloud_cover) ? hourly.cloud_cover : [];
    const cloudWindow = cloudCover.slice(codeWindowStart, codeWindowEnd).filter(Number.isFinite);
    const nearTermCloudMean = Number.isFinite(average(cloudWindow)) ? average(cloudWindow) : null;

    const precipRegimeTerm = stormyCode
        ? 1
        : clamp((wetSignal * 0.6) + (precipProbSignal * 0.4), 0, 1);

    return {
        humidityTerm,
        windTerm,
        precipRegimeTerm,
        evaporationCooling,
        stormMixingBoost: stormyCode ? 0.12 : clamp((wetSignal * 0.08) + (precipProbSignal * 0.05), 0, 0.12),
        stormSolarDamping: stormyCode ? 0.35 : clamp((wetSignal * 0.2) + (precipProbSignal * 0.1), 0, 0.35),
        nearTermCloudMean
    };
}

function getDayHourlyAverages(hourly = {}, dayKey = '') {
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    const humiditySeries = Array.isArray(hourly.relative_humidity_2m) ? hourly.relative_humidity_2m : [];
    const windSeries = Array.isArray(hourly.wind_speed_10m) ? hourly.wind_speed_10m : [];
    if (!times.length || !dayKey) return { humidity: null, wind: null };

    const idxs = [];
    times.forEach((time, index) => {
        if (String(time).startsWith(dayKey)) idxs.push(index);
    });

    if (!idxs.length) return { humidity: null, wind: null };

    const humidity = average(idxs.map((i) => humiditySeries[i]).filter(Number.isFinite));
    const wind = average(idxs.map((i) => windSeries[i]).filter(Number.isFinite));
    return { humidity, wind };
}
function applyColdSeasonPondCorrection({ estimatedTemp, waterType, dayOfYear, airInfluence, cloudCover }) {
    if (waterType !== 'pond' || !Number.isFinite(estimatedTemp)) {
        return estimatedTemp;
    }

    const winterDistance = Math.min(
        Math.abs(dayOfYear - 15),
        Math.abs(dayOfYear + 365 - 15),
        Math.abs(dayOfYear - 365 - 15)
    );
    const shoulderDistance = Math.min(
        Math.abs(dayOfYear - 75),
        Math.abs(dayOfYear + 365 - 75),
        Math.abs(dayOfYear - 365 - 75)
    );

    const winterFactor = clamp(1 - (winterDistance / 90), 0, 1);
    const shoulderFactor = clamp(1 - (shoulderDistance / 110), 0, 1);
    const seasonFactor = clamp((winterFactor * 0.85) + (shoulderFactor * 0.35), 0, 1);
    if (seasonFactor <= 0) {
        return estimatedTemp;
    }

    const recentCloud = average(cloudCover || []);
    const overcastSignal = Number.isFinite(recentCloud)
        ? clamp((recentCloud - 62) / 35, 0, 1)
        : 0;
    const coolAirSignal = Number.isFinite(airInfluence?.average)
        ? clamp((62 - airInfluence.average) / 12, 0, 1)
        : 0;

    // Keep correction primarily tied to genuinely cold-air regimes; overcast alone should not
    // stack into large additional cooling on top of solar damping + wind/evap terms.
    const cloudAssist = 0.55 + (0.45 * coolAirSignal);
    const correction = seasonFactor * ((1.45 * coolAirSignal) + (1.1 * overcastSignal * cloudAssist));
    const boundedCorrection = Math.min(correction, 1.6 + (0.8 * coolAirSignal));
    return estimatedTemp - boundedCorrection;
}


function applyLivePondColdSeasonGuardrail({
    correctedTemp,
    preCorrectionTemp,
    waterType,
    latitude,
    cloudCover,
    nearTermCloudMean,
    airTempF,
    source
}) {
    if (source !== 'LIVE' || waterType !== 'pond' || !Number.isFinite(correctedTemp) || !Number.isFinite(preCorrectionTemp)) {
        return correctedTemp;
    }
    if (!Number.isFinite(latitude) || latitude >= 36) {
        return correctedTemp;
    }

    const coldSeasonCorrection = correctedTemp - preCorrectionTemp;
    if (coldSeasonCorrection >= 0) return correctedTemp;

    const meanCloud = average([...(Array.isArray(cloudCover) ? cloudCover.filter(Number.isFinite) : []), nearTermCloudMean].filter(Number.isFinite));
    const cloudHeavy = Number.isFinite(meanCloud) && meanCloud >= 80;
    const airAboveSurface = Number.isFinite(airTempF) ? (airTempF - correctedTemp) : 0;
    if (!cloudHeavy || airAboveSurface <= 3) {
        return correctedTemp;
    }

    const minCorrection = meanCloud >= 90 ? -0.4 : -0.6;
    const guardedCorrection = Math.max(coldSeasonCorrection, minCorrection);
    const guardedTemp = preCorrectionTemp + guardedCorrection;
    return Math.min(correctedTemp + 1.0, guardedTemp);
}

function getRelaxedDailyChangeLimit(baseLimit, userReports, coords) {
    if (!Array.isArray(userReports) || userReports.length < 2) {
        return baseLimit;
    }

    const now = new Date();
    const recentClose = userReports.filter((report) => {
        const reportDate = new Date(report.timestamp);
        const ageDays = (now - reportDate) / (1000 * 60 * 60 * 24);
        if (!Number.isFinite(ageDays) || ageDays > 7) return false;

        const distance = calculateDistance(coords.lat, coords.lon, report.latitude, report.longitude);
        return Number.isFinite(distance) && distance <= 20;
    });

    if (recentClose.length < 2) return baseLimit;

    const trustBoost = clamp(1 + ((recentClose.length - 1) * 0.2), 1, 2);
    return baseLimit * trustBoost;
}

function hasTrustedRecentLocalReports(userReports, coords, waterType) {
    if (!Array.isArray(userReports) || userReports.length === 0) return false;

    const now = Date.now();
    const normalizedWaterType = normalizeWaterBodyType(waterType);

    return userReports.some((report) => {
        const distance = calculateDistance(coords.lat, coords.lon, report.latitude, report.longitude);
        if (!Number.isFinite(distance) || distance > 6) return false;

        const reportDate = new Date(report.timestamp);
        const ageHours = (now - reportDate.getTime()) / (1000 * 60 * 60);
        if (!Number.isFinite(ageHours) || ageHours > 30) return false;

        const reportWaterBody = normalizeWaterBodyType(report.waterBody);
        return !reportWaterBody || reportWaterBody === normalizedWaterType;
    });
}

// Get seasonal baseline temperature using harmonic oscillation
function getSeasonalBaseTemp(latitude, dayOfYear, waterType) {
    const body = WATER_BODIES_V2[waterType];
    const annualMean = 77.5 - (0.6 * Math.abs(latitude - 30));
    const amplitude = body.annual_amplitude;
    const peakDay = 210 + body.seasonal_lag_days;
    const radians = (2 * Math.PI * (dayOfYear - peakDay)) / 365;
    const seasonalTemp = annualMean + (amplitude * Math.cos(radians));

    const pondReferenceDepth = WATER_BODIES_V2.pond.thermocline_depth;
    const depthMassDelta = Math.log1p(body.thermocline_depth) - Math.log1p(pondReferenceDepth);

    const winterDistance = Math.min(
        Math.abs(dayOfYear - 15),
        Math.abs(dayOfYear + 365 - 15),
        Math.abs(dayOfYear - 365 - 15)
    );
    const winterFactor = Math.max(0, 1 - (winterDistance / 95));

    const shoulderDistance = Math.min(
        Math.abs(dayOfYear - 75),
        Math.abs(dayOfYear + 365 - 75),
        Math.abs(dayOfYear - 365 - 75)
    );
    const shoulderFactor = Math.max(0, 1 - (shoulderDistance / 110));

    const coldSeasonCooling = depthMassDelta * (7.0 * winterFactor + 3.0 * shoulderFactor);

    return seasonalTemp - coldSeasonCooling;
}

// Calculate solar radiation effect from cloud cover
function calculateSolarDeviation(latitude, dayOfYear, cloudCoverArray, waterType) {
    if (!cloudCoverArray || cloudCoverArray.length === 0) return 0;

    const body = WATER_BODIES_V2[waterType];
    const recentDays = Math.min(7, cloudCoverArray.length);
    const avgCloudCover = cloudCoverArray.slice(-recentDays).reduce((a, b) => a + b, 0) / recentDays;

    const month = clamp(Math.floor(((dayOfYear - 1) / 365) * 12), 0, 11);
    const normalCloudCover = [55, 52, 50, 45, 40, 35, 35, 35, 38, 42, 48, 52][month];

    const solarDeclination = 23.44 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
    const latRad = latitude * (Math.PI / 180);
    const declinationRad = solarDeclination * (Math.PI / 180);
    const middayElevation = Math.asin(
        Math.sin(latRad) * Math.sin(declinationRad) +
        Math.cos(latRad) * Math.cos(declinationRad)
    );

    const seasonalInsolationFactor = clamp(Math.sin(middayElevation) / Math.sin(Math.PI / 4), 0.3, 1.3);
    const waterTypeSensitivity = getSolarSensitivity(waterType, body);

    const cloudDeviation = normalCloudCover - avgCloudCover;
    const solarDeviation = cloudDeviation * 0.08 * seasonalInsolationFactor * waterTypeSensitivity;
    return Math.max(0, solarDeviation);
}

function calculateAirTempInfluence(airTemps, waterType, tempUnit = 'F') {
    const body = WATER_BODIES_V2[waterType];
    const normalizedTemps = (airTemps || []).map((value) => normalizeAirTempToF(value, tempUnit)).filter(Number.isFinite);

    if (normalizedTemps.length === 0) {
        return { average: 65, trend: 0 };
    }

    const lagDays = body.thermal_lag_days;
    const recent = normalizedTemps.slice(-lagDays);

    let trendSum = 0;
    for (let i = 1; i < recent.length; i++) {
        trendSum += (recent[i] - recent[i - 1]);
    }
    const trend = recent.length > 1 ? trendSum / (recent.length - 1) : 0;

    let weightedSum = 0;
    let totalWeight = 0;
    recent.forEach((temp, i) => {
        const age = recent.length - i - 1;
        const weight = Math.exp(-age / (lagDays * 0.4));
        weightedSum += temp * weight;
        totalWeight += weight;
    });

    return {
        average: weightedSum / totalWeight,
        trend
    };
}

function getDataDrivenBaselineTemp({ seasonalBase, airTemps, waterType, tempUnit = 'F' }) {
    const normalizedTemps = (airTemps || [])
        .map((value) => normalizeAirTempToF(value, tempUnit))
        .filter(Number.isFinite);
    if (!normalizedTemps.length) return seasonalBase;

    const body = WATER_BODIES_V2[waterType] || WATER_BODIES_V2.pond;
    const lookback = clamp(body.thermal_lag_days * 2, 4, 10);
    const recentAirMean = average(normalizedTemps.slice(-lookback));
    if (!Number.isFinite(recentAirMean)) return seasonalBase;

    // Seasonal harmonic baseline is still useful as a physics prior, but when we
    // have recent observed air history it should pull the baseline toward reality.
    // This avoids winter cold-bias lock-in after abrupt warmups in shallow water.
    const sampleWeight = clamp((normalizedTemps.length - 2) / 8, 0, 1);
    const waterOffset = waterType === 'pond' ? 1.5 : waterType === 'lake' ? 1.0 : 0.5;
    const historicalProxy = recentAirMean + waterOffset;
    const blendWeight = 0.55 * sampleWeight;
    return (seasonalBase * (1 - blendWeight)) + (historicalProxy * blendWeight);
}

function getThermalInertiaCoefficient(waterType, currentWaterTemp, recentAirAvg) {
    const delta = recentAirAvg - currentWaterTemp;
    const baseInertia = waterType === 'pond' ? 0.15 : waterType === 'lake' ? 0.08 : 0.05;
    const responseFactor = Math.tanh(Math.abs(delta) / 15);
    return baseInertia * responseFactor;
}

function calculateWindMixingEffect(windSpeedMph, waterType, estimatedSurfaceTemp, airTemp, windReductionFactor = null) {
    const body = WATER_BODIES_V2[waterType];
    const reductionFactor = clamp(
        Number.isFinite(windReductionFactor) ? windReductionFactor : (body.wind_reduction_factor ?? 1),
        0,
        1
    );
    const effectiveWindSpeedMph = windSpeedMph * reductionFactor;

    if (effectiveWindSpeedMph > body.mixing_wind_threshold) {
        const tempDifference = estimatedSurfaceTemp - airTemp;
        if (tempDifference > 5) {
            const coolingEffect = -0.4 * (effectiveWindSpeedMph - body.mixing_wind_threshold);
            return Math.max(-3, coolingEffect);
        }
        if (tempDifference < -5) {
            const warmingEffect = 0.2 * (effectiveWindSpeedMph - body.mixing_wind_threshold);
            return Math.min(2, warmingEffect);
        }
    }
    return 0;
}

function getProjectionWindMph(daily, dayIndex, windUnit = '') {
    const meanWind = toWindMph(daily?.wind_speed_10m_mean?.[dayIndex], windUnit);
    if (Number.isFinite(meanWind)) {
        return { windMph: meanWind, source: 'daily.wind_speed_10m_mean' };
    }

    const maxWind = toWindMph(daily?.wind_speed_10m_max?.[dayIndex], windUnit);
    if (Number.isFinite(maxWind)) {
        return {
            windMph: maxWind * WIND_FALLBACK_MAX_REDUCTION,
            source: 'daily.wind_speed_10m_max_scaled'
        };
    }

    return { windMph: 0, source: 'fallback_zero' };
}

function getProjectionWindForMixing(daily, dayIndex, windUnit = '') {
    const base = getProjectionWindMph(daily, dayIndex, windUnit);
    const maxWind = toWindMph(daily?.wind_speed_10m_max?.[dayIndex], windUnit);

    if (!Number.isFinite(maxWind) || !Number.isFinite(base.windMph) || maxWind <= base.windMph) {
        return base;
    }

    const gustStress = (maxWind - base.windMph) * FORECAST_MAX_WIND_GUST_WEIGHT;
    return {
        windMph: base.windMph + gustStress,
        source: `${base.source}+gust_stress`
    };
}

function getWindEstimateMph(historicalWeather) {
    const daily = historicalWeather?.daily || {};
    const forecast = historicalWeather?.forecast || {};
    const warnings = [];

    const dailyMean = average((daily.wind_speed_10m_mean || []).map((value) => normalizeLikelyWindMph(value, 'mph')));
    if (Number.isFinite(dailyMean)) {
        return { windMph: dailyMean, source: 'daily.wind_speed_10m_mean', warnings };
    }

    const hourlyWind = Array.isArray(forecast?.hourly?.wind_speed_10m) ? forecast.hourly.wind_speed_10m : [];
    if (hourlyWind.length > 0) {
        const nowIndex = Number.isFinite(historicalWeather?.meta?.nowHourIndex)
            ? historicalWeather.meta.nowHourIndex
            : Math.max(0, hourlyWind.length - 24);
        const from = clamp(nowIndex - 24, 0, hourlyWind.length - 1);
        const to = clamp(nowIndex + 24, from, hourlyWind.length - 1);
        const windowValues = hourlyWind.slice(from, to + 1).map((value) => normalizeLikelyWindMph(value, 'mph')).filter(Number.isFinite);
        const hourlyAvg = average(windowValues);
        if (Number.isFinite(hourlyAvg)) {
            return { windMph: hourlyAvg, source: 'forecast.hourly.wind_speed_10m', warnings };
        }
    }

    const maxWind = average((daily.wind_speed_10m_max || []).map((value) => normalizeLikelyWindMph(value, 'mph')));
    if (Number.isFinite(maxWind)) {
        warnings.push('Fallback to daily max wind with reduced weight');
        return {
            windMph: maxWind * WIND_FALLBACK_MAX_REDUCTION,
            source: 'daily.wind_speed_10m_max_scaled',
            warnings
        };
    }

    warnings.push('No wind source available; using calm fallback');
    return { windMph: 0, source: 'fallback_zero', warnings };
}

async function getNearbyWaterTempReports(coords, waterType, daysBack = APP_CONSTANTS.WATER_TEMP_REPORT_DAYS_BACK) {
    const allReports = storage.get('waterTempReports') || [];
    if (!Array.isArray(allReports) || allReports.length === 0) {
        debugLog('No local water temp reports available, using physics model');
        return null;
    }

    const normalizedWaterType = normalizeWaterBodyType(waterType);
    const cutoff = new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000));
    const reports = allReports.filter((report) => {
        if (!report || !Number.isFinite(report.latitude) || !Number.isFinite(report.longitude)) return false;
        if (new Date(report.timestamp) < cutoff) return false;
        const distance = calculateDistance(coords.lat, coords.lon, report.latitude, report.longitude);
        if (distance > APP_CONSTANTS.WATER_TEMP_REPORT_RADIUS_MILES) return false;
        return normalizeWaterBodyType(report.waterBody) === normalizedWaterType;
    });

    return reports.length > 0 ? reports : null;
}

function calibrateWithUserData(seasonalBase, userReports, coords, waterType) {
    if (!userReports || userReports.length === 0) return seasonalBase;

    let weightedSum = 0;
    let totalWeight = 0;
    const now = new Date();

    const normalizedWaterType = normalizeWaterBodyType(waterType);

    userReports.forEach(report => {
        const distance = calculateDistance(coords.lat, coords.lon, report.latitude, report.longitude);
        const distanceWeight = 1 / Math.pow(distance + 1, 2);
        const reportDate = new Date(report.timestamp);
        const daysAgo = (now - reportDate) / (1000 * 60 * 60 * 24);
        const recencyWeight = Math.exp(-daysAgo / 3);
        const reportWaterBody = normalizeWaterBodyType(report.waterBody);
        const typeWeight = reportWaterBody === normalizedWaterType ? 1.5 : 1.0;
        const totalReportWeight = distanceWeight * recencyWeight * typeWeight;

        weightedSum += report.temperature * totalReportWeight;
        totalWeight += totalReportWeight;
    });

    if (totalWeight === 0) return seasonalBase;

    const userAverage = weightedSum / totalWeight;
    const reportCount = userReports.length;
    const hasTrustedLocalReports = EXTERNAL_REPORTS_ENABLED
        ? hasTrustedRecentLocalReports(userReports, coords, waterType)
        : false;
    const blendFloor = hasTrustedLocalReports ? 0.58 : 0.2;
    const blendFactor = clamp(Math.min(0.86, reportCount * 0.15), blendFloor, 0.86);
    const calibratedTemp = (userAverage * blendFactor) + (seasonalBase * (1 - blendFactor));

    debugLog(`📊 Using ${reportCount} user reports. Blend: ${(blendFactor * 100).toFixed(0)}% user data, ${((1 - blendFactor) * 100).toFixed(0)}% model`);

    return calibratedTemp;
}

function directGet(source, path) {
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), source);
}

function normalizeEstimatorWeatherPayload(weatherPayload, currentDate = new Date(), { coords = null, waterType = null, context = null } = {}) {
    if (context?.payload) return context.payload;
    const normalizedContext = normalizeWaterTempContext({
        coords,
        waterType,
        timezone: weatherPayload?.meta?.timezone || weatherPayload?.forecast?.timezone || 'UTC',
        weatherPayload,
        nowOverride: currentDate
    });
    return normalizedContext.payload;
}

function resolveWaterTempContext({ coords, waterType, currentDate, weatherPayload, context = null }) {
    if (context?.payload) return context;
    return normalizeWaterTempContext({
        coords,
        waterType,
        timezone: weatherPayload?.meta?.timezone || weatherPayload?.forecast?.timezone || 'UTC',
        weatherPayload,
        nowOverride: currentDate
    });
}

async function computeWaterTempEstimateTerms({ coords, waterType, currentDate, weatherPayload, trace = null, persistMemo = false }) {
    const getValue = (path, fallback = undefined) => {
        const raw = trace ? getField(weatherPayload, path, trace) : directGet(weatherPayload, path);
        return raw ?? fallback;
    };

    const latitude = coords.lat;
    const dayOfYear = getDayOfYear(currentDate);
    const seasonalBaseRaw = getSeasonalBaseTemp(latitude, dayOfYear, waterType);
    const observedCalibration = buildObservedCalibration(coords, waterType, currentDate);
    const userCalibrationApplied = Number.isFinite(observedCalibration?.observedTempF);

    const daily = getValue('historical.daily', {});
    const airTemps = getValue('historical.daily.temperature_2m_mean', []);
    const cloudCover = getValue('historical.daily.cloud_cover_mean', []);
    getValue('historical.daily.wind_speed_10m_mean');
    getValue('historical.daily.wind_speed_10m_max');
    const tempUnit = getValue('meta.units.temp', 'F');
    if (String(tempUnit).toLowerCase().startsWith('c') && String(getValue('meta.units.temp', '')).toLowerCase().startsWith('f')) {
        warnIfUnitMismatch('meta temp_unit is fahrenheit but downstream temp unit hint is Celsius; potential double conversion risk.');
    }

    const seasonalBase = getDataDrivenBaselineTemp({
        seasonalBase: seasonalBaseRaw,
        airTemps,
        waterType,
        tempUnit
    });
    const airInfluence = calculateAirTempInfluence(airTemps, waterType, tempUnit);
    const bodyConfig = WATER_BODIES_V2[waterType] || WATER_BODIES_V2.pond;
    const hourly = getValue('forecast.hourly', {});
    const pressureMixingBoost = getPressureMixingBoost(hourly);
    const windReductionFactor = clamp(Number(bodyConfig?.wind_reduction_factor ?? 1), 0, 1);
    const evaporationMultiplier = clamp(Number(bodyConfig?.evaporation_multiplier ?? 1), 0.5, 1.5);
    const weatherSignals = getWeatherMixingSignals({
        current: getValue('forecast.current', {}),
        hourly,
        nowHourIndex: getValue('meta.nowHourIndex'),
        evaporationMultiplier
    });

    const cloudContext = [...cloudCover];
    if (Number.isFinite(weatherSignals.nearTermCloudMean)) cloudContext.push(weatherSignals.nearTermCloudMean);
    const solarEffect = calculateSolarDeviation(latitude, dayOfYear, cloudContext, waterType) * (1 - weatherSignals.stormSolarDamping);
    const thermalResponse = getThermalInertiaCoefficient(waterType, seasonalBase, airInfluence.average);
    const airEffect = (airInfluence.average - seasonalBase) * thermalResponse;

    const windEstimate = getWindEstimateMph({
        daily,
        forecast: {
            hourly,
            current: getValue('forecast.current', {})
        },
        meta: {
            nowHourIndex: getValue('meta.nowHourIndex')
        }
    });
    const windForcingRaw = windEstimate.windMph + (pressureMixingBoost * 6) + (weatherSignals.stormMixingBoost * 4);
    const windEffect = calculateWindMixingEffect(
        windForcingRaw,
        waterType,
        seasonalBase + solarEffect + airEffect,
        airInfluence.average,
        windReductionFactor
    );

    const evaporationCooling = weatherSignals.evaporationCooling;
    const trendKicker = getSmoothTrendKicker(airInfluence.trend);
    const preCorrection = seasonalBase + solarEffect + airEffect + windEffect + evaporationCooling + trendKicker;
    const coldSeasonCorrected = applyColdSeasonPondCorrection({
        estimatedTemp: preCorrection,
        waterType,
        dayOfYear,
        airInfluence,
        cloudCover
    });
    const correctedNoObserved = applyLivePondColdSeasonGuardrail({
        correctedTemp: coldSeasonCorrected,
        preCorrectionTemp: preCorrection,
        waterType,
        latitude,
        cloudCover,
        nearTermCloudMean: weatherSignals.nearTermCloudMean,
        airTempF: Number.isFinite(getValue('forecast.current.temperature_2m')) ? Number(getValue('forecast.current.temperature_2m')) : airInfluence.average,
        source: String(getValue('meta.source', 'FIXTURE')).toUpperCase()
    });
    const observedAdjustment = applyObservedCalibrationOffset(correctedNoObserved, observedCalibration);
    let estimatedTemp = clamp(observedAdjustment.calibratedTemp, 32, 95);

    const memoEntry = storage.getWaterTempMemoEntry(coords.lat, coords.lon, waterType);
    const memoEstimate = memoEntry?.temp;
    const memoDayKey = memoEntry?.dayKey || null;
    const memoModelVersion = memoEntry?.modelVersion || null;
    const currentDayKey = getLocalDayKey(currentDate, weatherPayload?.meta?.timezone || 'UTC');
    const shouldApplyDailyClamp = Number.isFinite(memoEstimate)
        && memoDayKey === currentDayKey
        && memoModelVersion === WATER_TEMP_MODEL_VERSION;
    const body = WATER_BODIES_V2[waterType];
    let memoClamp = false;
    let dailyDeltaEnvelope = null;

    if (shouldApplyDailyClamp) {
        const dailyLimit = getRelaxedDailyChangeLimit(body.max_daily_change, null, coords);
        const change = estimatedTemp - memoEstimate;
        dailyDeltaEnvelope = { min: memoEstimate - dailyLimit, max: memoEstimate + dailyLimit };
        if (Math.abs(change) > dailyLimit) {
            memoClamp = true;
            estimatedTemp = memoEstimate + (Math.sign(change) * dailyLimit);
        }
    }

    if (persistMemo) {
        storage.setWaterTempMemo(
            coords.lat,
            coords.lon,
            waterType,
            estimatedTemp,
            currentDayKey,
            WATER_TEMP_MODEL_VERSION
        );
    }

    const final = Math.round(estimatedTemp * 10) / 10;
    return {
        seasonalBase,
        seasonalBaseRaw,
        userCalibrationApplied,
        solarEffect,
        airEffect,
        windEffect,
        evaporationCooling,
        synopticEventStrength: null,
        trendKicker,
        coldSeasonPondCorrection: correctedNoObserved - preCorrection,
        observedCalibrationOffset: observedAdjustment.offset,
        clampsApplied: {
            memoClamp,
            dailyDeltaEnvelope,
            physDeltaRange: { min: 32, max: 95 }
        },
        windEstimate,
        weatherSignals,
        breakdownTerms: {
            seasonalBase,
            solarEffect,
            airEffect,
            windEffect,
            evaporationCooling,
            trendKicker,
            coldSeasonPondCorrection: correctedNoObserved - preCorrection,
            observedCalibrationOffset: observedAdjustment.offset
        },
        final
    };
}

// Main water temperature estimation function
export async function estimateWaterTemp(coords, waterType, currentDate, historicalWeather, options = {}) {
    const latitude = coords.lat;
    const dayOfYear = getDayOfYear(currentDate);

    // Unit expectations for model inputs:
    // - air temperature: °F
    // - wind speed: mph
    // - precipitation: inches
    debugLog(`🌡️ Estimating water temp for ${waterType} at ${latitude.toFixed(2)}°N on day ${dayOfYear}`);

    const normalizedContext = resolveWaterTempContext({ coords, waterType, currentDate, weatherPayload: historicalWeather, context: options.context });
    const normalizedPayload = normalizedContext.payload;
    const computed = await computeWaterTempEstimateTerms({
        coords,
        waterType,
        currentDate,
        weatherPayload: normalizedPayload,
        persistMemo: true
    });

    debugLog(`📅 Seasonal baseline: ${computed.seasonalBase.toFixed(1)}°F`);
    if (computed.windEstimate.warnings.length) {
        debugLog('⚠️ Wind estimation notes:', computed.windEstimate.warnings.join('; '));
    }
    debugLog(
        `[water-temp terms] humidity term=${computed.weatherSignals.humidityTerm.toFixed(2)} ` +
        `pressure-slope term=${getPressureMixingBoost(normalizedPayload?.forecast?.hourly || {}).toFixed(2)} precip regime term=${computed.weatherSignals.precipRegimeTerm.toFixed(2)} ` +
        `solar term=${computed.solarEffect.toFixed(2)} wind term=${computed.windEffect.toFixed(2)} ` +
        `observed offset=${computed.observedCalibrationOffset.toFixed(2)}`
    );
    debugLog(`✅ Final water temp estimate: ${computed.final}°F`);

    return computed.final;
}

// Estimate temperature by depth (stratification)
export function estimateTempByDepth(surfaceTemp, waterType, depth_ft, currentDate = new Date()) {
    const body = WATER_BODIES_V2[waterType];
    const month = currentDate.getMonth();

    if (month >= 4 && month <= 8) {
        const thermoclineDepth = body.thermocline_depth;
        if (depth_ft < thermoclineDepth) {
            return Math.max(32, surfaceTemp - (depth_ft * 0.5));
        } if (depth_ft < thermoclineDepth + 10) {
            const thermoclineTemp = surfaceTemp - (thermoclineDepth * 0.5);
            return Math.max(32, thermoclineTemp - ((depth_ft - thermoclineDepth) * 2.0));
        }
        return Math.max(32, body.deep_stable_temp);
    }

    if (month === 2 || month === 3 || month === 9 || month === 10) {
        return Math.max(32, surfaceTemp - (depth_ft * 0.3));
    }

    if (surfaceTemp <= 35) {
        return depth_ft < 5 ? surfaceTemp : 39;
    }
    return Math.max(32, surfaceTemp - (depth_ft * 0.2));
}


function buildObservedPeriodAnchorOffset({
    dailySurfaceTemp,
    waterType,
    context,
    sunriseTime,
    sunsetTime,
    dayKey
}) {
    if (!context?.coords || !context?.timezone || !Number.isFinite(dailySurfaceTemp)) return 0;

    const observed = storage.getWaterTempObserved(context.coords.lat, context.coords.lon, waterType);
    if (!observed || !Number.isFinite(observed.tempF) || typeof observed.timestamp !== 'string') return 0;

    const observedAt = new Date(observed.timestamp);
    if (!Number.isFinite(observedAt.getTime())) return 0;

    const observedDayKey = getLocalDayKey(observedAt, context.timezone);
    if (observedDayKey !== dayKey) return 0;

    const anchorSource = context.hourlyNowTimeISOZ || context.anchorDateISOZ || null;
    const anchorTs = Number.isFinite(parseHourlyTimestamp(anchorSource, context.timezone))
        ? parseHourlyTimestamp(anchorSource, context.timezone)
        : Date.parse(String(context.anchorDateISOZ || ''));
    if (!Number.isFinite(anchorTs)) return 0;

    const ageHours = (anchorTs - observedAt.getTime()) / (1000 * 60 * 60);
    if (!Number.isFinite(ageHours) || ageHours < -0.5 || ageHours > 16) return 0;

    const observedHour = getHourInTimezone(observed.timestamp, context.timezone);
    if (!Number.isFinite(observedHour)) return 0;

    const modeledAtObservedHour = estimateWaterTempByPeriod({
        dailySurfaceTemp,
        waterType,
        context,
        period: 'midday',
        sunriseTime,
        sunsetTime,
        dayKey,
        targetHour: observedHour
    });
    if (!Number.isFinite(modeledAtObservedHour)) return 0;

    const rawOffset = observed.tempF - modeledAtObservedHour;
    const boundedOffset = clamp(rawOffset, -OBSERVED_TEMP_CALIBRATION_MAX_OFFSET_F, OBSERVED_TEMP_CALIBRATION_MAX_OFFSET_F);
    const recencyWeight = clamp(1 - (Math.max(ageHours, 0) / 8), 0, 1);
    return boundedOffset * recencyWeight;
}

export function buildWaterTempView({ dailySurfaceTemp, waterType, context }) {
    const fallback = Number(Math.round((dailySurfaceTemp || 0) * 10) / 10);
    if (!context?.payload) {
        return {
            surfaceNow: fallback,
            sunrise: fallback,
            midday: fallback,
            sunset: fallback,
            depthTemps: {
                sunrise: {
                    temp2ft: estimateTempByDepth(fallback, waterType, 2, new Date()).toFixed(1),
                    temp4ft: estimateTempByDepth(fallback, waterType, 4, new Date()).toFixed(1),
                    temp10ft: estimateTempByDepth(fallback, waterType, 10, new Date()).toFixed(1),
                    temp20ft: estimateTempByDepth(fallback, waterType, 20, new Date()).toFixed(1)
                }
            }
        };
    }

    const timezone = context.timezone || context.payload?.meta?.timezone || 'UTC';
    const daily = context.payload.forecast?.daily || {};
    const dailyTimes = Array.isArray(daily.time) ? daily.time : [];
    const anchorDayKey = getResolvedDayKey(String(context.anchorDateISOZ || ''), timezone)
        || String(context.anchorDateISOZ || '').slice(0, 10);
    const dayIndex = Math.max(0, dailyTimes.findIndex((value) => value === anchorDayKey));
    const sunriseTime = Array.isArray(daily.sunrise) ? (daily.sunrise[dayIndex] || null) : null;
    const sunsetTime = Array.isArray(daily.sunset) ? (daily.sunset[dayIndex] || null) : null;

    const sunrise = estimateWaterTempByPeriod({
        dailySurfaceTemp,
        waterType,
        context,
        period: 'morning',
        sunriseTime,
        sunsetTime,
        dayKey: anchorDayKey
    });
    const midday = estimateWaterTempByPeriod({
        dailySurfaceTemp,
        waterType,
        context,
        period: 'midday',
        sunriseTime,
        sunsetTime,
        dayKey: anchorDayKey
    });
    const sunset = estimateWaterTempByPeriod({
        dailySurfaceTemp,
        waterType,
        context,
        period: 'afternoon',
        sunriseTime,
        sunsetTime,
        dayKey: anchorDayKey
    });

    const observedPeriodOffset = buildObservedPeriodAnchorOffset({
        dailySurfaceTemp,
        waterType,
        context,
        sunriseTime,
        sunsetTime,
        dayKey: anchorDayKey
    });

    const hourIso = context.hourlyNowTimeISOZ || context.anchorDateISOZ;
    const nowHour = getHourInTimezone(hourIso, timezone);
    const surfaceNowRaw = Number.isFinite(nowHour)
        ? estimateWaterTempByPeriod({
            dailySurfaceTemp,
            waterType,
            context,
            period: 'midday',
            sunriseTime,
            sunsetTime,
            dayKey: anchorDayKey,
            targetHour: nowHour
        })
        : fallback;

    // Keep sunrise/midday/sunset tied to the projection model so today's profile
    // remains continuous with yesterday's extended day+1 card. Observed reports
    // can still nudge the "surface now" value without rewriting period anchors.
    const anchorDate = new Date(context.anchorDateISOZ);
    const sunriseAdjusted = clamp(sunrise, 32, 95);
    let middayAdjusted = clamp(midday, 32, 95);
    const sunsetAdjusted = clamp(sunset, 32, 95);
    const surfaceNow = clamp(surfaceNowRaw + observedPeriodOffset, 32, 95);

    if (waterType === 'pond' && Number.isFinite(nowHour)) {
        const middayHour = getPeriodTargetHour('midday', { sunriseTime, sunsetTime });
        const hoursUntilMidday = middayHour - nowHour;
        if (hoursUntilMidday > 0 && hoursUntilMidday <= 2.25 && Number.isFinite(middayAdjusted)) {
            const warmRateCap = getNearTermPondWarmRateCap({ date: anchorDate, dailySurfaceTemp });
            if (Number.isFinite(warmRateCap)) {
                const cappedMidday = surfaceNow + (warmRateCap * hoursUntilMidday);
                middayAdjusted = Math.min(middayAdjusted, clamp(cappedMidday, 32, 95));
            }
        }
    }

    const depthFor = (temp, whenDate) => ({
        temp2ft: estimateTempByDepth(temp, waterType, 2, whenDate).toFixed(1),
        temp4ft: estimateTempByDepth(temp, waterType, 4, whenDate).toFixed(1),
        temp10ft: estimateTempByDepth(temp, waterType, 10, whenDate).toFixed(1),
        temp20ft: estimateTempByDepth(temp, waterType, 20, whenDate).toFixed(1)
    });
    return {
        surfaceNow: Number(surfaceNow.toFixed(1)),
        sunrise: Number(sunriseAdjusted.toFixed(1)),
        midday: Number(middayAdjusted.toFixed(1)),
        sunset: Number(sunsetAdjusted.toFixed(1)),
        depthTemps: {
            sunrise: depthFor(sunriseAdjusted, anchorDate),
            midday: depthFor(middayAdjusted, anchorDate),
            sunset: depthFor(sunsetAdjusted, anchorDate)
        }
    };
}

// Project daily water temperatures using the same primitives as estimateWaterTemp.
// Returns temperatures aligned to forecast.daily arrays:
// temps[0] = modeled today temp from seed + day-0 forcing; temps[1] = tomorrow, etc.
export function projectWaterTemps(initialWaterTemp, forecastData, waterType, latitude, options = {}) {
    const body = WATER_BODIES_V2[waterType];
    const daily = forecastData?.daily || {};
    const timeline = Array.isArray(daily.time) ? daily.time : [];
    const dayCount = timeline.length;

    if (!Number.isFinite(initialWaterTemp) || !body || dayCount === 0) {
        return [];
    }

    const seedTemp = clamp(initialWaterTemp, 32, 95);
    const temps = [];
    const cloudCover = Array.isArray(daily.cloud_cover_mean) ? daily.cloud_cover_mean : [];
    const tempMeans = Array.isArray(daily.temperature_2m_mean) ? daily.temperature_2m_mean : [];
    const tempMins = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
    const tempMaxes = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
    const tempUnit = options.tempUnit || 'F';
    const windUnit = options.windUnit || getForecastWindUnit(forecastData);
    const precipUnit = options.precipUnit || getForecastPrecipUnit(forecastData);
    if (String(options?.tempUnit || '').toLowerCase().startsWith('f') && String(tempUnit).toLowerCase().startsWith('c')) {
        warnIfUnitMismatch('temp_unit says fahrenheit while projection temp unit hint resolved to Celsius; check for C→F double conversion.');
    }
    if (String(options?.windUnit || '').toLowerCase().includes('mph') && !String(windUnit).toLowerCase().includes('mph')) {
        warnIfUnitMismatch('wind_unit says mph but projection wind hint resolved to non-mph units; conversion may be unintended.');
    }
    if (String(options?.precipUnit || '').toLowerCase().includes('inch') && !String(precipUnit).toLowerCase().includes('inch') && String(precipUnit).toLowerCase() !== 'in') {
        warnIfUnitMismatch('precip_unit says inch but projection precip hint resolved to non-inch units; mm→in conversion may be unintended.');
    }
    const pressureMixingBoost = getPressureMixingBoost(forecastData?.hourly || {});
    const hourly = forecastData?.hourly || {};
    const anchorDate = options.context?.anchorDateISOZ
        ? new Date(options.context.anchorDateISOZ)
        : (options.anchorDate instanceof Date ? options.anchorDate : new Date());
    const historicalDaily = options.historicalDaily || {};
    const historicalAirMeans = Array.isArray(historicalDaily.temperature_2m_mean)
        ? historicalDaily.temperature_2m_mean.map((value) => normalizeAirTempToF(value, tempUnit)).filter(Number.isFinite)
        : [];
    const historicalCloudCover = Array.isArray(historicalDaily.cloud_cover_mean)
        ? historicalDaily.cloud_cover_mean.filter(Number.isFinite)
        : [];

    const normalizedAirMeans = tempMeans.map((value) => normalizeAirTempToF(value, tempUnit));

    for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
        const prevTemp = dayIndex === 0 ? seedTemp : temps[dayIndex - 1];
        const meanTempRaw = Number.isFinite(tempMeans[dayIndex])
            ? tempMeans[dayIndex]
            : average([tempMins[dayIndex], tempMaxes[dayIndex]]);
        const airTemp = normalizeAirTempToF(meanTempRaw, tempUnit);

        if (!Number.isFinite(airTemp)) {
            temps.push(prevTemp);
            continue;
        }

        const dayDate = new Date(anchorDate.getTime());
        dayDate.setUTCDate(dayDate.getUTCDate() + dayIndex);
        const dayOfYear = getDayOfYear(dayDate);
        const cloudContext = historicalCloudCover.slice(-6)
            .concat(cloudCover.slice(0, dayIndex + 1).filter(Number.isFinite));
        const windReductionFactor = clamp(Number(body?.wind_reduction_factor ?? 1), 0, 1);
        const evaporationMultiplier = clamp(Number(body?.evaporation_multiplier ?? 1), 0.5, 1.5);
        const weatherSignals = getWeatherMixingSignals({
            current: forecastData?.current || {},
            hourly,
            dayIndex,
            nowHourIndex: forecastData?.meta?.nowHourIndex,
            evaporationMultiplier
        });
        const dayAverages = getDayHourlyAverages(hourly, timeline[dayIndex]);
        const dailyEvapCooling = calculateEvaporativeCoolingProxy({
            relativeHumidity: dayAverages.humidity,
            windMph: dayAverages.wind,
            evaporationMultiplier
        });
        if (Number.isFinite(weatherSignals.nearTermCloudMean)) cloudContext.push(weatherSignals.nearTermCloudMean);
        const solarEffect = calculateSolarDeviation(latitude, dayOfYear, cloudContext, waterType) * (1 - weatherSignals.stormSolarDamping);

        const thermalResponse = getThermalInertiaCoefficient(waterType, prevTemp, airTemp);
        const thermalEffect = (airTemp - prevTemp) * thermalResponse;

        const trendSeries = historicalAirMeans.slice(-2).concat(normalizedAirMeans.slice(0, dayIndex + 1));
        const trendWindow = trendSeries.slice(-4).filter(Number.isFinite);
        let trendFPerDay = 0;
        if (trendWindow.length >= 2) {
            trendFPerDay = (trendWindow[trendWindow.length - 1] - trendWindow[0]) / (trendWindow.length - 1);
        }

        const prevAirTemp = trendWindow.length > 1 ? trendWindow[trendWindow.length - 2] : null;
        const windEstimate = getProjectionWindForMixing(daily, dayIndex, windUnit);
        const synopticEventStrength = getSynopticEventStrength(
            daily,
            dayIndex,
            prevAirTemp,
            airTemp,
            (windEstimate.windMph + (pressureMixingBoost * 6) + (weatherSignals.stormMixingBoost * 4)) * windReductionFactor,
            precipUnit
        );
        const trendGain = getWaterTypeTrendGain(waterType, synopticEventStrength);
        const trendRaw = getSmoothTrendKicker(trendFPerDay) * trendGain;
        const trendLimit = getTrendKickerLimit(waterType, synopticEventStrength);
        const trendKicker = clamp(trendRaw, -trendLimit, trendLimit);

        const windForcingRaw = windEstimate.windMph + (pressureMixingBoost * 6) + (weatherSignals.stormMixingBoost * 4);
        const windEffect = calculateWindMixingEffect(
            windForcingRaw,
            waterType,
            prevTemp + thermalEffect + solarEffect,
            airTemp,
            windReductionFactor
        );

        let projectedTemp = prevTemp + thermalEffect + solarEffect + windEffect + trendKicker + weatherSignals.evaporationCooling + dailyEvapCooling;

        const physicalDeltaRange = getPhysicallyBoundedDeltaRange({
            waterType,
            prevTemp,
            airTemp,
            prevAirTemp,
            synopticEventStrength
        });

        const seasonalBaseline = getSeasonalBaseTemp(latitude, dayOfYear, waterType);
        if (dayIndex >= 4) {
            const baseReversionWeight = clamp((dayIndex - 3) * 0.08, 0, 0.25);
            const reversionWeight = baseReversionWeight * (1 - (0.7 * synopticEventStrength));
            projectedTemp = (projectedTemp * (1 - reversionWeight)) + (seasonalBaseline * reversionWeight);
        }

        const unconstrainedDelta = projectedTemp - prevTemp;
        const dailyDeltaLimit = getDailyDeltaEnvelope(waterType, synopticEventStrength);
        const envelopeClampedDelta = clamp(unconstrainedDelta, -dailyDeltaLimit, dailyDeltaLimit);
        const dailyDelta = clamp(envelopeClampedDelta, physicalDeltaRange.minDelta, physicalDeltaRange.maxDelta);
        projectedTemp = clamp(prevTemp + dailyDelta, 32, 95);

        if (options.debug === true) {
            debugLog(
                `[FishCast][waterTempProjection] day=${dayIndex} air=${airTemp.toFixed(1)} ` +
                `thermal=${thermalEffect.toFixed(2)} solar=${solarEffect.toFixed(2)} ` +
                `wind=${windEffect.toFixed(2)} trend=${trendKicker.toFixed(2)} ` +
                `humidity term=${weatherSignals.humidityTerm.toFixed(2)} pressure-slope term=${pressureMixingBoost.toFixed(2)} ` +
                `precip regime term=${weatherSignals.precipRegimeTerm.toFixed(2)} ` +
                `event=${synopticEventStrength.toFixed(2)} windSource=${windEstimate.source} ` +
                `delta=${dailyDelta.toFixed(2)} rawDelta=${unconstrainedDelta.toFixed(2)} evap=${dailyEvapCooling.toFixed(2)} final=${projectedTemp.toFixed(1)}`
            );
        }

        temps.push(projectedTemp);
    }

    return temps;
}

// Estimate morning/midday/afternoon water temperatures from a daily surface estimate.
// Useful for shallow systems where intraday heating/cooling can exceed ±2-4°F.
export function estimateWaterTempByPeriod({
    dailySurfaceTemp,
    waterType,
    hourly,
    timezone = 'UTC',
    date = new Date(),
    period = 'midday',
    sunriseTime = null,
    sunsetTime = null,
    context = null,
    dayKey = null,
    targetHour = null
}) {
    if (!Number.isFinite(dailySurfaceTemp)) return null;

    const hourlySource = context?.payload?.forecast?.hourly || hourly || {};
    const hourlyTimes = Array.isArray(hourlySource?.time) ? hourlySource.time : [];
    const hourlyAir = Array.isArray(hourlySource?.temperature_2m) ? hourlySource.temperature_2m : [];
    const hourlyCloud = Array.isArray(hourlySource?.cloud_cover) ? hourlySource.cloud_cover : [];
    const hourlyWind = Array.isArray(hourlySource?.wind_speed_10m) ? hourlySource.wind_speed_10m : [];
    const hourlyShortwave = Array.isArray(hourlySource?.shortwave_radiation) ? hourlySource.shortwave_radiation : [];

    if (!hourlyTimes.length || !hourlyAir.length) {
        return Math.round(dailySurfaceTemp * 10) / 10;
    }

    const periodHour = Number.isFinite(targetHour) ? targetHour : getPeriodTargetHour(period, { sunriseTime, sunsetTime });
    const resolvedTimezone = context?.timezone || timezone || 'UTC';
    const fallbackDateKey = typeof dayKey === 'string' && dayKey
        ? dayKey
        : getResolvedDayKey(
            context?.anchorDateISOZ || (date instanceof Date ? date.toISOString() : new Date(date).toISOString()),
            resolvedTimezone
        );

    const dayIndices = hourlyTimes
        .map((timeValue, index) => {
            const hourIso = String(timeValue || '');
            const hourKey = getResolvedDayKey(hourIso, resolvedTimezone) || hourIso.slice(0, 10);
            const hour = getHourInTimezone(hourIso, resolvedTimezone);
            return { index, hourKey, hour };
        })
        .filter((entry) => entry.hourKey === fallbackDateKey);

    if (!dayIndices.length) {
        return Math.round(dailySurfaceTemp * 10) / 10;
    }

    const airSeries = dayIndices
        .map(({ index }) => normalizeAirTempToF(hourlyAir[index], 'F'))
        .filter(Number.isFinite);
    const windSeries = dayIndices
        .map(({ index }) => normalizeLikelyWindMph(hourlyWind[index], 'mph'))
        .filter(Number.isFinite);
    const cloudSeries = dayIndices
        .map(({ index }) => hourlyCloud[index])
        .filter(Number.isFinite);
    const shortwaveSeries = dayIndices
        .map(({ index }) => Number(hourlyShortwave[index]))
        .filter(Number.isFinite);

    if (!airSeries.length) {
        return Math.round(dailySurfaceTemp * 10) / 10;
    }

    const targetEntry = dayIndices.reduce((best, entry) => {
        if (!best) return entry;
        const currentDelta = Math.abs(entry.hour - periodHour);
        const bestDelta = Math.abs(best.hour - periodHour);
        return currentDelta < bestDelta ? entry : best;
    }, null);
    const targetIndex = targetEntry?.index ?? -1;
    const targetAir = normalizeAirTempToF(hourlyAir[targetIndex], 'F');
    const dailyAirMean = average(airSeries) || targetAir || 0;
    const dailyAirRange = Math.max(...airSeries) - Math.min(...airSeries);
    const cloudMean = average(cloudSeries) || 50;
    const windMean = average(windSeries) || 0;
    const response = getDiurnalResponseByWaterType(waterType);

    const sunriseHour = parseHourFromTimestamp(sunriseTime);
    const sunsetHour = parseHourFromTimestamp(sunsetTime);
    const daylightHours = Number.isFinite(sunriseHour) && Number.isFinite(sunsetHour) && sunsetHour > sunriseHour
        ? sunsetHour - sunriseHour
        : 12;
    const normalizedHour = Number.isFinite(sunriseHour)
        ? clamp((periodHour - sunriseHour) / daylightHours, 0, 1)
        : clamp((periodHour - 6) / 12, 0, 1);
    const solarPhase = Math.sin(Math.PI * normalizedHour);
    const targetCloud = Number.isFinite(hourlyCloud[targetIndex]) ? hourlyCloud[targetIndex] : cloudMean;
    const cloudBlend = (cloudMean * 0.45) + (targetCloud * 0.55);
    const cloudDamping = clamp(1 - ((cloudBlend / 100) * 0.82), 0.12, 1);
    const targetWind = normalizeLikelyWindMph(hourlyWind[targetIndex], 'mph');
    const windBlend = Number.isFinite(targetWind)
        ? ((windMean * 0.4) + (targetWind * 0.6))
        : windMean;
    const windDamping = clamp(1 - (windBlend * response.windDamping), 0.5, 1);

    const solarTerm = dailyAirRange * response.solarGain * solarPhase * cloudDamping * windDamping;
    const airAnomalyTerm = Number.isFinite(targetAir)
        ? (targetAir - dailyAirMean) * response.airCoupling * windDamping
        : 0;

    const targetShortwave = Number(hourlyShortwave[targetIndex]);
    const shortwaveTerm = shortwaveSeries.length && Number.isFinite(targetShortwave)
        ? clamp((targetShortwave - (average(shortwaveSeries) || 0)) / 350, -1.2, 1.2) * response.shortwaveCoupling * windDamping
        : 0;
    const adjustmentLimit = getDiurnalAdjustmentLimit(waterType, {
        dailyAirRange,
        cloudBlend,
        windBlend,
        targetShortwave
    });
    let totalAdjustment = clamp(solarTerm + airAnomalyTerm + shortwaveTerm, -adjustmentLimit, adjustmentLimit);

    if (waterType === 'pond' && totalAdjustment > 3.2) {
        const coldSeasonWarmCap = getColdSeasonPondDiurnalWarmCap({
            date: date instanceof Date ? date : new Date(date),
            dailySurfaceTemp,
            targetAir,
            cloudBlend,
            windBlend,
            targetShortwave
        });
        if (Number.isFinite(coldSeasonWarmCap)) {
            totalAdjustment = Math.min(totalAdjustment, coldSeasonWarmCap);
        }
    }

    if (waterType === 'pond' && totalAdjustment > 0) {
        const moderateAirCap = getColdSeasonModerateAirPondCap({
            date: date instanceof Date ? date : new Date(date),
            dailySurfaceTemp,
            targetAir,
            cloudBlend,
            windBlend,
            period
        });
        if (Number.isFinite(moderateAirCap)) {
            totalAdjustment = Math.min(totalAdjustment, moderateAirCap);
        }
    }

    if (waterType === 'pond' && period === 'morning') {
        const windyMorning = windMean >= 10;
        const heavyCloudMorning = cloudBlend >= 80;
        const strongCoolingFloor = (windyMorning || heavyCloudMorning) ? -2.4 : -1.5;
        totalAdjustment = Math.max(totalAdjustment, strongCoolingFloor);
    }

    return Math.round(clamp(dailySurfaceTemp + totalAdjustment, 32, 95) * 10) / 10;
}


function collectUsedFieldPrefixes(trace) {
    const prefixes = new Set();
    [...trace].forEach((path) => {
        const parts = path.split('.');
        const root = parts.slice(0, 3).join('.');
        if (root.startsWith('forecast.') || root.startsWith('historical.')) {
            prefixes.add(root.replace(/\[\d+\]/g, ''));
        }
    });
    return [...prefixes].sort();
}

export async function explainWaterTempTerms({ coords, waterType, date, weatherPayload, context = null }) {
    const trace = new Set();
    const normalizedPayload = normalizeEstimatorWeatherPayload(weatherPayload, date, { coords, waterType, context });
    const computed = await computeWaterTempEstimateTerms({
        coords,
        waterType,
        currentDate: date,
        weatherPayload: normalizedPayload,
        trace
    });

    return {
        ...computed,
        usedFields: {
            exact: [...trace].sort(),
            prefixes: collectUsedFieldPrefixes(trace)
        }
    };
}

export function explainWaterTempProjectionDay({ initialWaterTemp, forecastData, waterType, latitude, dayIndex, options = {} }) {
    const trace = new Set();
    const traced = { forecast: forecastData, historical: { daily: options.historicalDaily || {} } };
    const daily = getField(traced, 'forecast.daily', trace) || {};
    const timeline = getField(traced, 'forecast.daily.time', trace) || [];
    if (!Number.isFinite(initialWaterTemp) || !timeline.length || dayIndex < 1 || dayIndex >= timeline.length) {
        return null;
    }

    const tempUnit = options.tempUnit || 'F';
    const windUnit = options.windUnit || getForecastWindUnit(forecastData);
    const precipUnit = options.precipUnit || getForecastPrecipUnit(forecastData);
    if (String(options?.tempUnit || '').toLowerCase().startsWith('f') && String(tempUnit).toLowerCase().startsWith('c')) {
        warnIfUnitMismatch('temp_unit says fahrenheit while projection temp unit hint resolved to Celsius; check for C→F double conversion.');
    }
    if (String(options?.windUnit || '').toLowerCase().includes('mph') && !String(windUnit).toLowerCase().includes('mph')) {
        warnIfUnitMismatch('wind_unit says mph but projection wind hint resolved to non-mph units; conversion may be unintended.');
    }
    if (String(options?.precipUnit || '').toLowerCase().includes('inch') && !String(precipUnit).toLowerCase().includes('inch') && String(precipUnit).toLowerCase() !== 'in') {
        warnIfUnitMismatch('precip_unit says inch but projection precip hint resolved to non-inch units; mm→in conversion may be unintended.');
    }
    const hourly = getField(traced, 'forecast.hourly', trace) || {};
    const historicalDaily = options.historicalDaily || {};
    const body = WATER_BODIES_V2[waterType] || WATER_BODIES_V2.pond;
    const windReductionFactor = clamp(Number(body?.wind_reduction_factor ?? 1), 0, 1);
    const evaporationMultiplier = clamp(Number(body?.evaporation_multiplier ?? 1), 0.5, 1.5);

    const projected = projectWaterTemps(initialWaterTemp, forecastData, waterType, latitude, options);
    const prevTemp = projected[dayIndex - 1];
    const final = projected[dayIndex];

    const tempMeans = getField(traced, 'forecast.daily.temperature_2m_mean', trace) || [];
    const tempMins = getField(traced, 'forecast.daily.temperature_2m_min', trace) || [];
    const tempMaxes = getField(traced, 'forecast.daily.temperature_2m_max', trace) || [];
    const cloudCover = getField(traced, 'forecast.daily.cloud_cover_mean', trace) || [];
    getField(traced, 'forecast.daily.precipitation_sum', trace);
    getField(traced, 'forecast.daily.precipitation_probability_max', trace);
    getField(traced, 'forecast.daily.wind_speed_10m_mean', trace);
    getField(traced, 'forecast.daily.wind_speed_10m_max', trace);
    getField(traced, 'forecast.current.precipitation', trace);
    getField(traced, 'forecast.current.relative_humidity_2m', trace);
    getField(traced, 'forecast.current.wind_speed_10m', trace);
    getField(traced, 'forecast.current.weather_code', trace);
    const meanTempRaw = Number.isFinite(tempMeans[dayIndex]) ? tempMeans[dayIndex] : average([tempMins[dayIndex], tempMaxes[dayIndex]]);
    const airTemp = normalizeAirTempToF(meanTempRaw, tempUnit);

    const anchorDate = options.context?.anchorDateISOZ
        ? new Date(options.context.anchorDateISOZ)
        : (options.anchorDate instanceof Date ? options.anchorDate : new Date());
    const dayDate = new Date(anchorDate.getTime());
    dayDate.setUTCDate(dayDate.getUTCDate() + dayIndex);
    const dayOfYear = getDayOfYear(dayDate);
    const historicalCloudCover = Array.isArray(historicalDaily.cloud_cover_mean) ? historicalDaily.cloud_cover_mean.filter(Number.isFinite) : [];
    const cloudContext = historicalCloudCover.slice(-6).concat(cloudCover.slice(0, dayIndex + 1).filter(Number.isFinite));

    const weatherSignals = getWeatherMixingSignals({
        current: getField(traced, 'forecast.current', trace) || {},
        hourly,
        dayIndex,
        nowHourIndex: getField(traced, 'forecast.meta.nowHourIndex', trace),
        evaporationMultiplier
    });
    const dayAverages = getDayHourlyAverages(hourly, timeline[dayIndex]);
    const evaporationCooling = weatherSignals.evaporationCooling + calculateEvaporativeCoolingProxy({
        relativeHumidity: dayAverages.humidity,
        windMph: dayAverages.wind,
        evaporationMultiplier
    });
    if (Number.isFinite(weatherSignals.nearTermCloudMean)) cloudContext.push(weatherSignals.nearTermCloudMean);

    const solarEffect = calculateSolarDeviation(latitude, dayOfYear, cloudContext, waterType) * (1 - weatherSignals.stormSolarDamping);
    const thermalResponse = getThermalInertiaCoefficient(waterType, prevTemp, airTemp);
    const airEffect = (airTemp - prevTemp) * thermalResponse;

    const historicalAirMeans = Array.isArray(historicalDaily.temperature_2m_mean)
        ? historicalDaily.temperature_2m_mean.map((v) => normalizeAirTempToF(v, tempUnit)).filter(Number.isFinite)
        : [];
    const normalizedAirMeans = tempMeans.map((v) => normalizeAirTempToF(v, tempUnit));
    const trendSeries = historicalAirMeans.slice(-2).concat(normalizedAirMeans.slice(0, dayIndex + 1));
    const trendWindow = trendSeries.slice(-4).filter(Number.isFinite);
    const trendFPerDay = trendWindow.length >= 2 ? (trendWindow[trendWindow.length - 1] - trendWindow[0]) / (trendWindow.length - 1) : 0;
    const prevAirTemp = trendWindow.length > 1 ? trendWindow[trendWindow.length - 2] : null;

    const pressureMixingBoost = getPressureMixingBoost(hourly);
    const windEstimate = getProjectionWindForMixing(daily, dayIndex, windUnit);
    const windForcingRaw = windEstimate.windMph + (pressureMixingBoost * 6) + (weatherSignals.stormMixingBoost * 4);
    const synopticEventStrength = getSynopticEventStrength(daily, dayIndex, prevAirTemp, airTemp, windForcingRaw * windReductionFactor, precipUnit);

    const trendGain = getWaterTypeTrendGain(waterType, synopticEventStrength);
    const trendRaw = getSmoothTrendKicker(trendFPerDay) * trendGain;
    const trendKicker = clamp(trendRaw, -getTrendKickerLimit(waterType, synopticEventStrength), getTrendKickerLimit(waterType, synopticEventStrength));
    const windEffect = calculateWindMixingEffect(windForcingRaw, waterType, prevTemp + airEffect + solarEffect, airTemp, windReductionFactor);

    const unconstrained = prevTemp + airEffect + solarEffect + windEffect + trendKicker + evaporationCooling;
    const unconstrainedDelta = unconstrained - prevTemp;
    const dailyDeltaEnvelope = getDailyDeltaEnvelope(waterType, synopticEventStrength);
    const physDeltaRange = getPhysicallyBoundedDeltaRange({ waterType, prevTemp, airTemp, prevAirTemp, synopticEventStrength });

    return {
        seasonalBase: getSeasonalBaseTemp(latitude, dayOfYear, waterType),
        userCalibrationApplied: false,
        solarEffect,
        airEffect,
        windEffect,
        evaporationCooling,
        synopticEventStrength,
        trendKicker,
        coldSeasonPondCorrection: 0,
        clampsApplied: {
            memoClamp: false,
            dailyDeltaEnvelope,
            physDeltaRange
        },
        final,
        usedFields: {
            exact: [...trace].sort(),
            prefixes: collectUsedFieldPrefixes(trace)
        }
    };
}

// Get complete temperature profile
export async function getWaterTempProfile(coords, waterType, currentDate, historicalWeather) {
    const surfaceTemp = await estimateWaterTemp(coords, waterType, currentDate, historicalWeather);
    const depths = [0, 5, 10, 15, 20, 25, 30];
    const profile = depths.map(depth => ({
        depth,
        temperature: depth === 0 ? surfaceTemp : estimateTempByDepth(surfaceTemp, waterType, depth, currentDate)
    }));

    return {
        surface: surfaceTemp,
        profile,
        thermocline: WATER_BODIES_V2[waterType].thermocline_depth
    };
}
