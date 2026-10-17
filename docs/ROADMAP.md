# Roadmap: later releases

Ideas the product owner has approved in principle but parked for a future release. Each entry records the design agreed so far, so whoever picks it up starts from it and doesn't redesign from scratch.

## Order of work toward a professional product (agreed 2026-10-16)
Claude's recommendation; the product owner said "let's start with your recommendations".
1. **Pilot readiness.** Coach review of the session formats; the tester checklist in `RELEASE.md` §3 (account deletion, privacy policy, feedback, app icon, email confirmation); TestFlight once the Apple Developer Program is bought. *Started 2026-10-16 (D-031); coach review of 25 defaults approved 2026-10-17 (D-034).*
2. **HYROX-specific tracking.** Station and run-split logging on every HYROX session, station progress over time, a race-time projection with its confidence shown, and a monthly progress report.
3. **Apple Health import and reminders.** Switch on the built import pipeline (D-023) once the developer program allows HealthKit; session reminders.
4. **Gym coach dashboard and gym pricing.** A coach sees their members' consistency and flags; a per-gym price.
5. **Race-week tools and post-race report.** Taper week, race-day pacing card, and a report comparing the race to the plan.
6. **Running it as a business.** Subscriptions, crash monitoring, a website (which also hosts the privacy policy), and the health-data privacy review (`SECURITY.md`).

## AI coach chat (parked 2026-10-16)

**Idea (product owner):** athletes type what's going on ("my knee's sore", "travelling Thursday to Sunday", "I did a CrossFit class") and the plan adapts to what they said.

**Agreed shape (Claude's proposal, discussed 2026-10-16):**
- **The AI never edits the plan.** It turns the message into inputs the engine already understands: pain report, "not feeling 100%", answers, extra training, unavailable days, temporary equipment. The approved adaptation rules (`ADAPTATION_ENGINE.md`) make every decision. This matches project brief Layer 5 and D-005.
- **Confirm before change.** The chat shows "Here's what I understood" (for example: knee pain 4/10, away Thu–Sun, hotel gym) with Yes / Edit. Nothing is saved until the athlete taps Yes.
- **It explains after.** It explains the changes in plain language and answers questions ("why is Saturday easy?").
- **Medical red flags stop the chat.** Chest pain, fainting or a suspected fracture get "please see a doctor". It never diagnoses.

**Needed first:**
1. **Engine rule:** unavailable days and travel (move sessions within the week), with tests.
2. **Engine rule:** temporary equipment changes.
3. **B-4 level change:** move down a level.
4. **Server function `coach-chat`:** reads the plan and recent training with the athlete's token; calls the Claude API with tools that map to those inputs.
5. **"Coach" button on Home:** opens the chat screen.
6. **Scripted test conversations:** about 30 of them, checked automatically.

**Cost:** Anthropic API pricing checked 2026-10-16:
- **Haiku 5.5:** $0.10 per million input tokens and $0.50 per million output tokens, about $0.0005 per message.
- **Sonnet 5.5:** $2 / $10, about $0.01 per message.

Suggested: Haiku to understand messages, Sonnet only for explanations. It needs an Anthropic API account with a monthly spending limit (product owner's decision). The key is stored as a Supabase secret, never in the app, repo or chat.

**Privacy:**
- **Consent:** the athlete turns the coach chat on themselves, with a plain note that messages and training data are sent to Anthropic. By default Anthropic doesn't use inputs or outputs from its commercial products for training (privacy.claude.com, checked 2026-10-16).
- **Provider data:** sources excluded by D-005 stay excluded.
- **Before launch:** the health-data law review applies (`SECURITY.md`).

## Movement photos and clips (D-030)
Shoot each movement at the product owner's gym (about 40 movements, one photo or 3–5 s clip each) to replace the equipment icons in workout rows. Claude to prepare a shot list on request.
