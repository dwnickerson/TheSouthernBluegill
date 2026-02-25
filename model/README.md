# Pond Thermal Model (`/model`)

This folder is a full copy of the former `/fishcastv2` prototype, moved to `/model` with feature parity intact.

It models daily pond water temperature for **Tupelo, Mississippi** by combining:
- historical daily weather,
- current conditions,
- and forecast daily weather.

The implementation is intentionally transparent and operator-tunable so you can calibrate it using real water-temperature observations.

## What the model includes

### Data ingest
- Pulls **past daily weather** from Open-Meteo Archive.
- Pulls **today + future daily weather** and **current conditions** from Open-Meteo Forecast.
- Merges all days into one continuous simulation series.

### Core thermal balance terms
For each simulated day, the model computes:
- day/night blended air forcing,
- solar heating adjusted by turbidity, visibility, and shading,
- wind cooling adjusted by fetch and sheltering,
- evaporative cooling,
- rain cooling,
- cloud-adjusted longwave cooling,
- inflow/outflow thermal pull,
- sediment heat exchange,
- mixed-layer response and turnover,
- optional 1–3 layer behavior with inter-layer mixing.

### Calibration and operations
- Manual pond/site parameter controls (geometry, sediment, mixing, optics, meteorology multipliers).
- Presets for common pond types.
- Historical observation entry and persistence in browser storage.
- Seeding start-water from earliest observation (optional).
- Auto-calibration toggle.
- Sensitivity toggle.
- Uncertainty band configuration.
- Model-vs-observation error metrics (MAE) and daily trace table output.

## Daily model shape (high level)

At a high level, each day follows:

1. Build meteorological forcing from daily values (air, humidity, wind, cloud, rain, solar).
2. Compute an equilibrium tendency:
   - `equilibrium = air + solar - wind - evap - rain - longwave + flow (+ sediment coupling)`
3. Move water state toward equilibrium with an alpha controlled by depth, mixed layer, and turnover.
4. Apply current-condition adjustment for today.
5. Emit full per-day diagnostic terms for inspection and validation.

## Run locally

From the repository root:

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/model/index.html`

## How to use

1. Open the app and verify site coordinates/label.
2. Set pond geometry (acres, depth, observation depth).
3. Set physics controls (turbidity, visibility, mixed depth, wind reduction, sediment, inflow/outflow, etc.).
4. Choose history/forecast window (`pastDays`, `futureDays`).
5. Run/update the model.
6. Enter observed temperatures for matching dates and times.
7. Review MAE and the daily diagnostic table.
8. Iterate coefficients seasonally until residuals are acceptable.

## Files

- `index.html` — UI and control surface.
- `js/app/controller.js` — coordinator for UI/state wiring, fetch lifecycle, rendering, and persistence.
- `js/app/weather-data.mjs` — Open-Meteo URL construction and weather-series shaping helpers.
- `js/app/mode1-core.mjs` — parameter normalization and thermal simulation core (mode-1 model loop).
- `js/app/trace-export.mjs` — validation merge and CSV trace-shaping helpers.
- `js/app/model-physics.mjs` — longwave/cloud physics helper(s).
- `tests/cloud-longwave-regression.test.mjs` — regression coverage for cloud-longwave behavior.
- `tests/generate-cloud-trace.mjs` — helper script for cloud-trace generation.

## Notes

- This is still a physically-informed prototype, not a fully calibrated hydrodynamic production model.
- Coefficients are first-pass defaults and should be tuned with local observations.
- Browser storage is used for saved observations/settings.
