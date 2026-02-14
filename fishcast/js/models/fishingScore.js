// Enhanced Fishing Score Calculation Model
// Now includes: Moon phase, water clarity, improved pressure rate

import { SPECIES_DATA } from '../config/species.js';
import { kmhToMph } from '../utils/math.js';

// Get fish phase based on water temperature
export function getFishPhase(waterTemp, speciesData) {
    for (const [phaseName, phaseData] of Object.entries(speciesData.phases)) {
        const [min, max] = phaseData.temp_range;
        if (waterTemp >= min && waterTemp < max) {
            return { name: phaseName, data: phaseData };
        }
    }
    const firstPhase = Object.keys(speciesData.phases)[0];
    return { name: firstPhase, data: speciesData.phases[firstPhase] };
}

// Calculate water clarity from Open-Meteo precipitation totals (mm)
export function calculateWaterClarity(precipLast3DaysMm) {
    // Open-Meteo daily precipitation_sum is in millimeters. Convert to inches first
    // so thresholds align with angler visibility expectations.
    const totalMm = precipLast3DaysMm.reduce((sum, val) => sum + (val || 0), 0);
    const totalInches = totalMm / 25.4;

    if (totalInches >= 1.5) return 'muddy';           // Heavy runoff
    if (totalInches >= 0.5) return 'stained';         // Noticeable stain
    if (totalInches >= 0.1) return 'slightly_stained';// Slight color
    return 'clear';
}

// NEW: Enhanced pressure rate calculation
export function getPressureRate(pressureList) {
    if (pressureList.length < 3) return { trend: 'stable', rate: 0 };
    
    // Calculate rate per hour
    const current = pressureList[pressureList.length - 1];
    const threeHoursAgo = pressureList[Math.max(0, pressureList.length - 4)];
    const hours = Math.min(3, pressureList.length - 1);
    const rate = (current - threeHoursAgo) / hours;
    
    // Classify trend
    let trend = 'stable';
    if (rate < -2) trend = 'rapid_fall';
    else if (rate < -0.5) trend = 'falling';
    else if (rate > 2) trend = 'rapid_rise';
    else if (rate > 0.5) trend = 'rising';
    
    return { trend, rate };
}

// Legacy function for compatibility
export function getPressureTrend(pressureList) {
    return getPressureRate(pressureList).trend;
}

// NEW: Calculate moon phase bonus
export function getMoonPhaseBonus(moonPhasePercent, speciesKey) {
    const speciesData = SPECIES_DATA[speciesKey];
    if (!speciesData || !speciesData.preferences || !speciesData.preferences.moon_sensitive) return 0;
    
    const isBass = speciesKey === 'bass' || speciesKey === 'smallmouth' || speciesKey === 'spotted';
    
    // Full moon (around 100%) and New moon (around 0%) are best
    // First/Last quarter (around 25%, 75%) are moderate
    
    if (moonPhasePercent >= 95 || moonPhasePercent <= 5) {
        // Full or New moon - major feeding activity
        return isBass ? 12 : 10;
    } else if (moonPhasePercent >= 45 && moonPhasePercent <= 55) {
        // First or Last Quarter
        return 5;
    } else if (moonPhasePercent >= 20 && moonPhasePercent <= 30) {
        // Waxing/Waning Crescent
        return 3;
    } else if (moonPhasePercent >= 70 && moonPhasePercent <= 80) {
        // Waxing/Waning Gibbous
        return 3;
    }
    return 0;
}

