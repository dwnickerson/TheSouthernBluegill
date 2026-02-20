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
    /const todayWaterTemp = projectedTodayWaterTemp \?\? waterTemp;/,
    'app should still fall back to direct estimate when projection is unavailable'
  );
});
