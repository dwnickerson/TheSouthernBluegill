// Enhanced Forecast UI Rendering with Weather Icons & Clickable Days - v3.4.1 WEATHER FIX
// Physics-based water temp evolution + Wind display on forecast cards
import { SPECIES_DATA } from '../config/species.js';
import { getWindDirection } from '../utils/math.js';
import { formatDate, formatDateShort, formatTime } from '../utils/date.js';
import { calculateWaterClarity, getPressureRate } from '../models/fishingScore.js';
import { calculateSpeciesAwareDayScore } from '../models/forecastEngine.js';
import { calculateSolunar } from '../models/solunar.js';
import { buildWaterTempView, projectWaterTemps } from '../models/waterTemp.js';
import { createLogger } from '../utils/logger.js';
import { toWindMph } from '../utils/units.js';

const debugLog = createLogger('forecast');
const FISHCAST_BUILD_ID = `${Date.now()}`;

if (typeof window !== 'undefined') {
    window.__FISHCAST_BUILD__ = FISHCAST_BUILD_ID;
}

// ============================================
// HELPER: Get species data
// ============================================
function getSpeciesData(species) {
    return SPECIES_DATA[species] || SPECIES_DATA['bluegill']; // Default to bluegill
}


function toTempF(value, weather) {
    if (!Number.isFinite(value)) return 0;
    // Value is already °F from weatherAPI (temperature_unit=fahrenheit).
    return value;
}

function calculateDewPointF(tempF, humidityPercent) {
    if (!Number.isFinite(tempF) || !Number.isFinite(humidityPercent) || humidityPercent <= 0) {
        return null;
    }

    const tempC = (tempF - 32) * (5 / 9);
    const a = 17.625;
    const b = 243.04;
    const gamma = Math.log(humidityPercent / 100) + ((a * tempC) / (b + tempC));
    const dewPointC = (b * gamma) / (a - gamma);
    return (dewPointC * (9 / 5)) + 32;
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
    if (percentage >= 40) return 'Likely';
    if (percentage >= 1) return 'Possible';
    return 'Low';
}

function getNextFullMoon(date = new Date()) {
    const synodicMonthDays = 29.530588853;
    const knownNewMoonJulian = 2451550.1;
    const fullMoonAgeDays = synodicMonthDays / 2;
    const julianDay = date.getTime() / 86400000 + 2440587.5;
    const moonAge = (julianDay - knownNewMoonJulian) % synodicMonthDays;
    const normalizedAge = moonAge < 0 ? moonAge + synodicMonthDays : moonAge;
    const daysUntilFull = (fullMoonAgeDays - normalizedAge + synodicMonthDays) % synodicMonthDays;
    const daysAhead = daysUntilFull === 0 ? synodicMonthDays : daysUntilFull;
    return new Date(date.getTime() + (daysAhead * 24 * 60 * 60 * 1000));
}

function getDaysUntilDate(targetDate, referenceDate = new Date()) {
    const utcTarget = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const utcReference = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    const dayDiff = Math.round((utcTarget - utcReference) / 86400000);
    return Math.max(dayDiff, 0);
}

function toPrecipInches(value, weather) {
    if (!Number.isFinite(value)) return 0;
    const units = String(weather?.forecast?.daily_units?.precipitation_sum || weather?.meta?.units?.precip || 'in').toLowerCase();
    if (units.includes('in')) return value;
    if (units.includes('mm')) return value;
    return value;
}

function toPressureInHg(pressureHpa) {
    if (!Number.isFinite(pressureHpa)) return null;
    return pressureHpa * 0.02953;
}

function getDailyPressureSummary(hourlyForecast, targetDate) {
    const hourlyTimes = hourlyForecast?.time || [];
    const hourlyPressure = hourlyForecast?.surface_pressure || [];
    const rows = [];

    hourlyTimes.forEach((timestamp, index) => {
        const [dayKey] = String(timestamp).split('T');
        if (dayKey !== targetDate) return;

        const pressureHpa = Number(hourlyPressure[index]);
        if (!Number.isFinite(pressureHpa)) return;

        rows.push({
            time: timestamp,
            pressure: pressureHpa
        });
    });

    if (!rows.length) {
        return {
            pressureInHg: null,
            pressureStatus: 'unknown'
        };
    }

    const avgPressure = rows.reduce((sum, row) => sum + row.pressure, 0) / rows.length;
    const trend = getPressureRate(
        rows.map((row) => row.pressure),
        rows.map((row) => row.time)
    ).trend;

    return {
        pressureInHg: toPressureInHg(avgPressure),
        pressureStatus: trend
    };
}

