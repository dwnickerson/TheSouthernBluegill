// Enhanced Fishing Score Calculation Model
// Includes: moon phase, water clarity, pressure trend stability improvements

import { SPECIES_DATA } from '../config/species.js';

const PHASE_PRIORITY = [
    'spawn',
    'pre_spawn',
    'post_spawn',
    'fall',
    'early_summer',
    'summer',
    'dormant',
    'inactive',
    'winter'
];

const PHASE_PRIORITY_INDEX = PHASE_PRIORITY.reduce((acc, key, index) => {
    acc[key] = index;
    return acc;
}, {});

const COLD_PHASES = new Set(['inactive', 'dormant', 'winter']);

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getPhasePriority(phaseName) {
    return PHASE_PRIORITY_INDEX[phaseName] ?? Number.POSITIVE_INFINITY;
}

function getSafeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}


function toWindMph(value, units = 'kmh') {
    if (!Number.isFinite(value)) return 0;
    const unitText = String(units || 'kmh').toLowerCase();
    if (unitText.includes('mph')) return value;
    if (unitText.includes('m/s') || unitText.includes('ms')) return value * 2.23694;
    if (unitText.includes('kn')) return value * 1.15078;
    return value * 0.621371;
}

function parseTimeToMillis(timeValue) {
    if (!timeValue) return NaN;
    const ms = Date.parse(timeValue);
    return Number.isFinite(ms) ? ms : NaN;
}

function normalizePressureInputs(pressureList = [], timeList = []) {
    return pressureList
        .map((pressure, index) => {
            const time = timeList[index];
            const ms = parseTimeToMillis(time);
            return {
                pressure: Number(pressure),
                time,
                ms,
                index
            };
        })
        .filter((row) => Number.isFinite(row.pressure));
}

function selectPressureWindow(series, now = Date.now(), targetHours = 10) {
    if (!series.length) return [];

    const withTime = series.filter((entry) => Number.isFinite(entry.ms));
    const source = withTime.length >= 2 ? withTime : series;

    if (source === series) {
        const fallbackCount = Math.min(source.length, targetHours + 1);
        return source.slice(-fallbackCount);
    }

    const historical = source.filter((entry) => entry.ms <= now);
    if (historical.length >= 2) {
        const earliestAllowed = now - targetHours * 60 * 60 * 1000;
        const clipped = historical.filter((entry) => entry.ms >= earliestAllowed);
        if (clipped.length >= 2) return clipped;
        return historical.slice(-Math.min(historical.length, targetHours + 1));
    }

    return source.slice(0, Math.min(source.length, targetHours + 1));
}

function calculatePressureSlope(windowSeries) {
    if (windowSeries.length < 2) return 0;

    const first = windowSeries[0];
    const fallbackBaseMs = Number.isFinite(first.ms) ? first.ms : 0;

    const xs = windowSeries.map((entry, idx) => {
        if (Number.isFinite(entry.ms)) {
            return (entry.ms - fallbackBaseMs) / (60 * 60 * 1000);
        }
        return idx;
    });

    const ys = windowSeries.map((entry) => entry.pressure);
    const n = xs.length;

    const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
    const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i += 1) {
        const dx = xs[i] - meanX;
        numerator += dx * (ys[i] - meanY);
        denominator += dx * dx;
    }

    if (denominator === 0) return 0;
    return numerator / denominator;
}

function getClarityAdjustment(clarity, prefs = {}) {
    const stainedBonus = getSafeNumber(prefs.stained_water_bonus, 4);
    const muddyPenaltyMagnitude = getSafeNumber(prefs.murky_water_penalty, 6);
    const likesDirtyWater = Boolean(prefs.prefers_murky_water || prefs.murky_water_ok);
    const likesClearWater = Boolean(prefs.prefers_clear_water || prefs.clear_water_required);

    let raw = 0;
    if (clarity === 'stained') {
        raw = likesClearWater ? -2 : stainedBonus;
    } else if (clarity === 'slightly_stained') {
        raw = likesDirtyWater ? 2 : 1;
    } else if (clarity === 'muddy') {
        raw = likesDirtyWater ? -2 : -muddyPenaltyMagnitude;
    } else if (clarity === 'clear') {
        raw = likesClearWater ? 3 : 0;
    }

    return clamp(raw, -8, 8);
}

