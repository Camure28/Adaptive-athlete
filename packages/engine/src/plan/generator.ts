/**
 * Layer 3 — Training plan generation.
 *
 * Deterministic: the same inputs always produce the same plan. No LLM involvement.
 *
 * Invariants (enforced by tests in test/plan.test.ts):
 *  - Week-over-week run volume never rises by more than `maxWeeklyIncrease`.
 *  - No two hard sessions on consecutive days.
 *  - Long run ≤ min(fraction of weekly volume, absolute cap, available weekend time).
 *  - Sessions only on the athlete's available days; nothing after the goal race.
 *  - Final week contains the race; taper weeks reduce volume.
 */

import type {
  AthleteProfile,
  GoalEvent,
  IsoDate,
  IsoInstant,
  Phase,
  PlannedWorkout,
  PlanWeek,
  TrainingPlan,
  Weekday,
} from "../types.js";
import { HARD_SESSION_TYPES, RACE_DISTANCE_METERS } from "../types.js";
import { addDays, daysBetween, startOfWeek } from "../units/units.js";
import { currentVdot, trainingPaces } from "../performance/vdot.js";
import { DEFAULT_PLAN_CONFIG, type PlanConfig } from "./config.js";
import {
  easyRun,
  intervalSession,
  longRun,
  raceDay,
  sharpener,
  strengthSession,
  thresholdSession,
  zonePace,
  type BuildContext,
} from "./workouts.js";

export interface GenerateOptions {
  planId: string;
  today: IsoDate;
  now: IsoInstant;
  config?: PlanConfig;
}

export class PlanGenerationError extends Error {}

