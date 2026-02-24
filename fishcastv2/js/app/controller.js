const byId = (id) => document.getElementById(id);

// Defaults (your pond settings)
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
  sediment: '0',
  sedimentConductivity: '0',
  sedimentDepthM: '0.4',
  mixedDepth: '1.5',
  windReduction: '0.7',
  evapCoeff: '1',
  albedo: '0.05',
  longwaveFactor: '1',
  shading: '0',
  fetchLength: '550',
  dailyAlpha: '0.5',
  mixAlpha: '0.3',
  layerCount: '2',
  uncertaintyBand: '2.5',
  autoCalibrate: false,
  runSensitivity: false
};

// Saturation vapor pressure (Tetens)
function satVaporPress(T) {
  return 6.11 * Math.pow(10, (7.5 * T) / (237.3 + T));
}

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

function buildUrls({ lat, lon, pastDays, futureDays }) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const pastStart = new Date(yesterday.getTime() - (pastDays - 1) * 24 * 3600 * 1000);
  const futureEnd = new Date(now.getTime() + futureDays * 24 * 3600 * 1000);

  const varsDaily = [
    'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
    'precipitation_sum', 'windspeed_10m_mean', 'shortwave_radiation_sum',
    'cloudcover_mean', 'relative_humidity_2m_mean'
  ].join(',');

  const varsCurrent = ['temperature_2m', 'windspeed_10m', 'cloudcover', 'relative_humidity_2m'].join(',');

  const forecast = new URL('https://api.open-meteo.com/v1/forecast');
  forecast.search = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
                                        daily: varsDaily, current: varsCurrent, timezone: 'auto',
                                        temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
                                        precipitation_unit: 'inch',
                                        start_date: toISODate(now), end_date: toISODate(futureEnd)
  }).toString();

  const archive = new URL('https://archive-api.open-meteo.com/v1/archive');
  archive.search = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
                                       daily: varsDaily, timezone: 'auto',
                                       temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
                                       precipitation_unit: 'inch',
                                       start_date: toISODate(pastStart), end_date: toISODate(yesterday)
  }).toString();

  return { forecast: forecast.toString(), archive: archive.toString() };
}