// Main fishing score calculation - ENHANCED
export function calculateFishingScore(weather, waterTemp, speciesKey, moonPhasePercent = 50) {
    let score = 50;
    const speciesData = SPECIES_DATA[speciesKey];
    
    // Defensive check - if species not found, throw helpful error
    if (!speciesData) {
        console.error(`Species "${speciesKey}" not found in SPECIES_DATA`);
        console.error('Available species:', Object.keys(SPECIES_DATA));
        throw new Error(`Unknown species: "${speciesKey}". Please select a valid species from the dropdown.`);
    }
    
    const factors = [];
    const prefs = speciesData.preferences;
    
    // Pressure analysis - ENHANCED with rate
    const pressures = weather.hourly.surface_pressure.slice(0, 6);
    const pressureAnalysis = getPressureRate(pressures);
    const pTrend = pressureAnalysis.trend;
    const pRate = pressureAnalysis.rate;
    
    // Pressure trend scoring - enhanced with rate consideration
    if (pTrend === 'rapid_fall') {
        const isCrappie = speciesKey.includes('crappie');
        const bonus = isCrappie ? 40 : 35;
        score += bonus;
        factors.push({ name: `Rapid pressure fall (${pRate.toFixed(1)} mb/hr)`, value: bonus });
    } else if (pTrend === 'falling') {
        const isCrappie = speciesKey.includes('crappie');
        const bonus = isCrappie ? 30 : 25;
        score += bonus;
        factors.push({ name: `Falling pressure (${pRate.toFixed(1)} mb/hr)`, value: bonus });
    } else if (pTrend === 'rising') {
        score -= 5;
        factors.push({ name: 'Rising pressure', value: -5 });
    }
    
    // Fish phase bonus
    const phase = getFishPhase(waterTemp, speciesData);
    let phaseBonus = phase.data.score_bonus;
    
    if (waterTemp < 50) {
        phaseBonus -= 20;
        factors.push({ name: 'Winter cold override', value: -20 });
    }
    
    score += phaseBonus;
    factors.push({ name: phase.name.replace('_', ' ') + ' phase', value: phaseBonus });
    
    // NEW: Moon phase bonus
    const moonBonus = getMoonPhaseBonus(moonPhasePercent, speciesKey);
    if (moonBonus > 0) {
        score += moonBonus;
        factors.push({ name: 'Moon phase feeding period', value: moonBonus });
    }
    
    // NEW: Water clarity analysis
    const precipLast3Days = weather.daily.precipitation_sum ? weather.daily.precipitation_sum.slice(-3) : [0, 0, 0];
    const clarity = calculateWaterClarity(precipLast3Days);
    
    if (clarity === 'stained' && prefs.stained_water_bonus) {
        score += prefs.stained_water_bonus;
        factors.push({ name: 'Stained water (bass love it!)', value: prefs.stained_water_bonus });
    } else if (clarity === 'muddy' && prefs.murky_water_penalty) {
        score -= prefs.murky_water_penalty;
        factors.push({ name: 'Muddy water (reduced visibility)', value: -prefs.murky_water_penalty });
    }
    
    // Wind analysis
    const windSpeed = kmhToMph(weather.current.wind_speed_10m);
    const isBass = speciesKey === 'bass' || speciesKey === 'smallmouth' || speciesKey === 'spotted';
    const isCrappie = speciesKey.includes('crappie');
    
    if (isBass && speciesKey === 'bass') {
        const windIdeal = prefs.wind_ideal || [5, 15];
        if (windSpeed >= windIdeal[0] && windSpeed <= windIdeal[1]) {
            score += 15;
            factors.push({ name: 'Ideal wind for bass', value: 15 });
        } else if (windSpeed > 20) {
            score -= 10;
        } else if (windSpeed > 15) {
            score += 5;
        } else {
            score += 5;
        }
    } else if (isCrappie) {
        if (windSpeed < 5) {
            score += 15;
            factors.push({ name: 'Calm conditions (crappie love it)', value: 15 });
        } else if (windSpeed < 8) {
            score += 5;
        } else if (windSpeed > 10) {
            score -= 12;
        }
    } else {
        if (windSpeed < 12) {
            score += 10;
        } else if (windSpeed > 15) {
            score -= 10;
        }
    }
    
    // Cloud cover analysis
    const clouds = weather.current.cloud_cover;
    
    if (clouds >= 30 && clouds <= 70) {
        score += 10;
    } else if (clouds > 70) {
        if (isCrappie) {
            score += 15;
        } else if (speciesKey === 'bass' || speciesKey === 'smallmouth' || speciesKey === 'spotted') {
            score += 8;
        } else if (speciesKey === 'bluegill' && prefs.spawn_needs_sun && waterTemp >= 67 && waterTemp <= 74) {
            score -= 5;
        }
    }
    
    // Weather code analysis
    const code = weather.current.weather_code;
    
    if (code === 51 || code === 53 || code === 61) {
        if ((speciesKey === 'bass' || speciesKey === 'smallmouth' || speciesKey === 'spotted') && prefs.loves_light_rain) {
            if (pTrend === 'falling' || pTrend === 'rapid_fall') {
                score += 20;
            } else {
                score += 10;
            }
        } else if (isCrappie) {
            score += 5;
        }
    } else if (code === 45 || code === 48) {
        const bonus = isCrappie ? 20 : 15;
        score += bonus;
    } else if (code === 95 || code === 96 || code === 99) {
        score -= 40;
    } else if (code === 63 || code === 65 || code === 80 || code === 81 || code === 82) {
        const penalty = isCrappie ? -15 : -12;
        score += penalty;
    }
    
    // Precipitation probability
    const precipProb = weather.hourly.precipitation_probability[0] || 0;
    if (precipProb > 70 && code !== 51 && code !== 53 && code !== 61) {
        score -= 10;
    }
    
    // Constrain score to 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    // Determine rating
    let rating = 'BAD';
    let colorClass = 'bad';
    if (score >= 80) { rating = 'EXCELLENT'; colorClass = 'excellent'; }
    else if (score >= 65) { rating = 'GOOD'; colorClass = 'good'; }
    else if (score >= 50) { rating = 'FAIR'; colorClass = 'fair'; }
    else if (score >= 35) { rating = 'POOR'; colorClass = 'poor'; }
    
    return { score, rating, colorClass, factors, phase: phase.name, clarity };
}

