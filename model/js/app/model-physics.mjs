export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const LONGWAVE_CLEAR_COEFF = 0.22;
export const LONGWAVE_CLOUD_REDUCTION_MAX = 0.55;

// Sign convention: positive longwaveLoss means cooling that should be subtracted.
export function computeLongwaveLoss(cloudPct, longwaveFactor, depthFluxScale) {
  const cloudFrac = clamp((Number.isFinite(cloudPct) ? cloudPct : 0) / 100, 0, 1);
  const longwaveClear = LONGWAVE_CLEAR_COEFF * longwaveFactor * depthFluxScale;
  const longwaveLoss = longwaveClear * (1 - LONGWAVE_CLOUD_REDUCTION_MAX * cloudFrac);
  const longwaveCloudAdjustment = longwaveClear - longwaveLoss;

  return {
    cloudFrac,
    longwaveClear,
    longwaveLoss,
    longwaveCloudAdjustment
  };
}
