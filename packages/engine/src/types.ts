/**
 * Core domain types for the Adaptive Athlete training engine.
 *
 * Design rules:
 *  - Canonical units: metres, seconds, seconds-per-km, bpm, kg. Conversion happens at the edges.
 *  - Dates are ISO calendar dates (YYYY-MM-DD) in the athlete's local time zone for planning;
 *    instants are ISO-8601 strings with offset.
 *  - Every metric that drives a decision carries provenance (where it came from, how it was derived,
 *    how much we trust it). The engine never treats an estimate as a measurement.
 */

export type IsoDate = string; // YYYY-MM-DD
export type IsoInstant = string; // 2026-10-15T07:30:00-06:00

/** Where a value came from. Adapters map provider data onto these. */
export type DataSource =
  | "manual"
  | "file_import"
  | "apple_health"
  | "garmin"
  | "coros"
  | "strava"
  | "whoop"
  | "oura"
  | "polar"
  | "google_health"
  | "engine";

/** How a value was obtained. Drives UI labelling (observed vs calculated vs estimated). */
export type ValueKind =
  | "measured" // a sensor or timing system recorded it (race chip time, HR strap)
  | "user_reported" // athlete typed it in (RPE, manual pace)
  | "calculated" // deterministic formula over measured/reported data (VDOT from a race)
  | "estimated"; // model-based or low-information inference (VDOT from an easy run)

export interface Provenance {
  source: DataSource;
  kind: ValueKind;
  /** 0..1. How much the engine should trust this value for decisions. */
  confidence: number;
  /** When the underlying observation happened (not when it was imported). */
  observedAt: IsoInstant | IsoDate;
  /** Short human-readable note, e.g. "From 10K race on 2026-09-20". */
  note?: string;
}

export interface Tracked<T> {
  value: T;
  provenance: Provenance;
}

/**
 * Some provider terms restrict what we may do with their data (see docs/INTEGRATIONS.md).
 * Strava's 2026 API policy, for example, prohibits sending its data to AI models.
 * The engine is deterministic and may use any lawfully held data, but the LLM explanation
 * layer must only receive data whose source allows it.
 */
export const LLM_ELIGIBLE_SOURCES: ReadonlySet<DataSource> = new Set<DataSource>([
  "manual",
  "file_import",
  "engine",
  // Others are added only after their current terms are reviewed and recorded in docs/DECISIONS.md.
]);

export type Sport = "run" | "trail_run" | "strength" | "hyrox" | "bike" | "row" | "swim" | "other";

export type RaceDistance = "5k" | "10k" | "half_marathon" | "marathon";

export const RACE_DISTANCE_METERS: Record<RaceDistance, number> = {
  "5k": 5000,
  "10k": 10000,
  half_marathon: 21097.5,
  marathon: 42195,
};

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday

export interface RaceResult {
  id: string;
  date: IsoDate;
  distanceMeters: number;
  finishSeconds: number;
  /** Chip/official time vs. watch/self-timed. */
  timing: "official" | "device" | "self_reported";
  /** Conditions that make the result a poor fitness indicator. */
  conditions?: {
    trail?: boolean;
    elevationGainMeters?: number;
    hot?: boolean; // ≳ 24°C / 75°F
    notAllOut?: boolean; // paced a friend, training run, etc.
  };
}

export interface AthleteProfile {
  id: string;
  birthYear?: number;
  experience: ExperienceLevel;
  /** Recent typical weekly running volume (last ~4 weeks). */
  currentWeeklyRunMeters: Tracked<number>;
  /** Number of weeks the athlete has been running consistently (≥3 runs/week). */
  consistentWeeks: number;
  /** Days the athlete can train, 0 = Monday. */
  availableDays: Weekday[];
  preferredLongRunDay?: Weekday;
  /** Max minutes available per weekday session. */
  maxWeekdayMinutes: number;
  maxWeekendMinutes: number;
  strengthSessionsPerWeek: 0 | 1 | 2 | 3;
  raceHistory: RaceResult[];
  /** Movements to exclude, e.g. "jumping", "running_downhill". Free text tags. */
  exclusions: string[];
}

