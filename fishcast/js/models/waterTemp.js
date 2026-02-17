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

const debugLog = createLogger('water-temp');

const WIND_FALLBACK_MAX_REDUCTION = 0.6;
const FORECAST_MAX_WIND_GUST_WEIGHT = 0.2;
const EXTERNAL_REPORTS_ENABLED = false;
export const WATER_TEMP_MODEL_VERSION = '2.3.1';

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getLocalDayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

function getDiurnalResponseByWaterType(waterType) {
    if (waterType === 'pond') {
        return {
            // Tuned against Tupelo field observations. Pond intraday swings should
            // respond to clear/calm conditions, but earlier weights over-reacted and
            // produced +5°F to +7°F offsets versus reported surface checks.
            solarGain: 0.19,
            airCoupling: 0.11,
            windDamping: 0.035
        };
    }
    if (waterType === 'lake') {
        return {
            solarGain: 0.2,
            airCoupling: 0.18,
            windDamping: 0.02
        };
    }
    return {
        solarGain: 0.14,
        airCoupling: 0.12,
        windDamping: 0.015
    };
}

function getDiurnalAdjustmentLimit(waterType) {
    if (waterType === 'pond') return 4.6;
    if (waterType === 'lake') return 2.3;
    return 1.8;
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

function getPeriodTargetHour(period, { sunriseTime, sunsetTime } = {}) {
    if (period === 'morning') {
        const sunriseHour = parseHourFromTimestamp(sunriseTime);
        return Number.isFinite(sunriseHour) ? sunriseHour : 9;
    }
    if (period === 'afternoon') {
        const sunsetHour = parseHourFromTimestamp(sunsetTime);
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

function normalizeLikelyWindMph(value) {
    if (!Number.isFinite(value)) return null;
    if (value > 130 || value < 0) return null;
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

function calculateEvaporativeCoolingProxy({ relativeHumidity, windMph }) {
    const humidity = Number(relativeHumidity);
    const wind = Number(windMph);
    const humidityDeficit = Number.isFinite(humidity) ? clamp((78 - humidity) / 48, 0, 1) : 0;
    const breezeSignal = Number.isFinite(wind) ? clamp(wind / 18, 0, 1) : 0;

    // Clamp to <= 1.0°F/day cooling contribution.
    return -clamp(humidityDeficit * breezeSignal, 0, 1);
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

function getWeatherMixingSignals({ current = {}, hourly = {}, dayIndex = 0, nowHourIndex = null }) {
    const humidity = Number(current.relative_humidity_2m);
    const airTempF = Number(current.temperature_2m);
    const windMph = Number(current.wind_speed_10m);
    const weatherCode = Number(current.weather_code);
    const precipNowIn = Number(current.precipitation);

    const humidityTerm = Number.isFinite(humidity) ? clamp((70 - humidity) / 55, 0, 1) : 0;
    const windTerm = Number.isFinite(windMph) ? clamp(windMph / 20, 0, 1) : 0;
    const evaporationCooling = calculateEvaporativeCoolingProxy({
        relativeHumidity: humidity,
        windMph
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

    const correction = seasonFactor * ((1.8 * coolAirSignal) + (2.6 * overcastSignal * (0.35 + (0.65 * coolAirSignal))));
    return estimatedTemp - correction;
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
    return cloudDeviation * 0.08 * seasonalInsolationFactor * waterTypeSensitivity;
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

function getThermalInertiaCoefficient(waterType, currentWaterTemp, recentAirAvg) {
    const delta = recentAirAvg - currentWaterTemp;
    const baseInertia = waterType === 'pond' ? 0.15 : waterType === 'lake' ? 0.08 : 0.05;
    const responseFactor = Math.tanh(Math.abs(delta) / 15);
    return baseInertia * responseFactor;
}

function calculateWindMixingEffect(windSpeedMph, waterType, estimatedSurfaceTemp, airTemp) {
    const body = WATER_BODIES_V2[waterType];
    if (windSpeedMph > body.mixing_wind_threshold) {
        const tempDifference = estimatedSurfaceTemp - airTemp;
        if (tempDifference > 5) {
            const coolingEffect = -0.4 * (windSpeedMph - body.mixing_wind_threshold);
            return Math.max(-3, coolingEffect);
        }
        if (tempDifference < -5) {
            const warmingEffect = 0.2 * (windSpeedMph - body.mixing_wind_threshold);
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

    const dailyMean = average((daily.wind_speed_10m_mean || []).map(normalizeLikelyWindMph));
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
        const windowValues = hourlyWind.slice(from, to + 1).map(normalizeLikelyWindMph).filter(Number.isFinite);
        const hourlyAvg = average(windowValues);
        if (Number.isFinite(hourlyAvg)) {
            return { windMph: hourlyAvg, source: 'forecast.hourly.wind_speed_10m', warnings };
        }
    }

    const maxWind = average((daily.wind_speed_10m_max || []).map(normalizeLikelyWindMph));
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

// Main water temperature estimation function
export async function estimateWaterTemp(coords, waterType, currentDate, historicalWeather) {
    const latitude = coords.lat;
    const dayOfYear = getDayOfYear(currentDate);

    // Unit expectations for model inputs:
    // - air temperature: °F
    // - wind speed: mph
    // - precipitation: inches
    debugLog(`🌡️ Estimating water temp for ${waterType} at ${latitude.toFixed(2)}°N on day ${dayOfYear}`);

    const seasonalBase = getSeasonalBaseTemp(latitude, dayOfYear, waterType);
    debugLog(`📅 Seasonal baseline: ${seasonalBase.toFixed(1)}°F`);

    const userReports = EXTERNAL_REPORTS_ENABLED
        ? await getNearbyWaterTempReports(coords, waterType)
        : null;
    let calibratedBase = seasonalBase;

    if (EXTERNAL_REPORTS_ENABLED && userReports && userReports.length > 0) {
        calibratedBase = calibrateWithUserData(seasonalBase, userReports, coords, waterType);
        debugLog(`👥 Calibrated with user data: ${calibratedBase.toFixed(1)}°F`);
    }

    const daily = historicalWeather?.daily || {};
    const airTemps = daily.temperature_2m_mean || [];
    const cloudCover = daily.cloud_cover_mean || [];

    const tempUnit = historicalWeather?.meta?.units?.temp || 'F';
    const airInfluence = calculateAirTempInfluence(airTemps, waterType, tempUnit);
    const hourly = historicalWeather?.forecast?.hourly || {};
    const pressureMixingBoost = getPressureMixingBoost(hourly);
    const weatherSignals = getWeatherMixingSignals({
        current: historicalWeather?.forecast?.current || {},
        hourly,
        nowHourIndex: historicalWeather?.meta?.nowHourIndex
    });
    const cloudContext = [...cloudCover];
    if (Number.isFinite(weatherSignals.nearTermCloudMean)) cloudContext.push(weatherSignals.nearTermCloudMean);
    const solarEffect = calculateSolarDeviation(latitude, dayOfYear, cloudContext, waterType) * (1 - weatherSignals.stormSolarDamping);
    const thermalResponse = getThermalInertiaCoefficient(waterType, calibratedBase, airInfluence.average);
    const airDelta = airInfluence.average - calibratedBase;
    const airEffect = airDelta * thermalResponse;

    const windEstimate = getWindEstimateMph(historicalWeather);
    const windEffect = calculateWindMixingEffect(
        windEstimate.windMph + (pressureMixingBoost * 6) + (weatherSignals.stormMixingBoost * 4),
        waterType,
        calibratedBase + solarEffect + airEffect,
        airInfluence.average
    );

    let estimatedTemp = calibratedBase + solarEffect + airEffect + windEffect + weatherSignals.evaporationCooling;
    estimatedTemp += getSmoothTrendKicker(airInfluence.trend);
    estimatedTemp = applyColdSeasonPondCorrection({
        estimatedTemp,
        waterType,
        dayOfYear,
        airInfluence,
        cloudCover
    });

    const body = WATER_BODIES_V2[waterType];
    estimatedTemp = clamp(estimatedTemp, 32, 95);

    const memoEntry = storage.getWaterTempMemoEntry(coords.lat, coords.lon, waterType);
    const memoEstimate = memoEntry?.temp;
    const memoDayKey = memoEntry?.dayKey || null;
    const memoModelVersion = memoEntry?.modelVersion || null;
    const currentDayKey = getLocalDayKey(currentDate);
    const hasTrustedLocalReports = EXTERNAL_REPORTS_ENABLED
        ? hasTrustedRecentLocalReports(userReports, coords, waterType)
        : false;
    const shouldApplyDailyClamp = Number.isFinite(memoEstimate)
        && memoDayKey === currentDayKey
        && memoModelVersion === WATER_TEMP_MODEL_VERSION;

    if (shouldApplyDailyClamp && !hasTrustedLocalReports) {
        const dailyLimit = getRelaxedDailyChangeLimit(body.max_daily_change, userReports, coords);
        const change = estimatedTemp - memoEstimate;
        if (Math.abs(change) > dailyLimit) {
            estimatedTemp = memoEstimate + (Math.sign(change) * dailyLimit);
        }
    }

    storage.setWaterTempMemo(
        coords.lat,
        coords.lon,
        waterType,
        estimatedTemp,
        currentDayKey,
        WATER_TEMP_MODEL_VERSION
    );

    const finalTemp = Math.round(estimatedTemp * 10) / 10;
    if (windEstimate.warnings.length) {
        debugLog('⚠️ Wind estimation notes:', windEstimate.warnings.join('; '));
    }
    debugLog(
        `[water-temp terms] humidity term=${weatherSignals.humidityTerm.toFixed(2)} ` +
        `pressure-slope term=${pressureMixingBoost.toFixed(2)} precip regime term=${weatherSignals.precipRegimeTerm.toFixed(2)} ` +
        `solar term=${solarEffect.toFixed(2)} wind term=${windEffect.toFixed(2)}`
    );
    debugLog(`✅ Final water temp estimate: ${finalTemp}°F`);

    return finalTemp;
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

// Project daily water temperatures using the same primitives as estimateWaterTemp.
// Returns temperatures aligned to forecast.daily arrays:
// temps[0] = anchored current/"today" temp, temps[1] = tomorrow using daily[1] forcing, etc.
export function projectWaterTemps(initialWaterTemp, forecastData, waterType, latitude, options = {}) {
    const body = WATER_BODIES_V2[waterType];
    const daily = forecastData?.daily || {};
    const timeline = Array.isArray(daily.time) ? daily.time : [];
    const dayCount = timeline.length;

    if (!Number.isFinite(initialWaterTemp) || !body || dayCount === 0) {
        return [];
    }

    const temps = [clamp(initialWaterTemp, 32, 95)];
    const cloudCover = Array.isArray(daily.cloud_cover_mean) ? daily.cloud_cover_mean : [];
    const tempMeans = Array.isArray(daily.temperature_2m_mean) ? daily.temperature_2m_mean : [];
    const tempMins = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
    const tempMaxes = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
    const tempUnit = options.tempUnit || 'F';
    const windUnit = options.windUnit || getForecastWindUnit(forecastData);
    const precipUnit = options.precipUnit || getForecastPrecipUnit(forecastData);
    const pressureMixingBoost = getPressureMixingBoost(forecastData?.hourly || {});
    const hourly = forecastData?.hourly || {};
    const anchorDate = options.anchorDate instanceof Date ? options.anchorDate : new Date();
    const historicalDaily = options.historicalDaily || {};
    const historicalAirMeans = Array.isArray(historicalDaily.temperature_2m_mean)
        ? historicalDaily.temperature_2m_mean.map((value) => normalizeAirTempToF(value, tempUnit)).filter(Number.isFinite)
        : [];
    const historicalCloudCover = Array.isArray(historicalDaily.cloud_cover_mean)
        ? historicalDaily.cloud_cover_mean.filter(Number.isFinite)
        : [];

    const normalizedAirMeans = tempMeans.map((value) => normalizeAirTempToF(value, tempUnit));

    for (let dayIndex = 1; dayIndex < dayCount; dayIndex++) {
        const prevTemp = temps[dayIndex - 1];
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
        const weatherSignals = getWeatherMixingSignals({
            current: forecastData?.current || {},
            hourly,
            dayIndex,
            nowHourIndex: forecastData?.meta?.nowHourIndex
        });
        const dayAverages = getDayHourlyAverages(hourly, timeline[dayIndex]);
        const dailyEvapCooling = calculateEvaporativeCoolingProxy({
            relativeHumidity: dayAverages.humidity,
            windMph: dayAverages.wind
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
            windEstimate.windMph + (pressureMixingBoost * 6) + (weatherSignals.stormMixingBoost * 4),
            precipUnit
        );
        const trendGain = getWaterTypeTrendGain(waterType, synopticEventStrength);
        const trendRaw = getSmoothTrendKicker(trendFPerDay) * trendGain;
        const trendLimit = getTrendKickerLimit(waterType, synopticEventStrength);
        const trendKicker = clamp(trendRaw, -trendLimit, trendLimit);

        const windEffect = calculateWindMixingEffect(
            windEstimate.windMph + (pressureMixingBoost * 6) + (weatherSignals.stormMixingBoost * 4),
            waterType,
            prevTemp + thermalEffect + solarEffect,
            airTemp
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
    timezone = 'America/Chicago',
    date = new Date(),
    period = 'midday',
    sunriseTime = null,
    sunsetTime = null
}) {
    if (!Number.isFinite(dailySurfaceTemp)) return null;

    const hourlyTimes = Array.isArray(hourly?.time) ? hourly.time : [];
    const hourlyAir = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m : [];
    const hourlyCloud = Array.isArray(hourly?.cloud_cover) ? hourly.cloud_cover : [];
    const hourlyWind = Array.isArray(hourly?.wind_speed_10m) ? hourly.wind_speed_10m : [];

    if (!hourlyTimes.length || !hourlyAir.length) {
        return Math.round(dailySurfaceTemp * 10) / 10;
    }

    const periodHour = getPeriodTargetHour(period, { sunriseTime, sunsetTime });
    const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);

    const dayIndices = hourlyTimes
        .map((timeValue, index) => {
            const hourDate = new Date(timeValue);
            const localDate = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(hourDate);
            const localHour = Number(new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: '2-digit',
                hour12: false
            }).format(hourDate));
            return { index, localDate, localHour };
        })
        .filter((entry) => entry.localDate === dateKey);

    if (!dayIndices.length) {
        return Math.round(dailySurfaceTemp * 10) / 10;
    }

    const airSeries = dayIndices
        .map(({ index }) => normalizeAirTempToF(hourlyAir[index], 'F'))
        .filter(Number.isFinite);
    const windSeries = dayIndices
        .map(({ index }) => normalizeLikelyWindMph(hourlyWind[index]))
        .filter(Number.isFinite);
    const cloudSeries = dayIndices
        .map(({ index }) => hourlyCloud[index])
        .filter(Number.isFinite);

    if (!airSeries.length) {
        return Math.round(dailySurfaceTemp * 10) / 10;
    }

    const targetEntry = dayIndices.reduce((best, entry) => {
        if (!best) return entry;
        const currentDelta = Math.abs(entry.localHour - periodHour);
        const bestDelta = Math.abs(best.localHour - periodHour);
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
    // Use both daily cloud context and target-hour cloud state. Heavy overcast can
    // suppress shortwave forcing much more than daily means imply.
    const targetCloud = Number.isFinite(hourlyCloud[targetIndex]) ? hourlyCloud[targetIndex] : cloudMean;
    const cloudBlend = (cloudMean * 0.45) + (targetCloud * 0.55);
    const cloudDamping = clamp(1 - ((cloudBlend / 100) * 0.82), 0.12, 1);
    const windDamping = clamp(1 - (windMean * response.windDamping), 0.5, 1);

    const solarTerm = dailyAirRange * response.solarGain * solarPhase * cloudDamping * windDamping;
    const airAnomalyTerm = Number.isFinite(targetAir)
        ? (targetAir - dailyAirMean) * response.airCoupling * windDamping
        : 0;
    const adjustmentLimit = getDiurnalAdjustmentLimit(waterType);
    const totalAdjustment = clamp(solarTerm + airAnomalyTerm, -adjustmentLimit, adjustmentLimit);

    return Math.round(clamp(dailySurfaceTemp + totalAdjustment, 32, 95) * 10) / 10;
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
