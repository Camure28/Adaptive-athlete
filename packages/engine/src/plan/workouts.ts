/**
 * Session builders. Each returns a fully specified PlannedWorkout: objective, rationale, warm-up,
 * main set, cool-down, targets (pace when known, RPE always), scaling and substitutions.
 *
 * When no trustworthy pace basis exists, sessions are prescribed by time and RPE instead of
 * distance and pace, so we never show a made-up pace as if it were individualized.
 */

import type {
  IntensityTarget,
  IntensityZone,
  IsoDate,
  PlannedWorkout,
  SessionType,
  TrainingPaces,
  WorkoutStep,
  Phase,
  RaceDistance,
} from "../types.js";
import { formatPace } from "../units/units.js";

export interface BuildContext {
  paces: TrainingPaces | null;
  /** Assumed easy pace used only to convert volume to time when paces are unknown. */
  fallbackEasyPace: number;
  exclusions: string[];
}

const RPE: Record<IntensityZone, { min: number; max: number }> = {
  recovery: { min: 1, max: 2 },
  easy: { min: 2, max: 3 },
  marathon: { min: 4, max: 5 },
  threshold: { min: 6, max: 7 },
  interval: { min: 8, max: 9 },
  repetition: { min: 8, max: 9 },
};

/** Offsets from easy pace, only for time conversion in RPE mode. */
const FALLBACK_OFFSET: Record<IntensityZone, number> = {
  recovery: 30,
  easy: 0,
  marathon: -45,
  threshold: -70,
  interval: -95,
  repetition: -110,
};

export function zonePace(ctx: BuildContext, zone: IntensityZone): number {
  if (!ctx.paces) return ctx.fallbackEasyPace + FALLBACK_OFFSET[zone];
  const r = zone === "recovery" ? ctx.paces.easy : ctx.paces[zone];
  const mid = (r.fastSecPerKm + r.slowSecPerKm) / 2;
  return zone === "recovery" ? r.slowSecPerKm + 15 : mid;
}

export function target(ctx: BuildContext, zone: IntensityZone): IntensityTarget {
  const t: IntensityTarget = { zone, rpe: RPE[zone] };
  if (ctx.paces) {
    const r = zone === "recovery" ? ctx.paces.easy : ctx.paces[zone];
    t.pace =
      zone === "recovery"
        ? { fastSecPerKm: r.slowSecPerKm, slowSecPerKm: r.slowSecPerKm + 30 }
        : { fastSecPerKm: r.fastSecPerKm, slowSecPerKm: r.slowSecPerKm };
  }
  return t;
}

/** A distance-based step in pace mode, or the equivalent time-based step in RPE mode. */
export function runStep(
  ctx: BuildContext,
  kind: WorkoutStep["kind"],
  meters: number,
  zone: IntensityZone,
  extra: Partial<WorkoutStep> = {},
): WorkoutStep {
  const base: WorkoutStep = { kind, target: target(ctx, zone), ...extra };
  if (ctx.paces) return { ...base, distanceMeters: roundTo(meters, 100) };
  return { ...base, durationSeconds: roundTo((meters / 1000) * zonePace(ctx, zone), 60) };
}

export function timeStep(
  ctx: BuildContext,
  kind: WorkoutStep["kind"],
  seconds: number,
  zone: IntensityZone,
  extra: Partial<WorkoutStep> = {},
): WorkoutStep {
  return { kind, durationSeconds: seconds, target: target(ctx, zone), ...extra };
}

function rec(ctx: BuildContext, seconds: number, note?: string): NonNullable<WorkoutStep["recoveryBetween"]> {
  return note ? { durationSeconds: seconds, target: target(ctx, "recovery"), note } : { durationSeconds: seconds, target: target(ctx, "recovery") };
}

const roundTo = (x: number, step: number): number => Math.max(step, Math.round(x / step) * step);

