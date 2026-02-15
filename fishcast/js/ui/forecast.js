// Enhanced Forecast UI Rendering with Weather Icons & Clickable Days - v3.4.1 WEATHER FIX
// Physics-based water temp evolution + Wind display on forecast cards
import { SPECIES_DATA } from '../config/species.js';
import { cToF, kmhToMph, getWindDirection } from '../utils/math.js';
import { formatDate, formatDateShort } from '../utils/date.js';
import { getPressureTrend } from '../models/fishingScore.js';
import { calculateSpeciesAwareDayScore } from '../models/forecastEngine.js';
import { calculateSolunar } from '../models/solunar.js';
import { estimateTempByDepth } from '../models/waterTemp.js';
import { WATER_BODIES_V2 } from '../config/waterBodies.js';

const DEBUG = false;
const debugLog = (...args) => {
    if (DEBUG) console.log(...args);
};

// ============================================
// HELPER: Get species data
// ============================================
function getSpeciesData(species) {
    return SPECIES_DATA[species] || SPECIES_DATA['bluegill']; // Default to bluegill
}

// Get weather icon + label based on code
function getWeatherIcon(code) {
    if (code === 0) return { icon: '☀️', label: 'Clear' };
    if (code <= 3) return { icon: '⛅', label: 'Partly cloudy' };
    if (code <= 48) return { icon: '🌫️', label: 'Fog' };
    if (code <= 67) return { icon: '🌧️', label: 'Rain' };
    if (code <= 77) return { icon: '❄️', label: 'Snow' };
    if (code <= 82) return { icon: '🌦️', label: 'Showers' };
    if (code >= 95) return { icon: '⛈️', label: 'Storm' };
    return { icon: '☁️', label: 'Cloudy' };
}

// Get moon phase icon
function getMoonIcon(phase) {
    if (phase.includes('New')) return 'New';
    if (phase.includes('Waxing Crescent')) return 'Waxing crescent';
    if (phase.includes('First Quarter')) return 'First quarter';
    if (phase.includes('Waxing Gibbous')) return 'Waxing gibbous';
    if (phase.includes('Full')) return 'Full';
    if (phase.includes('Waning Gibbous')) return 'Waning gibbous';
    if (phase.includes('Last Quarter')) return 'Last quarter';
    if (phase.includes('Waning Crescent')) return 'Waning crescent';
    return 'Moon';
}

// Get pressure trend indicator
function getPressureIndicator(trend) {
    if (trend === 'rapid_fall' || trend === 'falling') return '<span class="pressure-falling">Falling</span>';
    if (trend === 'rapid_rise' || trend === 'rising') return '<span class="pressure-rising">Rising</span>';
    return '<span class="pressure-stable">Stable</span>';
}

// Get precipitation icon based on percentage
function getPrecipIcon(percentage) {
    if (percentage >= 40) return 'Likely';
    if (percentage >= 1) return 'Possible';
    return 'Low';
}



function toRating(score) {
    if (score >= 80) return { rating: 'EXCELLENT', colorClass: 'excellent' };
    if (score >= 65) return { rating: 'GOOD', colorClass: 'good' };
    if (score >= 50) return { rating: 'FAIR', colorClass: 'fair' };
    if (score >= 35) return { rating: 'POOR', colorClass: 'poor' };
    return { rating: 'BAD', colorClass: 'bad' };
}

