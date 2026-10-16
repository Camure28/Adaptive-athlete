/**
 * Imported activities: the one shape every wearable/provider adapter produces.
 *
 * The pipeline (docs/INTEGRATIONS.md, "Import pipeline"):
 *   provider data → adapter (e.g. fromHealthKitWorkout) → ImportedActivity (validated)
 *   → decideImport (idempotency, duplicates, merge with a manual log)
 *   → matchToPlan (which planned session it fulfils)
 *   → toCompletedWorkout → saved → athleteFollowUp (what to ask the athlete).
 *
 * Everything here is pure: no HealthKit, no network, no database. The app's native layer only has
 * to turn provider objects into the adapter input types.
 */
import type { CompletedSplit, DataSource, IsoDate, IsoInstant, Sport } from "../types.js";

export interface ImportedActivity {
  /** The channel we received it through (e.g. "apple_health"), which is what our terms depend on. */
  source: Exclude<DataSource, "manual" | "engine">;
  /** Provider's stable id (HealthKit workout UUID). Makes re-imports idempotent. */
  externalId: string;
  /** The app that recorded it, when the channel reports it (e.g. "Garmin Connect", "Strava", "Workout"). */
  originApp?: string;
  originBundleId?: string;
  device?: string;
  sport: Sport;
  /** The provider's own activity type, kept for audit and for better mapping later. */
  providerType: string;
  startedAt: IsoInstant;
  endedAt: IsoInstant;
  durationSeconds: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  elevationGainMeters?: number;
  activeEnergyKcal?: number;
  indoor?: boolean;
  splits?: CompletedSplit[];
}

export interface ValidationResult {
  activity: ImportedActivity | null;
  /** Values we dropped and why. Shown in the import log, never silently discarded. */
  warnings: string[];
}

/** Same limits as the completed_workouts table checks, so nothing valid here fails on insert. */
export const IMPORT_LIMITS = {
  maxDurationSeconds: 86_400,
  maxDistanceMeters: 500_000,
  minHeartRate: 25,
  maxHeartRate: 250,
  /** Shorter than this is almost always an accidental start/stop on the watch. */
  minDurationSeconds: 120,
} as const;

/**
 * Drops impossible values instead of rejecting the whole workout: a bad heart-rate reading should
 * not cost the athlete their distance and duration. Rejects only what can't be a real session.
 */
export function validateActivity(a: ImportedActivity): ValidationResult {
  const warnings: string[] = [];
  const start = Date.parse(a.startedAt);
  const end = Date.parse(a.endedAt);
  if (!a.externalId) return { activity: null, warnings: ["missing provider id"] };
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return { activity: null, warnings: ["invalid start/end time"] };
  if (!(a.durationSeconds > 0) || a.durationSeconds > IMPORT_LIMITS.maxDurationSeconds) {
    return { activity: null, warnings: [`duration out of range (${a.durationSeconds}s)`] };
  }
  if (a.durationSeconds < IMPORT_LIMITS.minDurationSeconds) {
    return { activity: null, warnings: [`too short to be a session (${Math.round(a.durationSeconds)}s)`] };
  }

  const out: ImportedActivity = { ...a, durationSeconds: Math.round(a.durationSeconds) };
  const hrOk = (v: number) => v >= IMPORT_LIMITS.minHeartRate && v <= IMPORT_LIMITS.maxHeartRate;

  if (out.distanceMeters !== undefined) {
    if (!(out.distanceMeters >= 0) || out.distanceMeters > IMPORT_LIMITS.maxDistanceMeters) {
      warnings.push(`distance dropped (${out.distanceMeters} m)`);
      delete out.distanceMeters;
    } else {
      out.distanceMeters = Math.round(out.distanceMeters);
      if (out.distanceMeters === 0) delete out.distanceMeters;
    }
  }
  for (const key of ["avgHeartRate", "maxHeartRate"] as const) {
    const v = out[key];
    if (v === undefined) continue;
    if (!hrOk(v)) {
      warnings.push(`${key === "avgHeartRate" ? "average" : "max"} heart rate dropped (${v} bpm)`);
      delete out[key];
    } else out[key] = Math.round(v);
  }
  if (out.avgHeartRate !== undefined && out.maxHeartRate !== undefined && out.maxHeartRate < out.avgHeartRate) {
    warnings.push("max heart rate below average; both dropped");
    delete out.avgHeartRate;
    delete out.maxHeartRate;
  }
  if (out.elevationGainMeters !== undefined && !(out.elevationGainMeters >= 0 && out.elevationGainMeters < 10_000)) {
    warnings.push(`elevation dropped (${out.elevationGainMeters} m)`);
    delete out.elevationGainMeters;
  }
  return { activity: out, warnings };
}

/** The athlete's calendar date for an instant, in their time zone (plans are in local dates). */
export function localDate(instant: IsoInstant, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
