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

function toModelParams(raw) {
  return {
    acres: raw.acres,
    depthFt: raw.depthFt,
    startWaterTemp: raw.startWaterTemp,
    obsDepthFt: raw.obsDepthFt,
    modelHour: clamp(firstFinite(raw.modelHour, 12), 0, 23),
    turbidityNtu: clamp(firstFinite(raw.turbidityNtu, 18), 0, 500),
    visibilityFt: clamp(firstFinite(raw.visibilityFt, 3), 0.1, 12),
    inflowCfs: clamp(firstFinite(raw.inflowCfs, 0), 0, 50),
    outflowCfs: clamp(firstFinite(raw.outflowCfs, 0), 0, 50),
    inflowTempF: clamp(firstFinite(raw.inflowTempF, 58), 32, 100),
    sedimentFactor: clamp(firstFinite(raw.sedimentFactor, 0.45), 0, 1),
    sedimentConductivity: clamp(firstFinite(raw.sedimentConductivity, 1.2), 0.2, 3),
    sedimentDepthM: clamp(firstFinite(raw.sedimentDepthM, 0.4), 0.05, 2),
    mixedLayerDepthFt: clamp(firstFinite(raw.mixedLayerDepthFt, raw.depthFt * 0.5, 1), 0.2, Math.max(raw.depthFt, 0.2)),
    windReductionFactor: clamp(firstFinite(raw.windReductionFactor, 0.7), 0, 1),
    evaporationCoeff: clamp(firstFinite(raw.evaporationCoeff, 1), 0.5, 1.5),
    albedo: clamp(firstFinite(raw.albedo, 0.08), 0, 1),
    longwaveFactor: clamp(firstFinite(raw.longwaveFactor, 1), 0.5, 1.5),
    shadingPct: clamp(firstFinite(raw.shadingPct, 20), 0, 100),
    fetchLengthFt: clamp(firstFinite(raw.fetchLengthFt, 550), 20, 4000),
    dailyAlpha: clamp(firstFinite(raw.dailyAlpha, 0.18), 0.01, 0.5),
    mixAlpha: clamp(firstFinite(raw.mixAlpha, 0.2), 0.01, 0.5),
    layerCount: clamp(Math.round(firstFinite(raw.layerCount, 1)), 1, 3),
    uncertaintyBand: clamp(firstFinite(raw.uncertaintyBand, 2.5), 0, 10)
  };
}

