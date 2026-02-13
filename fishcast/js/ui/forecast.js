// Enhanced Forecast UI Rendering with Weather Icons & Clickable Days - v3.4.1 WEATHER FIX
// Physics-based water temp evolution + Wind display on forecast cards
import { SPECIES_DATA } from '../config/species.js';
import { cToF, kmhToMph, getWindDirection } from '../utils/math.js';
import { formatDate, formatDateShort } from '../utils/date.js';
import { calculateFishingScore, getTechniqueTips, getPressureTrend } from '../models/fishingScore.js';
import { calculateSolunar } from '../models/solunar.js';
import { estimateTempByDepth } from '../models/waterTemp.js';
import { WATER_BODIES_V2 } from '../config/waterBodies.js';

// ============================================
// HELPER: Get species data
// ============================================
function getSpeciesData(species) {
    return SPECIES_DATA[species] || SPECIES_DATA['bluegill']; // Default to bluegill
}

// ============================================
// FEATURE 4: BEST TIME TO FISH SUMMARY
// ============================================

// Solunar calculations for feeding periods (LOCAL VERSION for Feature 4)
function calculateSolunarLocal(lat, lon, date) {
    // Simplified solunar - based on moon position
    const d = new Date(date);
    const hour = d.getHours();
    
    // Moon overhead/underfoot times (major periods)
    // Simplified: occurs roughly at noon and midnight
    const moonOverhead = 12;
    const moonUnderfoot = 0;
    
    const isMajorPeriod = (
        (hour >= moonOverhead - 1 && hour <= moonOverhead + 1) ||
        (hour >= moonUnderfoot && hour <= moonUnderfoot + 2) ||
        (hour >= 22)
    );
    
    // Moonrise/moonset (minor periods)
    // Simplified: dawn and dusk
    const isMinorPeriod = (
        (hour >= 5 && hour <= 7) ||
        (hour >= 17 && hour <= 19)
    );
    
    return {
        isMajorPeriod,
        isMinorPeriod
    };
}

// Calculate score for a specific hour
function calculateHourlyScore(params) {
    const {
        waterTemp,
        airTemp,
        pressure,
        pressureTrend,
        windSpeed,
        cloudCover,
        precipitation,
        moonPhase,
        solunar,
        hourOfDay,
        species
    } = params;
    
    let score = 50; // Base score
    
    // Water temperature (most important - up to 30 points)
    const speciesData = getSpeciesData(species);
    if (speciesData) {
        const optimalTemp = speciesData.phases.spawn.optimal || 
                          (speciesData.phases.spawn.min + speciesData.phases.spawn.max) / 2;
        
        const tempDiff = Math.abs(waterTemp - optimalTemp);
        
        if (tempDiff <= 2) {
            score += 30; // Perfect temp
        } else if (tempDiff <= 5) {
            score += 20; // Good temp
        } else if (tempDiff <= 10) {
            score += 10; // Okay temp
        }
    }
    
    // Pressure trend (up to 15 points)
    if (pressureTrend === 'falling') {
        score += 15; // Pre-frontal feeding
    } else if (pressureTrend === 'stable') {
        score += 8;
    } else if (pressureTrend === 'rising') {
        score += 3; // Post-frontal slowdown
    }
    
    // Solunar periods (up to 15 points)
    if (solunar.isMajorPeriod) {
        score += 15;
    } else if (solunar.isMinorPeriod) {
        score += 8;
    }
    
    // Time of day (up to 10 points)
    if ((hourOfDay >= 5 && hourOfDay <= 7) || (hourOfDay >= 17 && hourOfDay <= 20)) {
        score += 10; // Dawn/dusk prime time
    } else if (hourOfDay >= 11 && hourOfDay <= 14) {
        score -= 5; // Midday slowdown
    }
    
    // Wind (up to 10 points)
    if (windSpeed <= 5) {
        score += 10; // Calm
    } else if (windSpeed <= 10) {
        score += 5; // Light breeze
    } else if (windSpeed <= 15) {
        score += 0; // Moderate
    } else {
        score -= 10; // Too windy
    }
    
    // Cloud cover (up to 5 points)
    if (cloudCover >= 50 && cloudCover <= 80) {
        score += 5; // Overcast is good
    } else if (cloudCover < 20) {
        score -= 3; // Bright sun
    }
    
    // Precipitation (penalty)
    if (precipitation > 0.1) {
        score -= 10; // Active rain
    }
    
    // Cap at 100
    return Math.min(100, Math.max(0, score));
}

