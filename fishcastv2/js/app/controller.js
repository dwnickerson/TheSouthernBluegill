import { buildForecastState } from './state.js';
import { renderApp } from '../ui/render.js';

async function loadWeatherPayload() {
  const response = await fetch('../fishcast/js/tools/fixtures/weatherPayload.sample.json');
  if (!response.ok) {
    throw new Error(`Unable to load fixture payload (${response.status})`);
  }
  return response.json();
}

async function main() {
  const root = document.querySelector('#app');
  if (!root) return;

  try {
    const weatherPayload = await loadWeatherPayload();
    const state = await buildForecastState({
      coords: { lat: 34.2576, lon: -88.7034, name: 'Tupelo Pond (v2)' },
      waterType: 'pond',
      speciesKey: 'bluegill',
      days: 5,
      weatherPayload
    });

    renderApp(root, state);
    window.__FISHCAST_V2_STATE__ = state;
  } catch (error) {
    root.innerHTML = `<p>Failed to build forecast state: ${error.message}</p>`;
  }
}

main();
