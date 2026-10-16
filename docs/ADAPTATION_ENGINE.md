# Adaptation Engine — Rubric

Status: **APPROVED** by the product owner on 2026-10-16 (see §10), with changes to A-2, A-3 and P-7. Details marked *default, to confirm* are Claude's fill-ins where the product owner's note left a gap.

Implementation note: `packages/engine` already contains adaptation logic shared by the running and HYROX generators (D-009). Reconcile the code with this rubric rule by rule; the rubric wins.

## 1. Purpose

The adaptation engine is the paid product (D-013). It reads what the athlete actually did and decides whether upcoming sessions should change. It must be:

- **Conservative:** no change from one reading, one bad night or one great workout.
- **Explainable:** every decision, including "no change", records what was checked, what data was used and why.
- **Bounded:** hard caps on how much a plan can change in a week.
- **Reviewable:** each rule has an ID, a version and a plain-language description a coach can edit.

## 2. When it runs

| Trigger | What runs |
|---|---|
| A session is logged (manual or import) | Session-level rules for that session type; safety rules |
| Pain or "not feeling 100%" reported | Safety rules immediately |
| New benchmark or race result | Target recalculation (T rules) |
| Weekly review (night before the training week starts) | All trend rules over the past 7–28 days; produces the weekly review |
| Race date, schedule, equipment, limitations or level change | Block rules (B rules) |

Changes only apply to sessions **more than 24 hours away**, except safety changes, which apply immediately.

## 3. Decision order and conflicts

Rules are evaluated in this order. A higher group can block a lower one in the same week.

1. **Safety** (S) — pain, illness
2. **Fatigue** (F) — RPE, heart rate, recovery, soreness trends
3. **Adherence** (A) — missed or extra sessions
4. **Progression** (P) — making sessions harder
5. **Targets** (T) — recalculating paces and station estimates
6. **Block** (B) — re-planning phases and level

Conflict rules:
- Any S or F rule that reduces load **blocks all progression** for that session type until it clears.
- Progression and reduction are never applied to the same session in the same week.
- If two rules want different changes to one session, the more conservative one wins and the other is logged as suppressed.

## 4. Guardrails (apply to every rule)

| Guardrail | Default |
|---|---|
| Weekly running volume increase | ≤ 10% over the previous non-recovery week (existing plan rule) |
| Weekly running volume decrease by adaptation | ≤ 30% unless a safety rule fires or the athlete chooses a lower level (B-4) |
| Pace target change per adjustment | ≤ 3% faster; slower changes not capped |
| Progressions per session type | ≤ 1 per week |
| Progressions in recovery, taper or race week | None |
| Hard-day limits and no back-to-back hard days | Always respected (HYROX_WEEK.md) |
| Full simulations | Never added by adaptation; may be removed or downgraded to half |
| Removing every hard session from a week | Only by a safety rule, otherwise ask the athlete |

## 5. Data quality gates

A rule only fires when its minimum data is present. Otherwise it is logged as *not evaluated — insufficient data*, and the athlete may be asked (decision 9).

| Signal | Minimum to use it |
|---|---|
| RPE | Logged on the session (always available, manual) |
| Pace vs target | Distance and time for the work reps; GPS or treadmill flagged; route conditions not marked "hilly/hot/altitude" unless the target was set for them |
| Heart rate | Same device source as the baseline; ≥ 3 comparable sessions of the same type |
| HRV / resting HR | ≥ 28 days of baseline **from the same source**; ≥ 5 of the last 7 days present |
| Sleep | Same source as baseline; used only to support, never as the sole trigger |
| Station splits | Logged per station or substitute, with the option used |
| Benchmark result | Timing method recorded; within the last 12 weeks; distance ≥ 3 km |

Missing data is never filled with a guess. Effort-based (RPE) plans stay effort-based until a valid benchmark exists (ONBOARDING.md).

## 6. Rules

Notation: "hard session" = threshold, race-pace intervals, compromised run or simulation (HYROX_WEEK.md assumption 1). "Target RPE" is the RPE prescribed for the session. The RPE margin "target + 2" is the same for every level, First-timers included (approved).

### S — Safety

| ID | Condition | Decision | Explanation to athlete |
|---|---|---|---|
| S-1 ✓ approved | Pain ≥ 4/10, or pain in the same body area on 2 logs within 7 days | Remove movements that load that area for 7 days (via the limitations map); replace hard sessions in the next 3 days with easy or rest; ask a follow-up question | "You reported pain in X twice this week. We've removed movements that load it and eased the next 3 days. If it persists, check with a physio or coach." |
| S-2 ✓ approved | Pain ≥ 7/10, or described as sharp / stopped the session | Rest only until the athlete reports improvement; no prescribing for that area | Same, with a stronger recommendation to see a professional |
| S-3 ✓ approved | "Not feeling 100%" / illness flag | Next 2 days easy or rest; resume with A-3 rules if ≥ 7 days off | "Recover first. We'll ease you back in." |

