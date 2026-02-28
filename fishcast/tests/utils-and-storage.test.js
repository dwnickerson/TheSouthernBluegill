import test from 'node:test';
import assert from 'node:assert/strict';

const makeLocalStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i],
    get length() { return map.size; }
  };
};

global.localStorage = makeLocalStorage();
global.window = { localStorage: global.localStorage };

const { kmhToMph } = await import('../js/utils/math.js');
const { storage } = await import('../js/services/storage.js');

test('wind conversion is correct', () => {
  assert.ok(Math.abs(kmhToMph(16.0934) - 10) < 0.01);
});

test('weather cache key varies by lat/lon/days', () => {
  const a = storage.getWeatherCacheKey(34.0001, -88.0001, 3);
  const b = storage.getWeatherCacheKey(34.0001, -88.0001, 5);
  const c = storage.getWeatherCacheKey(34.5001, -88.0001, 3);

  assert.notEqual(a, b);
  assert.notEqual(a, c);
});


test('theme storage reads both JSON and legacy raw string values', () => {
  localStorage.clear();

  localStorage.setItem('theme', 'dark');
  assert.equal(storage.getTheme(), 'dark');

  localStorage.setItem('theme', 'sba');
  assert.equal(storage.getTheme(), 'sba');

  storage.setTheme('sba');
  assert.equal(storage.getTheme(), 'sba');

  localStorage.setItem('theme', JSON.stringify('sba'));
  assert.equal(storage.getTheme(), 'sba');

  localStorage.setItem('theme', JSON.stringify('crappie'));
  assert.equal(storage.getTheme(), 'crappie');
});
