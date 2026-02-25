function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[,"\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
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
    inputSolarGainFactor: rawOrRounded(uiParams?.solarGainFactor, params.solarGainFactor),
    inputWindCouplingFactor: rawOrRounded(uiParams?.windCouplingFactor, params.windCouplingFactor),
    inputRainCoolingCoeff: rawOrRounded(uiParams?.rainCoolingCoeff, params.rainCoolingCoeff),
    inputSkyViewFactor: rawOrRounded(uiParams?.skyViewFactor, params.skyViewFactor),
    inputSedimentExchangeCoeff: rawOrRounded(uiParams?.sedimentExchangeCoeff, params.sedimentExchangeCoeff),
    inputSeedStartWaterFromFirstObservation: Boolean(uiParams?.seedStartWaterFromFirstObservation ?? params.seedStartWaterFromFirstObservation),
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

export function mergeValidationIntoRows(rows, validationPoints) {
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
      humidityMean: null,
      windMean: null,
      effectiveWind: null,
      daylightFraction: null,
      precip: null,
      solar: null,
      cloud: null,
      cloudFrac: null,
      airBlend: null,
      solarHeat: null,
      windCool: null,
      evapCool: null,
      evapCoolNew: null,
      longwaveClear: null,
      longwaveCloudAdjustment: null,
      longwaveLoss: null,
      longwaveNet: null,
      cloudCool: null,
      rainCool: null,
      bottomFlux: null,
      inflowTempPull: null,
      rainTempPull: null,
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

export function buildTraceRows(rows, { params = null, observedTime = '12:00', uiParams = null, validationPoints = [] } = {}) {
  const rowsWithValidation = mergeValidationIntoRows(rows, validationPoints);
  return mergeTraceInputsIntoRows(rowsWithValidation, params, observedTime, uiParams);
}

export function rowsToCsv(rows, { params = null, observedTime = '12:00', uiParams = null, validationPoints = [] } = {}) {
  if (!rows?.length) return '';

  const rowsWithTraceInputs = buildTraceRows(rows, { params, observedTime, uiParams, validationPoints });
  const columns = [
    'date', 'source', 'tMin', 'tMean', 'tMax', 'humidityMean', 'windMean', 'effectiveWind', 'daylightFraction',
    'precip', 'solar', 'cloud', 'cloudFrac', 'airBlend', 'solarHeat', 'windCool', 'evapCool', 'evapCoolNew', 'longwaveClear', 'longwaveCloudAdjustment', 'longwaveLoss', 'longwaveNet',
    'cloudCool', 'rainCool', 'bottomFlux', 'inflowTempPull', 'rainTempPull', 'flowTempPull', 'equilibrium', 'equilibriumWithSediment', 'alpha',
    'mixedLayerAlpha', 'layerCount', 'waterEstimateBulk', 'waterLow', 'waterEstimate', 'waterHigh',
    'validationObserved', 'validationObservedTime', 'validationError', 'validationClarityNtu',
    'inputAcres', 'inputDepthFt', 'inputObsDepthFt', 'inputModelHour', 'inputObservedTime',
    'inputTurbidityNtu', 'inputVisibilityFt', 'inputInflowCfs', 'inputInflowTempF', 'inputOutflowCfs',
    'inputShadingPct', 'inputFetchLengthFt', 'inputWindReduction', 'inputEvapCoeff', 'inputAlbedo',
    'inputLongwaveFactor', 'inputSolarGainFactor', 'inputWindCouplingFactor', 'inputRainCoolingCoeff', 'inputSkyViewFactor', 'inputSedimentExchangeCoeff', 'inputSeedStartWaterFromFirstObservation', 'inputMixedLayerDepthFt', 'inputSedimentFactor', 'inputSedimentConductivity', 'inputSedimentDepthM',
    'inputDailyAlpha', 'inputMixAlpha', 'inputLayerCount', 'inputUncertaintyBand'
  ];

  const lines = [columns.join(',')];
  rowsWithTraceInputs.forEach((row) => {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  });

  return lines.join('\n');
}
