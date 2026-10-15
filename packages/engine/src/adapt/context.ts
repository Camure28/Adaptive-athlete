/** Shared helpers for adaptation rules: plan lookups, compliance assessment, workout transforms. */

import type {
  CompletedWorkout,
  DailyRecovery,
  IsoDate,
  PlannedWorkout,
  RaceResult,
  SessionType,
  TrainingPlan,
  TrainingPaces,
} from "../types.js";
import { HARD_SESSION_TYPES } from "../types.js";
import { addDays, paceSecPerKm } from "../units/units.js";
import { easyRun, target, type BuildContext } from "../plan/workouts.js";
import type { AdaptationConfig } from "./config.js";

export interface AdaptationInput {
  plan: TrainingPlan;
  today: IsoDate;
  completed: CompletedWorkout[];
  recovery: DailyRecovery[];
  races: RaceResult[];
}

export interface RuleContext extends AdaptationInput {
  cfg: AdaptationConfig;
  byPlannedId: Map<string, CompletedWorkout>;
  plannedById: Map<string, PlannedWorkout>;
}

export function makeContext(input: AdaptationInput, cfg: AdaptationConfig): RuleContext {
  const byPlannedId = new Map<string, CompletedWorkout>();
  for (const c of input.completed) if (c.plannedWorkoutId) byPlannedId.set(c.plannedWorkoutId, c);
  const plannedById = new Map<string, PlannedWorkout>();
  for (const w of allWorkouts(input.plan)) plannedById.set(w.id, w);
  return { ...input, cfg, byPlannedId, plannedById };
}

export const allWorkouts = (plan: TrainingPlan): PlannedWorkout[] => plan.weeks.flatMap((w) => w.workouts);

export const buildContext = (plan: TrainingPlan, paces: TrainingPaces | null = plan.basis.paces): BuildContext => ({
  paces,
  fallbackEasyPace: plan.basis.fallbackEasyPace,
  exclusions: [],
});

/** Future, not-yet-done workouts from `from` (inclusive) for `days` days. */
export function upcoming(ctx: RuleContext, days: number, from: IsoDate = ctx.today): PlannedWorkout[] {
  const end = addDays(from, days - 1);
  return allWorkouts(ctx.plan).filter(
    (w) => w.date >= from && w.date <= end && !ctx.byPlannedId.has(w.id) && w.type !== "race",
  );
}

export const isKeyRun = (w: PlannedWorkout): boolean => HARD_SESSION_TYPES.has(w.type) && w.type !== "race";

/** Typical session-RPE (CR-10, Foster) for a well-executed session of each type. */
export const EXPECTED_SESSION_RPE: Record<SessionType, { min: number; max: number }> = {
  rest: { min: 0, max: 0 },
  recovery_run: { min: 1, max: 2 },
  easy_run: { min: 2, max: 3 },
  strides: { min: 2, max: 4 },
  long_run: { min: 3, max: 5 },
  marathon_pace: { min: 5, max: 6 },
  threshold: { min: 6, max: 7 },
  intervals: { min: 7, max: 8 },
  strength: { min: 5, max: 7 },
  cross_train: { min: 2, max: 4 },
  race: { min: 9, max: 10 },
};

export interface Compliance {
  planned: PlannedWorkout;
  completed: CompletedWorkout;
  /** null = no usable effort data. */
  rpeDelta: number | null;
  /** Mean work-split pace relative to the slow bound of the target (positive = slower). null = unknown. */
  paceShortfall: number | null;
  /** Mean work-split pace relative to the fast bound (negative = faster than target). */
  paceVsFast: number | null;
}

export function assessCompliance(planned: PlannedWorkout, completed: CompletedWorkout): Compliance {
  const expected = EXPECTED_SESSION_RPE[planned.type];
  const rpeDelta = completed.rpe == null ? null : completed.rpe - expected.max;

  let paceShortfall: number | null = null;
  let paceVsFast: number | null = null;
  const workSplits = (completed.splits ?? []).filter((s) => {
    if (s.plannedStepIndex == null || s.distanceMeters == null || s.distanceMeters <= 0) return false;
    const step = planned.steps[s.plannedStepIndex];
    return step?.kind === "work" && step.target.pace != null;
  });
  if (workSplits.length > 0) {
    const ratiosSlow: number[] = [];
    const ratiosFast: number[] = [];
    for (const s of workSplits) {
      const p = planned.steps[s.plannedStepIndex!]!.target.pace!;
      const actual = paceSecPerKm(s.distanceMeters!, s.durationSeconds);
      ratiosSlow.push(actual / p.slowSecPerKm - 1);
      ratiosFast.push(actual / p.fastSecPerKm - 1);
    }
    paceShortfall = ratiosSlow.reduce((a, b) => a + b, 0) / ratiosSlow.length;
    paceVsFast = ratiosFast.reduce((a, b) => a + b, 0) / ratiosFast.length;
  }
  return { planned, completed, rpeDelta, paceShortfall, paceVsFast };
}