function buildTrendLineSvg(values, {
    width = 680,
    height = 250,
    stroke = '#62d0ff',
    suffix = '',
    decimals = 0,
    gradientId = 'trendFill',
    xTicks = [],
    yAxisTitle = ''
} = {}) {
    if (!values || values.length < 2) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = { top: 20, right: 20, bottom: 46, left: 62 };
    const usableWidth = width - pad.left - pad.right;
    const usableHeight = height - pad.top - pad.bottom;

    const points = values.map((value, index) => {
        const x = pad.left + (index / (values.length - 1)) * usableWidth;
        const normalizedY = (value - min) / range;
        const y = (height - pad.bottom) - (normalizedY * usableHeight);
        return { x, y, value };
    });

    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const areaPath = `${path} L${(width - pad.right).toFixed(2)} ${(height - pad.bottom).toFixed(2)} L${pad.left.toFixed(2)} ${(height - pad.bottom).toFixed(2)} Z`;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const tickValue = min + ((1 - tick) * range);
        const y = pad.top + (tick * usableHeight);
        return {
            y,
            label: `${tickValue.toFixed(decimals)}${suffix}`
        };
    });

    const normalizedXTicks = (xTicks || []).map((tick) => {
        const index = Math.min(values.length - 1, Math.max(0, tick.index));
        const x = pad.left + (index / (values.length - 1)) * usableWidth;
        return { x, label: tick.label };
    });

    return `
        <svg viewBox="0 0 ${width} ${height}" class="trend-svg" role="img" aria-label="Trend chart">
            <defs>
                <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="${stroke}" stop-opacity="0.45"></stop>
                    <stop offset="100%" stop-color="${stroke}" stop-opacity="0.08"></stop>
                </linearGradient>
            </defs>
            <text x="16" y="${(pad.top + (usableHeight / 2)).toFixed(2)}" class="trend-axis-title" transform="rotate(-90 16 ${(pad.top + (usableHeight / 2)).toFixed(2)})">${yAxisTitle}</text>
            ${yTicks.map((tick) => `
                <g>
                    <line x1="${pad.left}" y1="${tick.y.toFixed(2)}" x2="${(width - pad.right).toFixed(2)}" y2="${tick.y.toFixed(2)}" class="trend-grid-line"></line>
                    <text x="${(pad.left - 8).toFixed(2)}" y="${(tick.y + 4).toFixed(2)}" class="trend-axis-label trend-axis-label-y">${tick.label}</text>
                </g>
            `).join('')}
            ${normalizedXTicks.map((tick) => `<text x="${tick.x.toFixed(2)}" y="${(height - 14).toFixed(2)}" class="trend-axis-label trend-axis-label-x">${tick.label}</text>`).join('')}
            <path d="${areaPath}" fill="url(#${gradientId})"></path>
            <path d="${path}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"></path>
            ${points.map((point, index) => {
                if (index !== 0 && index !== points.length - 1 && index !== Math.floor(points.length / 2)) return '';
                return `<g>
                    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="5" fill="${stroke}"></circle>
                    <text x="${point.x.toFixed(2)}" y="${(point.y - 12).toFixed(2)}" class="trend-point-label">${point.value.toFixed(decimals)}${suffix}</text>
                </g>`;
            }).join('')}
        </svg>
    `;
}

function renderTrendCharts(weather) {
    const hourly = weather.forecast.hourly || {};
    const hourlyTemps = (hourly.temperature_2m || []).slice(0, 24).map(cToF);
    const hourlyPrecip = (hourly.precipitation_probability || []).slice(0, 24);
    const hourlyTime = (hourly.time || []).slice(0, 24);

    if (hourlyTemps.length < 2 || hourlyPrecip.length < 2 || hourlyTime.length < 2) {
        return '';
    }

    const tickIndices = [0, 6, 12, 18, 23].filter((i) => hourlyTime[i]);
    const timeTicks = tickIndices.map((i) => ({
        index: i,
        label: new Date(hourlyTime[i]).toLocaleTimeString('en-US', { hour: 'numeric' })
    }));

    return `
        <div class="trend-charts-card">
            <h3>Hourly trends (next 24h)</h3>
            <div class="trend-chart-grid">
                <div class="trend-panel">
                    <div class="trend-title">Air Temperature</div>
                    ${buildTrendLineSvg(hourlyTemps, {
                        stroke: '#7ed6a5',
                        suffix: '°F',
                        decimals: 0,
                        gradientId: 'tempTrendFill',
                        xTicks: timeTicks,
                        yAxisTitle: 'Temperature'
                    })}
                </div>
                <div class="trend-panel">
                    <div class="trend-title">Chance of Precipitation</div>
                    ${buildTrendLineSvg(hourlyPrecip, {
                        stroke: '#62d0ff',
                        suffix: '%',
                        decimals: 0,
                        gradientId: 'precipTrendFill',
                        xTicks: timeTicks,
                        yAxisTitle: 'Precipitation'
                    })}
                </div>
            </div>
        </div>
    `;
}

