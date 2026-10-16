# Progress log

The shared memory between every Claude session on this project: chats in the claude.ai Project, Claude Code on Cameron's Mac, and the daily review. Newest entry first. Each session adds one entry before it ends.

Format: date, where the work happened, what changed, what's open. Decisions go in `DECISIONS.md`, not here; link them by number.

---

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
