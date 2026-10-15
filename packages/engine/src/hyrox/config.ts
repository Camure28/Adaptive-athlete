/**
 * HYROX programming parameters. Session mixes come from the approved week structure
 * (docs/HYROX_WEEK.md, product owner 2026-10-15). Numbers marked ENGINE ASSUMPTION are
 * Claude's defaults awaiting coach review.
 */

import type { ExperienceLevel } from "../types.js";

export type HyroxLevel = "first_timer" | "intermediate" | "advanced" | "competitive";

export type HyroxSessionKind =
  | "easy_run"
  | "long_run"
  | "threshold"
  | "race_pace_intervals"
  | "compromised_run"
  | "station_endurance"
  | "strength";

export const HARD_KINDS: ReadonlySet<HyroxSessionKind> = new Set(["threshold", "race_pace_intervals", "compromised_run"]);
export const MODERATE_KINDS: ReadonlySet<HyroxSessionKind> = new Set(["station_endurance", "strength"]);

export interface LevelTemplate {
  /** Approved sessions/week range. */
  sessions: { min: number; max: number };
  /** Approved hard (high-intensity conditioning) days per week. */
  hardDays: { min: number; max: number };
  /** Build-phase sessions in priority order: when days are short, later items are dropped first. */
  build: HyroxSessionKind[];
  doubles: "default_on" | "opt_in" | "never";
  halfSimulations: number;
  fullSimulations: number;
  /** Rounds of station + 1 km run in a compromised session (build phase). ENGINE ASSUMPTION. */
  compromisedRounds: number;
  /** Weekly run volume ceiling in metres. ENGINE ASSUMPTION. */
  peakRunMeters: number;
  /** Station work as a fraction of race volume in base/build. ENGINE ASSUMPTION. */
  stationVolumeFraction: number;
  /** For reusing the running engine's fallback paces. */
  runExperience: ExperienceLevel;
}

export const LEVELS: Record<HyroxLevel, LevelTemplate> = {
  first_timer: {
    sessions: { min: 4, max: 5 },
    hardDays: { min: 1, max: 2 },
    build: ["compromised_run", "long_run", "strength", "easy_run", "strength"],
    doubles: "never",
    halfSimulations: 1,
    fullSimulations: 1,
    compromisedRounds: 3,
    peakRunMeters: 25_000,
    stationVolumeFraction: 0.5,
    runExperience: "beginner",
  },
  intermediate: {
    sessions: { min: 5, max: 6 },
    hardDays: { min: 2, max: 2 },
    build: ["compromised_run", "threshold", "long_run", "strength", "easy_run", "station_endurance", "strength"],
    doubles: "never",
    halfSimulations: 1,
    fullSimulations: 1,
    compromisedRounds: 4,
    peakRunMeters: 40_000,
    stationVolumeFraction: 0.5,
    runExperience: "intermediate",
  },
  advanced: {
    sessions: { min: 6, max: 8 },
    hardDays: { min: 3, max: 3 },
    build: ["compromised_run", "threshold", "race_pace_intervals", "long_run", "strength", "easy_run", "station_endurance", "strength", "compromised_run"],
    doubles: "opt_in",
    halfSimulations: 2,
    fullSimulations: 2,
    compromisedRounds: 5,
    peakRunMeters: 60_000,
    stationVolumeFraction: 0.75,
    runExperience: "advanced",
  },
  competitive: {
    sessions: { min: 8, max: 10 },
    hardDays: { min: 3, max: 4 },
    build: ["compromised_run", "threshold", "race_pace_intervals", "long_run", "strength", "compromised_run", "easy_run", "station_endurance", "strength", "easy_run"],
    doubles: "default_on",
    halfSimulations: 2,
    fullSimulations: 2,
    compromisedRounds: 6,
    peakRunMeters: 80_000,
    stationVolumeFraction: 1,
    runExperience: "advanced",
  },
};

/** Approved: last full simulation no closer than 10–14 days before race day. We aim for 14 and accept 10. */
export const FULL_SIM_MIN_DAYS_BEFORE_RACE = 10;
export const FULL_SIM_PREFERRED_DAYS_BEFORE_RACE = 14;
export const MIN_DAYS_BETWEEN_FULL_SIMS = 10; // ENGINE ASSUMPTION

/** Estimated station times (seconds) for duration estimates only. ENGINE ASSUMPTION. */
export const STATION_SECONDS: Record<HyroxLevel, number> = {
  first_timer: 330,
  intermediate: 270,
  advanced: 225,
  competitive: 190,
};

export const HYROX_MIN_WEEKS = 8;
export const HYROX_TAPER_WEEKS = 1; // ENGINE ASSUMPTION: 1 week taper, 2 when ≥ 14 weeks
