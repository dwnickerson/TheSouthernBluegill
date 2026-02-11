// Forecast UI Rendering
import { SPECIES_DATA } from '../config/species.js';
import { cToF, kmhToMph, getWindDirection } from '../utils/math.js';
import { formatDate, formatDateShort } from '../utils/date.js';
import { calculateFishingScore, getTechniqueTips, getPressureTrend } from '../models/fishingScore.js';
import { calculateSolunar } from '../models/solunar.js';
import { estimateTempByDepth } from '../models/waterTemp.js';

export function renderForecast(data) {
    const { coords, waterTemp, tempProfile, weather, speciesKey, waterType, days } = data;
    
    const resultsDiv = document.getElementById('results');
    const speciesData = SPECIES_DATA[speciesKey];
    
    // Calculate today's score
    const currentScore = calculateFishingScore(weather.forecast, waterTemp, speciesKey);
    const solunar = calculateSolunar(coords.lat, coords.lon, new Date());
    const windSpeed = kmhToMph(weather.forecast.current.wind_speed_10m);
    const tips = getTechniqueTips(currentScore.score, waterTemp, windSpeed, weather.forecast, speciesKey);
    
    // Start building HTML
    let html = `
        <div class="score-header">
            <h2>Today's Forecast</h2>
            <div class="score-display ${currentScore.colorClass}">${currentScore.score}</div>
            <div class="rating ${currentScore.colorClass}">${currentScore.rating}</div>
            <div class="location-info">
                ${coords.name} | ${speciesData.name}
            </div>
        </div>
        
        <div class="action-buttons">
            <button class="action-btn primary" onclick="window.openCatchLog()">📊 Log Catch</button>
            <button class="action-btn" onclick="window.shareForecast()">📱 Share</button>
            <button class="action-btn" onclick="window.saveFavorite()">⭐ Save Location</button>
            <button class="action-btn success" onclick="window.openTempReport()">Submit Water Temp</button>
        </div>
        
        <div class="tips-card">
            <h3>🎣 Fishing Tips for Today</h3>
            ${tips.map(tip => `<div class="tip-item">${tip}</div>`).join('')}
        </div>
        
        <div class="details-grid">
            <div class="detail-card">
                <h3>Water Conditions</h3>
                <div class="detail-row">
                    <span class="detail-label">Water Temperature</span>
                    <span class="detail-value">
                        Surface: ${waterTemp.toFixed(1)}°F<br>
                        <small style="color: var(--text-secondary);">
                            10ft: ${estimateTempByDepth(waterTemp, waterType, 10).toFixed(1)}°F | 
                            20ft: ${estimateTempByDepth(waterTemp, waterType, 20).toFixed(1)}°F
                        </small>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Air Temperature</span>
                    <span class="detail-value">${cToF(weather.forecast.current.temperature_2m).toFixed(1)}°F (feels like ${cToF(weather.forecast.current.apparent_temperature).toFixed(1)}°F)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fish Phase</span>
                    <span class="detail-value">${currentScore.phase.replace('_', ' ')}</span>
                </div>
            </div>
            
            <div class="detail-card">
                <h3>Weather</h3>
                <div class="detail-row">
                    <span class="detail-label">Pressure</span>
                    <span class="detail-value">${weather.forecast.current.surface_pressure} mb (${(weather.forecast.current.surface_pressure * 0.02953).toFixed(2)} inHg)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Pressure Trend</span>
                    <span class="detail-value">${getPressureTrend(weather.forecast.hourly.surface_pressure.slice(0, 6)).replace('_', ' ').toUpperCase()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Wind</span>
                    <span class="detail-value">${windSpeed.toFixed(1)} mph ${getWindDirection(weather.forecast.current.wind_direction_10m)}</span>
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
                    <span class="detail-value">${weather.forecast.hourly.precipitation_probability[0] || 0}% chance</span>
                </div>
            </div>
            
            <div class="detail-card">
                <h3>Solunar</h3>
                <div class="detail-row">
                    <span class="detail-label">Moon Phase</span>
                    <span class="detail-value">${solunar.moon_phase} (${solunar.moon_phase_percent}%)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Major Periods</span>
                    <span class="detail-value">
                        ${solunar.major_periods[0]}<br>
                        ${solunar.major_periods[1]}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Minor Periods</span>
                    <span class="detail-value">
                        ${solunar.minor_periods[0]}<br>
                        ${solunar.minor_periods[1]}
                    </span>
                </div>
            </div>
        </div>
    `;
    
    // Multi-day forecast if requested
    if (days > 1) {
        html += renderMultiDayForecast(weather, speciesKey, waterType, coords);
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Store forecast data for sharing
    window.currentForecastData = data;
}

function renderMultiDayForecast(weather, speciesKey, waterType, coords) {
    let html = '<div class="multi-day-forecast"><h3>Extended Forecast</h3><div class="forecast-days">';
    
    const dailyData = weather.forecast.daily;
    
    for (let i = 0; i < dailyData.time.length; i++) {
        const date = dailyData.time[i];
        const maxTemp = cToF(dailyData.temperature_2m_max[i]);
        const minTemp = cToF(dailyData.temperature_2m_min[i]);
        const precipProb = dailyData.precipitation_probability_max[i];
        
        // Simple score estimation for future days (simplified)
        const avgTemp = (maxTemp + minTemp) / 2;
        const estimatedScore = Math.max(30, Math.min(85, 50 + (avgTemp - 60) * 0.5));
        
        let scoreClass = 'fair';
        if (estimatedScore >= 80) scoreClass = 'excellent';
        else if (estimatedScore >= 65) scoreClass = 'good';
        else if (estimatedScore >= 50) scoreClass = 'fair';
        else scoreClass = 'poor';
        
        html += `
            <div class="forecast-day-card">
                <div class="day-header">${formatDateShort(date)}</div>
                <div class="day-score ${scoreClass}">${Math.round(estimatedScore)}</div>
                <div class="day-temp">${maxTemp.toFixed(0)}° / ${minTemp.toFixed(0)}°</div>
                <div class="day-precip">💧 ${precipProb}%</div>
            </div>
        `;
    }
    
    html += '</div></div>';
    return html;
}

export function showLoading() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>Analyzing conditions...</p></div>';
}

export function showError(message) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <div class="error-card">
            <h3>⚠️ Error</h3>
            <p>${message}</p>
            <p>Please try again or contact support if the problem persists.</p>
        </div>
    `;
}
