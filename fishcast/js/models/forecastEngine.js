import { calculateFishingScore } from './fishingScore.js';
import { SPECIES_DATA } from '../config/species.js';
import { storage } from '../services/storage.js';

const TZ = 'America/Chicago';
const FREEZE_HOUR_LOCAL = 19;

export const SPECIES_SCORING_CONFIG = {
    bluegill: {
        temp: {
            optimal: [68, 78],
            active: [58, 86],
            coldStress: 48,
            heatStress: 90
        },
        pressure: {
            preferRange: [1008, 1018],
            fallingBonus: 7,
            rapidFallBonus: 10,
            risingPenalty: -5
        },
        wind: {
            calmBonus: 8,
            moderateBonus: 3,
            roughPenalty: -8
        },
        clouds: {
            balancedBonus: 5,
            heavySpawnPenalty: -7
        },
        stability: {
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
        }
    }
};

function getLocalHour(date, timeZone = TZ) {
    const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
}

function getLocalDateKey(date, timeZone = TZ) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
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

export function buildDayWindows(weather, dayKey) {
    const hourly = weather.forecast.hourly;
    const dayIndexes = [];

    for (let i = 0; i < hourly.time.length; i++) {
        if ((hourly.time[i] || '').startsWith(dayKey)) {
            dayIndexes.push(i);
        }
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
            precip3DayMm: (weather.historical?.daily?.precipitation_sum || []).slice(-2)
                .concat((weather.forecast?.daily?.precipitation_sum || []).slice(0, 1))
        }
    };
}

function cToF(c) {
    return (c * 9) / 5 + 32;
}

export function scoreBluegill(features, waterTempF, dateKey) {
    const cfg = SPECIES_SCORING_CONFIG.bluegill;
    let score = 52;
    const contributions = [];

    if (waterTempF >= cfg.temp.optimal[0] && waterTempF <= cfg.temp.optimal[1]) {
        score += 24; contributions.push({ factor: 'water_temp_optimal', delta: 24 });
    } else if (waterTempF >= cfg.temp.active[0] && waterTempF <= cfg.temp.active[1]) {
        score += 12; contributions.push({ factor: 'water_temp_active', delta: 12 });
    }
    if (waterTempF <= cfg.temp.coldStress) { score -= 20; contributions.push({ factor: 'cold_stress', delta: -20 }); }
    if (waterTempF >= cfg.temp.heatStress) { score -= 15; contributions.push({ factor: 'heat_stress', delta: -15 }); }

    const month = Number(dateKey.split('-')[1]);
    if (month >= 4 && month <= 6) { score += 8; contributions.push({ factor: 'spawn_window', delta: 8 }); }
    if (month >= 11 || month <= 2) { score -= 8; contributions.push({ factor: 'winter_phase', delta: -8 }); }

    const p = features.pressureTrend;
    if (p.trend === 'rapid_fall') { score += cfg.pressure.rapidFallBonus; contributions.push({ factor: 'pressure_rapid_fall', delta: cfg.pressure.rapidFallBonus }); }
    else if (p.trend === 'falling') { score += cfg.pressure.fallingBonus; contributions.push({ factor: 'pressure_falling', delta: cfg.pressure.fallingBonus }); }
    else if (p.trend === 'rising' || p.trend === 'rapid_rise') { score += cfg.pressure.risingPenalty; contributions.push({ factor: 'pressure_rising', delta: cfg.pressure.risingPenalty }); }

    const windMph = (features.windAvgKmh || 0) * 0.621371;
    if (windMph < 6) { score += cfg.wind.calmBonus; contributions.push({ factor: 'calm_wind', delta: cfg.wind.calmBonus }); }
    else if (windMph < 11) { score += cfg.wind.moderateBonus; contributions.push({ factor: 'moderate_wind', delta: cfg.wind.moderateBonus }); }
    else if (windMph > 17) { score += cfg.wind.roughPenalty; contributions.push({ factor: 'rough_wind', delta: cfg.wind.roughPenalty }); }

    if ((features.cloudAvg || 0) >= 30 && (features.cloudAvg || 0) <= 70) {
        score += cfg.clouds.balancedBonus; contributions.push({ factor: 'balanced_cloud', delta: cfg.clouds.balancedBonus });
    }
    if ((features.cloudAvg || 0) > 80 && waterTempF >= 67 && waterTempF <= 75) {
        score += cfg.clouds.heavySpawnPenalty; contributions.push({ factor: 'spawn_cloud_penalty', delta: cfg.clouds.heavySpawnPenalty });
    }

    score = clamp(Math.round(score), 0, 100);
    return { score, contributions };
}

export function getStabilityStorageKey(locationKey, speciesKey, dateKey) {
    return `fishcast_stability_${locationKey}_${speciesKey}_${dateKey}`;
}

function getStabilityProfile(speciesKey) {
    const family = SPECIES_DATA[speciesKey]?.family || '';
    const base = SPECIES_SCORING_CONFIG.bluegill.stability;
    if (family.includes('Black Bass')) {
        return { ...base, maxDeltaWithoutMaterialChange: 14, majorForecastShiftScoreDelta: 20 };
    }
    if (speciesKey.includes('crappie')) {
        return { ...base, maxDeltaWithoutMaterialChange: 10, majorForecastShiftScoreDelta: 16 };
    }
    return base;
}

export function applyStabilityControls({ baseScore, inputs, speciesKey, locationKey, dateKey, now = new Date(), debug = false }) {
    const cfg = getStabilityProfile(speciesKey);
    if (!cfg) return { score: baseScore, reason: 'no_stability_profile' };

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

        if (debug) {
            console.info('[FishCast][stability]', { key, dateKey, previous: previous.score, baseScore, nextScore, reason, deltas });
        }
    }

    storage.set(key, {
        score: nextScore,
        inputs,
        updatedAt: now.toISOString()
    });

    return { score: nextScore, reason };
}

export function calculateSpeciesAwareDayScore({ data, dayKey, speciesKey, waterTempF, locationKey, now = new Date(), debug = false }) {
    const { dayFeatures } = buildDayWindows(data.weather, dayKey);

    let base;
    let contributions;

    if (speciesKey === 'bluegill') {
        const result = scoreBluegill(dayFeatures, waterTempF, dayKey);
        base = result.score;
        contributions = result.contributions;
    } else {
        const fallback = calculateFishingScore({
            current: {
                surface_pressure: dayFeatures.pressureAvg,
                wind_speed_10m: dayFeatures.windAvgKmh,
                cloud_cover: dayFeatures.cloudAvg,
                weather_code: data.weather.forecast.current.weather_code
            },
            hourly: {
                surface_pressure: [dayFeatures.pressureAvg],
                precipitation_probability: [dayFeatures.precipProbAvg || 0]
            },
            daily: { precipitation_sum: dayFeatures.precip3DayMm || [0, 0, 0] }
        }, waterTempF, speciesKey, 50);
        base = fallback.score;
        contributions = fallback.factors || [];
    }

    const stable = applyStabilityControls({
        baseScore: base,
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
        baseScore: base,
        finalScore: stable.score,
        stabilityReason: stable.reason,
        features: dayFeatures,
        contributions
    };

    if (debug) {
        console.info('[FishCast][score-debug]', debugPacket);
    }

    return { score: stable.score, debugPacket };
}
