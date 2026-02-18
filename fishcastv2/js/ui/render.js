function tempLabel(value) {
  if (!Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}°F`;
}

export function getDisplayedWaterValues(state) {
  return {
    surfaceNow: Number(state.water.surfaceNow),
    sunrise: Number(state.water.periodsToday.sunrise),
    midday: Number(state.water.periodsToday.midday),
    sunset: Number(state.water.periodsToday.sunset)
  };
}

export function renderApp(root, state) {
  const today = state.water.periodsToday;
  const cards = state.water.daily
    .map((day) => `
      <article class="day-card">
        <h3>${day.dayKey}</h3>
        <p>Sunrise: <strong>${tempLabel(day.periods.sunrise)}</strong></p>
        <p>Midday: <strong>${tempLabel(day.periods.midday)}</strong></p>
        <p>Sunset: <strong>${tempLabel(day.periods.sunset)}</strong></p>
      </article>
    `)
    .join('');

  root.innerHTML = `
    <section class="summary-card">
      <h2>${state.coords.name}</h2>
      <p>Timezone: ${state.meta.timezone}</p>
      <p>Surface now: <strong data-water="surfaceNow">${tempLabel(state.water.surfaceNow)}</strong></p>
      <p>Sunrise: <strong data-water="sunrise">${tempLabel(today.sunrise)}</strong></p>
      <p>Midday: <strong data-water="midday">${tempLabel(today.midday)}</strong></p>
      <p>Sunset: <strong data-water="sunset">${tempLabel(today.sunset)}</strong></p>
      <button id="open-modal" type="button">Open detail modal</button>
      <button id="toggle-debug" type="button">Toggle debug water state</button>
    </section>

    <section class="extended-cards">${cards}</section>

    <dialog id="water-modal">
      <h3>Water detail</h3>
      <p>Surface now: ${tempLabel(state.water.surfaceNow)}</p>
      <p>Sunrise: ${tempLabel(today.sunrise)}</p>
      <p>Midday: ${tempLabel(today.midday)}</p>
      <p>Sunset: ${tempLabel(today.sunset)}</p>
      <button id="close-modal" type="button">Close</button>
    </dialog>

    <pre id="debug-panel" hidden>${JSON.stringify(state.water, null, 2)}</pre>
  `;

  const modal = root.querySelector('#water-modal');
  root.querySelector('#open-modal')?.addEventListener('click', () => modal?.showModal());
  root.querySelector('#close-modal')?.addEventListener('click', () => modal?.close());

  const debugPanel = root.querySelector('#debug-panel');
  root.querySelector('#toggle-debug')?.addEventListener('click', () => {
    if (!debugPanel) return;
    debugPanel.hidden = !debugPanel.hidden;
  });
}
