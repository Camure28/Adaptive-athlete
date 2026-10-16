/**
 * The log-a-session form (D-025): its state, prefill from the planned session, and conversion to
 * the engine's ManualLog. Pure, so it's unit-tested. Validation rules live in the engine
 * (validateManualLog) so the app and future server checks agree.
 */
import {
  METERS_PER_MILE,
  validateManualLog,
  type LogBodyArea,
  type CompletedWorkout,
  type LogErrors,
  type ManualLog,
  type PlannedWorkout,
} from "@adaptive-athlete/engine";
import { toMeters, type Units } from "@/onboarding/model";

export type LogStatus = CompletedWorkout["status"];

export interface LogForm {
  status: LogStatus | null;
  minutes: string;
  distance: string; // in the athlete's units
  rpe: number | null;
  hurt: boolean | null;
  painLevel: number | null;
  painArea: LogBodyArea | null;
  painAltered: boolean | null;
  painSharp: boolean | null;
  painStopped: boolean | null;
  fatigue: number | null;
  soreness: number | null;
  notes: string;
}

/** Awaiting coach review (product owner chose the default list 2026-10-16). */
export const BODY_AREA_LABELS: Record<LogBodyArea, string> = {
  foot_ankle: "Foot or ankle",
  calf_shin: "Calf or shin",
  knee: "Knee",
  thigh_hamstring: "Thigh or hamstring",
  hip_glute: "Hip or glute",
  lower_back: "Lower back",
  upper_back_neck: "Upper back or neck",
  shoulder: "Shoulder",
  elbow_wrist_hand: "Elbow, wrist or hand",
  other: "Somewhere else",
};

/** Distance is asked only for sessions that are mostly running. */
export const asksDistance = (w: PlannedWorkout): boolean => w.sport === "run" || w.sport === "trail_run";

const fromMeters = (m: number, units: Units): string => String(Math.round((m / (units === "mi" ? METERS_PER_MILE : 1000)) * 100) / 100);

/** A new form prefilled from the plan, or the stored log when editing. */
export function formFor(w: PlannedWorkout, units: Units, existing?: CompletedWorkout): LogForm {
  if (existing) {
    const hurt = existing.pain === undefined ? null : existing.pain.level > 0;
    return {
      status: existing.status,
      minutes: existing.durationSeconds !== undefined ? String(Math.round(existing.durationSeconds / 60)) : String(w.estimatedMinutes),
      distance: existing.distanceMeters !== undefined ? fromMeters(existing.distanceMeters, units) : "",
      rpe: existing.rpe ?? null,
      hurt,
      painLevel: hurt ? existing.pain!.level : null,
      painArea: hurt ? ((existing.pain!.location as LogBodyArea | undefined) ?? null) : null,
      painAltered: hurt ? (existing.pain!.alteredMovement ?? null) : null,
      painSharp: hurt ? (existing.pain!.sharp ?? null) : null,
      painStopped: hurt ? (existing.pain!.stoppedSession ?? null) : null,
      fatigue: existing.fatigue ?? null,
      soreness: existing.soreness ?? null,
      notes: existing.notes ?? "",
    };
  }
  return {
    status: null,
    minutes: String(w.estimatedMinutes),
    distance: asksDistance(w) && w.plannedDistanceMeters ? fromMeters(w.plannedDistanceMeters, units) : "",
    rpe: null,
    hurt: null,
    painLevel: null,
    painArea: null,
    painAltered: null,
    painSharp: null,
    painStopped: null,
    fatigue: null,
    soreness: null,
    notes: "",
  };
}

export type FormErrors = LogErrors & { status?: string; painAltered?: string; painSharp?: string; painStopped?: string };

/** The ManualLog for this form, or the errors to show. */
export function toManualLog(f: LogForm, w: PlannedWorkout, units: Units): { log: ManualLog } | { errors: FormErrors } {
  if (!f.status) return { errors: { status: "Did you do this session?" } };
  const log: ManualLog = { plannedWorkoutId: w.id, date: w.date, sport: w.sport, status: f.status };
  if (f.notes.trim()) log.notes = f.notes.trim();
  const errors: FormErrors = {};
  if (f.status !== "skipped") {
    const mins = Number(f.minutes);
    log.durationSeconds = f.minutes.trim() === "" || Number.isNaN(mins) ? NaN : mins * 60;
    if (asksDistance(w) && f.distance.trim() !== "") {
      const d = Number(f.distance);
      log.distanceMeters = Number.isNaN(d) ? NaN : toMeters(d, units);
    }
    if (f.rpe !== null) log.rpe = f.rpe;
    if (f.hurt === false) log.pain = null;
    if (f.hurt === true) {
      if (f.painSharp === null) errors.painSharp = "Was it sharp?";
      if (f.painStopped === null) errors.painStopped = "Did it make you stop?";
      if (f.painAltered === null) errors.painAltered = "Did it change how you moved?";
      log.pain = {
        level: f.painLevel ?? 0,
        location: f.painArea ?? ("" as LogBodyArea),
        alteredMovement: f.painAltered ?? false,
        sharp: f.painSharp ?? false,
        stoppedSession: f.painStopped ?? false,
      };
    }
    if (f.fatigue !== null) log.fatigue = f.fatigue;
    if (f.soreness !== null) log.soreness = f.soreness;
  }
  Object.assign(errors, validateManualLog(log));
  return Object.keys(errors).length > 0 ? { errors } : { log };
}

/** Short summary for the plan list, e.g. "DONE · RPE 7". */
export function logBadge(c: CompletedWorkout): string {
  if (c.status === "skipped") return "SKIPPED";
  const rpe = c.rpe !== undefined ? ` · RPE ${c.rpe}` : "";
  const pain = c.pain && c.pain.level > 0 ? ` · PAIN ${c.pain.level}` : "";
  return `${c.status === "partial" ? "PARTLY DONE" : "DONE"}${rpe}${pain}`;
}
