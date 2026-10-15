/** Synthetic athletes and simulation helpers. No real athlete data — ever. */

import type {
  AthleteProfile,
  CompletedWorkout,
  DailyRecovery,
  GoalEvent,
  IsoDate,
  PlannedWorkout,
  TrainingPlan,
} from "../src/types.js";
import { generatePlan } from "../src/plan/generator.js";
import { EXPECTED_SESSION_RPE } from "../src/adapt/context.js";
import { addDays } from "../src/units/units.js";

export const TODAY: IsoDate = "2026-10-15"; // Thursday
export const NOW = "2026-10-15T12:00:00-06:00";

const tracked = (value: number) => ({
  value,
  provenance: { source: "manual" as const, kind: "user_reported" as const, confidence: 0.7, observedAt: TODAY },
});

export const beginner5k: AthleteProfile = {
  id: "ath-beginner",
  experience: "beginner",
  currentWeeklyRunMeters: tracked(15_000),
  consistentWeeks: 6,
  availableDays: [0, 2, 4, 5],
  maxWeekdayMinutes: 45,
  maxWeekendMinutes: 75,
  strengthSessionsPerWeek: 1,
  raceHistory: [],
  exclusions: ["jumping"],
};

export const intermediateHalf: AthleteProfile = {
  id: "ath-intermediate",
  birthYear: 1988,
  experience: "intermediate",
  currentWeeklyRunMeters: tracked(40_000),
  consistentWeeks: 30,
  availableDays: [0, 1, 2, 3, 5, 6],
  preferredLongRunDay: 6,
  maxWeekdayMinutes: 75,
  maxWeekendMinutes: 150,
  strengthSessionsPerWeek: 2,
  raceHistory: [{ id: "r-10k", date: "2026-09-06", distanceMeters: 10_000, finishSeconds: 45 * 60, timing: "official" }],
  exclusions: [],
};

export const advancedMarathon: AthleteProfile = {
  id: "ath-advanced",
  experience: "advanced",
  currentWeeklyRunMeters: tracked(70_000),
  consistentWeeks: 150,
  availableDays: [0, 1, 2, 3, 4, 5, 6],
  preferredLongRunDay: 6,
  maxWeekdayMinutes: 90,
  maxWeekendMinutes: 200,
  strengthSessionsPerWeek: 2,
  raceHistory: [
    { id: "r-hm", date: "2026-09-27", distanceMeters: 21097.5, finishSeconds: 85 * 60, timing: "official" },
    { id: "r-old", date: "2025-04-01", distanceMeters: 42195, finishSeconds: 3 * 3600, timing: "official" },
  ],
  exclusions: [],
};

export const goal = (distance: GoalEvent["distance"], date: IsoDate): GoalEvent => ({
  id: `goal-${distance}`,
  kind: "race",
  distance,
  date,
  priority: "A",
});

export const halfPlan = (): TrainingPlan =>
  generatePlan(intermediateHalf, goal("half_marathon", "2027-02-07"), { planId: "plan-half", today: TODAY, now: NOW });

export const allOf = (plan: TrainingPlan): PlannedWorkout[] => plan.weeks.flatMap((w) => w.workouts);

/**
 * Simulate completing a planned workout.
 * paceFactor > 1 = slower than the middle of the target range; rpeDelta relative to expected max.
 */
export function complete(
  w: PlannedWorkout,
  opts: { paceFactor?: number; rpeDelta?: number | null; status?: CompletedWorkout["status"]; pain?: number; source?: CompletedWorkout["source"]; withSplits?: boolean } = {},
): CompletedWorkout {
  const paceFactor = opts.paceFactor ?? 1;
  const splits: NonNullable<CompletedWorkout["splits"]> = [];
  if (opts.withSplits !== false) {
    w.steps.forEach((s, i) => {
      if (s.kind !== "work" || !s.distanceMeters || !s.target.pace) return;
      const mid = (s.target.pace.fastSecPerKm + s.target.pace.slowSecPerKm) / 2;
      for (let r = 0; r < (s.repeat ?? 1); r++) {
        splits.push({ distanceMeters: s.distanceMeters, durationSeconds: (s.distanceMeters / 1000) * mid * paceFactor, plannedStepIndex: i });
      }
    });
  }
  const out: CompletedWorkout = {
    id: `done:${w.id}`,
    plannedWorkoutId: w.id,
    date: w.date,
    sport: w.sport,
    status: opts.status ?? "completed",
    source: opts.source ?? "manual",
    durationSeconds: w.estimatedMinutes * 60,
  };
  if (w.plannedDistanceMeters != null) out.distanceMeters = w.plannedDistanceMeters;
  if (splits.length > 0) out.splits = splits;
  if (opts.rpeDelta !== null) out.rpe = Math.max(0, Math.min(10, EXPECTED_SESSION_RPE[w.type].max + (opts.rpeDelta ?? 0)));
  if (opts.pain != null) out.pain = { level: opts.pain, location: "left shin" };
  return out;
}

/** Complete every workout in the plan between two dates (inclusive) with the same response. */
export function completeRange(plan: TrainingPlan, from: IsoDate, to: IsoDate, opts: Parameters<typeof complete>[1] = {}): CompletedWorkout[] {
  return allOf(plan)
    .filter((w) => w.date >= from && w.date <= to && w.type !== "race")
    .map((w) => complete(w, opts));
}

export function recoverySeries(
  start: IsoDate,
  days: number,
  f: (i: number) => { hrv?: number; rhr?: number },
  source: DailyRecovery["source"] = "apple_health",
): DailyRecovery[] {
  return Array.from({ length: days }, (_, i) => {
    const v = f(i);
    const r: DailyRecovery = { date: addDays(start, i), source };
    if (v.hrv != null) r.hrvMs = v.hrv;
    if (v.rhr != null) r.restingHr = v.rhr;
    return r;
  });
}
