import { SPECIES_DATA } from '../config/species.js';
import { storage } from '../services/storage.js';

const TZ = 'America/Chicago';
const FREEZE_HOUR_LOCAL = 19;
const OPEN_METEO_DEFAULT_WIND_UNITS = 'kmh'; // Open-Meteo defaults to km/h unless wind_speed_unit is requested.
const OPEN_METEO_DEFAULT_TEMP_UNITS = 'celsius';

const PHASE_PRIORITY = [
    'spawn',
    'pre_spawn',
    'post_spawn',
    'fall',
    'summer',
    'early_summer',
    'dormant',
    'inactive',
    'winter'
];

const PHASE_BONUS_SCALE = 0.62;
const PHASE_BONUS_MIN = -12;
const PHASE_BONUS_MAX = 18;
const PRESSURE_TREND_WINDOW_HOURS = 12;
const PRESSURE_TREND_MIN_POINTS = 8;
const SMOOTHING_ALPHA = 0.35;

const MAJOR_CHANGE_THRESHOLDS = {
    pressure_hpa: 6,
    wind_mph: 10,
    precip_prob: 40,
    cloud_cover: 35,
    air_temp_f: 10,
    water_temp_f: 4
};

const HARD_MAJOR_CHANGE_THRESHOLDS = {
    pressure_hpa: 9,
    wind_mph: 16,
    precip_prob: 60,
    cloud_cover: 50,
    air_temp_f: 15,
    water_temp_f: 6
};

const BASE_STABILITY = {
    maxDeltaWithoutMaterialChange: 12,
    materialThresholds: {
        pressure_hpa: 3,
        wind_mph: 5,
        precip_prob: 25,
        cloud_cover: 25,
        air_temp_f: 6,
        water_temp_f: 3
    },
    majorForecastShiftScoreDelta: 18
};

const FAMILY_PROFILES = {
    sunfish: {
        baseline: 50,
        temp: { optimal: [68, 78], active: [58, 86], coldStress: 48, heatStress: 90 },
        season: { springBonus: 8, fallBonus: 6, winterPenalty: -8 },
        pressure: { fallingBonus: 6, rapidFallBonus: 9, risingPenalty: -4 },
        wind: { calmBonus: 7, moderateBonus: 3, roughPenalty: -8 },
        clouds: { balancedBonus: 5, heavySpawnPenalty: -7 },
        precipitation: { lightRainBonus: 3, heavyProbPenalty: -8 },
        ceiling: 90
    },
    black_bass: {
        baseline: 49,
        temp: { optimal: [62, 76], active: [52, 86], coldStress: 46, heatStress: 90 },
        season: { springBonus: 9, fallBonus: 8, winterPenalty: -10 },
        pressure: { fallingBonus: 8, rapidFallBonus: 12, risingPenalty: -6 },
        wind: { calmBonus: 2, moderateBonus: 7, roughPenalty: -7 },
        clouds: { balancedBonus: 6, heavySpawnPenalty: 2 },
        precipitation: { lightRainBonus: 6, heavyProbPenalty: -7 },
        ceiling: 89
    },
    crappie: {
        baseline: 51,
        temp: { optimal: [58, 70], active: [50, 82], coldStress: 43, heatStress: 88 },
        season: { springBonus: 10, fallBonus: 7, winterPenalty: -7 },
        pressure: { fallingBonus: 9, rapidFallBonus: 12, risingPenalty: -5 },
        wind: { calmBonus: 8, moderateBonus: 2, roughPenalty: -10 },
        clouds: { balancedBonus: 6, heavySpawnPenalty: 4 },
        precipitation: { lightRainBonus: 4, heavyProbPenalty: -9 },
        ceiling: 91
    }
};