export interface GoalEvent {
  id: string;
  kind: "race";
  distance: RaceDistance;
  date: IsoDate;
  targetFinishSeconds?: number;
  priority: "A" | "B" | "C";
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export type IntensityZone = "recovery" | "easy" | "marathon" | "threshold" | "interval" | "repetition";

export interface PaceRange {
  /** Faster bound (fewer seconds per km). */
  fastSecPerKm: number;
  slowSecPerKm: number;
}

export interface IntensityTarget {
  zone: IntensityZone;
  pace?: PaceRange;
  /** Target RPE on CR-10 scale. Always present so athletes without pace data can execute. */
  rpe: { min: number; max: number };
  /** Optional heart-rate range when HR zones are known with adequate confidence. */
  heartRate?: { min: number; max: number };
}

export type StepKind = "warmup" | "work" | "recovery" | "cooldown" | "steady" | "station";

export interface WorkoutStep {
  kind: StepKind;
  /** Exactly one of distance or duration is set. */
  distanceMeters?: number;
  durationSeconds?: number;
  target: IntensityTarget;
  /** Repeat this step N times. */
  repeat?: number;
  /** Recovery performed between repeats (N − 1 times). */
  recoveryBetween?: { durationSeconds: number; target: IntensityTarget; note?: string };
  /** Present on `station` steps: what to do at the station, with equipment-aware options. */
  station?: StationPrescription;
  note?: string;
}

export type HyroxStation =
  | "skierg"
  | "sled_push"
  | "sled_pull"
  | "burpee_broad_jump"
  | "row"
  | "farmers_carry"
  | "sandbag_lunges"
  | "wall_balls";

export interface StationOption {
  id: string;
  name: string;
  /** "real" = the actual race station. */
  kind: "real" | "specific" | "support";
  rating: "race" | "best" | "good" | "fallback";
}

export interface StationPrescription {
  station: HyroxStation;
  /** Work for this block, e.g. "500 m", "25 m", "50 reps". */
  volume: string;
  /** Load guidance for the real station, from the rulebook for the athlete's division. */
  raceLoad?: string;
  /** Load for this block when it differs from race load (e.g. lighter for first-timers). */
  load?: string;
  recommended: StationOption | null;
  /** Other options the athlete has equipment for, best first. */
  alternatives: StationOption[];
  /** Set when nothing the athlete has can train this station. */
  unavailableNote?: string;
}

export type SessionType =
  | "rest"
  | "easy_run"
  | "recovery_run"
  | "long_run"
  | "threshold"
  | "intervals"
  | "marathon_pace"
  | "strides"
  | "strength"
  | "cross_train"
  | "race"
  | "race_pace_intervals"
  | "compromised_run"
  | "station_endurance"
  | "half_simulation"
  | "full_simulation";

export const HARD_SESSION_TYPES: ReadonlySet<SessionType> = new Set<SessionType>([
  "threshold",
  "intervals",
  "marathon_pace",
  "race",
  "race_pace_intervals",
  "compromised_run",
  "half_simulation",
  "full_simulation",
]);

export interface PlannedWorkout {
  id: string;
  date: IsoDate;
  sport: Sport;
  type: SessionType;
  title: string;
  objective: string;
  /** Why this session exists in the plan, in plain language. */
  rationale: string;
  steps: WorkoutStep[];
  estimatedMinutes: number;
  plannedDistanceMeters?: number;
  /** Load estimate (duration-min × target RPE) for weekly balancing. */
  plannedLoad: number;
  scaling: { easier: string; harder?: string };
  substitutions: string[];
  /** Set when the adaptation engine modified this workout. */
  adaptedBy?: string;
}

export type Phase = "base" | "build" | "peak" | "taper";

export interface PlanWeek {
  index: number; // 0-based
  startDate: IsoDate; // Monday
  phase: Phase;
  isRecoveryWeek: boolean;
  targetRunMeters: number;
  workouts: PlannedWorkout[];
}

/** A HYROX Singles race goal. Division and sex set the station loads. */
export interface HyroxGoal {
  id: string;
  kind: "hyrox";
  date: IsoDate;
  division: "open" | "pro";
  sex: "women" | "men";
  targetFinishSeconds?: number;
  priority: "A" | "B" | "C";
}

export interface TrainingPlan {
  id: string;
  athleteId: string;
  goal: GoalEvent | HyroxGoal;
  createdAt: IsoInstant;
  /** Monotonic; each adaptation produces a new version, prior versions are retained. */
  version: number;
  basis: {
    vdot: Tracked<number> | null;
    paces: TrainingPaces | null;
    startingWeeklyMeters: number;
    /** Easy pace assumed for time conversion when `paces` is null. */
    fallbackEasyPace: number;
    /** Date targets were last recalculated by the adaptation engine. */
    lastTargetUpdate?: IsoDate;
    notes: string[];
  };
  weeks: PlanWeek[];
}

export interface TrainingPaces {
  easy: PaceRange;
  marathon: PaceRange;
  threshold: PaceRange;
  interval: PaceRange;
  repetition: PaceRange;
}

// ---------------------------------------------------------------------------
// Completed workouts & recovery
// ---------------------------------------------------------------------------

export interface CompletedSplit {
  distanceMeters?: number;
  durationSeconds: number;
  avgHeartRate?: number;
  /** Which planned step index this split corresponds to, when known. */
  plannedStepIndex?: number;
}

export interface CompletedWorkout {
  id: string;
  plannedWorkoutId?: string;
  date: IsoDate;
  sport: Sport;
  status: "completed" | "partial" | "skipped";
  source: DataSource;
  durationSeconds?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  /** Work-interval splits, if recorded. */
  splits?: CompletedSplit[];
  /** Session RPE (CR-10), reported ~30 min after. */
  rpe?: number;
  /** 0 = none … 10 = worst. Any pain report is a safety signal, not a diagnosis. */
  pain?: { level: number; location?: string; alteredMovement?: boolean };
  soreness?: number;
  fatigue?: number;
  notes?: string;
}

export interface DailyRecovery {
  date: IsoDate;
  source: DataSource;
  hrvMs?: number; // RMSSD where the provider exposes it; providers differ — never mix sources in one baseline
  restingHr?: number;
  sleepHours?: number;
}

// ---------------------------------------------------------------------------
// Adaptation
// ---------------------------------------------------------------------------

export type AdaptationAction =
  | "keep"
  | "progress"
  | "reduce_intensity"
  | "reduce_volume"
  | "replace_easier"
  | "reschedule"
  | "add_recovery"
  | "recalculate_targets"
  | "reassess_block"
  | "ask_clarification";

export interface Evidence {
  /** Machine-readable signal id, e.g. "rpe_above_target_trend". */
  signal: string;
  description: string;
  sources: DataSource[];
  /** Data points the rule looked at (ids or dates), for audit. */
  refs: string[];
}

export interface WorkoutChange {
  workoutId: string;
  before: PlannedWorkout | null;
  after: PlannedWorkout | null;
  summary: string;
}

export interface AdaptationDecision {
  ruleId: string;
  ruleVersion: number;
  action: AdaptationAction;
  /** Higher wins when rules conflict. */
  priority: number;
  confidence: number;
  whatChanged: string;
  why: string;
  nextSteps: string;
  evidence: Evidence[];
  changes: WorkoutChange[];
  /** Set when the decision revises the plan's fitness basis (VDOT and derived paces). */
  targetUpdate?: { vdot: number };
  /** When set, the engine needs athlete input before acting. */
  question?: string;
}