function getWindIdealRange(speciesKey, prefs, isCrappie, isSunfish, isBass) {
    if (Array.isArray(prefs.wind_ideal) && prefs.wind_ideal.length === 2) {
        return prefs.wind_ideal;
    }
    if (isCrappie) return [2, 8];
    if (isSunfish) return [1, 8];
    if (isBass) return [5, 15];
    if (speciesKey.includes('trout')) return [3, 10];
    return [3, 12];
}

function computeWindEffect(windSpeedMph, idealRange) {
    const low = Math.min(idealRange[0], idealRange[1]);
    const high = Math.max(idealRange[0], idealRange[1]);
    const mid = (low + high) / 2;
    const halfWidth = Math.max((high - low) / 2, 0.5);

    let raw = 0;
    if (windSpeedMph >= low && windSpeedMph <= high) {
        const centerDistance = Math.abs(windSpeedMph - mid) / halfWidth;
        raw = 10 * (1 - centerDistance * 0.6);
    } else {
        const distance = windSpeedMph < low ? low - windSpeedMph : windSpeedMph - high;
        raw = -Math.min(10, distance * 1.5);
    }

    const tapered = 10 * Math.tanh(raw / 10);
    return clamp(Math.round(tapered), -10, 10);
}

function normalizePressureImpact(rawImpact) {
    const capped = 18 * Math.tanh(rawImpact / 18);
    return clamp(Math.round(capped), -18, 18);
}

function buildPressureAnalysis(weather) {
    const pressureValues = weather?.hourly?.surface_pressure || [];
    const timeValues = weather?.hourly?.time || [];
    const series = normalizePressureInputs(pressureValues, timeValues);
    const windowSeries = selectPressureWindow(series, Date.now(), 10);

    const fallbackValues = pressureValues.slice(-Math.min(pressureValues.length, 11));
    const fallbackSeries = normalizePressureInputs(fallbackValues, []);
    const analysisSeries = windowSeries.length >= 2 ? windowSeries : fallbackSeries;

    return getPressureRate(
        analysisSeries.map((row) => row.pressure),
        analysisSeries.map((row) => row.time)
    );
}

// Get fish phase based on water temperature
export function getFishPhase(waterTemp, speciesData) {
    if (!speciesData?.phases) {
        return { name: 'inactive', data: { temp_range: [0, 0], score_bonus: 0 } };
    }

    const matching = [];

    for (const [phaseName, phaseData] of Object.entries(speciesData.phases)) {
        const [min, max] = phaseData.temp_range || [];
        if (!Number.isFinite(min) || !Number.isFinite(max)) continue;

        if (waterTemp >= min && waterTemp < max) {
            matching.push({ name: phaseName, data: phaseData });
        }
    }

    if (matching.length > 0) {
        matching.sort((a, b) => {
            const priorityDiff = getPhasePriority(a.name) - getPhasePriority(b.name);
            if (priorityDiff !== 0) return priorityDiff;
            return a.name.localeCompare(b.name);
        });
        return matching[0];
    }

    const fallback = Object.entries(speciesData.phases)
        .map(([phaseName, phaseData]) => {
            const [min, max] = phaseData.temp_range || [];
            const center = Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2 : Number.POSITIVE_INFINITY;
            return {
                name: phaseName,
                data: phaseData,
                distance: Math.abs(waterTemp - center)
            };
        })
        .sort((a, b) => {
            if (a.distance !== b.distance) return a.distance - b.distance;
            const priorityDiff = getPhasePriority(a.name) - getPhasePriority(b.name);
            if (priorityDiff !== 0) return priorityDiff;
            return a.name.localeCompare(b.name);
        });

    if (fallback.length > 0) {
        return { name: fallback[0].name, data: fallback[0].data };
    }

    return { name: 'inactive', data: { temp_range: [0, 0], score_bonus: 0 } };
}

