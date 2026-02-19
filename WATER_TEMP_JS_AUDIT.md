# Water Temp JS Complete Audit

## Scope audited
- `fishcast/js/models/waterTemp.js`
- `fishcast/js/services/weatherAPI.js`
- `fishcast/js/config/waterBodies.js`
- `fishcast/js/ui/forecast.js` (integration points)

## 1) What data is currently being pulled and used

### Upstream weather pull (Open-Meteo)
The app requests historical + forecast weather with Fahrenheit / mph / inches units.

- Historical `daily` pull includes:
  - `temperature_2m_mean`, `temperature_2m_max`, `temperature_2m_min`
  - `cloud_cover_mean`
  - `wind_speed_10m_mean`, `wind_speed_10m_max`
  - `precipitation_sum`
- Forecast pull includes:
  - `current`: `temperature_2m`, `apparent_temperature`, `relative_humidity_2m`, `surface_pressure`, `wind_speed_10m`, `wind_direction_10m`, `cloud_cover`, `weather_code`, `precipitation`
  - `hourly`: `temperature_2m`, `surface_pressure`, `wind_speed_10m`, `wind_direction_10m`, `cloud_cover`, `weather_code`, `precipitation_probability`
  - `daily`: `temperature_2m_max`, `temperature_2m_min`, `temperature_2m_mean`, `precipitation_probability_max`, `precipitation_sum`, `wind_speed_10m_mean`, `wind_speed_10m_max`, `wind_direction_10m_dominant`, `cloud_cover_mean`, `sunrise`, `sunset`, `weather_code`.

### Data actually used by water temperature physics
`waterTemp.js` currently uses these weather inputs:

- Seasonal/day context: date/day-of-year.
- Air temperature series:
  - Historical daily means (`historical.daily.temperature_2m_mean`) for lagged air coupling/trend.
  - Forecast daily means (`forecast.daily.temperature_2m_mean`) and fallback to min/max average for projections.
  - Forecast hourly air (`forecast.hourly.temperature_2m`) for period-level morning/midday/afternoon estimate.
- Cloud cover:
  - Historical daily means (`historical.daily.cloud_cover_mean`) for solar deviation baseline.
  - Forecast daily means (`forecast.daily.cloud_cover_mean`) in projection.
  - Forecast hourly cloud (`forecast.hourly.cloud_cover`) for intraday damping.
- Wind:
  - Historical daily mean wind (`historical.daily.wind_speed_10m_mean`) primary source.
  - Historical daily max wind (`historical.daily.wind_speed_10m_max`) fallback (scaled down).
  - Forecast hourly wind (`forecast.hourly.wind_speed_10m`) fallback source around now.
  - Forecast daily mean/max wind in projection (`forecast.daily.wind_speed_10m_mean` / `_max`) including gust stress blend.
  - Forecast hourly wind for intraday damping.
- Precipitation:
  - Forecast daily precipitation totals (`forecast.daily.precipitation_sum`) and probability (`precipitation_probability_max`) for synoptic-event strength.
- Units / time metadata:
  - `meta.units.temp`, `meta.units.wind`, `meta.units.precip`, and `meta.nowHourIndex`.
- Non-weather local calibration data:
  - Nearby user water-temp reports (distance/recency/water body typed weighting).
  - Same-day memo clamp to prevent implausible jumps.
  - Water body priors (`thermal_lag_days`, `annual_amplitude`, `mixing_wind_threshold`, etc.).

## 2) What data is available but not used (gaps)

### Requested from API but currently unused in `waterTemp.js`
- `current.apparent_temperature`
- `current.relative_humidity_2m`
- `current.surface_pressure`
- `current.wind_direction_10m`
- `current.cloud_cover` (indirectly used in UI but not in core model)
- `current.weather_code`
- `current.precipitation`
- `hourly.surface_pressure`
- `hourly.wind_direction_10m`
- `hourly.weather_code`
- `hourly.precipitation_probability` (used in UI, not in model dynamics except daily max probability)
- `daily.wind_direction_10m_dominant`
- `daily.sunrise`, `daily.sunset`
- `daily.weather_code`