function getHourlyDetailRowsForDate(hourlyForecast, targetDate, windUnitHint = '') {
    const hourlyTimes = hourlyForecast.time || [];
    const hourlyTemps = hourlyForecast.temperature_2m || [];
    const hourlyPrecip = hourlyForecast.precipitation_probability || [];
    const hourlyWindSpeed = hourlyForecast.wind_speed_10m || [];

    const detailRows = [];

    hourlyTimes.forEach((timestamp, index) => {
        const [dayKey, timePartRaw = '00:00'] = String(timestamp).split('T');
        if (dayKey !== targetDate) return;

        const hour24 = Number.parseInt(timePartRaw.slice(0, 2), 10);
        const safeHour24 = Number.isFinite(hour24) ? hour24 : 0;
        const hour12 = safeHour24 % 12 || 12;
        const meridiem = safeHour24 >= 12 ? 'PM' : 'AM';

        const tempF = toTempF(hourlyTemps[index], { forecast: { hourly_units: hourlyForecast?.hourly_units || {} } });
        const precipChance = Number.isFinite(hourlyPrecip[index]) ? hourlyPrecip[index] : 0;
        const windUnit = windUnitHint || hourlyForecast?.units?.wind_speed_10m || hourlyForecast?.wind_speed_10m_unit || '';
        const windMph = Number.isFinite(hourlyWindSpeed[index]) ? (toWindMph(hourlyWindSpeed[index], windUnit) ?? 0) : 0;

        detailRows.push({
            index: detailRows.length,
            timeLabel: `${hour12} ${meridiem}`,
            tempF,
            precipChance,
            windMph
        });
    });

    return detailRows;
}


function isWaterTempTraceEnabled() {
    try {
        return typeof window !== 'undefined' && window.localStorage?.getItem('fishcast_debug_water_temp') === 'true';
    } catch (error) {
        return false;
    }
}

function isWaterTempDebugEnabled() {
    return typeof window !== 'undefined' && window.__DEBUG_WATER_TEMP === true;
}

function logWaterTempTrace(message, data) {
    if (!isWaterTempDebugEnabled()) return;
    console.log(`[UI water temp trace] ${message}`, data);
}

function buildWaterTempViewModel({ anchorDate, waterTempView }) {
    const viewModel = waterTempView;
    if (!viewModel) {
        throw new Error('Missing canonical data.waterTempView; renderForecast must not recompute water temperature context in UI.');
    }

    // Single source of truth: renderForecast uses this physics-resolved view as-is.
    return {
        ...viewModel,
        surface: viewModel.surfaceNow,
        surfaceDaily: Number(viewModel.surfaceNow.toFixed(1)),
        surfaceLabel: 'Surface (now)',
        mode: 'live',
        periods: {
            sunrise: viewModel.sunrise,
            midday: viewModel.midday,
            sunset: viewModel.sunset
        },
        date: anchorDate ? new Date(anchorDate) : null
    };
}

function renderWaterPeriodBreakdown({ periods, surfaceLabel = 'Surface (now)', surfaceValue = null, depthTemps = null }) {
    const sunriseDepths = depthTemps?.sunrise;
    const middayDepths = depthTemps?.midday;
    const sunsetDepths = depthTemps?.sunset;
    const depthLine = (label, values) => {
        if (!values) return `<strong>${label}:</strong> N/A`;
        return `<strong>${label}:</strong> 2ft: ${values.temp2ft}°F | 4ft: ${values.temp4ft}°F | 10ft: ${values.temp10ft}°F | 20ft: ${values.temp20ft}°F`;
    };
    const surfaceHeader = Number.isFinite(surfaceValue)
        ? `<strong>${surfaceLabel}:</strong> <span data-water-field="surface">${surfaceValue.toFixed(1)}°F</span><br>`
        : '';

    return `
        <small style="color: var(--text-secondary); display: block; margin-top: 6px; line-height: 1.5;">
            ${surfaceHeader}
            <strong>Sunrise temp:</strong> <span data-water-field="sunrise">${periods.sunrise.toFixed(1)}°F</span><br>
            <strong>Midday temp:</strong> <span data-water-field="midday">${periods.midday.toFixed(1)}°F</span><br>
            <strong>Sunset temp:</strong> <span data-water-field="sunset">${periods.sunset.toFixed(1)}°F</span>
            <details style="margin-top: 6px;">
                <summary style="cursor: pointer;">Show depth temps</summary>
                ${depthLine('Sunrise depths', sunriseDepths)}<br>
                ${depthLine('Midday depths', middayDepths)}<br>
                ${depthLine('Sunset depths', sunsetDepths)}
            </details>
        </small>
    `;
}

