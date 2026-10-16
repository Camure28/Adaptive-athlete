/**
 * Plans as stored (supabase/migrations/20261016000006_plan_storage.sql, D-022): a version is a
 * list of weeks plus one row per session. Pure conversion both ways, so a stored plan reads back
 * exactly as the engine produced it (round-trip tested).
 */
import type { GoalEvent, HyroxGoal, IsoDate, IsoInstant, PlannedWorkout, PlanWeek, TrainingPlan } from "../types.js";
import { addDays } from "../units/units.js";

/** Engine release recorded on every plan version, so a version can be traced to the code that built it. */
export const ENGINE_VERSION = "0.1.0";

export type WeekRecord = Omit<PlanWeek, "index" | "workouts">;

/** A planned_workouts row. `workout_key` stays the same for a session across versions. */
export interface WorkoutRow {
  workout_key: string;
  scheduled_date: IsoDate;
  position: number;
  sport: PlannedWorkout["sport"];
  session_type: PlannedWorkout["type"];
  title: string;
  estimated_minutes: number;
  planned_meters: number | null;
  planned_load: number;
  adapted_by_rule: string | null;
  body: Pick<PlannedWorkout, "objective" | "rationale" | "steps" | "scaling" | "substitutions">;
}

export interface PlanRecord {
  /** Monday of the first week in this plan; sessions before it come from the previous version. */
  startsOn: IsoDate;
  basis: TrainingPlan["basis"];
  weeks: WeekRecord[];
  workouts: WorkoutRow[];
}

export interface StoredVersion {
  planId: string;
  athleteId: string;
  version: number;
  createdAt: IsoInstant;
  goal: GoalEvent | HyroxGoal;
  basis: TrainingPlan["basis"];
  weeks: WeekRecord[];
  workouts: WorkoutRow[];
}

export class PlanRecordError extends Error {}

export function planToRecord(plan: TrainingPlan): PlanRecord {
  const first = plan.weeks[0];
  if (!first) throw new PlanRecordError("A plan needs at least one week");
  const prefix = `${plan.id}:`;
  let position = 0;
  const workouts: WorkoutRow[] = plan.weeks.flatMap((w) =>
    w.workouts.map((x) => {
      if (!x.id.startsWith(prefix)) throw new PlanRecordError(`Workout ${x.id} doesn't belong to plan ${plan.id}`);
      return {
        workout_key: x.id.slice(prefix.length),
        scheduled_date: x.date,
        position: position++,
        sport: x.sport,
        session_type: x.type,
        title: x.title,
        estimated_minutes: x.estimatedMinutes,
        planned_meters: x.plannedDistanceMeters ?? null,
        planned_load: x.plannedLoad,
        adapted_by_rule: x.adaptedBy ?? null,
        body: { objective: x.objective, rationale: x.rationale, steps: x.steps, scaling: x.scaling, substitutions: x.substitutions },
      };
    }),
  );
  return {
    startsOn: first.startDate,
    basis: plan.basis,
    weeks: plan.weeks.map(({ startDate, phase, isRecoveryWeek, targetRunMeters }) => ({ startDate, phase, isRecoveryWeek, targetRunMeters })),
    workouts,
  };
}

/** Rebuilds the engine's plan from a stored version. Weeks are re-numbered from 0 in date order. */
export function planFromRecord(v: StoredVersion): TrainingPlan {
  const rows = [...v.workouts].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.position - b.position);
  const weeks: PlanWeek[] = [...v.weeks]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((w, index) => {
      const end = addDays(w.startDate, 7);
      return {
        index,
        startDate: w.startDate,
        phase: w.phase,
        isRecoveryWeek: w.isRecoveryWeek,
        targetRunMeters: w.targetRunMeters,
        workouts: rows.filter((r) => r.scheduled_date >= w.startDate && r.scheduled_date < end).map((r) => toWorkout(v.planId, r)),
      };
    });
  return { id: v.planId, athleteId: v.athleteId, goal: v.goal, createdAt: v.createdAt, version: v.version, basis: v.basis, weeks };
}

function toWorkout(planId: string, r: WorkoutRow): PlannedWorkout {
  const w: PlannedWorkout = {
    id: `${planId}:${r.workout_key}`,
    date: r.scheduled_date,
    sport: r.sport,
    type: r.session_type,
    title: r.title,
    objective: r.body.objective,
    rationale: r.body.rationale,
    steps: r.body.steps,
    estimatedMinutes: r.estimated_minutes,
    plannedLoad: r.planned_load,
    scaling: r.body.scaling,
    substitutions: r.body.substitutions,
  };
  if (r.planned_meters !== null) w.plannedDistanceMeters = r.planned_meters;
  if (r.adapted_by_rule !== null) w.adaptedBy = r.adapted_by_rule;
  return w;
}
