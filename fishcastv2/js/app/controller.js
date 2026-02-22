const byId = (id) => document.getElementById(id);

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function finiteOrNull(v) {
  return Number.isFinite(v) ? v : null;
}

function firstFinite(...vals) {
  for (const v of vals) {
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function buildUrls({ lat, lon, pastDays, futureDays }) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const pastStart = new Date(yesterday.getTime() - (pastDays - 1) * 24 * 3600 * 1000);
  const futureEnd = new Date(now.getTime() + futureDays * 24 * 3600 * 1000);

  const varsDaily = [
    'temperature_2m_max',
    'temperature_2m_min',
    'temperature_2m_mean',
    'precipitation_sum',
    'windspeed_10m_mean',
    'shortwave_radiation_sum',
    'cloudcover_mean'
  ].join(',');

  const varsCurrent = ['temperature_2m', 'windspeed_10m', 'cloudcover'].join(',');

  const forecast = new URL('https://api.open-meteo.com/v1/forecast');
  forecast.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: varsDaily,
    current: varsCurrent,
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    start_date: toISODate(now),
    end_date: toISODate(futureEnd)
  }).toString();

  const archive = new URL('https://archive-api.open-meteo.com/v1/archive');
  archive.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: varsDaily,
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    start_date: toISODate(pastStart),
    end_date: toISODate(yesterday)
  }).toString();

  return { forecast: forecast.toString(), archive: archive.toString() };
}

function buildSeries(archive, forecast) {
  const mapDaily = (payload, source) => payload.daily.time.map((date, i) => {
    const tMax = finiteOrNull(payload.daily.temperature_2m_max[i]);
    const tMin = finiteOrNull(payload.daily.temperature_2m_min[i]);
    const tMeanRaw = finiteOrNull(payload.daily.temperature_2m_mean[i]);
    const tMeanFallback = (Number.isFinite(tMax) && Number.isFinite(tMin)) ? (tMax + tMin) / 2 : null;
    const windRaw = finiteOrNull(payload.daily.windspeed_10m_mean[i]);
    const precipRaw = finiteOrNull(payload.daily.precipitation_sum[i]);
    const solarRaw = finiteOrNull(payload.daily.shortwave_radiation_sum[i]);
    const cloudRaw = finiteOrNull(payload.daily.cloudcover_mean[i]);

    return {
      date,
      source,
      tMax,
      tMin,
      tMean: firstFinite(tMeanRaw, tMeanFallback),
      precip: firstFinite(precipRaw, 0),
      windMean: firstFinite(windRaw, 0),
      solar: firstFinite(solarRaw, 0),
      cloud: clamp(firstFinite(cloudRaw, 0), 0, 100)
    };
  });

  return [...mapDaily(archive, 'past'), ...mapDaily(forecast, 'future_or_today')];
}

function computeModel(rows, { acres, depthFt, startWaterTemp }) {
  const areaFactor = 1 / (1 + acres / 12);
  const depthFactor = 1 / (1 + depthFt / 6);
  const alpha = clamp(0.08 + 0.35 * areaFactor * depthFactor, 0.06, 0.35);
  const FREEZING_F_FRESH_WATER = 32;

  const initialRow = rows[0] || {};
  const initialAir = firstFinite(initialRow.tMean, initialRow.tMax, initialRow.tMin, 55);
  let water = Number.isFinite(startWaterTemp) ? startWaterTemp : initialAir;
  water = clamp(water, FREEZING_F_FRESH_WATER, 100);
  return rows.map((r, idx) => {
    const tMean = firstFinite(r.tMean, r.tMax, r.tMin, water);
    const tMax = firstFinite(r.tMax, tMean);
    const tMin = firstFinite(r.tMin, tMean);
    const solarHeat = firstFinite(r.solar, 0) * 0.0018;
    const windMph = firstFinite(r.windMean, 0);
    const windCool = windMph * 0.25;
    const cloudCool = firstFinite(r.cloud, 0) * 0.03;
    const rainCool = firstFinite(r.precip, 0) * 1.2;
    const airBlend = 0.65 * tMean + 0.2 * tMax + 0.15 * tMin;
    const equilibriumRaw = airBlend + solarHeat - windCool - cloudCool - rainCool;
    const equilibrium = clamp(equilibriumRaw, FREEZING_F_FRESH_WATER, 100);

    const prevWater = idx === 0 ? water : rows[idx - 1].waterEstimate;
    water = prevWater + alpha * (equilibrium - prevWater);
    water = clamp(water, FREEZING_F_FRESH_WATER, 100);

    return {
      ...r,
      tMean: round1(tMean),
      tMax: round1(tMax),
      tMin: round1(tMin),
      solarHeat: round1(solarHeat),
      windCool: round1(windCool),
      cloudCool: round1(cloudCool),
      rainCool: round1(rainCool),
      airBlend: round1(airBlend),
      equilibrium: round1(equilibrium),
      alpha: round1(alpha),
      waterEstimate: round1(water)
    };
  });
}

