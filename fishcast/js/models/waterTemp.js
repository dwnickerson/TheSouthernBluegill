// Water Temperature Prediction Model V2.0
// Science-based estimation using seasonal physics + user data calibration

import { WATER_BODIES_V2 } from '../config/waterBodies.js';
import { API_CONFIG, APP_CONSTANTS } from '../config/constants.js';
import { getDayOfYear } from '../utils/date.js';
import { calculateDistance } from '../utils/math.js';

// Get seasonal baseline temperature using harmonic oscillation
function getSeasonalBaseTemp(latitude, dayOfYear, waterType) {
    const body = WATER_BODIES_V2[waterType];
    const annualMean = 77.5 - (0.6 * Math.abs(latitude - 30));
    const amplitude = body.annual_amplitude;
    const peakDay = 210 + body.seasonal_lag_days;
    const radians = (2 * Math.PI * (dayOfYear - peakDay)) / 365;
    const seasonalTemp = annualMean + (amplitude * Math.cos(radians));
    return seasonalTemp;
}

// Calculate solar radiation effect from cloud cover
function calculateSolarDeviation(latitude, dayOfYear, cloudCoverArray) {
    if (!cloudCoverArray || cloudCoverArray.length === 0) return 0;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const recentDays = Math.min(7, cloudCoverArray.length);
    const avgCloudCover = cloudCoverArray.slice(-recentDays).reduce((a, b) => a + b, 0) / recentDays;

    // Prevent month index overflow on day 365/366
    const month = clamp(Math.floor(((dayOfYear - 1) / 365) * 12), 0, 11);
    const normalCloudCover = [55, 52, 50, 45, 40, 35, 35, 35, 38, 42, 48, 52][month];

    // Latitude-aware seasonal insolation factor based on solar declination
    const solarDeclination = 23.44 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
    const latRad = latitude * (Math.PI / 180);
    const declinationRad = solarDeclination * (Math.PI / 180);
    const middayElevation = Math.asin(
        Math.sin(latRad) * Math.sin(declinationRad) +
        Math.cos(latRad) * Math.cos(declinationRad)
    );

    // Scale relative to a 45° reference sun angle to moderate cloud impact seasonally
    const seasonalInsolationFactor = clamp(Math.sin(middayElevation) / Math.sin(Math.PI / 4), 0.3, 1.3);

    const cloudDeviation = normalCloudCover - avgCloudCover;
    const solarEffect = cloudDeviation * 0.08 * seasonalInsolationFactor;
    return solarEffect;
}

// Calculate air temperature influence with thermal lag
function calculateAirTempInfluence(airTemps, waterType) {
    const body = WATER_BODIES_V2[waterType];
    if (!airTemps || airTemps.length === 0) {
        return { average: 65, trend: 0 };
    }
    const lagDays = body.thermal_lag_days;
    const recent = airTemps.slice(-lagDays);
    
    let trendSum = 0;
    for (let i = 1; i < recent.length; i++) {
        trendSum += (recent[i] - recent[i-1]);
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
        trend: trend
    };
}

// Calculate thermal inertia coefficient
function getThermalInertiaCoefficient(waterType, currentWaterTemp, recentAirAvg) {
    const delta = recentAirAvg - currentWaterTemp;
    const baseInertia = waterType === 'pond' ? 0.15 : waterType === 'lake' ? 0.08 : 0.05;
    // Response grows with air-water thermal gradient but should never flip sign;
    // the sign is already represented by delta itself.
    const responseFactor = Math.tanh(Math.abs(delta) / 15);
    return baseInertia * responseFactor;
}

// Calculate wind mixing effect
function calculateWindMixingEffect(windSpeedMph, waterType, estimatedSurfaceTemp, airTemp) {
    const body = WATER_BODIES_V2[waterType];
    if (windSpeedMph > body.mixing_wind_threshold) {
        const tempDifference = estimatedSurfaceTemp - airTemp;
        if (tempDifference > 5) {
            const coolingEffect = -0.4 * (windSpeedMph - body.mixing_wind_threshold);
            return Math.max(-3, coolingEffect);
        } else if (tempDifference < -5) {
            const warmingEffect = 0.2 * (windSpeedMph - body.mixing_wind_threshold);
            return Math.min(2, warmingEffect);
        }
    }
    return 0;
}

// Get nearby water temperature reports from users
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

// Calibrate model with user-submitted data
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
    
    console.log(`📊 Using ${reportCount} user reports. Blend: ${(blendFactor * 100).toFixed(0)}% user data, ${((1-blendFactor) * 100).toFixed(0)}% model`);
    
    return calibratedTemp;
}

