# FishCast / Site Technical Review and Next-Step Plan

## Executive summary

The app has a strong foundation (modular JS, offline support, favorites, quick reporting), but the biggest risks now are **data consistency**, **resilience under API failures**, and **maintainability drift** from duplicated state patterns.

If we prioritize only three things this cycle:
1. Unify local storage and clear-data behavior into one source of truth.
2. Harden API/network error handling and add a graceful degraded mode.
3. Add a lightweight test harness (unit + smoke) for core forecast paths.

## Current strengths worth preserving

- Clean modular split (`services`, `models`, `ui`, `config`) and ES modules.
- Practical PWA shell with service worker and manifest.
- Nice product features already in place: geolocation, favorites, water-temp reporting, quick report flows.

## Key issues and opportunities

### 1) Product consistency: storage state is fragmented

**What I saw**
- `storage.js` defines typed keys and helper methods for app data (`CACHE_KEYS`, favorites, catches, settings), but key user data is also written directly via raw `localStorage` strings in multiple modules.
- Examples include `waterBodyFavorites`, `recentReports`, `lastSelectedSpecies`, and water temperature memoization keys.

**Why this matters**
- “Clear all data” can leave behind data because it only removes keys listed in `CACHE_KEYS`.
- Migration/versioning becomes hard (you can’t evolve schema safely when keys are scattered).
- Bugs become harder to reason about due to hidden side effects.

**Recommendation**
- Introduce a single storage schema namespace (e.g., `fishcast:*`) and move all key writes through `storage.js`.
- Add a `storage.clearAll({ includeDerived: true })` path that also clears derived keys (like water temp memoized values).
- Add a migration map (`versionedStorageMigrations`) so future changes don’t break returning users.

### 2) UX mismatch in species defaults

**What I saw**
- Main species list includes `white_crappie` and `black_crappie`.
- Settings modal default species uses `crappie` (generic), which is not a selectable forecast species value.

**Why this matters**
- Users can save a default value that won’t match any option in the primary species selector, causing silent fallback behavior and confusion.

**Recommendation**
- Normalize settings options to exact values used by forecast form.
- Add validation on save settings to reject unknown enum values.

### 3) Operational reliability: network-only API strategy can fail hard

**What I saw**
- Service worker explicitly routes API calls network-only (Open-Meteo, Nominatim, Google Script).
- `getWeather` and geolocation reverse lookup throw on non-OK responses, with no retry/backoff/circuit-breaker behavior.

**Why this matters**
- Any transient outage creates a hard failure experience.
- Field users often have weak connectivity; this is a critical product context risk.

**Recommendation**
- Add retry with jitter for transient HTTP/network errors.
- Cache last successful forecast summary and show “last known forecast + stale badge” when APIs fail.
- Instrument client-side error telemetry to quantify failure causes before deeper optimization.

### 4) Versioning and cache invalidation still feel brittle

**What I saw**
- HTML uses query-string versions (`main.css?v=3.3.1`, `app.js?v=3.3.1`).
- Service worker pre-cache list references non-versioned paths and manual cache name bumps (`fishcast-v5`).
- There is a dedicated `check-version.html`, indicating this has been a recurring issue.

**Why this matters**
- Deployment correctness depends on manual sync between URL params, service worker cache names, and file list updates.
- Cache drift is likely during fast iteration.

**Recommendation**
- Move to build-generated content hashes for static assets or, minimally, a manifest-driven pre-cache file generated at deploy time.
- Automate service-worker cache version derivation from build metadata.

### 5) Security and abuse-hardening gaps

**What I saw**
- Water temperature submit endpoint is a public Google Script URL in client config.
- External scripts are loaded via CDN without SRI/crossorigin integrity pins.

**Why this matters**
- Public write endpoints are scrape/spam targets.
- Supply chain risk increases without script integrity checks.

**Recommendation**
- Move submissions through a protected backend proxy with rate limits and bot mitigation.
- Add SRI hashes for CDN assets, and consider self-hosting critical libs if practical.

### 6) Accessibility and interaction polish gaps

**What I saw**
- Many controls rely on emoji-only button labels; no obvious `aria-label` coverage in several interactive elements.
- Heavy use of inline handlers and inline styles in modal markup limits systematic accessibility improvements.

**Why this matters**
- Screen reader clarity and keyboard workflows can degrade quickly.
- Accessibility fixes become expensive when not centralized.

**Recommendation**
- Add explicit `aria-label`s for icon-only controls.
- Standardize modal component patterns and keyboard trap/escape handling.
- Add a basic accessibility acceptance checklist in PR workflow.

### 7) Maintainability debt from mixed architecture patterns

**What I saw**
- Modular ES import architecture coexists with many `window.*` global assignments for onclick compatibility.
- Significant debug logging is always on in production path.

**Why this matters**
- Global namespace coupling raises regression risk.
- Excess logs can leak implementation detail and clutter troubleshooting.

**Recommendation**
- Gradually replace inline onclick dependencies with delegated event listeners.
- Add environment-based logger levels (`debug/info/error`) and strip debug logs in production build.

### 8) Quality assurance maturity is the biggest leverage point

**What I saw**
- There are diagnostic HTML pages, but no formal automated test layer in repo for core model/service behavior.

**Why this matters**
- Forecast quality regressions and storage migrations are hard to catch before release.

**Recommendation**
- Start small: add tests for `waterTemp` model, favorites dedupe behavior, settings validation, and error-state rendering.
- Add a CI smoke test (Playwright): load app, submit a known location, assert forecast card appears.

## Suggested roadmap

### Phase 1 (1–2 weeks): Stabilize core behavior
- Storage unification + migration support.
- Species enum consistency fix.
- Retry + stale fallback for weather/geocoding.

### Phase 2 (2–3 weeks): Delivery hardening
- Deterministic asset versioning and service-worker pre-cache manifest automation.
- SRI on external scripts + endpoint protection design.
- Add lightweight telemetry for forecast failures and submit failures.

### Phase 3 (ongoing): Product quality and growth
- Test automation baseline (unit + smoke).
- Accessibility pass for icon controls/modals.
- Forecast explainability UX (show score contributors and confidence).

## High-impact ideas for “what next” (feature side)

1. **Confidence score + uncertainty messaging**
   - Explain when forecast certainty is low (sparse data, high weather volatility).
2. **User feedback loop**
   - “Did the forecast match reality?” prompt to tune heuristics over time.
3. **Personalized bite windows**
   - Save user outcomes by species/water body and adapt recommendations.
4. **Regional trend intelligence**
   - Aggregate anonymized reports by area and show “warming/cooling bite trend.”
5. **Trip planner mode**
   - Compare multiple saved spots by next-best 3-day windows.

## Bottom line

You have a compelling and differentiated niche product already. The next win is not “more features first”; it is **reliability + data discipline + test coverage** so every new feature lands on stable ground.