function assertCanonicalWaterTempView(data) {
    const isDev = typeof process === 'undefined' || process?.env?.NODE_ENV !== 'production';
    if (!isDev) return;

    const required = ['surfaceNow', 'sunrise', 'midday', 'sunset', 'depthTemps'];
    const missing = required.filter((key) => data?.waterTempView?.[key] == null);
    if (missing.length) {
        throw new Error(`Missing required canonical waterTempView fields: ${missing.join(', ')}`);
    }
}

function renderDayDetailTrendCharts(hourlyDetails, dayIndex) {
    if (!hourlyDetails || hourlyDetails.length < 2) return '';

    const temps = hourlyDetails.map((hour) => hour.tempF);
    const precip = hourlyDetails.map((hour) => hour.precipChance);
    const wind = hourlyDetails.map((hour) => hour.windMph);

    const tickIndices = [0, Math.floor((hourlyDetails.length - 1) / 2), hourlyDetails.length - 1]
        .filter((value, index, array) => array.indexOf(value) === index);
    const timeTicks = tickIndices.map((i) => ({
        index: i,
        label: hourlyDetails[i].timeLabel
    }));

    return `
        <div class="day-detail-trend-block">
            <div class="trend-chart-grid">
                <div class="trend-panel">
                    <div class="trend-title">Hourly Air Temperature</div>
                    ${buildTrendLineSvg(temps, {
                        stroke: '#7ed6a5',
                        suffix: '°F',
                        decimals: 0,
                        gradientId: `dayTempTrendFill${dayIndex}`,
                        xTicks: timeTicks,
                        yAxisTitle: 'Temperature'
                    })}
                </div>
                <div class="trend-panel">
                    <div class="trend-title">Hourly Rain Chance</div>
                    ${buildTrendLineSvg(precip, {
                        stroke: '#62d0ff',
                        suffix: '%',
                        decimals: 0,
                        gradientId: `dayPrecipTrendFill${dayIndex}`,
                        xTicks: timeTicks,
                        yAxisTitle: 'Precipitation'
                    })}
                </div>
                <div class="trend-panel">
                    <div class="trend-title">Hourly Wind</div>
                    ${buildTrendLineSvg(wind, {
                        stroke: '#f8c471',
                        suffix: ' mph',
                        decimals: 0,
                        gradientId: `dayWindTrendFill${dayIndex}`,
                        xTicks: timeTicks,
                        yAxisTitle: 'Wind'
                    })}
                </div>
            </div>
        </div>
    `;
}



function toRating(score) {
    if (score >= 80) return { rating: 'EXCELLENT', colorClass: 'excellent' };
    if (score >= 65) return { rating: 'GOOD', colorClass: 'good' };
    if (score >= 50) return { rating: 'FAIR', colorClass: 'fair' };
    if (score >= 35) return { rating: 'POOR', colorClass: 'poor' };
    return { rating: 'BAD', colorClass: 'bad' };
}

function getFishPhaseLabel(speciesData, waterTempF) {
    if (!speciesData?.phases || typeof waterTempF !== 'number') {
        return 'Unknown';
    }

    for (const [phaseName, phaseData] of Object.entries(speciesData.phases)) {
        const [min, max] = phaseData.temp_range;
        if (waterTempF >= min && waterTempF < max) {
            return phaseName.replaceAll('_', ' ');
        }
    }

    return 'Unknown';
}

