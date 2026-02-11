// Fishing Score Calculation Model
// Analyzes weather conditions and species preferences to generate fishing scores

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

// Analyze pressure trend
export function getPressureTrend(pressureList) {
    if (pressureList.length < 2) return 'stable';
    
    const change = pressureList[pressureList.length - 1] - pressureList[0];
    const hours = pressureList.length - 1;
    const rate = change / hours;
    
    if (rate < -2) return 'rapid_fall';
    if (rate < -0.5) return 'falling';
    if (rate > 2) return 'rapid_rise';
    if (rate > 0.5) return 'rising';
    return 'stable';
}

// Main fishing score calculation
export function calculateFishingScore(weather, waterTemp, speciesKey) {
    let score = 50;
    const speciesData = SPECIES_DATA[speciesKey];
    const factors = [];
    const prefs = speciesData.preferences;
    
    // Pressure trend analysis
    const pressures = weather.hourly.surface_pressure.slice(0, 6);
    const pTrend = getPressureTrend(pressures);
    
    if (pTrend === 'rapid_fall') {
        const bonus = speciesKey === 'crappie' ? 40 : 35;
        score += bonus;
        factors.push({ name: 'Rapid pressure fall', value: bonus });
    } else if (pTrend === 'falling') {
        const bonus = speciesKey === 'crappie' ? 30 : 25;
        score += bonus;
        factors.push({ name: 'Falling pressure', value: bonus });
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
    
    // Wind analysis
    const windSpeed = kmhToMph(weather.current.wind_speed_10m);
    
    if (speciesKey === 'bass') {
        const windIdeal = prefs.wind_ideal || [5, 15];
        if (windSpeed >= windIdeal[0] && windSpeed <= windIdeal[1]) {
            score += 15;
        } else if (windSpeed > 20) {
            score -= 10;
        } else if (windSpeed > 15) {
            score += 5;
        } else {
            score += 5;
        }
    } else if (speciesKey === 'crappie') {
        if (windSpeed < 5) {
            score += 15;
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
        if (speciesKey === 'crappie') {
            score += 15;
        } else if (speciesKey === 'bass') {
            score += 8;
        } else if (speciesKey === 'bluegill' && prefs.spawn_needs_sun && waterTemp >= 67 && waterTemp <= 74) {
            score -= 5;
        }
    }
    
    // Weather code analysis
    const code = weather.current.weather_code;
    
    if (code === 51 || code === 53 || code === 61) {
        if (speciesKey === 'bass' && prefs.loves_light_rain) {
            if (pTrend === 'falling' || pTrend === 'rapid_fall') {
                score += 20;
            } else {
                score += 10;
            }
        } else if (speciesKey === 'crappie') {
            score += 5;
        }
    } else if (code === 45 || code === 48) {
        const bonus = speciesKey === 'crappie' ? 20 : 15;
        score += bonus;
    } else if (code === 95 || code === 96 || code === 99) {
        score -= 40;
    } else if (code === 63 || code === 65 || code === 80 || code === 81 || code === 82) {
        const penalty = speciesKey === 'crappie' ? -15 : -12;
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
    
    return { score, rating, colorClass, factors, phase: phase.name };
}

// Generate fishing technique tips
export function getTechniqueTips(score, waterTemp, windSpeed, weather, speciesKey) {
    const tips = [];
    
    if (waterTemp < 50) {
        tips.push("🐢 Fish are sluggish in cold water - use slow presentations and smaller baits");
        tips.push("📍 Target deeper water (15-25 ft) where fish are holding");
    } else if (waterTemp >= 58 && waterTemp <= 70) {
        tips.push("🎯 Pre-spawn/spawn period - fish are aggressive and shallow");
        tips.push("🏖️ Target shallow flats and spawning areas");
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
        if (speciesKey === 'bass' && waterTemp >= 58) {
            // Only recommend topwater when water is warm enough (58°F+)
            tips.push("🌧️ Light rain + warm water - topwater lures can be very effective!");
        } else if (speciesKey === 'bass') {
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