// Generate fishing technique tips - ENHANCED
export function getTechniqueTips(score, waterTemp, windSpeed, weather, speciesKey, clarity = 'clear') {
    const tips = [];
    const isBass = speciesKey === 'bass' || speciesKey === 'smallmouth' || speciesKey === 'spotted';
    
    if (waterTemp < 50) {
        tips.push("🐢 Fish are sluggish in cold water - use slow presentations and smaller baits");
        tips.push("📍 Target deeper water (15-25 ft) where fish are holding");
    } else if (waterTemp >= 58 && waterTemp <= 70) {
        tips.push("🎯 Pre-spawn/spawn period - fish are aggressive and shallow");
        tips.push("🏖️ Target shallow flats and spawning areas");
    }
    
    // NEW: Water clarity tips
    if (clarity === 'stained' && isBass) {
        tips.push("💧 Stained water is ideal for bass - use vibrating baits and darker colors");
    } else if (clarity === 'muddy') {
        tips.push("🌊 Muddy water - fish slow down your presentation and use loud rattles");
    } else if (clarity === 'clear') {
        tips.push("💎 Clear water - use natural colors and finesse presentations");
    }
    
    if (windSpeed < 5) {
        tips.push("🤫 Calm conditions - use stealthy approaches and natural colors");
    } else if (windSpeed >= 10) {
        tips.push("🌊 Wind creates current - fish the windward banks where food accumulates");
        tips.push("⬆️ Cast INTO the wind for better stealth");
    }
    
    const pTrend = getPressureTrend(weather.hourly.surface_pressure.slice(0, 6));
    if (pTrend === 'falling' || pTrend === 'rapid_fall') {
        tips.push("📉 Falling pressure - fish are feeding aggressively before weather change!");
    }
    
    // Fixed topwater recommendation - only when water temp is warm enough
    const code = weather.current.weather_code;
    if (code === 51 || code === 53 || code === 61) {
        if (isBass && waterTemp >= 58) {
            tips.push("🌧️ Light rain + warm water - topwater lures can be very effective!");
        } else if (isBass) {
            tips.push("🌧️ Light rain - fish are active but use subsurface lures in cold water");
        }
    }
    
    if (score >= 80) {
        tips.push("🔥 Excellent conditions - prime time for fishing!");
    } else if (score < 40) {
        tips.push("⏳ Tough conditions - focus on solunar major periods for best results");
    }
    
    return tips;
}
