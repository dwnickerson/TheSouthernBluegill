# Tupelo Pond Water Temperature Forensic Notes

## Dataset used
- Pond: The Villages, Tupelo, MS (`34.257607, -88.703386`)
- Surface depth probe: ~1.6 ft
- Measurements window: 2026-02-10 through 2026-02-16 (UTC timestamps provided by operator)

## Key observed physical behavior from measurements
- Morning cooling and afternoon rebound appears repeatedly in the same 24-hour cycle.
- The largest same-day swing in this set is **+3.8°F** (2026-02-12 morning to evening), consistent with shallow-pond daytime solar loading.
- Multi-day net trend is warming from upper 40s to mid 50s, indicating a warm-air regime with intermittent daytime spikes.

## What the legacy model already accounted for
- Seasonal harmonic baseline by latitude and water-body class.
- Daily mean air-temperature influence and trend kicker.
- Daily cloud-cover solar deviation.
- Wind-driven mixing/cooling effects.
- Daily projection envelopes and synoptic-event acceleration.

## Missing variable class that can explain a ~4°F afternoon miss
The previous scalar estimate produced one surface number for the day; that design can underpredict shallow-pond afternoon peaks when daily means hide intraday forcing. Key missing terms in practice were:

1. **Intraday (hourly) air-temperature anomaly** vs daily mean.
2. **Time-of-day solar phase** (morning vs noon vs afternoon).
3. **Cloud damping of shortwave gains at intraday scale**.
4. **Wind damping of surface-layer warming at intraday scale**.

## Implemented adjustment
A new period estimator was added so model consumers can request **morning**, **midday**, or **afternoon** surface estimates using forecast/archive hourly forcing.

High-level approach:
- Start from the daily physics estimate.
- Add a solar-phase term scaled by daily air-range and cloud/wind damping.
- Add an hourly air-anomaly coupling term.
- Clamp to physical bounds (32–95°F).

This keeps the daily model intact while exposing intraday behavior that shallow ponds commonly show.

## Operational recommendation
- Use daily estimate for long-range trend context.
- For day-of operations in shallow ponds, use period estimates:
  - morning (~09:00 local)
  - midday (~12:00 local)
  - afternoon (~15:00 local)
- Compare residuals separately by period; do not mix all timestamps into one daily error bucket.

## Environment limitation encountered during this audit
This execution environment could not reach Open-Meteo endpoints (proxy/connect failures), so historical API pulls could not be completed live here. The model improvements and tests were implemented locally regardless.

## Field update (operator dataset received after initial pass)
A 9-point observational set was supplied for 2026-02-10 through 2026-02-15 with hourly Open-Meteo matches (offsets 1–23 min). The key pattern in this new data is:

- **Persistent overcast periods (cloud ~92–100%) with modest pond warming** rather than large midday spikes.
- **Warm-air anomalies did not fully translate** to water at 1.6 ft depth during cloudy/windy windows.
- Observed period spread remained moderate (roughly low-single-digit °F), not the upper-end clear-sky shallow-pond response.

### Model impact
This data indicates our intraday pond terms were still a bit aggressive under overcast regimes. To better match observed behavior:

1. **Reduced pond air-coupling gain** so short-lived warm air surges don't overdrive surface estimates under poor radiative forcing.
2. **Reduced pond solar gain slightly** to avoid optimistic midday peaks when cloud decks persist.
3. **Increased wind damping slightly** for surface-layer warming.
4. **Changed cloud damping from daily-mean only to blended daily+target-hour cloud cover**, giving stronger suppression when the actual target hour is heavily overcast.

These changes preserve clear/calm daytime rise while reducing false warm spikes in cloudy/windy conditions similar to the Tupelo set.

