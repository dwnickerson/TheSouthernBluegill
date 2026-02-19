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
  assert.doesNotMatch(source, /writeWaterTempField\s*\(/, 'water temp fields should render directly in HTML with no post-render mutation');
  assert.doesNotMatch(source, /assertRenderedWaterTemps\s*\(/, 'UI render path should not run post-render water temp assertions');
  assert.match(source, /data-water-field="surface">\$\{waterTempView\.surfaceNow\.toFixed\(1\)\}°F</, 'surface field should render directly from canonical waterTempView.surfaceNow');
  assert.match(source, /data-water-field="sunrise">\$\{periods\.sunrise\.toFixed\(1\)\}°F</, 'sunrise field should render directly from canonical waterTempView.periods.sunrise');
  assert.match(source, /data-water-field="midday">\$\{periods\.midday\.toFixed\(1\)\}°F</, 'midday field should render directly from canonical waterTempView.periods.midday');
  assert.match(source, /data-water-field="sunset">\$\{periods\.sunset\.toFixed\(1\)\}°F</, 'sunset field should render directly from canonical waterTempView.periods.sunset');
});


test('extended forecast includes today card', () => {
  assert.match(
    source,
    /for \(let i = 0; i < dailyData\.time\.length; i\+\+\)/,
    'extended forecast loop should start at day 0 so today is included'
  );
});
