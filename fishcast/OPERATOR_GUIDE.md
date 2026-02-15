# FishCast Forecast Operator Guide

## Update cadence
- Weather payload is refreshed on demand; cached for ~60 minutes (America/Chicago timezone pinned at API request).
- If API fetch fails, cached weather is used and marked stale.
- Water temp estimate is memoized by location+water type and constrained by max daily change.

## Scoring flow
1. Ingest weather archive+forecast (America/Chicago timezone pinned).
2. Build local-day windows from hourly arrays.
3. Compute species-aware day score for summary + each forecast day through `forecastEngine.js`.
4. Apply stability controls:
   - material-change gating
   - tomorrow freeze after 7pm local (unless major shift)
5. Render final score and labels.

## Debug mode
- Set in browser console:
  - `localStorage.setItem('fishcast_debug_scoring', 'true')`
- Re-run forecast; console will include:
  - raw/derived features
  - base score
  - final score
  - stability reason

Disable with:
- `localStorage.removeItem('fishcast_debug_scoring')`

## Why scores move
Scores should move mainly when one or more of these materially change:
- pressure trend magnitude
- forecast wind regime
- precipitation probability/amount
- cloud cover regime
- air/water temperature profile

## Freeze policy behavior
- After 7:00 PM America/Chicago, tomorrow score remains locked to prior run.
- Unlock occurs only when major shift threshold is exceeded.
