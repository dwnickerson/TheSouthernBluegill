# FishCast v2 (side-by-side rebuild)

This directory is a standalone rebuild of FishCast architecture. It does **not** modify `fishcast/` production code.

## What changed in v2

- Single `ForecastState` built once in `js/app/state.js`.
- Single water-temperature pipeline in the state builder (compute once, render everywhere).
- Timezone is explicit (`state.meta.timezone` from Open-Meteo payload).
- UI is pure state rendering (`js/ui/render.js`) with no post-render recomputation.
- Debug panel toggle prints `state.water` for validation.

## Run locally

### 1) Run node test

```bash
node fishcastv2/tests/stateWaterTemp.test.mjs
```

### 2) Open v2 page

Option A (recommended, via local server):

```bash
python3 -m http.server 8000
```

Then visit:

- `http://localhost:8000/fishcastv2/index.html`

Option B (direct file open):

- Open `fishcastv2/index.html` in a browser.
- Note: direct `file://` loading may block fixture fetch in some browsers.

## Future switch-over plan

1. Keep `fishcastv2/` running side-by-side while validating parity.
2. Replace existing page entrypoint to point at `fishcastv2/js/app/controller.js`.
3. Migrate API wiring from fixture fetch to live weather service in one place (state builder input).