// Calculate water clarity from Open-Meteo precipitation totals (mm)
export function calculateWaterClarity(precipLast3DaysMm) {
    const safePrecip = Array.isArray(precipLast3DaysMm) ? precipLast3DaysMm : [0, 0, 0];
    const totalMm = safePrecip.reduce((sum, val) => sum + (Number(val) || 0), 0);
    const totalInches = totalMm / 25.4;

    if (totalInches >= 1.5) return 'muddy';
    if (totalInches >= 0.5) return 'stained';
    if (totalInches >= 0.1) return 'slightly_stained';
    return 'clear';
}

// Enhanced pressure rate calculation using timestamp-aware linear regression
export function getPressureRate(pressureList, timeList = []) {
    const series = normalizePressureInputs(pressureList, timeList);
    if (series.length < 2) return { trend: 'stable', rate: 0 };

    const windowSeries = selectPressureWindow(series, Date.now(), 10);
    const effectiveSeries = windowSeries.length >= 2 ? windowSeries : series;
    const rate = calculatePressureSlope(effectiveSeries);

    let trend = 'stable';
    if (rate <= -1.2) trend = 'rapid_fall';
    else if (rate < -0.3) trend = 'falling';
    else if (rate >= 1.2) trend = 'rapid_rise';
    else if (rate > 0.3) trend = 'rising';

    return { trend, rate };
}

// Legacy function for compatibility
export function getPressureTrend(pressureList, timeList = []) {
    return getPressureRate(pressureList, timeList).trend;
}

// Calculate moon phase bonus (small, smooth, capped)
export function getMoonPhaseBonus(moonPhasePercent, speciesKey) {
    const speciesData = SPECIES_DATA[speciesKey];
    const prefs = speciesData?.preferences || {};
    const moonSensitive = Boolean(prefs.moon_sensitive || prefs.very_moon_sensitive);

    if (!moonSensitive) return 0;

    const configuredCap = Number(prefs.lunar_bonus_cap);
    const bonusCap = clamp(Number.isFinite(configuredCap) ? configuredCap : 5, 0, 5);
    const moon = clamp(Number(moonPhasePercent) || 0, 0, 100);

    const phaseRadians = (2 * Math.PI * moon) / 100;
    const smoothStrength = (Math.cos(phaseRadians) + 1) / 2;
    const bonus = bonusCap * Math.pow(smoothStrength, 0.85);

    return clamp(Number(bonus.toFixed(2)), 0, bonusCap);
}

