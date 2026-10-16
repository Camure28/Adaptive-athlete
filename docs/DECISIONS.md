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
**Decision:** Athletes first choose a setup type (Home, CrossFit gym, Commercial gym, HYROX Training Club, or a combination). Each gym type pre-ticks its typical equipment; the athlete corrects the checklist. The plan uses the real station where available. Otherwise it recommends the highest coach-ranked substitute the athlete has equipment for, while still showing the other available options for the athlete to choose; the choice is logged. Race-specific substitutes are used in HYROX-specific sessions; strength-support substitutes go in strength sessions. Athletes can change the checklist at any time.
**Why:** Most gyms are not fully HYROX-equipped; a plan that assumes a sled the athlete doesn't have is unusable.
**Status:** Accepted. Substitutions, coach ratings (Best/Good/Fallback/Don't use) and presets set by product owner 2026-10-15. Catalog in `docs/HYROX_EQUIPMENT.md`.

## D-004 — All athlete levels supported (2026-10-15)
**Decision:** Plans support first-timers through competitive athletes. Level adjusts volume, intensity, number of hard sessions, and station progression.
**Levels:** First-timer (no HYROX finish yet), Intermediate (has finished one or more), Advanced (racing for time or age-group places), Competitive (Pro division, Worlds qualification). The athlete picks a starting level; benchmarks and logged sessions refine it. Division (Open/Pro) is a separate choice and sets station weights.
**Status:** Accepted.

## D-005 — Provider data never reaches the LLM without a terms review (2026-10-15)
**Decision:** Only sources listed in `LLM_ELIGIBLE_SOURCES` (currently manual entry, file import, engine output) may be sent to an AI model. Others are added only after their current terms are reviewed and recorded here.
**Why:** Strava's API policy (effective 2026-06-01) prohibits sending its data to AI models; other providers have their own conditions.
**Status:** Accepted (proposed by Claude, implemented in `packages/engine/src/explain/llm-context.ts`).

## D-006 — HYROX onboarding flow (2026-10-15)
**Decision:** Seven screens: race, experience, running, schedule, equipment, limitations, review. Details in `docs/ONBOARDING.md`.
**Status:** Accepted.

## D-007 — Units (2026-10-15)
**Decision:** Miles by default, with a setting to switch to kilometres. HYROX race segments keep their official 1 km label.
**Status:** Accepted.

## D-008 — Target finish time (2026-10-15)
**Decision:** Recorded at onboarding but not used to change the plan yet. Later it drives pacing guidance once it can be checked against the athlete's benchmarks.
**Status:** Accepted (Claude's recommendation).

## D-009 — Sport focus selector (future) (2026-10-15)
**Decision:** The app will eventually start with a focus choice (HYROX, running, other). For now the app is HYROX-only and the selector is not shown.
**Why it's cheap later:** the engine already keeps sports separate — the running plan generator and the HYROX generator share pace math and adaptation rules, and plan goals are typed by kind (`race` vs `hyrox`). Adding a focus means adding a generator, not restructuring.
**Status:** Noted for later.

## D-010 — App stack (2026-10-15)
**Decision:** Expo SDK 58 (React Native 0.88, Expo Router) for iOS/Android, with web for previews; Supabase for auth and Postgres. pnpm workspace with hoisted node_modules, per Expo's monorepo guidance.
**Why:** Expo development builds support the native HealthKit access a browser app can't have; Supabase matches the Postgres + row-level-security design and has a free tier for development.
**Details:** Onboarding is saved through one database function (`save_hyrox_onboarding`) so a save is all-or-nothing and still subject to row-level security. Without Supabase settings the app runs in a labelled demo mode (nothing saved). Plans are generated on the device for preview only; server-side plan storage comes next.
**Status:** Accepted (product owner approved the stack 2026-10-15). Supabase project `adaptive-athlete` created by the product owner 2026-10-15 (Free plan); `supabase/setup.sql` applied; all 18 tables confirmed in the dashboard. App configured via git-ignored `apps/mobile/.env.local`.

## D-011 — Movement limitations affect station work (2026-10-15)
**Decision:** An avoided movement removes every substitute that involves it. If the real race station involves it, the plan uses the closest safe option and says why; if none exists, the plan prescribes nothing for that block and suggests checking with a physio or coach.
**Status:** Implemented (Claude), following the approved onboarding spec ("removes those exercises").
