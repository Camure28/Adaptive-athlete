# Data Model

Migration: `supabase/migrations/20261015000001_init.sql` (PostgreSQL 15+, Supabase-compatible).
Security rules and tests: see `docs/SECURITY.md`.

## Tables

| Area | Table | Written by | Purpose |
|---|---|---|---|
| Account | `athletes` | athlete | One per signed-in user; display name, units (mi default) |
| Onboarding | `hyrox_profiles` | athlete | Level, schedule, time caps, weekly running, doubles opt-in, gym types |
| | `athlete_equipment` | athlete | Equipment checklist (17 fixed IDs) |
| | `athlete_limitations` | athlete | Movements to avoid + short note. No diagnoses |
| | `preferences` | athlete | Notification settings |
| Goals & results | `goals` | athlete | HYROX (division) or road race (distance), date, optional target time |
| | `race_results` | athlete | Run benchmarks and past HYROX results, timing method, conditions, splits |
| | `fitness_assessments` | server | VDOT, paces, baselines — each with value kind (measured / calculated / estimated), confidence, source |
| Plans | `training_plans` | server | A plan for a goal; points at its current version |
| | `plan_versions` | server | Immutable snapshot per change: engine version, fitness basis, reason |
| | `planned_workouts` | server | Sessions per version; `workout_key` links a session across versions |
| | `adaptation_decisions` | server | Every decision, applied or suppressed: rule + version, what changed, why, next steps, evidence, before/after |
| Training log | `completed_workouts` | athlete / importer | Status, duration, distance, HR, RPE, soreness, fatigue, pain, splits, station results, source |
| | `daily_recovery` | athlete / importer | HRV, resting HR, sleep — keyed by source so device baselines never mix |
| Integrations | `provider_connections` | server | Provider, status, scopes, sync state (no secrets) |
| | `provider_credentials` | server only | Encrypted OAuth tokens; invisible to clients |
| Compliance | `consents` | athlete (append) | Versioned consent records |
| | `audit_log` | server | Who did what, without health values or free text |

## Key relationships
- Everything hangs off `athletes`; deleting the user deletes all of it.
- `goals → training_plans → plan_versions → planned_workouts` (each child carries `athlete_id` and uses a composite foreign key, so it can only point at the same athlete's parent).
- `completed_workouts.plan_id + workout_key` → the planned session it fulfils. Deleting a plan keeps the athlete's logged history.

## Design choices
- **Workout steps are stored as JSON (`planned_workouts.body`)**, not as rows per step. Steps are produced and validated by the engine's typed model, read as a whole, and never queried individually. Columns that *are* queried (date, type, minutes, distance, load) are real columns. Revisit if we need step-level analytics.
- **Plans are versioned, never edited.** An adaptation writes a new `plan_versions` row with its sessions; the old version stays for the history screen.
- **Provenance everywhere.** Results have a timing method; assessments have value kind and confidence; logged data has a source.
- **Imports are idempotent**: `(athlete_id, source, external_id)` is unique.
