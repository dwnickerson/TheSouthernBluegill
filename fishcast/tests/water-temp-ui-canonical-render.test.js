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


test('extended forecast excludes today card', () => {
  assert.match(
    source,
    /if \(date <= todayIso\) continue;/,
    'extended forecast should skip today (and stale same-day rows) using location-local date'
  );
});


test('water clarity in Water Conditions derives from recent precipitation instead of hardcoded clear', () => {
  assert.match(source, /import \{ calculateWaterClarity, getPressureRate \} from '\.\.\/models\/fishingScore\.js';/, 'forecast UI should import calculateWaterClarity for live clarity rendering');
  assert.match(source, /function deriveWaterClarity\(weather\)/, 'forecast UI should derive water clarity from weather payload');
  assert.match(source, /clarity:\s*deriveWaterClarity\(weather\)/, 'current score clarity should be computed from current weather context');
  assert.doesNotMatch(source, /clarity:\s*'clear'/, 'water clarity should not be hardcoded to clear');
});

test('water clarity uses intraday observed precipitation when hourly data is available', () => {
  assert.match(source, /const nowHourIndex = Number\.isInteger\(weather\?\.meta\?\.nowHourIndex\)/, 'clarity derivation should use weather.meta.nowHourIndex');
  assert.match(source, /const todayObserved = \(\(\) => \{/, 'clarity derivation should compute intraday observed precipitation from hourly series');
  assert.match(source, /const todayPrecip = Number\.isFinite\(todayObserved\)\s*\?\s*todayObserved\s*:/, 'clarity should prefer observed intraday precipitation before full-day forecast precipitation');
});

