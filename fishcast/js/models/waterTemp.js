// Water Temperature Prediction Model V2.0
// Science-based estimation using seasonal physics + user data calibration
// Unit contract: all model temperatures are expected in °F from weatherAPI (temperature_unit=fahrenheit).

import { WATER_BODIES_V2 } from '../config/waterBodies.js';
import { API_CONFIG, APP_CONSTANTS } from '../config/constants.js';
import { getDayOfYear } from '../utils/date.js';
import { calculateDistance } from '../utils/math.js';
import { storage } from '../services/storage.js';

const WIND_FALLBACK_MAX_REDUCTION = 0.6;
const FORECAST_MAX_WIND_GUST_WEIGHT = 0.2;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function average(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return null;
    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
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

function toWindMph(value, unitHint = '') {
    if (!Number.isFinite(value)) return null;
    const normalizedUnit = String(unitHint || '').toLowerCase();

    if (normalizedUnit.includes('mph') || normalizedUnit.includes('mp/h') || normalizedUnit.includes('mi/h') || normalizedUnit.includes('mile')) {
        return value;
    }
    if (normalizedUnit.includes('m/s') || normalizedUnit.includes('ms')) {
        return value * 2.23694;
    }
    if (normalizedUnit.includes('kn')) {
        return value * 1.15078;
    }
    if (normalizedUnit.includes('km') || normalizedUnit.includes('kph')) {
        return value * 0.621371;
    }

    return normalizeLikelyWindMph(value);
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

function getWaterTypeTrendGain(waterType) {
    // Surface layers in high-volume reservoirs respond slowly to synoptic swings.
    if (waterType === 'reservoir') return 0.12;
    if (waterType === 'lake') return 0.22;
    return 0.35;
}

function getDailyPhysicsChangeLimit(waterType, prevTemp, airTemp, windMph) {
    const body = WATER_BODIES_V2[waterType];
    if (!body) return 1.5;

    // Base response envelope from mixed-layer thermal mass.
    // Large reservoirs are intentionally tighter than max_daily_change because
    // the forecast model represents whole-reservoir surface behavior, not small coves.
    const baseLimit = waterType === 'reservoir'
        ? 0.95
        : waterType === 'lake'
            ? 1.35
            : 2.0;

    const deltaAirWater = Math.abs((Number.isFinite(airTemp) ? airTemp : prevTemp) - prevTemp);
    const thermalForcingBoost = clamp(deltaAirWater / 30, 0, 1) * (waterType === 'reservoir' ? 0.25 : 0.5);
    const windBoost = clamp((Number.isFinite(windMph) ? windMph : 0) / 30, 0, 1) * (waterType === 'reservoir' ? 0.1 : 0.25);

    const strictCap = waterType === 'reservoir' ? 1.2 : body.max_daily_change;
    return clamp(baseLimit + thermalForcingBoost + windBoost, 0.4, strictCap);
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
    try {
        const url = `${API_CONFIG.WEBHOOK.WATER_TEMP_SUBMIT}?` +
            `lat=${coords.lat}&` +
            `lon=${coords.lon}&` +
            `radius=${APP_CONSTANTS.WATER_TEMP_REPORT_RADIUS_MILES}&` +
            `waterType=${waterType}&` +
            `daysBack=${daysBack}`;

        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.log('No user water temp data available, using physics model');
        return null;
    }
}

function calibrateWithUserData(seasonalBase, userReports, coords, waterType) {
    if (!userReports || userReports.length === 0) return seasonalBase;

    let weightedSum = 0;
    let totalWeight = 0;
    const now = new Date();

    userReports.forEach(report => {
        const distance = calculateDistance(coords.lat, coords.lon, report.latitude, report.longitude);
        const distanceWeight = 1 / Math.pow(distance + 1, 2);
        const reportDate = new Date(report.timestamp);
        const daysAgo = (now - reportDate) / (1000 * 60 * 60 * 24);
        const recencyWeight = Math.exp(-daysAgo / 3);
        const typeWeight = report.waterBody === waterType ? 1.5 : 1.0;
        const totalReportWeight = distanceWeight * recencyWeight * typeWeight;

        weightedSum += report.temperature * totalReportWeight;
        totalWeight += totalReportWeight;
    });

    if (totalWeight === 0) return seasonalBase;

    const userAverage = weightedSum / totalWeight;
    const reportCount = userReports.length;
    const blendFactor = Math.min(0.8, reportCount * 0.15);
    const calibratedTemp = (userAverage * blendFactor) + (seasonalBase * (1 - blendFactor));

    console.log(`📊 Using ${reportCount} user reports. Blend: ${(blendFactor * 100).toFixed(0)}% user data, ${((1 - blendFactor) * 100).toFixed(0)}% model`);

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
    console.log(`🌡️ Estimating water temp for ${waterType} at ${latitude.toFixed(2)}°N on day ${dayOfYear}`);

    const seasonalBase = getSeasonalBaseTemp(latitude, dayOfYear, waterType);
    console.log(`📅 Seasonal baseline: ${seasonalBase.toFixed(1)}°F`);

    const userReports = await getNearbyWaterTempReports(coords, waterType);
    let calibratedBase = seasonalBase;

    if (userReports && userReports.length > 0) {
        calibratedBase = calibrateWithUserData(seasonalBase, userReports, coords, waterType);
        console.log(`👥 Calibrated with user data: ${calibratedBase.toFixed(1)}°F`);
    }

    const daily = historicalWeather?.daily || {};
    const airTemps = daily.temperature_2m_mean || [];
    const cloudCover = daily.cloud_cover_mean || [];

    const tempUnit = historicalWeather?.meta?.units?.temp || 'F';
    const airInfluence = calculateAirTempInfluence(airTemps, waterType, tempUnit);
    const solarEffect = calculateSolarDeviation(latitude, dayOfYear, cloudCover, waterType);
    const thermalResponse = getThermalInertiaCoefficient(waterType, calibratedBase, airInfluence.average);
    const airDelta = airInfluence.average - calibratedBase;
    const airEffect = airDelta * thermalResponse;

    const windEstimate = getWindEstimateMph(historicalWeather);
    const windEffect = calculateWindMixingEffect(
        windEstimate.windMph,
        waterType,
        calibratedBase + solarEffect + airEffect,
        airInfluence.average
    );

    let estimatedTemp = calibratedBase + solarEffect + airEffect + windEffect;
    estimatedTemp += getSmoothTrendKicker(airInfluence.trend);

    const body = WATER_BODIES_V2[waterType];
    estimatedTemp = clamp(estimatedTemp, 32, 95);

    const yesterdayEstimate = storage.getWaterTempMemo(coords.lat, coords.lon, waterType);
    if (Number.isFinite(yesterdayEstimate)) {
        const dailyLimit = getRelaxedDailyChangeLimit(body.max_daily_change, userReports, coords);
        const change = estimatedTemp - yesterdayEstimate;
        if (Math.abs(change) > dailyLimit) {
            estimatedTemp = yesterdayEstimate + (Math.sign(change) * dailyLimit);
        }
    }

    storage.setWaterTempMemo(coords.lat, coords.lon, waterType, estimatedTemp);

    const finalTemp = Math.round(estimatedTemp * 10) / 10;
    if (windEstimate.warnings.length) {
        console.log('⚠️ Wind estimation notes:', windEstimate.warnings.join('; '));
    }
    console.log(`✅ Final water temp estimate: ${finalTemp}°F`);

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
    const anchorDate = options.anchorDate instanceof Date ? options.anchorDate : new Date();

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
        const solarEffect = calculateSolarDeviation(latitude, dayOfYear, [cloudCover[dayIndex]], waterType);

        const thermalResponse = getThermalInertiaCoefficient(waterType, prevTemp, airTemp);
        const thermalEffect = (airTemp - prevTemp) * thermalResponse;

        const trendWindowStart = Math.max(0, dayIndex - 2);
        const trendWindow = normalizedAirMeans.slice(trendWindowStart, dayIndex + 1).filter(Number.isFinite);
        let trendFPerDay = 0;
        if (trendWindow.length >= 2) {
            trendFPerDay = (trendWindow[trendWindow.length - 1] - trendWindow[0]) / (trendWindow.length - 1);
        }
        const trendKicker = getSmoothTrendKicker(trendFPerDay) * getWaterTypeTrendGain(waterType);

        const windEstimate = getProjectionWindForMixing(daily, dayIndex, windUnit);
        const windEffect = calculateWindMixingEffect(
            windEstimate.windMph,
            waterType,
            prevTemp + thermalEffect + solarEffect,
            airTemp
        );

        let projectedTemp = prevTemp + thermalEffect + solarEffect + windEffect + trendKicker;

        const seasonalBaseline = getSeasonalBaseTemp(latitude, dayOfYear, waterType);
        if (dayIndex >= 4) {
            const reversionWeight = clamp((dayIndex - 3) * 0.08, 0, 0.25);
            projectedTemp = (projectedTemp * (1 - reversionWeight)) + (seasonalBaseline * reversionWeight);
        }

        const dailyChangeLimit = getDailyPhysicsChangeLimit(waterType, prevTemp, airTemp, windEstimate.windMph);
        const dailyDelta = clamp(projectedTemp - prevTemp, -dailyChangeLimit, dailyChangeLimit);
        projectedTemp = clamp(prevTemp + dailyDelta, 32, 95);

        if (options.debug === true) {
            console.log(
                `[FishCast][waterTempProjection] day=${dayIndex} air=${airTemp.toFixed(1)} ` +
                `thermal=${thermalEffect.toFixed(2)} solar=${solarEffect.toFixed(2)} ` +
                `wind=${windEffect.toFixed(2)} trend=${trendKicker.toFixed(2)} ` +
                `windSource=${windEstimate.source} ` +
                `delta=${dailyDelta.toFixed(2)} final=${projectedTemp.toFixed(1)}`
            );
        }

        temps.push(projectedTemp);
    }

    return temps;
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