function computeModel(rows, rawParams) {
  const params = toModelParams(rawParams);
  const {
    acres, depthFt, startWaterTemp, obsDepthFt, modelHour, turbidityNtu, visibilityFt, inflowCfs, outflowCfs, inflowTempF,
    sedimentFactor, sedimentConductivity, sedimentDepthM, mixedLayerDepthFt, windReductionFactor, evaporationCoeff,
    albedo, longwaveFactor, shadingPct, fetchLengthFt, dailyAlpha, mixAlpha, layerCount, uncertaintyBand
  } = params;

  const areaFactor = 1 / (1 + acres / 12);
  const depthFactor = 1 / (1 + depthFt / 6);
  const observationDepthFt = clamp(firstFinite(obsDepthFt, 0), 0, Math.max(depthFt, 0.1));
  const depthRatio = clamp(depthFt > 0 ? observationDepthFt / depthFt : 0, 0, 1);
  const depthWarmBias = clamp(2.4 * (0.5 - depthRatio), -1.2, 1.8);
  const mixedLayerRatio = clamp(depthFt > 0 ? mixedLayerDepthFt / depthFt : 1, 0.1, 1);
  const mixedLayerAlphaBoost = clamp(1 / Math.sqrt(mixedLayerRatio), 0.9, 2.2);
  const clarityFactor = clamp((1.05 - turbidityNtu / 260) * (0.86 + visibilityFt / 10), 0.2, 1.2);
  const netFlowCfs = inflowCfs - outflowCfs;
  const flowTurnover = clamp(Math.abs(netFlowCfs) / Math.max(acres * depthFt, 0.5), 0, 0.4);
  const FREEZING_F_FRESH_WATER = 32;
  const MAX_DAILY_SOLAR_MJ_M2 = 35;
  const REFERENCE_MIXED_DEPTH_FT = 4;

  const initialRow = rows[0] || {};
  const initialAir = firstFinite(initialRow.tMean, initialRow.tMax, initialRow.tMin, 55);
  let water = Number.isFinite(startWaterTemp) ? startWaterTemp : initialAir;
  water = clamp(water, FREEZING_F_FRESH_WATER, 100);

  const layers = Array.from({ length: layerCount }, () => water);

  return rows.map((r) => {
    const tMean = firstFinite(r.tMean, r.tMax, r.tMin, water);
    const tMax = firstFinite(r.tMax, tMean);
    const tMin = firstFinite(r.tMin, tMean);
    const solar = firstFinite(r.solar, 0);
    const baseDaylightFraction = clamp(solar / MAX_DAILY_SOLAR_MJ_M2, 0.12, 1);
    const hourWeight = Math.max(0.2, Math.sin(((modelHour + 1) / 24) * Math.PI));
    const daylightFraction = clamp(baseDaylightFraction * hourWeight, 0.08, 1);
    const effectiveMixedDepthFt = Math.max(mixedLayerDepthFt, 0.2);
    const depthFluxScale = clamp(REFERENCE_MIXED_DEPTH_FT / effectiveMixedDepthFt, 0.35, 2.5);
    const shadeFactor = 1 - shadingPct / 100;
    const absorbedSolar = solar * (1 - albedo) * shadeFactor;
    const solarHeat = absorbedSolar * 0.02 * clarityFactor * depthFluxScale;

    const windMph = firstFinite(r.windMean, 0);
    const fetchFactor = clamp(0.75 + fetchLengthFt / 1500, 0.6, 2);
    const windExposure = (0.4 + 0.6 * daylightFraction) * windReductionFactor * fetchFactor;
    const effectiveWind = windMph * windExposure;
    const windCool = effectiveWind * 0.08 * depthFluxScale;
    const evapCool = effectiveWind * evaporationCoeff * (1 - clamp(firstFinite(r.cloud, 0) / 150, 0, 0.6)) * 0.07 * depthFluxScale;

    const longwaveNet = (0.05 + firstFinite(r.cloud, 0) * 0.002) * longwaveFactor * depthFluxScale;
    const cloudCool = firstFinite(r.cloud, 0) * 0.01 * depthFluxScale;
    const rainCool = firstFinite(r.precip, 0) * 0.8 * depthFluxScale;

    const daytimeWeight = 0.35 + 0.45 * daylightFraction;
    const overnightWeight = 1 - daytimeWeight;
    const dayAir = 0.4 * tMean + 0.6 * tMax;
    const nightAir = 0.7 * tMean + 0.3 * tMin;
    const airBlend = daytimeWeight * dayAir + overnightWeight * nightAir;

    const flowTempPull = inflowCfs > 0
      ? clamp((inflowTempF - water) * clamp(inflowCfs / Math.max(acres * depthFt, 0.5), 0, 0.25), -6, 6)
      : netFlowCfs * 1.1;

    const equilibriumRaw = airBlend + solarHeat - windCool - evapCool - cloudCool - rainCool - longwaveNet + flowTempPull;
    const equilibrium = clamp(equilibriumRaw, FREEZING_F_FRESH_WATER, 100);

    const prevSurface = layers[0];
    const sedimentBlend = clamp(sedimentFactor, 0, 1);
    const sedimentExchange = sedimentBlend * sedimentConductivity * sedimentDepthM * 0.08;
    const sedimentLag = (0.1 + 0.25 * sedimentBlend) * prevSurface + (0.9 - 0.25 * sedimentBlend) * equilibrium + sedimentExchange;
    const equilibriumWithSediment = clamp(
      equilibrium + sedimentBlend * (sedimentLag - equilibrium),
      FREEZING_F_FRESH_WATER,
      100
    );

    const alpha = clamp(dailyAlpha * areaFactor * depthFactor, 0.01, 0.5);
    const mixedLayerAlpha = clamp(mixAlpha * mixedLayerAlphaBoost * (1 + 0.35 * flowTurnover), 0.01, 0.65);

    layers[0] = clamp(prevSurface + alpha * (equilibriumWithSediment - prevSurface), FREEZING_F_FRESH_WATER, 100);
    for (let i = 1; i < layers.length; i += 1) {
      const prevLayer = layers[i];
      const parent = layers[i - 1];
      const blend = mixedLayerAlpha / (i + 1);
      layers[i] = clamp(prevLayer + blend * (parent - prevLayer), FREEZING_F_FRESH_WATER, 100);
    }

    water = layers.reduce((sum, l) => sum + l, 0) / layers.length;

    const waterEstimate = clamp(water + depthWarmBias, FREEZING_F_FRESH_WATER, 100);
    const waterLow = clamp(waterEstimate - uncertaintyBand, FREEZING_F_FRESH_WATER, 100);
    const waterHigh = clamp(waterEstimate + uncertaintyBand, FREEZING_F_FRESH_WATER, 100);

    return {
      ...r,
      tMean: round1(tMean),
      tMax: round1(tMax),
      tMin: round1(tMin),
      solarHeat: round1(solarHeat),
      evapCool: round1(evapCool),
      longwaveNet: round1(longwaveNet),
      daylightFraction: round1(daylightFraction),
      effectiveWind: round1(effectiveWind),
      windCool: round1(windCool),
      cloudCool: round1(cloudCool),
      rainCool: round1(rainCool),
      airBlend: round1(airBlend),
      equilibrium: round1(equilibrium),
      alpha: round1(alpha),
      mixedLayerAlpha: round1(mixedLayerAlpha),
      mixedLayerDepthFt: round1(mixedLayerDepthFt),
      clarityFactor: round1(clarityFactor),
      flowTurnover: round1(flowTurnover),
      netFlowCfs: round1(netFlowCfs),
      sedimentFactor: round1(sedimentFactor),
      flowTempPull: round1(flowTempPull),
      equilibriumWithSediment: round1(equilibriumWithSediment),
      waterEstimateBulk: round1(water),
      depthWarmBias: round1(depthWarmBias),
      waterEstimate: round1(waterEstimate),
      waterLow: round1(waterLow),
      waterHigh: round1(waterHigh),
      modelHour,
      layerCount
    };
  });
}

function renderSummary({ label, rows, timezone, params, autoCalibrationResult, sensitivityResult, observedTime }) {
  const past = rows.filter((r) => r.source === 'past');
  const future = rows.filter((r) => r.source === 'future_or_today');
  const latest = future[0] || rows[rows.length - 1];
  byId('summary').innerHTML = `
    <h2>Summary</h2>
    <p><strong>${label}</strong> | Timezone: ${timezone}</p>
    <p><strong>Estimated water temp at ${String(params.modelHour).padStart(2, '0')}:00 (today):</strong> <span class="ok">${latest?.waterEstimate ?? '--'} °F</span> (range ${latest?.waterLow ?? '--'} to ${latest?.waterHigh ?? '--'} °F)</p>
    <p class="muted">Time lock: model is solved at ${String(params.modelHour).padStart(2, '0')}:00 local time. Observation time for validation is ${observedTime || '12:00'}.</p>
    <p class="muted">Rows in model: past=${past.length}, future/today=${future.length}. Layers=${params.layerCount}. Wind reduction=${params.windReductionFactor}. Evap coeff=${params.evaporationCoeff}.</p>
    <p class="muted">Extended terms enabled: turbidity ${params.turbidityNtu} NTU, visibility ${params.visibilityFt} ft, inflow ${params.inflowCfs} cfs at ${params.inflowTempF} °F, shading ${params.shadingPct}%.</p>
    ${autoCalibrationResult ? `<p class="muted">Auto-calibration best MAE: ${autoCalibrationResult.mae} °F with turbidity ${autoCalibrationResult.params.turbidityNtu} NTU, sediment ${autoCalibrationResult.params.sedimentFactor}, mix depth ${autoCalibrationResult.params.mixedLayerDepthFt} ft.</p>` : ''}
    ${sensitivityResult ? `<p class="muted">Sensitivity (latest day): wind factor swing ${sensitivityResult.windSwing} °F, evaporation swing ${sensitivityResult.evapSwing} °F, shading swing ${sensitivityResult.shadeSwing} °F.</p>` : ''}
  `;
}

