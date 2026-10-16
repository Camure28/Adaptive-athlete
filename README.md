# Adaptive Athlete

Adaptive HYROX training: a plan built around the athlete's race, level, schedule and equipment, adjusted from their logged training.

## Layout
| Path | What it is |
|---|---|
| `packages/engine` | Training engine (TypeScript, no UI or database): fitness estimation, running and HYROX plan generation, adaptation rules, LLM data boundary |
| `apps/mobile` | Expo (SDK 57) app: sign-up, HYROX onboarding, plan preview |
| `supabase/migrations` | PostgreSQL schema with row-level security |
| `supabase/tests` | Database security tests (run on a local Postgres) |
| `docs/` | Decisions, HYROX programming rules, equipment catalog, onboarding, data model, security |

## Commands
```bash
pnpm install
pnpm -r typecheck        # TypeScript, all packages
pnpm -r test             # engine + app tests
pnpm lint
pnpm db:test             # needs a local PostgreSQL 15+ (sudo -u postgres)
cd apps/mobile && npx expo start          # run the app (demo mode unless Supabase is configured)
cd apps/mobile && ./build-preview.sh      # demo web build for review
cd packages/engine && npx tsx scripts/hyrox-sample.ts   # print sample plans for coach review
```

## Run on an iPhone (Xcode, free Apple ID)
Needs a Mac with Xcode, an Apple ID added in Xcode → Settings → Accounts, and the iPhone on the same Wi-Fi.
```bash
cd apps/mobile
npx expo run:ios --device     # builds with Xcode and installs on the plugged-in iPhone; starts the dev server
npx expo start                # later sessions: start the server, then open the app on the phone
```
On the iPhone: turn on Settings → Privacy & Security → Developer Mode, and trust the developer under Settings → General → VPN & Device Management. With a free Apple ID the install stops opening after 7 days; run the first command again. The `ios/` folder is generated and not committed.

## Backend
The app uses Supabase when `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set (see `apps/mobile/.env.example`); apply `supabase/migrations` to the project first. Without them it runs in **demo mode**: in memory, nothing saved, with a permanent banner.

## Status (2026-10-15)
- Done: engine (running + HYROX), schema with tested isolation, onboarding and plan preview.
- Supabase project created and schema applied (2026-10-15). The app is configured for it locally.
- Not yet verified end to end: sign-up and saving against Supabase. The build environment can't reach Supabase, so this is tested by running the app on a phone.
- Code on GitHub. App moved from the SDK 58 beta to stable SDK 57 so it can be built with Xcode (D-012).
- Next: install on an iPhone with Xcode and verify sign-up; save plans server-side; workout logging; adaptation in the app.
