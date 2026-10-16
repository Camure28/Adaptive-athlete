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
**Decision:** Expo SDK 57 (React Native 0.86, Expo Router; originally SDK 58 beta, see D-012) for iOS/Android, with web for previews; Supabase for auth and Postgres. pnpm workspace with hoisted node_modules, per Expo's monorepo guidance.
**Why:** Expo development builds support the native HealthKit access a browser app can't have; Supabase matches the Postgres + row-level-security design and has a free tier for development.
**Details:** Onboarding is saved through one database function (`save_hyrox_onboarding`) so a save is all-or-nothing and still subject to row-level security. Without Supabase settings the app runs in a labelled demo mode (nothing saved). Plans are generated on the device for preview only; server-side plan storage comes next.
**Status:** Accepted (product owner approved the stack 2026-10-15). Supabase project `adaptive-athlete` created by the product owner 2026-10-15 (Free plan); `supabase/setup.sql` applied; all 18 tables confirmed in the dashboard. App configured via git-ignored `apps/mobile/.env.local`.

## D-011 — Movement limitations affect station work (2026-10-15)
**Decision:** An avoided movement removes every substitute that involves it. If the real race station involves it, the plan uses the closest safe option and says why; if none exists, the plan prescribes nothing for that block and suggests checking with a physio or coach.
**Status:** Implemented (Claude), following the approved onboarding spec ("removes those exercises").

## D-012 — Stable Expo SDK and Xcode builds (2026-10-15)
**Decision:** Move the app from the Expo SDK 58 beta to SDK 57, the latest stable release (verified on expo.dev 2026-10-15). Run it on iPhones as a development build compiled with Xcode (`npx expo run:ios --device`) instead of Expo Go. Bundle ID `com.camure28.adaptiveathlete`.
**Why:** The project was started on the SDK 58 beta by mistake (Claude). The App Store Expo Go app does not run it, and native builds should not depend on beta software. A development build is also the path HealthKit needs later.
**Limits:** Builds signed with a free Apple ID expire after 7 days and can't be shared. TestFlight for pilot athletes needs the paid Apple Developer Program; decide before the gym pilot.
**Details:** `pnpm-workspace.yaml` pins four Expo peer packages to SDK 57; update them with the SDK.
**Status:** Accepted (product owner chose the Xcode route 2026-10-15).

## D-013 — Monetization: free assessment and first week, paid adaptation (2026-10-16)
**Decision:** The free tier is the assessment (onboarding), the full plan outline (phases, weekly volume, simulation dates), week 1 in full detail, workout logging, and the week-1 review. The subscription unlocks adaptation: the adjusted sessions and every later week. In the week-1 review, free athletes see what the engine found and a summary of what would change; the adjusted sessions unlock when they subscribe.
**Why:** A static plan can be copied (PDFs and cheap apps exist). A plan that responds to the athlete's own results can't be done by hand, so that is what athletes pay for. The first week proves the programming is credible; the week-1 review shows adaptation using the athlete's own data.
**Rules:** Safety rules (pain, illness) are never paywalled — a free athlete who reports pain gets the safety changes and advice. The weekly review shows "no change, because…" so quiet weeks still show the engine working.
**Open:** Prices (working figures ~$14.99/month or ~$99/year), a one-time race-block pass, and per-athlete gym licensing are to be tested during the gym pilot. The pilot itself is free. Payments tooling (e.g. RevenueCat) and an `entitlements` table are needed before launch, not now.
**Status:** Accepted (direction set by product owner 2026-10-16). Pricing proposed, not decided.

## D-014 — Adaptation rubric (2026-10-16)
**Decision:** Plan changes follow an explicit, versioned rule set in `docs/ADAPTATION_ENGINE.md`: rule groups Safety → Fatigue → Adherence → Progression → Targets → Block, with data-quality gates, weekly caps, conflict rules and an athlete-facing weekly review.
**Why:** The adaptation engine is the paid product (D-013). Rules must be conservative, explainable and editable by a coach, not decided ad hoc by code or an LLM.
**Status:** Approved by the product owner on 2026-10-16 (all rules, guardrails and data gates), with changes to A-2 (ask before trimming), A-3 (notify; pause or choose how to resume) and P-7 (more frequent exposure to the weakest station). Approval log in `docs/ADAPTATION_ENGINE.md` §10. Existing adaptation code in `packages/engine` is to be reconciled with the rubric.

## D-015 — Athletes can change level in both directions (2026-10-16)
**Decision:** Athletes can move themselves down a level at any time, based on how they're feeling; it applies from the next training week and keeps the race date, division and current paces. The engine may *suggest* moving down when the athlete is struggling (repeated fatigue, missed sessions or missed targets) or moving up after 4+ weeks of evidence, but never changes level on its own. A declined move-down suggestion isn't repeated for 2 weeks unless a safety or fatigue rule fires. Moving back up after moving down needs the same 4 weeks of evidence, to avoid bouncing between levels.
**Why:** How an athlete feels is real data the engine can't measure; letting them step down keeps them training instead of quitting, while the evidence requirement for moving up keeps the plan stable.
**Status:** Accepted (product owner 2026-10-16). Rules B-2, B-4, B-5 in `docs/ADAPTATION_ENGINE.md`.

## D-016 — Session variety (2026-10-16)
**Decision:** No session is repeated within a week and key sessions rotate formats week to week (threshold, race pace, compromised runs, station work, long runs, strides on easy runs). Strength is split into Day A (legs & push) and Day B (hinge & pull); exercises rotate every 3 weeks so lifts stay long enough to progress. Formats listed in `docs/HYROX_WEEK.md`.
**Why:** Product owner testing: the same workout appeared twice in a week and weeks repeated. Variety keeps athletes engaged and trains different qualities; rotating strength by 3-week block keeps progressive overload.
**Status:** Requested by product owner; formats are Claude's defaults awaiting coach review.

## D-017 — Typography and keyboard handling (2026-10-16)
**Decision:** Barlow Condensed for titles and Barlow for text (Google Fonts, bundled with the app). Sessions show three distinct voices: title, the work (semibold, with a coloured bar), and the explanation (regular, quieter). Text fields scroll into view above the keyboard.
**Status:** Requested by product owner; fonts and layout are Claude's choice, open to change in the design pass.

## D-018 — Training status sets where the plan starts (2026-10-16)
**Decision:** Onboarding asks "Where's your training right now?" with three answers. *Building up* (returning from a break or new to structured training): full base phase, as before. *Training consistently*: base phase shortened to 2 weeks. *Race-ready* (in a race block or raced in the last 8 weeks, hard sessions every week): no base phase; the plan starts in build, with compromised runs and station work at build level. A HYROX entered as raced in the last 8 weeks pre-selects Race-ready; the athlete can change it.
**Safety nets:** running volume still starts from what the athlete runs now and rises ≤ 10% a week; if early effort ratings come back too high, adaptation rules F-1/F-2 pull back (D-014). Athletes onboarded before this question are treated as Building up.
**Why:** Athletes racing back to back are already fit; restarting them with weeks of easy base wastes their training and their trust.
**Status:** Accepted (product owner 2026-10-16). The 2-week base for "Training consistently" is Claude's default, awaiting coach review. Needs migration `20261016000004_training_status.sql` applied to the live Supabase project.

