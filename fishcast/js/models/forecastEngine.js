import { SPECIES_DATA } from '../config/species.js';
import { storage } from '../services/storage.js';

const TZ = 'America/Chicago';
const FREEZE_HOUR_LOCAL = 19;

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

function calculatePressureTrend(pressures) {
    if (pressures.length < 4) return { trend: 'stable', rate: 0 };
    const recent = pressures.slice(-4);
    const rate = (recent[recent.length - 1] - recent[0]) / 3;
    if (rate <= -1.2) return { trend: 'rapid_fall', rate };
    if (rate < -0.3) return { trend: 'falling', rate };
    if (rate >= 1.2) return { trend: 'rapid_rise', rate };
    if (rate > 0.3) return { trend: 'rising', rate };
    return { trend: 'stable', rate };
}

function cToF(c) {
    return (c * 9) / 5 + 32;
}

function getFamilyFromSpecies(speciesKey) {
    const familyText = SPECIES_DATA[speciesKey]?.family || '';
    if (familyText.includes('Crappie')) return 'crappie';
    if (familyText.includes('Black Bass')) return 'black_bass';
    return 'sunfish';
}

function deepMerge(base, override) {
    if (!override) return structuredClone(base);
    const out = structuredClone(base);
    for (const [key, value] of Object.entries(override)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
            out[key] = { ...out[key], ...value };
        } else {
            out[key] = value;
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

export function buildDayWindows(weather, dayKey) {
    const hourly = weather.forecast.hourly;
    const dayIndexes = [];

    for (let i = 0; i < hourly.time.length; i++) {
        if ((hourly.time[i] || '').startsWith(dayKey)) dayIndexes.push(i);
    }

    const dayPressures = dayIndexes.map((i) => hourly.surface_pressure[i]).filter(Number.isFinite);
    const dayWinds = dayIndexes.map((i) => hourly.wind_speed_10m[i]).filter(Number.isFinite);
    const dayClouds = dayIndexes.map((i) => hourly.cloud_cover[i]).filter(Number.isFinite);
    const dayPrecipProb = dayIndexes.map((i) => hourly.precipitation_probability[i]).filter(Number.isFinite);
    const dayTempsC = dayIndexes.map((i) => hourly.temperature_2m[i]).filter(Number.isFinite);

    const firstIdx = dayIndexes[0] ?? 0;
    const pastStart = Math.max(0, firstIdx - 48);
    const pastPressures = hourly.surface_pressure.slice(pastStart, firstIdx).filter(Number.isFinite);

    return {
        dayIndexes,
        dayFeatures: {
            pressureAvg: average(dayPressures),
            windAvgKmh: average(dayWinds),
            cloudAvg: average(dayClouds),
            precipProbAvg: average(dayPrecipProb),
            tempAvgC: average(dayTempsC),
            pressureTrend: calculatePressureTrend(pastPressures.concat(dayPressures.slice(0, 3))),
            precip3DayMm: (weather.historical?.daily?.precipitation_sum || []).slice(-2).concat((weather.forecast?.daily?.precipitation_sum || []).slice(0, 1))
        }
    };
}

export function scoreSpeciesByProfile(features, waterTempF, dateKey, speciesKey) {
    const profile = getSpeciesProfile(speciesKey);
    let score = profile.baseline;
    const contributions = [];

    if (waterTempF >= profile.temp.optimal[0] && waterTempF <= profile.temp.optimal[1]) {
        score += 22; contributions.push({ factor: 'water_temp_optimal', delta: 22 });
    } else if (waterTempF >= profile.temp.active[0] && waterTempF <= profile.temp.active[1]) {
        score += 11; contributions.push({ factor: 'water_temp_active', delta: 11 });
    }
    if (waterTempF <= profile.temp.coldStress) { score -= 18; contributions.push({ factor: 'cold_stress', delta: -18 }); }
    if (waterTempF >= profile.temp.heatStress) { score -= 14; contributions.push({ factor: 'heat_stress', delta: -14 }); }

    const month = Number(dateKey.split('-')[1]);
    if (month >= 3 && month <= 6) { score += profile.season.springBonus; contributions.push({ factor: 'spring_activity', delta: profile.season.springBonus }); }
    if (month >= 9 && month <= 11) { score += profile.season.fallBonus; contributions.push({ factor: 'fall_feed', delta: profile.season.fallBonus }); }
    if (month === 12 || month <= 2) { score += profile.season.winterPenalty; contributions.push({ factor: 'winter_slowdown', delta: profile.season.winterPenalty }); }

    const p = features.pressureTrend;
    if (p.trend === 'rapid_fall') { score += profile.pressure.rapidFallBonus; contributions.push({ factor: 'pressure_rapid_fall', delta: profile.pressure.rapidFallBonus }); }
    else if (p.trend === 'falling') { score += profile.pressure.fallingBonus; contributions.push({ factor: 'pressure_falling', delta: profile.pressure.fallingBonus }); }
    else if (p.trend === 'rising' || p.trend === 'rapid_rise') { score += profile.pressure.risingPenalty; contributions.push({ factor: 'pressure_rising', delta: profile.pressure.risingPenalty }); }

    const windMph = (features.windAvgKmh || 0) * 0.621371;
    if (windMph < 6) { score += profile.wind.calmBonus; contributions.push({ factor: 'calm_wind', delta: profile.wind.calmBonus }); }
    else if (windMph < 12) { score += profile.wind.moderateBonus; contributions.push({ factor: 'moderate_wind', delta: profile.wind.moderateBonus }); }
    else if (windMph > 17) { score += profile.wind.roughPenalty; contributions.push({ factor: 'rough_wind', delta: profile.wind.roughPenalty }); }

    if ((features.cloudAvg || 0) >= 30 && (features.cloudAvg || 0) <= 70) {
        score += profile.clouds.balancedBonus; contributions.push({ factor: 'balanced_cloud', delta: profile.clouds.balancedBonus });
    }
    if ((features.cloudAvg || 0) > 80 && waterTempF >= 66 && waterTempF <= 75) {
        score += profile.clouds.heavySpawnPenalty; contributions.push({ factor: 'spawn_cloud_adjustment', delta: profile.clouds.heavySpawnPenalty });
    }

    const precipProb = features.precipProbAvg || 0;
    if (precipProb >= 20 && precipProb <= 55) {
        score += profile.precipitation.lightRainBonus;
        contributions.push({ factor: 'light_precip_bonus', delta: profile.precipitation.lightRainBonus });
    } else if (precipProb > 75) {
        score += profile.precipitation.heavyProbPenalty;
        contributions.push({ factor: 'high_precip_penalty', delta: profile.precipitation.heavyProbPenalty });
    }

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
        const deltas = {
            pressure_hpa: Math.abs((inputs.pressureAvg ?? 0) - (previous.inputs.pressureAvg ?? 0)),
            wind_mph: Math.abs(((inputs.windAvgKmh ?? 0) - (previous.inputs.windAvgKmh ?? 0)) * 0.621371),
            precip_prob: Math.abs((inputs.precipProbAvg ?? 0) - (previous.inputs.precipProbAvg ?? 0)),
            cloud_cover: Math.abs((inputs.cloudAvg ?? 0) - (previous.inputs.cloudAvg ?? 0)),
            air_temp_f: Math.abs(cToF(inputs.tempAvgC ?? 0) - cToF(previous.inputs.tempAvgC ?? 0)),
            water_temp_f: Math.abs((inputs.waterTempF ?? 0) - (previous.inputs.waterTempF ?? 0))
        };

        const material = Object.entries(cfg.materialThresholds).some(([k, threshold]) => (deltas[k] ?? 0) >= threshold);
        if (!material && Math.abs(baseScore - previous.score) > cfg.maxDeltaWithoutMaterialChange) {
            const direction = Math.sign(baseScore - previous.score);
            nextScore = previous.score + direction * cfg.maxDeltaWithoutMaterialChange;
            reason = 'gated_non_material_change';
        }

        if (isTomorrow && localHour >= FREEZE_HOUR_LOCAL) {
            const shift = Math.abs(baseScore - previous.score);
            if (shift < cfg.majorForecastShiftScoreDelta) {
                nextScore = previous.score;
                reason = 'tomorrow_freeze_after_7pm';
            } else {
                reason = 'tomorrow_unfrozen_major_shift';
            }
        }

        if (debug) console.info('[FishCast][stability]', { key, dateKey, previous: previous.score, baseScore, nextScore, reason, deltas });
    }

    storage.set(key, { score: nextScore, inputs, updatedAt: now.toISOString() });
    return { score: nextScore, reason };
}

export function calculateSpeciesAwareDayScore({ data, dayKey, speciesKey, waterTempF, locationKey, now = new Date(), debug = false }) {
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