export function generatePlan(athlete: AthleteProfile, goal: GoalEvent, opts: GenerateOptions): TrainingPlan {
  const cfg = opts.config ?? DEFAULT_PLAN_CONFIG;
  const notes: string[] = [];

  if (goal.date <= opts.today) throw new PlanGenerationError("Goal race must be in the future");
  const runDays = [...new Set(athlete.availableDays)].sort((a, b) => a - b) as Weekday[];
  if (runDays.length < 3) {
    throw new PlanGenerationError("At least 3 available training days are needed for a race plan");
  }

  // ---- Fitness basis -----------------------------------------------------------------------
  const vdot = currentVdot(athlete.raceHistory, opts.today);
  const paces = vdot ? trainingPaces(vdot.value) : null;
  if (!vdot) {
    notes.push(
      "No recent race result is reliable enough to set paces. Sessions use effort (RPE) and time until you log a race or time trial.",
    );
  }
  const ctx: BuildContext = {
    paces,
    fallbackEasyPace: cfg.fallbackEasyPace[athlete.experience],
    exclusions: athlete.exclusions,
  };

  // ---- Calendar ----------------------------------------------------------------------------
  const firstMonday = addDays(startOfWeek(opts.today), 7); // plans start on the next Monday
  const raceMonday = startOfWeek(goal.date);
  const totalWeeks = Math.floor(daysBetween(firstMonday, raceMonday) / 7) + 1;
  if (totalWeeks < 2) throw new PlanGenerationError("Goal race is too close to build a plan; at least 2 weeks needed");
  if (totalWeeks < cfg.minWeeks[goal.distance]) {
    notes.push(
      `Only ${totalWeeks} weeks until race day; ${cfg.minWeeks[goal.distance]}+ is recommended. Progression is compressed and goals should be conservative.`,
    );
  }

  const taperWeeks = Math.min(cfg.taperWeeks[goal.distance], Math.max(1, Math.floor(totalWeeks / 4)));
  const phases = assignPhases(totalWeeks, taperWeeks);

  // ---- Volume progression ------------------------------------------------------------------
  const start = Math.max(athlete.currentWeeklyRunMeters.value, 10_000);
  const peak = Math.max(start, cfg.peakWeeklyMeters[goal.distance][athlete.experience]);
  if (athlete.currentWeeklyRunMeters.value < 10_000) {
    notes.push("Starting volume set to a 10 km/week minimum to support race preparation.");
  }
  const volumes = progressVolumes(start, peak, phases, cfg);

  // ---- Weekly layout -----------------------------------------------------------------------
  const longDay: Weekday = athlete.preferredLongRunDay !== undefined && runDays.includes(athlete.preferredLongRunDay)
    ? athlete.preferredLongRunDay
    : (runDays.filter((d) => d >= 5).at(-1) ?? runDays.at(-1)!);
  const nRunDays = Math.min(runDays.length, cfg.maxRunDays[athlete.experience]);
  const runDaySet = chooseRunDays(runDays, longDay, nRunDays);

  const weeks: PlanWeek[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const phase = phases[i]!;
    const monday = addDays(firstMonday, i * 7);
    const isRaceWeek = i === totalWeeks - 1;
    const weekVolume = volumes[i]!;
    const isRecoveryWeek = phase !== "taper" && (i + 1) % cfg.recoveryWeekEvery === 0;

    // A long run with marathon-pace work is itself a hard session and uses one of the week's hard slots.
    const mpLongRun = goal.distance === "marathon" && (phase === "build" || phase === "peak") && !isRecoveryWeek && !isRaceWeek;
    const hardCount = Math.max(0, hardSessionsFor(athlete.experience, phase, isRecoveryWeek, isRaceWeek) - (mpLongRun ? 1 : 0));
    const layout = layoutWeek(runDaySet, longDay, hardCount);

    const workouts: PlannedWorkout[] = [];
    const dateOf = (d: Weekday): IsoDate => addDays(monday, d);
    let remaining = weekVolume;

    // Race week: race replaces the long run; keep a short sharpener early in the week.
    if (isRaceWeek) {
      const raceMeters = RACE_DISTANCE_METERS[goal.distance];
      workouts.push(raceDay(ctx, opts.planId, goal.date, raceMeters, goal.distance));
      remaining -= raceMeters;
      const preRaceDays = [...layout.easy, ...layout.hard].sort((a, b) => a - b).filter((d) => dateOf(d) < goal.date && daysBetween(dateOf(d), goal.date) >= 2);
      // Latest day that still leaves ≥3 days before the race.
      const sharpenDay = [...preRaceDays].reverse().find((d) => daysBetween(dateOf(d), goal.date) >= 3);
      if (sharpenDay !== undefined) workouts.push(sharpener(ctx, opts.planId, dateOf(sharpenDay), goal.distance));
      const easyDays = preRaceDays.filter((d) => d !== sharpenDay);
      const perEasy = Math.max(3000, Math.min(6000, (weekVolume - raceMeters) / Math.max(1, easyDays.length + 1)));
      for (const d of easyDays) workouts.push(easyRun(ctx, opts.planId, dateOf(d), perEasy));
    } else {
      // Long run
      const longCapByTime = ((longDay >= 5 ? athleteMinutes(athlete, true) : athleteMinutes(athlete, false)) * 60 /
        zonePace(ctx, "easy")) * 1000;
      let longMeters = Math.min(
        weekVolume * cfg.longRunMaxFraction[athlete.experience],
        cfg.longRunMaxMeters[goal.distance],
        longCapByTime,
      );
      if (longMeters === longCapByTime && i === 0) {
        notes.push("Long runs are limited by your available weekend time.");
      }
      longMeters = Math.max(longMeters, 5000);
      const mpMeters = mpLongRun ? Math.min(longMeters * 0.4, 16000) : 0;
      workouts.push(longRun(ctx, opts.planId, dateOf(longDay), longMeters, { marathonPaceMeters: mpMeters }));
      remaining -= longMeters;

      // Quality sessions
      const kinds = qualityKinds(goal.distance, phase, isRecoveryWeek).slice(0, layout.hard.length);
      layout.hard.forEach((d, idx) => {
        const kind = kinds[idx];
        if (!kind) return;
        const date = dateOf(d);
        const w =
          phase === "taper"
            ? sharpener(ctx, opts.planId, date, goal.distance)
            : kind === "threshold"
              ? thresholdSession(ctx, opts.planId, date, Math.min(weekVolume * cfg.thresholdMaxFraction, 10_000), phase)
              : intervalSession(ctx, opts.planId, date, Math.min(weekVolume * cfg.intervalMaxFraction, 10_000));
        workouts.push(w);
        remaining -= w.plannedDistanceMeters ?? 0;
      });

      // Easy runs fill the remainder; strides on one easy day in base/build.
      const easyDays = layout.easy;
      const perEasy = Math.max(3000, remaining / Math.max(1, easyDays.length));
      easyDays.forEach((d, idx) => {
        const strides = idx === 0 && phase !== "taper" && layout.hard.length < 2;
        const cap = (athleteMinutes(athlete, d >= 5) * 60 / zonePace(ctx, "easy")) * 1000;
        workouts.push(easyRun(ctx, opts.planId, dateOf(d), Math.min(perEasy, cap), { strides }));
      });
    }

    // Strength: keep hard days hard — stack on quality days first, never the day before a long run or race.
    const strengthCount = isRaceWeek ? Math.min(1, athlete.strengthSessionsPerWeek) : athlete.strengthSessionsPerWeek;
    const strengthDays = chooseStrengthDays(workouts, strengthCount, monday, runDays);
    for (const date of strengthDays) workouts.push(strengthSession(ctx, opts.planId, date, phase));

    workouts.sort((a, b) => (a.date === b.date ? a.sport.localeCompare(b.sport) : a.date.localeCompare(b.date)));
    weeks.push({
      index: i,
      startDate: monday,
      phase,
      isRecoveryWeek,
      targetRunMeters: Math.round(weekVolume),
      workouts: workouts.filter((w) => w.date <= goal.date && w.date >= opts.today),
    });
  }

  if (strengthDaysShortfall(weeks, athlete)) {
    notes.push("Not every requested strength session fits around key runs; some weeks include fewer.");
  }

  return {
    id: opts.planId,
    athleteId: athlete.id,
    goal,
    createdAt: opts.now,
    version: 1,
    basis: { vdot, paces, startingWeeklyMeters: start, fallbackEasyPace: ctx.fallbackEasyPace, notes },
    weeks,
  };
}

