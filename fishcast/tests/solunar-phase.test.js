import test from 'node:test';
import assert from 'node:assert/strict';

const { calculateSolunar } = await import('../js/models/solunar.js');

test('reports waning crescent near end of lunar cycle', () => {
  const result = calculateSolunar(34.2576, -88.7034, new Date('2026-02-15T20:00:00Z'));

  assert.equal(result.moon_phase, 'Waning Crescent');
  assert.ok(result.moon_phase_percent >= 0 && result.moon_phase_percent <= 5);
});

test('reports full moon illumination near midpoint of lunar cycle', () => {
  const result = calculateSolunar(34.2576, -88.7034, new Date('2026-03-03T12:00:00Z'));

  assert.equal(result.moon_phase, 'Full Moon');
  assert.ok(result.moon_phase_percent >= 95);
});

test('keeps very-late-cycle moon as waning crescent before conjunction', () => {
  const result = calculateSolunar(34.2576, -88.7034, new Date('2026-02-14T05:03:54-06:00'));

  assert.equal(result.moon_phase, 'Waning Crescent');
  assert.ok(result.moon_phase_percent > 0);
});
