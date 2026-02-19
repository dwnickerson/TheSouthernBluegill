import test from 'node:test';
import assert from 'node:assert/strict';

const { getNoaaRadarImageUrl, getOpenStreetMapTileUrl } = await import('../js/utils/radar.js');

test('returns NOAA radar URL for valid coordinates', () => {
  const url = getNoaaRadarImageUrl({
    lat: 34.2576,
    lon: -88.7034
  });

  assert.ok(url.startsWith('https://nowcoast.noaa.gov/geoserver/observations_radar/ows?'));
  assert.ok(url.includes('layers=observations_radar_base_reflectivity'));
  assert.ok(url.includes('bbox=32.2576,-90.7034,36.2576,-86.7034'));
});

test('returns empty string for invalid NOAA radar inputs', () => {
  assert.equal(getNoaaRadarImageUrl({ lat: null, lon: -88.7034 }), '');
  assert.equal(getNoaaRadarImageUrl({ lat: 34.2576, lon: undefined }), '');
});

test('returns OpenStreetMap tile URL for valid coordinates', () => {
  const url = getOpenStreetMapTileUrl({ lat: 34.2576, lon: -88.7034, zoom: 6 });
  assert.ok(url.startsWith('https://tile.openstreetmap.org/6/'));
  assert.ok(url.endsWith('.png'));
});

test('returns empty string for invalid OpenStreetMap tile inputs', () => {
  assert.equal(getOpenStreetMapTileUrl({ lat: null, lon: -88.7034 }), '');
});
