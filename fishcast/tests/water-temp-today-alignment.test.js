import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('today water temp prefers projection day-0 to keep handoff consistent with extended forecast', () => {
  assert.match(
    source,
    /const projectedTodayWaterTemp = Number\.isFinite\(waterTempsEvolution\?\.\[0\]\)\s*\?\s*waterTempsEvolution\[0\]\s*:\s*null;/,
    'app should derive today handoff value from projection day-0'
  );

  assert.match(
    source,
    /if \(!Number\.isFinite\(projectedTodayWaterTemp\)\) \{\s*throw new Error\('Water temperature projection unavailable for current day'\);\s*\}/,
    'app should require projection day-0 to be present for current-day display'
  );
});