export const SPECIES_SCORING_CONFIG = {
    bluegill: { family: 'sunfish', temp: { optimal: [68, 78], active: [58, 86] }, ceiling: 92 },
    coppernose: { family: 'sunfish', temp: { optimal: [69, 80], active: [59, 88] }, season: { springBonus: 9 }, ceiling: 93 },
    redear: { family: 'sunfish', temp: { optimal: [68, 78], active: [58, 85] }, pressure: { fallingBonus: 5, rapidFallBonus: 7 }, ceiling: 90 },
    green_sunfish: { family: 'sunfish', temp: { optimal: [70, 83], active: [58, 90], heatStress: 94 }, ceiling: 88 },
    warmouth: { family: 'sunfish', temp: { optimal: [68, 80], active: [60, 88] }, precipitation: { lightRainBonus: 5 }, ceiling: 90 },
    longear: { family: 'sunfish', temp: { optimal: [65, 75], active: [56, 83] }, ceiling: 87 },
    rock_bass: { family: 'sunfish', temp: { optimal: [60, 72], active: [52, 82] }, ceiling: 88 },

    bass: { family: 'black_bass', temp: { optimal: [62, 76], active: [52, 88] }, wind: { calmBonus: 3, moderateBonus: 8 }, ceiling: 90 },
    smallmouth: { family: 'black_bass', temp: { optimal: [60, 70], active: [48, 80], heatStress: 85 }, wind: { calmBonus: 1, moderateBonus: 8 }, ceiling: 88 },
    spotted: { family: 'black_bass', temp: { optimal: [63, 74], active: [52, 86] }, ceiling: 89 },

    crappie: { family: 'crappie', ceiling: 91 },
    white_crappie: { family: 'crappie', temp: { optimal: [58, 69], active: [50, 84] }, ceiling: 91 },
    black_crappie: { family: 'crappie', temp: { optimal: [56, 66], active: [48, 80], heatStress: 84 }, ceiling: 92 }
};

function getLocalHour(date, timeZone = TZ) {
    const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
}

function getLocalDateKey(date, timeZone = TZ) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return `${y}-${m}-${d}`;
}

function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
}

function normalizeTempToF(tempValue, tempUnits = OPEN_METEO_DEFAULT_TEMP_UNITS) {
    if (!Number.isFinite(tempValue)) return null;
    const units = String(tempUnits || OPEN_METEO_DEFAULT_TEMP_UNITS).toLowerCase();
    if (units.includes('f')) return tempValue;
    return (tempValue * 9) / 5 + 32;
}

function getFamilyFromSpecies(speciesKey) {
    const familyText = SPECIES_DATA[speciesKey]?.family || '';
    if (familyText.includes('Crappie')) return 'crappie';
    if (familyText.includes('Black Bass')) return 'black_bass';
    return 'sunfish';
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
    if (!isPlainObject(base) && !isPlainObject(override)) {
        return override === undefined ? base : override;
    }

    const out = isPlainObject(base) ? structuredClone(base) : {};
    if (!isPlainObject(override)) return out;

    for (const [key, value] of Object.entries(override)) {
        if (isPlainObject(value) && isPlainObject(out[key])) {
            out[key] = deepMerge(out[key], value);
        } else {
            out[key] = structuredClone(value);
        }
    }

    return out;
}

function getSpeciesProfile(speciesKey) {
    const override = SPECIES_SCORING_CONFIG[speciesKey] || {};
    const familyKey = override.family || getFamilyFromSpecies(speciesKey);
    const familyProfile = FAMILY_PROFILES[familyKey] || FAMILY_PROFILES.sunfish;
    return deepMerge(familyProfile, override);
}

function getPhasePriority(phaseName) {
    const idx = PHASE_PRIORITY.indexOf(phaseName);
    return idx === -1 ? PHASE_PRIORITY.length : idx;
}

function getPhaseForTemp(speciesKey, waterTempF, context = {}) {
    const phases = SPECIES_DATA[speciesKey]?.phases;
    if (!phases || typeof waterTempF !== 'number') {
        return null;
    }

    const month = Number(context.month);
    const matchingPhases = [];

    for (const [phaseName, phaseData] of Object.entries(phases)) {
        const [min, max] = phaseData.temp_range || [];
        if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
        if (waterTempF >= min && waterTempF < max) {
            matchingPhases.push({
                name: phaseName,
                data: phaseData,
                span: max - min,
                priority: getPhasePriority(phaseName),
                seasonWeight: Number.isFinite(month) && month >= 3 && month <= 6 && phaseName === 'spawn' ? -1 : 0
            });
        }
    }

    if (!matchingPhases.length) return null;

    matchingPhases.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.seasonWeight !== b.seasonWeight) return a.seasonWeight - b.seasonWeight;
        if (a.span !== b.span) return a.span - b.span;
        return a.name.localeCompare(b.name);
    });

    return matchingPhases[0];
}

