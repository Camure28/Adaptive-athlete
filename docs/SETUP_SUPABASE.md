# Supabase setup

## 1. Create the project (product owner, ~5 minutes)
1. Go to supabase.com and sign in (or create an account).
2. **New project**: name it `adaptive-athlete`, choose the **Free** plan and a US West region.
3. Generate a database password and save it in your password manager. **Never paste it into chat or code.**
4. Wait for the project to finish provisioning (a minute or two).

## 2. Create the database (one time)
SQL Editor → New query → paste the whole of `supabase/setup.sql` → Run.
It runs as one transaction: either everything is created or nothing is.

## 2b. Applying later changes (Supabase CLI)
Database changes are applied from the repo with the Supabase CLI (a dev dependency, pinned). No more copy-pasting SQL. Never re-run `setup.sql` on the live project.

**One-time setup on a Mac** (already done on Cameron's Mac, 2026-10-16). In Terminal, from the repo folder:
```bash
npx supabase login                                      # opens the browser; approve the CLI
npx supabase link --project-ref hjqtbhnsjrmvpiudwnux    # press Enter if asked for the database password
```
The login token lives in the macOS keychain and the link in `supabase/.temp/` (git-ignored). The CLI connects through your login, so the database password isn't needed or stored.

**Each time there's a new migration:**
```bash
git pull
npx supabase db push --dry-run    # lists the migrations it would apply; nothing changes
npx supabase db push              # applies them, oldest first, and records them as applied
npx supabase migration list       # local and live columns should match
```

**If something was applied by hand in the SQL Editor**, record it so the CLI doesn't try to run it again: `npx supabase migration repair --status applied <version>` (the version is the number at the start of the file name). Only do this after checking the change really is in the database.

**History:** migrations `20261015000001` to `20261016000005` were applied by hand in the SQL Editor (the last two via the combined `supabase_update_oct16.sql`). On 2026-10-16 we checked each was present in the live database (tables, columns, functions, grants, 37 race rows) and marked them applied with `migration repair`.

## 2c. Edge Functions
`generate-plan` builds and saves plans (D-022); `adapt-plan` adapts them after each log (D-026). Deploy both from the repo after `git pull` whenever `supabase/functions/` or `packages/engine/` changed:
```bash
pnpm functions:deploy     # bundles the engine, then deploys generate-plan and adapt-plan (no Docker needed)
```
It needs no secrets from us: Supabase provides the project URL and keys to Edge Functions. Check it in the dashboard under Edge Functions → generate-plan → Logs. Free plan: 500,000 calls a month.

To add or fix a race later: SQL Editor → `insert into hyrox_events (...) values (...)` or `update hyrox_events set ... where id = '...'`. Set `verified = true` once checked against HYROX's own announcement.

## 3. Connect the app
Project Settings → API keys. Copy:
- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **Publishable key** → `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Put them in `apps/mobile/.env.local` (git-ignored). The publishable key is designed to ship inside the app; row-level security is what protects the data.
**Never** put the secret / service-role key in the app or in chat.

## 4. Auth settings
Keep email confirmation on (the default). The app tells new users to confirm by email, then sign in.

## Verify
Sign up in the app, finish onboarding, then in Supabase → Table Editor confirm one row each in `athletes`, `hyrox_profiles` and `goals` for that user.