// Get pressure trend
function getPressureTrendLocal(hourlyData, currentIndex) {
    if (currentIndex < 3) return 'stable';
    
    const current = hourlyData[currentIndex].surface_pressure;
    const threeHoursAgo = hourlyData[currentIndex - 3].surface_pressure;
    
    const change = current - threeHoursAgo;
    
    if (change < -2) return 'falling';
    if (change > 2) return 'rising';
    return 'stable';
}

// Calculate best fishing times for the week
function calculateBestTimes(hourlyData, species, currentWaterTemp, location) {
    const timeslots = [];
    
    // Analyze next 7 days (168 hours)
    for (let i = 0; i < Math.min(168, hourlyData.time.length); i++) {
        const hour = {
            time: hourlyData.time[i],
            temperature_2m: hourlyData.temperature_2m[i],
            surface_pressure: hourlyData.surface_pressure[i],
            wind_speed_10m: hourlyData.wind_speed_10m[i],
            cloud_cover: hourlyData.cloud_cover[i],
            precipitation: hourlyData.precipitation[i] || 0
        };
        
        const date = new Date(hour.time);
        const hourOfDay = date.getHours();
        
        // Estimate water temp for this hour (water temp changes slowly)
        const daysSinceNow = i / 24;
        const estimatedWaterTemp = currentWaterTemp + (daysSinceNow * 0.5); // Rough estimate
        
        // Get solunar for this hour
        const solunar = calculateSolunarLocal(location.lat, location.lon, hour.time);
        
        // Calculate score
        const score = calculateHourlyScore({
            waterTemp: estimatedWaterTemp,
            airTemp: hour.temperature_2m,
            pressure: hour.surface_pressure,
            pressureTrend: getPressureTrendLocal(hourlyData, i),
            windSpeed: hour.wind_speed_10m,
            cloudCover: hour.cloud_cover,
            precipitation: hour.precipitation,
            moonPhase: 0, // Could add moon phase calculation
            solunar: solunar,
            hourOfDay: hourOfDay,
            species: species
        });
        
        timeslots.push({
            timestamp: hour.time,
            score: score,
            hour: hourOfDay,
            waterTemp: estimatedWaterTemp,
            airTemp: hour.temperature_2m,
            pressure: hour.surface_pressure,
            pressureTrend: getPressureTrendLocal(hourlyData, i),
            windSpeed: hour.wind_speed_10m,
            solunar: solunar
        });
    }
    
    // Find best 2-hour windows
    const windows = [];
    for (let i = 0; i < timeslots.length - 1; i++) {
        const avgScore = (timeslots[i].score + timeslots[i + 1].score) / 2;
        windows.push({
            startTime: timeslots[i].timestamp,
            endTime: timeslots[i + 1].timestamp,
            score: Math.round(avgScore),
            conditions: timeslots[i]
        });
    }
    
    // Sort by score and return top 5
    windows.sort((a, b) => b.score - a.score);
    return windows.slice(0, 5);
}