function deriveWaterClarity(weather) {
    const historicalPrecip = weather?.historical?.daily?.precipitation_sum;
    const forecastPrecip = weather?.forecast?.daily?.precipitation_sum;
    const hourlyTimes = weather?.forecast?.hourly?.time;
    const hourlyPrecip = weather?.forecast?.hourly?.precipitation;
    const nowHourIndex = Number.isInteger(weather?.meta?.nowHourIndex)
        ? weather.meta.nowHourIndex
        : null;
    const todayKey = Array.isArray(forecastPrecip) && Array.isArray(weather?.forecast?.daily?.time)
        ? weather.forecast.daily.time[0]
        : null;

    const recentHistorical = Array.isArray(historicalPrecip)
        ? historicalPrecip.slice(-2)
        : [];

    const todayObserved = (() => {
        if (!Array.isArray(hourlyTimes) || !Array.isArray(hourlyPrecip) || nowHourIndex === null || !todayKey) {
            return null;
        }

        const boundedNowIndex = Math.min(nowHourIndex, hourlyTimes.length - 1, hourlyPrecip.length - 1);
        if (boundedNowIndex < 0) return null;

        let sum = 0;
        for (let i = 0; i <= boundedNowIndex; i += 1) {
            const [dayKey] = String(hourlyTimes[i] || '').split('T');
            if (dayKey !== todayKey) continue;
            sum += Number(hourlyPrecip[i]) || 0;
        }

        return sum;
    })();

    const todayPrecip = Number.isFinite(todayObserved)
        ? todayObserved
        : (Array.isArray(forecastPrecip) ? (Number(forecastPrecip[0]) || 0) : 0);

    const precipLast3Days = [...recentHistorical, todayPrecip]
        .map((value) => Number(value) || 0)
        .slice(-3);

    return calculateWaterClarity(precipLast3Days);
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

    const lineColor = `var(--${stroke.replace(/^--/, '')})`;

    return `
        <svg viewBox="0 0 ${width} ${height}" class="trend-svg" role="img" aria-label="Trend chart">
            <defs>
                <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.45"></stop>
                    <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.08"></stop>
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
            <path d="${path}" fill="none" stroke="${lineColor}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"></path>
            ${points.map((point, index) => {
                if (index !== 0 && index !== points.length - 1 && index !== Math.floor(points.length / 2)) return '';
                return `<g>
                    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="5" fill="${lineColor}"></circle>
                    <text x="${point.x.toFixed(2)}" y="${(point.y - 12).toFixed(2)}" class="trend-point-label">${point.value.toFixed(decimals)}${suffix}</text>
                </g>`;
            }).join('')}
        </svg>
    `;
}