async function fetchData(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function runModel() {
  try {
    const ui = {};
    for (const key in DEFAULT_FORM_VALUES) {
      ui[key] = byId(key)?.value ?? DEFAULT_FORM_VALUES[key];
    }

    const params = {
      lat: Number(ui.lat),
      lon: Number(ui.lon),
      acres: Number(ui.acres),
      depthFt: Number(ui.depth),
      mixedLayerDepthFt: Number(ui.mixedDepth),
      pastDays: Number(ui.pastDays),
      futureDays: Number(ui.futureDays),
      startWater: Number(ui.startWater) || 50,
      obsDepthFt: Number(ui.obsDepth),
      turbidity: Number(ui.turbidity),
      inflow: Number(ui.inflow),
      inflowTemp: Number(ui.inflowTemp),
      sediment: Number(ui.sediment),
      sedimentConductivity: Number(ui.sedimentConductivity),
      sedimentDepthM: Number(ui.sedimentDepthM),
      windReduction: Number(ui.windReduction),
      evapCoeff: Number(ui.evapCoeff),
      albedo: Number(ui.albedo),
      longwaveFactor: Number(ui.longwaveFactor),
      shading: Number(ui.shading),
      fetchLength: Number(ui.fetchLength),
      dailyAlpha: Number(ui.dailyAlpha),
      mixAlpha: Number(ui.mixAlpha),
      layerCount: Number(ui.layerCount),
      uncertaintyBand: Number(ui.uncertaintyBand)
    };

    const urls = buildUrls(params);
    const [forecastData, archiveData] = await Promise.all([
      fetchData(urls.forecast),
                                                          fetchData(urls.archive)
    ]);

    // Simple series build (minimal version)
    const series = [];
    const dailyPast = archiveData.daily || {};
    for (let i = 0; i < (dailyPast.time?.length || 0); i++) {
      series.push({
        date: dailyPast.time[i],
        source: 'past',
        tMin: finiteOrNull(dailyPast.temperature_2m_min[i]),
                  tMean: finiteOrNull(dailyPast.temperature_2m_mean[i]),
                  tMax: finiteOrNull(dailyPast.temperature_2m_max[i]),
                  windMean: finiteOrNull(dailyPast.windspeed_10m_mean[i]),
                  precip: finiteOrNull(dailyPast.precipitation_sum[i]),
                  solar: finiteOrNull(dailyPast.shortwave_radiation_sum[i]),
                  cloud: finiteOrNull(dailyPast.cloudcover_mean[i]),
                  humidityMean: finiteOrNull(dailyPast.relative_humidity_2m_mean[i])
      });
    }

    // Add future (simplified)
    const dailyFuture = forecastData.daily || {};
    for (let i = 0; i < (dailyFuture.time?.length || 0); i++) {
      series.push({
        date: dailyFuture.time[i],
        source: 'future_or_today',
        tMin: finiteOrNull(dailyFuture.temperature_2m_min[i]),
                  tMean: finiteOrNull(dailyFuture.temperature_2m_mean[i]),
                  tMax: finiteOrNull(dailyFuture.temperature_2m_max[i]),
                  windMean: finiteOrNull(dailyFuture.windspeed_10m_mean[i]),
                  precip: finiteOrNull(dailyFuture.precipitation_sum[i]),
                  solar: finiteOrNull(dailyFuture.shortwave_radiation_sum[i]),
                  cloud: finiteOrNull(dailyFuture.cloudcover_mean[i]),
                  humidityMean: finiteOrNull(dailyFuture.relative_humidity_2m_mean[i])
      });
    }

    const rows = computeModel(series, params, ui.observedTime || '12:00');

    console.log('Model ran successfully. Rows:', rows.length);
    console.log('Last day estimate:', rows[rows.length-1]);

    // Placeholder for UI update
    if (byId('summary')) {
      byId('summary').innerHTML = `<p>Model ran: ${rows.length} days. Latest estimate: ${round1(rows[rows.length-1].waterEstimate)} °F</p>`;
    }

  } catch (e) {
    console.error('Model error:', e);
    if (byId('summary')) {
      byId('summary').innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
    }
  }
}

// The improved computeModel function
function computeModel(series, params, observedTime) {
  const rows = [];
  let prevEstimate = params.startWater || 50;
  let prevSedimentTemp = prevEstimate;

  for (const day of series) {
    const daylightFraction = 0.5; // Simplified for minimal version
    const effectiveWind = day.windMean * params.windReduction;

    let dynamicMixedDepthFt = params.mixedLayerDepthFt + 0.3 * day.windMean * Math.sqrt(params.fetchLength / 328.08);
    dynamicMixedDepthFt = clamp(dynamicMixedDepthFt, 1, params.depthFt);

    let currentTurbidity = params.turbidity;
    if (day.precip > 0.1) {
      currentTurbidity += 10 * day.precip;
      currentTurbidity = clamp(currentTurbidity, params.turbidity, 500);
    }
    const dynamicClarityFactor = Math.exp(-0.015 * currentTurbidity);

    const airBlend = 0.6 * day.tMean + 0.4 * day.tMax;

    const absorbedSolar = day.solar * daylightFraction * (1 - params.shading / 100) * (1 - params.albedo) * dynamicClarityFactor;
    const solarHeat = absorbedSolar * 0.002;

    const windCool = params.evapCoeff * 0.001 * effectiveWind;

    const es = satVaporPress(prevEstimate);
    const ea = satVaporPress(airBlend) * ((day.humidityMean || 70) / 100);
    const evapCool = params.evapCoeff * 0.0006 * effectiveWind * (es - ea) * daylightFraction;

    const longwaveNet = params.longwaveFactor * 0.03 * (airBlend - prevEstimate);
    const cloudCool = 0.02 * (day.cloud || 0) / 100 * daylightFraction;
    const rainCool = day.precip > 0 ? 0.5 * day.precip : 0;

    const flowTurnover = params.inflow / (params.acres * 2.29568e-5 * params.depthFt * 3630);
    let flowTempPull = flowTurnover * (params.inflowTemp - prevEstimate);
    if (day.precip > 0.05) {
      const rainVolume = day.precip * params.acres * 3630 / 12 / params.depthFt;
      const rainTempPull = rainVolume * (day.tMean - prevEstimate);
      flowTempPull += rainTempPull;
    }

    const bottomFlux = params.sedimentConductivity * (prevSedimentTemp - prevEstimate) / params.sedimentDepthM * 0.001;

    let equilibrium = airBlend + solarHeat - windCool - evapCool - longwaveNet - cloudCool - rainCool + flowTempPull + bottomFlux;
    equilibrium = clamp(equilibrium, 32, 120);

    let equilibriumWithSediment = equilibrium;
    if (params.sediment > 0) {
      const sedimentLag = 0.5 * params.sediment * (prevSedimentTemp || airBlend);
      equilibriumWithSediment = equilibrium * (1 - params.sediment) + sedimentLag;
      prevSedimentTemp = 0.9 * prevSedimentTemp + 0.1 * equilibrium;
    }

    const alpha = clamp(params.dailyAlpha * (params.mixedLayerDepthFt / params.depthFt), 0.02, 0.5);
    let waterEstimate = prevEstimate + alpha * (equilibriumWithSediment - prevEstimate);
    waterEstimate = clamp(waterEstimate, 32, 120);

    prevEstimate = waterEstimate;
    prevSedimentTemp = prevSedimentTemp || prevEstimate;

    rows.push({
      date: day.date,
      source: day.source,
      tMean: round1(day.tMean),
              solarHeat: round1(solarHeat),
              evapCool: round1(evapCool),
              flowTempPull: round1(flowTempPull),
              bottomFlux: round1(bottomFlux),
              equilibrium: round1(equilibrium),
              waterEstimate: round1(waterEstimate)
    });
  }

  return rows;
}

// Basic run trigger
byId('run')?.addEventListener('click', runModel);

// Auto-run on load
runModel();
