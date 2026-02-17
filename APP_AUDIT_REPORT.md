# FishCast Full Application Audit (Current State)

Date: 2026-02-17  
Scope: End-to-end review of the `fishcast` app (runtime behavior, model pipeline, architecture, UX/accessibility, offline behavior, and test posture).

---

## Executive summary

A complete fresh audit shows that previously flagged "Google Sheets / Apps Script submission" priorities are largely resolved in active runtime code. Reporting is now local-first (saved client-side), and UI modal responsibilities are already split into focused modules.

The app is in materially better shape than the previous report indicated. The highest-value remaining work is now **cleanup and hardening**, not product-direction triage.

### Overall status
- **Forecast/model quality:** Strong and stable.
- **Testing baseline:** Strong (unit + smoke suites passing).
- **Architecture trajectory:** Improved (modular UI split already in place).
- **Remaining risk level:** Moderate-low, concentrated in operational polish and accessibility/E2E coverage.

### Updated top priorities (in order)
1. Remove stale `script.google.com` handling from the service worker network-only host list to match current architecture.
2. Add browser-level accessibility/E2E checks for modal keyboard/focus behavior.
3. Reduce unconditional `console.error` localStorage noise in non-browser contexts with a centralized environment-aware guard.
4. Align operator debug docs with actual debug flags/keys used in runtime logger and scoring flows.

---

## 1) Product direction alignment (re-audited)

### Current findings
- Forecast-first shell is clear on the main page; report submission is no longer front-and-center in the primary entry flow.
- Report submission persists to local storage (`waterTempReports`) instead of posting to Google Apps Script.
- Modular modal split is present: reporting, settings, and help/about responsibilities are separated.

### What changed vs prior report
- The prior report's top concern (active Apps Script submission + "Sheet sync" style messaging) is not supported by current reporting submission logic.
- Residual Google coupling appears only as stale service worker host allowlisting, not active data submission behavior.

### Remaining action
- Remove stale `script.google.com` branch in SW fetch routing to avoid policy drift and operator confusion.

---

## 2) Forecast/model pipeline health

### Strengths confirmed
- Forecast generation path remains coherent: geocode -> weather fetch -> water temp estimation -> render.
- Water temperature model and scoring behavior retain robust regression coverage (including stability and edge-case handling).
- Weather API unit metadata handling is covered and passing.

### Residual technical risk
- Model remains heuristic-heavy (expected for this product), so seasonal/regional calibration drift remains a long-term maintenance concern.

### Recommendation
- Keep current architecture; continue periodic scenario calibration snapshots for representative climate/water-body profiles.

---

## 3) Test and quality posture

### Current status
- Automated Node test suite passes.
- Smoke invariants pass for unit sanity, alignment, wind realism, smoothness, and score stability.

### Gaps
- Still no browser E2E guardrail for modal accessibility semantics and keyboard traversal.

### Recommendation
- Add a minimal Playwright suite for:
  - Settings/About modal open/close by keyboard
  - Escape-close behavior
  - Focus return to trigger element

---

## 4) Architecture and maintainability

### Improvements verified
- `modals.js` now acts primarily as an export/bridge layer.
- Functional ownership has been split into dedicated modules (`reportingModal.js`, `settingsModal.js`, `helpModal.js`).

### Remaining concerns
- Some report flow text/logic remains embedded inline in large template strings, which raises copy-change risk.
- Storage service logs raw errors whenever localStorage is unavailable; this is safe but noisy in test/server-like contexts.

### Recommendation
- Introduce a shared environment-aware logger/guard for storage failures and keep user-facing behavior unchanged.

---

## 5) UX, accessibility, and operational readiness

### What is good
- Main form controls include baseline labels and useful `aria-label` attributes for icon buttons.
- Core flow remains straightforward and understandable.

### What still needs attention
- Modal accessibility quality is not currently enforced by automated browser checks.
- Debug-mode operator docs do not fully align with current runtime logger toggles (`fishcast_debug` vs scoring-specific toggle guidance).

### Recommendation
- Add E2E accessibility checks and reconcile docs with runtime debug key behavior.

---

## 6) Security/offline/runtime concerns

### Observations
- Service worker keeps API-like endpoints network-only (good anti-stale posture).
- SW still includes a legacy `script.google.com` network-only host branch that no longer matches current submission architecture.

### Recommendation
- Remove stale host allowlist entry and bump SW cache version to ensure clean client rollout.

---

## 7) 7-day hardening plan (updated)

### Day 1
- Remove stale `script.google.com` SW branch.
- Increment cache version and verify update behavior.

### Day 2-3
- Add browser E2E tests for modal keyboard/a11y critical path.

### Day 4
- Implement storage error logging guard (avoid noisy false alarms in non-browser test/runtime contexts).

### Day 5
- Reconcile `OPERATOR_GUIDE.md` debug instructions with actual runtime flags.

### Day 6-7
- Run full validation (unit + smoke + new E2E) and publish release note with updated operational expectations.

---

## 8) Data used for this audit (full inventory)

This audit was based on direct repository evidence and executed test runs.

### A) Runtime/product evidence reviewed
- Main app shell and primary user flow entry (`fishcast/index.html`, `fishcast/js/app.js`).
- Modal orchestration and split modules (`fishcast/js/ui/modals.js`, `fishcast/js/ui/reportingModal.js`, `fishcast/js/ui/settingsModal.js`, `fishcast/js/ui/helpModal.js`).
- Service worker fetch strategy (`fishcast/sw.js`).

### B) Model/data-path evidence reviewed
- Forecast, weather, and water-temp modules (`fishcast/js/models/*`, `fishcast/js/services/weatherAPI.js`, `fishcast/js/services/storage.js`).

### C) Quality evidence executed
- `npm test`
- `npm run test:smoke`

### D) Out-of-scope for this repository-only audit
- Production analytics streams and real user telemetry.
- External backend logs (if any) beyond repository-local behavior.

---

## Final judgment

FishCast is now substantially more aligned with forecast-first product goals than prior audit conclusions suggested. The major previously reported priority (active Google Apps Script reporting path) appears effectively resolved in runtime behavior, with only minor legacy residue in the service worker allowlist.

The next phase should focus on **hardening and operational polish**: remove stale SW residue, add modal E2E accessibility checks, and align operator debug documentation with runtime reality.
