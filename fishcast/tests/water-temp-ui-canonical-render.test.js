import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SOURCE_PATH = new URL('../js/ui/forecast.js', import.meta.url);
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

test('renderForecast requires canonical precomputed waterTempView', () => {
  assert.match(
    source,
    /assertCanonicalWaterTempView\(data\);/,
    'renderForecast should validate canonical waterTempView before rendering'
  );

  assert.match(
    source,
    /const viewModel = waterTempView;\s*if \(!viewModel\) \{\s*throw new Error\('Missing canonical data\.waterTempView;/,
    'UI should throw if canonical waterTempView is missing instead of recomputing water temperatures'
  );
});

test('water temp render path does not recompute context or depth temps in UI', () => {
  assert.doesNotMatch(source, /normalizeWaterTempContext\s*\(/, 'UI render path must not normalize context during render');
  assert.doesNotMatch(source, /estimateTempByDepth\s*\(/, 'UI render path must not estimate depth temps during render');

  assert.match(
    source,
    /writeWaterTempField\(\{ selector: '\[data-water-field="surface"\]', nextText: `\$\{waterTempView\.surfaceNow\.toFixed\(1\)\}°F`, sourceVar: 'waterTempView\.surfaceNow'/,
    'surface field should be written from canonical waterTempView.surfaceNow'
  );
  assert.match(
    source,
    /writeWaterTempField\(\{ selector: '\[data-water-field="sunrise"\]', nextText: `\$\{waterTempView\.sunrise\.toFixed\(1\)\}°F`, sourceVar: 'waterTempView\.sunrise'/,
    'sunrise field should be written from canonical waterTempView.sunrise'
  );
  assert.match(
    source,
    /writeWaterTempField\(\{ selector: '\[data-water-field="midday"\]', nextText: `\$\{waterTempView\.midday\.toFixed\(1\)\}°F`, sourceVar: 'waterTempView\.midday'/,
    'midday field should be written from canonical waterTempView.midday'
  );
  assert.match(
    source,
    /writeWaterTempField\(\{ selector: '\[data-water-field="sunset"\]', nextText: `\$\{waterTempView\.sunset\.toFixed\(1\)\}°F`, sourceVar: 'waterTempView\.sunset'/,
    'sunset field should be written from canonical waterTempView.sunset'
  );
});