export function stepSeconds(ctx: BuildContext, s: WorkoutStep): number {
  const once = s.durationSeconds ?? ((s.distanceMeters ?? 0) / 1000) * zonePace(ctx, s.target.zone);
  const n = s.repeat ?? 1;
  return once * n + (s.recoveryBetween ? s.recoveryBetween.durationSeconds * (n - 1) : 0);
}

export function stepMeters(ctx: BuildContext, s: WorkoutStep): number {
  const once = s.distanceMeters ?? ((s.durationSeconds ?? 0) / zonePace(ctx, s.target.zone)) * 1000;
  const n = s.repeat ?? 1;
  const recMeters = s.recoveryBetween
    ? (s.recoveryBetween.durationSeconds / zonePace(ctx, "recovery")) * 1000 * (n - 1)
    : 0;
  return once * n + recMeters;
}

function finalize(
  ctx: BuildContext,
  w: Omit<PlannedWorkout, "estimatedMinutes" | "plannedLoad" | "plannedDistanceMeters">,
): PlannedWorkout {
  const seconds = w.steps.reduce((sum, s) => sum + stepSeconds(ctx, s), 0);
  const minutes = Math.round(seconds / 60);
  const mid = (r: { min: number; max: number }): number => (r.min + r.max) / 2;
  const load = w.steps.reduce((sum, s) => {
    const n = s.repeat ?? 1;
    const recSec = s.recoveryBetween ? s.recoveryBetween.durationSeconds * (n - 1) : 0;
    const workSec = stepSeconds(ctx, s) - recSec;
    return sum + (workSec / 60) * mid(s.target.rpe) + (recSec / 60) * (s.recoveryBetween ? mid(s.recoveryBetween.target.rpe) : 0);
  }, 0);
  const isRun = w.sport === "run" || w.sport === "trail_run";
  const out: PlannedWorkout = { ...w, estimatedMinutes: minutes, plannedLoad: Math.round(load) };
  if (isRun) out.plannedDistanceMeters = Math.round(w.steps.reduce((m, s) => m + stepMeters(ctx, s), 0));
  return out;
}

const id = (planId: string, date: IsoDate, type: SessionType): string => `${planId}:${date}:${type}`;

const paceText = (ctx: BuildContext, zone: IntensityZone): string => {
  if (!ctx.paces) return `RPE ${RPE[zone].min}–${RPE[zone].max}/10`;
  const t = target(ctx, zone).pace!;
  return `${formatPace(t.fastSecPerKm)}–${formatPace(t.slowSecPerKm)} (RPE ${RPE[zone].min}–${RPE[zone].max})`;
};

// ---------------------------------------------------------------------------------------------

export function easyRun(
  ctx: BuildContext,
  planId: string,
  date: IsoDate,
  meters: number,
  opts: { strides?: boolean } = {},
): PlannedWorkout {
  const steps: WorkoutStep[] = [runStep(ctx, "steady", meters, "easy")];
  if (opts.strides) {
    steps.push(
      timeStep(ctx, "work", 20, "repetition", {
        repeat: 6,
        recoveryBetween: rec(ctx, 60, "Walk back."),
        note: "Smooth, fast-but-relaxed strides. Not a sprint.",
      }),
    );
  }
  return finalize(ctx, {
    id: id(planId, date, opts.strides ? "strides" : "easy_run"),
    date,
    sport: "run",
    type: opts.strides ? "strides" : "easy_run",
    title: opts.strides ? "Easy run + strides" : "Easy run",
    objective: "Build aerobic base and durability at conversational effort.",
    rationale:
      "Most weekly volume should be easy. It develops aerobic capacity while leaving you fresh for key sessions." +
      (opts.strides ? " Strides keep running form and leg speed sharp without adding real fatigue." : ""),
    steps,
    scaling: { easier: "Shorten by up to a third or slow down — effort matters more than pace.", harder: "Do not add distance; save energy for key sessions." },
    substitutions: ["Equal time on a bike or elliptical at easy effort"],
  });
}

