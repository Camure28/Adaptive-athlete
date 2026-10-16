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

## Layout
- `packages/engine`: pure TypeScript training engine (no UI/DB). HYROX generator in `src/hyrox/`; tests in `test/` (vitest). `test/hyrox.test.ts` pins approved coaching rules: change those only with Cameron.
- `apps/mobile`: Expo SDK 57 app (Expo Router, `src/app`). Supabase backend when `.env.local` is set, otherwise a labelled demo mode.
- `supabase/`: migrations with row-level security; `pnpm db:test` runs the isolation tests on a local Postgres.
- `docs/`: decisions, HYROX week rules and variety formats, equipment catalog, onboarding, data model, security, Supabase setup.

## Commands
```bash
npx pnpm@10.28.0 install
pnpm -r typecheck && pnpm -r test && pnpm lint   # run before calling anything done
cd apps/mobile && npx expo start                  # dev server; the iPhone app connects to it
cd apps/mobile && npx expo run:ios --device       # rebuild/reinstall on the iPhone (needed after native changes, and every 7 days on a free Apple ID)
cd packages/engine && npx tsx scripts/hyrox-sample.ts > ../../docs/samples/HYROX_SAMPLE_PLANS.md
```

## Status (2026-10-16)
- Done: engine (running + HYROX, adaptation rules, session variety), schema with tested isolation, onboarding, on-device plan preview, iPhone development build via Xcode (free Apple ID).
- Supabase: email confirmation turned off for development; turn it back on before anyone else uses the app.
- In progress: first end-to-end sign-up and onboarding save on the phone.
- Next: save plans server-side (append-only versions), workout logging, adaptation in the app, UI design pass, Apple Health, TestFlight pilot (needs the paid Apple Developer Program).