// ---------------------------------------------------------------------------------------------

function athleteMinutes(a: AthleteProfile, weekend: boolean): number {
  return weekend ? a.maxWeekendMinutes : a.maxWeekdayMinutes;
}

export function assignPhases(totalWeeks: number, taperWeeks: number): Phase[] {
  const training = totalWeeks - taperWeeks;
  const base = Math.max(1, Math.round(training * 0.4));
  const peak = training >= 6 ? Math.max(1, Math.round(training * 0.2)) : 0;
  const build = Math.max(0, training - base - peak);
  return [
    ...Array<Phase>(base).fill("base"),
    ...Array<Phase>(build).fill("build"),
    ...Array<Phase>(peak).fill("peak"),
    ...Array<Phase>(taperWeeks).fill("taper"),
  ].slice(0, totalWeeks);
}

export function progressVolumes(start: number, peak: number, phases: Phase[], cfg: PlanConfig): number[] {
  const out: number[] = [];
  let loadingVolume = start; // the volume of the most recent non-recovery week
  const taperFactors = [0.75, 0.6, 0.45];
  const taperTotal = phases.filter((p) => p === "taper").length;
  let taperIdx = 0;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;
    if (phase === "taper") {
      // Reduce from the last loading week; the final factor applies to race week.
      const f = taperFactors[taperFactors.length - taperTotal + taperIdx] ?? 0.6;
      out.push(loadingVolume * f);
      taperIdx++;
      continue;
    }
    if ((i + 1) % cfg.recoveryWeekEvery === 0) {
      out.push(loadingVolume * cfg.recoveryWeekFactor);
      continue;
    }
    if (i > 0) loadingVolume = Math.min(peak, loadingVolume * (1 + cfg.maxWeeklyIncrease));
    out.push(loadingVolume);
  }
  return out;
}