function renderTable(
  rows,
  params = window.__fishcastv2Params || null,
  observedTime = window.__fishcastv2ObservedTime || '12:00',
  uiParams = window.__fishcastv2UiParams || null
) {
  const rowsWithValidation = mergeValidationIntoRows(rows, getAllValidationInputs());
  const rowsWithTraceInputs = mergeTraceInputsIntoRows(rowsWithValidation, params, observedTime, uiParams);
  const header = ['Date', 'Src', 'Tmin', 'Tmean', 'Tmax', 'Wind', 'WindEff', 'DayFrac', 'Precip', 'Solar', 'Cloud', 'AirBlend', 'Solar+', 'Wind-', 'Evap-', 'Longwave-', 'Cloud-', 'Rain-', 'FlowΔ', 'Equilibrium', 'Eq+Sed', 'Alpha', 'MixAlpha', 'Layers', 'WaterBulk', 'WaterLow', 'WaterEst', 'WaterHigh', 'ValidationObs', 'ValidationTime', 'ValidationErr', 'ValidationClarity', 'InputAcres', 'InputDepthFt', 'InputObsDepthFt', 'InputModelHour', 'InputObservedTime', 'InputTurbidityNtu', 'InputVisibilityFt', 'InputInflowCfs', 'InputInflowTempF', 'InputOutflowCfs', 'InputShadingPct', 'InputFetchLengthFt', 'InputWindReduction', 'InputEvapCoeff', 'InputAlbedo', 'InputLongwaveFactor', 'InputMixedLayerDepthFt', 'InputSedimentFactor', 'InputSedimentConductivity', 'InputSedimentDepthM', 'InputDailyAlpha', 'InputMixAlpha', 'InputLayerCount', 'InputUncertaintyBand'];
  const body = rowsWithTraceInputs.map((r) => `<tr>
    <td>${r.date}</td><td>${r.source}</td><td>${r.tMin}</td><td>${r.tMean}</td><td>${r.tMax}</td>
    <td>${r.windMean}</td><td>${r.effectiveWind}</td><td>${r.daylightFraction}</td><td>${r.precip}</td><td>${r.solar}</td><td>${r.cloud}</td>
    <td>${r.airBlend}</td><td>${r.solarHeat}</td><td>${r.windCool}</td><td>${r.evapCool}</td><td>${r.longwaveNet}</td><td>${r.cloudCool}</td><td>${r.rainCool}</td><td>${r.flowTempPull}</td>
    <td>${r.equilibrium}</td><td>${r.equilibriumWithSediment}</td><td>${r.alpha}</td><td>${r.mixedLayerAlpha}</td><td>${r.layerCount}</td><td>${r.waterEstimateBulk}</td><td>${r.waterLow}</td><td><strong>${r.waterEstimate}</strong></td><td>${r.waterHigh}</td>
    <td>${r.validationObserved ?? ''}</td><td>${r.validationObservedTime ?? ''}</td><td>${r.validationError ?? ''}</td><td>${r.validationClarityNtu ?? ''}</td>
    <td>${r.inputAcres ?? ''}</td><td>${r.inputDepthFt ?? ''}</td><td>${r.inputObsDepthFt ?? ''}</td><td>${r.inputModelHour ?? ''}</td><td>${r.inputObservedTime ?? ''}</td><td>${r.inputTurbidityNtu ?? ''}</td><td>${r.inputVisibilityFt ?? ''}</td><td>${r.inputInflowCfs ?? ''}</td><td>${r.inputInflowTempF ?? ''}</td><td>${r.inputOutflowCfs ?? ''}</td><td>${r.inputShadingPct ?? ''}</td><td>${r.inputFetchLengthFt ?? ''}</td><td>${r.inputWindReduction ?? ''}</td><td>${r.inputEvapCoeff ?? ''}</td><td>${r.inputAlbedo ?? ''}</td><td>${r.inputLongwaveFactor ?? ''}</td><td>${r.inputMixedLayerDepthFt ?? ''}</td><td>${r.inputSedimentFactor ?? ''}</td><td>${r.inputSedimentConductivity ?? ''}</td><td>${r.inputSedimentDepthM ?? ''}</td><td>${r.inputDailyAlpha ?? ''}</td><td>${r.inputMixAlpha ?? ''}</td><td>${r.inputLayerCount ?? ''}</td><td>${r.inputUncertaintyBand ?? ''}</td>
  </tr>`).join('');

  byId('tableWrap').innerHTML = `<table><thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}


function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[,\"\n]/.test(str)) return `\"${str.replace(/\"/g, '\"\"')}\"`;
  return str;
}

