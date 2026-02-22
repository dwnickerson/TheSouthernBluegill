# FishCast v2 (reset prototype)

This is a clean restart focused on one job:

- Estimate pond water temperature for **Tupelo, Mississippi** using **past + present + future weather**.
- Pond defaults are fixed to **4.9 acres** and **8 ft average depth**.
- Keep model transparent and simple so we can calibrate with real observations.

## What this prototype does

1. Pulls **past daily weather** from Open-Meteo Archive.
2. Pulls **current + future daily weather** from Open-Meteo Forecast.
3. Computes a daily equilibrium signal from weather terms (air blend, solar warming, wind/cloud/rain cooling).
4. Updates pond temperature with a depth/area thermal-response factor.
5. Lets operator enter observed water temperatures and reports model error (MAE).
6. Renders all source data and all computed terms in one table.

## Formula (daily)

- `airBlend = 0.65*Tmean + 0.20*Tmax + 0.15*Tmin`
- `equilibrium = airBlend + solarHeat - windCool - cloudCool - rainCool`
- `waterToday = waterYesterday + alpha*(equilibrium - waterYesterday)`
- `alpha` depends on pond size/depth (smaller alpha = slower temperature response).

Current conditions nudge today's result:

- `currentEffect = 0.35*(currentAir - todayTmean) - 0.05*currentWind`

## Run

```bash
python3 -m http.server 8000
```

Open:

- `http://localhost:8000/fishcastv2/index.html`

## Notes

- This is intentionally a first-principles prototype, not a production-grade calibrated hydrodynamic model.
- Next step: calibrate coefficients against measured temperatures across seasons, then generalize to any U.S. location.