function normalizeWindToKmh(windValue, windUnits = OPEN_METEO_DEFAULT_WIND_UNITS) {
    const units = String(windUnits || OPEN_METEO_DEFAULT_WIND_UNITS).toLowerCase();
    if (!Number.isFinite(windValue)) return null;

    if (units.includes('mph')) return windValue * 1.60934;
    if (units.includes('m/s') || units.includes('ms')) return windValue * 3.6;
    if (units.includes('kn')) return windValue * 1.852;

    // Defensive fallback if ingestion layer omits units.
    if (windValue > 0 && windValue < 25) return windValue * 3.6;
    return windValue;
}

function calculatePressureTrend(pressures) {
    if (!pressures.length) return { trend: 'stable', rate: 0 };

    const finite = pressures.filter(Number.isFinite);
    if (finite.length < 4) return { trend: 'stable', rate: 0 };

    const windowed = finite.slice(-PRESSURE_TREND_WINDOW_HOURS);
    const series = windowed.length >= PRESSURE_TREND_MIN_POINTS ? windowed : finite.slice(-Math.max(4, windowed.length));

    const n = series.length;
    const xMean = (n - 1) / 2;
    const yMean = average(series) ?? 0;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
        const xDelta = i - xMean;
        const yDelta = series[i] - yMean;
        numerator += xDelta * yDelta;
        denominator += xDelta * xDelta;
    }

    const rate = denominator === 0 ? 0 : numerator / denominator; // hPa / hour

    if (rate <= -0.25) return { trend: 'rapid_fall', rate };
    if (rate < -0.08) return { trend: 'falling', rate };
    if (rate >= 0.25) return { trend: 'rapid_rise', rate };
    if (rate > 0.08) return { trend: 'rising', rate };
    return { trend: 'stable', rate };
}

function computeLinearTrend(valuesPerDay) {
    const finite = valuesPerDay.filter(Number.isFinite);
    if (finite.length < 2) return null;
    const n = finite.length;
    const xMean = (n - 1) / 2;
    const yMean = average(finite) ?? 0;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
        const xDelta = i - xMean;
        numerator += xDelta * (finite[i] - yMean);
        denominator += xDelta * xDelta;
    }

    return denominator === 0 ? null : numerator / denominator;
}

function getPhaseConfidence({ phase, waterTempF, trendFPerDay }) {
    if (!phase?.data?.temp_range) return 1;
    const [min, max] = phase.data.temp_range;
    const span = Math.max(1, max - min);
    const center = (min + max) / 2;
    const distanceToCenter = Math.abs(waterTempF - center);
    const centerConfidence = clamp(1 - distanceToCenter / (span / 2), 0, 1);

    let confidence = 0.45 + centerConfidence * 0.55;

    if (Number.isFinite(trendFPerDay)) {
        if (Math.abs(trendFPerDay) > 4) confidence *= 0.55;
        if (phase.name === 'spawn' && trendFPerDay > 2.5) confidence *= 0.5;
    } else if (phase.name === 'spawn') {
        confidence *= 0.75;
    }

    return clamp(confidence, 0.2, 1);
}

function computeDeltas(current, previous) {
    return {
        pressure_hpa: Math.abs((current.pressureAvg ?? 0) - (previous.pressureAvg ?? 0)),
        wind_mph: Math.abs(((current.windAvgKmh ?? 0) - (previous.windAvgKmh ?? 0)) * 0.621371),
        precip_prob: Math.abs((current.precipProbAvg ?? 0) - (previous.precipProbAvg ?? 0)),
        cloud_cover: Math.abs((current.cloudAvg ?? 0) - (previous.cloudAvg ?? 0)),
        air_temp_f: Math.abs((current.tempAvgF ?? 0) - (previous.tempAvgF ?? 0)),
        water_temp_f: Math.abs((current.waterTempF ?? 0) - (previous.waterTempF ?? 0))
    };
}