// Main fishing score calculation
export function calculateFishingScore(weather, waterTemp, speciesKey, moonPhasePercent = 50) {
    let score = 50;
    const speciesData = SPECIES_DATA[speciesKey];

    if (!speciesData) {
        console.error(`Species "${speciesKey}" not found in SPECIES_DATA`);
        console.error('Available species:', Object.keys(SPECIES_DATA));
        throw new Error(`Unknown species: "${speciesKey}". Please select a valid species from the dropdown.`);
    }

    const factors = [];
    const prefs = speciesData.preferences || {};
    const isSunfish = speciesData.family?.includes('Sunfish');
    const isBass = speciesKey === 'bass' || speciesKey === 'smallmouth' || speciesKey === 'spotted';
    const isCrappie = speciesKey.includes('crappie');

    const pressureAnalysis = buildPressureAnalysis(weather);
    const pTrend = pressureAnalysis.trend;
    const pRate = pressureAnalysis.rate;

    let rawPressureImpact = 0;
    if (pTrend === 'rapid_fall') {
        rawPressureImpact = isCrappie ? 16 : isSunfish ? 10 : 14;
    } else if (pTrend === 'falling') {
        rawPressureImpact = isCrappie ? 12 : isSunfish ? 8 : 10;
    } else if (pTrend === 'rising') {
        rawPressureImpact = isSunfish ? -4 : -6;
    } else if (pTrend === 'rapid_rise') {
        rawPressureImpact = isSunfish ? -7 : -9;
    }

    rawPressureImpact += clamp(-pRate * 2.5, -5, 5);

    const pressureEffect = normalizePressureImpact(rawPressureImpact);
    if (pressureEffect !== 0) {
        score += pressureEffect;
        factors.push({
            name: `Pressure ${pTrend.replace('_', ' ')} (${pRate.toFixed(2)} hPa/hr)`,
            value: pressureEffect
        });
    }

    const phase = getFishPhase(waterTemp, speciesData);
    const basePhaseBonus = getSafeNumber(phase?.data?.score_bonus, 0);
    let phaseBonus = basePhaseBonus;

    if (waterTemp < 50 && !COLD_PHASES.has(phase.name)) {
        phaseBonus -= 8;
        factors.push({ name: 'Unexpected cold stress', value: -8 });
    }

    score += phaseBonus;
    factors.push({ name: `${phase.name.replace('_', ' ')} phase`, value: phaseBonus });

    const moonBonus = getMoonPhaseBonus(moonPhasePercent, speciesKey);
    if (moonBonus > 0) {
        score += moonBonus;
        factors.push({ name: 'Moon phase feeding period', value: moonBonus });
    }

    const precipLast3Days = weather?.daily?.precipitation_sum ? weather.daily.precipitation_sum.slice(-3) : [0, 0, 0];
    const clarity = calculateWaterClarity(precipLast3Days);
    const clarityEffect = getClarityAdjustment(clarity, prefs);
    if (clarityEffect !== 0) {
        score += clarityEffect;
        factors.push({ name: `Water clarity (${clarity})`, value: clarityEffect });
    }

    const windUnits = weather?.current_units?.wind_speed_10m || weather?.hourly_units?.wind_speed_10m || 'kmh';
    const windSpeed = toWindMph(getSafeNumber(weather?.current?.wind_speed_10m, 0), windUnits);
    const windIdeal = getWindIdealRange(speciesKey, prefs, isCrappie, isSunfish, isBass);
    const windEffect = computeWindEffect(windSpeed, windIdeal);
    if (windEffect !== 0) {
        score += windEffect;
        factors.push({ name: `Wind (${windSpeed.toFixed(1)} mph)`, value: windEffect });
    }

    const clouds = clamp(getSafeNumber(weather?.current?.cloud_cover, 0), 0, 100);
    if (clouds >= 30 && clouds <= 70) {
        const cloudBonus = isSunfish ? 4 : 7;
        score += cloudBonus;
        factors.push({ name: 'Balanced cloud cover', value: cloudBonus });
    } else if (clouds > 70) {
        if (isCrappie) {
            score += 8;
            factors.push({ name: 'Heavy cloud cover (crappie)', value: 8 });
        } else if (isBass) {
            score += 5;
            factors.push({ name: 'Heavy cloud cover (bass)', value: 5 });
        } else if (isSunfish && prefs.spawn_needs_sun && phase.name === 'spawn') {
            score -= 6;
            factors.push({ name: 'Heavy cloud cover during spawn', value: -6 });
        }
    }

    const code = getSafeNumber(weather?.current?.weather_code, 0);
    if (code === 51 || code === 53 || code === 61) {
        if (isBass && prefs.loves_light_rain) {
            const rainBonus = pTrend === 'falling' || pTrend === 'rapid_fall' ? 12 : 7;
            score += rainBonus;
            factors.push({ name: 'Light rain feeding activity', value: rainBonus });
        } else if (isCrappie) {
            score += 4;
            factors.push({ name: 'Light rain (crappie)', value: 4 });
        }
    } else if (code === 45 || code === 48) {
        const fogBonus = isCrappie ? 10 : 7;
        score += fogBonus;
        factors.push({ name: 'Fog cover advantage', value: fogBonus });
    } else if (code === 95 || code === 96 || code === 99) {
        score -= 30;
        factors.push({ name: 'Thunderstorm disruption', value: -30 });
    } else if (code === 63 || code === 65 || code === 80 || code === 81 || code === 82) {
        const rainPenalty = isCrappie ? -10 : -8;
        score += rainPenalty;
        factors.push({ name: 'Heavy rain instability', value: rainPenalty });
    }

    const precipProb = getSafeNumber(weather?.hourly?.precipitation_probability?.[0], 0);
    if (precipProb > 70 && code !== 51 && code !== 53 && code !== 61) {
        score -= 8;
        factors.push({ name: 'High rain probability', value: -8 });
    }

    if (isSunfish && !isCrappie) {
        score = Math.min(score, 92);
    }

    score = Math.round(clamp(Number(score) || 0, 0, 100));

    let rating = 'BAD';
    let colorClass = 'bad';
    if (score >= 80) {
        rating = 'EXCELLENT';
        colorClass = 'excellent';
    } else if (score >= 65) {
        rating = 'GOOD';
        colorClass = 'good';
    } else if (score >= 50) {
        rating = 'FAIR';
        colorClass = 'fair';
    } else if (score >= 35) {
        rating = 'POOR';
        colorClass = 'poor';
    }

    return { score, rating, colorClass, factors, phase: phase.name, clarity };
}

