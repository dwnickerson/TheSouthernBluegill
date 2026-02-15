# Bluegill Forecast Audit Report (End-to-End)

## Scope and assumptions
- Species audited deeply: **Bluegill (`Lepomis macrochirus`)**.
- This codebase includes many selectable species; this report delivers full biology-weight mapping and validation for the user-selected species (bluegill), and keeps the scoring framework modular for other species.
- Historical run logs and explicit overnight incident payloads were not present in-repo, so flip analysis was performed with deterministic fixtures and regression tests.

## 1) System map

### UI/state flow
1. `app.js` reads `#species` and persists selection to localStorage via `storage.setLastSelectedSpecies`.
2. On submit, app fetches geocode, weather payload, and water-temp estimate, then passes `speciesKey` through `renderForecast`.
3. `renderForecast` now computes day scores through `calculateSpeciesAwareDayScore` (species/day/location explicit) for both today and each forecast day.

### API calls and behavior
- Open-Meteo archive and forecast calls are now both pinned to `timezone=America/Chicago`.
- Retry behavior: 2 attempts with backoff.
- Cache/fallback: if API fails and cache exists, stale payload is used and marked.

### Time handling
- Local timezone basis: America/Chicago.
- “Today/tomorrow” are represented as explicit daily keys (`YYYY-MM-DD`) from forecast daily timeline.
- Freeze policy: tomorrow score is frozen after 7 PM America/Chicago unless major shift threshold is exceeded.

### Derived metrics and scoring
- Day slicing: all hourly records matching local day key.
- Past window: up to prior 48 hours for pressure trend context.
- Derived metrics: pressure trend, mean wind, cloud, precip probability, temp.
- Scoring: species profile-driven (temp + season + pressure + wind + cloud + precip), clamped to species ceiling.
- Stability controls: material-change gating + freeze policy + deterministic keying.

### Display flow
- Summary card (today) and each forecast card (future days) now use the same deterministic scoring engine.

## 2) Data dictionary (bluegill path)

| Variable | Description | Unit | Source | Resolution | Day window used |
|---|---|---:|---|---|---|
| `hourly.time[]` | hourly timestamps | local datetime | Open-Meteo hourly | hourly | local `00:00–23:59` filtered by day key |
| `hourly.surface_pressure[]` | atmospheric pressure | hPa | Open-Meteo hourly | hourly | day mean + past48 trend context |
| `hourly.wind_speed_10m[]` | wind speed | km/h | Open-Meteo hourly | hourly | day mean |
| `hourly.cloud_cover[]` | cloud fraction | % | Open-Meteo hourly | hourly | day mean |
| `hourly.precipitation_probability[]` | precip chance | % | Open-Meteo hourly | hourly | day mean |
| `hourly.temperature_2m[]` | air temp | °C | Open-Meteo hourly | hourly | day mean |
| `historical.daily.precipitation_sum[]` | recent runoff proxy | mm | Open-Meteo archive | daily | trailing recent days |
| `waterTempF` | estimated water temperature | °F | local model | daily scalar | per scored day |
| `pressureTrend` | pressure trend state | enum | derived | hourly→daily | last 4 pressure points over past+start-day |

## 3) Bluegill species model sheet

### Seasonal phases and triggers
- **Pre-spawn:** rising into upper-50s to mid-60s °F; fish move shallower and feed actively.
- **Spawn:** strongest activity around upper-60s to high-70s °F, with nesting/colony behavior.
- **Post-spawn/summer:** activity remains good but can taper in heat, especially mid-day.
- **Fall transition:** renewed feeding during cooling trend.
- **Winter:** lower metabolism and reduced feeding windows.

### Water temperature effects
- Preferred: ~68–78°F.
- Active but not peak: ~58–86°F.
- Cold stress: ≤48°F.
- Heat stress: ≥90°F.
- Water temp estimator remains bounded and lagged via water-body thermal inertia model.

### Weather drivers
- Pressure: mild-to-moderate falls generally improve activity; rapid rise often suppresses.
- Wind: calm to moderate preferred for bluegill sight-feeding and bed-oriented behavior.
- Cloud: moderate cloud often favorable; heavy cloud in prime spawn window can reduce bedding visibility.
- Rain/precip: light probabilities can be neutral-to-positive; high-probability heavy systems penalized.

### Evidence references
- Mississippi Department of Wildlife, Fisheries, and Parks species guidance.
- Illinois DNR bluegill biology notes and seasonal behavior.
- Texas A&M AgriLife and Auburn extension pond-management references for bluegill spawn temperature windows.
- NOAA weather/front interpretation references for pressure-trend context.

## 4) Bluegill scoring map (implemented)

| Model input | Effect | Rule/weight | Rationale | Confidence |
|---|---|---|---|---|
| Water temp in optimal band | Positive | +22 | Peak bluegill activity during warm spawning/feeding temperatures | High |
| Water temp in active non-optimal band | Positive | +11 | Fish still active outside narrow peak | High |
| Cold stress threshold | Negative | -18 | Metabolism and bite decline in cold water | High |
| Heat stress threshold | Negative | -14 | Heat stress and oxygen constraints reduce consistent bite windows | Medium |
| Spring months | Positive | +8 | Pre-spawn/spawn alignment | High |
| Fall months | Positive | +6 | Cooling-water feeding pulse | Medium |
| Winter months | Negative | -8 | Reduced activity | High |
| Pressure rapid fall | Positive | +9 | Pre-front feeding windows | Medium |
| Pressure rise/rapid rise | Negative | -4 | Post-front suppression | Medium |
| Wind calm/moderate | Positive | +7 / +3 | Bluegill generally prefer manageable surface disturbance | Medium |
| Wind rough | Negative | -8 | Excessive disturbance reduces presentation efficiency | Medium |
| Cloud balanced | Positive | +5 | Productive light conditions | Medium |
| Heavy cloud during spawn band | Negative | -7 | Reduced bedding visibility and sight-feed efficiency | Medium |
| Moderate precip chance | Positive | +3 | Slight weather movement can stimulate feeding | Low-Medium |
| High precip chance | Negative | -8 | Storm risk/turbidity instability | Medium |

## 5) Stability strategy and bug fixes

### Bugs fixed
1. Timezone drift risk from `timezone=auto` corrected to explicit America/Chicago.
2. UI path inconsistency fixed: daily cards and summary both now use the same species-aware scoring engine.
3. Added deterministic location+species+date key usage in stability path for all displayed day scores.

### Stability controls
- **Change gating:** score jumps are clipped when key weather deltas are below material thresholds.
- **Forecast freeze:** after 7 PM local, tomorrow is locked unless major forecast shift threshold is exceeded.
- **Determinism:** same JSON inputs + same run context return identical scores.

## 6) Operator notes
- Toggle debug packet logging with `localStorage.setItem('fishcast_debug_scoring', 'true')`.
- Logs include: raw day features, contributions, base score, final score, and stability reason.
- For full calibration, ingest 30–180 day run logs and water-temp observations where available.