function rowsToCsv(
  rows,
  params = window.__fishcastv2Params || null,
  observedTime = window.__fishcastv2ObservedTime || '12:00',
  uiParams = window.__fishcastv2UiParams || null
) {
  if (!rows?.length) return '';
  const rowsWithValidation = mergeValidationIntoRows(rows, getAllValidationInputs());
  const rowsWithTraceInputs = mergeTraceInputsIntoRows(rowsWithValidation, params, observedTime, uiParams);
  const columns = [
    'date', 'source', 'tMin', 'tMean', 'tMax', 'windMean', 'effectiveWind', 'daylightFraction',
    'precip', 'solar', 'cloud', 'airBlend', 'solarHeat', 'windCool', 'evapCool', 'longwaveNet',
    'cloudCool', 'rainCool', 'flowTempPull', 'equilibrium', 'equilibriumWithSediment', 'alpha',
    'mixedLayerAlpha', 'layerCount', 'waterEstimateBulk', 'waterLow', 'waterEstimate', 'waterHigh',
    'validationObserved', 'validationObservedTime', 'validationError', 'validationClarityNtu',
    'inputAcres', 'inputDepthFt', 'inputObsDepthFt', 'inputModelHour', 'inputObservedTime',
    'inputTurbidityNtu', 'inputVisibilityFt', 'inputInflowCfs', 'inputInflowTempF', 'inputOutflowCfs',
    'inputShadingPct', 'inputFetchLengthFt', 'inputWindReduction', 'inputEvapCoeff', 'inputAlbedo',
    'inputLongwaveFactor', 'inputMixedLayerDepthFt', 'inputSedimentFactor', 'inputSedimentConductivity', 'inputSedimentDepthM',
    'inputDailyAlpha', 'inputMixAlpha', 'inputLayerCount', 'inputUncertaintyBand'
  ];

  const lines = [columns.join(',')];
  rowsWithTraceInputs.forEach((row) => {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  });

  return lines.join('\n');
}

