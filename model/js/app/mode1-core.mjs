import { computeLongwaveLoss } from './model-physics.mjs';

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function firstFinite(...vals) {
  for (const v of vals) {
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function satVaporPress(tempF) {
  const tempC = (tempF - 32) * (5 / 9);
  return 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
}

export function toModelParams(raw) {
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
    solarGainFactor: clamp(firstFinite(raw.solarGainFactor, 1.0), 0.7, 1.3),
    windCouplingFactor: clamp(firstFinite(raw.windCouplingFactor, 1.0), 0.6, 1.4),
    rainCoolingCoeff: clamp(firstFinite(raw.rainCoolingCoeff, 0.8), 0.3, 1.2),
    skyViewFactor: clamp(firstFinite(raw.skyViewFactor, 1.0), 0.4, 1.0),
    sedimentExchangeCoeff: clamp(firstFinite(raw.sedimentExchangeCoeff, 0.08), 0.0, 0.2),
    seedStartWaterFromFirstObservation: Boolean(raw.seedStartWaterFromFirstObservation),
    shadingPct: clamp(firstFinite(raw.shadingPct, 20), 0, 100),
    fetchLengthFt: clamp(firstFinite(raw.fetchLengthFt, 550), 20, 4000),
    dailyAlpha: clamp(firstFinite(raw.dailyAlpha, 0.18), 0.01, 0.5),
    mixAlpha: clamp(firstFinite(raw.mixAlpha, 0.2), 0.01, 0.5),
    layerCount: clamp(Math.round(firstFinite(raw.layerCount, 1)), 1, 3),
    uncertaintyBand: clamp(firstFinite(raw.uncertaintyBand, 2.5), 0, 10)
  };
}

export function computeModel(rows, rawParams, options = {}) {
  const { getValidationInputs = () => [] } = options;
  const params = toModelParams(rawParams);
  const {
    acres, depthFt, startWaterTemp, obsDepthFt, modelHour, turbidityNtu, visibilityFt, inflowCfs, outflowCfs, inflowTempF,
    sedimentFactor, sedimentConductivity, sedimentDepthM, mixedLayerDepthFt, windReductionFactor, evaporationCoeff,
    albedo, longwaveFactor, solarGainFactor, windCouplingFactor, rainCoolingCoeff, skyViewFactor, sedimentExchangeCoeff,
    seedStartWaterFromFirstObservation, shadingPct, fetchLengthFt, dailyAlpha, mixAlpha, layerCount, uncertaintyBand
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
  let seededStartWater = startWaterTemp;
  if (!Number.isFinite(seededStartWater) && seedStartWaterFromFirstObservation) {
    const earliestValidation = getValidationInputs()
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (earliestValidation && Number.isFinite(earliestValidation.observed)) {
      seededStartWater = earliestValidation.observed;
    }
  }
  let water = Number.isFinite(seededStartWater) ? seededStartWater : initialAir;
  water = clamp(water, FREEZING_F_FRESH_WATER, 100);
  let sedimentTemp = water;

  const layers = Array.from({ length: layerCount }, () => water);

  return rows.map((r) => {
    const tMean = firstFinite(r.tMean, r.tMax, r.tMin, water);
    const tMax = firstFinite(r.tMax, tMean);
    const tMin = firstFinite(r.tMin, tMean);
    const solar = firstFinite(r.solar, 0);
    const baseDaylightFraction = clamp(solar / MAX_DAILY_SOLAR_MJ_M2, 0.12, 1);
    const hourWeight = Math.max(0.2, Math.sin(((modelHour + 1) / 24) * Math.PI));
    const daylightFraction = clamp(baseDaylightFraction * hourWeight, 0.08, 1);
    let dynamicMixedDepthFt = mixedLayerDepthFt + 0.3 * firstFinite(r.windMean, 0) * Math.sqrt(fetchLengthFt / 328.08);
    dynamicMixedDepthFt = clamp(dynamicMixedDepthFt, 1, depthFt);
    const effectiveMixedDepthFt = Math.max(dynamicMixedDepthFt, 0.2);
    const depthFluxScale = clamp(REFERENCE_MIXED_DEPTH_FT / effectiveMixedDepthFt, 0.35, 2.5);
    const shadeFactor = 1 - shadingPct / 100;
    let currentTurbidity = turbidityNtu;
    if (firstFinite(r.precip, 0) > 0.1) {
      currentTurbidity += 10 * firstFinite(r.precip, 0);
      currentTurbidity = clamp(currentTurbidity, turbidityNtu, 500);
    }
    const dynamicClarityFactor = Math.exp(-0.015 * currentTurbidity);
    const absorbedSolar = solar * (1 - albedo) * shadeFactor;
    let solarHeat = absorbedSolar * 0.02 * clamp(clarityFactor * dynamicClarityFactor, 0.08, 1.2) * depthFluxScale;
    solarHeat *= solarGainFactor;

    const windMph = firstFinite(r.windMean, 0);
    const fetchFactor = clamp(0.75 + fetchLengthFt / 1500, 0.6, 2);
    const windExposure = (0.4 + 0.6 * daylightFraction) * windReductionFactor * fetchFactor;
    const effectiveWind = windMph * windExposure;
    const coupledWind = effectiveWind * windCouplingFactor;
    const windCool = coupledWind * 0.08 * depthFluxScale;

    const {
      cloudFrac,
      longwaveClear,
      longwaveLoss: baseLongwaveLoss,
      longwaveCloudAdjustment
    } = computeLongwaveLoss(firstFinite(r.cloud, 0), longwaveFactor, depthFluxScale);
    const longwaveLoss = baseLongwaveLoss * skyViewFactor;
    const cloudCool = 0;
    const rainCool = firstFinite(r.precip, 0) * 0.8 * depthFluxScale * rainCoolingCoeff;

    const daytimeWeight = 0.35 + 0.45 * daylightFraction;
    const overnightWeight = 1 - daytimeWeight;
    const dayAir = 0.4 * tMean + 0.6 * tMax;
    const nightAir = 0.7 * tMean + 0.3 * tMin;
    const airBlend = daytimeWeight * dayAir + overnightWeight * nightAir;
    const relativeHumidity = clamp(firstFinite(r.humidityMean, 65), 0, 100);
    const es = satVaporPress(water);
    const ea = satVaporPress(airBlend) * (relativeHumidity / 100);
    const evapCoolNew = evaporationCoeff * 0.0006 * coupledWind * Math.max(es - ea, 0) * daylightFraction * depthFluxScale;

    let inflowTempPull = 0;
    if (inflowCfs > 0) {
      const mix = clamp(inflowCfs / Math.max(acres * depthFt, 0.5), 0, 0.25);
      inflowTempPull = clamp((inflowTempF - water) * mix, -6, 6);
    }

    let rainTempPull = 0;
    const precipIn = firstFinite(r.precip, 0);
    if (precipIn > 0.05) {
      const rainFrac = clamp((precipIn / 12) / Math.max(depthFt, 0.2), 0, 0.15);
      const rainTempF = tMean;
      rainTempPull = clamp(rainFrac * (rainTempF - water), -1.5, 1.5);
    }

    const flowTempPull = clamp(inflowTempPull + rainTempPull, -6, 6);

    const bottomFlux = sedimentConductivity * (sedimentTemp - water) / Math.max(sedimentDepthM, 0.05) * 0.001;

    const equilibriumRaw = airBlend + solarHeat - windCool - evapCoolNew - rainCool - longwaveLoss + flowTempPull + bottomFlux;
    const equilibrium = clamp(equilibriumRaw, FREEZING_F_FRESH_WATER, 100);

    const prevSurface = layers[0];
    const sedimentBlend = clamp(sedimentFactor, 0, 1);
    const sedimentExchange = sedimentBlend * sedimentConductivity * sedimentDepthM * sedimentExchangeCoeff;
    const sedimentLag = (0.1 + 0.25 * sedimentBlend) * prevSurface + (0.9 - 0.25 * sedimentBlend) * equilibrium + sedimentExchange;
    sedimentTemp = clamp(0.92 * sedimentTemp + 0.08 * sedimentLag, FREEZING_F_FRESH_WATER, 100);
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
      humidityMean: round1(relativeHumidity),
      evapCool: round1(evapCoolNew),
      evapCoolNew: round1(evapCoolNew),
      cloudFrac: round1(cloudFrac),
      longwaveClear: round1(longwaveClear),
      longwaveLoss: round1(longwaveLoss),
      longwaveCloudAdjustment: round1(longwaveCloudAdjustment),
      longwaveNet: round1(longwaveLoss),
      daylightFraction: round1(daylightFraction),
      effectiveWind: round1(effectiveWind),
      windCool: round1(windCool),
      cloudCool: round1(cloudCool),
      rainCool: round1(rainCool),
      airBlend: round1(airBlend),
      equilibrium: round1(equilibrium),
      alpha: round1(alpha),
      mixedLayerAlpha: round1(mixedLayerAlpha),
      mixedLayerDepthFt: round1(dynamicMixedDepthFt),
      clarityFactor: round1(dynamicClarityFactor),
      flowTurnover: round1(flowTurnover),
      netFlowCfs: round1(netFlowCfs),
      sedimentFactor: round1(sedimentFactor),
      bottomFlux: round1(bottomFlux),
      inflowTempPull: round1(inflowTempPull),
      rainTempPull: round1(rainTempPull),
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
