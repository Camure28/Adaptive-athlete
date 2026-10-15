/**
 * Programming constants. Every number here is a reviewable coaching decision — a sports-science
 * reviewer should be able to change these without touching generator logic.
 * Rationale for each value lives in docs/ADAPTATION_ENGINE.md §Plan generation.
 */

import type { ExperienceLevel, RaceDistance } from "../types.js";

export interface PlanConfig {
  /** Max week-over-week increase in planned run volume (non-recovery weeks). */
  maxWeeklyIncrease: number;
  /** Every Nth week is a recovery (down) week. */
  recoveryWeekEvery: number;
  /** Recovery-week volume as a fraction of the preceding week. */
  recoveryWeekFactor: number;
  /** Long run as a max fraction of weekly volume. */
  longRunMaxFraction: Record<ExperienceLevel, number>;
  /** Absolute long-run caps (metres) by goal distance. */
  longRunMaxMeters: Record<RaceDistance, number>;
  /** Threshold work per session as max fraction of weekly volume (Daniels: ≤10%). */
  thresholdMaxFraction: number;
  /** Interval work per session as max fraction of weekly volume (Daniels: ≤8%, ≤10 km). */
  intervalMaxFraction: number;
  peakWeeklyMeters: Record<RaceDistance, Record<ExperienceLevel, number>>;
  taperWeeks: Record<RaceDistance, number>;
  /** Minimum sensible preparation (weeks). Shorter plans are generated but flagged. */
  minWeeks: Record<RaceDistance, number>;
  maxRunDays: Record<ExperienceLevel, number>;
  /** Fallback easy pace (sec/km) for time estimates when no reliable fitness benchmark exists. */
  fallbackEasyPace: Record<ExperienceLevel, number>;
}

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  maxWeeklyIncrease: 0.1,
  recoveryWeekEvery: 4,
  recoveryWeekFactor: 0.8,
  longRunMaxFraction: { beginner: 0.35, intermediate: 0.3, advanced: 0.28 },
  longRunMaxMeters: { "5k": 16000, "10k": 19000, half_marathon: 22000, marathon: 32000 },
  thresholdMaxFraction: 0.1,
  intervalMaxFraction: 0.08,
  peakWeeklyMeters: {
    "5k": { beginner: 30000, intermediate: 45000, advanced: 65000 },
    "10k": { beginner: 35000, intermediate: 50000, advanced: 70000 },
    half_marathon: { beginner: 40000, intermediate: 55000, advanced: 80000 },
    marathon: { beginner: 50000, intermediate: 70000, advanced: 95000 },
  },
  taperWeeks: { "5k": 1, "10k": 1, half_marathon: 2, marathon: 3 },
  minWeeks: { "5k": 6, "10k": 6, half_marathon: 8, marathon: 12 },
  maxRunDays: { beginner: 4, intermediate: 5, advanced: 6 },
  fallbackEasyPace: { beginner: 420, intermediate: 360, advanced: 315 },
};