function mergeValidationIntoRows(rows, validationPoints) {
  const validationByDate = new Map(validationPoints.map((point) => [point.date, point]));
  const mergedRows = rows.map((row) => {
    const validation = validationByDate.get(row.date);
    if (!validation) {
      return {
        ...row,
        validationObserved: null,
        validationObservedTime: null,
        validationError: null,
        validationClarityNtu: null
      };
    }

    return {
      ...row,
      validationObserved: round1(validation.observed),
      validationObservedTime: validation.observedTime || '12:00',
      validationError: round1(validation.observed - row.waterEstimate),
      validationClarityNtu: Number.isFinite(validation.clarityNtu) ? round1(validation.clarityNtu) : null
    };
  });

  const rowDates = new Set(rows.map((row) => row.date));
  const unmatchedValidationRows = validationPoints
    .filter((point) => !rowDates.has(point.date))
    .map((point) => ({
      date: point.date,
      source: 'validation_only',
      tMin: null,
      tMean: null,
      tMax: null,
      windMean: null,
      effectiveWind: null,
      daylightFraction: null,
      precip: null,
      solar: null,
      cloud: null,
      airBlend: null,
      solarHeat: null,
      windCool: null,
      evapCool: null,
      longwaveNet: null,
      cloudCool: null,
      rainCool: null,
      flowTempPull: null,
      equilibrium: null,
      equilibriumWithSediment: null,
      alpha: null,
      mixedLayerAlpha: null,
      layerCount: null,
      waterEstimateBulk: null,
      waterLow: null,
      waterEstimate: null,
      waterHigh: null,
      validationObserved: round1(point.observed),
      validationObservedTime: point.observedTime || '12:00',
      validationError: null,
      validationClarityNtu: Number.isFinite(point.clarityNtu) ? round1(point.clarityNtu) : null
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return [...mergedRows, ...unmatchedValidationRows];
}

function mergeTraceInputsIntoRows(rows, params, observedTime, uiParams) {
  if (!params) return rows;

  const rawOrRounded = (rawValue, normalizedValue) => (Number.isFinite(rawValue) ? rawValue : round1(normalizedValue));

  return rows.map((row) => ({
    ...row,
    inputAcres: rawOrRounded(uiParams?.acres, params.acres),
    inputDepthFt: rawOrRounded(uiParams?.depthFt, params.depthFt),
    inputObsDepthFt: rawOrRounded(uiParams?.obsDepthFt, params.obsDepthFt),
    inputModelHour: params.modelHour,
    inputObservedTime: observedTime || '12:00',
    inputTurbidityNtu: rawOrRounded(uiParams?.turbidityNtu, params.turbidityNtu),
    inputVisibilityFt: rawOrRounded(uiParams?.visibilityFt, params.visibilityFt),
    inputInflowCfs: rawOrRounded(uiParams?.inflowCfs, params.inflowCfs),
    inputInflowTempF: rawOrRounded(uiParams?.inflowTempF, params.inflowTempF),
    inputOutflowCfs: rawOrRounded(uiParams?.outflowCfs, params.outflowCfs),
    inputShadingPct: rawOrRounded(uiParams?.shadingPct, params.shadingPct),
    inputFetchLengthFt: rawOrRounded(uiParams?.fetchLengthFt, params.fetchLengthFt),
    inputWindReduction: rawOrRounded(uiParams?.windReductionFactor, params.windReductionFactor),
    inputEvapCoeff: rawOrRounded(uiParams?.evaporationCoeff, params.evaporationCoeff),
    inputAlbedo: rawOrRounded(uiParams?.albedo, params.albedo),
    inputLongwaveFactor: rawOrRounded(uiParams?.longwaveFactor, params.longwaveFactor),
    inputMixedLayerDepthFt: rawOrRounded(uiParams?.mixedLayerDepthFt, params.mixedLayerDepthFt),
    inputSedimentFactor: rawOrRounded(uiParams?.sedimentFactor, params.sedimentFactor),
    inputSedimentConductivity: rawOrRounded(uiParams?.sedimentConductivity, params.sedimentConductivity),
    inputSedimentDepthM: rawOrRounded(uiParams?.sedimentDepthM, params.sedimentDepthM),
    inputDailyAlpha: rawOrRounded(uiParams?.dailyAlpha, params.dailyAlpha),
    inputMixAlpha: rawOrRounded(uiParams?.mixAlpha, params.mixAlpha),
    inputLayerCount: params.layerCount,
    inputUncertaintyBand: rawOrRounded(uiParams?.uncertaintyBand, params.uncertaintyBand)
  }));
}

function exportTraceCsv(
  rows,
  params = window.__fishcastv2Params || null,
  observedTime = window.__fishcastv2ObservedTime || '12:00',
  uiParams = window.__fishcastv2UiParams || null
) {
  if (!rows?.length) {
    byId('fitOut').textContent = 'Run the model before exporting CSV.';
    return;
  }

  const csv = rowsToCsv(rows, params, observedTime, uiParams);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `fishcastv2-data-calculation-trace-${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const VALIDATION_STORE_KEY = 'fishcastv2.validationHistory';
const FORM_STATE_STORE_KEY = 'fishcastv2.formState';

function saveFormState() {
  const formState = {};
  Object.keys(DEFAULT_FORM_VALUES).forEach((id) => {
    const el = byId(id);
    if (!el) return;
    formState[id] = el.type === 'checkbox' ? Boolean(el.checked) : el.value;
  });
  localStorage.setItem(FORM_STATE_STORE_KEY, JSON.stringify(formState));
}

function loadSavedFormState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FORM_STATE_STORE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function bindFormStatePersistence() {
  Object.keys(DEFAULT_FORM_VALUES).forEach((id) => {
    const el = byId(id);
    if (!el) return;
    const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, saveFormState);
  });
}

function collectInputExportPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    formState: loadSavedFormState(),
    validationHistory: loadSavedValidationPoints()
  };
}

function exportInputParameters() {
  const payload = collectInputExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `fishcastv2-input-parameters-${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  byId('shareStatus').textContent = 'Inputs exported.';
}

function normalizeImportedFormState(rawState) {
  if (!rawState || typeof rawState !== 'object') return null;
  const normalized = {};
  Object.entries(DEFAULT_FORM_VALUES).forEach(([id, defaultValue]) => {
    if (!(id in rawState)) return;
    const incoming = rawState[id];
    normalized[id] = typeof defaultValue === 'boolean' ? Boolean(incoming) : String(incoming ?? '');
  });
  return normalized;
}

function normalizeImportedValidationHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .map((row) => ({
      date: normalizeIsoDate(row?.date),
      observed: Number(row?.observed),
      observedTime: typeof row?.observedTime === 'string' && row.observedTime.includes(':') ? row.observedTime : '12:00',
      clarityNtu: parseOptionalNumber(row?.clarityNtu)
    }))
    .filter((row) => row.date && Number.isFinite(row.observed));
}

async function importInputParametersFromText(jsonText) {
  const payload = JSON.parse(jsonText);
  const importedState = normalizeImportedFormState(payload?.formState ?? payload);
  if (!importedState || !Object.keys(importedState).length) {
    throw new Error('No supported input parameters found in file.');
  }

  setFormValues(importedState);
  saveFormState();

  const importedValidation = normalizeImportedValidationHistory(payload?.validationHistory);
  if (Array.isArray(payload?.validationHistory)) {
    saveValidationPoints(importedValidation);
    renderManualValidationList();
  }

  byId('shareStatus').textContent = `Imported ${Object.keys(importedState).length} input fields${Array.isArray(payload?.validationHistory) ? ` and ${importedValidation.length} validation point(s)` : ''}.`;

  await runModel();
}

function loadSavedValidationPoints() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VALIDATION_STORE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed
        .map((r) => ({
          date: normalizeIsoDate(r?.date),
          observed: Number(r?.observed),
          observedTime: r?.observedTime || '12:00',
          clarityNtu: firstFinite(Number(r?.clarityNtu), null)
        }))
        .filter((r) => typeof r.date === 'string' && Number.isFinite(r.observed))
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
    ? `<ul>${points.map((p, i) => `<li>${p.date} ${p.observedTime}: ${round1(p.observed)} °F${Number.isFinite(p.clarityNtu) ? `, ${p.clarityNtu} NTU` : ''} <button data-remove-index="${i}">Remove</button></li>`).join('')}</ul>`
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

function renderValidationInputs() {
  renderManualValidationList();
}

function getAllValidationInputs() {
  const saved = loadSavedValidationPoints();
  const deduped = new Map();
  saved.forEach((p) => {
    deduped.set(p.date, { date: p.date, observed: p.observed, observedTime: p.observedTime || '12:00', clarityNtu: p.clarityNtu });
  });

  return [...deduped.values()];
}

function buildFitReport(rows, observations) {
  const rowByDate = new Map(rows.map((row) => [row.date, row]));
  const matched = [];
  const unmatched = [];

  observations.forEach((observation) => {
    const model = rowByDate.get(observation.date)?.waterEstimate;
    if (!Number.isFinite(model)) {
      unmatched.push(observation);
      return;
    }

    matched.push({
      ...observation,
      model,
      err: round1(observation.observed - model),
      absErr: round1(Math.abs(observation.observed - model))
    });
  });

  return {
    matched,
    unmatched,
    mae: matched.length
      ? round1(matched.reduce((sum, row) => sum + Math.abs(row.err), 0) / matched.length)
      : null
  };
}

function renderFitReport(report) {
  if (!report.matched.length) {
    byId('fitOut').innerHTML = '<p class="fit-empty">No matching model dates for the validation points entered.</p>';
    return;
  }

  const details = report.matched
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => `<li><strong>${row.date}</strong> ${row.observedTime || '12:00'} — observed <strong>${round1(row.observed)} °F</strong>, model ${round1(row.model)} °F, error <strong>${row.err} °F</strong> (|error| ${row.absErr} °F)</li>`)
    .join('');

  const skipped = report.unmatched.length
    ? `<p class="fit-warning">Skipped ${report.unmatched.length} point(s) with no matching model row: ${report.unmatched.map((r) => r.date).join(', ')}.</p>`
    : '';

  const signedBias = round1(report.matched.reduce((sum, row) => sum + row.err, 0) / report.matched.length);
  const recommendation = report.mae <= 2
    ? 'Fit is strong. Keep current settings and continue collecting observations.'
    : report.mae <= 4
      ? 'Fit is moderate. Try small adjustments to wind reduction, shading, and mixed-layer depth.'
      : 'Fit is weak. Recheck location, observation time, and consider running auto-calibration with more validation points.';

  byId('fitOut').innerHTML = `
    <div class="fit-report">
      <p><strong>Validation points used:</strong> ${report.matched.length} / ${report.matched.length + report.unmatched.length}</p>
      <p><strong>Mean absolute error (MAE):</strong> ${report.mae} °F</p>
      <p><strong>Signed bias:</strong> ${signedBias} °F (${signedBias > 0 ? 'model tends cool' : signedBias < 0 ? 'model tends warm' : 'neutral bias'})</p>
      <p><strong>Guidance:</strong> ${recommendation}</p>
      ${skipped}
      <details>
        <summary>Per-point details</summary>
        <ul>${details}</ul>
      </details>
    </div>
  `;
}

function computeMAE(rows, observations) {
  const joined = observations
    .map((o) => {
      const model = rows.find((r) => r.date === o.date)?.waterEstimate;
      return { ...o, model, err: round1(o.observed - model) };
    })
    .filter((r) => Number.isFinite(r.model));

  if (!joined.length) return null;
  return round1(joined.reduce((s, r) => s + Math.abs(r.err), 0) / joined.length);
}

function autoCalibrate(baseRows, baseParams, observations) {
  if (!observations.length) return null;

  const candidateTurbidity = [Math.max(0, baseParams.turbidityNtu - 8), baseParams.turbidityNtu, baseParams.turbidityNtu + 8];
  const candidateSediment = [clamp(baseParams.sedimentFactor - 0.1, 0, 1), baseParams.sedimentFactor, clamp(baseParams.sedimentFactor + 0.1, 0, 1)];
  const candidateMixDepth = [clamp(baseParams.mixedLayerDepthFt - 0.8, 0.2, baseParams.depthFt), baseParams.mixedLayerDepthFt, clamp(baseParams.mixedLayerDepthFt + 0.8, 0.2, baseParams.depthFt)];

  let best = { mae: computeMAE(baseRows, observations), params: baseParams, rows: baseRows };

  candidateTurbidity.forEach((turbidityNtu) => {
    candidateSediment.forEach((sedimentFactor) => {
      candidateMixDepth.forEach((mixedLayerDepthFt) => {
        const candidateParams = { ...baseParams, turbidityNtu, sedimentFactor, mixedLayerDepthFt };
        const candidateRows = computeModel(window.__fishcastRawRows || [], candidateParams);
        const mae = computeMAE(candidateRows, observations);
        if (Number.isFinite(mae) && (!Number.isFinite(best.mae) || mae < best.mae)) {
          best = { mae, params: candidateParams, rows: candidateRows };
        }
      });
    });
  });

  return best;
}

function runSensitivity(baseParams) {
  const rows = window.__fishcastRawRows || [];
  if (!rows.length) return null;

  const center = computeModel(rows, baseParams);
  const windLow = computeModel(rows, { ...baseParams, windReductionFactor: clamp(baseParams.windReductionFactor - 0.15, 0, 1) });
  const windHigh = computeModel(rows, { ...baseParams, windReductionFactor: clamp(baseParams.windReductionFactor + 0.15, 0, 1) });
  const evapLow = computeModel(rows, { ...baseParams, evaporationCoeff: clamp(baseParams.evaporationCoeff - 0.2, 0.5, 1.5) });
  const evapHigh = computeModel(rows, { ...baseParams, evaporationCoeff: clamp(baseParams.evaporationCoeff + 0.2, 0.5, 1.5) });
  const shadeLow = computeModel(rows, { ...baseParams, shadingPct: clamp(baseParams.shadingPct - 15, 0, 100) });
  const shadeHigh = computeModel(rows, { ...baseParams, shadingPct: clamp(baseParams.shadingPct + 15, 0, 100) });

  const idx = center.length - 1;
  return {
    windSwing: round1(Math.abs((windHigh[idx]?.waterEstimate || 0) - (windLow[idx]?.waterEstimate || 0))),
    evapSwing: round1(Math.abs((evapHigh[idx]?.waterEstimate || 0) - (evapLow[idx]?.waterEstimate || 0))),
    shadeSwing: round1(Math.abs((shadeHigh[idx]?.waterEstimate || 0) - (shadeLow[idx]?.waterEstimate || 0)))
  };
}

function evaluateFit(rows) {
  renderTable(
    rows,
    window.__fishcastv2Params || null,
    window.__fishcastv2ObservedTime || '12:00',
    window.__fishcastv2UiParams || null
  );
  const obs = getAllValidationInputs();

  if (!obs.length) {
    byId('fitOut').innerHTML = '<p class="fit-empty">No observations entered yet.</p>';
    return;
  }

  const report = buildFitReport(rows, obs);
  renderFitReport(report);
}

function readUiParams() {
  const parseOptionalField = (id) => {
    const value = byId(id).value;
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    lat: Number(byId('lat').value),
    lon: Number(byId('lon').value),
    label: byId('label').value,
    acres: Number(byId('acres').value),
    depthFt: Number(byId('depth').value),
    obsDepthFt: Number(byId('obsDepth').value),
    modelHour: Number(byId('modelHour').value),
    observedTime: byId('observedTime').value,
    turbidityNtu: Number(byId('turbidity').value),
    visibilityFt: Number(byId('visibility').value),
    inflowCfs: Number(byId('inflow').value),
    inflowTempF: Number(byId('inflowTemp').value),
    outflowCfs: Number(byId('outflow').value),
    sedimentFactor: Number(byId('sediment').value),
    sedimentConductivity: Number(byId('sedimentConductivity').value),
    sedimentDepthM: Number(byId('sedimentDepthM').value),
    mixedLayerDepthFt: Number(byId('mixedDepth').value),
    windReductionFactor: Number(byId('windReduction').value),
    evaporationCoeff: Number(byId('evapCoeff').value),
    albedo: Number(byId('albedo').value),
    longwaveFactor: Number(byId('longwaveFactor').value),
    shadingPct: Number(byId('shading').value),
    fetchLengthFt: Number(byId('fetchLength').value),
    dailyAlpha: Number(byId('dailyAlpha').value),
    mixAlpha: Number(byId('mixAlpha').value),
    layerCount: Number(byId('layerCount').value),
    uncertaintyBand: Number(byId('uncertaintyBand').value),
    pastDays: clamp(Number(byId('pastDays').value), 14, 21),
    futureDays: Number(byId('futureDays').value),
    startWaterTemp: parseOptionalField('startWater'),
    autoCalibrate: byId('autoCalibrate').checked,
    runSensitivity: byId('runSensitivity').checked
  };
}

function uiParamsChangedSinceLastRun() {
  const previous = window.__fishcastv2UiParams;
  if (!previous) return false;
  const current = readUiParams();

  const compareKeys = [
    'lat', 'lon', 'label', 'acres', 'depthFt', 'obsDepthFt', 'modelHour', 'observedTime',
    'turbidityNtu', 'visibilityFt', 'inflowCfs', 'inflowTempF', 'outflowCfs',
    'sedimentFactor', 'sedimentConductivity', 'sedimentDepthM', 'mixedLayerDepthFt',
    'windReductionFactor', 'evaporationCoeff', 'albedo', 'longwaveFactor', 'shadingPct',
    'fetchLengthFt', 'dailyAlpha', 'mixAlpha', 'layerCount', 'uncertaintyBand',
    'pastDays', 'futureDays', 'startWaterTemp', 'autoCalibrate', 'runSensitivity'
  ];

  return compareKeys.some((key) => {
    if (key === 'startWaterTemp') {
      const previousValue = Number.isFinite(previous[key]) ? previous[key] : null;
      const currentValue = Number.isFinite(current[key]) ? current[key] : null;
      return previousValue !== currentValue;
    }
    return previous[key] !== current[key];
  });
}



function setFieldHelpText() {
  Object.entries(FIELD_HELP).forEach(([id, help]) => {
    const el = byId(id);
    if (!el) return;
    el.title = help;
    if (!el.getAttribute('aria-label')) {
      el.setAttribute('aria-label', `${id}: ${help}`);
    }
  });
}

function setFormValues(values) {
  Object.entries(values).forEach(([id, value]) => {
    const el = byId(id);
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
      return;
    }
    el.value = value;
  });
}

function applyPreset(presetName) {
  const preset = PRESETS[presetName] || PRESETS.default;
  setFormValues({ ...DEFAULT_FORM_VALUES, ...preset });
  byId('presetSelect').value = presetName in PRESETS ? presetName : 'default';
  saveFormState();
}

function serializeUiToQuery() {
  const ui = readUiParams();
  const params = new URLSearchParams();
  Object.entries(ui).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params.set(key, String(value));
  });
  return params.toString();
}

