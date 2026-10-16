/**
 * Which planned session does an imported activity fulfil? And what do we still need to ask?
 *
 * Matching is deliberately cautious: a wrong match feeds the wrong comparison into adaptation,
 * so when two sessions fit about equally (a double day with two runs) we ask the athlete instead
 * of guessing.
 */
import type { CompletedWorkout, PlannedWorkout, SessionType, Sport } from "../types.js";
import type { ImportedActivity } from "./activity.js";
import { localDate } from "./activity.js";

const RUN_SESSIONS: ReadonlySet<SessionType> = new Set<SessionType>([
  "easy_run", "recovery_run", "long_run", "threshold", "intervals", "marathon_pace", "strides", "race_pace_intervals",
]);
const HYROX_SESSIONS: ReadonlySet<SessionType> = new Set<SessionType>([
  "compromised_run", "station_endurance", "half_simulation", "full_simulation",
]);

/** 1 = the obvious recording for this session; 0.6 = plausible (watches label HYROX work inconsistently); 0 = no. */
export function sportFit(session: PlannedWorkout, sport: Sport): number {
  const run = sport === "run" || sport === "trail_run";
  if (session.type === "rest") return 0;
  if (RUN_SESSIONS.has(session.type)) return run ? 1 : 0;
  if (session.type === "strength") return sport === "strength" ? 1 : sport === "other" ? 0.6 : 0;
  if (HYROX_SESSIONS.has(session.type) || (session.type === "race" && session.sport === "hyrox")) {
    if (sport === "hyrox" || sport === "other") return 1;
    if (sport === "strength" || run || sport === "row") return 0.6;
    return 0;
  }
  if (session.type === "race") return run ? 1 : 0;
  if (session.type === "cross_train") return sport === "bike" || sport === "row" || sport === "swim" || sport === "other" ? 1 : 0;
  return 0;
}

/** 1 when the duration matches the plan, falling to 0.4 when it's off by half or more. */
function durationFit(session: PlannedWorkout, seconds: number): number {
  const planned = session.estimatedMinutes * 60;
  if (!(planned > 0)) return 0.7;
  const off = Math.abs(seconds - planned) / planned;
  return Math.max(0.4, 1 - off * 1.2);
}

export type PlanMatch =
  | { status: "matched"; plannedWorkoutId: string; confidence: number }
  /** Two or more sessions fit about equally: ask "Which session was this?" */
  | { status: "ambiguous"; candidates: string[] }
  /** Nothing planned that day fits: logged as extra training (it still counts toward load). */
  | { status: "unplanned" };

/** Below this gap between the best and second-best score, we ask instead of choosing. */
const AMBIGUITY_GAP = 0.15;

export function matchToPlan(
  a: ImportedActivity,
  planned: readonly PlannedWorkout[],
  timeZone: string,
  /** Planned ids that already have a completed log, so a second run that day doesn't take them. */
  alreadyLogged: ReadonlySet<string> = new Set(),
): PlanMatch {
  const day = localDate(a.startedAt, timeZone);
  const scored = planned
    .filter((p) => p.date === day && !alreadyLogged.has(p.id))
    .map((p) => ({ id: p.id, score: sportFit(p, a.sport) * durationFit(p, a.durationSeconds) }))
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score);

  if (scored.length === 0) return { status: "unplanned" };
  const [best, second] = scored;
  if (second && best!.score - second.score < AMBIGUITY_GAP) {
    return { status: "ambiguous", candidates: scored.filter((s) => best!.score - s.score < AMBIGUITY_GAP).map((s) => s.id) };
  }
  return { status: "matched", plannedWorkoutId: best!.id, confidence: Math.round(best!.score * 100) / 100 };
}

/** The completed-workout record for a new import. Athlete-reported fields start empty. */
export function toCompletedWorkout(a: ImportedActivity, id: string, timeZone: string, match: PlanMatch): CompletedWorkout {
  const c: CompletedWorkout = {
    id,
    date: localDate(a.startedAt, timeZone),
    sport: a.sport,
    status: "completed",
    source: a.source,
    durationSeconds: a.durationSeconds,
  };
  if (match.status === "matched") c.plannedWorkoutId = match.plannedWorkoutId;
  if (a.distanceMeters !== undefined) c.distanceMeters = a.distanceMeters;
  if (a.avgHeartRate !== undefined) c.avgHeartRate = a.avgHeartRate;
  if (a.maxHeartRate !== undefined) c.maxHeartRate = a.maxHeartRate;
  if (a.splits?.length) c.splits = a.splits;
  return c;
}

export type FollowUpQuestion =
  /** "How hard was it?" Session RPE, 0–10. */
  | "rpe"
  /** "Any pain?" Always asked when unanswered; it's the safety signal. */
  | "pain"
  /** "Was this the whole session?" Device time is well short of the plan. */
  | "completion"
  /** "Which session was this?" */
  | "which_session";

/**
 * What the app should ask after a workout arrives. A device can't tell us effort or pain, and the
 * adaptation rules need both, so an imported workout isn't "done" for adaptation until these are
 * answered (or the athlete skips them, which the rules treat as missing data, never as "fine").
 */
export function athleteFollowUp(c: CompletedWorkout, planned?: PlannedWorkout, match?: PlanMatch): FollowUpQuestion[] {
  const q: FollowUpQuestion[] = [];
  if (match?.status === "ambiguous") q.push("which_session");
  if (c.rpe === undefined) q.push("rpe");
  if (c.pain === undefined) q.push("pain");
  if (planned && c.durationSeconds !== undefined && c.durationSeconds < planned.estimatedMinutes * 60 * 0.6 && c.status === "completed") {
    q.push("completion");
  }
  return q;
}
