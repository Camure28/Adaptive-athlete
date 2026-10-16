/**
 * HYROX results lookup by athlete name.
 *
 * HYROX's terms forbid automatically copying results from their sites without permission
 * (docs/INTEGRATIONS.md). Until HYROX World GmbH grants access, no provider is configured and
 * onboarding shows the manual result form. When a licensed source exists, implement
 * ResultsProvider against it and export it here; the search screen turns on by itself.
 */
import type { HyroxStation } from "@adaptive-athlete/engine";

export interface HyroxResultHit {
  id: string;
  athleteName: string;
  eventName: string;
  date: string; // ISO
  division: "women_open" | "women_pro" | "men_open" | "men_pro";
  finishSeconds: number;
  runs: (number | null)[];
  stations: Partial<Record<HyroxStation, number>>;
}

export interface ResultsProvider {
  search(name: string): Promise<HyroxResultHit[]>;
}

/** No licensed source yet. */
export const resultsProvider: ResultsProvider | null = null;
