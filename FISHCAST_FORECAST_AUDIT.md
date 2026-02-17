# FishCast Forecast Audit & Correction Report

## Scope / limits
- Completed a full code-path audit for UI -> ingest -> derivation -> scoring -> display in this repository.
- Historical run logs and a concrete overnight incident payload were **not present** in this repo, so flip RCA was done via code-path analysis + deterministic regression tests.

## 1) System map (no assumptions)

### Pipeline trace
1. UI form captures `location`, `species`, `waterType`, `days` in `app.js` and persists species via localStorage key `fishcast_last_selected_species`.
2. Geocoding resolves coordinates, then weather service calls Open-Meteo archive + forecast endpoints.
3. Water temp is estimated from seasonal baseline + recent air/cloud/wind + thermal lag, then memoized by lat/lon/waterType.
4. Forecast renderer computes daily/hourly scores and condition cards.
5. Updated: daily scoring now routes through `forecastEngine.js` for **all species** (species-aware day slicing + profile-based biology weights + stability controls + deterministic scoring path).

### Time handling
- Weather API now requests `timezone=America/Chicago` for archive + forecast payloads.
- Day slicing in scoring uses ISO local day key (`YYYY-MM-DD`) against hourly arrays.
- Freeze policy uses America/Chicago local hour and a configurable freeze at 19:00 local.

### Caching / retry / fallback
- Weather API retries up to 2 attempts and falls back to cached payload if available.
- Weather cache key: lat/lon rounded 4 decimals + days.
- Water-temp memo cache key: lat/lon rounded 4 decimals + water type.
- New stability cache key: location + species + date.

## 2) Data dictionary

| Variable | Description | Unit | Source | Resolution | Window |
|---|---|---:|---|---|---|
| `forecast.hourly.surface_pressure[]` | Hourly pressure | hPa | Open-Meteo forecast hourly | hourly | Day-scored local 00:00–23:59 |
| `forecast.hourly.wind_speed_10m[]` | Hourly wind speed | km/h | Open-Meteo forecast hourly | hourly | Day-scored local 00:00–23:59 |
| `forecast.hourly.cloud_cover[]` | Hourly cloud cover | % | Open-Meteo forecast hourly | hourly | Day-scored local 00:00–23:59 |
| `forecast.hourly.precipitation_probability[]` | Hourly precip probability | % | Open-Meteo forecast hourly | hourly | Day-scored local 00:00–23:59 |
| `forecast.hourly.temperature_2m[]` | Hourly air temp | °C | Open-Meteo forecast hourly | hourly | Day-scored local 00:00–23:59 |
| `historical.daily.precipitation_sum[]` | Recent precipitation for clarity/runoff proxy | mm | Open-Meteo archive daily | daily | Past ~48h + current window |
| `waterTempF` | Estimated water temp | °F | model-estimated | scalar/day | Lagged seasonal + recent weather |
| `pressureTrend` | Trend classification from rolling 4-hour pressure slope | enum | derived | hourly->daily | past+early-current |



### Complete data inventory used by the forecast pipeline

#### External weather/location datasets
- Open-Meteo **forecast hourly** arrays: `surface_pressure`, `wind_speed_10m`, `cloud_cover`, `precipitation_probability`, `temperature_2m`, and hourly `time` index.
- Open-Meteo **archive daily/hourly** context used for short historical conditioning (recent precip/runoff proxy and trend context).
- Geocoding/reverse-geocoding provider responses for lat/lon + location naming used in UI and cache keys.

#### Internal/derived forecast datasets
- Derived pressure trend classification from rolling pressure slope.
- Water-temperature estimate from seasonal baseline + weather forcing + lag/inertia corrections.
- Species profile coefficients (temp windows, seasonal multipliers, score caps, stability thresholds).
- Deterministic stability state for prior score anchors (species + date + location key).

#### User/community datasets
- User report payloads (when enabled): reported water temp, optional notes/metadata, location context.
- Trust/blend inputs: report recency, distance, source/type weighting used to blend into forecast context.

#### Persistence/caching datasets
- Forecast cache payload snapshots keyed by rounded lat/lon + day horizon.
- Water-temp memoized values keyed by rounded lat/lon + water type.
- Species selection and settings values persisted in localStorage for repeat sessions.

#### Test/validation datasets used for this audit
- Deterministic unit-test fixtures for water-temp and scoring engines.
- Smoke-test scenario fixtures validating invariant behavior (units, trend smoothness, stability, UI assumptions).

Standard windows (local America/Chicago):
- Past window for trend/stability: prior 48 hours before day start.
- Current-day bite window: scored day local `00:00–23:59`.
- Future planning window: tomorrow local day, with post-7pm freeze policy.

## 3) Species biology model sheets (all selectable species)

