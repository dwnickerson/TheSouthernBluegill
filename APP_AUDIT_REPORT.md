# FishCast Full Application Audit (Current State)

Date: 2026-02-17
Scope: Entire `fishcast` web app (product flow, data pipeline, architecture, testing, UX/accessibility, and deployment posture).

---

## Executive summary

FishCast has a solid forecast core and a strong automated test baseline, but it still carries legacy "community report / sheet sync" product behavior in active runtime code. The app is stable enough for iterative release, but **not yet aligned with your stated direction that Google Sheets is no longer part of the product**.

### Overall status
- **Core model/testing:** Good and improving.
- **Product consistency:** Needs correction.
- **Architecture maintainability:** Moderate risk due to oversized UI modal module and mixed concerns.
- **Accessibility:** Partial; key improvements still needed.

### Top priorities (in order)
1. Remove stale Google-Script-specific submission and "Sheet sync pending" messaging from runtime code paths.
2. Feature-gate or remove reporting gamification UI if it is no longer a product goal.
3. Split `modals.js` into smaller modules (reporting, settings, educational/help) to reduce regression risk.
4. Reduce console noise in production and formalize debug logging gates.
5. Close accessibility gaps on icon-heavy controls and dynamic modal semantics.

---

## 1) Product reality vs stated direction

You stated that Google Sheets/reporting was removed previously. Current codebase still contains active indicators of that legacy flow:

- Water-temp report endpoints are still configured as Google Apps Script URLs.
- Runtime submission still posts directly to a Google Apps Script endpoint.
- Fallback user copy still references "Sheet sync pending".
- UI copy and help text still describe community report mechanics as first-class behavior.

### Impact
- Product messaging mismatch (what users and operators believe vs what app does).
- Ongoing operational coupling to third-party script deployments.
- Increased support burden when users hit report failures.

### Recommendation
- Decide explicitly between:
  - **A) Keep reporting** (then rename it and remove all Sheets terminology), or
  - **B) Remove reporting** (strip UI/actions, retention keys, and endpoint code entirely).

---

## 2) Forecast/model pipeline health

The forecast stack itself is structured and defensible:

- Unit normalization and safeguards are present (temp/wind/precip normalization).
- Seasonal baseline + water-body parameters + lag/inertia logic are implemented.
- Wind-mixing and cold-season pond correction logic exist and are tested.
- User reports are blended with weighting and trust checks (distance/recency/type).
- Same-day memo clamping provides anti-jitter stability unless trusted local reports exist.

### Residual model risks
- Heavy reliance on heuristic constants means calibration can drift by region/season.
- Console-level observability exists, but there is no formal telemetry/event model.
- Some branch behavior is complex enough to warrant scenario regression snapshots per region.

### Recommendation
- Keep current model architecture, but add a formal calibration harness per representative climate zone.

---

## 3) Testing and quality posture

### What is strong
- Node test suite is extensive and currently passing.
- Smoke suite validates key invariants (unit sanity, wind realism, trend smoothness, score stability, UI view-model assumptions).
- Water-temp projection and scoring logic are covered with targeted tests.

### Gaps to close
- No browser-level E2E checks for modal accessibility/focus traps.
- No explicit CI contract documented for required checks before deploy.
- No contract tests for endpoint migration/deprecation behavior.

### Recommendation
- Add minimal Playwright E2E for critical user path and modal keyboard navigation.

---

## 4) Architecture and maintainability

### Findings
- `modals.js` is large and multi-purpose (reporting, quick report, badges, educational content, settings-like interactions), which raises change risk.
- Reporting/business logic is partially interwoven with UI flow.
- Multiple sources of product copy are embedded in JS strings, making policy updates error-prone.

### Recommendation
- Extract:
  1) `reportingModal.js`
  2) `settingsModal.js`
  3) `about/helpModal.js`
  4) `reportingService.js`
- Centralize all external endpoints in config only, and route via one service interface.

---

## 5) UX and accessibility

### Strengths
- Clear primary use case (get location → generate forecast).
- Forecast cards and species framing are understandable for target users.

### Issues
- Icon/emoji density remains high in some interactions, reducing professional trust for decision-support context.
- Some dynamic modal content can be difficult for assistive-tech users without stronger semantic annotations.
- Reporting affordances still visually compete with forecast-first behavior.

### Recommendation
- Simplify top-level actions to forecast-first.
- Add explicit ARIA labels, heading structure checks, and keyboard focus audits for all modal flows.

---

## 6) Security and operational concerns

### Observations
- Client-side direct calls to public script endpoints expose operational fragility (versioned script URLs, CORS/runtime failures, quota behaviors).
- No visible server-side abstraction layer for report ingestion.

### Recommendation
- If reporting is retained, place ingestion behind a controlled API boundary and deprecate direct client → Apps Script writes.

---

## 7) Concrete action plan (7-day hardening)

### Day 1-2: Product alignment
- Remove or gate all legacy Sheets/reporting UX and copy.
- Delete dead/local fallback strings referencing "Sheet sync pending".

### Day 3-4: Refactor for safety
- Split `modals.js` and isolate report transport/service code.
- Introduce typed payload validation for report fetch/submit responses.

### Day 5: Accessibility pass
- Modal semantics + keyboard traversal + icon-button labels.

### Day 6: Release guardrails
- Define pre-release quality gate: unit + smoke + E2E happy-path.

### Day 7: Documentation
- Update operator guide and architecture notes to reflect final product decision on reporting.

---

## 8) Data used for this app audit (full inventory)

This audit was based on repository evidence and runtime integration points (not assumptions). Data reviewed:

### A) Runtime input data used by the app
- Open-Meteo forecast hourly fields: pressure, wind, cloud cover, precipitation probability, air temperature.
- Open-Meteo archive/daily fields used for recent-history context (including precipitation totals).
- Geocoding/reverse-geocoding payloads used for location resolution.
- User-submitted water-temperature/community report payloads sent to configured report endpoints.

### B) Internal model/config data used by the app
- Species profiles and scoring heuristics in fish model modules.
- Water-body defaults and constants (pond/lake/river assumptions, thermal behavior constants, stability thresholds).
- Date/time handling and timezone logic used for day slicing and tomorrow-freeze behavior.

### C) Client persistence data used by the app
- LocalStorage keys for favorites, recent reports/catches, selected species, settings, and memoized forecast/water-temperature artifacts.
- Service-worker cache entries for shell assets and runtime requests.

### D) Evidence used to write this report
- Application source modules in `fishcast/js/{app,services,models,ui,config}`.
- Service worker and manifest/runtime shell files.
- Automated tests and smoke scenarios under `fishcast/tests` and model unit tests.
- Existing operator/audit documentation in this repository.

### E) Out-of-scope / unavailable data during this audit
- Production analytics/telemetry streams.
- Historical incident payload archives not committed to this repo.
- Backend logs for external report endpoints.

---

## Final judgment

FishCast’s core forecasting engine is in good condition and supported by meaningful tests. The primary issue is not model collapse; it is **product/architecture inconsistency around legacy reporting infrastructure that should have been fully retired (or formally retained and modernized).**

If you want, next step can be a surgical cleanup PR that removes all Google Script/Sheet-specific behavior and leaves a strict forecast-only product surface.
