/** Adaptation thresholds. Reviewable coaching parameters; see docs/ADAPTATION_ENGINE.md. */

export interface AdaptationConfig {
  /** Pain at or above this (0–10) on any recent session triggers the safety rule. */
  painThreshold: number;
  painLookbackDays: number;
  /** Days of protected (no hard running) schedule after a pain report. */
  painProtectDays: number;

  /** Number of recent key sessions examined for effort trends. */
  trendWindow: number;
  /** How many of those must show the signal before acting. */
  trendMinHits: number;
  /** Reported RPE this far above the prescribed max counts as "harder than intended". */
  rpeExcess: number;
  /** Work-interval pace slower than target by more than this fraction counts as a shortfall. */
  paceShortfall: number;

  /** Recovery baseline needs at least this many days from a single source. */
  recoveryMinBaselineDays: number;
  recoveryWindowDays: number;
  recoveryMinFlaggedDays: number;
  hrvSdBelow: number;
  restingHrAbove: number;

  /** Acute:chronic ratio above which the next week's volume is trimmed. */
  acwrHigh: number;
  loadSpikeReduction: number;

  /** Fraction of planned sessions missed in the last 7 days that triggers a volume reset. */
  missedFraction: number;
  missedReduction: number;

  /** VDOT increase per progression decision, and minimum days between progressions. */
  progressionStep: number;
  progressionMinIntervalDays: number;
  /** A new race changes targets only if VDOT differs by at least this much. */
  raceRecalcThreshold: number;
  raceRecalcMinConfidence: number;
  /** Largest downward VDOT revision applied at once. */
  maxVdotDrop: number;

  /** Guardrail: max reduction of next 7 days' planned load from all decisions combined. */
  maxWeeklyLoadReduction: number;
}

export const DEFAULT_ADAPTATION_CONFIG: AdaptationConfig = {
  painThreshold: 4,
  painLookbackDays: 3,
  painProtectDays: 5,

  trendWindow: 3,
  trendMinHits: 2,
  rpeExcess: 1.5,
  paceShortfall: 0.04,

  recoveryMinBaselineDays: 14,
  recoveryWindowDays: 5,
  recoveryMinFlaggedDays: 3,
  hrvSdBelow: 1,
  restingHrAbove: 5,

  acwrHigh: 1.5,
  loadSpikeReduction: 0.15,

  missedFraction: 0.5,
  missedReduction: 0.2,

  progressionStep: 0.5,
  progressionMinIntervalDays: 21,
  raceRecalcThreshold: 1,
  raceRecalcMinConfidence: 0.6,
  maxVdotDrop: 2,

  maxWeeklyLoadReduction: 0.4,
};
