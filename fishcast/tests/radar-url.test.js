import test from 'node:test';
import assert from 'node:assert/strict';

const { getRadarEmbedUrl } = await import('../js/utils/radar.js');

test('returns a Windy embed URL for valid coordinates', () => {
  const url = getRadarEmbedUrl(34.2576, -88.7034);

  assert.ok(url.startsWith('https://embed.windy.com/embed2.html?'));
  assert.ok(url.includes('lat=34.2576'));
  assert.ok(url.includes('lon=-88.7034'));
});

test('returns empty string for invalid coordinates', () => {
  assert.equal(getRadarEmbedUrl(null, -88.7034), '');
  assert.equal(getRadarEmbedUrl(34.2576, undefined), '');
});
