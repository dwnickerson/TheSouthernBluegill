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

- `daylightFraction = clamp(shortwaveRadiation / 35, 0.12, 1)` (proxy for how much of the day had active solar heating)
- `airBlend = daytimeWeight*dayAir + overnightWeight*nightAir` where daytime/overnight weights depend on daylight fraction
- `effectiveWind = meanDailyWind * (0.45 + 0.55*daylightFraction)` (reduces all-day wind overcooling on low-solar days)
- `equilibrium = airBlend + solarHeat - windCool - cloudCool - rainCool`
- `waterToday = waterYesterday + alpha*(equilibrium - waterYesterday)`
- `alpha` depends on pond size/depth (smaller alpha = slower temperature response).

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
- Next step: calibrate coefficients against measured temperatures across seasons, then generalize to any U.S. location.