// Render best times widget
function renderBestTimesWidget(bestTimes, species, forecastContainer) {
    if (!bestTimes || bestTimes.length === 0) return;
    
    let html = `
        <div id="bestTimesWidget" class="best-times-widget">
            <div class="widget-header">
                <h3>🎯 Best Fishing Times This Week</h3>
                <span class="widget-subtitle">Top opportunities for catching ${species}</span>
            </div>
            <div class="best-times-list">
    `;
    
    bestTimes.forEach((slot, index) => {
        const stars = getStarRating(slot.score);
        const quality = getQualityClass(slot.score);
        const startDate = new Date(slot.startTime);
        const endDate = new Date(slot.endTime);
        
        const dayName = startDate.toLocaleDateString('en-US', { weekday: 'long' });
        const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        
        const conditions = slot.conditions;
        
        html += `
            <div class="time-slot ${quality}">
                <div class="slot-header">
                    <div class="rating">${stars}</div>
                    <div class="datetime">
                        <strong>${dayName}</strong>
                        <span>${startTime} - ${endTime}</span>
                    </div>
                    <div class="score">${slot.score}/100</div>
                </div>
                <div class="slot-details">
                    <div class="detail-row">
                        <span class="icon">🌡️</span>
                        <span>${Math.round(conditions.waterTemp)}°F</span>
                        ${getWaterTempLabel(conditions.waterTemp, species)}
                    </div>
                    <div class="detail-row">
                        <span class="icon">📊</span>
                        <span>${conditions.pressureTrend} pressure</span>
                        ${getPressureBadge(conditions.pressureTrend)}
                    </div>
                    ${conditions.solunar.isMajorPeriod ? `
                    <div class="detail-row">
                        <span class="icon">🌕</span>
                        <span>Major feeding period</span>
                        <span class="badge">Peak activity</span>
                    </div>
                    ` : ''}
                    <div class="detail-row">
                        <span class="icon">💨</span>
                        <span>${Math.round(conditions.windSpeed)} mph</span>
                        ${getWindLabel(conditions.windSpeed)}
                    </div>
                </div>
                <div class="slot-action">
                    <button class="add-calendar-btn" onclick="addToCalendar('${slot.startTime}', '${species}', ${slot.score})">
                        📅 Add to Calendar
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            <div class="widget-footer">
                <small>💡 Times shown in your local timezone</small>
            </div>
        </div>
    `;
    
    // Insert before forecast cards
    forecastContainer.insertAdjacentHTML('afterbegin', html);
}

// Helper functions
function getStarRating(score) {
    if (score >= 90) return '⭐⭐⭐⭐⭐';
    if (score >= 80) return '⭐⭐⭐⭐☆';
    if (score >= 70) return '⭐⭐⭐☆☆';
    if (score >= 60) return '⭐⭐☆☆☆';
    return '⭐☆☆☆☆';
}

function getQualityClass(score) {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    return 'fair';
}

function getWaterTempLabel(temp, species) {
    const speciesData = getSpeciesData(species);
    if (!speciesData) return '';
    
    if (temp >= speciesData.phases.spawn.min && temp <= speciesData.phases.spawn.max) {
        return '<span class="highlight">Spawn Range!</span>';
    }
    return '';
}

function getPressureBadge(trend) {
    if (trend === 'falling') {
        return '<span class="badge">Pre-frontal feeding</span>';
    } else if (trend === 'stable') {
        return '<span class="badge">Stable conditions</span>';
    }
    return '';
}

function getWindLabel(speed) {
    if (speed <= 5) return '<span class="good">Calm</span>';
    if (speed <= 10) return '<span class="good">Light breeze</span>';
    if (speed <= 15) return '<span>Moderate</span>';
    return '<span class="bad">Windy</span>';
}

// Calendar export function
window.addToCalendar = function(datetime, species, score) {
    const startTime = new Date(datetime);
    const endTime = new Date(startTime.getTime() + (2 * 60 * 60 * 1000)); // +2 hours
    
    const event = {
        title: `🎣 Fishing Trip (Score: ${score})`,
        description: `Best time to catch ${species}. Conditions are optimal!`,
        start: startTime.toISOString(),
        end: endTime.toISOString()
    };
    
    // Generate ICS file
    const ics = generateICS(event);
    
    // Download
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fishing-${startTime.getTime()}.ics`;
    a.click();
};

function generateICS(event) {
    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//FishCast//EN
BEGIN:VEVENT
UID:${Date.now()}@fishcast.app
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(new Date(event.start))}
DTEND:${formatICSDate(new Date(event.end))}
SUMMARY:${event.title}
DESCRIPTION:${event.description}
END:VEVENT
END:VCALENDAR`;
}

function formatICSDate(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

console.log('✅ Best Times feature loaded');

// Get weather icon based on code
function getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '🌨️';
    if (code <= 82) return '🌦️';
    if (code >= 95) return '⛈️';
    return '☁️';
}

// Get moon phase icon
function getMoonIcon(phase) {
    if (phase.includes('New')) return '🌑';
    if (phase.includes('Waxing Crescent')) return '🌒';
    if (phase.includes('First Quarter')) return '🌓';
    if (phase.includes('Waxing Gibbous')) return '🌔';
    if (phase.includes('Full')) return '🌕';
    if (phase.includes('Waning Gibbous')) return '🌖';
    if (phase.includes('Last Quarter')) return '🌗';
    if (phase.includes('Waning Crescent')) return '🌘';
    return '🌙';
}

// Get pressure trend indicator
function getPressureIndicator(trend) {
    if (trend === 'rapid_fall' || trend === 'falling') return '<span class="pressure-falling">Falling</span>';
    if (trend === 'rapid_rise' || trend === 'rising') return '<span class="pressure-rising">Rising</span>';
    return '<span class="pressure-stable">Stable</span>';
}

// Get precipitation icon based on percentage
function getPrecipIcon(percentage) {
    if (percentage >= 40) return '🌧️'; // Rain Likely
    if (percentage >= 1) return '🌦️';  // Chance of Rain
    return '☀️'; // Clear (0% only)
}

// ===== PHYSICS-BASED WATER TEMPERATURE EVOLUTION =====
// Calculate how water temp changes day-by-day using thermal physics
function calculateWaterTempEvolution(initialWaterTemp, forecastData, waterType, latitude) {
    const body = WATER_BODIES_V2[waterType];
    const temps = [initialWaterTemp]; // Day 0 (today)
    
    const { daily } = forecastData;
    const airTemps = daily.temperature_2m_mean || daily.temperature_2m_max; // Use what's available
    const cloudCover = daily.cloud_cover_mean || [];
    const windSpeeds = daily.wind_speed_10m_max || [];
    
    // For each future day, calculate water temp change using physics
    for (let day = 0; day < 7; day++) {
        const currentWaterTemp = temps[temps.length - 1];
        const airTemp = cToF(airTemps[day]);
        const clouds = cloudCover[day] || 50;
        const windKmh = windSpeeds[day] || 0;
        const windMph = windKmh * 0.621371;
        
        // 1. Thermal Inertia Effect (water resists change)
        const tempDelta = airTemp - currentWaterTemp;
        const baseInertia = body.thermal_lag_days === 5 ? 0.15 : 
                           body.thermal_lag_days === 10 ? 0.08 : 0.05;
        
        // Use hyperbolic tangent for realistic saturation
        const responseFactor = Math.tanh(Math.abs(tempDelta) / 15);
        const thermalChange = tempDelta * baseInertia * responseFactor;
        
        // 2. Solar Radiation Effect (clear vs cloudy)
        // Normal cloud cover varies by season (approximation)
        const normalClouds = 45; // Average
        const cloudDev = normalClouds - clouds;
        // Clear skies = more warming, cloudy = less
        const solarEffect = cloudDev * 0.05; // ±2-3°F for big deviations
        
        // 3. Wind Mixing Effect (only significant if strong AND temp difference)
        let windEffect = 0;
        if (windMph > body.mixing_wind_threshold) {
            const windExcess = windMph - body.mixing_wind_threshold;
            if (currentWaterTemp - airTemp > 5) {
                // Warm water + wind = cooling (evaporation)
                windEffect = -0.3 * windExcess;
                windEffect = Math.max(-2, windEffect); // Cap at -2°F
            } else if (airTemp - currentWaterTemp > 5) {
                // Cool water + wind = slight warming (mixing)
                windEffect = 0.15 * windExcess;
                windEffect = Math.min(1.5, windEffect); // Cap at +1.5°F
            }
        }
        
        // 4. Combine all effects
        let newTemp = currentWaterTemp + thermalChange + solarEffect + windEffect;
        
        // 5. Apply physical constraints
        const maxChange = body.max_daily_change;
        const actualChange = newTemp - currentWaterTemp;
        
        if (Math.abs(actualChange) > maxChange) {
            newTemp = currentWaterTemp + (Math.sign(actualChange) * maxChange);
        }
        
        // 6. Absolute limits
        newTemp = Math.max(32, Math.min(95, newTemp));
        
        temps.push(newTemp);
    }
    
    return temps; // Returns [day0, day1, day2, ..., day7]
}

export function renderForecast(data) {
    const { coords, waterTemp, weather, speciesKey, waterType, days } = data;
    
    const resultsDiv = document.getElementById('results');
    const speciesData = SPECIES_DATA[speciesKey];
    
    // Calculate solunar first to get moon phase
    const solunar = calculateSolunar(coords.lat, coords.lon, new Date());
    
    // Calculate today's score WITH MOON PHASE
    const currentScore = calculateFishingScore(weather.forecast, waterTemp, speciesKey, solunar.moon_phase_percent);
    
    const windSpeed = kmhToMph(weather.forecast.current.wind_speed_10m);
    const windDir = getWindDirection(weather.forecast.current.wind_direction_10m);
    const tips = getTechniqueTips(currentScore.score, waterTemp, windSpeed, weather.forecast, speciesKey, currentScore.clarity);
    const pTrend = getPressureTrend(weather.forecast.hourly.surface_pressure.slice(0, 6));
    
    // Weather icon
    const weatherIcon = getWeatherIcon(weather.forecast.current.weather_code);
    const moonIcon = getMoonIcon(solunar.moon_phase);
    const precipProb = weather.forecast.hourly.precipitation_probability[0] || 0;
    const precipIcon = getPrecipIcon(precipProb);
    
    // NEW: Accuracy estimate (will be dynamic when backend is ready)
    const reportCount = data.reportCount || 0;  // From backend
    let accuracyEstimate = '±4°F';
    let accuracyClass = 'fair';
    if (reportCount >= 20) { 
        accuracyEstimate = '±1°F'; 
        accuracyClass = 'excellent';
    } else if (reportCount >= 10) { 
        accuracyEstimate = '±1.5°F'; 
        accuracyClass = 'good';
    } else if (reportCount >= 5) { 
        accuracyEstimate = '±2°F'; 
        accuracyClass = 'good';
    } else if (reportCount > 0) { 
        accuracyEstimate = '±3°F'; 
        accuracyClass = 'fair';
    }
    
    // NEW: Water clarity badge
    const clarityIcons = {
        clear: '💎 Clear',
        slightly_stained: '🌊 Slightly Stained',
        stained: '💧 Stained',
        murky: '🌫️ Murky'
    };
    const clarityBadge = clarityIcons[currentScore.clarity] || '💧 Normal';
    
    // Start building HTML
    let html = `
        <div class="score-header">
            <h2>${weatherIcon} Today's Forecast</h2>
            <div class="score-display ${currentScore.colorClass}">${currentScore.score}</div>
            <div class="rating ${currentScore.colorClass}">${currentScore.rating}</div>
            <div class="location-info">
                📍 ${coords.name} | 🐟 ${speciesData.name}
            </div>
        </div>
        
        <div class="action-buttons">
            <button class="action-btn primary" onclick="window.openCatchLog()">📊 Log Catch</button>
            <button class="action-btn" onclick="window.shareForecast()">📱 Share</button>
            <button class="action-btn" onclick="window.saveFavorite()">⭐ Save Location</button>
            <button class="action-btn success" onclick="window.openTempReport()">🌡️ Submit Water Temp</button>
        </div>
        
        <div class="tips-card">
            <h3>🎣 Fishing Tips for Today</h3>
            ${tips.map(tip => `<div class="tip-item">${tip}</div>`).join('')}
        </div>
        
        <div class="details-grid">
            <div class="detail-card">
                <h3><span class="water-icon"></span>Water Conditions</h3>
                <div class="detail-row">
                    <span class="detail-label">Water Temperature</span>
                    <span class="detail-value">
                        🌡️ Surface: ${waterTemp.toFixed(1)}°F<br>
                        <small style="color: var(--text-secondary);">
                            📏 4ft: ${estimateTempByDepth(waterTemp, waterType, 4).toFixed(1)}°F | 
                            10ft: ${estimateTempByDepth(waterTemp, waterType, 10).toFixed(1)}°F | 
                            20ft: ${estimateTempByDepth(waterTemp, waterType, 20).toFixed(1)}°F
                        </small>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Accuracy Estimate</span>
                    <span class="detail-value ${accuracyClass}">
                        ${accuracyEstimate}${reportCount > 0 ? ` (${reportCount} reports)` : ' (no local data)'}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Water Clarity</span>
                    <span class="detail-value">${clarityBadge}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Air Temperature</span>
                    <span class="detail-value">
                        🌡️ ${cToF(weather.forecast.current.temperature_2m).toFixed(1)}°F 
                        <small>(feels like ${cToF(weather.forecast.current.apparent_temperature).toFixed(1)}°F)</small>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fish Phase</span>
                    <span class="detail-value">🐠 ${currentScore.phase.replace('_', ' ')}</span>
                </div>
            </div>
            
            <div class="detail-card">
                <h3><span class="cloud-icon"></span>Weather</h3>
                <div class="detail-row">
                    <span class="detail-label">Conditions</span>
                    <span class="detail-value">${weatherIcon} ${getWeatherDescription(weather.forecast.current.weather_code)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Barometric Pressure</span>
                    <span class="detail-value">
                        📊 ${weather.forecast.current.surface_pressure} mb 
                        <small>(${(weather.forecast.current.surface_pressure * 0.02953).toFixed(2)} inHg)</small>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Pressure Trend</span>
                    <span class="detail-value">
                        ${getPressureIndicator(pTrend)}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Wind</span>
                    <span class="detail-value">💨 ${windSpeed.toFixed(1)} mph ${windDir}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Humidity</span>
                    <span class="detail-value">💧 ${weather.forecast.current.relative_humidity_2m}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Cloud Cover</span>
                    <span class="detail-value">☁️ ${weather.forecast.current.cloud_cover}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Precipitation</span>
                    <span class="detail-value">
                        ${precipIcon} ${precipProb}% chance
                    </span>
                </div>
            </div>
            
            <div class="detail-card">
                <h3><span class="moon-icon"></span>Solunar</h3>
                <div class="detail-row">
                    <span class="detail-label">Moon Phase</span>
                    <span class="detail-value">${moonIcon} ${solunar.moon_phase} (${solunar.moon_phase_percent}%)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Major Periods</span>
                    <span class="detail-value" style="line-height: 1.8;">
                        🌟 ${solunar.major_periods[0]}<br>
                        🌟 ${solunar.major_periods[1]}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Minor Periods</span>
                    <span class="detail-value" style="line-height: 1.8;">
                        ⭐ ${solunar.minor_periods[0]}<br>
                        ⭐ ${solunar.minor_periods[1]}
                    </span>
                </div>
            </div>
        </div>
        
        <div class="detail-card" style="margin: 30px 0;">
            <h3>📡 Weather Radar</h3>
            <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-top: 15px;">
                <iframe 
                    src="https://embed.windy.com/embed2.html?lat=${coords.lat}&lon=${coords.lon}&detailLat=${coords.lat}&detailLon=${coords.lon}&width=650&height=450&zoom=8&level=surface&overlay=radar&product=radar&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=mph&metricTemp=%C2%B0F&radarRange=-1" 
                    frameborder="0" 
                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
                </iframe>
            </div>
            <p style="margin-top: 10px; color: var(--text-secondary); font-size: 0.9rem; text-align: center;">
                <small>Powered by Windy.com - Real-time radar for ${coords.name}</small>
            </p>
        </div>
    `;
    
    // Multi-day forecast if requested
    if (days > 1) {
        html += renderMultiDayForecast(weather, speciesKey, waterType, coords, waterTemp, solunar.moon_phase_percent);
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Store forecast data for sharing
    window.currentForecastData = data;
}

function getWeatherDescription(code) {
    const descriptions = {
        0: 'Clear Sky',
        1: 'Mainly Clear',
        2: 'Partly Cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Rime Fog',
        51: 'Light Drizzle',
        53: 'Moderate Drizzle',
        55: 'Dense Drizzle',
        61: 'Slight Rain',
        63: 'Moderate Rain',
        65: 'Heavy Rain',
        71: 'Slight Snow',
        73: 'Moderate Snow',
        75: 'Heavy Snow',
        80: 'Light Showers',
        81: 'Moderate Showers',
        82: 'Violent Showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with Hail',
        99: 'Severe Thunderstorm'
    };
    return descriptions[code] || 'Unknown';
}

function renderMultiDayForecast(weather, speciesKey, waterType, coords, initialWaterTemp, moonPhasePercent = 50) {
    let html = '<div class="multi-day-forecast"><h3>📅 Extended Forecast</h3><div class="forecast-days">';
    
    const dailyData = weather.forecast.daily;
    
    // 🔬 PHYSICS: Calculate water temps for all days using thermal model
    const waterTemps = calculateWaterTempEvolution(
        initialWaterTemp, 
        weather.forecast, 
        waterType,
        coords.lat
    );
    
    // Store globally for day detail modal
    window.waterTempsEvolution = waterTemps;
    
    console.log('🌡️ Water temp evolution (physics):', waterTemps.map(t => t.toFixed(1) + '°F').join(' → '));
    
    // Start from day 1 (tomorrow) instead of day 0 (today)
    for (let i = 1; i < dailyData.time.length; i++) {
        const date = dailyData.time[i];
        const maxTemp = cToF(dailyData.temperature_2m_max[i]);
        const minTemp = cToF(dailyData.temperature_2m_min[i]);
        const precipProb = dailyData.precipitation_probability_max[i];
        const weatherCode = dailyData.weather_code[i];
        const weatherIcon = getWeatherIcon(weatherCode);
        
        // Get wind data for the day
        const windSpeed = dailyData.wind_speed_10m_max ? kmhToMph(dailyData.wind_speed_10m_max[i]) : 0;
        const windDir = dailyData.wind_direction_10m_dominant ? getWindDirection(dailyData.wind_direction_10m_dominant[i]) : '';
        
        // Build a day-specific weather object and use the full scoring model
        const dayPressure = dailyData.surface_pressure_mean?.[i] || weather.forecast.current.surface_pressure || 1013;
        const dayWind = dailyData.wind_speed_10m_max?.[i] || 0;
        const dayClouds = dailyData.cloud_cover_mean?.[i] ?? weather.forecast.current.cloud_cover ?? 50;
        const dayCode = dailyData.weather_code[i];
        const dayPrecipProb = dailyData.precipitation_probability_max?.[i] || 0;

        const scoreWeather = {
            current: {
                surface_pressure: dayPressure,
                wind_speed_10m: dayWind,
                cloud_cover: dayClouds,
                weather_code: dayCode
            },
            hourly: {
                surface_pressure: [dayPressure, dayPressure, dayPressure, dayPressure, dayPressure, dayPressure],
                precipitation_probability: [dayPrecipProb]
            },
            daily: {
                precipitation_sum: dailyData.precipitation_sum || []
            }
        };

        const estimated = calculateFishingScore(scoreWeather, waterTemps[i], speciesKey, moonPhasePercent);
        const estimatedScore = estimated.score;
        const scoreClass = estimated.colorClass;
        
        html += `
            <div class="forecast-day-card" onclick="window.showDayDetails(${i}, '${date}')" data-day="${i}">
                <div class="day-header">${formatDateShort(date)}</div>
                <div style="font-size: 2rem; margin: 10px 0;">${weatherIcon}</div>
                <div class="day-score ${scoreClass}" title="Estimated fishing score">${Math.round(estimatedScore)}</div>
                <div class="day-temp">${maxTemp.toFixed(0)}° / ${minTemp.toFixed(0)}°</div>
                <div class="day-precip">${getPrecipIcon(precipProb)} ${precipProb}%</div>
                <div style="font-size: 0.85em; color: #888; margin-top: 4px;">🎯 Est. score · 💧 ${waterTemps[i].toFixed(1)}°F</div>
                <div style="font-size: 0.85em; color: #888;">💨 ${windSpeed.toFixed(0)} mph ${windDir}</div>
            </div>
        `;
    }
    
    html += '</div></div>';
    return html;
}

// Enhanced day detail modal with more information
window.showDayDetails = function(dayIndex, date) {
    const data = window.currentForecastData;
    if (!data) return;
    
    const dailyData = data.weather.forecast.daily;
    const weatherCode = dailyData.weather_code[dayIndex];
    const maxTemp = cToF(dailyData.temperature_2m_max[dayIndex]);
    const minTemp = cToF(dailyData.temperature_2m_min[dayIndex]);
    const avgAirTemp = (maxTemp + minTemp) / 2;
    const precipProb = dailyData.precipitation_probability_max[dayIndex];
    const precipSum = dailyData.precipitation_sum ? dailyData.precipitation_sum[dayIndex] : 0;
    const windSpeed = dailyData.wind_speed_10m_max ? kmhToMph(dailyData.wind_speed_10m_max[dayIndex]) : 0;
    const windDir = dailyData.wind_direction_10m_dominant ? getWindDirection(dailyData.wind_direction_10m_dominant[dayIndex]) : 'N';
    const sunrise = dailyData.sunrise ? new Date(dailyData.sunrise[dayIndex]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'N/A';
    const sunset = dailyData.sunset ? new Date(dailyData.sunset[dayIndex]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'N/A';
    const weatherIcon = getWeatherIcon(weatherCode);
    const weatherDesc = getWeatherDescription(weatherCode);
    const precipIcon = getPrecipIcon(precipProb);
    
    // 🔬 PHYSICS: Use pre-calculated water temp from thermal evolution model
    const waterTempEstimate = window.waterTempsEvolution 
        ? window.waterTempsEvolution[dayIndex] 
        : data.waterTemp + ((avgAirTemp - data.waterTemp) / 10); // Fallback if not available
    
    // Get fish phase based on estimated water temp
    const speciesData = SPECIES_DATA[data.speciesKey];
    let fishPhase = 'Unknown';
    for (const [phaseName, phaseData] of Object.entries(speciesData.phases)) {
        const [min, max] = phaseData.temp_range;
        if (waterTempEstimate >= min && waterTempEstimate < max) {
            fishPhase = phaseName.replace('_', ' ');
            break;
        }
    }
    
    // Estimate depth temps
    const temp4ft = estimateTempByDepth(waterTempEstimate, data.waterType, 4);
    const temp10ft = estimateTempByDepth(waterTempEstimate, data.waterType, 10);
    const temp20ft = estimateTempByDepth(waterTempEstimate, data.waterType, 20);
    
    // Highlight selected day
    document.querySelectorAll('.forecast-day-card').forEach(card => {
        card.classList.remove('active');
    });
    const selectedCard = document.querySelector(`.forecast-day-card[data-day="${dayIndex}"]`);
    if (selectedCard) selectedCard.classList.add('active');
    
    // Show detailed modal with water temps and fish phase
    const modalHTML = `
        <div class="modal show" id="dayDetailModal" onclick="if(event.target === this) this.classList.remove('show')">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <span class="modal-close" onclick="document.getElementById('dayDetailModal').classList.remove('show')">×</span>
                    ${weatherIcon} ${formatDate(date)}
                </div>
                <div style="padding: 20px 0;">
                    <div class="detail-row">
                        <span class="detail-label">Conditions</span>
                        <span class="detail-value">${weatherIcon} ${weatherDesc}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Air Temp (High / Low)</span>
                        <span class="detail-value">🌡️ ${maxTemp.toFixed(1)}°F / ${minTemp.toFixed(1)}°F</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Water Temperature</span>
                        <span class="detail-value">
                            💧 Surface: ${waterTempEstimate.toFixed(1)}°F<br>
                            <small style="color: var(--text-secondary);">
                                4ft: ${temp4ft.toFixed(1)}°F | 10ft: ${temp10ft.toFixed(1)}°F | 20ft: ${temp20ft.toFixed(1)}°F
                            </small>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Fish Phase</span>
                        <span class="detail-value">🐠 ${fishPhase}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Precipitation</span>
                        <span class="detail-value">${precipIcon} ${precipProb}% chance${precipSum > 0 ? ` (${precipSum.toFixed(2)} in)` : ''}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Wind</span>
                        <span class="detail-value">💨 ${windSpeed.toFixed(1)} mph ${windDir}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Sunrise / Sunset</span>
                        <span class="detail-value">🌅 ${sunrise} / 🌇 ${sunset}</span>
                    </div>
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border-color);">
                        <p style="color: var(--text-secondary); text-align: center; font-size: 0.9rem;">
                            <strong>Fishing Tip:</strong> ${getFishingTipForDay(maxTemp, minTemp, precipProb, windSpeed, waterTempEstimate)}
                        </p>
                    </div>
                    <div style="margin-top: 15px;">
                        <p style="color: var(--text-secondary); text-align: center;">
                            <small>Water temp estimated • Click outside to close</small>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove old modal if exists
    const oldModal = document.getElementById('dayDetailModal');
    if (oldModal) oldModal.remove();
    
    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

// Helper function to provide fishing tips for specific day
function getFishingTipForDay(maxTemp, minTemp, precipProb, windSpeed) {
    const avgTemp = (maxTemp + minTemp) / 2;
    
    if (precipProb > 60 && avgTemp > 60) {
        return "Fish before the rain arrives - pressure drop triggers feeding!";
    } else if (windSpeed > 15) {
        return "Strong winds - target protected coves and wind-blown banks.";
    } else if (avgTemp < 50) {
        return "Cold day - slow down your presentation and fish deeper.";
    } else if (avgTemp >= 65 && avgTemp <= 75) {
        return "Perfect temperatures - fish should be active and feeding!";
    } else if (precipProb < 20 && windSpeed < 5) {
        return "Calm, clear conditions - use natural colors and stealthy approaches.";
    }
    return "Good fishing conditions - focus on structure and cover.";
}

export function showLoading() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>🎣 Analyzing conditions...</p></div>';
}

export function showError(message) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <div class="error-card" style="background: var(--bg-card); padding: 40px; border-radius: 16px; text-align: center; margin: 40px 0;">
            <h3 style="font-size: 2rem; margin-bottom: 20px;">⚠️ Error</h3>
            <p style="font-size: 1.1rem; margin-bottom: 20px;">${message}</p>
            <p style="color: var(--text-secondary);">Please try again or contact support if the problem persists.</p>
        </div>
    `;
}
