import test from 'node:test';
import assert from 'node:assert/strict';

const { getOpenStreetMapTileUrl, getRainViewerMetadataUrl, getRainViewerTileUrl } = await import('../js/utils/radar.js');

test('returns RainViewer metadata URL', () => {
  const url = getRainViewerMetadataUrl();
  assert.equal(url, 'https://api.rainviewer.com/public/weather-maps.json');
});

test('returns RainViewer tile URL for valid coordinates and frame path', () => {
  const url = getRainViewerTileUrl({
    lat: 34.2576,
    lon: -88.7034,
    framePath: '/v2/radar/1736289600'
  });

  assert.ok(url.startsWith('https://tilecache.rainviewer.com/v2/radar/1736289600/512/6/'));
  assert.ok(url.endsWith('/4/1_1.png'));
});

test('returns empty string for invalid radar inputs', () => {
  assert.equal(getRainViewerTileUrl({ lat: null, lon: -88.7034, framePath: '/v2/radar/1736289600' }), '');
  assert.equal(getRainViewerTileUrl({ lat: 34.2576, lon: undefined, framePath: '/v2/radar/1736289600' }), '');
  assert.equal(getRainViewerTileUrl({ lat: 34.2576, lon: -88.7034, framePath: '' }), '');
});

test('returns OpenStreetMap tile URL for valid coordinates', () => {
  const url = getOpenStreetMapTileUrl({ lat: 34.2576, lon: -88.7034, zoom: 6 });
  assert.ok(url.startsWith('https://tile.openstreetmap.org/6/'));
  assert.ok(url.endsWith('.png'));
});

test('returns empty string for invalid OpenStreetMap tile inputs', () => {
  assert.equal(getOpenStreetMapTileUrl({ lat: null, lon: -88.7034 }), '');
});
