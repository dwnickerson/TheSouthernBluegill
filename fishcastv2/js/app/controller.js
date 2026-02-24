<DOCUMENT filename="controller.js">
const byId = (id) => document.getElementById(id);

const DEFAULT_FORM_VALUES = {
  lat: '34.2576',
  lon: '-88.7034',
  label: 'Tupelo, Mississippi pond',
  acres: '4.9',
  depth: '8',
  pastDays: '14',
  futureDays: '7',
  startWater: '',
  obsDepth: '1.7',
  modelHour: '12',
  observedTime: '12:00',
  turbidity: '18',
  visibility: '3',
  inflow: '0.2',
  inflowTemp: '58',
  outflow: '0.2',
  sediment: '0.45',
  sedimentConductivity: '1.2',
  sedimentDepthM: '0.4',
  mixedDepth: '4',
  windReduction: '0.7',
  evapCoeff: '1',
  albedo: '0.08',
  longwaveFactor: '1',
  shading: '20',
  fetchLength: '550',
  dailyAlpha: '0.18',
  mixAlpha: '0.2',
  layerCount: '1',
  uncertaintyBand: '2.5',
  autoCalibrate: false,
  runSensitivity: true
};

const PRESETS = {
  default: {},
    murkyTexasPond: {
      label: 'Murky Texas pond', turbidity: '240', visibility: '0.8', depth: '6', shading: '10', windReduction: '0.6', evapCoeff: '1.1', mixedDepth: '3.2'
    },
    shallowClearPond: {
      label: 'Shallow clear pond', turbidity: '8', visibility: '7.5', depth: '4.5', shading: '18', windReduction: '0.75', mixedDepth: '2.2', dailyAlpha: '0.24'
    },
    springFedPond: {
      label: 'Spring-fed pond', turbidity: '12', visibility: '5.5', inflow: '1.4', outflow: '1.4', inflowTemp: '56', sediment: '0.5', depth: '9.5'
    }
};

const FIELD_HELP = {
  lat: 'Latitude in decimal degrees (-90 to 90).',
  lon: 'Longitude in decimal degrees (-180 to 180).',
  modelHour: 'Hour used for model snapshot and table outputs.',
  observedTime: 'Local observation time used for validation matching.',
  turbidity: 'Cloudiness of water. Higher values reduce light penetration.',
  mixedDepth: 'Depth of actively mixed surface layer; shallower responds faster.',
  windReduction: 'How much regional wind reaches this pond after sheltering.',
  evapCoeff: 'Multiplier for evaporative cooling strength.',
  dailyAlpha: 'How quickly daily estimate moves toward equilibrium.',
  mixAlpha: 'How strongly upper/lower layers mix each day.'
};

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

function normalizeIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstFinite(...vals) {
  for (const v of vals) {
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function parseTimeToHour(timeValue) {
  if (!timeValue || !timeValue.includes(':')) return 12;
  const [hours] = timeValue.split(':');
  return clamp(Number(hours), 0, 23);
}

// New: Saturation vapor pressure (Tetens formula, in hPa)
function satVaporPress(T) {
  return 6.11 * Math.pow(10, (7.5 * T) / (237.3 + T));
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
    'cloudcover_mean',
    'relative_humidity_2m_mean' // Added for better evaporation
  ].join(',');

  const varsCurrent = ['temperature_2m', 'windspeed_10m', 'cloudcover', 'relative_humidity_2m'].join(',');

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

function buildSeries(forecastData, archiveData, params, pastDays) {
  const series = [];
  const daily = archiveData.daily || {};
  const dailyLen = daily.time?.length || 0;

  const dailyFuture = forecastData.daily || {};
  const dailyFutureLen = dailyFuture.time?.length || 0;

  const current = forecastData.current || {};

  const now = new Date();
  const todayIso = toISODate(now);

  let prevWater = params.startWater;
  let prevClarityNtu = null;
  let prevSedimentTemp = null;

  for (let i = 0; i < dailyLen; i++) {
    const date = daily.time[i];
    const tMax = finiteOrNull(daily.temperature_2m_max[i]);
    const tMin = finiteOrNull(daily.temperature_2m_min[i]);
    const tMean = finiteOrNull(daily.temperature_2m_mean[i]);
    const windMean = finiteOrNull(daily.windspeed_10m_mean[i]);
    const precip = finiteOrNull(daily.precipitation_sum[i]);
    const solar = finiteOrNull(daily.shortwave_radiation_sum[i]);
    const cloud = finiteOrNull(daily.cloudcover_mean[i]);
    const humidityMean = finiteOrNull(daily.relative_humidity_2m_mean[i]); // Added

    series.push({
      date,
      source: 'past',
      tMin,
      tMean,
      tMax,
      windMean,
      precip,
      solar,
      cloud,
      humidityMean, // Added
      prevWater,
      prevClarityNtu,
      prevSedimentTemp
    });
  }

  for (let i = 0; i < dailyFutureLen; i++) {
    const date = dailyFuture.time[i];
    const tMax = finiteOrNull(dailyFuture.temperature_2m_max[i]);
    const tMin = finiteOrNull(dailyFuture.temperature_2m_min[i]);
    const tMean = finiteOrNull(dailyFuture.temperature_2m_mean[i]);
    const windMean = finiteOrNull(dailyFuture.temperature_2m_mean[i]);
    const precip = finiteOrNull(dailyFuture.precipitation_sum[i]);
    const solar = finiteOrNull(dailyFuture.shortwave_radiation_sum[i]);
    const cloud = finiteOrNull(dailyFuture.cloudcover_mean[i]);
    const humidityMean = finiteOrNull(dailyFuture.relative_humidity_2m_mean[i]); // Added

    series.push({
      date,
      source: date === todayIso ? 'future_or_today' : 'future_or_today',
      tMin,
      tMean,
      tMax,
      windMean,
      precip,
      solar,
      cloud,
      humidityMean, // Added
      prevWater,
      prevClarityNtu,
      prevSedimentTemp
    });
  }

  if (series.length && series[series.length - 1].date === todayIso) {
    const tCurrent = finiteOrNull(current.temperature_2m);
    const windCurrent = finiteOrNull(current.windspeed_10m);
    const cloudCurrent = finiteOrNull(current.cloudcover);
    const humidityCurrent = finiteOrNull(current.relative_humidity_2m); // Added

    series[series.length - 1].tCurrent = tCurrent;
    series[series.length - 1].windCurrent = windCurrent;
    series[series.length - 1].cloudCurrent = cloudCurrent;
    series[series.length - 1].humidityCurrent = humidityCurrent; // Added
  }

  return series;
}

function computeModel(series, params, observedTime) {
  const rows = [];
  const depthFactor = params.mixedLayerDepthFt / params.depthFt;
  const alpha = clamp(params.dailyAlpha * depthFactor, 0.02, 0.5);
  const mixedLayerAlpha = params.mixAlpha;

  const clarityFactor = Math.exp(-0.015 * params.turbidity);
  const shadingFactor = 1 - params.shading / 100;
  const albedoFactor = 1 - params.albedo;

  let prevEstimate = params.startWater || 50;
  let prevLow = prevEstimate - params.uncertaintyBand / 2;
  let prevHigh = prevEstimate + params.uncertaintyBand / 2;
  let prevClarityNtu = params.turbidity;

  let prevSedimentTemp = prevEstimate; // For bottom heat flux

  const layerCount = params.layerCount;
  const layerTemps = Array(layerCount).fill(prevEstimate);

  for (const day of series) {
    const daylightFraction = 0.5 + 0.1 * Math.sin((new Date(day.date).getTime() / 86400000) * 2 * Math.PI / 365);
    const effectiveWind = day.windMean * params.windReduction;

    // New: Dynamic mixed depth based on wind and fetch (simple Wedderburn-like)
    let dynamicMixedDepthFt = params.mixedLayerDepthFt + 0.3 * day.windMean * Math.sqrt(params.fetchLength / 328.08); // fetch in ft to m conversion approx
    dynamicMixedDepthFt = clamp(dynamicMixedDepthFt, 1, params.depthFt);

    // New: Variable turbidity with precip (runoff increases turbidity)
    let currentTurbidity = params.turbidity;
    if (day.precip > 0.1) {
      currentTurbidity += 10 * day.precip; // Arbitrary increase with rain
      currentTurbidity = clamp(currentTurbidity, params.turbidity, 500);
    }
    const dynamicClarityFactor = Math.exp(-0.015 * currentTurbidity);

    const airBlend = 0.6 * day.tMean + 0.4 * day.tMax;

    const absorbedSolar = day.solar * daylightFraction * shadingFactor * albedoFactor * dynamicClarityFactor;
    const solarHeat = absorbedSolar * 0.002; // Adjusted scale for °F/day

    const windCool = params.evapCoeff * 0.001 * effectiveWind;

    // New: Better evaporation using humidity (bulk formula)
    const es = satVaporPress(prevEstimate); // sat at water temp
    const ea = satVaporPress(airBlend) * (day.humidityMean / 100); // actual vapor press
    const evapCoolNew = params.evapCoeff * 0.0006 * effectiveWind * (es - ea) * daylightFraction; // Scaled for °F/day, adjust 0.0006 empirically

    const longwaveNet = params.longwaveFactor * 0.03 * (airBlend - prevEstimate);
    const cloudCool = 0.02 * day.cloud / 100 * daylightFraction;

    const rainCool = day.precip > 0 ? 0.5 * day.precip : 0;

    const flowTurnover = params.inflow / (params.acres * 2.29568e-5 * params.depthFt * 3630); // Rough daily fraction
    let flowTempPull = flowTurnover * (params.inflowTemp - prevEstimate);
    if (day.precip > 0.05) {
      // Rain-induced mixing: increase turnover
      const rainVolume = day.precip * params.acres * 3630 / 12 / params.depthFt; // Fraction
      const rainTempPull = rainVolume * (day.tMean - prevEstimate); // Assume rain at air temp
      flowTempPull += rainTempPull;
    }

    // New: Bottom heat flux (simple conduction)
    const bottomFlux = params.sedimentConductivity * (prevSedimentTemp - prevEstimate) / params.sedimentDepthM * 0.001; // Scaled for °F/day

    let equilibrium = airBlend + solarHeat - windCool - evapCoolNew - longwaveNet - cloudCool - rainCool + flowTempPull + bottomFlux;

    equilibrium = clamp(equilibrium, 32, 120);

    // Sediment buffering if enabled
    let equilibriumWithSediment = equilibrium;
    if (params.sediment > 0) {
      const sedimentLag = 0.5 * params.sediment * (prevSedimentTemp || airBlend);
      equilibriumWithSediment = equilibrium * (1 - params.sediment) + sedimentLag;
      prevSedimentTemp = 0.9 * prevSedimentTemp + 0.1 * equilibrium; // Update lagged sediment temp
    }

    let waterEstimate = prevEstimate + alpha * (equilibriumWithSediment - prevEstimate);
    let waterLow = prevLow + alpha * (equilibriumWithSediment - params.uncertaintyBand / 2 - prevLow);
    let waterHigh = prevHigh + alpha * (equilibriumWithSediment + params.uncertaintyBand / 2 - prevHigh);

    // For multi-layer
    if (layerCount > 1) {
      const surfaceLayer = layerTemps[0] + alpha * (equilibriumWithSediment - layerTemps[0]);
      const bottomLayer = layerTemps[1] + mixedLayerAlpha * (surfaceLayer - layerTemps[1]);
      layerTemps[0] = surfaceLayer;
      layerTemps[1] = bottomLayer;
      waterEstimate = (surfaceLayer + bottomLayer) / 2; // Simple average for bulk
      waterLow = waterEstimate - params.uncertaintyBand / 2;
      waterHigh = waterEstimate + params.uncertaintyBand / 2;
    }

    waterEstimate = clamp(waterEstimate, 32, 120);
    waterLow = clamp(waterLow, 32, 120);
    waterHigh = clamp(waterHigh, 32, 120);

    prevEstimate = waterEstimate;
    prevLow = waterLow;
    prevHigh = waterHigh;
    prevClarityNtu = currentTurbidity;

    rows.push({
      date: day.date,
      source: day.source,
      tMin: round1(day.tMin),
              tMean: round1(day.tMean),
              tMax: round1(day.tMax),
              windMean: round1(day.windMean),
              effectiveWind: round1(effectiveWind),
              daylightFraction: round1(daylightFraction),
              precip: round1(day.precip),
              solar: round1(day.solar),
              cloud: round1(day.cloud),
              humidityMean: round1(day.humidityMean), // Added
              airBlend: round1(airBlend),
              solarHeat: round1(solarHeat),
              windCool: round1(windCool),
              evapCool: round1(evapCoolNew), // Updated
              longwaveNet: round1(longwaveNet),
              cloudCool: round1(cloudCool),
              rainCool: round1(rainCool),
              flowTempPull: round1(flowTempPull),
              bottomFlux: round1(bottomFlux), // Added
              equilibrium: round1(equilibrium),
              equilibriumWithSediment: round1(equilibriumWithSediment),
              alpha: round1(alpha),
              mixedLayerAlpha: round1(mixedLayerAlpha),
              layerCount,
              waterEstimateBulk: round1(waterEstimate),
              waterLow: round1(waterLow),
              waterEstimate: round1(waterEstimate), // At obs depth, approx bulk for now
              waterHigh: round1(waterHigh)
    });
  }

  return rows;
}

function toModelParams(ui) {
  return {
    lat: Number(ui.lat) || 34.2576,
    lon: Number(ui.lon) || -88.7034,
    acres: clamp(Number(ui.acres) || 4.9, 0.1, 500),
    depthFt: clamp(Number(ui.depth) || 8, 1, 50),
    pastDays: clamp(Number(ui.pastDays) || 14, 1, 60),
    futureDays: clamp(Number(ui.futureDays) || 7, 0, 30),
    startWater: parseOptionalNumber(ui.startWater),
    obsDepthFt: clamp(Number(ui.obsDepth) || 1.7, 0.1, 50),
    modelHour: clamp(Number(ui.modelHour) || 12, 0, 23),
    turbidity: clamp(Number(ui.turbidity) || 18, 0, 500),
    visibility: clamp(Number(ui.visibility) || 3, 0.1, 20),
    inflow: clamp(Number(ui.inflow) || 0.2, 0, 100),
    inflowTemp: clamp(Number(ui.inflowTemp) || 58, 32, 120),
    outflow: clamp(Number(ui.outflow) || 0.2, 0, 100),
    sediment: clamp(Number(ui.sediment) || 0.45, 0, 1),
    sedimentConductivity: clamp(Number(ui.sedimentConductivity) || 1.2, 0, 3),
    sedimentDepthM: clamp(Number(ui.sedimentDepthM) || 0.4, 0, 2),
    mixedLayerDepthFt: clamp(Number(ui.mixedDepth) || 4, 1, 20),
    windReduction: clamp(Number(ui.windReduction) || 0.7, 0.1, 1),
    evapCoeff: clamp(Number(ui.evapCoeff) || 1, 0.5, 1.5),
    albedo: clamp(Number(ui.albedo) || 0.08, 0, 1),
    longwaveFactor: clamp(Number(ui.longwaveFactor) || 1, 0.5, 1.5),
    shading: clamp(Number(ui.shading) || 20, 0, 100),
    fetchLength: clamp(Number(ui.fetchLength) || 550, 10, 5000),
    dailyAlpha: clamp(Number(ui.dailyAlpha) || 0.18, 0.01, 0.5),
    mixAlpha: clamp(Number(ui.mixAlpha) || 0.2, 0.01, 0.5),
    layerCount: clamp(Number(ui.layerCount) || 1, 1, 3),
    uncertaintyBand: clamp(Number(ui.uncertaintyBand) || 2.5, 0, 5)
  };
}

async function fetchData(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch weather data');
  return res.json();
}

async function runModel() {
  const ui = {};
  for (const key in DEFAULT_FORM_VALUES) {
    ui[key] = byId(key)?.value || DEFAULT_FORM_VALUES[key];
  }

  const params = toModelParams(ui);
  const urls = buildUrls(params);

  const [forecastData, archiveData] = await Promise.all([
    fetchData(urls.forecast),
                                                        fetchData(urls.archive)
  ]);

  const series = buildSeries(forecastData, archiveData, params, params.pastDays);

  let rows = computeModel(series, params, ui.observedTime);

  if (ui.autoCalibrate) {
    const calibration = autoCalibrate(rows, params, ui.observedTime);
    params = calibration.bestParams;
    rows = computeModel(series, params, ui.observedTime);
  }

  let sensitivityResult = null;
  if (ui.runSensitivity) {
    sensitivityResult = runSensitivity(rows, params, ui.observedTime);
  }

  window.__fishcastv2Rows = rows;
  window.__fishcastv2Params = params;
  window.__fishcastv2ObservedTime = ui.observedTime || '12:00';
  window.__fishcastv2UiParams = ui;

  renderSummary({ label: ui.label, rows, timezone: forecastData.timezone, params, autoCalibrationResult: ui.autoCalibrate ? calibration : null, sensitivityResult, observedTime: ui.observedTime });
  renderTable(rows, params, ui.observedTime || '12:00', ui);
  renderTrendChart(rows);
}

byId('run').addEventListener('click', () => runModel().catch((e) => {
  byId('summary').innerHTML = `<p>Failed to run model: ${e.message}</p>`;
}));

byId('evaluate').addEventListener('click', () => evaluateFit(window.__fishcastv2Rows || []));

byId('exportCsv').addEventListener('click', () => exportTraceCsv(window.__fishcastv2Rows || [], window.__fishcastv2Params || null, window.__fishcastv2ObservedTime || '12:00'));

runModel().catch(() => {});

byId('addValidationPoint').addEventListener('click', () => {
  const date = normalizeIsoDate(byId('manualValidationDate').value);
  const observed = Number(byId('manualValidationTemp').value);
  const observedTime = byId('manualValidationTime').value || '12:00';
  const clarityNtu = Number(byId('manualValidationClarity').value);
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!date || !Number.isFinite(observed)) {
    byId('fitOut').textContent = 'Enter a valid date and observed temperature before adding.';
    return;
  }
  if (date > todayIso) {
    byId('fitOut').textContent = 'Validation points must be today or earlier.';
    return;
  }
  const points = loadSavedValidationPoints().filter((p) => p.date !== date);
  points.push({ date, observed, observedTime, clarityNtu: Number.isFinite(clarityNtu) ? clarityNtu : null });
  saveValidationPoints(points);
  byId('manualValidationTemp').value = '';
  byId('manualValidationClarity').value = '';
  renderManualValidationList();
  if ((window.__fishcastv2Rows || []).length) {
    renderTable(
      window.__fishcastv2Rows || [],
      window.__fishcastv2Params || null,
      window.__fishcastv2ObservedTime || '12:00',
      window.__fishcastv2UiParams || null
    );
    renderTrendChart(window.__fishcastv2Rows || []);
  }
});

byId('clearValidationPoints').addEventListener('click', () => {
  saveValidationPoints([]);
  renderManualValidationList();
  if ((window.__fishcastv2Rows || []).length) {
    renderTable(
      window.__fishcastv2Rows || [],
      window.__fishcastv2Params || null,
      window.__fishcastv2ObservedTime || '12:00',
      window.__fishcastv2UiParams || null
    );
    renderTrendChart(window.__fishcastv2Rows || []);
  }
});

byId('observedTime').addEventListener('change', () => {
  const hr = parseTimeToHour(byId('observedTime').value);
  byId('modelHour').value = String(hr);
});

// Stub functions for missing parts (add your actual implementations)
function autoCalibrate(rows, params, observedTime) {
  // Implement auto-calibration logic here
  return { bestParams: params }; // Placeholder
}

function runSensitivity(rows, params, observedTime) {
  // Implement sensitivity analysis here
  return null; // Placeholder
}

function renderSummary(options) {
  // Implement rendering summary here
}

function renderTable(rows, params, observedTime, ui) {
  // Implement table rendering here
}

function renderTrendChart(rows) {
  // Implement chart rendering here (e.g., using Chart.js)
}

function evaluateFit(rows) {
  // Implement fit evaluation here
}

function exportTraceCsv(rows, params, observedTime) {
  // Implement CSV export here
}

function loadSavedValidationPoints() {
  // Implement localStorage load here
  return [];
}

function saveValidationPoints(points) {
  // Implement localStorage save here
}

function renderManualValidationList() {
  // Implement list rendering here
}
</DOCUMENT>