### Important physics variables not even being requested yet
To tighten error bars, these matter and are not currently requested:
- Shortwave radiation (or sunshine duration)
- Longwave radiation / net radiation proxy
- Dew point or wet-bulb proxy (better latent heat / evaporative cooling signal)
- Soil/ground temperature near shoreline (for very shallow systems)
- Snow depth / snowmelt proxy in cold regions
- Streamflow / discharge (for river or inflow-dominated reservoirs)

## 3) Physics audit: strengths and limitations

### What is physically sound today
- Seasonal harmonic baseline with latitude and water-body lag/amplitude.
- Thermal inertia response scales with air-water delta and body type.
- Wind mixing effects are conditionally signed by air-water gradient.
- Cloud-modulated solar deviation and separate intraday (period) adjustment.
- Frontal/synoptic event strength using air jumps + wind + precip.
- Projection safeguards: daily envelopes and reservoir physical delta clamps.

### Where physics fidelity is currently limited
- Solar forcing uses cloud cover as a proxy; no explicit radiation energy term.
- Evaporation/convection not directly modeled (needs humidity/dew point + pressure + wind coupling).
- Wind direction and fetch are ignored (same wind speed can mix differently by orientation/fetch).
- Precipitation is treated as event signal, not explicit thermal mass/enthalpy input.
- No water-balance terms (inflow/outflow/withdrawal/release) for reservoirs.
- Static per-type priors (`pond/lake/reservoir`) instead of body-specific morphometry (area, mean depth, volume, clarity).

## 4) What more is needed to reach ±0.5°F

### Reality check
With only public weather + generic water-body class, ±0.5°F at daily scale is typically unrealistic across sites/seasons. That target generally requires body-specific calibration and at least one direct water observation stream.

### Minimum additions likely required
1. **Site-specific morphology**
   - Surface area, mean/max depth, volume, fetch length, shading fraction, retention time.
2. **Radiation and latent/sensible flux inputs**
   - Add hourly shortwave radiation, dew point (or RH + temp), and optionally longwave/net radiation proxies.
3. **Hydrology terms**
   - Inflow temperature proxy and discharge (or release schedule for reservoirs).
4. **Continuous local water truth**
   - At least one fixed probe (surface) and ideally a second depth probe; ingest hourly.
5. **Model strategy change**
   - Move from static heuristic blend to a calibrated state-space approach (e.g., 1D thermal bucket + Kalman update using sensor/user observations).
6. **Calibration dataset**
   - 60–120 days per target water body minimum, spanning frontal transitions.

### Practical roadmap toward ±0.5°F
- Phase 1: add radiation + dew point + sunrise/sunset daylength handling (low lift).
- Phase 2: add body metadata (area/depth/fetch/shade) and wind-direction/fetch mixing term.
- Phase 3: introduce per-water-body calibration params persisted in storage.
- Phase 4: assimilate sensor/user observations with uncertainty weighting each update cycle.
- Phase 5: report confidence interval (not just point estimate) and gate UI claims by confidence.

## Bottom line
Current model is a strong heuristic physics hybrid for broad forecast guidance. For true ±0.5°F accuracy, you need explicit surface energy-balance drivers + body-specific hydrodynamics/morphometry + continuous water-temperature truth data assimilation.


## 5) Immediate model-audit action plan (implementation order)

1. **Lock timezone and units as non-regression constraints**
   - Keep `water-temp-timezone-context` and `water-temp-units` tests green before any model tuning.
2. **Add explicit radiation + humidity forcing inputs**
   - Request hourly shortwave radiation + dew point and introduce evap/solar terms.
3. **Tighten calibration by water body metadata**
   - Expand from type-level priors to per-water-body parameters (depth/fetch/shade).
4. **Assimilate trusted observations with confidence weighting**
   - Blend reports/sensors with quality weighting and decay, then expose confidence interval.
5. **Track model error by scenario class**
   - Add recurring audit snapshots for cold fronts, warm fronts, and stable periods to detect bias drift.
