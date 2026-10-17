# Progress log

The shared memory between every Claude session on this project: chats in the claude.ai Project, Claude Code on Cameron's Mac, and the daily review. Newest entry first. Each session adds one entry before it ends.

Format: date, where the work happened, what changed, what's open. Decisions go in `DECISIONS.md`, not here; link them by number.

---

## 2026-10-16 — claude.ai Project chat (workout breakdown)
- **Done (D-030):** session details now show an Equipment row (icon tiles), numbered blocks (Warm-up / Main set / Cool-down) and one row per movement: round equipment icon, name, exact dose, rest, and alternatives. This applies everywhere a session opens: Home ("See the workout"), Training and the calendar.
  - **Icons:** 18 original equipment line icons, drawn and rendered for this app (`assets/equipment/*.png`; source script not kept in the repo; redraw with any SVG tool).
  - **Engine:** `sessionEquipment` / `stepGear` with 4 tests.
  - **Types:** `src/types/assets.d.ts` declares PNG imports, because `expo-env.d.ts` is git-ignored.
  - **Install:** app only; reload, no new packages.
- **Open:** movement photos or clips (suggested: shoot at Cameron's gym) to replace the icons in movement rows.

## 2026-10-16 — claude.ai Project chat (leaderboard)
- **Done (D-029):**
  - **Screen:** a Leaderboard tab between Training and Profile. It has an opt-in screen with a nickname and a plain list of what others see and never see; gym / worldwide and this week / 4 weeks switches; your row highlighted; join a gym by code or create one (coach); and settings to rename, share the gym code, leave the gym or leave the leaderboard.
  - **Database:** migration `20261016000009_leaderboard.sql` adds the `gyms` and `leaderboard_profiles` tables and the functions `create_gym`, `join_gym`, `leave_gym` and `leaderboard`. The data export includes the leaderboard profile and gym.
  - **Tests:** 22 new database checks in `supabase/tests/leaderboard_test.sql`. The test runner now gives each `*_test.sql` file a fresh database.
  - **Demo mode:** shows only you, and says so.
- **Checked:** all security tests pass on a local Postgres 16 in this session; typecheck, lint, 261 engine and 39 app tests pass; web preview of the join, board, gym setup and settings screens.
- **Open (Cameron):** `npx supabase db push --dry-run`, then `npx supabase db push` (one new migration, no function deploy). Then `git pull` and reload the app. Create your gym from the Leaderboard tab and share the code.

## 2026-10-17 — daily review
- **Tests:** all pass. Typecheck and lint clean; 261 engine and 39 app tests; `pnpm db:test` 84 checks, all passed (run on a local Postgres 16 in the cloud review).
- **Sync:** repo and Project compared doc by doc. `DECISIONS.md` (D-001–D-028), `PROGRESS.md`, `CLAUDE.md`, `HYROX_WEEK.md`, `HYROX_EQUIPMENT.md`, `ONBOARDING.md`, `RELEASE.md` and the sample plans already matched. The Project copies of `ADAPTATION_ENGINE.md` (§11 missing the two D-026 notes), `DATA_MODEL.md`, `SECURITY.md`, `SETUP_SUPABASE.md` (still said "paste SQL" / "Not yet") and `INTEGRATIONS.md` were older repo versions with nothing of their own, so they were refreshed from the repo. `GTM_RESEARCH.md` existed only in the Project and is now `docs/GTM_RESEARCH.md`. No conflicts, no duplicate decision numbers.
- **Reviewed:** the 34 commits of 2026-10-16. No secrets or real athlete data (only `.env.example` and env-var names). Approved-rule tests only gained tests, except one deliberate loosening in `35a71cd`: "strength sessions carry pulldowns" now applies to Day B only, which follows the D-016 A/B split. Coaching defaults are marked as awaiting coach review.
- **Issues:**
  - The D-028 commit (`664d585`) also contains engine work that isn't recorded anywhere: an athlete-chosen plan start day (`planStartDate`, `placeShortFirstWeek`, `test/plan-start.test.ts`). The code says "approved by the product owner 2026-10-16", but there's no decision or progress entry. It reads a `plan_start_date` column from "migration 20261016000009", and that migration isn't in the repo. Nothing breaks without it (no start date means next Monday, as before), but the feature is half-landed. The next building session should record the decision and add the migration and onboarding question, or say where they are.
  - Minor: in `docs/samples/HYROX_SAMPLE_PLANS.md` strides show as "6 × 0 min" (20 s rounded to minutes by the sample script). The app itself shows "20 s".
- **Waiting on Cameron:** `pnpm functions:deploy` for the impossible-time fix (then re-enter the benchmark with hours); phone check of D-027 style and D-028 tabs (Home with a session today from Mon Oct 19); coach review of session formats (D-016), "Training consistently" 2-week base (D-018), body areas and pain safety wording (D-025), follow-up answer options (D-026), the rubric's three "default, to confirm" details (A-2, A-3, P-7); the leaderboard question; the GTM open questions (athletes vs gyms, positioning against Repz).

## 2026-10-16 — claude.ai Project chat (step 8: Today screen and bottom tabs)
- **Done (D-028):** bottom tab bar with Home (today first), Training (weeks and calendar) and Profile (the account menu plus race and level). New routes `app/(tabs)/` (`_layout.tsx` loads the plan for all tabs and draws the tab bar; `home.tsx`, `training.tsx`, `profile.tsx`). `app/plan.tsx` and `app/account.tsx` were removed, and their parts moved to `components/plan.tsx` (`RaceHeader`, `Countdown`, `StatGrid`, `Week`, `Session`, `SessionDetails`, `Calendar`). Tab icons are in `components/icons.tsx`, drawn with views. After editing answers, the session's `bumpPlan()` reloads the plan and onboarding returns to Home. All routes now point to `/home`. App only: reload, no rebuild.
- **Checked:** web preview of Home (plan not started yet), Training and Profile. Home with a session today hasn't been seen yet; Cameron's plan starts Mon Oct 19.
- **Open:** leaderboard: what to rank and who sees it (product owner to decide). Then the pre-tester checklist or HYROX logging detail.

## 2026-10-16 — claude.ai Project chat (time entry instructions)
- **Done (Cameron's request):** every finish-time field in onboarding says how to type it and reads back what it understood. Covers the target time, past HYROX time, benchmark and splits.
  - **Labels:** each field now has one, such as "Finish time (h:mm:ss)" next to "Race date".
  - **Format help:** set per distance. The half marathon gets "Hours:minutes:seconds, like 1:55:00"; 5K and 10K get "Minutes:seconds, like 24:30. Over an hour? Add hours".
  - **Example times:** set per distance.
  - **Live read-back:** "Reads as 1 h 30 min". Impossible times show in red as you type ("Faster than the world record. Add hours?").
  - **Code:** `TimeField` in `onboarding/steps.tsx` and `readTime` in `model.ts`, tested. App only: a reload is enough.

## 2026-10-16 — claude.ai Project chat (impossible benchmark times)
- **Bug (found by Cameron on the phone):** race effort showed "0:13–0:13 /mi" and 112 mi of running in a week. Cause: a benchmark time that can't be real, almost certainly hours typed as minutes ("1:30" for a 1 h 30 min half marathon reads as 90 seconds). The engine trusted it, so paces and distances came out absurd.
- **Fix:** the engine rejects any result faster than world-record speed or slower than walking pace (`implausibleRaceTime`); such a result gets 0 confidence, so the plan stays effort-based (RPE). Onboarding now catches these when they're entered, for the running benchmark, past HYROX time and target time ("include hours, like 1:45:00"). Tests in `performance.test.ts` and `model.test.ts`.
- **Open (Cameron):** `pnpm functions:deploy` so the server builds plans with the fix. Then in the app go to Account, Edit my answers, re-enter the benchmark with hours, and save to get a corrected plan.

## 2026-10-16 — claude.ai Project chat (design pass)
- **Done:** a calmer, rounded visual style (D-027). Look and styling only; no feature, data or engine changes. Outfit replaces the Barlow and JetBrains Mono fonts, and those font packages are removed. New tokens are in `lib/theme.ts`, including `kind` colours for session types. The shared components are restyled: pill buttons, a new `soft` button, borderless choices and fields, a smooth progress bar, and dot callouts. New `Ring` (progress ring drawn with plain views, so no native rebuild) and `Dot` components. The loader is a calm spinning arc. The plan dashboard, calendar, week and session rows, and account screen are restyled, and all loader copy is sentence case. Checked in the web preview (onboarding, plan, calendar, account, log). The ring was checked at 62% progress.
- **Open (Cameron):** `git pull`, restart `npx expo start`, and look at it on the phone. A reload is enough, no rebuild needed. Coach feedback on the session dot colours is welcome.

## 2026-10-16 — claude.ai Project chat (release and TestFlight setup)
- **Done:** the app can run on Cameron's iPhone without the Mac: `pnpm ios:release` installs a Release build with the code inside (free Apple ID, still 7 days). TestFlight is ready to switch on: `apps/mobile/eas.json` (development, preview and production profiles, each with its own EAS environment), `pnpm testflight` (cloud build and upload), and the export-compliance flag in `app.json` (HTTPS only). Steps, tester invites and a pre-tester checklist are in `docs/RELEASE.md`. Commands are checked against Expo's docs. Not run yet: release builds need the Mac.
- **Open (Cameron):** try `pnpm ios:release` with the phone plugged in. When ready: Apple Developer Program, Expo account, `eas init`, two `eas env:set` commands (`RELEASE.md` §2). Before testers: the checklist in `RELEASE.md` §3 (email confirmation, privacy policy, account deletion, feedback link, real icon).

## 2026-10-16 — Claude Code on Cameron's Mac (review loop fix)
- **Bug (found by Cameron on the phone):** after logging, the review screen called `adapt-plan` about 3 times a second (session helpers changed identity on every render and the screen's effect depended on them), so it looked stuck and stored 261 duplicate "no change" reviews. Fixed in the app (`d1499b8`): stable helpers, one run per visit.
- **Safeguard:** `adapt-plan` returns the latest review when nothing has changed since (`reviewStillCurrent`, tested), so a bug in the app can't flood the history again. Needs `pnpm functions:deploy` (Cameron).
- **Cleanup (done):** Cameron deleted the duplicate reviews (Claude Code's safety check blocks deletes on the live database); left: 1 review, 2 plan versions, 1 log, 1 answer. Safeguard deployed (`adapt-plan` v2).
- **Verified by Cameron on the phone:** log with pain → plan adapted to version 2 → follow-up question → answered "improving" → one re-run, question cleared.

## 2026-10-16 — Claude Code on Cameron's Mac (adaptation on the server)
- **Done:** after a log, the review screen runs the new `adapt-plan` Edge Function (D-026): it reads plan, logs, answers, recovery and results from the database, runs `adaptPlan`, and saves through `record_adaptation` (server only): a new `adapted` version plus decisions when anything changed, and a review every run. The app shows the review (checked, changed, kept, waiting on data, questions with tap answers); answering re-runs adaptation. Migration `20261016000008_adaptation_runs.sql` live (`athlete_answers`, `plan_reviews`); both functions deployed by Cameron.
- **Engine fix (approved by Cameron):** re-running adaptation on its own output stacked changes (F-2 then P-3). "More conservative wins" now holds across runs; `test/adapt-rerun.test.ts` re-runs 10 scenarios. Answer handling for coach review is in `ADAPTATION_ENGINE.md` §11.
- **Verified:** 249 engine, 32 app tests; 84 database checks; a real plan → pain log → adaptation → stored version read back identical on a local Postgres; both live functions answer and refuse signed-out calls.
- **Added:** "Log other workout" for training that wasn't in the plan (D-025 addition): pick the day and kind, same effort and pain questions; it feeds adaptation like any log. App only, no migration or deploy.
- **Open:** phone test of logging and the review (use "Log other workout" before Mon 2026-10-19, when Cameron's plan starts). **Recent workouts** (plan screen) lists every log from the last 2 weeks, planned or not, newest first; tap to edit (unplanned ones reopen in the "other workout" form). App only. Before launch: limit non-safety rules to subscribers on the server (D-013).

## 2026-10-16 — Claude Code on Cameron's Mac (step 6: manual workout logging)
- **Done:** athletes log planned sessions from the plan (D-025): done / partly / skipped, time, distance for runs, RPE 0–10, pain (level, body area, sharp, stopped the session, altered movement), fatigue and soreness 1–5, note. Logs are saved in the import pipeline's shape (`toLogRow`/`fromLogRow`, `packages/engine/src/store/logs.ts`), one per planned session by `plan_id` + `workout_key`. Migration `20261016000007_workout_logging.sql` is live: import columns from `INTEGRATIONS.md`, pain sharp / stopped, 1–5 fatigue and soreness, one log per session. Badges on the plan and calendar; "Log session" / "Edit log" on sessions up to today.
- **Reconciled with the adaptation commit:** both sessions picked D-024; the adaptation decision keeps it and logging is D-025. The athlete's 10 body areas (`LOG_BODY_AREAS`) map to the approved pain-map groups (`PAIN_GROUP`); thigh/hamstring and upper back/neck go to "other" until the coach sets movements (Cameron's choice). Tests: 231 engine, 28 app, 66 database checks.
- **Open:** try logging on the phone. Next (in progress): run `adaptPlan` on the server after each log, save the adapted version and decisions, show the weekly review and questions.

## 2026-10-16 — claude.ai Project chat (step 7: adaptation engine)
- **Done:** the adaptation engine now follows the approved rubric rule by rule (D-024). Built: S-1–S-3, F-1–F-6, A-1–A-5, P-1–P-3, T-1, T-2, Q-1, every §4 guardrail, and a weekly review object (`adaptPlan(...).review`). There are 33 adaptation tests (218 engine tests in total). Interpretations of the rubric wording for coach review are in `ADAPTATION_ENGINE.md` §11. Engine only: no app or database changes.
- **Decided with Cameron (D-024):** pain area → movements map approved as drafted; fatigue and soreness logged as 1–5 taps (pain and RPE 0–10); load-spike rule kept as F-6.
- **New engine inputs:** `PainReport` (level, area, sharp, stopped the session, altered movement), `CheckIn` ("not feeling 100%", pain improved), and `AthleteAnswer` (answers to the engine's questions by `questionId`). Step 6 logging should save these. `adaptation_decisions` can store the results as they are.
- **Open (Claude Code):** step 6 logging, using the 1–5 scale and the pain fields. Then call `adaptPlan` on the server after each log and save a new plan version plus the decisions. P-4–P-7 and T-3 come once station and strength results are logged.

## 2026-10-16 — Claude Code on Cameron's Mac (step 5: plan storage)
- **Done:** plans are saved on the server as immutable versions (D-022). Migration `20261016000006_plan_storage.sql` pushed live; Edge Function `generate-plan` deployed (Cameron ran `pnpm functions:deploy`; Claude Code's safety check blocks production deploys from Claude). The app saves answers, then builds a version on the server; the plan screen loads the saved version (or builds one on first open). This week's sessions carry over when answers change mid-week (Cameron's rule). Engine: `ENGINE_VERSION`, `planToRecord`/`planFromRecord`, `inputsFromProfile` (`src/store/`). Tests: engine round trip, phone vs server inputs agree, 57 database checks (new: plan versions server-only, carry-over, ownership, one active plan per goal), and a real 253-session plan stored and read back identical on a local Postgres.
- **Verified by Cameron on the phone:** first plan built and shown from the server (version 1: 21 weeks, 176 sessions).
- **Decisions:** D-022 (plan storage) and D-023 (Apple Health first, numbered as the import chat asked).
- **Tooling:** Postgres 17 via Homebrew for `pnpm db:test` on the Mac (how to run it in `CLAUDE.md`); `esbuild` bundles the engine into the function.
- **Open:** try Edit my answers on the phone (should show version 2 with this week unchanged). Step 6, workout logging, should link logs to a planned session by `plan_id` + `workout_key`. Paywall (D-013) will need locked weeks withheld on the server.

## 2026-10-16 — claude.ai Project chat (build session, continued)
- **Decided with Cameron (D-023):** Apple Health is the first automatic import channel (it also brings in Garmin and Strava workouts that those apps write to it). Keep building before buying the Apple Developer Program so it switches on as soon as he joins. Garmin's API is paused for new apps; Strava is capped and bans AI use. Details and sources in `INTEGRATIONS.md`, "Automatic workout import". *Decision number to be assigned by the next session that adds decisions (Claude Code was mid step 5, to avoid a numbering clash).*
- **Done:** the import pipeline in the engine (`packages/engine/src/imports/`), with 24 tests: Apple Health adapter, validation, idempotent re-imports, duplicate copies, merge into a hand log, plan matching (asks when ambiguous), follow-up questions. Engine only; no app or database changes, so no conflict with step 5.
- **Open (Claude Code):** finish step 5; step 6 manual logging should store into the same shape and add the import columns listed in `INTEGRATIONS.md`. Then the server import function, and HealthKit itself after the developer program.

## 2026-10-16 — Claude Code on Cameron's Mac
- **Done:** Supabase CLI set up (dev dependency `supabase@2.119.0`, `supabase/config.toml`), repo linked to the live project. Checked the live database: all five migrations are present (the combined `supabase_update_oct16.sql` did run; 37 race rows), so they were marked applied with `migration repair`. `db push --dry-run` reports the database up to date. Workflow in `CLAUDE.md` and `docs/SETUP_SUPABASE.md` §2b.
- **For every session:** new database changes are a new file in `supabase/migrations/`, applied with `npx supabase db push` from the Mac (dry run shown to Cameron first). No more pasting SQL into the editor. Chats without the Mac write the migration and leave "push pending" in this log.

## 2026-10-16 — claude.ai Project chat (build session, continued)
- **Done:** rubric review applied, all approved with changes to A-2, A-3, P-7 (D-014). HYROX data terms researched (`INTEGRATIONS.md`): scraping results or events is not allowed without permission; ROXFIT isn't a listed HYROX partner. Race search at sign-up plus a manual past-result form with splits; name search built behind a switch, off until HYROX grants access (D-019). Partnership email drafted for Cameron.
- **Open (Cameron):** migrations 04 and 05 are live (confirmed via Supabase CLI, which now applies migrations with `db push`); send the HYROX partnership request (contact form at hyroxus.com/contact, or the US partnerships contact on hyroxus.com/sponsorships, or a warm intro through the gym's HYROX affiliate contact).
- **Redesign (D-020):** black and signal-yellow theme, condensed uppercase headings, mono readouts, high-tech loading screens (startup, sign-in check, saving), and a personal dashboard banner on the plan screen. A combined database update file (`supabase_update_oct16.sql`, both migrations in one transaction) was sent to Cameron after he pasted a file name into the SQL Editor.
- **Account menu and calendar (D-021):** menu with edit answers, plan, data export, sign out (subscription, billing and account deletion marked Soon); weeks/calendar toggle on the plan.
- **Dismissible plan notes:** notes like "You're race-ready…" have a close button; closed notes stay hidden on that phone for that athlete (shown again if the wording changes). Safety notes are never dismissible.
- **Verified by Cameron (11:39):** redesign, race search, dashboard, calendar and menu all look good.
- **Pre-launch checklist:** in-app account deletion (App Store requirement), in-app purchase for subscriptions, turn Supabase email confirmation back on, verify the race list against HYROX announcements.
- **Open (build):** step 5, save plans server-side as versions; step 6, workout logging; reconcile `packages/engine/src/adapt/` with the approved rubric.

## 2026-10-16 — claude.ai Project chat ("Product monetization strategy")
- **Done:** monetization direction: free assessment and week 1, paid adaptation (D-013). Adaptation rubric drafted in `docs/ADAPTATION_ENGINE.md` (D-014), partly approved; level changes in both directions (D-015).
- **Open:** review of the remaining rubric thresholds; reconcile `packages/engine/src/adapt/` with the rubric.

## 2026-10-16 — claude.ai Project chat (build session)
- **Done:** product-owner feedback from the first phone test. Session variety: no repeats within a week, rotating formats week to week, strength Day A / Day B (D-016). Barlow fonts and a clearer session layout; text fields scroll above the keyboard (D-017). Clearer sign-in errors; email no longer case-sensitive. Added `CLAUDE.md`.
- **Verified by Cameron on the phone:** keyboard fix, new typography and layout, session variety; first end-to-end sign-up and onboarding save to Supabase works.
- **Open:** coach review of the session formats in `HYROX_WEEK.md`; adaptation rubric review: done (see entry above).
- **Sync incident:** this session overwrote the Project copy of DECISIONS.md, dropping D-013 to D-015 written by the monetization chat. Restored, and this session's entries renumbered D-016/D-017. This is why every session must pull and read before writing.
- **Training status (D-018):** new onboarding question (Building up / Training consistently / Race-ready) sets where the plan starts; race-ready skips the base phase. Engine, app, migration and tests done. Live Supabase needs `supabase/migrations/20261016000004_training_status.sql` run in the SQL Editor (Cameron).
- **Double days:** never back to back (including Sunday → Monday) and spread through the week; tested (HYROX_WEEK.md rules).
- **Daily review:** scheduled task "Adaptive Athlete daily review" created, nightly 8:48 pm Mountain (review and doc sync only; reports whether it can reach the Project docs).
- **Note:** Cameron is moving hands-on building to Claude Code on his Mac. Product and coaching decisions can happen in either place; both read these docs.

## 2026-10-15 — claude.ai Project chat
- **Done:** engine (running + HYROX generator, adaptation rules), equipment catalog with coach ratings, onboarding spec and app screens, Supabase schema with row-level security (applied to the live project), GitHub repo. App moved from the SDK 58 beta to SDK 57 (D-012) and installed on Cameron's iPhone with Xcode (free Apple ID).
- **Open:** Supabase email confirmation is off for development; turn it back on before other users.
