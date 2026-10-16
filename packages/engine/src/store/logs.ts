/**
 * Workout logs (D-025). Manual logs and imports end up in the same shape: the engine's
 * CompletedWorkout, stored as a completed_workouts row
 * (supabase/migrations/20261016000007_workout_logging.sql). The import pipeline's
 * ImportedActivity adds the device fields (start/end, origin app, device, elevation, energy).
 */
import type { ImportedActivity } from "../imports/activity.js";
import { IMPORT_LIMITS } from "../imports/activity.js";
import type { BodyArea, CompletedSplit, CompletedWorkout, IsoDate, IsoInstant, PainReport } from "../types.js";

/**
 * Where it hurts, as the athlete chooses it on the log screen: by body area, never by diagnosis
 * (ADAPTATION_ENGINE.md S-1). Default list chosen by the product owner 2026-10-16, awaiting coach review.
 */
export const LOG_BODY_AREAS = [
  "foot_ankle", "calf_shin", "knee", "thigh_hamstring", "hip_glute",
  "lower_back", "upper_back_neck", "shoulder", "elbow_wrist_hand", "other",
] as const;
export type LogBodyArea = (typeof LOG_BODY_AREAS)[number];

/**
 * Each logged area's group in the approved pain map (D-024, adapt/pain-map.ts). Thigh/hamstring and
 * upper back/neck have no movement list yet, so they go to "other": hard days are still eased,
 * no movements are removed (product owner 2026-10-16).
 */
export const PAIN_GROUP: Readonly<Record<LogBodyArea, BodyArea>> = {
  foot_ankle: "foot_ankle_lower_leg",
  calf_shin: "foot_ankle_lower_leg",
  knee: "knee",
  thigh_hamstring: "other",
  hip_glute: "lower_back_hip",
  lower_back: "lower_back_hip",
  upper_back_neck: "other",
  shoulder: "shoulder_arm",
  elbow_wrist_hand: "shoulder_arm",
  other: "other",
};

const isLogArea = (x: string): x is LogBodyArea => (LOG_BODY_AREAS as readonly string[]).includes(x);

/** Fatigue and soreness are 1–5 (product owner 2026-10-16; rule F-5 uses ≥ 4/5). RPE and pain are 0–10. */
export const LOG_SCALES = { rpe: [0, 10], pain: [1, 10], fatigue: [1, 5], soreness: [1, 5] } as const;

/** What the athlete enters on the log screen. */
export interface ManualLog {
  plannedWorkoutId?: string;
  date: IsoDate;
  sport: CompletedWorkout["sport"];
  status: CompletedWorkout["status"];
  durationSeconds?: number;
  distanceMeters?: number;
  rpe?: number;
  /** null = answered "no pain"; undefined = not answered. */
  pain?: { level: number; location: LogBodyArea; alteredMovement: boolean; sharp: boolean; stoppedSession: boolean } | null;
  fatigue?: number;
  soreness?: number;
  notes?: string;
}

export type LogErrors = Partial<Record<"rpe" | "pain" | "painLocation" | "duration" | "distance" | "fatigue" | "soreness" | "notes", string>>;

const inRange = (v: number, [lo, hi]: readonly [number, number]) => Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Checks a manual log. For a session that was done (fully or partly) the rubric needs effort and
 * the pain answer, so both are required; a skipped session needs neither.
 */
export function validateManualLog(log: ManualLog): LogErrors {
  const e: LogErrors = {};
  if (log.notes !== undefined && log.notes.length > 2000) e.notes = "Keep the note under 2,000 characters.";
  if (log.status === "skipped") return e;
  if (log.rpe === undefined) e.rpe = "How hard was it? Pick a number from 0 to 10.";
  else if (!inRange(log.rpe, LOG_SCALES.rpe)) e.rpe = "Effort is 0 to 10.";
  if (log.pain === undefined) e.pain = "Tell us whether anything hurt.";
  else if (log.pain !== null) {
    if (!Number.isInteger(log.pain.level) || !inRange(log.pain.level, LOG_SCALES.pain)) e.pain = "Rate the pain from 1 to 10.";
    if (!isLogArea(log.pain.location)) e.painLocation = "Choose where it hurt.";
  }
  if (log.durationSeconds !== undefined && !(log.durationSeconds > 0 && log.durationSeconds <= IMPORT_LIMITS.maxDurationSeconds)) {
    e.duration = "Enter how long the session took.";
  }
  if (log.distanceMeters !== undefined && !(log.distanceMeters >= 0 && log.distanceMeters <= IMPORT_LIMITS.maxDistanceMeters)) {
    e.distance = "That distance doesn't look right.";
  }
  if (log.fatigue !== undefined && !(Number.isInteger(log.fatigue) && inRange(log.fatigue, LOG_SCALES.fatigue))) e.fatigue = "Fatigue is 1 to 5.";
  if (log.soreness !== undefined && !(Number.isInteger(log.soreness) && inRange(log.soreness, LOG_SCALES.soreness))) e.soreness = "Soreness is 1 to 5.";
  return e;
}

/** A validated manual log as a CompletedWorkout. Skipped sessions keep only status, date and note. */
export function fromManualLog(log: ManualLog, id: string): CompletedWorkout {
  const c: CompletedWorkout = { id, date: log.date, sport: log.sport, status: log.status, source: "manual" };
  if (log.plannedWorkoutId) c.plannedWorkoutId = log.plannedWorkoutId;
  const note = log.notes?.trim();
  if (note) c.notes = note;
  if (log.status === "skipped") return c;
  if (log.durationSeconds !== undefined) c.durationSeconds = Math.round(log.durationSeconds);
  if (log.distanceMeters !== undefined && log.distanceMeters > 0) c.distanceMeters = Math.round(log.distanceMeters);
  if (log.rpe !== undefined) c.rpe = log.rpe;
  if (log.pain !== undefined) c.pain = log.pain === null ? { level: 0 } : painReport(log.pain.level, log.pain.location, log.pain);
  if (log.fatigue !== undefined) c.fatigue = log.fatigue;
  if (log.soreness !== undefined) c.soreness = log.soreness;
  return c;
}

