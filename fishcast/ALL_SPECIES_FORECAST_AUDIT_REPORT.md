# All-Species Forecast Audit Report (Tupelo, MS issue review)

## Why this audit was needed
You reported a contradictory outcome: **Largemouth Bass showing a low next-week score while phase text says pre-spawn**. The root cause was reproduced from code-path review:
- Fish phase labels were computed from species phase tables.
- Multi-day score calculations were not directly phase-aware in the forecasting engine.

## What was wrong

### 1) Daily scoring ignored species phase bonuses
The species phase definitions (including `pre_spawn`, `spawn`, etc.) were present in `species.js`, but `scoreSpeciesByProfile()` did not use phase score bonuses. That allowed a valid phase label (e.g., pre-spawn) to appear while the day score remained low due to weather/season penalties dominating. This is the primary source of the contradiction you observed.

### 2) Spawn cloud adjustment used a generic temp band rather than species phase
A cloud-related spawn adjustment was triggered by a broad water-temperature band (`66–75°F`) instead of checking whether the fish was actually in a spawn-related phase. This could apply spawn-context logic to species/temps that were not in `spawn`/`pre_spawn`, and skip relevant cases where spawn windows differ by species.

### 3) “Phase label” and “score model” used separate logic paths
Phase labeling in the UI used one path (`getFishPhaseLabel` from phase temp ranges), while day score used another path (`scoreSpeciesByProfile`) without phase coupling. This architecture enabled label/score divergence even when both were individually “working as coded.”

## Fixes implemented

### A) Added shared phase resolution in forecasting engine
Implemented `getPhaseForTemp(speciesKey, waterTempF)` in `forecastEngine.js` so the engine can resolve the biologically correct phase from `SPECIES_DATA` temp ranges.

### B) Added phase-weighted score contribution for every species
`scoreSpeciesByProfile()` now applies a normalized phase delta from each species phase `score_bonus`:
- scale factor: `0.4`
- clamp range: `[-8, +14]`
This ensures all species receive phase-context influence while preserving profile ceilings and stability controls.

### C) Gated spawn cloud adjustment by actual phase
The heavy-cloud spawn adjustment now checks phase semantics (`phase name includes "spawn"`) instead of only a hardcoded temperature range.

### D) Added regression test for phase coupling
New test validates:
- Prespawn bass scores above winter bass under same weather features.
- Spawn cloud adjustment appears in prespawn/spawn context.
- Spawn cloud adjustment does **not** appear in winter phase context.

## Species-by-species audit impact
All selectable species now receive phase-coupled scoring in the multi-day engine:
- **Sunfish:** bluegill, coppernose, redear, green_sunfish, warmouth, longear, rock_bass
- **Black bass:** bass, smallmouth, spotted
- **Crappie:** crappie, white_crappie, black_crappie

This closes the previous mismatch class across the full species list.

## Notes on Tupelo next-week interpretation
A **pre-spawn label can still coexist with a fair/poor score** if non-phase weather factors are unfavorable (pressure trend, wind regime, cloud/precip setup, seasonal penalties, etc.).
The difference now is: phase bonus is explicitly part of the score, so low scores in pre-spawn should be explainable by stronger negative inputs rather than a missing phase contribution.

## Remaining calibration opportunities (not bugs)
1. Tune phase normalization weights per family (sunfish/bass/crappie) after field data review.
2. Add explicit catch-log calibration by species and month.
3. Add a UI score-breakdown view for day cards to expose per-factor contributions and reduce “black box” perception.