export function longRun(
  ctx: BuildContext,
  planId: string,
  date: IsoDate,
  meters: number,
  opts: { marathonPaceMeters?: number } = {},
): PlannedWorkout {
  const mp = opts.marathonPaceMeters ?? 0;
  const steps: WorkoutStep[] =
    mp > 0
      ? [runStep(ctx, "steady", meters - mp, "easy"), runStep(ctx, "work", mp, "marathon", { note: "Finish at goal marathon effort." })]
      : [runStep(ctx, "steady", meters, "easy")];
  return finalize(ctx, {
    id: id(planId, date, mp > 0 ? "marathon_pace" : "long_run"),
    date,
    sport: "run",
    type: mp > 0 ? "marathon_pace" : "long_run",
    title: mp > 0 ? "Long run with marathon-pace finish" : "Long run",
    objective:
      mp > 0 ? "Rehearse goal race pace on tired legs." : "Extend aerobic endurance and fatigue resistance.",
    rationale:
      mp > 0
        ? `Running the final section at marathon effort (${paceText(ctx, "marathon")}) teaches pacing and fuelling when it matters.`
        : "The long run is the cornerstone of endurance. Keep it easy; time on feet is the stimulus.",
    steps,
    scaling: {
      easier: mp > 0 ? "Run the whole thing easy if the previous days felt heavy." : "Cut the final 15–20% if form breaks down.",
    },
    substitutions: mp > 0 ? [] : ["Split into two runs the same day only if a single run is impossible"],
  });
}

export function thresholdSession(ctx: BuildContext, planId: string, date: IsoDate, workMeters: number, phase: Phase): PlannedWorkout {
  const repMeters = phase === "base" ? 1600 : 2000;
  const reps = Math.max(2, Math.round(workMeters / repMeters));
  return finalize(ctx, {
    id: id(planId, date, "threshold"),
    date,
    sport: "run",
    type: "threshold",
    title: `Threshold: ${reps} × ${repMeters / 1000} km`,
    objective: "Raise the pace you can sustain before fatigue accumulates quickly.",
    rationale: `"Comfortably hard" running at ${paceText(ctx, "threshold")} improves lactate clearance — the single best predictor of performance from 10K to marathon.`,
    steps: [
      runStep(ctx, "warmup", 2000, "easy", { note: "Include 4 × 20 s relaxed strides at the end." }),
      runStep(ctx, "work", repMeters, "threshold", { repeat: reps, recoveryBetween: rec(ctx, 90, "Easy jog between reps.") }),
      runStep(ctx, "cooldown", 1500, "easy"),
    ],
    scaling: {
      easier: "Drop the last rep. If you can't hold pace with steady effort, run by RPE instead.",
      harder: "Do not run faster than the range — faster is a different (harder) workout.",
    },
    substitutions: ["Same structure on a treadmill at 1% incline", "Continuous tempo of equal total work time"],
  });
}

export function intervalSession(ctx: BuildContext, planId: string, date: IsoDate, workMeters: number): PlannedWorkout {
  const repMeters = 1000;
  const reps = Math.max(3, Math.min(8, Math.round(workMeters / repMeters)));
  return finalize(ctx, {
    id: id(planId, date, "intervals"),
    date,
    sport: "run",
    type: "intervals",
    title: `Intervals: ${reps} × 1 km`,
    objective: "Develop maximal aerobic power (VO2max).",
    rationale: `Hard efforts at ${paceText(ctx, "interval")} with jog recoveries stress your aerobic ceiling, which limits 5K–10K performance.`,
    steps: [
      runStep(ctx, "warmup", 2500, "easy", { note: "Include 4 × 20 s strides at the end." }),
      runStep(ctx, "work", repMeters, "interval", {
        repeat: reps,
        recoveryBetween: rec(ctx, 180, "Jog — roughly equal to the rep time."),
      }),
      runStep(ctx, "cooldown", 1500, "easy"),
    ],
    scaling: {
      easier: "Reduce to 800 m reps or drop one rep. Stop the session if pace drops >5% with max effort.",
      harder: "Hold the range; adding reps belongs to a later week, not today.",
    },
    substitutions: ["Hill reps: 5–6 × 3 min uphill at hard effort, jog down"],
  });
}