Pain is recorded by **movement or body area, not diagnosis** (onboarding rule). The engine never names an injury.

### F — Fatigue

| ID | Condition | Decision |
|---|---|---|
| F-1 ✓ approved | Session RPE ≥ target + 2 on 2 of the last 3 hard sessions | Hold all progression |
| F-2 ✓ approved | Session RPE ≥ target + 2 on 3 of the last 4 hard sessions | Reduce next week's hard-session volume by 20% (fewer reps / rounds); ask about sleep and stress |
| F-3 ✓ approved | Easy-run average HR above the easy ceiling on 3 of the last 5 easy runs, at the same or slower pace | Hold progression; ask a clarification question (heat, illness, stress) |
| F-4 ✓ approved | HRV 7-day average below baseline by > 1 SD **and** resting HR above baseline, for ≥ 3 days | Swap the next hard session for an easy session; recheck in 2 days |
| F-5 ✓ approved | Fatigue or soreness ≥ 4/5 on 3 consecutive logs | Add a rest day in the next 3 days (replacing the lowest-priority session) |

### A — Adherence

| ID | Condition | Decision |
|---|---|---|
| A-1 ✓ approved | 1 missed session | Don't make it up. If it was a key session (threshold, compromised, simulation) and a non-adjacent day is free this week, move it; otherwise drop it |
| A-2 ✓ approved, changed | 2+ missed sessions in a week | Ask the athlete first whether they would like to pull back next week. If yes: keep the key sessions and trim total volume 10–20%. Either way, hold progression for that week. *Default, to confirm:* no answer within 48 h keeps the plan as written |
| A-3 ✓ approved, changed | 7–13 consecutive days missed | Notify the athlete and ask what is happening and how they want to resume: on vacation or taking time off (pause the plan, with a return date), or ready to resume (re-entry week at ~70% of planned volume, then the plan resumes). Athletes can also mark vacation or time off ahead of time. *Default, to confirm:* the check-in is sent after 4 days with nothing logged |
| A-4 ✓ approved | 14+ consecutive days missed | Reassess the block (decision 8) and ask the athlete; may push phases or lower goals |
| A-5 ✓ approved | Unplanned hard training logged | Counts toward the hard-day limit; move the next hard session if it would be back-to-back |

### P — Progression

| ID | Condition | Decision |
|---|---|---|
| P-1 ✓ approved | Threshold or race-pace session: all reps within the pace band (or ≤ 3% faster) at RPE ≤ target, on 2 consecutive sessions of that type, with no F flags | Progress the next one: add 1 rep **or** 2% faster pace, alternating |
| P-2 ✓ approved | Reps more than 3% faster than the band on 3 sessions | Trigger T-1 (pace recalculation) instead of piling on reps |
| P-3 ✓ approved | Missed the pace band on half or more of the reps, or RPE ≥ target + 2 | Repeat the session next time; if it happens twice, ease pace 2% or remove 1 rep |
| P-4 ✓ approved | Compromised run: station or substitute completed at prescribed volume, run splits within band, RPE ≤ target, on 2 sessions | Step station volume up 25% of race volume toward the level's ceiling (100%), for every level; once at 100%, progress run pace via P-1 |
| P-5 ✓ approved | Compromised run: later 1 km runs > 5% slower than the first | Hold station progression; keep the session as-is to build pacing |
| P-6 ✓ approved | Strength: all sets completed at prescribed load with ≥ 2 reps in reserve, on 2 sessions | +5% load lower body, +2.5% upper body |
| P-7 ✓ approved, changed | One station is consistently the slowest relative to the level's station-time estimate (≥ 3 logs) | "Weakest station" focus: add a short technique block for that station to station-endurance sessions **and** program it more often, so it appears in compromised runs or station work at least once every week until it is no longer the slowest. *Default, to confirm:* the extra exposure replaces a different station, so weekly station volume doesn't grow |

### T — Targets

| ID | Condition | Decision |
|---|---|---|
| T-1 ✓ approved | Valid benchmark faster than current fitness, or P-2 fired | Recalculate paces; apply at most 3% per week, the rest over following weeks |
| T-2 ✓ approved | Valid benchmark slower than current fitness | Apply only if confirmed by a second data point (another benchmark, or P-3 on 2 session types) and no illness flag |
| T-3 ✓ approved | Half or full simulation logged | Update the athlete's station-time estimates (used to set substitute durations) |

### B — Block and level

Level changes move the athlete between First-timer, Intermediate, Advanced and Competitive (D-004). They change session mix, hard days, volume ceilings and station progression. They never change the **division** (Open / Pro), which sets station weights and is the athlete's own choice.

