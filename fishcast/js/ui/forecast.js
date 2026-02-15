import { cToF, kmhToMph, getWindDirection } from '../utils/math.js';
import { calculateFishingScore, getPressureRate } from '../models/fishingScore.js';
import { calculateSolunar } from '../models/solunar.js';
import { calculateSpeciesAwareDayScore } from '../models/forecastEngine.js';
import { estimateTempByDepth } from '../models/waterTemp.js';

let latestForecastData = null;
let savedMainScroll = 0;

function normalizeState(score) {
    if (score >= 80) return { label: 'Good', className: 'state-good' };
    if (score >= 60) return { label: 'Fair', className: 'state-fair' };
    return { label: 'Poor', className: 'state-poor' };
}

function describePressureTrend(trend) {
    if (trend === 'rapid_fall' || trend === 'falling') return 'falling pressure';
    if (trend === 'rapid_rise' || trend === 'rising') return 'rising pressure';
    return 'stable pressure';
}

function createExplanation({ precipProb, pressureTrend, windMph }) {
    const pressure = describePressureTrend(pressureTrend);
    if (windMph > 16) return `${pressure} with stronger wind may limit shallow activity after midday.`;
    if (precipProb >= 50) return `Light rain and ${pressure} favor active feeding through the morning.`;
    return `${pressure} and manageable wind support steady fishing windows today.`;
}