function applyCurrentAdjustment(rows, current) {
  const today = rows.find((r) => r.source === 'future_or_today');
  if (!today || !current) return rows;
  const currentAir = firstFinite(current.temperature_2m, null);
  const currentWind = firstFinite(current.windspeed_10m, 0);
  if (!Number.isFinite(currentAir) || !Number.isFinite(today.tMean)) return rows;
  const currentEffect = round1(0.35 * (currentAir - today.tMean) - 0.05 * currentWind);
  today.currentEffect = currentEffect;
  today.waterEstimate = round1(clamp(today.waterEstimate + currentEffect, 32, 100));
  return rows;
}

function renderSummary({ label, acres, depth, rows, timezone, current }) {
  const past = rows.filter((r) => r.source === 'past');
  const future = rows.filter((r) => r.source === 'future_or_today');
  const latest = future[0] || rows[rows.length - 1];
  byId('summary').innerHTML = `
    <h2>Summary</h2>
    <p><strong>${label}</strong> | Timezone: ${timezone}</p>
    <p>Pond geometry: ${acres} acres, avg depth ${depth} ft.</p>
    <p><strong>Estimated water temp now:</strong> <span class="ok">${latest?.waterEstimate ?? '--'} °F</span></p>
    <p class="muted">Model sequence: past daily weather initializes thermal state → current weather nudges today's estimate → future daily weather projects forward.</p>
    <p class="muted">Current weather used: air ${round1(current?.temperature_2m)} °F, wind ${round1(current?.windspeed_10m)} mph, cloud ${round1(current?.cloudcover)}%.</p>
    <p class="muted">Rows in model: past=${past.length}, future/today=${future.length}.</p>
  `;
}

function renderTable(rows) {
  const header = ['Date', 'Src', 'Tmin', 'Tmean', 'Tmax', 'Wind', 'Precip', 'Solar', 'Cloud', 'AirBlend', 'Solar+', 'Wind-', 'Cloud-', 'Rain-', 'Equilibrium', 'Alpha', 'WaterEst'];
  const body = rows.map((r) => `<tr>
    <td>${r.date}</td><td>${r.source}</td><td>${r.tMin}</td><td>${r.tMean}</td><td>${r.tMax}</td>
    <td>${r.windMean}</td><td>${r.precip}</td><td>${r.solar}</td><td>${r.cloud}</td>
    <td>${r.airBlend}</td><td>${r.solarHeat}</td><td>${r.windCool}</td><td>${r.cloudCool}</td><td>${r.rainCool}</td>
    <td>${r.equilibrium}</td><td>${r.alpha}</td><td><strong>${r.waterEstimate}</strong></td>
  </tr>`).join('');

  byId('tableWrap').innerHTML = `<table><thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderValidationInputs(rows) {
  const options = rows.slice(-10).map((r) => `
    <label>${r.date}: <input type="number" step="0.1" data-date="${r.date}" placeholder="observed °F"></label>
  `).join('');
  byId('validationInputs').innerHTML = options;
}

function evaluateFit(rows) {
  const inputs = [...document.querySelectorAll('#validationInputs input[data-date]')];
  const obs = inputs
    .map((el) => ({ date: el.dataset.date, observed: Number(el.value) }))
    .filter((r) => Number.isFinite(r.observed));

  if (!obs.length) {
    byId('fitOut').textContent = 'No observations entered yet.';
    return;
  }

  const joined = obs.map((o) => {
    const model = rows.find((r) => r.date === o.date)?.waterEstimate;
    return { ...o, model, err: round1(o.observed - model) };
  }).filter((r) => Number.isFinite(r.model));

  const mae = round1(joined.reduce((s, r) => s + Math.abs(r.err), 0) / joined.length);
  byId('fitOut').textContent = `Validation points: ${joined.length} | Mean absolute error: ${mae} °F | Details: ${joined.map((r) => `${r.date} err=${r.err}`).join(', ')}`;
}

async function runModel() {
  const lat = Number(byId('lat').value);
  const lon = Number(byId('lon').value);
  const label = byId('label').value;
  const acres = Number(byId('acres').value);
  const depth = Number(byId('depth').value);
  const pastDays = Number(byId('pastDays').value);
  const futureDays = Number(byId('futureDays').value);
  const startWaterTemp = Number(byId('startWater').value);

  const { forecast, archive } = buildUrls({ lat, lon, pastDays, futureDays });
  const [forecastRes, archiveRes] = await Promise.all([fetch(forecast), fetch(archive)]);
  const [forecastData, archiveData] = await Promise.all([forecastRes.json(), archiveRes.json()]);

  let rows = buildSeries(archiveData, forecastData);
  rows = computeModel(rows, { acres, depthFt: depth, startWaterTemp });
  rows = applyCurrentAdjustment(rows, forecastData.current);

  window.__fishcastv2Rows = rows;
  renderSummary({ label, acres, depth, rows, timezone: forecastData.timezone, current: forecastData.current });
  renderTable(rows);
  renderValidationInputs(rows);
}

byId('run').addEventListener('click', () => runModel().catch((e) => {
  byId('summary').innerHTML = `<p>Failed to run model: ${e.message}</p>`;
}));
byId('evaluate').addEventListener('click', () => evaluateFit(window.__fishcastv2Rows || []));

runModel().catch(() => {});
