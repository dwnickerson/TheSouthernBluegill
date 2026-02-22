const byId = (id) => document.getElementById(id);

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function parseOptionalNumberInput(id) {
  const raw = byId(id)?.value;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
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

function computeModel(rows, { acres, depthFt, startWaterTemp, obsDepthFt, turbidityNtu, inflowCfs, outflowCfs, sedimentFactor, mixedLayerDepthFt }) {
  const areaFactor = 1 / (1 + acres / 12);
  const depthFactor = 1 / (1 + depthFt / 6);
  const alpha = clamp(0.08 + 0.35 * areaFactor * depthFactor, 0.06, 0.35);
  const observationDepthFt = clamp(firstFinite(obsDepthFt, 0), 0, Math.max(depthFt, 0.1));
  const depthRatio = clamp(depthFt > 0 ? observationDepthFt / depthFt : 0, 0, 1);
  const depthWarmBias = clamp(2.4 * (0.5 - depthRatio), -1.2, 1.8);
  const mixedDepth = clamp(firstFinite(mixedLayerDepthFt, depthFt * 0.5, 1), 0.2, Math.max(depthFt, 0.2));
  const mixedLayerRatio = clamp(depthFt > 0 ? mixedDepth / depthFt : 1, 0.1, 1);
  const mixedLayerAlphaBoost = clamp(1 / Math.sqrt(mixedLayerRatio), 0.9, 2.2);
  const clarityNtu = clamp(firstFinite(turbidityNtu, 18), 0, 300);
  const clarityFactor = clamp(1.08 - clarityNtu / 250, 0.25, 1.15);
  const netFlowCfs = firstFinite(inflowCfs, 0) - firstFinite(outflowCfs, 0);
  const flowTurnover = clamp(Math.abs(netFlowCfs) / Math.max(acres * depthFt, 0.5), 0, 0.3);
  const sediment = clamp(firstFinite(sedimentFactor, 0.45), 0, 1);
  const FREEZING_F_FRESH_WATER = 32;
  const MAX_DAILY_SOLAR_MJ_M2 = 35;

  const initialRow = rows[0] || {};
  const initialAir = firstFinite(initialRow.tMean, initialRow.tMax, initialRow.tMin, 55);
  let water = Number.isFinite(startWaterTemp) ? startWaterTemp : initialAir;
  water = clamp(water, FREEZING_F_FRESH_WATER, 100);

  return rows.map((r) => {
    const tMean = firstFinite(r.tMean, r.tMax, r.tMin, water);
    const tMax = firstFinite(r.tMax, tMean);
    const tMin = firstFinite(r.tMin, tMean);
    const solar = firstFinite(r.solar, 0);
    const daylightFraction = clamp(solar / MAX_DAILY_SOLAR_MJ_M2, 0.12, 1);
    const solarHeat = solar * 0.0018 * clarityFactor;
    const windMph = firstFinite(r.windMean, 0);
    const windExposure = 0.45 + 0.55 * daylightFraction;
    const effectiveWind = windMph * windExposure;
    const windCool = effectiveWind * 0.25;
    const cloudCool = firstFinite(r.cloud, 0) * 0.03;
    const rainCool = firstFinite(r.precip, 0) * 1.2;
    const daytimeWeight = 0.35 + 0.45 * daylightFraction;
    const overnightWeight = 1 - daytimeWeight;
    const dayAir = 0.4 * tMean + 0.6 * tMax;
    const nightAir = 0.7 * tMean + 0.3 * tMin;
    const airBlend = daytimeWeight * dayAir + overnightWeight * nightAir;
    const flowTempPull = netFlowCfs * 1.4;
    const equilibriumRaw = airBlend + solarHeat - windCool - cloudCool - rainCool + flowTempPull;
    const equilibrium = clamp(equilibriumRaw, FREEZING_F_FRESH_WATER, 100);

    const prevWater = water;
    const sedimentLag = (0.28 + 0.32 * sediment) * prevWater + (0.72 - 0.32 * sediment) * equilibrium;
    const equilibriumWithSediment = clamp(sedimentLag, FREEZING_F_FRESH_WATER, 100);
    const mixedLayerAlpha = clamp(alpha * mixedLayerAlphaBoost * (1 + 0.35 * flowTurnover), 0.05, 0.65);
    water = prevWater + mixedLayerAlpha * (equilibriumWithSediment - prevWater);
    water = clamp(water, FREEZING_F_FRESH_WATER, 100);

    return {
      ...r,
      tMean: round1(tMean),
      tMax: round1(tMax),
      tMin: round1(tMin),
      solarHeat: round1(solarHeat),
      daylightFraction: round1(daylightFraction),
      effectiveWind: round1(effectiveWind),
      windCool: round1(windCool),
      cloudCool: round1(cloudCool),
      rainCool: round1(rainCool),
      airBlend: round1(airBlend),
      equilibrium: round1(equilibrium),
      alpha: round1(alpha),
      mixedLayerAlpha: round1(mixedLayerAlpha),
      mixedLayerDepthFt: round1(mixedDepth),
      mixedLayerRatio: round1(mixedLayerRatio),
      clarityFactor: round1(clarityFactor),
      flowTurnover: round1(flowTurnover),
      netFlowCfs: round1(netFlowCfs),
      sedimentFactor: round1(sediment),
      flowTempPull: round1(flowTempPull),
      equilibriumWithSediment: round1(equilibriumWithSediment),
      waterEstimateBulk: round1(water),
      depthWarmBias: round1(depthWarmBias),
      waterEstimate: round1(clamp(water + depthWarmBias, FREEZING_F_FRESH_WATER, 100))
    };
  });
}

function applyCurrentAdjustment(rows, current) {
  const today = rows.find((r) => r.source === 'future_or_today');
  if (!today || !current) return rows;
  const currentAir = firstFinite(current.temperature_2m, null);
  const currentWind = firstFinite(current.windspeed_10m, 0);
  if (!Number.isFinite(currentAir) || !Number.isFinite(today.tMean)) return rows;
  const daylightFraction = firstFinite(today.daylightFraction, 0.35);
  const currentWindExposure = 0.35 + 0.65 * daylightFraction;
  const windCoolingNow = 0.03 * currentWind * currentWindExposure;
  const currentEffect = round1(0.35 * (currentAir - today.tMean) - windCoolingNow);
  today.currentWindExposure = round1(currentWindExposure);
  today.currentWindCooling = round1(windCoolingNow);
  today.currentEffect = currentEffect;
  today.waterEstimate = round1(clamp(today.waterEstimate + currentEffect, 32, 100));
  return rows;
}

function renderSummary({ label, acres, depth, obsDepth, rows, timezone, current, turbidity, inflow, outflow, sediment, mixedDepth, biasResult }) {
  const past = rows.filter((r) => r.source === 'past');
  const future = rows.filter((r) => r.source === 'future_or_today');
  const latest = future[0] || rows[rows.length - 1];
  byId('summary').innerHTML = `
    <h2>Summary</h2>
    <p><strong>${label}</strong> | Timezone: ${timezone}</p>
    <p>Pond geometry: ${acres} acres, avg depth ${depth} ft.</p>
    <p class="muted">Reported measurement depth: ${obsDepth} ft (used to estimate near-surface vs whole-pond temperature offset).</p>
    <p><strong>Estimated water temp now:</strong> <span class="ok">${latest?.waterEstimate ?? '--'} °F</span></p>
    <p class="muted">Model sequence: past daily weather initializes thermal state → current weather nudges today's estimate → future daily weather projects forward.</p>
    <p class="muted">Future water temperatures are modeled as a daily blended value (closest to midday), not a specific clock hour.</p>
    <p class="muted">Current weather used: air ${round1(current?.temperature_2m)} °F, wind ${round1(current?.windspeed_10m)} mph, cloud ${round1(current?.cloudcover)}%.</p>
    <p class="muted">Wind is actual now (hourly snapshot) for the grid cell, not your on-pond instantaneous reading. It is converted to a same-day cooling adjustment.</p>
    <p class="muted">Rows in model: past=${past.length}, future/today=${future.length}.</p>
    <p class="muted">Extended terms enabled: turbidity ${turbidity} NTU, inflow ${inflow} cfs, outflow ${outflow} cfs, sediment factor ${sediment}, mixed-layer depth ${mixedDepth} ft.</p>
    <p class="muted">Calibration hint: add historical validation observations to tune clarity, flow, sediment, and mixed-layer coefficients.</p>
    <p class="muted">Validation bias correction: ${Number.isFinite(biasResult?.bias) ? `${biasResult.bias} °F applied using ${biasResult.pointsUsed} historical point(s).` : 'none applied (need historical points matching past modeled dates).'}</p>
  `;
}

function renderTable(rows) {
  const header = ['Date', 'Src', 'Tmin', 'Tmean', 'Tmax', 'Wind', 'WindEff', 'DayFrac', 'Precip', 'Solar', 'Cloud', 'AirBlend', 'Solar+', 'Wind-', 'Cloud-', 'Rain-', 'FlowΔ', 'Equilibrium', 'Eq+Sed', 'Alpha', 'MixAlpha', 'MixDepth', 'Clarity', 'Turnover', 'WaterBulk', 'DepthBias', 'WaterEst'];
  const body = rows.map((r) => `<tr>
    <td>${r.date}</td><td>${r.source}</td><td>${r.tMin}</td><td>${r.tMean}</td><td>${r.tMax}</td>
    <td>${r.windMean}</td><td>${r.effectiveWind}</td><td>${r.daylightFraction}</td><td>${r.precip}</td><td>${r.solar}</td><td>${r.cloud}</td>
    <td>${r.airBlend}</td><td>${r.solarHeat}</td><td>${r.windCool}</td><td>${r.cloudCool}</td><td>${r.rainCool}</td><td>${r.flowTempPull}</td>
    <td>${r.equilibrium}</td><td>${r.equilibriumWithSediment}</td><td>${r.alpha}</td><td>${r.mixedLayerAlpha}</td><td>${r.mixedLayerDepthFt}</td><td>${r.clarityFactor}</td><td>${r.flowTurnover}</td><td>${r.waterEstimateBulk}</td><td>${r.depthWarmBias}</td><td><strong>${r.waterEstimate}</strong></td>
  </tr>`).join('');

  byId('tableWrap').innerHTML = `<table><thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

const VALIDATION_STORE_KEY = 'fishcastv2.validationHistory';

function normalizeValidationSlot(slot) {
  if (slot === 'sunrise' || slot === 'midday' || slot === 'sunset') return slot;
  return 'midday';
}

function loadSavedValidationPoints() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VALIDATION_STORE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed
        .filter((r) => typeof r?.date === 'string' && Number.isFinite(Number(r?.observed)))
        .map((r) => ({ date: r.date, observed: Number(r.observed), slot: normalizeValidationSlot(r.slot) }))
      : [];
  } catch {
    return [];
  }
}

function saveValidationPoints(points) {
  localStorage.setItem(VALIDATION_STORE_KEY, JSON.stringify(points));
}

function renderManualValidationList() {
  const points = loadSavedValidationPoints().sort((a, b) => a.date.localeCompare(b.date));
  byId('manualValidationList').innerHTML = points.length
    ? `<ul>${points.map((p, i) => `<li>${p.date} (${p.slot}): ${round1(p.observed)} °F <button data-remove-index="${i}">Remove</button></li>`).join('')}</ul>`
    : '<p class="muted">No saved past validation inputs yet.</p>';

  [...document.querySelectorAll('#manualValidationList button[data-remove-index]')].forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.removeIndex);
      const next = loadSavedValidationPoints().sort((a, b) => a.date.localeCompare(b.date)).filter((_, i) => i !== idx);
      saveValidationPoints(next);
      renderManualValidationList();
    });
  });
}

function renderValidationInputs(rows) {
  const options = rows.slice(-10).map((r) => `
    <div>
      <strong>${r.date}</strong>
      <label>Sunrise <input type="number" step="0.1" data-date="${r.date}" data-slot="sunrise" placeholder="observed °F"></label>
      <label>Midday <input type="number" step="0.1" data-date="${r.date}" data-slot="midday" placeholder="observed °F"></label>
      <label>Sunset <input type="number" step="0.1" data-date="${r.date}" data-slot="sunset" placeholder="observed °F"></label>
    </div>
  `).join('');
  byId('validationInputs').innerHTML = options;
  renderManualValidationList();
}

function getAllValidationInputs() {
  const inlineInputs = [...document.querySelectorAll('#validationInputs input[data-date][data-slot]')]
    .map((el) => ({ date: el.dataset.date, slot: normalizeValidationSlot(el.dataset.slot), observed: Number(el.value) }))
    .filter((r) => Number.isFinite(r.observed));

  const saved = loadSavedValidationPoints();
  const deduped = new Map();
  [...saved, ...inlineInputs].forEach((p) => {
    deduped.set(`${p.date}|${p.slot}`, { date: p.date, slot: normalizeValidationSlot(p.slot), observed: p.observed });
  });

  return [...deduped.values()];
}


function computeValidationBias(rows, points) {
  if (points.length < 2) return null;
  const slotOffsets = { sunrise: -1.2, midday: 0, sunset: -0.4 };
  const errors = points
    .map((o) => {
      const row = rows.find((r) => r.date === o.date);
      if (!row || row.source !== 'past') return null;
      const modeledBase = row.waterEstimate;
      const offset = firstFinite(slotOffsets[o.slot], 0);
      const model = Number.isFinite(modeledBase) ? modeledBase + offset : null;
      if (!Number.isFinite(model)) return null;
      return o.observed - model;
    })
    .filter((v) => Number.isFinite(v));

  if (errors.length < 2) return null;
  const meanError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
  return round1(clamp(meanError, -8, 8));
}

function applyValidationBias(rows, points) {
  const bias = computeValidationBias(rows, points);
  if (!Number.isFinite(bias)) return { rows, bias: null, pointsUsed: 0 };

  let pointsUsed = 0;
  const slotOffsets = { sunrise: -1.2, midday: 0, sunset: -0.4 };
  points.forEach((o) => {
    const row = rows.find((r) => r.date === o.date);
    if (!row || row.source !== 'past') return;
    const modeledBase = row.waterEstimate;
    const offset = firstFinite(slotOffsets[o.slot], 0);
    const model = Number.isFinite(modeledBase) ? modeledBase + offset : null;
    if (Number.isFinite(model)) pointsUsed += 1;
  });

  const adjustedRows = rows.map((r) => ({
    ...r,
    waterEstimate: round1(clamp(firstFinite(r.waterEstimate, 32) + bias, 32, 100)),
    waterEstimateBulk: round1(clamp(firstFinite(r.waterEstimateBulk, 32) + bias, 32, 100)),
    validationBiasApplied: bias
  }));

  return { rows: adjustedRows, bias, pointsUsed };
}

function evaluateFit(rows) {
  const obs = getAllValidationInputs();
  const slotOffsets = { sunrise: -1.2, midday: 0, sunset: -0.4 };

  if (!obs.length) {
    byId('fitOut').textContent = 'No observations entered yet.';
    return;
  }

  const joined = obs.map((o) => {
    const row = rows.find((r) => r.date === o.date);
    const modeledBase = row?.waterEstimate;
    const offset = firstFinite(slotOffsets[o.slot], 0);
    const model = Number.isFinite(modeledBase) ? round1(modeledBase + offset) : null;
    return { ...o, model, err: round1(o.observed - model) };
  }).filter((r) => Number.isFinite(r.model));

  if (!joined.length) {
    byId('fitOut').textContent = 'No matching model dates for the validation points entered.';
    return;
  }

  const mae = round1(joined.reduce((s, r) => s + Math.abs(r.err), 0) / joined.length);
  byId('fitOut').textContent = `Validation points: ${joined.length} | Mean absolute error: ${mae} °F | Details: ${joined.map((r) => `${r.date}(${r.slot}) err=${r.err}`).join(', ')}`;
}

async function runModel() {
  const lat = Number(byId('lat').value);
  const lon = Number(byId('lon').value);
  const label = byId('label').value;
  const acres = Number(byId('acres').value);
  const depth = Number(byId('depth').value);
  const obsDepth = Number(byId('obsDepth').value);
  const turbidity = Number(byId('turbidity').value);
  const inflow = Number(byId('inflow').value);
  const outflow = Number(byId('outflow').value);
  const sediment = Number(byId('sediment').value);
  const mixedDepth = Number(byId('mixedDepth').value);
  const pastDays = Number(byId('pastDays').value);
  const futureDays = Number(byId('futureDays').value);
  const startWaterTemp = parseOptionalNumberInput('startWater');

  const { forecast, archive } = buildUrls({ lat, lon, pastDays, futureDays });
  const [forecastRes, archiveRes] = await Promise.all([fetch(forecast), fetch(archive)]);
  const [forecastData, archiveData] = await Promise.all([forecastRes.json(), archiveRes.json()]);

  let rows = buildSeries(archiveData, forecastData);
  rows = computeModel(rows, { acres, depthFt: depth, startWaterTemp, obsDepthFt: obsDepth, turbidityNtu: turbidity, inflowCfs: inflow, outflowCfs: outflow, sedimentFactor: sediment, mixedLayerDepthFt: mixedDepth });
  rows = applyCurrentAdjustment(rows, forecastData.current);

  const validationPoints = getAllValidationInputs();
  const biasResult = applyValidationBias(rows, validationPoints);
  rows = biasResult.rows;

  window.__fishcastv2Rows = rows;
  window.__fishcastv2Bias = biasResult;
  renderSummary({ label, acres, depth, obsDepth, rows, timezone: forecastData.timezone, current: forecastData.current, turbidity, inflow, outflow, sediment, mixedDepth, biasResult });
  renderTable(rows);
  renderValidationInputs(rows);
}

byId('run').addEventListener('click', () => runModel().catch((e) => {
  byId('summary').innerHTML = `<p>Failed to run model: ${e.message}</p>`;
}));
byId('evaluate').addEventListener('click', () => evaluateFit(window.__fishcastv2Rows || []));

runModel().catch(() => {});

byId('addValidationPoint').addEventListener('click', () => {
  const date = byId('manualValidationDate').value;
  const slot = normalizeValidationSlot(byId('manualValidationSlot').value);
  const observed = Number(byId('manualValidationTemp').value);
  if (!date || !Number.isFinite(observed)) {
    byId('fitOut').textContent = 'Enter a valid date and observed temperature before adding.';
    return;
  }
  const points = loadSavedValidationPoints().filter((p) => !(p.date === date && p.slot === slot));
  points.push({ date, slot, observed });
  saveValidationPoints(points);
  byId('manualValidationTemp').value = '';
  renderManualValidationList();
});

byId('clearValidationPoints').addEventListener('click', () => {
  saveValidationPoints([]);
  renderManualValidationList();
});