/** The most recent `n` completed key sessions (newest first), on or before today. */
export function recentKeySessions(ctx: RuleContext, n: number): Compliance[] {
  const out: Compliance[] = [];
  const keyPlanned = allWorkouts(ctx.plan)
    .filter((w) => isKeyRun(w) && w.date <= ctx.today)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const p of keyPlanned) {
    const c = ctx.byPlannedId.get(p.id);
    if (!c || c.status === "skipped") continue;
    out.push(assessCompliance(p, c));
    if (out.length >= n) break;
  }
  return out;
}

// ---- Transforms (pure; return new objects) -----------------------------------------------

export function downgradeToEasy(w: PlannedWorkout, plan: TrainingPlan, ruleId: string, reason: string): PlannedWorkout {
  const ctx = buildContext(plan);
  const meters = Math.max(3000, (w.plannedDistanceMeters ?? 6000) * 0.7);
  const easy = easyRun(ctx, plan.id, w.date, meters);
  return {
    ...easy,
    id: w.id, // keep identity so history links the original and revised session
    title: `Easy run (adjusted from ${w.title.toLowerCase()})`,
    rationale: `${reason} ${easy.rationale}`,
    adaptedBy: ruleId,
  };
}

export function protectedSession(w: PlannedWorkout, ruleId: string): PlannedWorkout {
  return {
    id: w.id,
    date: w.date,
    sport: "other",
    type: "cross_train",
    title: "Pain check: rest or pain-free cross-training",
    objective: "Let symptoms settle while maintaining fitness without aggravating them.",
    rationale:
      "You reported pain. Running through pain risks turning a minor issue into a longer layoff. This app cannot diagnose injuries.",
    steps: [
      {
        kind: "steady",
        durationSeconds: 30 * 60,
        target: { zone: "easy", rpe: { min: 2, max: 3 } },
        note: "Optional. Only do activities that are completely pain-free (e.g. cycling, swimming). Otherwise rest.",
      },
    ],
    estimatedMinutes: 30,
    plannedLoad: 75,
    scaling: { easier: "Full rest is a perfectly good choice." },
    substitutions: ["Full rest", "Walking"],
    adaptedBy: ruleId,
  };
}

export function scaleWorkout(w: PlannedWorkout, factor: number, ruleId: string, note: string): PlannedWorkout {
  const steps = w.steps.map((s) =>
    s.kind === "steady" || s.kind === "work"
      ? {
          ...s,
          ...(s.distanceMeters != null ? { distanceMeters: Math.round((s.distanceMeters * factor) / 100) * 100 } : {}),
          ...(s.durationSeconds != null && s.kind === "steady"
            ? { durationSeconds: Math.round((s.durationSeconds * factor) / 60) * 60 }
            : {}),
        }
      : s,
  );
  const out: PlannedWorkout = {
    ...w,
    steps,
    estimatedMinutes: Math.round(w.estimatedMinutes * factor),
    plannedLoad: Math.round(w.plannedLoad * factor),
    rationale: `${note} ${w.rationale}`,
    adaptedBy: ruleId,
  };
  if (w.plannedDistanceMeters != null) out.plannedDistanceMeters = Math.round(w.plannedDistanceMeters * factor);
  return out;
}

export function retarget(w: PlannedWorkout, paces: TrainingPaces, plan: TrainingPlan, ruleId: string): PlannedWorkout {
  const ctx = buildContext(plan, paces);
  const steps = w.steps.map((s) => ({
    ...s,
    target: { ...target(ctx, s.target.zone), ...(s.target.heartRate ? { heartRate: s.target.heartRate } : {}) },
    ...(s.recoveryBetween ? { recoveryBetween: { ...s.recoveryBetween, target: target(ctx, "recovery") } } : {}),
  }));
  return { ...w, steps, adaptedBy: ruleId };
}

/** Select recovery records from the single most common source (never mix device baselines). */
export function singleSourceRecovery(records: DailyRecovery[]): DailyRecovery[] {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return records.filter((r) => r.source === top).sort((a, b) => a.date.localeCompare(b.date));
}
