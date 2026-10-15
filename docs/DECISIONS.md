# Product & Architecture Decisions

Each entry: date, decision, reason, status. Decided by the product owner (Cameron) unless noted.

## D-001 — First target athlete: HYROX (2026-10-15)
**Decision:** The MVP serves HYROX athletes. Road-race plans (5K–marathon) stay in the engine as the running component but are not the primary product.
**Why:** Product owner's focus; HYROX athletes need running + station + strength programming in one plan, which is the product's differentiator.
**Status:** Accepted.

## D-002 — Divisions: Singles only (2026-10-15)
**Decision:** MVP supports Singles, Open and Pro divisions, women and men. No Doubles or Relay. Adaptive divisions are out of scope until specialist input is available.
**Why:** Doubles/Relay split the work between partners, which changes programming substantially.
**Reference:** HYROX 26/27 Singles Rulebook (verified 2026-10-15): 8 × (1 km run + station) — SkiErg 1,000 m, Sled Push 50 m, Sled Pull 50 m, Burpee Broad Jump 80 m, Row 1,000 m, Farmers Carry 200 m, Sandbag Lunges 100 m, Wall Balls 100. Weights vary by division and sex; store them as versioned data per season, not hard-coded logic.
**Status:** Accepted.

## D-003 — Equipment checklist drives programming (2026-10-15)
**Decision:** Athletes first choose a setup type (Gym, Home, or Both), then tick the equipment they can access. The plan uses the real station where available, otherwise the first substitution in a coach-ordered list whose equipment is ticked. Race-specific substitutes are used in HYROX-specific sessions; strength-support substitutes go in strength sessions. Athletes can change the checklist at any time.
**Why:** Most gyms are not fully HYROX-equipped; a plan that assumes a sled the athlete doesn't have is unusable.
**Status:** Accepted. Sled push/pull substitutions provided by product owner. Catalog in `docs/HYROX_EQUIPMENT.md`; other stations still in draft.

## D-004 — All athlete levels supported (2026-10-15)
**Decision:** Plans support first-timers through competitive athletes. Level adjusts volume, intensity, number of hard sessions, and station progression.
**Levels:** First-timer (no HYROX finish yet), Intermediate (has finished one or more), Advanced (racing for time or age-group places), Competitive (Pro division, Worlds qualification). The athlete picks a starting level; benchmarks and logged sessions refine it. Division (Open/Pro) is a separate choice and sets station weights.
**Status:** Accepted.

## D-005 — Provider data never reaches the LLM without a terms review (2026-10-15)
**Decision:** Only sources listed in `LLM_ELIGIBLE_SOURCES` (currently manual entry, file import, engine output) may be sent to an AI model. Others are added only after their current terms are reviewed and recorded here.
**Why:** Strava's API policy (effective 2026-06-01) prohibits sending its data to AI models; other providers have their own conditions.
**Status:** Accepted (proposed by Claude, implemented in `packages/engine/src/explain/llm-context.ts`).
