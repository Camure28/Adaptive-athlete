# Progress log

The shared memory between every Claude session on this project: chats in the claude.ai Project, Claude Code on Cameron's Mac, and the daily review. Newest entry first. Each session adds one entry before it ends.

Format: date, where the work happened, what changed, what's open. Decisions go in `DECISIONS.md`, not here; link them by number.

---

## 2026-10-16 — Claude Code on Cameron's Mac (adaptation on the server)
- **Done:** after a log, the review screen runs the new `adapt-plan` Edge Function (D-026): it reads plan, logs, answers, recovery and results from the database, runs `adaptPlan`, and saves through `record_adaptation` (server only): a new `adapted` version plus decisions when anything changed, and a review every run. The app shows the review (checked, changed, kept, waiting on data, questions with tap answers); answering re-runs adaptation. Migration `20261016000008_adaptation_runs.sql` live (`athlete_answers`, `plan_reviews`); both functions deployed by Cameron.
- **Engine fix (approved by Cameron):** re-running adaptation on its own output stacked changes (F-2 then P-3). "More conservative wins" now holds across runs; `test/adapt-rerun.test.ts` re-runs 10 scenarios. Answer handling for coach review is in `ADAPTATION_ENGINE.md` §11.
- **Verified:** 249 engine, 32 app tests; 84 database checks; a real plan → pain log → adaptation → stored version read back identical on a local Postgres; both live functions answer and refuse signed-out calls.
- **Added:** "Log other workout" for training that wasn't in the plan (D-025 addition): pick the day and kind, same effort and pain questions; it feeds adaptation like any log. App only, no migration or deploy.
- **Open:** phone test of logging and the review (use "Log other workout" before Mon 2026-10-19, when Cameron's plan starts). Unplanned logs aren't listed anywhere in the app yet (they show in the review's count). Before launch: limit non-safety rules to subscribers on the server (D-013).

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
