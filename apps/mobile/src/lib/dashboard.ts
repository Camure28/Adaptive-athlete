/**
 * Figures for the plan dashboard banner, computed from the generated plan and the athlete's own
 * answers. Pure, so it's unit-tested. Every figure is real plan data or a labelled estimate; the
 * banner never shows a number we can't trace back to its source.
 */
import { HARD_SESSION_TYPES, daysBetween, type PlannedWorkout, type PlanWeek, type TrainingPlan } from "@adaptive-athlete/engine";

export interface DashboardStats {
  daysToRace: number;
  raceDate: string;
  /** The week in progress, or the first week if the plan hasn't started yet. */
  week: PlanWeek;
  weekNumber: number;
  totalWeeks: number;
  started: boolean;
  thisWeek: { sessions: number; hard: number; runMeters: number; minutes: number };
  next: PlannedWorkout | null;
  fullSims: { total: number; next: string | null };
  /** Threshold (HYROX race-effort) pace, sec/km, when a benchmark supports it. */
  threshold: { fastSecPerKm: number; slowSecPerKm: number; source: string } | null;
}

export function dashboardStats(plan: TrainingPlan, today: string): DashboardStats {
  const weeks = plan.weeks;
  const idx = weeks.findIndex((w) => w.startDate <= today && today < addDaysIso(w.startDate, 7));
  const started = idx >= 0;
  const week = weeks[started ? idx : 0]!;
  const all = weeks.flatMap((w) => w.workouts);
  const sims = all.filter((w) => w.type === "full_simulation");
  const thisWeek = {
    sessions: week.workouts.filter((w) => w.type !== "race").length,
    hard: week.workouts.filter((w) => HARD_SESSION_TYPES.has(w.type) && w.type !== "race").length,
    runMeters: week.workouts.reduce((m, w) => m + (w.sport === "run" || w.sport === "hyrox" ? w.plannedDistanceMeters ?? 0 : 0), 0),
    minutes: week.workouts.reduce((m, w) => m + w.estimatedMinutes, 0),
  };
  const vdot = plan.basis.vdot;
  const paces = plan.basis.paces;
  return {
    daysToRace: Math.max(0, daysBetween(today, plan.goal.date)),
    raceDate: plan.goal.date,
    week,
    weekNumber: week.index + 1,
    totalWeeks: weeks.length,
    started,
    thisWeek,
    next: all.find((w) => w.date >= today) ?? null,
    fullSims: { total: sims.length, next: sims.find((w) => w.date >= today)?.date ?? null },
    threshold: paces && vdot
      ? { ...paces.threshold, source: vdot.provenance.note ?? "Estimated from your race benchmark" }
      : null,
  };
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