function applyQueryState() {
  const query = new URLSearchParams(window.location.search);
  if (![...query.keys()].length) return;
  const updates = {};
  Object.keys(DEFAULT_FORM_VALUES).forEach((id) => {
    const queryValue = query.get(id);
    if (queryValue !== null) updates[id] = queryValue;
  });
  ['lat','lon','label','acres','depthFt','obsDepthFt','modelHour','observedTime','turbidityNtu','visibilityFt','inflowCfs','inflowTempF','outflowCfs','sedimentFactor','sedimentConductivity','sedimentDepthM','mixedLayerDepthFt','windReductionFactor','evaporationCoeff','albedo','longwaveFactor','shadingPct','fetchLengthFt','dailyAlpha','mixAlpha','layerCount','uncertaintyBand','pastDays','futureDays','startWaterTemp'].forEach((key) => {
    const value = query.get(key);
    if (value === null) return;
    const map = {
      depthFt: 'depth', obsDepthFt: 'obsDepth', turbidityNtu: 'turbidity', visibilityFt: 'visibility', inflowCfs: 'inflow', inflowTempF: 'inflowTemp', outflowCfs: 'outflow', sedimentFactor: 'sediment', mixedLayerDepthFt: 'mixedDepth', windReductionFactor: 'windReduction', evaporationCoeff: 'evapCoeff', shadingPct: 'shading', fetchLengthFt: 'fetchLength', startWaterTemp: 'startWater'
    };
    updates[map[key] || key] = value;
  });
  ['autoCalibrate','runSensitivity'].forEach((id) => {
    const value = query.get(id);
    if (value !== null) updates[id] = value === 'true';
  });
  setFormValues(updates);
  saveFormState();
}

