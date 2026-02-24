import { mkdirSync, writeFileSync } from 'node:fs';
import { computeLongwaveLoss } from '../js/app/model-physics.mjs';

const scenario = {
  date: '2026-02-21',
  tMean: 53.5,
  tMax: 57,
  tMin: 49,
  windMean: 4,
  solar: 6,
  depthFluxScale: 1,
  longwaveFactor: 1
};

const cloudPoints = [0, 25, 50, 75, 100];
const rows = cloudPoints.map((cloud) => {
  const terms = computeLongwaveLoss(cloud, scenario.longwaveFactor, scenario.depthFluxScale);
  return {
    ...scenario,
    cloud,
    cloudFrac: Number(terms.cloudFrac.toFixed(3)),
    longwaveClear: Number(terms.longwaveClear.toFixed(3)),
    longwaveCloudAdjustment: Number(terms.longwaveCloudAdjustment.toFixed(3)),
    longwaveLoss: Number(terms.longwaveLoss.toFixed(3))
  };
});

const columns = ['date', 'tMean', 'tMax', 'tMin', 'windMean', 'solar', 'cloud', 'cloudFrac', 'longwaveClear', 'longwaveCloudAdjustment', 'longwaveLoss'];
const csv = [columns.join(','), ...rows.map((row) => columns.map((c) => row[c]).join(','))].join('\n');

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/cloud-longwave-trace.csv', csv, 'utf8');
console.log(csv);
