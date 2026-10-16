# HYROX Training Week Structure

Status: approved by product owner 2026-10-15.

## Session types
| Session | Purpose |
|---|---|
| Easy run | Conversational pace; aerobic base |
| Threshold run | Comfortably hard intervals (e.g. 4 × 8 min) |
| Race-pace intervals | 1 km repeats at goal HYROX run pace or faster |
| Compromised run | Station work immediately followed by a 1 km run, repeated |
| Station endurance | Technique and volume on stations at race load |
| Strength | Heavy lifting supporting sleds, lunges and carries |
| Race simulation | Half or full HYROX run-through, late in the plan |

## Typical build-phase week by level (approved)
| Level | Sessions/week | Hard days | Mix |
|---|---|---|---|
| First-timer | 4–5 | 1–2 | 2 runs (one longer), 1 light compromised, 1–2 strength with station technique |
| Intermediate | 5–6 | 2 | 3 runs (easy, threshold, long), 1 compromised, 1 station endurance, 1–2 strength |
| Advanced | 6–8 | 3 | 4 runs (incl. threshold and intervals), 1–2 compromised, 1 station endurance, 2 strength |
| Competitive | 8–10 | 3–4 | 4–5 runs, 2 compromised, station endurance, 2 strength |

## Rules (approved)
- No back-to-back hard days.
- **Double days** (two sessions in one day): Competitive by default. Advanced athletes are asked during onboarding whether they want them; off unless they opt in. When a hard morning and hard afternoon share a day, the next day is easy.
- Double days are never back to back (including Sunday into Monday) and are spread through the week (PO, 2026-10-16).
- Phases: base (aerobic + strength) → build (compromised + threshold) → peak (simulations + race pace) → taper.
- Strength and station days count toward the weekly hard-day limit, not just runs.

## Race simulations (approved)
- Half simulations (4 runs + 4 stations) in the build phase.
- Full simulations (8 + 8) in the peak phase: 1–2 for all levels, including first-timers, so the race distance isn't new on race day.
- The last full simulation is no closer than 10–14 days before race day.

## Engine interpretation and assumptions (for coach review)

Implemented in `packages/engine/src/hyrox/`. Items here are Claude's working defaults, not yet approved.

1. **What counts as a hard day.** A day with high-intensity conditioning: threshold, race-pace intervals, compromised run, or simulation. Strength and station endurance are *moderate*: they never go the day before a simulation or the race, or the day after a hard double. (Treating strength days as hard days would make the approved session counts impossible to fit; e.g. Intermediate would need 4–5 hard days.)
2. **Run intensity in HYROX sessions.** The 1 km runs in compromised runs, simulations and race-pace intervals are prescribed at threshold pace (HYROX race effort).
3. **Station volume in compromised runs** as a share of race volume: First-timer and Intermediate 50%, Advanced 75%, Competitive 100%. Station endurance uses half that, × 3 sets.
4. **Compromised rounds:** 3 / 4 / 5 / 6 by level; one fewer in base and recovery weeks; 2 in taper and race week.
5. **Weekly running ceilings:** 25 / 40 / 60 / 80 km by level; ≤ 10% weekly increase; every 4th week is a recovery week.
6. **Taper:** 1 week, or 2 weeks when the plan is 14+ weeks long.
7. **Simulations** take the weekend long-run day and replace that week's long run and first compromised run. Full simulations are at least 10 days apart.
8. **Substitutes are prescribed by time,** using estimated station times of about 5:30 / 4:30 / 3:45 / 3:10 per station by level.
9. **Double days** never pair two of the same session type, and prefer pairing a compromised run with a running-only session.
10. **Easy runs** are never longer than 75% of that week's long run.

## Session variety (product owner request 2026-10-16)
No session repeats within a week, and key sessions change format from one week to the next. The format depends on the week number and on how many sessions of that kind came earlier in the week. Implemented in `packages/engine/src/hyrox/generator.ts` and `strength.ts`; pinned by the "variety" tests. **The formats below are Claude's defaults, awaiting coach review.**

| Session | Formats (rotating) |
|---|---|
| Threshold | 4 × 1 mile (90 s jog) · 6 × 1 km (60 s) · tempo run, 5–6 km continuous · 3 × 2 km (2 min). Base and lighter weeks use one fewer rep or a shorter tempo |
| Race-pace intervals | N × 1 km (90 s) · 2 sets of N/2 × 1 km (60 s, 3 min between sets) · N × (1 km on, 500 m float) |
| Compromised run | Classic: station → 1 km · Station pairs: 2 stations → 1 km (station volume × 0.75) · Short and sharp: half-volume station → 500 m, two extra rounds. Taper and race week always use the classic format |
| Station endurance | Sets: 3 sets per station · Circuit: 3 rounds of 4 stations, 2½ min between rounds · Intervals: a block every 3 minutes, 2 per station |
| Long run | Steady; in build and peak, every other week finishes the last 25% at steady-strong (marathon) effort |
| Easy runs | The first easy run each week (except race week) adds 6 × 20 s strides |
| Strength | Day A, legs & push: squat pattern, single-leg, upper push, trunk. Day B, hinge & pull: hinge, row, straight-arm pulldown, carry, trunk. A second strength day in a week is always the other day. Exercises rotate every 3 weeks; sets × reps follow the phase (base 3 × 10, build 4 × 6, peak 3 × 5, taper 2 × 5) |
