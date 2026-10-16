/**
 * Import decisions: is this activity new, a re-delivery, a duplicate of one we already have,
 * or the device version of a session the athlete already logged by hand?
 *
 * Why duplicates happen: the same run can reach Apple Health twice (Apple Watch records it and
 * Garmin Connect or Strava also writes it), or arrive later through a second provider. Each copy
 * has its own provider id, so ids alone can't catch it; overlapping time and the same kind of
 * sport can.
 */
import type { CompletedWorkout, Sport } from "../types.js";
import type { ImportedActivity } from "./activity.js";
import { localDate } from "./activity.js";

/** An activity already stored (from the completed_workouts table). */
export interface StoredActivity {
  id: string;
  source: CompletedWorkout["source"];
  externalId?: string;
  sport: Sport;
  date: string;
  /** Present for imports; manual logs usually only have a date. */
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  hasSplits?: boolean;
}

export type ImportDecision =
  | { action: "insert" }
  /** Same provider id seen again; update it only if the provider edited the workout. */
  | { action: "unchanged"; id: string }
  | { action: "update"; id: string }
  /** Another copy of an activity we already hold, which has at least as much data. */
  | { action: "skip_duplicate"; duplicateOf: string; reason: string }
  /** We hold a copy from another channel with less data: replace it with this one. */
  | { action: "replace"; id: string; reason: string }
  /** The athlete logged this by hand: attach the device data to their log. */
  | { action: "merge_into_manual"; id: string; reason: string };

export interface DedupeConfig {
  /** Overlap as a share of the shorter activity for two imports to count as one session. */
  minOverlap: number;
  /** Manual log and import within this share of each other's duration count as the same session. */
  manualDurationTolerance: number;
}

export const DEFAULT_DEDUPE_CONFIG: DedupeConfig = { minOverlap: 0.6, manualDurationTolerance: 0.35 };

type Family = "run" | "strength" | "mixed" | "bike" | "row" | "swim";
const family = (s: Sport): Family => {
  if (s === "run" || s === "trail_run") return "run";
  if (s === "strength") return "strength";
  if (s === "bike" || s === "row" || s === "swim") return s;
  return "mixed"; // hyrox, other
};
/** Watches label the same mixed session differently (HIIT vs functional strength), so allow that pair. */
const sameSession = (a: Sport, b: Sport) => {
  const fa = family(a);
  const fb = family(b);
  return fa === fb || (fa === "mixed" && fb === "strength") || (fa === "strength" && fb === "mixed");
};

/** How much decision-useful data a copy carries. Ties keep the copy we already have. */
export function richness(a: { avgHeartRate?: number; maxHeartRate?: number; distanceMeters?: number; hasSplits?: boolean; splits?: unknown[] }): number {
  return (a.avgHeartRate !== undefined ? 2 : 0) + (a.maxHeartRate !== undefined ? 1 : 0) + (a.distanceMeters !== undefined ? 1 : 0) +
    (a.hasSplits || (a.splits?.length ?? 0) > 0 ? 2 : 0);
}

function overlapShare(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s1 = Date.parse(aStart), e1 = Date.parse(aEnd), s2 = Date.parse(bStart), e2 = Date.parse(bEnd);
  const overlap = Math.min(e1, e2) - Math.max(s1, s2);
  const shorter = Math.min(e1 - s1, e2 - s2);
  return overlap > 0 && shorter > 0 ? overlap / shorter : 0;
}

const changed = (a: ImportedActivity, s: StoredActivity) =>
  a.durationSeconds !== s.durationSeconds || a.distanceMeters !== s.distanceMeters ||
  a.avgHeartRate !== s.avgHeartRate || a.maxHeartRate !== s.maxHeartRate || a.startedAt !== s.startedAt || a.endedAt !== s.endedAt;

/**
 * Decide what to do with one validated activity, given the athlete's stored activities around that
 * date (pass at least the same day ± 1). Order of checks matters: same id first, then other imports,
 * then manual logs.
 */
export function decideImport(
  a: ImportedActivity,
  stored: readonly StoredActivity[],
  timeZone: string,
  config: DedupeConfig = DEFAULT_DEDUPE_CONFIG,
): ImportDecision {
  const same = stored.find((s) => s.source === a.source && s.externalId === a.externalId);
  if (same) return changed(a, same) ? { action: "update", id: same.id } : { action: "unchanged", id: same.id };

  const imports = stored.filter((s) => s.startedAt && s.endedAt && s.source !== "manual");
  for (const s of imports) {
    if (!sameSession(a.sport, s.sport)) continue;
    const share = overlapShare(a.startedAt, a.endedAt, s.startedAt!, s.endedAt!);
    if (share < config.minOverlap) continue;
    const reason = `overlaps ${Math.round(share * 100)}% with an activity already imported from ${s.source}`;
    return richness(a) > richness(s) ? { action: "replace", id: s.id, reason: `${reason}; this copy has more data` } : { action: "skip_duplicate", duplicateOf: s.id, reason };
  }

  const day = localDate(a.startedAt, timeZone);
  const manual = stored.filter((s) => s.source === "manual" && s.date === day && sameSession(a.sport, s.sport));
  // Only one hand log the import could belong to, or one clearly closest by duration.
  const fits = manual.filter((m) => {
    if (m.durationSeconds === undefined) return true;
    return Math.abs(m.durationSeconds - a.durationSeconds) / Math.max(m.durationSeconds, a.durationSeconds) <= config.manualDurationTolerance;
  });
  if (fits.length === 1) return { action: "merge_into_manual", id: fits[0]!.id, reason: "matches a session the athlete logged by hand that day" };
  return { action: "insert" };
}

export interface ManualMerge {
  /** The athlete's log with blanks filled from the device. */
  merged: CompletedWorkout;
  /** Values the athlete typed that the device disagrees with by more than 10%. The app asks which to keep. */
  conflicts: Array<{ field: "durationSeconds" | "distanceMeters" | "avgHeartRate" | "maxHeartRate"; athlete: number; device: number }>;
}

/**
 * Attach device data to a hand-logged session. The athlete's own entries win (they may have
 * corrected a watch that was left running); the device only fills what they left blank, and any
 * real disagreement is surfaced, not resolved silently. RPE, pain, soreness, notes and status are
 * always the athlete's.
 */
export function mergeIntoManual(manual: CompletedWorkout, a: ImportedActivity): ManualMerge {
  const merged: CompletedWorkout = { ...manual };
  const conflicts: ManualMerge["conflicts"] = [];
  for (const field of ["durationSeconds", "distanceMeters", "avgHeartRate", "maxHeartRate"] as const) {
    const device = a[field];
    if (device === undefined) continue;
    const athlete = manual[field];
    if (athlete === undefined) merged[field] = device;
    else if (Math.abs(athlete - device) / Math.max(athlete, device) > 0.1) conflicts.push({ field, athlete, device });
  }
  return { merged, conflicts };
}