| ID | Condition | Decision |
|---|---|---|
| B-1 ✓ approved | Race date changed | Regenerate phases from today, keeping history and current fitness |
| B-2 ✓ approved | Performance consistent with the next level up for ≥ 4 weeks | **Suggest** moving up; never automatic |
| B-3 ✓ approved | Equipment or limitations changed | Re-run substitutions (D-003, D-011) |
| B-4 ✓ approved | Athlete chooses to move down a level, at any time, based on how they're feeling | Apply from the next training week: lower volume ceiling, fewer hard days and the lower level's session mix; race date and current paces kept. Ask one optional question ("What's driving this?" — too hard / too much time / tired or run down / other) to shape the explanation. No diagnosis asked |
| B-5 ✓ approved | Engine sees the athlete struggling: F-2 fired in 2 of the last 3 weeks, **or** A-2 fired 2 weeks in a row, **or** P-3 fired on 2+ session types for 2 weeks | **Suggest** moving down a level, explaining why; never automatic. If declined, don't suggest again for 2 weeks unless S or F-2 fires |

After moving down, moving back up goes through B-2 (≥ 4 weeks of evidence), so an athlete doesn't bounce between levels week to week. An athlete can always move themselves up again; the plan then rebuilds within the normal guardrails (≤ 10% weekly volume increase).

### Q — Ask

| ID | Condition | Decision |
|---|---|---|
| Q-1 ✓ approved | A rule's data gate fails on a signal that matters (e.g., a key session with no RPE) | Ask one short question in the post-workout screen; no change until answered or 48 h pass |

## 7. Weekly review (athlete-facing)

Every week the athlete sees a review, even when nothing changes:

- **Checked:** sessions logged, data sources used.
- **Changed:** each applied decision — what, why, data used, what to do next.
- **Kept:** "No change to your plan because …" with the main reasons (e.g., paces on target, RPE in range, no pain reports).
- **Waiting on:** rules that couldn't run due to missing data, and how to fix it.

The review also carries any level suggestion (B-2 or B-5) and a standing "Adjust my level" option, so moving down never requires hunting through settings.

The week-1 review is the free-tier conversion moment (D-013): free athletes see the full review and a summary of the changes; the adjusted sessions unlock with a subscription.

**Safety rules are never paywalled.** A free athlete who reports pain gets the S-rule changes and advice.

## 8. Explanation contract

Every decision record (`adaptation_decisions`) stores: rule ID and version, applied or suppressed (and by which rule), before/after, the input data with sources and dates, and the athlete-facing text. Athlete-initiated level changes (B-4) are recorded the same way, with the athlete as the source. The LLM layer may rephrase the text; it may not change the decision, invent data or add changes (D-005 limits what data it sees).

## 9. Validation

Each rule gets unit tests at its threshold edges, plus synthetic athlete histories run through a full plan:

| Scenario | Expected |
|---|---|
| Consistently hits threshold reps easily | Progresses ≤ 1×/week, paces recalculated within caps |
| Rising RPE over 3 weeks | Progression held, then hard volume reduced |
| Two pain reports, same area | Movements removed for 7 days, hard days eased, physio suggested |
| Misses 10 days mid-build | Re-entry week, then resumes |
| One great workout, one bad night | **No change** |
| No heart-rate device | HR and recovery rules logged as not evaluated; RPE rules still work |
| Free athlete, pain in week 1 | Safety changes applied despite no subscription |
| Athlete moves down mid-build | Next week uses the lower level's mix and ceiling; race date, division and paces unchanged |
| Repeated F-2 over 3 weeks | Move-down suggested once; not repeated within 2 weeks after a decline |
| Moves down, then performs well | Move-up suggested only after ≥ 4 weeks (B-2) |

## 10. Approval log

| Date | Item | Decision |
|---|---|---|
| 2026-10-16 | RPE margin (target + 2) for all levels, First-timers included | Approved as drafted — F-1, F-2, P-3 |
| 2026-10-16 | P-1 progression: add a rep or 2% faster pace, alternating | Approved as drafted |
| 2026-10-16 | P-4 station volume step: 25% of race volume for every level | Approved as drafted |
| 2026-10-16 | Movements return 7 days after a pain report | Approved as drafted — S-1 |
| 2026-10-16 | Level changes in both directions; athletes may move down based on how they feel | Approved — B-2, B-4, B-5 added |
| 2026-10-16 | S-2, S-3, F-3–F-5, A-1, A-4, A-5, P-2, P-5, P-6, T-1–T-3, B-1, B-3, Q-1; all guardrails (§4) and data gates (§5) | Approved as drafted (review page) |
| 2026-10-16 | A-2 missed sessions | Changed: ask the athlete before trimming |
| 2026-10-16 | A-3 days off | Changed: notify the athlete and let them pause (vacation, time off) or choose how to resume |
| 2026-10-16 | P-7 weakest station | Changed: technique block plus more frequent exposure to that station |

All rules, guardrails and data gates are approved. Open: the three *default, to confirm* details in A-2, A-3 and P-7. A-3 needs push notifications and a pause/vacation feature in the app (Phase 4).
