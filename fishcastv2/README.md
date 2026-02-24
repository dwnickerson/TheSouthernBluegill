# FishCast v2 (reset prototype)

This is a clean restart focused on one job:

- Estimate pond water temperature for **Tupelo, Mississippi** using **past + present + future weather**.
- Pond defaults are fixed to **4.9 acres** and **8 ft average depth**.
- Keep model transparent and simple so we can calibrate with real observations.

## What this prototype does

1. Pulls **past daily weather** from Open-Meteo Archive.
2. Pulls **current + future daily weather** from Open-Meteo Forecast.
3. Computes a daily equilibrium signal from weather terms (air blend, solar warming, wind/rain cooling, and cloud-adjusted longwave loss).
4. Adds first-pass placeholders for missing physics: water clarity/turbidity, inflow/outflow exchange, sediment heat storage, and true mixed-layer depth.
5. Updates pond temperature with depth/area response plus mixed-layer and flow turnover effects.
6. Lets operator enter observed water temperatures, save past validation inputs in browser storage, and reports model error (MAE).
7. Renders all source data and all computed terms in one table.

## Formula (daily)

- `daylightFraction = clamp(shortwaveRadiation / 35, 0.12, 1)` (proxy for how much of the day had active solar heating)
- `airBlend = daytimeWeight*dayAir + overnightWeight*nightAir` where daytime/overnight weights depend on daylight fraction
- `effectiveWind = meanDailyWind * (0.45 + 0.55*daylightFraction)` (reduces all-day wind overcooling on low-solar days)
- `longwaveLoss = longwaveClear * (1 - k*cloudFrac)` where positive `longwaveLoss` means cooling to subtract
- `equilibrium = airBlend + solarHeat*clarityFactor - windCool - evapCool - rainCool - longwaveLoss + flowTempPull`
- `equilibriumWithSediment` blends yesterday's water with equilibrium to represent bed heat storage
- `waterToday = waterYesterday + mixedLayerAlpha*(equilibriumWithSediment - waterYesterday)`
- `mixedLayerAlpha` depends on pond geometry, mixed-layer depth, and turnover from net flow.

Current conditions then nudge today:

- `currentEffect = 0.35*(currentAir - todayTmean) - 0.03*currentWind*currentWindExposure`

## Run

```bash
python3 -m http.server 8000
```

Open:

- `http://localhost:8000/fishcastv2/index.html`

## Notes

- This is intentionally a first-principles prototype, not a production-grade calibrated hydrodynamic model.
- Coefficients are intentionally first-pass placeholders. Use historical validation inputs to calibrate by season/site.
