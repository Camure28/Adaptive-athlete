# Integrations

Each entry records what the source allows, verified against its own published terms, with the date. Never build against a source whose terms forbid it; record the blocker and the compliant fallback instead (project rule 18).

## HYROX race results and event calendar (checked 2026-10-16)

**Request (product owner, 2026-10-16):** at sign-up, an athlete types their name to find their past HYROX results, and searches the official list of upcoming races to pick theirs.

**Where the data lives:**
- Results: `results.hyrox.com` (official timing results, searchable by name, with run and station splits). Its robots.txt disallows automated access; our fetch tool was refused.
- Upcoming races: the event pages on `hyrox.com`.
- No public HYROX API or developer programme was found.

**What the terms say:** `hyrox.com/terms-of-use`, operated by HYROX World GmbH, Hamburg (page published 2026-02-10):
- §6.1 prohibits text and data mining and web scraping, including robots, bots, spiders and scrapers.
- §6.3 withholds consent to the use of "any data published by, or contained in, or accessible via, our site".
- §5.1, §5.2 and §14.4.1 limit the site to personal, non-commercial use; no copying, redistribution or derivative works.
- §5.4: any copyright use requires separate permission; text and data mining rights are reserved.

**Conclusion:** pulling results or the event list automatically from HYROX's sites requires written permission from HYROX World GmbH. Other apps (e.g. ROXFIT, Hyranking) show HYROX results, but none we found states a licence, so their existence is not evidence that it's allowed. This is a reading of the published terms, not legal advice.

**ROXFIT (competitor), checked 2026-10-16:**
- ROXFIT Limited (London) is not on HYROX's published list of Official Online Training Partners: Centr, FIIT, Runna, LEVLS, MyCoach, The Ultimate You, Getahead, Relentless Method, RJ Coaching, ENDUR, HWPO, PRVN and KZN Fitness (hyroxus.com, checked 2026-10-16). Repz also announced the title in August 2026.
- Its App Store listing claims no affiliation, and an independent comparison describes it as independent.
- It says its results come "from HYROX's official timing" and refreshes them from HYROX. Whether it has a private data agreement is not public.

**Ways to offer the same feature:**
1. **Official:** apply to become an HYROX Official Online Training Partner and ask for results and event data access as part of the deal. The partner programme exists; how to apply isn't published, so start through HYROX's contact form and the product owner's HYROX affiliate contacts.
2. **Athlete-owned import (no access to HYROX's sites):** the athlete screenshots their own result page and on-device text recognition fills in their time and splits for them to confirm. The library is to be chosen and verified when this is built.
3. **Not acceptable:** scraping HYROX's sites, directly or through third-party scraper services, since the same terms apply.

**Status:** automatic results lookup and the official event feed are blocked pending permission (request drafted 2026-10-16; send via HYROX's contact form or partnerships team). Built meanwhile (D-019): our own race list and a manual result form with optional splits; the name-search screen is wired to a `ResultsProvider` interface that stays off until a licensed source exists. The product owner ruled out screenshot import. Proposed path, awaiting product-owner decision:
1. Ask HYROX for a data licence or partnership: results lookup by name and the event calendar.
2. Meanwhile, compliant fallbacks: (a) the athlete enters their own past result (finish time, optional run and station splits) with a link that opens the HYROX results site in their browser to look it up; (b) a race list we maintain ourselves (event name, city, dates, divisions offered), typed in by hand from public announcements and stored in our database, plus "my race isn't listed".

## Automatic workout import (checked 2026-10-16)

**Status:** we're building the import logic ahead of the Apple Developer Program purchase, so Apple Health can be switched on as soon as the membership exists. The product owner agreed 2026-10-16 to keep building before joining. Apple Health is the first channel; there is no live connection yet.

| Channel | Access today | Notes |
|---|---|---|
| Apple Health (HealthKit) | Native, on the phone. Needs the HealthKit capability, which requires the paid Apple Developer Program; free personal teams can't add it. | Hub: Apple Watch, and Garmin Connect, Strava and others write workouts into it when the athlete turns that on in their app. iPhone only (Android Health Connect later). Apple's rules (App Review 5.1.3) limit how HealthKit data may be used. Until those are reviewed, `apple_health` stays out of `LLM_ELIGIBLE_SOURCES`. |
| Garmin Connect API | New applications paused since about spring 2026; existing partners still work; no reopening date ([the5krunner, 2026-09-14](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/)). | Reach Garmin users through Apple Health meanwhile. Re-check before applying. |
| Strava API | New apps are capped at 1 athlete (10 without review); more needs a review with no guaranteed timeline. Standard developers need a Strava subscription. API data may not be used in AI features, including as model context ([Terra summary, 2026-09-06](https://tryterra.co/blog/strava-api-changes-2026); verify against Strava's own terms). | Conflicts with the coaching explanations (D-005). Not planned. |

**Import pipeline** (`packages/engine/src/imports/`, pure and tested):
1. The adapter (`fromHealthKitWorkout`) turns a HealthKit workout into an `ImportedActivity`. `source` is the channel (`apple_health`); `originApp` is who recorded it (e.g. Garmin Connect).
2. `validateActivity` drops impossible values (heart rate, distance) with a warning, and rejects recordings under 2 minutes or with broken times. Limits match the database checks.
3. `decideImport` covers four cases:
   - The same provider id again: unchanged, or an update if the provider edited the workout.
   - Another copy of the same session (same kind of sport, at least 60% time overlap): skip it, or replace the stored copy if this one has more data.
   - A session the athlete logged by hand that day: attach the device data to their log.
   - Anything else: a new entry.
4. `mergeIntoManual`: the athlete's typed numbers win. The device fills blanks, and disagreements over 10% are shown to the athlete to choose.
5. `matchToPlan` finds the planned session that day by sport and duration. HIIT, cross training and functional strength recordings count as candidates for HYROX sessions. When two sessions fit about equally (a double day), it asks the athlete instead of guessing. Workouts with no planned session that day are logged as extra training.
6. `athleteFollowUp` asks for effort (RPE) and pain, which a watch can't measure. It also asks "was this the whole session?" when the recording is well short of the plan.

**Still to build** (Claude Code, step 6 onward):
- ~~Database columns for imports~~: done in `20261016000007_workout_logging.sql` (D-025). Store imports with `toLogRow(completed, athleteId, activity)` (`packages/engine/src/store/logs.ts`), which fills these columns; manual logs use the same function without the activity.
- A server-side import function that runs these steps and writes the log.
- Once the Apple Developer Program is active: the HealthKit library, the capability and a permission screen, and background delivery so new workouts arrive without opening the app.

Other providers (COROS, WHOOP, Oura, Polar, Fitbit) are to be researched later through the same `ImportedActivity` shape. Note D-005: Strava data may not be sent to AI models.
