/**
 * The log-a-session form (D-025): its state, prefill from the planned session, and conversion to
 * the engine's ManualLog. Also logs a workout that wasn't in the plan ("Log other workout"): the
 * athlete picks the day and the kind of workout, and it's always logged as done. Pure, so it's unit-tested. Validation rules live in the engine
 * (validateManualLog) so the app and future server checks agree.
 */
import {
  addDays,
  METERS_PER_MILE,
  validateManualLog,
  type LogBodyArea,
  type CompletedWorkout,
  type LogErrors,
  type ManualLog,
  type PlannedWorkout,
  type Sport,
} from "@adaptive-athlete/engine";
import { toMeters, type Units } from "@/onboarding/model";

export type LogStatus = CompletedWorkout["status"];

export interface LogForm {
  status: LogStatus | null;
  /** ISO date; fixed to the planned date, chosen for another workout. */
  date: string;
  /** Fixed for a planned session, chosen for another workout. */
  sport: Sport | null;
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

/** Kinds of workout the athlete can log outside the plan. */
export const OTHER_SPORTS: { value: Sport; label: string }[] = [
  { value: "run", label: "Run" },
  { value: "hyrox", label: "HYROX or mixed" },
  { value: "strength", label: "Strength" },
  { value: "bike", label: "Bike" },
  { value: "row", label: "Row" },
  { value: "swim", label: "Swim" },
  { value: "other", label: "Something else" },
];

/** How far back another workout can be logged (the engine's rules look at the last few weeks). */
export const OTHER_WORKOUT_DAYS = 14;

/**
 * Distance is asked for planned sessions that are mostly running, and for other workouts that
 * cover a distance (runs, rides, rows, swims).
 */
export function asksDistance(sport: Sport | null, planned: boolean): boolean {
  if (sport === "run" || sport === "trail_run") return true;
  return !planned && (sport === "bike" || sport === "row" || sport === "swim");
}

const fromMeters = (m: number, units: Units): string => String(Math.round((m / (units === "mi" ? METERS_PER_MILE : 1000)) * 100) / 100);

/** The form for a stored log, as it was entered (planned or not). */
export function formFromLog(existing: CompletedWorkout, units: Units): LogForm {
  const hurt = existing.pain === undefined ? null : existing.pain.level > 0;
  return {
    status: existing.status,
    date: existing.date,
    sport: existing.sport,
    minutes: existing.durationSeconds !== undefined ? String(Math.round(existing.durationSeconds / 60)) : "",
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

/** A new form prefilled from the plan, or the stored log when editing. */
export function formFor(w: PlannedWorkout, units: Units, existing?: CompletedWorkout): LogForm {
  if (existing) {
    const f = formFromLog(existing, units);
    return { ...f, date: w.date, sport: w.sport, minutes: f.minutes || String(w.estimatedMinutes) };
  }
  return {
    status: null,
    date: w.date,
    sport: w.sport,
    minutes: String(w.estimatedMinutes),
    distance: asksDistance(w.sport, true) && w.plannedDistanceMeters ? fromMeters(w.plannedDistanceMeters, units) : "",
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

/** A blank form for a workout that wasn't in the plan, dated today. */
export function otherWorkoutForm(today: string): LogForm {
  return {
    status: "completed",
    date: today,
    sport: null,
    minutes: "",
    distance: "",
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

export type FormErrors = LogErrors & { status?: string; sport?: string; date?: string; painAltered?: string; painSharp?: string; painStopped?: string };

/**
 * The ManualLog for this form, or the errors to show. `w` is the planned session, or null for a
 * workout that wasn't in the plan (then `today` bounds the date).
 */
export function toManualLog(f: LogForm, w: PlannedWorkout | null, units: Units, today?: string): { log: ManualLog } | { errors: FormErrors } {
  const errors: FormErrors = {};
  let log: ManualLog;
  if (w) {
    if (!f.status) return { errors: { status: "Did you do this session?" } };
    log = { plannedWorkoutId: w.id, date: w.date, sport: w.sport, status: f.status };
  } else {
    if (!f.sport) errors.sport = "What kind of workout was it?";
    if (!today || f.date > today || f.date < addDays(today, -(OTHER_WORKOUT_DAYS - 1))) errors.date = "Pick a day in the last two weeks.";
    log = { date: f.date, sport: f.sport ?? "other", status: "completed" };
  }
  if (f.notes.trim()) log.notes = f.notes.trim();
  if (f.status !== "skipped") {
    const mins = Number(f.minutes);
    log.durationSeconds = f.minutes.trim() === "" || Number.isNaN(mins) ? NaN : mins * 60;
    if (asksDistance(log.sport, !!w) && f.distance.trim() !== "") {
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

const SPORT_LABEL = Object.fromEntries(OTHER_SPORTS.map((o) => [o.value, o.label])) as Partial<Record<Sport, string>>;

/** What to call a logged workout: the planned session's title, or its kind for other workouts. */
export function logTitle(c: CompletedWorkout, plannedTitle?: string): string {
  return plannedTitle ?? (c.sport === "trail_run" ? "Trail run" : (SPORT_LABEL[c.sport] ?? "Workout"));
}

/** Time and distance, e.g. "45 min · 5.2 mi"; empty for a skipped session. */
export function logSummary(c: CompletedWorkout, units: Units): string {
  if (c.status === "skipped") return "";
  const parts: string[] = [];
  if (c.durationSeconds !== undefined) parts.push(`${Math.round(c.durationSeconds / 60)} min`);
  if (c.distanceMeters !== undefined) parts.push(`${fromMeters(c.distanceMeters, units)} ${units}`);
  return parts.join(" · ");
}

/** Short summary for the plan list, e.g. "DONE · RPE 7". */
export function logBadge(c: CompletedWorkout): string {
  if (c.status === "skipped") return "SKIPPED";
  const rpe = c.rpe !== undefined ? ` · RPE ${c.rpe}` : "";
  const pain = c.pain && c.pain.level > 0 ? ` · PAIN ${c.pain.level}` : "";
  return `${c.status === "partial" ? "PARTLY DONE" : "DONE"}${rpe}${pain}`;
}