function renderTrendCharts(weather) {
    const hourly = weather.forecast.hourly || {};
    const hourlyTemps = (hourly.temperature_2m || []).slice(0, 24);
    const hourlyPrecip = (hourly.precipitation_probability || []).slice(0, 24);
    const windUnit = weather?.forecast?.hourly_units?.wind_speed_10m || weather?.forecast?.current_units?.wind_speed_10m || '';
    const hourlyWind = (hourly.wind_speed_10m || []).slice(0, 24).map((value) => toWindMph(value, windUnit) ?? 0);
    const hourlyTime = (hourly.time || []).slice(0, 24);

    if (hourlyTemps.length < 2 || hourlyPrecip.length < 2 || hourlyWind.length < 2 || hourlyTime.length < 2) {
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
                        stroke: '--trend-temp-line',
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
                        stroke: '--trend-precip-line',
                        suffix: '%',
                        decimals: 0,
                        gradientId: 'precipTrendFill',
                        xTicks: timeTicks,
                        yAxisTitle: 'Precipitation'
                    })}
                </div>
                <div class="trend-panel">
                    <div class="trend-title">Wind Speed</div>
                    ${buildTrendLineSvg(hourlyWind, {
                        stroke: '--trend-wind-line',
                        suffix: ' mph',
                        decimals: 0,
                        gradientId: 'windTrendFill',
                        xTicks: timeTicks,
                        yAxisTitle: 'Wind'
                    })}
                </div>
            </div>
        </div>
    `;
}

function renderWeatherRadar(coords) {
    const lat = Number(coords?.lat);
    const lon = Number(coords?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return `
            <div class="weather-radar-card">
                <h3>Weather radar</h3>
                <p>Radar unavailable for this location right now.</p>
            </div>
        `;
    }

    const radarParams = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        width: '900',
        height: '500',
        zoom: '8',
        level: 'surface',
        overlay: 'radar',
        product: 'radar',
        menu: 'false',
        message: 'false',
        marker: 'false',
        calendar: 'false',
        pressure: 'false',
        type: 'map',
        metricWind: 'mph',
        metricTemp: '°F'
    });

    return `
        <div class="weather-radar-card">
            <h3>Weather radar</h3>
            <p>Live radar map centered on ${coords.name}.</p>
            <div class="weather-radar-shell">
                <iframe
                    class="weather-radar-frame"
                    title="Weather radar for ${coords.name}"
                    loading="lazy"
                    referrerpolicy="no-referrer-when-downgrade"
                    src="https://embed.windy.com/embed2.html?${radarParams.toString()}">
                </iframe>
            </div>
            <small data-radar-status="true" style="color: var(--text-secondary);"></small>
        </div>
    `;
}

async function hydrateRadarTiles(coords) {
    const radarStatus = document.querySelector('[data-radar-status="true"]');
    if (!coords || !radarStatus) return;
    radarStatus.textContent = `Centered at ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)} · live radar`;
}

function getIsoDateInTimezone(date, timezone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(date);
}

export function renderForecast(data) {
    const { coords, weather, speciesKey, waterType, days } = data;
    
    const resultsDiv = document.getElementById('results');
    const speciesData = SPECIES_DATA[speciesKey];
    
    // Calculate solunar first to get moon phase
    const solunar = calculateSolunar(coords.lat, coords.lon, new Date());
    
    const debugScoring = localStorage.getItem('fishcast_debug_scoring') === 'true';
    const runNow = data?.runNow ? new Date(data.runNow) : new Date(data?.waterContext?.anchorDateISOZ || Date.now());
    const locationKey = `${coords.lat.toFixed(4)}_${coords.lon.toFixed(4)}`;

    if (isWaterTempDebugEnabled() && !window.__fishcastWaterTempFingerprintLogged) {
        window.__fishcastWaterTempFingerprintLogged = true;
        const idx = data?.waterContext?.nowHourIndex;
        const hourlyNow = Number.isInteger(idx)
            ? weather?.forecast?.hourly?.time?.[idx] ?? null
            : null;
        console.info('[FishCast][waterTemp][render-fingerprint]', {
            anchorDateISOZ: data?.waterContext?.anchorDateISOZ ?? null,
            timezone: data?.waterContext?.timezone || weather?.forecast?.timezone || weather?.meta?.timezone || 'UTC',
            nowHourIndex: idx ?? null,
            forecastNowHourTime: hourlyNow,
            forecastCurrentTemp: weather?.forecast?.current?.temperature_2m ?? null
        });
    }

    assertCanonicalWaterTempView(data);
    const waterTempView = buildWaterTempViewModel({
        waterTempView: data.waterTempView,
        anchorDate: data?.waterContext?.anchorDateISOZ
    });
    const canonicalWaterTemp = waterTempView.surfaceNow;

    const todayKey = weather.forecast.daily.time?.[0];
    const currentDayScore = calculateSpeciesAwareDayScore({
        data,
        dayKey: todayKey,
        speciesKey,
        waterTempF: canonicalWaterTemp,
        locationKey,
        now: runNow,
        debug: debugScoring
    });
    const currentScore = {
        ...toRating(currentDayScore.score),
        score: currentDayScore.score,
        clarity: deriveWaterClarity(weather)
    };
    const currentPhaseLabel = getFishPhaseLabel(speciesData, canonicalWaterTemp);
    
    const windUnit = weather?.forecast?.current_units?.wind_speed_10m || weather?.forecast?.hourly_units?.wind_speed_10m || '';
    const windSpeed = toWindMph(weather.forecast.current.wind_speed_10m, windUnit) ?? 0;
    const windDir = getWindDirection(weather.forecast.current.wind_direction_10m);
    const pressureSeries = weather?.forecast?.hourly?.surface_pressure || [];
    const pressureTimes = weather?.forecast?.hourly?.time || [];
    const pTrend = getPressureRate(pressureSeries, pressureTimes).trend;
    
    // Weather icon
    const weatherIcon = getWeatherIcon(weather.forecast.current.weather_code);
    const moonIcon = getMoonIcon(solunar.moon_phase);
    const nextFullMoon = getNextFullMoon(new Date());
    const nextFullMoonDateLabel = nextFullMoon.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    const daysUntilFullMoon = getDaysUntilDate(nextFullMoon);
    const nextFullMoonLabel = `${nextFullMoonDateLabel}. (${daysUntilFullMoon} ${daysUntilFullMoon === 1 ? 'day' : 'days'})`;
    const officialSunrise = weather.forecast.daily?.sunrise?.[0]
        ? formatTime(weather.forecast.daily.sunrise[0])
        : 'N/A';
    const officialSunset = weather.forecast.daily?.sunset?.[0]
        ? formatTime(weather.forecast.daily.sunset[0])
        : 'N/A';
    const precipNowIn = weather.forecast.current.precipitation || 0;
    const precipProb = getCurrentPrecipProbability(weather.forecast);
    const precipIcon = precipNowIn > 0 ? 'Likely' : getPrecipIcon(precipProb);
    const todayPrecipIn = weather.forecast.daily?.precipitation_sum?.[0] || 0;
    const todayHighTemp = toTempF(weather.forecast.daily.temperature_2m_max[0], weather);
    const todayLowTemp = toTempF(weather.forecast.daily.temperature_2m_min[0], weather);
    const currentAirTemp = toTempF(weather.forecast.current.temperature_2m, weather);
    const feelsLikeTemp = toTempF(weather.forecast.current.apparent_temperature, weather);
    const humidity = Number(weather.forecast.current.relative_humidity_2m) || 0;
    const dewPointF = calculateDewPointF(currentAirTemp, humidity);
    
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
                <div class="summary-card"><div class="label">Air temp</div><div class="value">${currentAirTemp.toFixed(0)}°F</div></div>
                <div class="summary-card"><div class="label">Feels like</div><div class="value">${feelsLikeTemp.toFixed(0)}°F</div></div>
                <div class="summary-card"><div class="label">Water surface</div><div class="value" data-water-field="surface">${waterTempView.surfaceNow.toFixed(1)}°F</div></div>
                <div class="summary-card"><div class="label">Wind</div><div class="value">${windSpeed.toFixed(0)} mph ${windDir}</div></div>
                <div class="summary-card"><div class="label">Humidity / Dew point</div><div class="value">${humidity.toFixed(0)}% · ${dewPointF?.toFixed(0) ?? 'N/A'}°F</div></div>
            </div>
        </div>

        ${renderTrendCharts(weather)}
        ${renderWeatherRadar(coords)}
        
        <div class="details-grid">
            <div class="detail-card">
                <h3><span class="water-icon"></span>Water Conditions</h3>
                <div class="detail-row">
                    <span class="detail-label">Water Temperature</span>
                    <span class="detail-value">
                        ${renderWaterPeriodBreakdown({ periods: waterTempView.periods, surfaceLabel: waterTempView.surfaceLabel, surfaceValue: waterTempView.surfaceNow, depthTemps: waterTempView.depthTemps })}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Water Clarity</span>
                    <span class="detail-value">${clarityBadge}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fish Phase</span>
                    <span class="detail-value">${currentPhaseLabel}</span>
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
                        ${currentAirTemp.toFixed(1)}°F 
                        <small>(feels like ${toTempF(weather.forecast.current.apparent_temperature, weather).toFixed(1)}°F)</small>
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
                    <span class="detail-value">${humidity}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Dew Point</span>
                    <span class="detail-value">${dewPointF?.toFixed(1) ?? 'N/A'}°F</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Cloud Cover</span>
                    <span class="detail-value">${weather.forecast.current.cloud_cover}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Precipitation</span>
                    <span class="detail-value">
                        ${precipIcon} ${precipProb}% chance (${todayPrecipIn.toFixed(2)} in)
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
                    <span class="detail-label">Sunrise</span>
                    <span class="detail-value">${officialSunrise}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Sunset</span>
                    <span class="detail-value">${officialSunset}</span>
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
                <div class="detail-row">
                    <span class="detail-label">Next Full Moon</span>
                    <span class="detail-value">${nextFullMoonLabel}</span>
                </div>
            </div>
        </div>

    `;

    // Multi-day forecast if requested
    if (days > 1) {
        html += renderMultiDayForecast(data, weather, speciesKey, waterType, coords, canonicalWaterTemp, runNow, debugScoring, locationKey, data.waterTempsEvolution);
    }

    html += `
        <div class="action-buttons action-buttons-bottom">
            <button class="action-btn share-forecast-btn" onclick="window.shareForecast()" aria-label="Share forecast">Share Forecast</button>
        </div>
        ${isWaterTempTraceEnabled() ? `<div class="debug-build-stamp" style="margin-top:8px; font-size:0.85rem; color: var(--text-secondary);">Build ID: ${window.__FISHCAST_BUILD__}</div>` : ''}
    `;
    
    resultsDiv.innerHTML = html;
    if (isWaterTempDebugEnabled()) {
        console.log('[FISHCAST BUILD]', { buildId: window.__FISHCAST_BUILD__ });
    }
    hydrateRadarTiles(coords);
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
    const currentPrecipIn = forecast.current?.precipitation || 0;

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
    const activePrecipFloor = currentPrecipIn > 0 ? 95 : 0;

    return Math.max(baseProb, codeFloor, activePrecipFloor);
}

