# Water Temperature Debug Repro

## Enable debug mode
1. Open Fishcast in browser.
2. In DevTools Console run:
   ```js
   localStorage.setItem('fishcast_debug_water_temp', 'true');
   location.reload();
   ```

## Reproduce and inspect logs
1. Generate a forecast for the target location (example: `34.2576, -88.7034`).
2. In Console, inspect:
   - `"[FISHCAST BUILD]"` to confirm active bundle/build stamp.
   - `"[WRITE water temp]"` for each water field write (`surface`, `sunrise`, `midday`, `sunset`).
   - `"[ASSERT water temp match]"` / `"[ASSERT water temp mismatch]"` to verify rendered DOM values match computed values.

## Root cause fixed
Water temperatures in Forecast Summary (`Water surface`) and Water Conditions (`Sunrise/Midday/Sunset`) were computed through separate render-time paths instead of one shared view model object. This made it possible to display values from different computation points and hide where each write came from.

Fix: both display areas now render from one `buildWaterTempViewModel(...)` result, then pass through explicit field-level setters that trace source variable, previous/new text, selector identity, and stack.