/** Choose run days spread through the week, always including the long-run day. */
function chooseRunDays(available: Weekday[], longDay: Weekday, n: number): Weekday[] {
  if (available.length <= n) return available;
  const chosen = new Set<Weekday>([longDay]);
  while (chosen.size < n) {
    // Greedily add the day farthest (circularly) from already-chosen days.
    let best: Weekday | null = null;
    let bestDist = -1;
    for (const d of available) {
      if (chosen.has(d)) continue;
      const dist = Math.min(...[...chosen].map((c) => circDist(c, d)));
      if (dist > bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    chosen.add(best!);
  }
  return [...chosen].sort((a, b) => a - b);
}

const circDist = (a: number, b: number): number => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

function hardSessionsFor(exp: AthleteProfile["experience"], phase: Phase, recovery: boolean, raceWeek: boolean): number {
  if (raceWeek) return 0;
  if (phase === "taper") return 1;
  if (recovery) return exp === "beginner" ? 0 : 1;
  if (exp === "beginner") return phase === "base" ? 0 : 1;
  return phase === "base" ? 1 : 2;
}

/**
 * Place hard sessions on run days that are not adjacent to each other or to the long run
 * (the long run is treated as a key session). Returns fewer hard days if spacing is impossible.
 */
function layoutWeek(runDays: Weekday[], longDay: Weekday, hardCount: number): { hard: Weekday[]; easy: Weekday[] } {
  const candidates = runDays.filter((d) => d !== longDay);
  // Exhaustive search over small sets (≤6 candidates): prefer the most hard sessions that fit,
  // then maximal spacing from the long run, then earlier days.
  const valid = (set: Weekday[]): boolean => {
    const keys = [longDay, ...set];
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) if (circDist(keys[i]!, keys[j]!) < 2) return false;
    return true;
  };
  for (let k = Math.min(hardCount, candidates.length); k > 0; k--) {
    const options = combinations(candidates, k).filter(valid);
    if (options.length === 0) continue;
    const score = (set: Weekday[]): number => set.reduce<number>((sum, d) => sum + circDist(d, longDay) * 10 - d, 0);
    const hard = options.sort((a, b) => score(b) - score(a))[0]!;
    return { hard, easy: candidates.filter((d) => !hard.includes(d)) };
  }
  return { hard: [], easy: candidates };
}

function combinations<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return xs.flatMap((x, i) => combinations(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest]));
}

function qualityKinds(goal: GoalEvent["distance"], phase: Phase, recovery: boolean): ("threshold" | "intervals")[] {
  if (phase === "base" || recovery) return ["threshold"];
  const short = goal === "5k" || goal === "10k";
  if (goal === "marathon") return ["threshold"]; // the other quality stimulus is the MP long run
  return short ? ["intervals", "threshold"] : ["threshold", "intervals"];
}

function chooseStrengthDays(workouts: PlannedWorkout[], count: number, monday: IsoDate, available: Weekday[]): IsoDate[] {
  if (count === 0) return [];
  const byDate = new Map<IsoDate, PlannedWorkout[]>();
  for (const w of workouts) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w]);
  const isKeyRun = (d: IsoDate): boolean =>
    (byDate.get(d) ?? []).some((w) => HARD_SESSION_TYPES.has(w.type) || w.type === "long_run");

  const days = available.map((d) => addDays(monday, d));
  const eligible = days.filter(
    (d) =>
      !isKeyRun(addDays(d, 1)) &&
      ![1, 2, 3].some((k) => (byDate.get(addDays(d, k)) ?? []).some((w) => w.type === "race")) &&
      !(byDate.get(d) ?? []).some((w) => w.type === "long_run" || w.type === "marathon_pace" || w.type === "race"),
  );
  // Hard days first (keep hard days hard), then easy run days, then non-run days.
  const score = (d: IsoDate): number => {
    const ws = byDate.get(d) ?? [];
    if (ws.some((w) => HARD_SESSION_TYPES.has(w.type))) return 0;
    if (ws.length > 0) return 1;
    return 2;
  };
  const picked: IsoDate[] = [];
  for (const d of [...eligible].sort((a, b) => score(a) - score(b) || a.localeCompare(b))) {
    if (picked.length >= count) break;
    if (picked.every((p) => Math.abs(daysBetween(p, d)) >= 2)) picked.push(d);
  }
  return picked.sort();
}

function strengthDaysShortfall(weeks: PlanWeek[], a: AthleteProfile): boolean {
  return weeks.slice(0, -1).some((w) => w.workouts.filter((x) => x.type === "strength").length < a.strengthSessionsPerWeek);
}