// Generate fishing technique tips
export function getTechniqueTips(score, waterTemp, windSpeed, weather, speciesKey, clarity = 'clear') {
    const tips = [];
    const speciesData = SPECIES_DATA[speciesKey];
    const isBass = speciesKey === 'bass' || speciesKey === 'smallmouth' || speciesKey === 'spotted';
    const phase = speciesData ? getFishPhase(waterTemp, speciesData) : { name: 'inactive' };

    if (phase.name === 'spawn') {
        tips.push('🎯 Spawn phase - focus on shallow beds, nests, and nearby transition cover');
    } else if (phase.name === 'pre_spawn') {
        tips.push('🌱 Pre-spawn phase - target staging points leading into spawning areas');
    } else if (phase.name === 'post_spawn') {
        tips.push('🔄 Post-spawn phase - fish first break lines and recovery cover');
    } else if (COLD_PHASES.has(phase.name) || waterTemp < 50) {
        tips.push('🐢 Cold-water phase - slow down presentations and fish deeper holding zones');
    }

    if (clarity === 'stained' && isBass) {
        tips.push('💧 Stained water helps bass ambush - use vibration and darker profiles');
    } else if (clarity === 'muddy') {
        tips.push('🌊 Muddy water - fish slow and loud with high-contrast baits');
    } else if (clarity === 'clear') {
        tips.push('💎 Clear water - downsize line and favor natural finesse presentations');
    }

    if (windSpeed < 5) {
        tips.push('🤫 Calm wind - make long casts and reduce noise around target areas');
    } else if (windSpeed >= 10) {
        tips.push('🌬️ Windy conditions - target windblown banks where bait stacks up');
    }

    const pressureTrend = buildPressureAnalysis(weather).trend;
    if (pressureTrend === 'falling' || pressureTrend === 'rapid_fall') {
        tips.push('📉 Falling pressure often triggers short feeding windows - fish now');
    }

    const code = getSafeNumber(weather?.current?.weather_code, 0);
    if (code === 51 || code === 53 || code === 61) {
        if (isBass && waterTemp >= 58) {
            tips.push('🌧️ Light rain + warm water can boost moving bait and topwater bites');
        } else if (isBass) {
            tips.push('🌧️ Light rain in cool water - lean on subsurface reaction baits');
        }
    }

    if (score >= 80) {
        tips.push('🔥 Excellent overall setup - fish high-percentage structure first');
    } else if (score < 40) {
        tips.push('⏳ Tough conditions - focus on peak low-light periods and precise spots');
    }

    return tips;
}
