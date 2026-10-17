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

## D-019 — Race search and past results at sign-up (2026-10-16)
**Decision:** At sign-up athletes search a list of upcoming HYROX races by city or name, pick theirs, and choose their race day; "My race isn't listed" falls back to typing the date. For past results, the "find my results by name" search is built behind a switch (`apps/mobile/src/data/results.ts`) and stays off until HYROX grants data access; until then athletes enter their finish time with optional run and station splits. No screenshot import (product owner).
**Why:** HYROX's terms forbid automatically copying results or event data from their sites without permission (`docs/INTEGRATIONS.md`). The product owner is requesting a partnership and data licence from HYROX; the screens are ready to switch to official data when it's granted.
**Race list:** maintained by us by hand from public announcements (table `hyrox_events`, migration `20261016000005_hyrox_events.sql`), each row with its source and marked unverified until checked against HYROX's announcement. Athletes can read it; only the SQL Editor (service role) can change it. Seeded with 37 events from October 2026 to June 2027.
**Status:** Accepted (product owner 2026-10-16). Licence request pending.

## D-020 — Visual direction: dark cockpit, signal yellow (2026-10-16)
**Decision:** The app moves to a single dark theme: near-black surfaces, signal yellow (#FFC400) for actions, selection, progress and live figures, cool greys for secondary text, red only for pain and safety. Type: Barlow Condensed (uppercase headings), Barlow (text), JetBrains Mono (readouts and labels). Loading screens use a framed scanner with real status lines (no fake percentages). The plan screen opens with a personal banner: level, division and training status; race and countdown; week-of-plan strip; this week's sessions, hard sessions, run volume and time; race-effort pace (only when a benchmark supports it, labelled as an estimate); full simulations; next session.
**Why:** Product owner wants a futuristic, elite-athlete feel and quick key stats. Supersedes the colour part of D-017.
**Note:** HYROX's own brand is also black and yellow. Since we aren't affiliated, keep our name, logo and wording clearly our own, and don't use HYROX logos, to avoid looking official. Revisit if HYROX partnership talks go ahead.
**Status:** Accepted (product owner 2026-10-16); exact colours and fonts are Claude's choices, open to change.

## D-021 — Account menu and calendar view (2026-10-16)
**Decision:** The plan screen keeps only the dashboard and the plan; everything else moves to an Account menu (top-right button): email, Edit my answers, current plan (Pilot · free), Export my data (shares everything we store, via the existing `export_my_data` function), and Sign out. Change subscription, Manage billing and Delete my account are listed but marked "Soon" and can't be tapped until they exist. The plan can be viewed as a list of weeks or as a month calendar (Monday first) with session marks (HYROX, hard run, easy run, strength); tapping a day shows its sessions.
**Before launch:** Apple requires apps that let people create accounts to also let them delete their account in the app, so "Delete my account" must be built before App Store submission. Subscriptions (D-013) need in-app purchase set up; billing then lives in the athlete's App Store account.
**Status:** Accepted (product owner 2026-10-16).


## D-022 — Plans are saved on the server as immutable versions (2026-10-16)
**Decision:** A Supabase Edge Function, `generate-plan`, builds the plan from the athlete's *saved* answers (never from what the app sends) and stores it through `record_plan_version`, which only the server can call. Version 1 is created when onboarding is finished; saving edited answers creates the next version ("regenerated"); adaptation will add later versions. Earlier versions are never changed. The app shows the current version and no longer rebuilds the plan each time it opens, so the plan stays put from day to day. Demo mode still builds on the phone.
**Mid-week changes (product owner):** a new version keeps this week's sessions exactly as they were (through Sunday) and the rebuilt plan takes over from next Monday.
**Why:** adaptation (the paid product, D-013) needs a trustworthy history of what was prescribed and when. Keeping plan writes on the server means an athlete can't save a made-up plan, matching the security model (`SECURITY.md`).
**Details:** each version records the engine version, the exact engine inputs, the weeks and every session (`DATA_MODEL.md`). A session's `workout_key` (date and session type) stays the same across versions; with the plan id it rebuilds the session id the import matcher uses. The engine is bundled into the function by `pnpm functions:build`; the function uses the project's secret key, which Supabase provides to Edge Functions and which is never in the app or the repo.
**Later:** when the paywall arrives (D-013), weeks an athlete hasn't unlocked must be withheld on the server, since athletes can read every stored week.
**Status:** Accepted (product owner approved the approach and the mid-week rule 2026-10-16). Migration `20261016000006_plan_storage.sql` and the function deploy are applied from Cameron's Mac.

## D-023 — Apple Health is the first automatic workout import (2026-10-16)
**Decision:** Workouts are imported automatically through Apple Health first; it also carries Garmin Connect and Strava workouts that those apps write to it. The import logic is built now, before buying the Apple Developer Program, so it can be switched on as soon as the membership exists. No direct Garmin (new API access paused) or Strava (capped, and bans AI use, D-005) connection is planned for now.
**Details:** `docs/INTEGRATIONS.md`, "Automatic workout import"; pipeline in `packages/engine/src/imports/`. `apple_health` stays out of `LLM_ELIGIBLE_SOURCES` until Apple's HealthKit rules are reviewed.
**Status:** Accepted (product owner 2026-10-16, claude.ai Project chat). Number assigned by Claude Code, as that chat asked.

## D-024 — Adaptation code follows the approved rubric; pain map, 1–5 scale, load spike (2026-10-16)
**Decision:** The adaptation engine is rebuilt rule by rule from `ADAPTATION_ENGINE.md` (rule ids S-1 … T-2 in the code). The product owner also decided:
- **Pain map (S-1):** knee removes deep knee bends, jumping and downhill running. Lower back or hip removes heavy hinging. Shoulder, elbow or wrist removes overhead work. Foot, ankle, shin or calf removes jumping and makes running easy only. Other areas: the athlete is asked where. Movements come back after 7 days.
- **Fatigue and soreness are logged as 1–5 taps** (1 = fresh, 5 = very fatigued or sore); pain stays 0–10 with a body area; RPE stays 0–10. The logging screen (step 6) uses these scales.
- **The load-spike rule stays**, as F-6: if the last 7 days' load is more than 1.5× the 4-week average, easy and long runs are trimmed 15% for a week.
**Not built yet:** P-4 to P-7 and T-3 need the station and strength data from step 6 logging; B rules need the level-change screens. Interpretations of rubric wording are listed in `ADAPTATION_ENGINE.md` §11 for coach review.
**Status:** Accepted (product owner 2026-10-16, claude.ai Project chat).

## D-025 — Manual workout logging (2026-10-16)
**Decision:** Athletes log each planned session from the plan (sessions dated today or earlier): done, partly done or skipped; time (prefilled from the plan); distance for runs; effort (RPE 0–10); "Did anything hurt?" with level (1–10), body area, "was it sharp?", "did it make you stop?" and "did it change how you moved?"; fatigue and soreness (1–5, optional); and a note. Effort and the pain answer are required for a session that was done; a skipped session needs only the status. Station splits and per-rep paces come later. "Not feeling 100%" (rule S-3) waits for a daily check-in.
**Scales (product owner):** fatigue and soreness are 1–5, matching rule F-5 ("≥ 4/5"); RPE and pain stay 0–10.
**Body areas:** foot/ankle, calf/shin, knee, thigh/hamstring, hip/glute, lower back, upper back/neck, shoulder, elbow/wrist/hand, other. Body areas, not diagnoses (S-1). Default list chosen by the product owner, awaiting coach review. Each maps to a group in the approved pain map (D-024): foot/ankle and calf/shin → foot, ankle or lower leg; knee → knee; hip/glute and lower back → lower back or hip; shoulder and elbow/wrist/hand → shoulder or arm; thigh/hamstring, upper back/neck and other → other (hard days still eased, no movements removed until the coach sets them). The athlete's exact choice is stored; the engine reads the group (`PAIN_GROUP`).
**Storage:** logs go into `completed_workouts` in the same shape as imports (the engine's `CompletedWorkout`), linked to the planned session by `plan_id` + `workout_key`, which stays the same across plan versions. One log per planned session; logging again edits it. Athletes write their own logs (they are inputs), protected by row-level security. Migration `20261016000007_workout_logging.sql` also adds the import columns from `INTEGRATIONS.md` (start/end time, origin app, device, elevation, energy).
**Not yet:** logs don't change the plan until adaptation is built into the app. The pain screen shows a safety note (sharp, worsening or movement-changing pain: rest it and see a physio or coach), Claude's wording, awaiting coach review.
**Status:** Accepted (product owner chose the form, scales, body areas and deferring S-3 on 2026-10-16; the area mapping and the sharp / stopped questions for S-2 later the same day). Numbered D-025 because the adaptation chat's decision took D-024 first.
**Addition (product owner, 2026-10-16):** "Log other workout" on the plan screen logs training that wasn't in the plan: the athlete picks the day (today or up to 13 days back) and the kind (run, HYROX or mixed, strength, bike, row, swim, something else); it's always logged as done, with the same time, distance (runs, rides, rows, swims), effort and pain questions. It has no planned session, so it counts toward load and pain rules, and an extra hard session (effort ≥ 7) can move the next day's hard session (rule A-5).

## D-026 — The plan adapts on the server after every log (2026-10-16)
**Decision:** After a session is logged, the app shows the weekly review. Opening it runs a new Edge Function, `adapt-plan`, which reads the current plan version, the last 60 days of logs, answers, recovery data and run results from the database (never from the request) and runs the adaptation engine (D-024). If anything changed, a new plan version (`adapted`) is saved with every applied and suppressed decision in `adaptation_decisions`; every run saves its review (`plan_reviews`). The review shows what was checked, what changed and why, why everything else stayed, what's waiting on data, and the engine's questions with tap-to-answer options. Answering saves the reply (`athlete_answers`) and runs adaptation again.
**Safeguards:** only the server can save versions, decisions and reviews (`record_adaptation`, service role only); a run based on an outdated version is rejected and re-run on the newer one; re-running on the plan's own output changes nothing (engine fix, see `ADAPTATION_ENGINE.md` §11); a run that changes nothing stores only its review, so the history isn't filled with duplicates; a question answered in the last 2 days isn't asked again. If nothing has changed since the latest review (same day, same plan version, no new or edited logs, answers, recovery data or results), `adapt-plan` returns that review instead of running again (added after a loop in the app called it ~3 times a second on 2026-10-16 and stored 261 duplicate reviews).
**Paywall:** D-013 makes adaptation paid, but the pilot is free and there are no subscriptions yet, so every athlete gets every rule. Before launch the server must limit non-safety rules to subscribers; safety rules are never paywalled.
**Awaiting coach review:** the answer options and how follow-up answers are read (`apps/mobile/src/logging/questions.ts`, `ADAPTATION_ENGINE.md` §11).
**Status:** Accepted (product owner approved the approach and the engine fix 2026-10-16). Migration `20261016000008_adaptation_runs.sql`; functions deployed by Cameron with `pnpm functions:deploy`.

## D-027 — Calmer, rounded visual style (2026-10-16)
**Decision:** The app keeps every feature and its black-and-yellow identity but drops the "cockpit" look of D-020 for a calmer one, after the product owner shared a mobility app he likes as a reference for feel (not to copy):
- **Type:** one friendly geometric typeface (Outfit) in sentence case everywhere. No all-caps, condensed or monospace text.
- **Surfaces:** a slate-ink background (#12151B) and borderless, rounded, tone-on-tone cards (radius 20–24); pill-shaped buttons and chips.
- **Colour:** yellow is kept for actions, selection and progress only. Session types are small coloured dots: HYROX yellow, hard run orange, easy run mint, strength lavender.
- **Plan screen:** race name with level/division/status chips; a progress ring (weeks through the plan) around the days-to-go countdown; soft 2×2 stat tiles; a "next up" card; secondary actions as two side-by-side pills; weeks as cards with a chevron; sessions with a coloured badge and plain-language meta.
- **Loading screens:** a calm spinning arc with one plain status line, replacing the scanner and corner brackets.
**Why:** The product owner found the cockpit style robotic and cluttered and wanted a smoother, less busy feel. Supersedes the visual part of D-020 (colours, fonts, loaders); D-020's dashboard content stays.
**Status:** Built 2026-10-16 (claude.ai Project chat), app only; awaiting the product owner's review on the phone.

## D-028 — Bottom tabs: Home, Training, Profile (2026-10-16)
**Decision:** The signed-in app uses a bottom tab bar, as social and fitness apps do:
- **Home** opens on today: today's session with a one-tap Log button and "See the workout", or a rest-day / plan-starts card with what's next. Below that: this week as a strip of days (session dots, a tick once logged, today highlighted), the countdown ring with the week's figures, Recent workouts / Log other workout, the review button and plan notes.
- **Training** has the whole plan as weeks or a calendar, opening on the current week.
- **Profile** has the account menu (formerly a separate screen), with the race, level, division and status at the top.

Logging, the review, recent workouts and onboarding open over the tabs. The plan loads once for all tabs and reloads after the answers are edited.
**Leaderboard:** added as a fourth tab (D-029).
**Status:** Accepted (product owner 2026-10-16); built the same day, awaiting his phone check. The tab icons are drawn in code (no icon package).

## D-029 — Opt-in consistency leaderboard: gym and worldwide (2026-10-16)
**Decision:** A Leaderboard tab where athletes can opt in under a nickname and compare consistency with their gym or with everyone.
- **What's ranked:** how much of their own plan they completed (partial sessions count half; rest days excluded), then days trained (any logged training), then sessions logged. Windows: this week (7 days) or 4 weeks. Measuring against each athlete's own plan lets every level compete fairly and rewards showing up, not speed.
- **Privacy:** opt-in only, with a nickname (unique; the app suggests not using your full name). Others see the nickname and those three figures, nothing else. You must opt in to view. Leaving takes you off every board at once, and leaving the leaderboard keeps your nickname private.
- **Gyms:** a coach or owner creates a gym and gets a 6-character code to share; athletes join with the code. One gym per athlete; up to 3 gyms created per athlete. The gym board shows only members.
**Why:** The product owner wants a social, motivating element. Ranking consistency rather than performance supports adherence, which drives results, without pushing anyone to overtrain.
**Status:** Accepted (product owner 2026-10-16). Migration `20261016000009_leaderboard.sql` written and tested locally (22 checks); **push pending** (Cameron, with `db push`).

## D-030 — Workout breakdown with equipment and movement rows (2026-10-16)
**Decision:** Each session's details read like a coach's whiteboard, after a reference app the product owner shared (layout idea only; nothing copied). No Start button.
- **Equipment row:** a tile for each piece of equipment the session uses, picked from the athlete's own checklist when a movement could use several things.
- **Numbered blocks:** 1 Warm-up, 2 Main set / The run / Strength, 3 Cool-down.
- **One row per movement:** a round icon of what you use, the movement name, the exact dose ("4 × 1 km at 7:45–8:00/mi", "3 × 10, controlled tempo", "2:45 of hard work, replaces 500 m of SkiErg"), rest as a quiet line, and alternatives after "⇄ Or:".
- **Then "Why" and "Make it easier".**
**Images:** the equipment icons are original line drawings made for this app (`apps/mobile/assets/equipment/`, 18 icons). Photos or short clips of each movement would be better. Proposed: shoot them at the product owner's gym (we can't use other apps' images). The movement rows are built so photos can replace the icons later.
**Code:** `sessionEquipment` / `stepGear` in the engine (`hyrox/session-equipment.ts`, tested), and `SessionDetails` / `Movement` in `components/plan.tsx`.
**Status:** Requested by the product owner 2026-10-16; built the same day, awaiting his phone check.


## D-031 — Tester readiness: account deletion, privacy policy, feedback (2026-10-16)
**Decision:** Before anyone else uses the app, it gets the basics testers and the App Store expect, in the order agreed in `ROADMAP.md`.
- **Delete my account** (Profile): explains what is deleted, offers the data export first, and asks the athlete to type DELETE. It runs `delete_my_account()`, which deletes only the caller's own login; the existing cascade removes all their data, history included. A gym they created stays for its members. Migration `20261017000010_account_deletion.sql`, tested in `supabase/tests/account_deletion_test.sql`.
- **Privacy policy:** a pilot draft written from the app's real data flows (what we collect, why, who handles it, export and deletion, adults 18+, not medical advice). It is shown in the app (Profile, and a link on sign-in) and kept in `docs/PRIVACY_POLICY.md` for the website. Not legal advice; reviewed before public launch.
- **Send feedback** (Profile): opens an email to a support address with the app version filled in. The address is a setting (`EXPO_PUBLIC_SUPPORT_EMAIL`), never a personal email by default; until it's set the row shows "Soon".
**Status:** Order of work agreed by the product owner 2026-10-16; built the same day. **Open (product owner):** the support email address, a public URL for the policy, confirming the 18+ age line, choosing the app icon, pushing the migration.

## D-032 — App name "Adapt" and the A icon (2026-10-16)
**Decision:** The app is called **Adapt** (shorter than "Adaptive Athlete"; "adapting" is what sets the product apart). The icon is a rounded yellow A on slate ink with a white upward chevron as its crossbar (draft A of six shown).
- **Changed:** the home-screen name (`app.json` `name`), the icon for iPhone, Android and web, and every place athletes see the name (sign-in, loader, Profile, privacy policy, consent line, shares, feedback subject). The bundle ID, URL scheme, repo and code names stay "adaptive-athlete", so nothing breaks.
- **Name check (web search 2026-10-16):** "Adapt" is a crowded word in fitness. The App Store already has "Adapt Performance & Training", "Adapt Fitness" and "AI Fitness Trainer: Adapt". App Store names must be unique, so the store listing will need a longer name, such as "Adapt: Hybrid Race Training". The product owner should have a trademark check done before spending on branding. HYROX's name is never used in the app name or keywords.
**Status:** Chosen by the product owner 2026-10-16. Name and icon show on the phone after the next native rebuild.
