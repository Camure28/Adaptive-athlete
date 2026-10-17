# Adaptive Athlete: notes for Claude

Adaptive HYROX training app. Cameron is the product owner (and a CrossFit coach); Claude acts as founding CTO. Full product brief: the "Hyrox Training Program App" Project instructions on claude.ai.

## How Cameron wants to work
- Step by step, together. Small changes, explained in plain language; ask before decisions that change product direction, cost or security.
- Coaching content (session formats, substitutes, rules) is his call. Claude's defaults are marked "ENGINE ASSUMPTION" or "awaiting coach review" until he approves them.
- Record decisions in `docs/DECISIONS.md` (D-001 onward). Never commit secrets; the Supabase secret key and database password never go in code or chat.

## Keeping every session in sync
Several Claude sessions work on this project (claude.ai Project chats, Claude Code on Cameron's Mac, a daily review). They share nothing except this repo, so:
- **Start:** `git pull`, then read `docs/PROGRESS.md` (latest entries) and `docs/DECISIONS.md`.
- **End:** add a dated entry at the top of `docs/PROGRESS.md` (where, done, open), record any decision in `DECISIONS.md`, update the Status section below if it changed, run the checks, commit and push.
- If something in the repo contradicts what Cameron said in your session, ask him rather than silently overwriting it.
- The claude.ai Project keeps copies of the docs under `claude/` (e.g. `claude/DECISIONS.md`) for chats that can't reach the repo. A session with access to both mirrors repo docs into the Project after pushing, and pulls Project-only changes into the repo first. Always read a doc right before writing it and merge; never write a whole file from an older copy. Decision numbers come from the latest DECISIONS.md, so read it before adding one.

## Layout
- `packages/engine`: pure TypeScript training engine (no UI/DB). HYROX generator in `src/hyrox/`; tests in `test/` (vitest). `test/hyrox.test.ts` pins approved coaching rules: change those only with Cameron.
- `apps/mobile`: Expo SDK 57 app (Expo Router, `src/app`; signed-in screens are bottom tabs in `src/app/(tabs)`: Home, Training, Leaderboard, Profile). Supabase backend when `.env.local` is set, otherwise a labelled demo mode.
- `supabase/`: migrations with row-level security; `pnpm db:test` runs every `supabase/tests/*_test.sql` (each on a fresh local database). `functions/generate-plan` builds and saves plans (D-022) and `functions/adapt-plan` adapts them after each log (D-026), using the engine bundled by `pnpm functions:build`; shared request code in `functions/_shared/request.ts`.
- `docs/`: order of work and parked ideas (`ROADMAP.md`, e.g. AI coach chat), release and TestFlight steps (`RELEASE.md`), the draft privacy policy (`PRIVACY_POLICY.md`, same text as `apps/mobile/src/lib/privacy.ts`), decisions, HYROX week rules and variety formats, equipment catalog, onboarding, data model, security, Supabase setup.

## Commands
```bash
npx pnpm@10.28.0 install
pnpm -r typecheck && pnpm -r test && pnpm lint   # run before calling anything done
cd apps/mobile && npx expo start                  # dev server; the iPhone app connects to it
cd apps/mobile && npx expo run:ios --device       # rebuild/reinstall on the iPhone (needed after native changes, and every 7 days on a free Apple ID)
pnpm ios:release                                   # release build on the iPhone: runs without the Mac (docs/RELEASE.md)
pnpm testflight                                    # cloud build + upload to TestFlight; needs the paid Apple Developer Program and EAS setup (docs/RELEASE.md)
cd packages/engine && npx tsx scripts/hyrox-sample.ts > ../../docs/samples/HYROX_SAMPLE_PLANS.md
```

## Database changes (Supabase CLI)
The repo is linked to the live project (`hjqtbhnsjrmvpiudwnux`) with the Supabase CLI, a pinned dev dependency. Migrations are applied with `db push`, not pasted into the SQL Editor.
```bash
npx supabase migration new <name>          # creates supabase/migrations/<timestamp>_<name>.sql
pnpm db:test                               # isolation tests on a local Postgres
npx supabase db push --dry-run             # shows what would be applied; show Cameron first
npx supabase db push                       # applies it, only after Cameron says go
npx supabase migration list                # local vs live history
pnpm functions:deploy                      # rebuild the engine bundle, deploy generate-plan and adapt-plan; Cameron runs it (Claude Code blocks production deploys)
```
- On this Mac, `pnpm db:test` needs a local Postgres 17 (`brew install postgresql@17`, not run as a service). Start a throwaway one on 127.0.0.1:54329 and pass `PSQL_CMD="/opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 54329 -U postgres"`.
- Never edit a migration that has already been pushed; add a new one.
- Run `bash supabase/build_setup_sql.sh` after adding a migration so `setup.sql` stays complete for a brand-new project.
- If a change was made by hand in the SQL Editor, confirm it exists live (`npx supabase db query --linked "..."`), then record it with `npx supabase migration repair --status applied <version>`.
- The CLI uses Cameron's login (macOS keychain) and a temporary login role, so no database password is needed. If `supabase/.temp/project-ref` is missing (new machine or fresh clone), Cameron runs `npx supabase login` and `npx supabase link --project-ref hjqtbhnsjrmvpiudwnux`.

## Status (2026-10-16)
- Done: engine (running + HYROX, adaptation rules, session variety), schema with tested isolation, onboarding, plans saved server-side as versions, iPhone development build via Xcode (free Apple ID).
- Supabase: email confirmation turned off for development; turn it back on before anyone else uses the app.
- Verified 2026-10-16: sign-up and onboarding save to Supabase from the iPhone.
- Verified 2026-10-16: first plan built and saved by the generate-plan Edge Function, shown on the iPhone (D-022).
- Live 2026-10-16: workout logging including workouts outside the plan (D-025) and server-side adaptation with the weekly review (D-026); phone test pending (first session Mon Oct 19).
- Built 2026-10-16: account deletion, privacy policy and feedback in Profile (D-031); live.
- Name and icon 2026-10-16: athletes see **Adapt** (D-032); code, repo and bundle ID keep "adaptive-athlete". Verified on the phone 2026-10-16 (icon changes need `npx expo prebuild --platform ios --clean`).
- Built 2026-10-16: plan start day at onboarding (D-033); migration push and functions deploy pending. Coach review 2026-10-17: all 25 defaults approved (D-034).
- Next (order in `docs/ROADMAP.md`): pilot readiness (TestFlight, tester checklist), then HYROX station tracking, Apple Health.