function getHourLabel(isoString, nowIso) {
    if (isoString === nowIso) return 'Now';
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getDailyLabel(dateString, index) {
    if (index === 0) return 'Today';
    return new Date(`${dateString}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
}

function getWeatherDescriptor(code) {
    const weatherCode = Number(code) || 0;
    if (weatherCode === 0) return { icon: '☀️', label: 'Sunny' };
    if ([1, 2].includes(weatherCode)) return { icon: '🌤️', label: 'Partly Cloudy' };
    if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) return { icon: '☁️', label: 'Cloudy' };
    if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) return { icon: '🌧️', label: 'Rain' };
    if (weatherCode >= 71 && weatherCode <= 77) return { icon: '❄️', label: 'Snow' };
    if (weatherCode >= 95) return { icon: '⛈️', label: 'Storms' };
    return { icon: '🌥️', label: 'Mixed' };
}

function normalizeGauge(min, max, value) {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function mmToInches(mm) {
    return Number(mm) / 25.4;
}

function formatInches(mm, decimals = 2) {
    const inches = mmToInches(mm);
    if (!Number.isFinite(inches)) return '0.00';
    return inches.toFixed(decimals);
}

function renderMoonGraphic(percent) {
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    const shadowOffset = (50 - clamped) / 50;
    return `
        <div class="moon-phase" role="img" aria-label="${clamped}% moon illumination">
            <span class="moon-phase-disc"></span>
            <span class="moon-phase-shadow" style="transform: translateX(${shadowOffset * 26}px);"></span>
        </div>
    `;
}

function buildDepthTemperatureFigures(surfaceTemp, waterType, sampleDate) {
    if (!Number.isFinite(surfaceTemp) || !waterType) return 'N/A';

    return [0, 2, 4, 10, 20]
        .map((depthFt) => {
            const tempAtDepth = estimateTempByDepth(surfaceTemp, waterType, depthFt, sampleDate);
            const depthLabel = depthFt === 0 ? 'Surface' : `${depthFt}ft`;
            return `${depthLabel}: ${tempAtDepth.toFixed(1)}°F`;
        })
        .join(' · ');
}

function renderTrendSvg(values = [], unit = '', decimals = 0, yLabel = 'Value', xLabel = 'Hour') {
    if (!Array.isArray(values) || !values.length) {
        return '<p class="trend-empty">No hourly data available.</p>';
    }

    const safeValues = values.map(v => Number(v)).filter(Number.isFinite);
    if (!safeValues.length) {
        return '<p class="trend-empty">No hourly data available.</p>';
    }

    const min = Math.min(...safeValues);
    const max = Math.max(...safeValues);
    const range = max - min || 1;
    const width = 100;
    const height = 42;

    const points = safeValues.map((value, index) => {
        const x = safeValues.length === 1 ? 0 : (index / (safeValues.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    const latest = safeValues[safeValues.length - 1];
    const first = safeValues[0];

    return `
        <div class="trend-chart" role="img" aria-label="${yLabel} trend across recent hours">
            <div class="trend-axis trend-axis-y">
                <span>${max.toFixed(decimals)}${unit}</span>
                <span>${min.toFixed(decimals)}${unit}</span>
            </div>
            <div class="trend-plot-area">
                <svg class="trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
                    <polyline class="trend-line" points="${points}"></polyline>
                </svg>
                <div class="trend-axis trend-axis-x" aria-hidden="true">
                    <span>Now</span>
                    <span>${xLabel}</span>
                </div>
            </div>
        </div>
        <p class="trend-caption">${yLabel}: ${first.toFixed(decimals)}${unit} → ${latest.toFixed(decimals)}${unit} · Range ${min.toFixed(decimals)}${unit}-${max.toFixed(decimals)}${unit}</p>
    `;
}

function renderGauge({ valueLabel, scaleLabelLow, scaleLabelHigh, ratio = 0, unitLabel = '', direction = null, summaryLabel = '' }) {
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const percent = Math.round(clampedRatio * 100);
    return `
        <div class="gauge" role="img" aria-label="Gauge reading ${valueLabel}${unitLabel ? ` ${unitLabel}` : ''}">
            <div class="gauge-track" aria-hidden="true">
                <div class="gauge-fill" style="--gauge-fill:${percent}%"></div>
            </div>
            <div class="gauge-value-wrap">
                ${direction ? `<p class="gauge-direction">${direction}</p>` : ''}
                <p class="gauge-value">${valueLabel}</p>
                ${unitLabel ? `<p class="gauge-unit">${unitLabel}</p>` : ''}
            </div>
            <div class="gauge-scale"><span>${scaleLabelLow}</span><span>${scaleLabelHigh}</span></div>
            ${summaryLabel ? `<p class="gauge-summary">${summaryLabel}</p>` : ''}
        </div>
    `;
}

function getBestWindowText(score, windMph, precipProb) {
    if (score >= 82) return 'Best: Morning';
    if (score >= 74) return 'All Day Stable';
    if (precipProb > 55) return 'Best: Early';
    if (windMph > 14) return 'Best: Sheltered';
    return 'Fair Morning';
}

function getHourlyScore(data, hourIndex) {
    const { weather, waterTemp, speciesKey, coords } = data;
    const hourly = weather.forecast.hourly;
    const daily = weather.forecast.daily;
    const iso = hourly.time[hourIndex] || weather.forecast.current.time;
    const dayKey = (iso || '').split('T')[0];
    const locationKey = `${coords.lat.toFixed(3)}_${coords.lon.toFixed(3)}`;

    const modern = calculateSpeciesAwareDayScore({
        data,
        dayKey,
        speciesKey,
        waterTempF: waterTemp,
        locationKey,
        now: new Date(),
        debug: false
    });

    const baseScore = Number.isFinite(modern?.score)
        ? modern.score
        : getDayScore(data, Math.max(0, daily.time.indexOf(dayKey)), 50);

    const hourWindMph = kmhToMph(hourly.wind_speed_10m?.[hourIndex] ?? weather.forecast.current.wind_speed_10m ?? 0);
    const hourCloud = hourly.cloud_cover?.[hourIndex] ?? weather.forecast.current.cloud_cover ?? 0;
    const hourPrecipProb = hourly.precipitation_probability?.[hourIndex] ?? 0;
    const uv = hourly.uv_index?.[hourIndex] ?? weather.forecast.current.uv_index ?? 0;

    let adjusted = baseScore;
    if (hourWindMph > 18) adjusted -= 7;
    else if (hourWindMph > 14) adjusted -= 3;

    if (hourPrecipProb >= 75) adjusted -= 5;
    else if (hourPrecipProb >= 35 && hourPrecipProb <= 60) adjusted += 2;

    if (hourCloud >= 30 && hourCloud <= 70) adjusted += 2;
    if (uv >= 8) adjusted -= 2;

    return Math.max(0, Math.min(99, Math.round(adjusted)));
}

function getDayScore(data, dayIndex, moonPhasePercent) {
    const { weather, waterTemp, speciesKey } = data;
    const daily = weather.forecast.daily;
    const dayKey = daily.time[dayIndex];
    const locationKey = `${data.coords.lat.toFixed(3)}_${data.coords.lon.toFixed(3)}`;

    const modern = calculateSpeciesAwareDayScore({
        data,
        dayKey,
        speciesKey,
        waterTempF: waterTemp,
        locationKey,
        now: new Date(),
        debug: Boolean(window?.localStorage?.getItem('fishcast_debug_scoring') === 'true')
    });

    if (Number.isFinite(modern?.score)) {
        return modern.score;
    }

    const weatherSlice = {
        current: {
            surface_pressure: daily.surface_pressure_mean?.[dayIndex] ?? weather.forecast.current.surface_pressure,
            wind_speed_10m: daily.wind_speed_10m_max?.[dayIndex] ?? weather.forecast.current.wind_speed_10m,
            cloud_cover: daily.cloud_cover_mean?.[dayIndex] ?? weather.forecast.current.cloud_cover,
            weather_code: daily.weather_code?.[dayIndex] ?? weather.forecast.current.weather_code
        },
        hourly: {
            surface_pressure: [daily.surface_pressure_mean?.[dayIndex] ?? weather.forecast.current.surface_pressure],
            precipitation_probability: [daily.precipitation_probability_max?.[dayIndex] ?? 0]
        },
        daily: {
            precipitation_sum: (weather.historical?.daily?.precipitation_sum || [])
                .concat((daily.precipitation_sum || []).slice(0, dayIndex + 1))
                .slice(-3)
        }
    };

    return calculateFishingScore(weatherSlice, waterTemp, speciesKey, moonPhasePercent).score;
}

function buildHourlyItems(data, dateFilter) {
    const hourly = data.weather.forecast.hourly;
    const current = data.weather.forecast.current;
    const items = [];

    for (let idx = 0; idx < hourly.time.length; idx++) {
        if (dateFilter && !hourly.time[idx].startsWith(dateFilter)) continue;
        if (!dateFilter && items.length >= 6) break;

        const score = getHourlyScore(data, idx);
        items.push({
            iso: hourly.time[idx],
            time: getHourLabel(hourly.time[idx], current.time),
            score,
            state: normalizeState(score)
        });
    }

    return dateFilter ? items : items.slice(0, 6);
}

function buildDailyRows(data) {
    const daily = data.weather.forecast.daily;
    const solunar = calculateSolunar(data.coords.lat, data.coords.lon, new Date());

    return daily.time.slice(0, 5).map((date, index) => {
        const score = getDayScore(data, index, solunar.moon_phase_percent);
        const windMph = kmhToMph(daily.wind_speed_10m_max?.[index] || 0);
        const precipProb = daily.precipitation_probability_max?.[index] || 0;
        return {
            date,
            dayLabel: getDailyLabel(date, index),
            weather: getWeatherDescriptor(daily.weather_code?.[index]),
            lowTempF: cToF(daily.temperature_2m_min?.[index] || 0).toFixed(0),
            highTempF: cToF(daily.temperature_2m_max?.[index] || 0).toFixed(0),
            precipProb,
            score,
            state: normalizeState(score),
            window: getBestWindowText(score, windMph, precipProb)
        };
    });
}

function moonLabel(percent, phaseName = '') {
    const pct = Number(percent);
    if (phaseName) return phaseName;
    if (!Number.isFinite(pct)) return 'Unknown';
    if (pct <= 5) return 'New Moon';
    if (pct >= 95) return 'Full Moon';
    if (pct <= 45) return 'Crescent';
    if (pct <= 55) return 'Quarter Moon';
    return 'Gibbous';
}


function getWeatherBackdrop(code) {
    if (code >= 95) return 'storm';
    if (code >= 71 && code <= 77) return 'snow';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code >= 1 && code <= 3) return 'cloudy';
    return 'clear';
}

function applyWeatherBackdrop(weatherCode) {
    const backdrop = getWeatherBackdrop(Number(weatherCode) || 0);
    document.body.setAttribute('data-weather-backdrop', backdrop);
}

function getRouteDay() {
    const params = new URLSearchParams(window.location.search);
    return params.get('day');
}

function setRouteDay(day) {
    const url = new URL(window.location.href);
    if (day) {
        url.searchParams.set('day', day);
    } else {
        url.searchParams.delete('day');
    }
    window.history.pushState({}, '', url);
}

function renderTimeline(items) {
    return `
        <div class="timeline" role="list">
            ${items.map((item) => `
                <article class="timeline-item" role="listitem">
                    <p class="timeline-time">${item.time}</p>
                    <span class="timeline-glyph" aria-hidden="true"></span>
                    <p class="timeline-score ${item.state.className}">${item.score}</p>
                    <p class="timeline-state">${item.state.label}</p>
                </article>
            `).join('')}
        </div>
    `;
}

function renderMainView(data) {
    const { coords, weather } = data;
    const resultsDiv = document.getElementById('results');
    const daily = weather.forecast.daily;

    const solunar = calculateSolunar(coords.lat, coords.lon, new Date());
    const currentScoreValue = getDayScore(data, 0, solunar.moon_phase_percent);
    const currentScore = { score: currentScoreValue };
    const state = normalizeState(currentScore.score);

    const pressureSeries = weather.forecast.hourly.surface_pressure.slice(0, 6);
    const pressureAnalysis = getPressureRate(pressureSeries);
    const pressureCurrent = (weather.forecast.current.surface_pressure * 0.02953).toFixed(2);
    const pressureDelta = ((pressureSeries[pressureSeries.length - 1] - pressureSeries[0]) * 0.02953).toFixed(2);

    const windMph = kmhToMph(weather.forecast.current.wind_speed_10m);
    const windDir = getWindDirection(weather.forecast.current.wind_direction_10m);
    const windGust = kmhToMph(weather.forecast.current.wind_gusts_10m || weather.forecast.current.wind_speed_10m);
    const pressureRatio = normalizeGauge(28.7, 30.6, Number(pressureCurrent));
    const windRatio = normalizeGauge(0, 40, windMph);
    const precipProb = weather.forecast.hourly.precipitation_probability?.[0] || weather.forecast.daily.precipitation_probability_max?.[0] || 0;
    const precipMm = weather.forecast.current.precipitation ?? weather.forecast.hourly.precipitation?.[0] ?? 0;
    const precipInPerHour = formatInches(precipMm);
    const currentWeather = getWeatherDescriptor(weather.forecast.current.weather_code);
    const conditionLabel = precipMm > 0.05 || precipProb >= 55
        ? `Rain likely now (${precipProb}% chance)`
        : `${currentWeather.label} now`;
    const waterTempLabel = Number.isFinite(data.waterTemp) ? `${data.waterTemp.toFixed(1)}°F` : 'N/A';
    const uvCurrent = weather.forecast.current.uv_index ?? weather.forecast.hourly.uv_index?.[0] ?? null;
    const depthFiguresLabel = buildDepthTemperatureFigures(data.waterTemp, data.waterType, new Date());
    const radarUrl = `https://embed.windy.com/embed2.html?lat=${coords.lat.toFixed(3)}&lon=${coords.lon.toFixed(3)}&detailLat=${coords.lat.toFixed(3)}&detailLon=${coords.lon.toFixed(3)}&zoom=7&level=surface&overlay=radar&product=radar&menu=&message=&marker=true&calendar=now`;

    const hourlyItems = buildHourlyItems(data);
    const dailyRows = buildDailyRows(data);
    const sunrise = daily.sunrise?.[0]
        ? new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'N/A';
    const sunset = daily.sunset?.[0]
        ? new Date(daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'N/A';
    applyWeatherBackdrop(weather.forecast.current.weather_code);

    resultsDiv.innerHTML = `
        <main class="fishcast-shell" aria-label="Fishing conditions overview">
            <section class="card hero-card" aria-live="polite">
                <p class="hero-location">${coords.name}</p>
                <h1 class="hero-title">Fishing Conditions</h1>
                <p class="hero-index">${currentScore.score}</p>
                <p class="pill ${state.className}">${state.label}</p>
                <p class="hero-condition">${currentWeather.icon} ${conditionLabel}</p>
                <p class="hero-explanation">${createExplanation({ precipProb, pressureTrend: pressureAnalysis.trend, windMph })}</p>
                <p class="metric-note">Precipitation: ${precipInPerHour} in/h · ${precipProb}% chance</p>
                <p class="metric-note">Fishing score method: start at a species baseline, then adjust for water temperature range, pressure trend, wind, cloud cover, and precipitation probability before applying stability controls to prevent large swings without meaningful weather changes.</p>
            </section>

            <section class="card timeline-card" aria-label="Hourly activity timeline">
                <div class="timeline-track" aria-hidden="true"></div>
                ${renderTimeline(hourlyItems)}
            </section>

            <section class="card daily-card" aria-label="Daily forecast">
                <h2 class="card-header">Daily Forecast</h2>
                <ul class="daily-list">
                    ${dailyRows.map((row) => `
                        <li>
                            <button type="button" class="daily-row" data-day="${row.date}" aria-label="Open details for ${row.dayLabel}, ${row.date}">
                                <span class="daily-day">${row.dayLabel}</span>
                                <span class="daily-condition">${row.weather.icon} <span>${row.weather.label}</span>${row.precipProb >= 40 ? `<em>${row.precipProb}%</em>` : ''}</span>
                                <span class="daily-score ${row.state.className}">${row.score}</span>
                                <span class="daily-temp-low">${row.lowTempF}°</span>
                                <span class="daily-bar"><span class="daily-bar-fill ${row.state.className}"></span></span>
                                <span class="daily-temp-high">${row.highTempF}°</span>
                            </button>
                        </li>
                    `).join('')}
                </ul>
            </section>

            <section class="card radar-card" aria-label="Weather radar map">
                <h2 class="card-header">Precipitation Radar</h2>
                <iframe title="Weather radar for ${coords.name}" loading="lazy" src="${radarUrl}"></iframe>
            </section>

            <section class="metrics-grid" aria-label="Condition metrics">
                <article class="card metric-card">
                    <h3>Fish Activity Trend</h3>
                    <p class="metric-value">${pressureCurrent} inHg</p>
                    <p class="metric-note">${pressureAnalysis.rate <= 0 ? 'Pressure is easing, with stronger early movement expected.' : 'Rising pressure supports steadier midday behavior.'}</p>
                </article>
                <article class="card metric-card">
                    <h3>Pressure</h3>
                    ${renderGauge({
                        valueLabel: pressureCurrent,
                        unitLabel: 'inHg',
                        scaleLabelLow: 'Low',
                        scaleLabelHigh: 'High',
                        ratio: pressureRatio,
                        summaryLabel: pressureAnalysis.rate <= 0 ? 'Pressure easing' : 'Pressure climbing'
                    })}
                    <p class="metric-note">${pressureDelta} inHg change, ${describePressureTrend(pressureAnalysis.trend)} trend.</p>
                </article>
                <article class="card metric-card">
                    <h3>Wind</h3>
                    ${renderGauge({
                        valueLabel: windMph.toFixed(0),
                        unitLabel: 'mph',
                        scaleLabelLow: 'Calm',
                        scaleLabelHigh: 'Strong',
                        ratio: windRatio,
                        direction: windDir,
                        summaryLabel: windMph > 14 ? 'Wind may reduce bite windows' : 'Manageable wind for open water'
                    })}
                    <p class="metric-note">Gust potential near ${windGust.toFixed(0)} mph.</p>
                </article>
                <article class="card metric-card">
                    <h3>Water Temp</h3>
                    <p class="metric-value">${waterTempLabel}</p>
                    <p class="metric-note">Estimated by water-body physics model and local weather history.</p>
                    <p class="metric-note">Depth figures: ${depthFiguresLabel}</p>
                </article>
                <article class="card metric-card">
                    <h3>UV Index</h3>
                    <p class="metric-value">${uvCurrent !== null ? Number(uvCurrent).toFixed(1) : 'N/A'}</p>
                    <p class="metric-note">Higher UV often pushes fish toward shade or deeper structure.</p>
                </article>
                <article class="card metric-card">
                    <h3>Moon &amp; Light</h3>
                    ${renderMoonGraphic(solunar.moon_phase_percent)}
                    <p class="metric-value">${moonLabel(solunar.moon_phase_percent, solunar.moon_phase)}</p>
                    <p class="metric-note">Sunrise: ${sunrise} · Sunset: ${sunset}</p>
                    <p class="metric-note">Major periods: ${solunar.major_periods.join(' · ')}</p>
                    <p class="metric-note">Minor periods: ${solunar.minor_periods.join(' · ')}</p>
                </article>
            </section>
        </main>
    `;

    resultsDiv.querySelectorAll('.daily-row').forEach((rowButton) => {
        rowButton.addEventListener('click', () => {
            savedMainScroll = window.scrollY;
            const day = rowButton.dataset.day;
            setRouteDay(day);
            renderDayDetailView(data, day);
        });
    });
}

function renderDayDetailView(data, day) {
    const dayIndex = data.weather.forecast.daily.time.indexOf(day);
    if (dayIndex < 0) {
        renderMainView(data);
        return;
    }

    const resultsDiv = document.getElementById('results');
    const daily = data.weather.forecast.daily;
    const hourly = data.weather.forecast.hourly;
    const solunar = calculateSolunar(data.coords.lat, data.coords.lon, new Date(`${day}T12:00:00`));
    const score = getDayScore(data, dayIndex, solunar.moon_phase_percent);
    const state = normalizeState(score);
    const hourlyItems = buildHourlyItems(data, day);
    applyWeatherBackdrop(daily.weather_code?.[dayIndex] ?? data.weather.forecast.current.weather_code);

    const dayPressures = hourly.surface_pressure.filter((_, i) => hourly.time[i].startsWith(day));
    const pressureMin = dayPressures.length ? (Math.min(...dayPressures) * 0.02953).toFixed(2) : null;
    const pressureMax = dayPressures.length ? (Math.max(...dayPressures) * 0.02953).toFixed(2) : null;
    const pressureAvg = dayPressures.length ? (dayPressures.reduce((sum, val) => sum + val, 0) / dayPressures.length * 0.02953).toFixed(2) : null;

    const dayName = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
    const dayDate = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const windMph = kmhToMph(daily.wind_speed_10m_max?.[dayIndex] || 0);
    const windDir = getWindDirection(daily.wind_direction_10m_dominant?.[dayIndex] || data.weather.forecast.current.wind_direction_10m);
    const uvDay = daily.uv_index_max?.[dayIndex] ?? null;
    const depthFiguresLabel = buildDepthTemperatureFigures(data.waterTemp, data.waterType, new Date(`${day}T12:00:00`));
    const dayHourIndexes = hourly.time
        .map((iso, i) => ({ iso, i }))
        .filter(entry => entry.iso.startsWith(day))
        .slice(0, 24)
        .map(entry => entry.i);

    const hourlyAirTempF = dayHourIndexes.map((i) => cToF(hourly.temperature_2m?.[i])).filter(Number.isFinite);
    const dayAirAverageF = hourlyAirTempF.length
        ? hourlyAirTempF.reduce((sum, value) => sum + value, 0) / hourlyAirTempF.length
        : cToF(daily.temperature_2m_mean?.[dayIndex] ?? 0);
    const hourlyWaterSurfaceF = hourlyAirTempF.map((airTemp) => {
        const swing = (airTemp - dayAirAverageF) * 0.2;
        return Number.isFinite(data.waterTemp) ? data.waterTemp + swing : NaN;
    }).filter(Number.isFinite);
    const hourlyWater2FtF = hourlyWaterSurfaceF.map((surfaceTemp) => estimateTempByDepth(surfaceTemp, data.waterType, 2, new Date(`${day}T12:00:00`)));
    const hourlyPrecipMm = dayHourIndexes.map((i) => hourly.precipitation?.[i]).filter(Number.isFinite);
    const hourlyPrecipIn = hourlyPrecipMm.map((mm) => mmToInches(mm)).filter(Number.isFinite);
    const surfaceTempLabel = Number.isFinite(data.waterTemp) ? `${data.waterTemp.toFixed(1)}°F` : 'N/A';
    const twoFootTemp = Number.isFinite(data.waterTemp)
        ? estimateTempByDepth(data.waterTemp, data.waterType, 2, new Date(`${day}T12:00:00`))
        : null;
    const twoFootTempLabel = twoFootTemp !== null ? `${twoFootTemp.toFixed(1)}°F` : 'N/A';

    resultsDiv.innerHTML = `
        <main class="fishcast-shell" aria-label="Day detail view">
            <section class="card detail-header">
                <button type="button" class="back-btn" id="backToMain">Back</button>
                <p class="hero-location">${data.coords.name}</p>
                <h1 class="detail-title">${dayName}, ${dayDate}</h1>
                <p class="hero-index">${score}</p>
                <p class="pill ${state.className}">${state.label}</p>
                <p class="hero-explanation">${getBestWindowText(score, windMph, daily.precipitation_probability_max?.[dayIndex] || 0)} with ${describePressureTrend(getPressureRate(dayPressures).trend)} supports the strongest opportunity.</p>
            </section>

            <section class="card timeline-card">
                <h2 class="card-header">Hourly Activity</h2>
                <div class="timeline-track" aria-hidden="true"></div>
                ${renderTimeline(hourlyItems)}
            </section>

            <section class="card detail-grid">
                <h2 class="card-header">Conditions Overview</h2>
                <p><strong>Temperature:</strong> ${cToF(daily.temperature_2m_min?.[dayIndex] || 0).toFixed(0)}°–${cToF(daily.temperature_2m_max?.[dayIndex] || 0).toFixed(0)}°F</p>
                <p><strong>Precipitation:</strong> ${daily.precipitation_probability_max?.[dayIndex] ?? 'N/A'}% probability, ${formatInches(daily.precipitation_sum?.[dayIndex] ?? 0)} in total</p>
                <p><strong>Hourly rainfall:</strong> ${(() => {
                    const vals = hourly.precipitation.filter((_, i) => hourly.time[i].startsWith(day)).filter(Number.isFinite);
                    if (!vals.length) return 'N/A';
                    const peak = formatInches(Math.max(...vals));
                    const avg = formatInches(vals.reduce((s, v) => s + v, 0) / vals.length);
                    return `${avg} in/h avg · ${peak} in/h peak`;
                })()}</p>
                <p><strong>Wind:</strong> ${windMph.toFixed(0)} mph ${windDir}</p>
                <p><strong>Water Temp Surface:</strong> ${surfaceTempLabel}</p>
                <p><strong>Water Temp 2ft:</strong> ${twoFootTempLabel}</p>
                <p><strong>Depth Figures:</strong> ${depthFiguresLabel}</p>
                <p><strong>UV Index:</strong> ${uvDay !== null ? Number(uvDay).toFixed(1) : 'N/A'} (daily max)</p>
                ${pressureAvg ? `<p><strong>Pressure:</strong> ${pressureAvg} inHg avg (${pressureMin}-${pressureMax})</p>` : ''}
                ${daily.cloud_cover_mean?.[dayIndex] !== undefined ? `<p><strong>Cloud Cover:</strong> ${daily.cloud_cover_mean[dayIndex]}%</p>` : ''}
                ${data.weather.forecast.current.relative_humidity_2m !== undefined ? `<p><strong>Humidity:</strong> ${data.weather.forecast.current.relative_humidity_2m}% (latest reading)</p>` : ''}
            </section>

            <section class="card detail-grid">
                <h2 class="card-header">24-Hour Trends</h2>
                <div class="trend-block">
                    <h3>Air Temperature (°F)</h3>
                    ${renderTrendSvg(hourlyAirTempF, '°F', 1, 'Air Temperature', '24h')}
                </div>
                <div class="trend-block">
                    <h3>Water Temperature Surface (°F)</h3>
                    ${renderTrendSvg(hourlyWaterSurfaceF, '°F', 1, 'Water Surface Temp', '24h')}
                </div>
                <div class="trend-block">
                    <h3>Water Temperature 2ft (°F)</h3>
                    ${renderTrendSvg(hourlyWater2FtF, '°F', 1, 'Water Temp at 2ft', '24h')}
                </div>
                <div class="trend-block">
                    <h3>Precipitation (in/hr)</h3>
                    ${renderTrendSvg(hourlyPrecipIn, ' in/h', 2, 'Precipitation', '24h')}
                </div>
            </section>

            <section class="card detail-grid">
                <h2 class="card-header">Sun &amp; Moon</h2>
                <p><strong>Sunrise:</strong> ${daily.sunrise?.[dayIndex] ? new Date(daily.sunrise[dayIndex]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                <p><strong>Sunset:</strong> ${daily.sunset?.[dayIndex] ? new Date(daily.sunset[dayIndex]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p>
                ${renderMoonGraphic(solunar.moon_phase_percent)}
                <p><strong>Moon:</strong> ${moonLabel(solunar.moon_phase_percent, solunar.moon_phase)}, ${solunar.moon_phase_percent}% illumination</p>
                <p><strong>Major periods:</strong> ${solunar.major_periods.join(' · ')}</p>
                <p><strong>Minor periods:</strong> ${solunar.minor_periods.join(' · ')}</p>
            </section>

            <section class="card detail-grid">
                <h2 class="card-header">Fishing Interpretation</h2>
                <ul class="interpretation-list">
                    <li>Best window: ${getBestWindowText(score, windMph, daily.precipitation_probability_max?.[dayIndex] || 0).replace('Best: ', '')}.</li>
                    <li>Pressure trend is ${describePressureTrend(getPressureRate(dayPressures).trend)}, which can shift feeding confidence.</li>
                    <li>${windMph > 15 ? 'Focus on protected structure as wind strengthens.' : 'Wind remains manageable for open-water presentations.'}</li>
                </ul>
            </section>
        </main>
    `;

    document.getElementById('backToMain')?.addEventListener('click', () => {
        const params = new URLSearchParams(window.location.search);
        if (params.has('day')) {
            window.history.back();
        } else {
            setRouteDay(null);
            renderMainView(data);
            window.scrollTo({ top: savedMainScroll, behavior: 'instant' });
        }
    });
}

export function renderForecast(data) {
    latestForecastData = data;
    window.currentForecastData = data;
    sessionStorage.setItem('fishcast-last-forecast', JSON.stringify(data));

    const routeDay = getRouteDay();
    if (routeDay) {
        renderDayDetailView(data, routeDay);
    } else {
        renderMainView(data);
    }
}

export function rerenderFromRoute() {
    if (!latestForecastData) return;
    const routeDay = getRouteDay();
    if (routeDay) {
        renderDayDetailView(latestForecastData, routeDay);
    } else {
        renderMainView(latestForecastData);
        window.scrollTo({ top: savedMainScroll, behavior: 'instant' });
    }
}

export function restoreLastForecast() {
    if (latestForecastData) return true;
    const serialized = sessionStorage.getItem('fishcast-last-forecast');
    if (!serialized) return false;

    try {
        latestForecastData = JSON.parse(serialized);
        window.currentForecastData = latestForecastData;
        return true;
    } catch (error) {
        sessionStorage.removeItem('fishcast-last-forecast');
        return false;
    }
}

export function showLoading() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <section class="fishcast-shell" aria-label="Loading forecast">
            <section class="card skeleton skeleton-hero"></section>
            <section class="card skeleton skeleton-hourly"></section>
            <section class="card skeleton skeleton-daily"></section>
            <section class="metrics-grid">
                <div class="card skeleton skeleton-metric"></div>
                <div class="card skeleton skeleton-metric"></div>
                <div class="card skeleton skeleton-metric"></div>
                <div class="card skeleton skeleton-metric"></div>
            </section>
        </section>
    `;
}

export function showError(message) {
    const resultsDiv = document.getElementById('results');
    document.body.setAttribute('data-weather-backdrop', 'clear');
    resultsDiv.innerHTML = `
        <section class="card error-card" role="alert">
            <h2>Forecast unavailable</h2>
            <p>${message || 'We were unable to load forecast data for this request.'}</p>
            <button type="button" class="retry-btn" onclick="window.retryForecast()">Retry</button>
        </section>
    `;
}

export function showEmptyState() {
    const resultsDiv = document.getElementById('results');
    document.body.setAttribute('data-weather-backdrop', 'clear');
    resultsDiv.innerHTML = `
        <section class="card empty-card">
            <h2>Set a location to begin</h2>
            <p>Generate a forecast to view daily scoring, hourly activity, and condition details.</p>
        </section>
    `;
}

window.retryForecast = function retryForecast() {
    document.getElementById('forecastForm')?.requestSubmit();
};