export function sharpener(ctx: BuildContext, planId: string, date: IsoDate, goal: RaceDistance): PlannedWorkout {
  const zone: IntensityZone = goal === "marathon" || goal === "half_marathon" ? "threshold" : "interval";
  return finalize(ctx, {
    id: id(planId, date, zone === "threshold" ? "threshold" : "intervals"),
    date,
    sport: "run",
    type: zone === "threshold" ? "threshold" : "intervals",
    title: "Taper sharpener",
    objective: "Stay sharp while fatigue clears.",
    rationale: "Short, quality efforts during the taper maintain fitness; reduced volume lets you arrive fresh.",
    steps: [
      runStep(ctx, "warmup", 2000, "easy"),
      runStep(ctx, "work", zone === "threshold" ? 1600 : 800, zone, { repeat: 3, recoveryBetween: rec(ctx, 120) }),
      runStep(ctx, "cooldown", 1500, "easy"),
    ],
    scaling: { easier: "Do two reps. This session should leave you feeling better, not tired." },
    substitutions: [],
  });
}

export function raceDay(ctx: BuildContext, planId: string, date: IsoDate, meters: number, goal: RaceDistance): PlannedWorkout {
  const zone: IntensityZone = goal === "marathon" ? "marathon" : goal === "half_marathon" ? "threshold" : "interval";
  return finalize(ctx, {
    id: id(planId, date, "race"),
    date,
    sport: "run",
    type: "race",
    title: "Race day",
    objective: "Execute your goal race.",
    rationale: "Everything in this block has been building to today. Start controlled and race the second half.",
    steps: [timeStep(ctx, "warmup", 600, "easy"), runStep(ctx, "work", meters, zone)],
    scaling: { easier: "Adjust goal pace for heat, wind and hills — effort is the anchor." },
    substitutions: [],
  });
}

const STRENGTH_EXERCISES: { name: string; tags: string[] }[] = [
  { name: "Goblet squat 3×8", tags: ["squat", "knee_flexion_loaded"] },
  { name: "Romanian deadlift 3×8", tags: ["hinge"] },
  { name: "Split squat 3×8/side", tags: ["lunge", "knee_flexion_loaded"] },
  { name: "Single-leg calf raise 3×12/side", tags: ["calf"] },
  { name: "Side plank 3×30 s/side", tags: ["core"] },
  { name: "Low pogo hops 3×20", tags: ["jumping", "plyometric"] },
];

export function strengthSession(ctx: BuildContext, planId: string, date: IsoDate, phase: Phase): PlannedWorkout {
  const allowed = STRENGTH_EXERCISES.filter((e) => !e.tags.some((t) => ctx.exclusions.includes(t)));
  const minutes = phase === "taper" ? 20 : 35;
  const exercises = allowed.map((e) => e.name).join(", ");
  return finalize(ctx, {
    id: id(planId, date, "strength"),
    date,
    sport: "strength",
    type: "strength",
    title: phase === "taper" ? "Strength maintenance" : "Runner strength",
    objective: "Build tissue resilience and force production for running economy.",
    rationale:
      "Heavy-ish, low-rep lower-body strength supports running economy and durability. Placed to avoid pre-fatiguing key runs.",
    steps: [
      timeStep(ctx, "warmup", 300, "easy", { note: "Dynamic mobility" }),
      timeStep(ctx, "steady", (minutes - 5) * 60, "threshold", {
        note: `${exercises}. Leave 2–3 reps in reserve; prioritise form.`,
      }),
    ],
    scaling: {
      easier: "Two sets per exercise, or bodyweight only.",
      harder: "Add load when all sets feel ≤ RPE 7 with good form.",
    },
    substitutions: ["Resistance-band version at home"],
  });
}
