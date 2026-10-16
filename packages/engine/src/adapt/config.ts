/**
 * Adaptation thresholds: the numbers in docs/ADAPTATION_ENGINE.md (approved 2026-10-16).
 * Reviewable coaching parameters; change them only with the product owner and bump the rule version.
 */

export interface AdaptationConfig {
  // S — Safety
  /** S-1: pain at or above this (0–10). */
  painThreshold: number;
  /** S-2: pain at or above this means rest only. */
  painSevere: number;
  /** S-1: days movements stay removed after a report; also the lookback for "same area twice". */
  painMovementDays: number;
  /** S-1: days after a report in which hard sessions are eased. */
  painEaseDays: number;
  /** S-3: days of easy or rest after "not feeling 100%". */
  illnessEaseDays: number;

  // F — Fatigue
  /** RPE this far above the session's target counts as "much harder than intended" (F-1, F-2, P-3). */
  rpeMargin: number;
  /** F-2: hard-session work volume multiplier for the next week. */
  hardVolumeReduction: number;
  /** F-4: baseline days from one source, and days present in the last 7. */
  recoveryBaselineDays: number;
  recoveryRecentMinDays: number;
  recoveryFlaggedDays: number;
  hrvSdBelow: number;
  /** F-5: fatigue or soreness (1–5) at or above this on 3 consecutive logs. */
  fatigueHigh: number;
  /** F-6 (load spike, kept by the product owner): acute:chronic ratio threshold and easy-run trim. */
  acwrHigh: number;
  loadSpikeReduction: number;

  // A — Adherence
  /** A-2: trim to non-key sessions when the athlete chooses to pull back. */
  pullBackReduction: number;
  /** A-3: days with nothing logged before the check-in; re-entry and reassess thresholds. */
  checkInAfterDays: number;
  reentryAfterDays: number;
  reassessAfterDays: number;
  reentryFactor: number;

  // P — Progression
  /** P-1: pace step per progression (fraction faster). */
  progressionPaceStep: number;
  /** P-3: pace easing after two misses. */
  easePaceStep: number;

  // T — Targets
  /** A benchmark changes targets only if VDOT differs by at least this. */
  raceRecalcThreshold: number;
  raceRecalcMinConfidence: number;
  /** Benchmarks older than this are not used. */
  benchmarkMaxAgeDays: number;
  benchmarkMinMeters: number;

  // Guardrails (§4)
  /** Max faster change to threshold pace per week. */
  maxPaceGainPerWeek: number;
  /** Max weekly run volume increase over the previous non-recovery week. */
  maxWeeklyVolumeIncrease: number;
  /** Max combined reduction of the next 7 days' planned load (safety exempt). */
  maxWeeklyLoadReduction: number;
}

export const DEFAULT_ADAPTATION_CONFIG: AdaptationConfig = {
  painThreshold: 4,
  painSevere: 7,
  painMovementDays: 7,
  painEaseDays: 3,
  illnessEaseDays: 2,

  rpeMargin: 2,
  hardVolumeReduction: 0.2,
  recoveryBaselineDays: 28,
  recoveryRecentMinDays: 5,
  recoveryFlaggedDays: 3,
  hrvSdBelow: 1,
  fatigueHigh: 4,
  acwrHigh: 1.5,
  loadSpikeReduction: 0.15,

  pullBackReduction: 0.15,
  checkInAfterDays: 4,
  reentryAfterDays: 7,
  reassessAfterDays: 14,
  reentryFactor: 0.7,

  progressionPaceStep: 0.02,
  easePaceStep: 0.02,

  raceRecalcThreshold: 1,
  raceRecalcMinConfidence: 0.6,
  benchmarkMaxAgeDays: 84,
  benchmarkMinMeters: 3000,

  maxPaceGainPerWeek: 0.03,
  maxWeeklyVolumeIncrease: 0.1,
  maxWeeklyLoadReduction: 0.3,
};
