import test from 'node:test';
import assert from 'node:assert/strict';

const { getNoaaRadarImageUrl, getOpenStreetMapTileUrl } = await import('../js/utils/radar.js');

test('returns NOAA radar URL for valid coordinates', () => {
  const url = getNoaaRadarImageUrl({
    lat: 34.2576,
    lon: -88.7034,
    timestampMs: 1730000000000
  });

  assert.ok(url.startsWith('https://nowcoast.noaa.gov/arcgis/rest/services/nowcoast/radar_meteo_imagery_nexrad_time/MapServer/export?'));
  assert.ok(url.includes('f=image'));
  assert.ok(url.includes('time=1730000000000'));
  assert.ok(url.includes('bbox=-90.7034,32.2576,-86.7034,36.2576'));
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