function exceedsThresholds(deltas, thresholds) {
    return Object.entries(thresholds).some(([key, threshold]) => (deltas[key] ?? 0) >= threshold);
}

export function buildDayWindows(weather, dayKey) {
    const hourly = weather.forecast.hourly;
    const dayIndexes = [];

    for (let i = 0; i < hourly.time.length; i++) {
        if ((hourly.time[i] || '').startsWith(dayKey)) dayIndexes.push(i);
    }

    const windUnits = weather.forecast?.hourly_units?.wind_speed_10m || OPEN_METEO_DEFAULT_WIND_UNITS;
    const tempUnits = weather.forecast?.hourly_units?.temperature_2m || weather.forecast?.current_units?.temperature_2m || OPEN_METEO_DEFAULT_TEMP_UNITS;

    const dayPressures = dayIndexes.map((i) => hourly.surface_pressure[i]).filter(Number.isFinite);
    const dayWindsKmh = dayIndexes
        .map((i) => normalizeWindToKmh(hourly.wind_speed_10m[i], windUnits))
        .filter(Number.isFinite);
    const dayClouds = dayIndexes.map((i) => hourly.cloud_cover[i]).filter(Number.isFinite);
    const dayPrecipProb = dayIndexes.map((i) => hourly.precipitation_probability[i]).filter(Number.isFinite);
    const dayTempsF = dayIndexes
        .map((i) => normalizeTempToF(hourly.temperature_2m[i], tempUnits))
        .filter(Number.isFinite);

    const firstIdx = dayIndexes[0] ?? 0;
    const pastStart = Math.max(0, firstIdx - PRESSURE_TREND_WINDOW_HOURS);
    const pastPressures = hourly.surface_pressure.slice(pastStart, firstIdx).filter(Number.isFinite);

    const historyTempUnits = weather.historical?.daily_units?.temperature_2m_mean || tempUnits;
    const forecastTempUnits = weather.forecast?.daily_units?.temperature_2m_mean || tempUnits;
    const airHistoryF = (weather.historical?.daily?.temperature_2m_mean || [])
        .map((v) => normalizeTempToF(v, historyTempUnits))
        .filter(Number.isFinite);
    const airForecastF = (weather.forecast?.daily?.temperature_2m_mean || [])
        .map((v) => normalizeTempToF(v, forecastTempUnits))
        .filter(Number.isFinite);
    const tempTrendFPerDay = computeLinearTrend(airHistoryF.slice(-2).concat(airForecastF.slice(0, 3)));

    return {
        dayIndexes,
        dayFeatures: {
            pressureAvg: average(dayPressures),
            windAvgKmh: average(dayWindsKmh),
            windUnits: 'kmh',
            cloudAvg: average(dayClouds),
            precipProbAvg: average(dayPrecipProb),
            tempAvgF: average(dayTempsF),
            airTempTrendFPerDay: tempTrendFPerDay,
            pressureTrend: calculatePressureTrend(pastPressures.concat(dayPressures.slice(0, 3))),
            precip3DayMm: (weather.historical?.daily?.precipitation_sum || [])
                .slice(-2)
                .concat((weather.forecast?.daily?.precipitation_sum || []).slice(0, 1))
        }
    };
}