/** The engine's pain report for a logged area: the athlete's exact choice plus its pain-map group. */
function painReport(level: number, location: string | null, flags: { alteredMovement?: boolean | null; sharp?: boolean | null; stoppedSession?: boolean | null }): PainReport {
  const p: PainReport = { level };
  if (location !== null) {
    p.location = location;
    if (isLogArea(location)) p.area = PAIN_GROUP[location];
  }
  if (flags.alteredMovement != null) p.alteredMovement = flags.alteredMovement;
  if (flags.sharp != null) p.sharp = flags.sharp;
  if (flags.stoppedSession != null) p.stoppedSession = flags.stoppedSession;
  return p;
}

/** A completed_workouts row (columns the app and the import function write). */
export interface LogRow {
  athlete_id: string;
  plan_id: string | null;
  workout_key: string | null;
  workout_date: IsoDate;
  sport: string;
  status: CompletedWorkout["status"];
  source: CompletedWorkout["source"];
  external_id: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  rpe: number | null;
  soreness: number | null;
  fatigue: number | null;
  pain_level: number | null;
  pain_location: string | null;
  pain_altered_movement: boolean | null;
  pain_sharp: boolean | null;
  pain_stopped_session: boolean | null;
  splits: CompletedSplit[] | null;
  notes: string | null;
  started_at: IsoInstant | null;
  ended_at: IsoInstant | null;
  origin_app: string | null;
  device: string | null;
  elevation_gain_meters: number | null;
  active_energy_kcal: number | null;
}

/**
 * Planned session ids are `<plan id>:<workout_key>` (D-022); plan ids are UUIDs, so the key is
 * everything after the first colon.
 */
export function splitPlannedId(plannedWorkoutId: string): { planId: string; workoutKey: string } {
  const i = plannedWorkoutId.indexOf(":");
  if (i <= 0 || i === plannedWorkoutId.length - 1) throw new Error(`Not a planned session id: ${plannedWorkoutId}`);
  return { planId: plannedWorkoutId.slice(0, i), workoutKey: plannedWorkoutId.slice(i + 1) };
}

/** The row to store. Pass the imported activity for imports, so its device fields are kept. */
export function toLogRow(c: CompletedWorkout, athleteId: string, activity?: ImportedActivity): LogRow {
  const planned = c.plannedWorkoutId ? splitPlannedId(c.plannedWorkoutId) : null;
  return {
    athlete_id: athleteId,
    plan_id: planned?.planId ?? null,
    workout_key: planned?.workoutKey ?? null,
    workout_date: c.date,
    sport: c.sport,
    status: c.status,
    source: c.source,
    external_id: activity?.externalId ?? null,
    duration_seconds: c.durationSeconds ?? null,
    distance_meters: c.distanceMeters ?? null,
    avg_heart_rate: c.avgHeartRate ?? null,
    max_heart_rate: c.maxHeartRate ?? null,
    rpe: c.rpe ?? null,
    soreness: c.soreness ?? null,
    fatigue: c.fatigue ?? null,
    pain_level: c.pain?.level ?? null,
    pain_location: c.pain?.location ?? null,
    pain_altered_movement: c.pain?.alteredMovement ?? null,
    pain_sharp: c.pain?.sharp ?? null,
    pain_stopped_session: c.pain?.stoppedSession ?? null,
    splits: c.splits ?? null,
    notes: c.notes ?? null,
    started_at: activity?.startedAt ?? null,
    ended_at: activity?.endedAt ?? null,
    origin_app: activity?.originApp ?? null,
    device: activity?.device ?? null,
    elevation_gain_meters: activity?.elevationGainMeters !== undefined ? Math.round(activity.elevationGainMeters) : null,
    active_energy_kcal: activity?.activeEnergyKcal !== undefined ? Math.round(activity.activeEnergyKcal) : null,
  };
}

/** A stored row back as a CompletedWorkout. `rpe` arrives as a string from numeric columns. */
export function fromLogRow(row: LogRow & { id: string }): CompletedWorkout {
  const c: CompletedWorkout = { id: row.id, date: row.workout_date, sport: row.sport as CompletedWorkout["sport"], status: row.status, source: row.source };
  if (row.plan_id && row.workout_key) c.plannedWorkoutId = `${row.plan_id}:${row.workout_key}`;
  if (row.duration_seconds !== null) c.durationSeconds = row.duration_seconds;
  if (row.distance_meters !== null) c.distanceMeters = row.distance_meters;
  if (row.avg_heart_rate !== null) c.avgHeartRate = row.avg_heart_rate;
  if (row.max_heart_rate !== null) c.maxHeartRate = row.max_heart_rate;
  if (row.splits !== null) c.splits = row.splits;
  if (row.rpe !== null) c.rpe = Number(row.rpe);
  if (row.pain_level !== null) {
    c.pain = row.pain_level === 0
      ? { level: 0 }
      : painReport(row.pain_level, row.pain_location, { alteredMovement: row.pain_altered_movement, sharp: row.pain_sharp, stoppedSession: row.pain_stopped_session });
  }
  if (row.soreness !== null) c.soreness = row.soreness;
  if (row.fatigue !== null) c.fatigue = row.fatigue;
  if (row.notes !== null) c.notes = row.notes;
  return c;
}