// Main water temperature estimation function
export async function estimateWaterTemp(coords, waterType, currentDate, historicalWeather) {
    const latitude = coords.lat;
    const dayOfYear = getDayOfYear(currentDate);
    
    console.log(`🌡️ Estimating water temp for ${waterType} at ${latitude.toFixed(2)}°N on day ${dayOfYear}`);
    
    // Step 1: Get seasonal baseline
    const seasonalBase = getSeasonalBaseTemp(latitude, dayOfYear, waterType);
    console.log(`📅 Seasonal baseline: ${seasonalBase.toFixed(1)}°F`);
    
    // Step 2: Check for user-submitted data
    const userReports = await getNearbyWaterTempReports(coords, waterType);
    let calibratedBase = seasonalBase;
    
    if (userReports && userReports.length > 0) {
        calibratedBase = calibrateWithUserData(seasonalBase, userReports, coords, waterType);
        console.log(`👥 Calibrated with user data: ${calibratedBase.toFixed(1)}°F`);
    }
    
    // Step 3: Apply recent weather modifiers
    const airTemps = historicalWeather.daily.temperature_2m_mean || [];
    const cloudCover = historicalWeather.daily.cloud_cover_mean || [];
    const windSpeeds = historicalWeather.daily.wind_speed_10m_max || [];
    
    const airInfluence = calculateAirTempInfluence(airTemps, waterType);
    const solarEffect = calculateSolarDeviation(latitude, dayOfYear, cloudCover);
    const thermalResponse = getThermalInertiaCoefficient(waterType, calibratedBase, airInfluence.average);
    const airDelta = airInfluence.average - calibratedBase;
    const airEffect = airDelta * thermalResponse;
    
    const windSampleSize = Math.min(7, windSpeeds.length);
    const avgWind = windSampleSize > 0
        ? windSpeeds.slice(-7).reduce((a, b) => a + b, 0) / windSampleSize
        : 0;
    const avgWindMph = avgWind * 0.621371;
    const windEffect = calculateWindMixingEffect(avgWindMph, waterType, calibratedBase + solarEffect + airEffect, airInfluence.average);
    
    // Step 4: Combine all factors
    let estimatedTemp = calibratedBase + solarEffect + airEffect + windEffect;
    
    if (Math.abs(airInfluence.trend) > 2) {
        estimatedTemp += airInfluence.trend * 0.5;
    }
    
    // Step 5: Apply physical constraints
    const body = WATER_BODIES_V2[waterType];
    estimatedTemp = Math.max(32, Math.min(95, estimatedTemp));
    
    const yesterdayKey = `waterTemp_${coords.lat}_${coords.lon}_${waterType}`;
    const yesterdayEstimate = localStorage.getItem(yesterdayKey);
    
    if (yesterdayEstimate) {
        const yesterday = parseFloat(yesterdayEstimate);
        const change = estimatedTemp - yesterday;
        if (Math.abs(change) > body.max_daily_change) {
            estimatedTemp = yesterday + (Math.sign(change) * body.max_daily_change);
        }
    }
    
    localStorage.setItem(yesterdayKey, estimatedTemp.toFixed(1));
    
    const finalTemp = Math.round(estimatedTemp * 10) / 10;
    console.log(`✅ Final water temp estimate: ${finalTemp}°F`);
    
    return finalTemp;
}

// Estimate temperature by depth (stratification)
export function estimateTempByDepth(surfaceTemp, waterType, depth_ft, currentDate = new Date()) {
    const body = WATER_BODIES_V2[waterType];
    const month = currentDate.getMonth();
    
    // Summer stratification
    if (month >= 4 && month <= 8) {
        const thermoclineDepth = body.thermocline_depth;
        if (depth_ft < thermoclineDepth) {
            return Math.max(32, surfaceTemp - (depth_ft * 0.5));
        } else if (depth_ft < thermoclineDepth + 10) {
            const thermoclineTemp = surfaceTemp - (thermoclineDepth * 0.5);
            return Math.max(32, thermoclineTemp - ((depth_ft - thermoclineDepth) * 2.0));
        } else {
            return Math.max(32, body.deep_stable_temp);
        }
    }
    // Spring/Fall turnover
    else if (month === 2 || month === 3 || month === 9 || month === 10) {
        return Math.max(32, surfaceTemp - (depth_ft * 0.3));
    }
    // Winter stratification
    else {
        if (surfaceTemp <= 35) {
            return depth_ft < 5 ? surfaceTemp : 39;
        } else {
            return Math.max(32, surfaceTemp - (depth_ft * 0.2));
        }
    }
}

// Get complete temperature profile
export async function getWaterTempProfile(coords, waterType, currentDate, historicalWeather) {
    const surfaceTemp = await estimateWaterTemp(coords, waterType, currentDate, historicalWeather);
    const depths = [0, 5, 10, 15, 20, 25, 30];
    const profile = depths.map(depth => ({
        depth: depth,
        temperature: depth === 0 ? surfaceTemp : estimateTempByDepth(surfaceTemp, waterType, depth, currentDate)
    }));
    
    return {
        surface: surfaceTemp,
        profile: profile,
        thermocline: WATER_BODIES_V2[waterType].thermocline_depth
    };
}