export function scoreSpeciesByProfile(features, waterTempF, dateKey, speciesKey) {
    const profile = getSpeciesProfile(speciesKey);
    let score = profile.baseline;
    const contributions = [];
    const month = Number(dateKey.split('-')[1]);
    const phase = getPhaseForTemp(speciesKey, waterTempF, { month });

    if (waterTempF >= profile.temp.optimal[0] && waterTempF <= profile.temp.optimal[1]) {
        score += 22;
        contributions.push({ factor: 'water_temp_optimal', delta: 22 });
    } else if (waterTempF >= profile.temp.active[0] && waterTempF <= profile.temp.active[1]) {
        score += 11;
        contributions.push({ factor: 'water_temp_active', delta: 11 });
    }
    if (waterTempF <= profile.temp.coldStress) {
        score -= 18;
        contributions.push({ factor: 'cold_stress', delta: -18 });
    }
    if (waterTempF >= profile.temp.heatStress) {
        score -= 14;
        contributions.push({ factor: 'heat_stress', delta: -14 });
    }

    if (phase?.data && Number.isFinite(phase.data.score_bonus)) {
        const phaseConfidence = getPhaseConfidence({
            phase,
            waterTempF,
            trendFPerDay: features.waterTempTrendFPerDay ?? features.airTempTrendFPerDay
        });
        const normalizedPhaseDelta = clamp(
            Math.round(phase.data.score_bonus * PHASE_BONUS_SCALE * phaseConfidence),
            PHASE_BONUS_MIN,
            PHASE_BONUS_MAX
        );
        score += normalizedPhaseDelta;
        contributions.push({
            factor: `phase_${phase.name}`,
            delta: normalizedPhaseDelta,
            meta: { phaseConfidence }
        });
    }

    if (month >= 3 && month <= 6) {
        score += profile.season.springBonus;
        contributions.push({ factor: 'spring_activity', delta: profile.season.springBonus });
    }
    if (month >= 9 && month <= 11) {
        score += profile.season.fallBonus;
        contributions.push({ factor: 'fall_feed', delta: profile.season.fallBonus });
    }
    if (month === 12 || month <= 2) {
        score += profile.season.winterPenalty;
        contributions.push({ factor: 'winter_slowdown', delta: profile.season.winterPenalty });
    }

    const p = features.pressureTrend || { trend: 'stable' };
    if (p.trend === 'rapid_fall') {
        score += profile.pressure.rapidFallBonus;
        contributions.push({ factor: 'pressure_rapid_fall', delta: profile.pressure.rapidFallBonus });
    } else if (p.trend === 'falling') {
        score += profile.pressure.fallingBonus;
        contributions.push({ factor: 'pressure_falling', delta: profile.pressure.fallingBonus });
    } else if (p.trend === 'rising' || p.trend === 'rapid_rise') {
        score += profile.pressure.risingPenalty;
        contributions.push({ factor: 'pressure_rising', delta: profile.pressure.risingPenalty });
    }

    const windMph = (features.windAvgKmh || 0) * 0.621371;
    if (windMph < 6) {
        score += profile.wind.calmBonus;
        contributions.push({ factor: 'calm_wind', delta: profile.wind.calmBonus });
    } else if (windMph < 12) {
        score += profile.wind.moderateBonus;
        contributions.push({ factor: 'moderate_wind', delta: profile.wind.moderateBonus });
    } else if (windMph > 17) {
        score += profile.wind.roughPenalty;
        contributions.push({ factor: 'rough_wind', delta: profile.wind.roughPenalty });
    }

    if ((features.cloudAvg || 0) >= 30 && (features.cloudAvg || 0) <= 70) {
        score += profile.clouds.balancedBonus;
        contributions.push({ factor: 'balanced_cloud', delta: profile.clouds.balancedBonus });
    }

    const inSpawnWindow = phase?.name === 'spawn';
    if ((features.cloudAvg || 0) > 80 && inSpawnWindow) {
        score += profile.clouds.heavySpawnPenalty;
        contributions.push({ factor: 'spawn_cloud_adjustment', delta: profile.clouds.heavySpawnPenalty });
    }

    const precipProb = features.precipProbAvg || 0;
    if (precipProb >= 20 && precipProb <= 55) {
        score += profile.precipitation.lightRainBonus;
        contributions.push({ factor: 'light_precip_bonus', delta: profile.precipitation.lightRainBonus });
    } else if (precipProb > 75) {
        score += profile.precipitation.heavyProbPenalty;
        contributions.push({ factor: 'high_precip_penalty', delta: profile.precipitation.heavyProbPenalty });
    }

    // Public scoring contract: returns { score, contributions, profile } and score is always clamped.
    score = clamp(Math.round(score), 0, profile.ceiling);
    return { score, contributions, profile };
}

