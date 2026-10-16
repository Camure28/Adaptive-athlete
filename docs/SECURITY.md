# Security

## Athlete data isolation (implemented and tested)
Enforced by the database (row-level security), not just the app:

- Athletes can read and change only rows linked to their own account. Changing an ID in a request returns nothing or is rejected.
- Athletes write only their **inputs**. Engine **outputs** — plans, versions, sessions, adaptation decisions, fitness assessments — are written by the server, so history can't be forged from a phone.
- Plan versions, planned sessions, adaptation decisions, consents and the audit log are **append-only**: no one, including the server, can edit them.
- An athlete row can never be reassigned to another user; child records can never point at another athlete's parent records.
- OAuth credentials sit in a table no client role can read; tokens are encrypted by the server before storage (key version recorded for rotation).
- Signed-out visitors can read nothing.

## Server-side plan generation (D-022)
- Plans are built and saved by the `generate-plan` Edge Function. It checks the caller's access token with Supabase Auth, reads their answers *with that token* (so row-level security still applies), and ignores everything in the request except the athlete's local date (accepted only within a day of the server's).
- It saves through `record_plan_version`, which only the service role can execute. The function checks that the goal belongs to the athlete and that new sessions don't start before the version's start date. Athletes and signed-out visitors can't call it (tested).
- The secret key it uses is injected by Supabase into Edge Functions (`SUPABASE_SECRET_KEYS`). It is never in the app, the repo or chat.

Proof: `supabase/tests/rls_test.sql` (66 checks), run with `pnpm db:test`. The suite was verified to fail when a rule is deliberately broken.

## Privacy
- Data minimisation: limitations are "movements to avoid", not diagnoses; division instead of sex.
- Export: `export_my_data()` returns everything the athlete owns, and only that.
- Deletion: deleting the account removes all athlete data, history included.
- Consent is recorded per kind and policy version.
- AI boundary: provider data reaches an LLM only if that provider's terms allow it (D-005).

## Not yet done (before launch)
- Token encryption implementation and key management (server).
- Rate limiting and request validation in the API layer.
- Log redaction review; threat model; health-data privacy law and app-store review (e.g. Washington My Health My Data Act and similar state laws; Apple HealthKit rules).
- Supabase project configuration (auth settings, backups) — requires approval before any paid service.
