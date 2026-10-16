# Supabase setup

## 1. Create the project (product owner, ~5 minutes)
1. Go to supabase.com and sign in (or create an account).
2. **New project**: name it `adaptive-athlete`, choose the **Free** plan and a US West region.
3. Generate a database password and save it in your password manager. **Never paste it into chat or code.**
4. Wait for the project to finish provisioning (a minute or two).

## 2. Create the database (one time)
SQL Editor → New query → paste the whole of `supabase/setup.sql` → Run.
It runs as one transaction: either everything is created or nothing is.

## 2b. Applying later changes
When a new file appears in `supabase/migrations/`, run **only that file** in the SQL Editor (New query → paste → Run), oldest first. Never re-run `setup.sql` on the live project.

| Migration | What it adds | Applied to live project |
|---|---|---|
| `20261016000004_training_status.sql` | Training status on the HYROX profile (D-018) | Not yet |
| `20261016000005_hyrox_events.sql` | Race list (37 events), chosen race on the goal, result splits (D-019) | Not yet |

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
