# FishCast Tests

## Test types

- `fishcast/js/models/*.unit.test.js`: model-focused unit tests (legacy + targeted scenarios).
- `fishcast/tests/*.test.js`: Node test runner suites for forecast engine, water temp, timezone, units, SW safety, and UI view-model contracts.
- `fishcast/tests/smoke/`: authoritative smoke-test safety gate.
- `fishcast/tests/legacy/`: archived design-reference audit markdown reports (non-gating).

## Which command should I run?

- **Timezone verification (quick):**
  ```bash
  npm run test:timezone
  ```
  Use this when validating day/time alignment behavior.

- **Model/scoring validation (focused):**
  ```bash
  npm run test:model
  ```
  Use this after changing water-temperature or scoring logic.

- **Full Node suite (broad):**
  ```bash
  npm test
  ```
  Runs all suites under `fishcast/tests/*.test.js`.

- **Release smoke gate (must-pass before deploy):**
  ```bash
  npm run test:smoke
  ```


## Water-temperature observed-report tests (what they do)

These tests verify behavior when a user/operator submits a measured water temperature ("observed" reading):

- `fishcast/tests/water-temp-observed-period-anchor.test.js`
  - Ensures a same-day observed reading can nudge `surfaceNow`.
  - Ensures that nudge decays with report age.
  - Ensures stale same-day readings are ignored.
  - Ensures observed calibration does **not** rewrite projection anchors (`sunrise`, `midday`, `sunset`).

- `fishcast/tests/water-temp-observed-period-consistency.test.js`
  - Ensures observed calibration applies only to `surfaceNow` in canonical view-model output.
  - Confirms period anchors remain projection-driven for day-profile continuity.

### Run just observed-report tests

```bash
node --test fishcast/tests/water-temp-observed-period-anchor.test.js fishcast/tests/water-temp-observed-period-consistency.test.js
```

### Run observed + diurnal + today alignment checks

```bash
node --test fishcast/tests/water-temp-observed-period-anchor.test.js fishcast/tests/water-temp-observed-period-consistency.test.js fishcast/tests/water-temp-diurnal.test.js fishcast/tests/water-temp-today-alignment.test.js
```

### Expected output

- Passing runs show `ok` for each subtest and `# fail 0` at the end.
- Any `not ok` means a model contract changed and should be reviewed before shipping.

## How to read results

- `ok` means the specific behavior is verified.
- `not ok` means at least one invariant failed and should be investigated before shipping.
- Final summary gives `pass/fail` totals and total duration.

## What the smoke suite protects

The smoke suite enforces production-safety invariants for:

- temperature unit correctness,
- timezone/now alignment,
- wind realism,
- trend smoothness,
- forecast score stability,
- UI view-model sanity (no DOM).

## Required execution points

Run the smoke suite:

- **before deploy**,
- **after any Codex edits** touching FishCast models/services/UI data flow,
- **before shipping forecast/scoring changes**.

FishCast is valid only when these smoke tests pass.
