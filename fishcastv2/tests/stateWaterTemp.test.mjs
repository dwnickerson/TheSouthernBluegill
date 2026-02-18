import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildForecastState } from '../js/app/state.js';
import { getDisplayedWaterValues } from '../js/ui/render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const fixturePath = path.resolve(__dirname, '../../fishcast/js/tools/fixtures/weatherPayload.sample.json');
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));

  const state = await buildForecastState({
    coords: { lat: 34.2576, lon: -88.7034, name: 'Tupelo Pond (fixture)' },
    waterType: 'pond',
    speciesKey: 'bluegill',
    days: 5,
    weatherPayload: fixture
  });

  const displayed = getDisplayedWaterValues(state);
  const toleranceF = 0.2;

  for (const [key, expected] of Object.entries({
    surfaceNow: state.water.surfaceNow,
    sunrise: state.water.periodsToday.sunrise,
    midday: state.water.periodsToday.midday,
    sunset: state.water.periodsToday.sunset
  })) {
    const actual = displayed[key];
    const delta = Math.abs(actual - expected);
    assert.ok(delta <= toleranceF, `${key} mismatch. expected=${expected}, actual=${actual}, delta=${delta}`);
  }

  console.log('stateWaterTemp.test.mjs passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