function getDayWaterTempView({ waterTemp, waterType, waterContext, dateIso }) {
    const baseHour = String(waterContext?.hourlyNowTimeISOZ || '2000-01-01T12:00:00.000Z').slice(11, 13);
    const anchorDateISOZ = `${dateIso}T${baseHour}:00:00.000Z`;
    const context = {
        ...waterContext,
        anchorDateISOZ,
        hourlyNowTimeISOZ: anchorDateISOZ
    };
    return buildWaterTempView({ dailySurfaceTemp: waterTemp, waterType, context });
}

function renderMultiDayForecast(data, weather, speciesKey, waterType, coords, initialWaterTemp, runNow, debugScoring, locationKey, precomputedWaterTemps = null) {
    let html = '<div class="multi-day-forecast"><h3>Extended forecast</h3><div class="forecast-days">';
    
    const dailyData = weather.forecast.daily;
    
    // 🔬 PHYSICS: Calculate water temps for all days using thermal model
    const waterTemps = Array.isArray(precomputedWaterTemps) && precomputedWaterTemps.length === dailyData.time.length
        ? precomputedWaterTemps
        : projectWaterTemps(
            initialWaterTemp,
            weather.forecast,
            waterType,
            coords.lat,
            {
                anchorDate: runNow,
                tempUnit: weather?.meta?.units?.temp || 'F',
                precipUnit: weather?.meta?.units?.precip || 'in',
                historicalDaily: weather?.historical?.daily || {},
                context: data.waterContext,
                debug: localStorage.getItem('fishcast_debug_water_temp') === 'true'
            }
        );
    
    // Store globally for day detail modal
    window.waterTempsEvolution = waterTemps;
    
    debugLog('Water temp evolution (physics):', waterTemps.map(t => t.toFixed(1) + '°F').join(' → '));
    
    const timezone = weather?.forecast?.timezone || weather?.meta?.timezone || 'UTC';
    const todayIso = getIsoDateInTimezone(runNow, timezone);

    // Exclude current day from the "Extended forecast" regardless of timezone alignment.
    for (let i = 0; i < dailyData.time.length; i++) {
        const date = dailyData.time[i];
        if (date <= todayIso) continue;
        const maxTemp = toTempF(dailyData.temperature_2m_max[i], weather);
        const minTemp = toTempF(dailyData.temperature_2m_min[i], weather);
        const precipProb = dailyData.precipitation_probability_max[i];
        const weatherCode = dailyData.weather_code[i];
        const weatherIcon = getWeatherIcon(weatherCode);
        const precipAmountInches = toPrecipInches(dailyData.precipitation_sum?.[i], weather);
        const dayWaterView = getDayWaterTempView({ waterTemp: waterTemps[i], waterType, waterContext: data.waterContext, dateIso: date });
        
        // Get wind data for the day
        const windSpeed = dailyData.wind_speed_10m_max ? toWindMph(dailyData.wind_speed_10m_max[i], weather?.forecast?.daily_units?.wind_speed_10m_max || weather?.forecast?.hourly_units?.wind_speed_10m || '') ?? 0 : 0;
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
                <div class="day-precip">${precipProb}% rain</div>
                <div style="font-size: 0.85em; color: #888; margin-top: 4px;">Water: ${dayWaterView.sunrise.toFixed(0)}° / ${dayWaterView.midday.toFixed(0)}° / ${dayWaterView.sunset.toFixed(0)}°F</div>
                <div style="font-size: 0.85em; color: #888;">${windSpeed.toFixed(0)} mph ${windDir}</div>
                <div class="day-hourly-trend">${precipAmountInches.toFixed(2)} in</div>
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
    const maxTemp = toTempF(dailyData.temperature_2m_max[dayIndex], data.weather);
    const minTemp = toTempF(dailyData.temperature_2m_min[dayIndex], data.weather);
    const avgAirTemp = (maxTemp + minTemp) / 2;
    const precipProb = dailyData.precipitation_probability_max[dayIndex];
    const precipSum = dailyData.precipitation_sum ? dailyData.precipitation_sum[dayIndex] : 0;
    const precipAmountInches = toPrecipInches(precipSum, data.weather);
    const windSpeed = dailyData.wind_speed_10m_max ? toWindMph(dailyData.wind_speed_10m_max[dayIndex], data.weather?.forecast?.daily_units?.wind_speed_10m_max || data.weather?.forecast?.hourly_units?.wind_speed_10m || '') ?? 0 : 0;
    const windDir = dailyData.wind_direction_10m_dominant ? getWindDirection(dailyData.wind_direction_10m_dominant[dayIndex]) : 'N';
    const sunrise = dailyData.sunrise ? new Date(dailyData.sunrise[dayIndex]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'N/A';
    const sunset = dailyData.sunset ? new Date(dailyData.sunset[dayIndex]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'N/A';
    const weatherIcon = getWeatherIcon(weatherCode);
    const weatherDesc = getWeatherDescription(weatherCode);
    const daySolunar = calculateSolunar(data.coords.lat, data.coords.lon, new Date(date));
    const moonIcon = getMoonIcon(daySolunar.moon_phase);
    const daySummary = `${weatherDesc} with ${precipProb}% rain chance. Air ${minTemp.toFixed(0)}°F to ${maxTemp.toFixed(0)}°F and winds near ${windSpeed.toFixed(0)} mph ${windDir}.`;
    const hourlyDetails = getHourlyDetailRowsForDate(
        data.weather.forecast.hourly || {},
        date,
        data.weather?.forecast?.hourly_units?.wind_speed_10m || data.weather?.forecast?.current_units?.wind_speed_10m || ''
    );
    const hourlyTrendMarkup = renderDayDetailTrendCharts(hourlyDetails, dayIndex);
    
    // 🔬 PHYSICS: Use pre-calculated water temp from thermal evolution model
    const waterTempEstimate = window.waterTempsEvolution 
        ? window.waterTempsEvolution[dayIndex] 
        : data.waterTemp + ((avgAirTemp - data.waterTemp) / 10); // Fallback if not available
    
    // Get fish phase based on estimated water temp
    const speciesData = SPECIES_DATA[data.speciesKey];
    const fishPhase = getFishPhaseLabel(speciesData, waterTempEstimate);
    
    const dayWaterView = getDayWaterTempView({ waterTemp: waterTempEstimate, waterType: data.waterType, waterContext: data.waterContext, dateIso: date });
    const dayPressureSummary = getDailyPressureSummary(data.weather.forecast.hourly, date);
    
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
                    <button type="button" class="modal-close" aria-label="Close day details" onclick="document.getElementById('dayDetailModal').classList.remove('show')">×</button>
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
                            ${renderWaterPeriodBreakdown({ periods: { sunrise: dayWaterView.sunrise, midday: dayWaterView.midday, sunset: dayWaterView.sunset }, surfaceLabel: 'Surface (day)', surfaceValue: dayWaterView.surfaceNow, depthTemps: dayWaterView.depthTemps })}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Fish Phase</span>
                        <span class="detail-value">${fishPhase}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Precipitation</span>
                        <span class="detail-value">${precipProb}% rain (${precipAmountInches.toFixed(2)} in)</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Wind</span>
                        <span class="detail-value">${windSpeed.toFixed(1)} mph ${windDir}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Pressure</span>
                        <span class="detail-value">${dayPressureSummary.pressureInHg ? `${dayPressureSummary.pressureInHg.toFixed(2)} inHg` : 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Pressure Status</span>
                        <span class="detail-value">${getPressureIndicator(dayPressureSummary.pressureStatus)}</span>
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
                    ${hourlyTrendMarkup}
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