export function getStabilityStorageKey(locationKey, speciesKey, dateKey) {
    return `fishcast_stability_${locationKey}_${speciesKey}_${dateKey}`;
}

function getStabilityProfile(speciesKey) {
    const family = SPECIES_DATA[speciesKey]?.family || '';
    if (family.includes('Black Bass')) return { ...BASE_STABILITY, maxDeltaWithoutMaterialChange: 14, majorForecastShiftScoreDelta: 20 };
    if (speciesKey.includes('crappie')) return { ...BASE_STABILITY, maxDeltaWithoutMaterialChange: 10, majorForecastShiftScoreDelta: 16 };
    return BASE_STABILITY;
}

export function applyStabilityControls({ baseScore, inputs, speciesKey, locationKey, dateKey, now = new Date(), debug = false }) {
    const cfg = getStabilityProfile(speciesKey);
    const key = getStabilityStorageKey(locationKey, speciesKey, dateKey);
    const previous = storage.get(key, null);
    const localHour = getLocalHour(now);
    const todayKey = getLocalDateKey(now);
    const isTomorrow = dateKey !== todayKey;
    let nextScore = baseScore;
    let reason = 'base_score';

    if (previous) {
        const deltas = computeDeltas(inputs, previous.inputs || {});
        const material = exceedsThresholds(deltas, cfg.materialThresholds);
        const major = exceedsThresholds(deltas, MAJOR_CHANGE_THRESHOLDS);
        const hardMajor = exceedsThresholds(deltas, HARD_MAJOR_CHANGE_THRESHOLDS);

        if (!material && Math.abs(baseScore - previous.score) > cfg.maxDeltaWithoutMaterialChange) {
            const direction = Math.sign(baseScore - previous.score);
            nextScore = previous.score + direction * cfg.maxDeltaWithoutMaterialChange;
            reason = 'gated_non_material_change';
        }

        if (isTomorrow && !hardMajor) {
            const blended = Math.round(previous.score * (1 - SMOOTHING_ALPHA) + baseScore * SMOOTHING_ALPHA);
            nextScore = major ? Math.round((blended + baseScore) / 2) : blended;
            reason = major ? 'tomorrow_smoothed_major' : 'tomorrow_smoothed';
        }

        if (isTomorrow && localHour >= FREEZE_HOUR_LOCAL && !hardMajor) {
            const shift = Math.abs(baseScore - previous.score);
            if (shift < cfg.majorForecastShiftScoreDelta) {
                nextScore = previous.score;
                reason = 'tomorrow_freeze_after_7pm';
            }
        } else if (isTomorrow && hardMajor) {
            reason = 'tomorrow_unfrozen_hard_major_shift';
        }

        if (debug) {
            console.info('[FishCast][stability]', { key, dateKey, previous: previous.score, baseScore, nextScore, reason, deltas });
        }
    }

    const safeScore = clamp(Math.round(nextScore), 0, 100);
    storage.set(key, { score: safeScore, inputs, updatedAt: now.toISOString() });
    return { score: safeScore, reason };
}

export function calculateSpeciesAwareDayScore({ data, dayKey, speciesKey, waterTempF, locationKey, now = new Date(), debug = false }) {
    // Public API contract used by UI: returns { score, debugPacket }.
    // Pipeline: weather/day -> dayFeatures -> species profile score -> stability controls -> bounded score.
    const { dayFeatures } = buildDayWindows(data.weather, dayKey);
    const scored = scoreSpeciesByProfile(dayFeatures, waterTempF, dayKey, speciesKey);

    const stable = applyStabilityControls({
        baseScore: scored.score,
        inputs: { ...dayFeatures, waterTempF },
        speciesKey,
        locationKey,
        dateKey: dayKey,
        now,
        debug
    });

    const debugPacket = {
        timestamp: now.toISOString(),
        speciesKey,
        dateKey: dayKey,
        baseScore: scored.score,
        finalScore: stable.score,
        stabilityReason: stable.reason,
        features: dayFeatures,
        contributions: scored.contributions,
        profileCeiling: scored.profile.ceiling
    };

    if (debug) console.info('[FishCast][score-debug]', debugPacket);
    return { score: stable.score, debugPacket };
}