function renderTrendChart(rows) {
  const canvas = byId('trendChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const merged = mergeValidationIntoRows(rows, getAllValidationInputs()).filter((r) => Number.isFinite(r.waterEstimate));
  if (!merged.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const pad = { l: 55, r: 18, t: 16, b: 34 };
  const w = canvas.width;
  const h = canvas.height;
  const xs = merged.map((_, i) => i);
  const vals = merged.flatMap((r) => [r.waterEstimate, r.tMean, r.validationObserved]).filter(Number.isFinite);
  const minY = Math.floor((Math.min(...vals) - 2) / 2) * 2;
  const maxY = Math.ceil((Math.max(...vals) + 2) / 2) * 2;
  const xScale = (x) => pad.l + (x / Math.max(1, xs.length - 1)) * (w - pad.l - pad.r);
  const yScale = (y) => h - pad.b - ((y - minY) / Math.max(1, maxY - minY)) * (h - pad.t - pad.b);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#cdd8e8';
  ctx.lineWidth = 1;

  for (let tick = minY; tick <= maxY; tick += 2) {
    const y = yScale(tick);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = '#445';
    ctx.font = '12px Arial';
    ctx.fillText(String(tick), 8, y + 4);
  }

  ctx.strokeStyle = '#445';
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();

  const drawSeries = (key, color, dashed = false) => {
    ctx.save();
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    let started = false;
    merged.forEach((r, i) => {
      const yv = r[key];
      if (!Number.isFinite(yv)) return;
      const x = xScale(i);
      const y = yScale(yv);
      if (!started) { ctx.beginPath(); ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    if (started) ctx.stroke();
    ctx.restore();
  };

  drawSeries('tMean', '#6b7280', true);
  drawSeries('waterEstimate', '#0b61d8');
  drawSeries('validationObserved', '#d97706');

  const legend = [
    ['Model water estimate', '#0b61d8'],
    ['Air temp mean', '#6b7280'],
    ['Observed water temp', '#d97706']
  ];
  legend.forEach(([name, color], i) => {
    const x = pad.l + i * 210;
    const y = h - 10;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 8, 16, 3);
    ctx.fillStyle = '#223';
    ctx.font = '12px Arial';
    ctx.fillText(name, x + 22, y);
  });
}

function validateUiParams(ui) {
  if (!Number.isFinite(ui.lat) || ui.lat < -90 || ui.lat > 90) throw new Error('Latitude must be between -90 and 90.');
  if (!Number.isFinite(ui.lon) || ui.lon < -180 || ui.lon > 180) throw new Error('Longitude must be between -180 and 180.');
  if (!Number.isFinite(ui.depthFt) || ui.depthFt <= 0) throw new Error('Depth must be greater than 0 ft.');
  if (!Number.isFinite(ui.acres) || ui.acres <= 0) throw new Error('Area (acres) must be greater than 0.');
  if (!Number.isFinite(ui.futureDays) || ui.futureDays < 0 || ui.futureDays > 16) throw new Error('Future days must be between 0 and 16.');
}

async function fetchJsonOrThrow(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status} ${response.statusText})`);
  }
  const payload = await response.json();
  if (payload?.error) {
    throw new Error(`${label} API error: ${payload.reason || payload.error}`);
  }
  return payload;
}

async function runModel() {
  const ui = readUiParams();
  validateUiParams(ui);
  const { forecast, archive } = buildUrls({ lat: ui.lat, lon: ui.lon, pastDays: ui.pastDays, futureDays: ui.futureDays });
  const [forecastData, archiveData] = await Promise.all([
    fetchJsonOrThrow(forecast, 'Forecast'),
    fetchJsonOrThrow(archive, 'Archive')
  ]);

  window.__fishcastRawRows = buildSeries(archiveData, forecastData);

  let params = toModelParams(ui);
  let rows = computeModel(window.__fishcastRawRows, params);

  const observations = getAllValidationInputs();
  let autoCalibrationResult = null;
  if (ui.autoCalibrate) {
    autoCalibrationResult = autoCalibrate(rows, params, observations);
    if (autoCalibrationResult?.rows) {
      rows = autoCalibrationResult.rows;
      params = autoCalibrationResult.params;
    }
  }

  const sensitivityResult = ui.runSensitivity ? runSensitivity(params) : null;

  window.__fishcastv2Rows = rows;
  window.__fishcastv2Params = params;
  window.__fishcastv2UiParams = ui;
  window.__fishcastv2ObservedTime = ui.observedTime || '12:00';
  renderSummary({ label: ui.label, rows, timezone: forecastData.timezone, params, autoCalibrationResult, sensitivityResult, observedTime: ui.observedTime });
  renderTable(rows, params, ui.observedTime || '12:00', ui);
  renderValidationInputs(rows);
  renderTrendChart(rows);
}

setFieldHelpText();
applyPreset('default');
setFormValues(loadSavedFormState());
applyQueryState();
bindFormStatePersistence();

byId('run').addEventListener('click', () => runModel().catch((e) => {
  byId('summary').innerHTML = `<p>Failed to run model: ${e.message}</p>`;
}));
byId('evaluate').addEventListener('click', async () => {
  if (uiParamsChangedSinceLastRun()) {
    await runModel();
  }
  evaluateFit(window.__fishcastv2Rows || []);
});
byId('exportCsv').addEventListener('click', async () => {
  if (uiParamsChangedSinceLastRun()) {
    await runModel();
  }
  exportTraceCsv(
    window.__fishcastv2Rows || [],
    window.__fishcastv2Params || null,
    window.__fishcastv2ObservedTime || '12:00',
    window.__fishcastv2UiParams || null
  );
});
byId('resetDefaults').addEventListener('click', () => {
  applyPreset('default');
  byId('presetSelect').value = 'default';
  byId('shareStatus').textContent = 'Defaults restored.';
});
byId('applyPreset').addEventListener('click', () => {
  applyPreset(byId('presetSelect').value || 'default');
  byId('shareStatus').textContent = `Preset applied: ${byId('presetSelect').selectedOptions[0]?.textContent || 'default'}`;
});
byId('copyShareLink').addEventListener('click', async () => {
  const base = `${window.location.origin}${window.location.pathname}`;
  const link = `${base}?${serializeUiToQuery()}`;
  try {
    await navigator.clipboard.writeText(link);
    byId('shareStatus').textContent = 'Share link copied.';
  } catch {
    byId('shareStatus').textContent = link;
  }
});
byId('exportInputs').addEventListener('click', () => {
  saveFormState();
  exportInputParameters();
});
byId('importInputs').addEventListener('click', () => {
  byId('importInputsFile').click();
});
byId('importInputsFile').addEventListener('change', async (event) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    await importInputParametersFromText(text);
  } catch (error) {
    byId('shareStatus').textContent = `Import failed: ${error.message}`;
  } finally {
    event.target.value = '';
  }
});

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