| Species | Seasonal phases (high-level) | Preferred temp/activity | Weather sensitivities | Confidence |
|---|---|---|---|---|
| Bluegill | pre-spawn/spawn/post-spawn, summer/fall/winter | best ~68–78°F, active ~58–86°F | calm-moderate wind, moderate cloud, pressure falls help | High |
| Coppernose Bluegill | similar to bluegill, slightly earlier/aggressive spawn | warm-leaning bluegill variant | similar to bluegill | Medium |
| Redear Sunfish | later single spawn, deeper tendency | spawn ~68–78°F | clear-water sensitivity, less moon sensitivity | Medium |
| Green Sunfish | broad tolerance, hardy | wider high-temp tolerance | less weather-sensitive than other lepomis | Medium |
| Warmouth | bass-like sunfish behavior | warm pre/spawn window | cover-oriented; moderate cloud/wind acceptable | Medium |
| Longear Sunfish | stream/current oriented | moderate temps, spring emphasis | clarity/current stronger than pressure | Medium |
| Rock Bass | rocky habitat, cool-water shoulder periods | strong spring/fall windows | low-light/cloud can help | Medium |
| Largemouth Bass | pre-spawn/spawn/fall feed peaks | strong ~58–75°F windows | pressure drop + stained water + moderate wind | High |
| Smallmouth Bass | cooler preference vs largemouth | ~60–72°F strongest | wind/current/clarity important | High |
| Spotted Bass | in-between LM/SM behavior | moderate-warm with schooling peaks | pressure + current + cloud interplay | Medium |
| White Crappie | spring spawn + post-spawn structure patterns | cool-moderate | calmer wind + stable pressure often preferred | Medium |
| Black Crappie | similar to white crappie, often clearer/cooler | cool-moderate | cloud/light effects more pronounced | Medium |

### Evidence base used for biological assumptions
- State fisheries agency life-history summaries (e.g., Mississippi, Tennessee, Illinois DNR species pages).
- Extension fisheries education references (Auburn, Texas A&M extension patterns for spawn windows and water-temp triggers).
- NOAA/USGS hydrology and weather interpretation guidance for pressure/front/turbidity context.

(Primary external references are listed at end for operator review and future calibration packets.)

## 4) Rule mapping / biology alignment

### Species profile mapping (implemented)
| Group / species | Implemented profile behavior | Biological intent |
|---|---|---|
| Lepomis / sunfish family | Warm-optimal scoring, calm-moderate wind boost, cloud-balance bonus, heavy-spawn-cloud penalty where applicable | Bedding and sight-feeding sunfish perform best in warm stable windows with manageable wind/light |
| Black bass family (LM/SM/spotted) | More pressure-sensitive boosts, moderate wind reward, seasonal spring/fall feed boosts, stricter species ceilings | Ambush/pursuit bass react more strongly to fronts and wind-generated forage movement |
| Crappie family (white/black) | Cooler optimal windows, calm-wind preference, cloud/light sensitivity, tighter volatility stability profile | Schooling crappie behavior typically peaks in cooler spring/fall windows and lower wind |
| Species overrides | Per-species temp windows + score ceilings (e.g., bass 90, smallmouth 88, bluegill 92, black crappie 92) | Prevents biologically implausible sustained 100 scores while preserving best-day separation |

### Unjustified or generic rules flagged
- Legacy scoring mixed daily/hourly in inconsistent ways and could read missing daily pressure means.
- Same generic path for many species with sparse differentiation in stability thresholds.
- No forecast freeze policy previously; tomorrow score could jump overnight with trivial changes.

## 5) Bugs found and fixes
1. **Timezone ambiguity (`timezone=auto`)** could shift day slicing across users/servers.
   - Fix: pin weather requests to `America/Chicago`.
2. **Overnight flip risk** due to no gating/freeze controls.
   - Fix: add per-species stability gates + tomorrow freeze after 7pm local unless major shift.
3. **No deterministic stability key by species/day/location**.
   - Fix: add deterministic stability storage key with all three dimensions.
4. **Low explainability** for daily score drivers.
   - Fix: add debug packet generation with features + contributions + stability reason.

## 6) Stability strategy

### Change gating
- If key input deltas are below material thresholds, score changes above max allowed delta are clipped.
- Bluegill default thresholds:
  - pressure 3 hPa
  - wind 5 mph
  - precip probability 25%
  - cloud cover 25%
  - air temp 6°F
  - water temp 3°F
- Max allowed score change without material input shift: 12 points (bluegill).

### Forecast freeze policy
- After 7:00 PM America/Chicago, tomorrow score is frozen to prior run unless a major forecast shift is detected.
- Major shift threshold default: 18 points score-equivalent movement.

### Determinism guarantee
- With identical weather arrays + water temp + species/date/location + same run timestamp context, score path is deterministic.
- Golden regression test enforces fixed payload => fixed score.

## 7) Operator notes / calibration backlog
- Upload historical run logs (30–180 days) to run numeric volatility analysis and per-species calibration.
- Add measured water-temp station ingestion where available (USGS/agency lake station feeds), then reduce estimator weight.
- Continue tuning per-species coefficients with real catch logs (profiles now active for all selectable species).

## External references (for follow-up calibration packet)
- NOAA weather glossary/front-pressure interpretation
- USGS Water Science School and NWIS lake/river temp context
- Mississippi DWF&P sunfish/black bass species guidance
- Illinois DNR bluegill/redear/crappie/black bass species profiles
- Auburn and Texas A&M extension fisheries management guidance
