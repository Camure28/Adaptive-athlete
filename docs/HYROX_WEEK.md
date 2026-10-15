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
