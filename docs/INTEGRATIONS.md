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

**Status:** blocked pending permission. Proposed path, awaiting product-owner decision:
1. Ask HYROX for a data licence or partnership: results lookup by name and the event calendar.
2. Meanwhile, compliant fallbacks: (a) the athlete enters their own past result (finish time, optional run and station splits) with a link that opens the HYROX results site in their browser to look it up; (b) a race list we maintain ourselves (event name, city, dates, divisions offered), typed in by hand from public announcements and stored in our database, plus "my race isn't listed".

Other providers (Apple Health, Garmin, Strava, COROS, WHOOP, Oura, Polar, Fitbit) are to be researched in Phase 3. Note D-005: Strava data may not be sent to AI models.