function renderWeatherRadar(coords) {
    return `
        <div class="weather-radar-card">
            <h3>Weather radar</h3>
            <p>Live radar centered on ${coords.name}.</p>
            <iframe
                class="weather-radar-frame"
                title="Weather radar for ${coords.name}"
                src="${getRadarEmbedUrl(coords.lat, coords.lon)}"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
                allowfullscreen>
            </iframe>
        </div>
    `;
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
    
    const debugScoring = localStorage.getItem('fishcast_debug_scoring') === 'true';
    const runNow = new Date();
    const locationKey = `${coords.lat.toFixed(4)}_${coords.lon.toFixed(4)}`;

    const todayKey = weather.forecast.daily.time?.[0];
    const currentDayScore = calculateSpeciesAwareDayScore({
        data,
        dayKey: todayKey,
        speciesKey,
        waterTempF: waterTemp,
        locationKey,
        now: runNow,
        debug: debugScoring
    });
    const currentScore = { ...toRating(currentDayScore.score), score: currentDayScore.score, clarity: 'clear' };
    
    const windSpeed = kmhToMph(weather.forecast.current.wind_speed_10m);
    const windDir = getWindDirection(weather.forecast.current.wind_direction_10m);
    const pTrend = getPressureTrend(weather.forecast.hourly.surface_pressure.slice(0, 6));
    
    // Weather icon
    const weatherIcon = getWeatherIcon(weather.forecast.current.weather_code);
    const moonIcon = getMoonIcon(solunar.moon_phase);
    const precipNowMm = weather.forecast.current.precipitation || 0;
    const precipProb = getCurrentPrecipProbability(weather.forecast);
    const precipIcon = precipNowMm > 0 ? 'Likely' : getPrecipIcon(precipProb);
    const todayHighTemp = cToF(weather.forecast.daily.temperature_2m_max[0]);
    const todayLowTemp = cToF(weather.forecast.daily.temperature_2m_min[0]);
    const surfaceTemp = waterTemp.toFixed(1);
    const temp2ft = estimateTempByDepth(waterTemp, waterType, 2, new Date()).toFixed(1);
    const temp4ft = estimateTempByDepth(waterTemp, waterType, 4, new Date()).toFixed(1);
    const temp10ft = estimateTempByDepth(waterTemp, waterType, 10, new Date()).toFixed(1);
    const temp20ft = estimateTempByDepth(waterTemp, waterType, 20, new Date()).toFixed(1);
    const todaySummary = `${getWeatherDescription(weather.forecast.current.weather_code)} with a ${precipProb}% rain chance. ` +
        `Air ranges from ${todayLowTemp.toFixed(0)}°F to ${todayHighTemp.toFixed(0)}°F. ` +
        `Water temps: Surface ${surfaceTemp}°F | 2ft ${temp2ft}°F | 4ft ${temp4ft}°F | 10ft ${temp10ft}°F | 20ft ${temp20ft}°F. ` +
        `Wind: ${windSpeed.toFixed(0)} mph from the ${windDir}. ` +
        `Pressure trend: ${pTrend}.`;
    
    // NEW: Water clarity badge
    const clarityIcons = {
        clear: 'Clear',
        slightly_stained: 'Slightly stained',
        stained: 'Stained',
        muddy: 'Muddy'
    };
    const clarityBadge = clarityIcons[currentScore.clarity] || 'Normal';

    const degradedNotices = [];
    if (coords.stale) {
        degradedNotices.push(`Location fallback in use (${coords.staleReason || 'cached result'})`);
    }
    if (weather.stale) {
        degradedNotices.push(`Weather fallback in use (${weather.staleReason || 'cached result'})`);
    }

    const confidence = degradedNotices.length ? 'Moderate confidence' : 'High confidence';
    const freshness = weather.stale ? 'Cached weather' : 'Live weather';

    // Start building HTML
    let html = `
        ${degradedNotices.length ? `<div class="tips-card" style="border-left: 4px solid #b45309;"><h3>Data notice</h3>${degradedNotices.map((notice) => `<div class="tip-item">${notice}</div>`).join('')}</div>` : ''}
        <div class="score-header">
            <h2>Forecast summary</h2>
            <div class="summary-meta">
                <span class="meta-chip ${degradedNotices.length ? 'warn' : 'good'}">Confidence · ${confidence}</span>
                <span class="meta-chip ${weather.stale ? 'warn' : 'good'}">Freshness · ${freshness}</span>
                <span class="meta-chip">${speciesData.name}</span>
                <span class="meta-chip">${coords.name}</span>
            </div>
            <div class="score-display ${currentScore.colorClass}">${currentScore.score}</div>
            <div class="rating ${currentScore.colorClass}">${currentScore.rating}</div>
            <div class="summary-grid">
                <div class="summary-card"><div class="label">Conditions</div><div class="value weather-condition-value"><span class="weather-symbol">${weatherIcon.icon}</span><span>${weatherIcon.label}</span></div></div>
                <div class="summary-card"><div class="label">Air range</div><div class="value">${todayLowTemp.toFixed(0)}°F to ${todayHighTemp.toFixed(0)}°F</div></div>
                <div class="summary-card"><div class="label">Water surface</div><div class="value">${surfaceTemp}°F</div></div>
                <div class="summary-card"><div class="label">Wind</div><div class="value">${windSpeed.toFixed(0)} mph ${windDir}</div></div>
            </div>
            <div class="location-info">${todaySummary}</div>
        </div>

        ${renderTrendCharts(weather)}
        ${renderWeatherRadar(coords)}
        
        <div class="action-buttons">
            <button class="action-btn" onclick="window.shareForecast()" aria-label="Share forecast">Share</button>
        </div>
        
        <div class="details-grid">
            <div class="detail-card">
                <h3><span class="water-icon"></span>Water Conditions</h3>
                <div class="detail-row">
                    <span class="detail-label">Water Temperature</span>
                    <span class="detail-value">
                        Surface: ${waterTemp.toFixed(1)}°F<br>
                        <small style="color: var(--text-secondary);">
                            Depth: 2ft ${temp2ft}°F | 4ft: ${temp4ft}°F | 10ft: ${temp10ft}°F | 20ft: ${temp20ft}°F
                        </small>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Water Clarity</span>
                    <span class="detail-value">${clarityBadge}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fish Phase</span>
                    <span class="detail-value">${currentScore.phase.replace('_', ' ')}</span>
                </div>
            </div>
            
            <div class="detail-card">
                <h3><span class="cloud-icon"></span>Weather</h3>
                <div class="detail-row">
                    <span class="detail-label">Conditions</span>
                    <span class="detail-value"><span class="weather-symbol">${weatherIcon.icon}</span> ${getWeatherDescription(weather.forecast.current.weather_code)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Air Temperature</span>
                    <span class="detail-value">
                        ${cToF(weather.forecast.current.temperature_2m).toFixed(1)}°F 
                        <small>(feels like ${cToF(weather.forecast.current.apparent_temperature).toFixed(1)}°F)</small>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Today's Air Range</span>
                    <span class="detail-value">${todayLowTemp.toFixed(1)}°F → ${todayHighTemp.toFixed(1)}°F</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Barometric Pressure</span>
                    <span class="detail-value">${(weather.forecast.current.surface_pressure * 0.02953).toFixed(2)} inHg</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Pressure Trend</span>
                    <span class="detail-value">
                        ${getPressureIndicator(pTrend)}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Wind</span>
                    <span class="detail-value">${windSpeed.toFixed(1)} mph ${windDir}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Humidity</span>
                    <span class="detail-value">${weather.forecast.current.relative_humidity_2m}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Cloud Cover</span>
                    <span class="detail-value">${weather.forecast.current.cloud_cover}%</span>
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
                    <span class="detail-value">${moonIcon} (${solunar.moon_phase_percent}%)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Major Periods</span>
                    <span class="detail-value" style="line-height: 1.8;">
                        ${solunar.major_periods[0]}<br>
                        ${solunar.major_periods[1]}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Minor Periods</span>
                    <span class="detail-value" style="line-height: 1.8;">
                        ${solunar.minor_periods[0]}<br>
                        ${solunar.minor_periods[1]}
                    </span>
                </div>
            </div>
        </div>

    `;

    // Multi-day forecast if requested
    if (days > 1) {
        html += renderMultiDayForecast(data, weather, speciesKey, waterType, coords, waterTemp, runNow, debugScoring, locationKey);
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

function getCurrentPrecipProbability(forecast) {
    const hourlyTimes = forecast.hourly?.time || [];
    const hourlyProbabilities = forecast.hourly?.precipitation_probability || [];
    const currentTime = forecast.current?.time;
    const currentCode = forecast.current?.weather_code;
    const currentPrecipMm = forecast.current?.precipitation || 0;

    const currentIndex = currentTime ? hourlyTimes.indexOf(currentTime) : -1;
    const indexedProb = currentIndex >= 0 ? (hourlyProbabilities[currentIndex] || 0) : null;
    const fallbackProb = hourlyProbabilities[0] || forecast.daily?.precipitation_probability_max?.[0] || 0;
    const baseProb = indexedProb ?? fallbackProb;

    // Keep wet-weather condition codes aligned with what users expect in weather apps.
    const wetCodeMinimums = {
        51: 60, // Light drizzle
        53: 75, // Moderate drizzle
        55: 85, // Dense drizzle
        61: 65, // Slight rain
        63: 80, // Moderate rain
        65: 90, // Heavy rain
        80: 70,
        81: 80,
        82: 90
    };

    const codeFloor = wetCodeMinimums[currentCode] || 0;
    const activePrecipFloor = currentPrecipMm > 0 ? 95 : 0;

    return Math.max(baseProb, codeFloor, activePrecipFloor);
}

function renderMultiDayForecast(data, weather, speciesKey, waterType, coords, initialWaterTemp, runNow, debugScoring, locationKey) {
    let html = '<div class="multi-day-forecast"><h3>Extended forecast</h3><div class="forecast-days">';
    
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
    
    debugLog('Water temp evolution (physics):', waterTemps.map(t => t.toFixed(1) + '°F').join(' → '));
    
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
        
        const dayScore = calculateSpeciesAwareDayScore({
            data,
            dayKey: date,
            speciesKey,
            waterTempF: waterTemps[i],
            locationKey,
            now: runNow,
            debug: debugScoring
        });
        const estimatedScore = dayScore.score;
        const scoreClass = toRating(estimatedScore).colorClass;
        
        html += `
            <div class="forecast-day-card" onclick="window.showDayDetails(${i}, '${date}')" data-day="${i}">
                <div class="day-header">${formatDateShort(date)}</div>
                <div class="day-weather-icon" title="${weatherIcon.label}">${weatherIcon.icon}</div>
                <div class="day-score ${scoreClass}"title="Estimated fishing score">${Math.round(estimatedScore)}</div>
                <div class="day-temp">${minTemp.toFixed(0)}° → ${maxTemp.toFixed(0)}°</div>
                <div class="day-precip">${getPrecipIcon(precipProb)} ${precipProb}%</div>
                <div style="font-size: 0.85em; color: #888; margin-top: 4px;">${waterTemps[i].toFixed(1)}°F</div>
                <div style="font-size: 0.85em; color: #888;">${windSpeed.toFixed(0)} mph ${windDir}</div>
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
    const daySolunar = calculateSolunar(data.coords.lat, data.coords.lon, new Date(date));
    const moonIcon = getMoonIcon(daySolunar.moon_phase);
    const daySummary = `${weatherDesc} with ${precipProb}% rain chance. Air ${minTemp.toFixed(0)}°F to ${maxTemp.toFixed(0)}°F and winds near ${windSpeed.toFixed(0)} mph ${windDir}.`;
    
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
    const temp2ft = estimateTempByDepth(waterTempEstimate, data.waterType, 2, new Date(date));
    const temp4ft = estimateTempByDepth(waterTempEstimate, data.waterType, 4, new Date(date));
    const temp10ft = estimateTempByDepth(waterTempEstimate, data.waterType, 10, new Date(date));
    const temp20ft = estimateTempByDepth(waterTempEstimate, data.waterType, 20, new Date(date));
    
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
                    ${weatherIcon.icon} ${formatDate(date)}
                </div>
                <div style="padding: 20px 0;">
                    <div class="detail-row">
                        <span class="detail-label">Conditions</span>
                        <span class="detail-value"><span class="weather-symbol">${weatherIcon.icon}</span> ${weatherDesc}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Air Temp (High / Low)</span>
                        <span class="detail-value">${maxTemp.toFixed(1)}°F / ${minTemp.toFixed(1)}°F</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Water Temperature</span>
                        <span class="detail-value">
                            Surface: ${waterTempEstimate.toFixed(1)}°F<br>
                            <small style="color: var(--text-secondary);">
                                2ft: ${temp2ft.toFixed(1)}°F | 4ft: ${temp4ft.toFixed(1)}°F | 10ft: ${temp10ft.toFixed(1)}°F | 20ft: ${temp20ft.toFixed(1)}°F
                            </small>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Fish Phase</span>
                        <span class="detail-value">${fishPhase}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Precipitation</span>
                        <span class="detail-value">${precipIcon} ${precipProb}% chance${precipSum > 0 ? ` (${(precipSum / 25.4).toFixed(2)} in)` : ''}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Wind</span>
                        <span class="detail-value">${windSpeed.toFixed(1)} mph ${windDir}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Sunrise / Sunset</span>
                        <span class="detail-value">${sunrise} / ${sunset}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Moon Phase</span>
                        <span class="detail-value">${moonIcon} ${daySolunar.moon_phase} (${daySolunar.moon_phase_percent}%)</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Major Periods</span>
                        <span class="detail-value" style="line-height: 1.8;">
                            ${daySolunar.major_periods[0]}<br>
                            ${daySolunar.major_periods[1]}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Minor Periods</span>
                        <span class="detail-value" style="line-height: 1.8;">
                            ${daySolunar.minor_periods[0]}<br>
                            ${daySolunar.minor_periods[1]}
                        </span>
                    </div>
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border-color);">
                        <p style="color: var(--text-secondary); text-align: center; font-size: 0.9rem;">
                            <strong>Weather Summary:</strong> ${daySummary}
                        </p>
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

function getRadarEmbedUrl(lat, lon) {
    const safeLat = Number(lat).toFixed(4);
    const safeLon = Number(lon).toFixed(4);
    return `https://embed.windy.com/embed2.html?lat=${safeLat}&lon=${safeLon}&detailLat=${safeLat}&detailLon=${safeLon}&zoom=8&level=surface&overlay=radar&product=radar&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=mph&metricTemp=%C2%B0F&radarRange=-1`;
}

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
    resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>Analyzing conditions...</p></div>'; 
}

export function showError(message) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <div class="error-card" style="background: var(--bg-card); padding: 40px; border-radius: 16px; text-align: center; margin: 40px 0;">
            <h3 style="font-size: 2rem; margin-bottom: 20px;">Error</h3>
            <p id="errorMessage" style="font-size: 1.1rem; margin-bottom: 20px;"></p>
            <p style="color: var(--text-secondary);">Please try again or contact support if the problem persists.</p>
        </div>
    `;
    const messageEl = document.getElementById('errorMessage');
    if (messageEl) messageEl.textContent = message;
}
