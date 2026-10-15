/**
 * HYROX Singles plan generator (Layer 3). Deterministic; no LLM.
 *
 * Implements the product owner's approved rules (docs/HYROX_WEEK.md, docs/HYROX_EQUIPMENT.md):
 *  - Level session mixes and hard-day limits; no back-to-back hard days.
 *  - Double days: Competitive by default, Advanced only on opt-in, never for others.
 *  - Phases base → build → peak → taper.
 *  - Half simulations in build; 1–2 full simulations in peak for every level; the last full
 *    simulation at least 10 (preferably 14) days before race day.
 *  - Station work uses the real station or the coach-rated substitute the athlete has equipment
 *    for; race-specific sessions prefer race-specific substitutes.
 *
 * "Hard day" here means a day with high-intensity conditioning (threshold, race-pace intervals,
 * compromised run, simulation). Strength and station-endurance sessions are moderate; they fill
 * other days and are never placed the day before a simulation or the race. See the note in
 * docs/HYROX_WEEK.md — this interpretation is awaiting product-owner confirmation.
 */

import type {
  HyroxGoal,
  HyroxStation,
  IntensityTarget,
  IsoDate,
  IsoInstant,
  Phase,
  PlannedWorkout,
  PlanWeek,
  RaceResult,
  SessionType,
  Tracked,
  TrainingPlan,
  Weekday,
  WorkoutStep,
} from "../types.js";
import { addDays, daysBetween, startOfWeek } from "../units/units.js";
import { currentVdot, trainingPaces } from "../performance/vdot.js";
import { DEFAULT_PLAN_CONFIG } from "../plan/config.js";
import { assignPhases, progressVolumes } from "../plan/generator.js";
import { runStep, stepMeters, stepSeconds, target, timeStep, zonePace, type BuildContext } from "../plan/workouts.js";
import { raceLoad, RACE_VOLUME, STATION_NAMES, STATION_ORDER } from "./rulebook.js";
import { resolveStation, type Equipment, type SessionContext } from "./equipment.js";
import {
  FULL_SIM_MIN_DAYS_BEFORE_RACE,
  FULL_SIM_PREFERRED_DAYS_BEFORE_RACE,
  HARD_KINDS,
  HYROX_MIN_WEEKS,
  LEVELS,
  MIN_DAYS_BETWEEN_FULL_SIMS,
  STATION_SECONDS,
  type HyroxLevel,
  type HyroxSessionKind,
} from "./config.js";

export interface HyroxAthlete {
  id: string;
  level: HyroxLevel;
  currentWeeklyRunMeters: Tracked<number>;
  availableDays: Weekday[];
  preferredLongDay?: Weekday;
  maxWeekdayMinutes: number;
  maxWeekendMinutes: number;
  equipment: Equipment[];
  /** Advanced: opt-in. Competitive: on unless set to false. Ignored for other levels. */
  wantsDoubles?: boolean;
  /** Running benchmarks (5K, 10K, etc.) used for run paces. */
  runResults: RaceResult[];
  exclusions: string[];
}

export class HyroxPlanError extends Error {}

type Slot = { kind: HyroxSessionKind | "half_simulation" | "full_simulation"; rounds?: number };

export function generateHyroxPlan(
  athlete: HyroxAthlete,
  goal: HyroxGoal,
  opts: { planId: string; today: IsoDate; now: IsoInstant },
): TrainingPlan {
  const lvl = LEVELS[athlete.level];
  const notes: string[] = [];
  if (goal.date <= opts.today) throw new HyroxPlanError("Race date must be in the future");
  const days = [...new Set(athlete.availableDays)].sort((a, b) => a - b) as Weekday[];
  if (days.length < 3) throw new HyroxPlanError("At least 3 training days per week are needed for a HYROX plan");

  const doubles =
    lvl.doubles === "default_on" ? athlete.wantsDoubles !== false : lvl.doubles === "opt_in" ? athlete.wantsDoubles === true : false;
  const have = new Set(athlete.equipment);
  if (!have.has("outdoor_run") && !have.has("treadmill") && !have.has("curved_treadmill")) {
    throw new HyroxPlanError("A place to run (outdoors or a treadmill) is required for a HYROX plan");
  }

  // ---- Fitness basis (shared with the running engine) ---------------------------------------
  const vdot = currentVdot(athlete.runResults, opts.today);
  const paces = vdot ? trainingPaces(vdot.value) : null;
  if (!vdot) notes.push("No recent running benchmark is reliable enough to set paces. Runs use effort (RPE) until you log a 5K or similar.");
  const ctx: BuildContext = {
    paces,
    fallbackEasyPace: DEFAULT_PLAN_CONFIG.fallbackEasyPace[lvl.runExperience],
    exclusions: athlete.exclusions,
  };

  // ---- Calendar & phases --------------------------------------------------------------------
  const firstMonday = addDays(startOfWeek(opts.today), 7);
  const totalWeeks = Math.floor(daysBetween(firstMonday, startOfWeek(goal.date)) / 7) + 1;
  if (totalWeeks < 3) throw new HyroxPlanError("Race is too close to build a plan; at least 3 weeks are needed");
  if (totalWeeks < HYROX_MIN_WEEKS) {
    notes.push(`Only ${totalWeeks} weeks until race day; ${HYROX_MIN_WEEKS}+ is recommended. The build is compressed.`);
  }
  const taperWeeks = totalWeeks >= 14 ? 2 : 1;
  const phases = assignPhases(totalWeeks, taperWeeks);
  const isRecovery = (i: number): boolean => phases[i] !== "taper" && (i + 1) % DEFAULT_PLAN_CONFIG.recoveryWeekEvery === 0;

  const start = Math.max(athlete.currentWeeklyRunMeters.value, 8_000);
  const volumes = progressVolumes(start, Math.max(start, lvl.peakRunMeters), phases, DEFAULT_PLAN_CONFIG);

  const longDay: Weekday =
    athlete.preferredLongDay !== undefined && days.includes(athlete.preferredLongDay)
      ? athlete.preferredLongDay
      : (days.filter((d) => d >= 5).at(-1) ?? days.at(-1)!);
  const simDate = (week: number): IsoDate => addDays(addDays(firstMonday, week * 7), longDay);

  // ---- Simulation schedule ------------------------------------------------------------------
  const fullSimWeeks = scheduleFullSims(lvl.fullSimulations, phases, isRecovery, simDate, goal.date, notes);
  const halfSimWeeks = scheduleHalfSims(lvl.halfSimulations, phases, isRecovery, fullSimWeeks);

  // ---- Weeks --------------------------------------------------------------------------------
  const weeks: PlanWeek[] = [];
  let stationCursor = 0;
  let prevSunday = { hard: false, doubleHard: false };
  for (let i = 0; i < totalWeeks; i++) {
    const phase = phases[i]!;
    const monday = addDays(firstMonday, i * 7);
    const raceWeek = i === totalWeeks - 1;
    const recovery = isRecovery(i);
    const dateOf = (d: Weekday): IsoDate => addDays(monday, d);

    const slots = raceWeek ? raceWeekSlots() : weekSlots(lvl.build, phase, recovery, lvl.compromisedRounds);
    if (fullSimWeeks.includes(i)) replaceWithSim(slots, "full_simulation");
    else if (halfSimWeeks.includes(i)) replaceWithSim(slots, "half_simulation");

    const capacity = doubles ? days.length * 2 : days.length;
    const kept = slots.slice(0, Math.min(lvl.sessions.max, capacity));
    if (i === 0 && days.length < lvl.sessions.min && !doubles) {
      notes.push(`Your ${days.length} training days are fewer than the ${lvl.sessions.min}+ sessions typical at this level; lower-priority sessions are left out.`);
    }

    const placed = placeWeek(kept, days, longDay, doubles, lvl.hardDays.max, raceWeek ? goal.date : null, dateOf, prevSunday);
    const sundayHard = placed.filter((p) => p.date === dateOf(6) && isHard(p.slot)).length;
    prevSunday = { hard: sundayHard > 0, doubleHard: sundayHard >= 2 };
    const workouts: PlannedWorkout[] = [];
    const runVolume = volumes[i]!;

    // Fixed-distance run content first (sessions with known run meters), then easy runs fill.
    let fixedRun = 0;
    const build = (slot: Slot, date: IsoDate): PlannedWorkout => {
      const w = buildSession(slot, date, {
        ctx, athlete, goal, phase, runVolume, stationCursor: stationCursor, opts,
      });
      return w;
    };
    const order = [...placed].sort((a, b) => priorityOf(a.slot) - priorityOf(b.slot));
    for (const p of order) {
      if (p.slot.kind === "easy_run") continue;
      const w = build(p.slot, p.date);
      if (p.slot.kind === "compromised_run" || p.slot.kind === "station_endurance") stationCursor += 4;
      fixedRun += w.plannedDistanceMeters ?? 0;
      workouts.push(w);
    }
    const easySlots = placed.filter((p) => p.slot.kind === "easy_run");
    if (easySlots.length > 0) {
      const longest = Math.max(0, ...workouts.filter((w) => w.type === "long_run").map((w) => w.plannedDistanceMeters ?? 0));
      const perRaw = Math.max(3000, (runVolume - fixedRun) / easySlots.length);
      const per = longest > 0 ? Math.min(perRaw, longest * 0.75) : perRaw;
      for (const p of easySlots) {
        const weekend = weekdayIndex(p.date, monday) >= 5;
        const cap = ((weekend ? athlete.maxWeekendMinutes : athlete.maxWeekdayMinutes) * 60 / zonePace(ctx, "easy")) * 1000;
        workouts.push(easyRunHyrox(ctx, opts.planId, p.date, Math.min(per, cap)));
      }
    }
    if (raceWeek) workouts.push(raceDay(opts.planId, goal, athlete.level));

    workouts.sort((a, b) => a.date.localeCompare(b.date) || priorityOf({ kind: kindOf(a) }) - priorityOf({ kind: kindOf(b) }));
    weeks.push({
      index: i,
      startDate: monday,
      phase,
      isRecoveryWeek: recovery,
      targetRunMeters: Math.round(runVolume),
      workouts: workouts.filter((w) => w.date > opts.today && w.date <= goal.date),
    });
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
// Week composition
// ---------------------------------------------------------------------------------------------

function weekSlots(build: HyroxSessionKind[], phase: Phase, recovery: boolean, rounds: number): Slot[] {
  if (phase === "taper") {
    return [
      { kind: "compromised_run", rounds: 2 },
      { kind: "easy_run" },
      { kind: "long_run" },
      { kind: "strength" },
      { kind: "easy_run" },
    ];
  }
  let seenCompromised = false;
  const out: Slot[] = [];
  for (const k of build) {
    if (k === "compromised_run") {
      if (seenCompromised && (phase === "base" || recovery)) {
        out.push({ kind: "station_endurance" });
        continue;
      }
      seenCompromised = true;
      out.push({ kind: k, rounds: phase === "base" || recovery ? Math.max(2, rounds - 1) : rounds });
      continue;
    }
    if (k === "race_pace_intervals" && (phase === "base" || recovery)) {
      out.push({ kind: "easy_run" });
      continue;
    }
    out.push({ kind: k });
  }
  return out;
}

function raceWeekSlots(): Slot[] {
  return [{ kind: "compromised_run", rounds: 2 }, { kind: "easy_run" }, { kind: "easy_run" }];
}

/** A simulation takes the long-run slot (weekend, most time) and replaces the first compromised run. */
function replaceWithSim(slots: Slot[], kind: "half_simulation" | "full_simulation"): void {
  const c = slots.findIndex((s) => s.kind === "compromised_run");
  if (c >= 0) slots.splice(c, 1);
  const l = slots.findIndex((s) => s.kind === "long_run");
  if (l >= 0) slots[l] = { kind };
  else slots.unshift({ kind });
}

function scheduleFullSims(
  count: number,
  phases: Phase[],
  isRecovery: (i: number) => boolean,
  simDate: (i: number) => IsoDate,
  race: IsoDate,
  notes: string[],
): number[] {
  // Approved: peak phase, last one ≥ 10–14 days before the race. Prefer peak weeks (latest first,
  // ≥ 14 days before ≥ 10), and fall back to build weeks only if peak can't hold them.
  const pool = phases
    .map((p, i) => ({ p, i, gap: daysBetween(simDate(i), race) }))
    .filter(({ p, i, gap }) => (p === "peak" || p === "build") && !isRecovery(i) && gap >= FULL_SIM_MIN_DAYS_BEFORE_RACE)
    .sort(
      (a, b) =>
        Number(b.p === "peak") - Number(a.p === "peak") ||
        Number(b.gap >= FULL_SIM_PREFERRED_DAYS_BEFORE_RACE) - Number(a.gap >= FULL_SIM_PREFERRED_DAYS_BEFORE_RACE) ||
        b.i - a.i,
    );
  const chosen: number[] = [];
  for (const { i } of pool) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => Math.abs(daysBetween(simDate(c), simDate(i))) >= MIN_DAYS_BETWEEN_FULL_SIMS)) chosen.push(i);
  }
  if (chosen.length < count) notes.push(`Only ${chosen.length} of ${count} full simulations fit before race day with enough recovery.`);
  return chosen.sort((a, b) => a - b);
}

function scheduleHalfSims(count: number, phases: Phase[], isRecovery: (i: number) => boolean, taken: number[]): number[] {
  const build = phases.map((p, i) => ({ p, i })).filter(({ p, i }) => p === "build" && !isRecovery(i) && !taken.includes(i));
  // Spread through the build: take from the end, skipping adjacent weeks.
  const chosen: number[] = [];
  for (const { i } of [...build].reverse()) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => Math.abs(c - i) >= 2) && taken.every((t) => Math.abs(t - i) >= 2)) chosen.push(i);
  }
  return chosen.sort((a, b) => a - b);
}

const isHard = (s: Slot): boolean =>
  HARD_KINDS.has(s.kind as HyroxSessionKind) || s.kind === "half_simulation" || s.kind === "full_simulation";
const isSim = (s: Slot): boolean => s.kind === "half_simulation" || s.kind === "full_simulation";

const PRIORITY: Record<Slot["kind"], number> = {
  full_simulation: 0,
  half_simulation: 0,
  long_run: 1,
  compromised_run: 2,
  threshold: 3,
  race_pace_intervals: 4,
  strength: 5,
  station_endurance: 6,
  easy_run: 7,
};
const priorityOf = (s: Slot): number => PRIORITY[s.kind];

const circDist = (a: number, b: number): number => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

interface Placed {
  slot: Slot;
  date: IsoDate;
}

/**
 * Assign slots to days.
 * 1. Long run / simulation on the long day.
 * 2. Hard sessions on non-adjacent days (max `maxHardDays` distinct days). With doubles, extra
 *    hard sessions stack onto an existing hard day (hard AM + hard PM); the next day must not be hard.
 * 3. Moderate sessions on free days, never the day before a simulation or the race; with doubles they
 *    may stack onto a hard day ("keep hard days hard").
 * 4. Easy runs on whatever is left (or stacked, with doubles).
 * Sessions that cannot be placed are dropped — the plan never breaks a safety rule to fit them.
 */
function placeWeek(
  slots: Slot[],
  days: Weekday[],
  longDay: Weekday,
  doubles: boolean,
  maxHardDays: number,
  raceDate: IsoDate | null,
  dateOf: (d: Weekday) => IsoDate,
  prevSunday: { hard: boolean; doubleHard: boolean },
): Placed[] {
  const byDay = new Map<Weekday, Slot[]>();
  const put = (d: Weekday, s: Slot) => byDay.set(d, [...(byDay.get(d) ?? []), s]);
  const count = (d: Weekday) => (byDay.get(d) ?? []).length;
  const hardOn = (d: Weekday) => (byDay.get(d) ?? []).some(isHard);

  const raceWd = raceDate ? weekdayIndex(raceDate, dateOf(0)) : null;
  const usable = days.filter((d) => raceWd === null || d < raceWd);

  const anchor = slots.find((s) => s.kind === "long_run" || isSim(s));
  if (anchor && usable.includes(longDay)) put(longDay, anchor);

  // Hard sessions: choose the largest set of mutually non-adjacent days (exhaustive; ≤ 7 days).
  const hard = slots.filter((s) => isHard(s) && s !== anchor);
  const existingHard = usable.filter(hardOn);
  // Weeks are linear (Mon→Sun); the previous week's Sunday carries over so Monday is never a
  // second hard day in a row.
  const candidates = usable.filter(
    (d) => count(d) === 0 && (raceWd === null || raceWd - d >= 3) && !(d === 0 && prevSunday.hard),
  );
  const spaced = (set: Weekday[]): boolean => {
    const all = [...existingHard, ...set];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (Math.abs(all[i]! - all[j]!) < 2) return false;
    return true;
  };
  const room = Math.max(0, Math.min(hard.length, maxHardDays - existingHard.length));
  let chosen: Weekday[] = [];
  for (let k = Math.min(room, candidates.length); k > 0 && chosen.length === 0; k--) {
    const options = combinations(candidates, k).filter(spaced);
    const score = (set: Weekday[]): number => set.reduce<number>((sum, d) => sum + circDist(d, longDay) * 10 - d, 0);
    chosen = options.sort((a, b) => score(b) - score(a))[0] ?? [];
  }
  hard.slice(0, chosen.length).forEach((s, i) => put(chosen.sort((a, b) => a - b)[i]!, s));
  if (doubles) {
    // Extra hard sessions stack onto an existing hard day (hard AM + hard PM).
    // Never two of the same session in one day (e.g. two compromised runs); prefer pairing with
    // a running-only session so the day stays manageable.
    for (const s of hard.slice(chosen.length)) {
      const options = usable.filter(
        (d) => hardOn(d) && count(d) < 2 && !(byDay.get(d) ?? []).some((x) => isSim(x) || x.kind === s.kind),
      );
      const runOnly = (d: Weekday) => (byDay.get(d) ?? []).every((x) => x.kind === "threshold" || x.kind === "race_pace_intervals");
      const stack = options.find(runOnly) ?? options[0];
      if (stack !== undefined) put(stack, s);
    }
  }

  const doubleHard = (d: number): boolean =>
    d < 0 ? prevSunday.doubleHard : (byDay.get(d as Weekday) ?? []).filter(isHard).length >= 2;
  const blocked = (d: Weekday): boolean =>
    (d < 6 && (byDay.get((d + 1) as Weekday) ?? []).some(isSim)) || (raceWd !== null && raceWd - d <= 1);

  // Moderate sessions: never the day before a simulation or race, never the day after a double-hard
  // day (approved: that day is easy). Prefer days that aren't right before a hard day.
  const moderate = slots.filter((s) => s.kind === "strength" || s.kind === "station_endurance");
  for (const s of moderate) {
    const ok = (d: Weekday) => !blocked(d) && !doubleHard(d - 1);
    const beforeHard = (d: Weekday) => d < 6 && hardOn((d + 1) as Weekday);
    const free = usable.filter((d) => count(d) === 0 && ok(d)).sort((a, b) => Number(beforeHard(a)) - Number(beforeHard(b)) || a - b);
    if (free.length > 0) put(free[0]!, s);
    else if (doubles) {
      const stack = usable.find((d) => count(d) === 1 && ok(d) && hardOn(d) && !doubleHard(d) && !(byDay.get(d) ?? []).some(isSim));
      if (stack !== undefined) put(stack, s);
    }
  }

  // Easy runs on what's left (or stacked, with doubles).
  for (const s of slots.filter((x) => x.kind === "easy_run" || (x.kind === "long_run" && x !== anchor))) {
    const free = usable.filter((d) => count(d) === 0 && !(raceWd !== null && raceWd - d <= 1));
    if (free.length > 0) put(free[0]!, s);
    else if (doubles) {
      const stack = usable.find((d) => count(d) === 1 && !(byDay.get(d) ?? []).some(isSim) && !(raceWd !== null && raceWd - d <= 1));
      if (stack !== undefined) put(stack, s);
    }
  }

  return [...byDay.entries()].flatMap(([d, ss]) => ss.map((slot) => ({ slot, date: dateOf(d) })));
}

function combinations<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return xs.flatMap((x, i) => combinations(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest]));
}

const weekdayIndex = (date: IsoDate, monday: IsoDate): number => daysBetween(monday, date);

// ---------------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------------

interface SessionEnv {
  ctx: BuildContext;
  athlete: HyroxAthlete;
  goal: HyroxGoal;
  phase: Phase;
  runVolume: number;
  stationCursor: number;
  opts: { planId: string };
}

const STATION_TARGET: IntensityTarget = { zone: "threshold", rpe: { min: 7, max: 8 } };
const STRENGTH_TARGET: IntensityTarget = { zone: "threshold", rpe: { min: 6, max: 8 } };

function stationStep(env: SessionEnv, station: HyroxStation, fraction: number, context: SessionContext): WorkoutStep {
  const have = new Set(env.athlete.equipment);
  const { recommended, alternatives } = resolveStation(station, have, context);
  const vol = RACE_VOLUME[station];
  const step = vol.unit === "reps" ? 5 : station === "sled_push" || station === "sled_pull" ? 12.5 : 25;
  const amount = Math.max(step, Math.round((vol.amount * fraction) / step) * step);
  const workSeconds = Math.round((STATION_SECONDS[env.athlete.level] * fraction) / 15) * 15;
  const real = recommended?.kind === "real";
  const raceVolume = `${amount} ${vol.unit}`;
  const prescription: NonNullable<WorkoutStep["station"]> = {
    station,
    // Substitutes don't share the station's units (25 m of RowErg is meaningless), so they are
    // prescribed by time: the work the athlete would spend on that much of the real station.
    volume: real || !recommended ? raceVolume : `${Math.max(30, workSeconds)} s of hard work (replaces ${raceVolume} of ${STATION_NAMES[station]})`,
    recommended,
    alternatives,
  };
  const load = raceLoad(station, env.goal.sex, env.goal.division);
  if (load && real) {
    prescription.raceLoad = load;
    if (env.phase === "base" && env.athlete.level === "first_timer") {
      prescription.load = "Build toward race load: start around 70% and add weight as technique holds";
    }
  } else if (recommended && !real && (station === "sled_push" || station === "sled_pull" || station === "farmers_carry" || station === "sandbag_lunges")) {
    prescription.load = "Heavy: a load you could just hold for this time at RPE 8";
  }
  if (!recommended) prescription.unavailableNote = `None of your equipment can train ${STATION_NAMES[station].toLowerCase()}. Add equipment or swap this block for an easy run.`;
  return {
    kind: "station",
    durationSeconds: Math.round(STATION_SECONDS[env.athlete.level] * fraction),
    target: STATION_TARGET,
    station: prescription,
    note: recommended ? `${STATION_NAMES[station]}: ${recommended.name}` : `${STATION_NAMES[station]}: no option available`,
  };
}

function finalize(env: SessionEnv, w: Omit<PlannedWorkout, "estimatedMinutes" | "plannedLoad" | "plannedDistanceMeters">): PlannedWorkout {
  const seconds = w.steps.reduce((s, st) => s + stepSeconds(env.ctx, st), 0);
  const runMeters = w.steps
    .filter((st) => st.kind !== "station" && w.sport !== "strength")
    .reduce((m, st) => m + stepMeters(env.ctx, st), 0);
  const load = w.steps.reduce((s, st) => s + (stepSeconds(env.ctx, st) / 60) * ((st.target.rpe.min + st.target.rpe.max) / 2), 0);
  const out: PlannedWorkout = { ...w, estimatedMinutes: Math.round(seconds / 60), plannedLoad: Math.round(load) };
  if (runMeters > 0) out.plannedDistanceMeters = Math.round(runMeters);
  return out;
}

const wid = (planId: string, date: IsoDate, type: SessionType, n = 0): string => `${planId}:${date}:${type}${n ? `:${n}` : ""}`;

function buildSession(slot: Slot, date: IsoDate, env: SessionEnv): PlannedWorkout {
  const { ctx, opts } = env;
  const lvl = LEVELS[env.athlete.level];
  switch (slot.kind) {
    case "long_run": {
      const meters = Math.max(5000, Math.min(env.runVolume * 0.32, 18_000));
      return finalize(env, {
        id: wid(opts.planId, date, "long_run"), date, sport: "run", type: "long_run",
        title: "Long run",
        objective: "Build the aerobic engine that carries you through 8 km of running between stations.",
        rationale: "HYROX is an endurance race. Easy long runs raise the pace you can hold while fatigued, at low injury risk.",
        steps: [runStep(ctx, "steady", meters, "easy")],
        scaling: { easier: "Cut the last 15–20% if form breaks down." },
        substitutions: ["Split between treadmill and bike erg at easy effort"],
      });
    }
    case "threshold": {
      const reps = env.phase === "base" ? 3 : 4;
      return finalize(env, {
        id: wid(opts.planId, date, "threshold"), date, sport: "run", type: "threshold",
        title: `Threshold: ${reps} × 1.6 km`,
        objective: "Raise the running pace you can sustain under fatigue.",
        rationale: "Threshold work is the backbone of HYROX run fitness: it lets you run each 1 km segment faster without blowing up at the next station.",
        steps: [
          runStep(ctx, "warmup", 2000, "easy"),
          runStep(ctx, "work", 1600, "threshold", { repeat: reps, recoveryBetween: { durationSeconds: 90, target: { zone: "recovery", rpe: { min: 1, max: 2 } }, note: "Easy jog" } }),
          runStep(ctx, "cooldown", 1500, "easy"),
        ],
        scaling: { easier: "Drop one rep; hold the pace rather than adding reps." },
        substitutions: ["Treadmill at 1% incline"],
      });
    }
    case "race_pace_intervals": {
      const reps = Math.min(8, lvl.compromisedRounds + 1);
      return finalize(env, {
        id: wid(opts.planId, date, "race_pace_intervals"), date, sport: "run", type: "race_pace_intervals",
        title: `Race-pace intervals: ${reps} × 1 km`,
        objective: "Lock in your HYROX 1 km run pace.",
        rationale: "Repeating the race's 1 km segment at goal pace teaches pacing so you don't go out too fast on run 1.",
        steps: [
          runStep(ctx, "warmup", 2000, "easy"),
          runStep(ctx, "work", 1000, "threshold", { repeat: reps, recoveryBetween: { durationSeconds: 90, target: { zone: "recovery", rpe: { min: 1, max: 2 } }, note: "Walk or easy jog" } }),
          runStep(ctx, "cooldown", 1500, "easy"),
        ],
        scaling: { easier: "Lengthen recoveries to 2 min.", harder: "Shorten recoveries, not the pace." },
        substitutions: ["Treadmill"],
      });
    }
    case "compromised_run": {
      const rounds = slot.rounds ?? lvl.compromisedRounds;
      const stations = pickStations(env.stationCursor, rounds);
      const fraction = env.phase === "taper" ? 0.25 : lvl.stationVolumeFraction;
      const steps: WorkoutStep[] = [runStep(ctx, "warmup", 1500, "easy", { note: "Plus dynamic mobility and 2 short station primers" })];
      for (const st of stations) {
        steps.push(stationStep(env, st, fraction, "race_specific"));
        steps.push(raceKm(ctx, "Run straight off the station at HYROX race effort"));
      }
      steps.push(runStep(ctx, "cooldown", 1000, "easy"));
      return finalize(env, {
        id: wid(opts.planId, date, "compromised_run"), date, sport: "hyrox", type: "compromised_run",
        title: `Compromised run: ${rounds} rounds`,
        objective: "Practise running well on legs that are already fatigued from a station.",
        rationale: "This is the defining HYROX skill. Each round is a station followed immediately by a 1 km run at race effort.",
        steps,
        scaling: { easier: "Drop a round, or walk 1 minute after the station before running.", harder: "Hold run pace; don't add rounds." },
        substitutions: ["Station options are listed on each block"],
      });
    }
    case "station_endurance": {
      const stations = pickStations(env.stationCursor + 4, 4);
      const steps: WorkoutStep[] = [timeStep(ctx, "warmup", 600, "easy", { note: "Erg or easy jog, then mobility" })];
      for (const st of stations) {
        const s = stationStep(env, st, lvl.stationVolumeFraction / 2, "race_specific");
        steps.push({ ...s, repeat: 3, recoveryBetween: { durationSeconds: 90, target: { zone: "recovery", rpe: { min: 1, max: 2 } } } });
      }
      return finalize(env, {
        id: wid(opts.planId, date, "station_endurance"), date, sport: "hyrox", type: "station_endurance",
        title: "Station endurance",
        objective: "Build efficient technique and capacity on the stations at race load.",
        rationale: "Stations are half the race. Practising them at race weight in controlled sets makes them cheaper on race day.",
        steps,
        scaling: { easier: "Two sets per station.", harder: "Shorten rest to 60 s." },
        substitutions: ["Station options are listed on each block"],
      });
    }
    case "strength":
      return strengthSession(env, date);
    case "half_simulation":
    case "full_simulation": {
      const full = slot.kind === "full_simulation";
      const stations = full ? [...STATION_ORDER] : env.stationCursor % 2 === 0 ? STATION_ORDER.slice(0, 4) : STATION_ORDER.slice(4);
      const steps: WorkoutStep[] = [runStep(ctx, "warmup", 2000, "easy", { note: "Race-day warm-up routine" })];
      for (const st of stations) {
        steps.push(raceKm(ctx, "Race effort"));
        steps.push(stationStep(env, st, 1, "race_specific"));
      }
      steps.push(runStep(ctx, "cooldown", 1500, "easy"));
      return finalize(env, {
        id: wid(opts.planId, date, slot.kind), date, sport: "hyrox", type: slot.kind,
        title: full ? "Full race simulation" : "Half race simulation",
        objective: full ? "Rehearse the full race: pacing, transitions, fuelling." : "Rehearse half the race at race effort.",
        rationale: full
          ? "A full run-through means race day holds no surprises. It's scheduled at least 10–14 days before the race so you recover in time."
          : "Half simulations build race-specific fitness with less recovery cost than a full run-through.",
        steps,
        scaling: { easier: "Run at 90% effort and focus on transitions." },
        substitutions: ["Station options are listed on each block"],
      });
    }
    case "easy_run":
      return easyRunHyrox(ctx, opts.planId, date, 5000);
  }
}

/** HYROX run segments are always exactly 1 km, with pace when known and RPE always. */
function raceKm(ctx: BuildContext, note: string): WorkoutStep {
  return { kind: "work", distanceMeters: 1000, target: target(ctx, "threshold"), note };
}

function pickStations(cursor: number, n: number): HyroxStation[] {
  return Array.from({ length: n }, (_, k) => STATION_ORDER[(cursor + k) % STATION_ORDER.length]!);
}

function easyRunHyrox(ctx: BuildContext, planId: string, date: IsoDate, meters: number): PlannedWorkout {
  const steps = [runStep(ctx, "steady", Math.max(3000, meters), "easy")];
  const seconds = steps.reduce((s, st) => s + stepSeconds(ctx, st), 0);
  return {
    id: wid(planId, date, "easy_run"), date, sport: "run", type: "easy_run",
    title: "Easy run",
    objective: "Aerobic base at conversational effort.",
    rationale: "Most running should be easy. It builds the engine for 8 km of race running and keeps you fresh for key sessions.",
    steps,
    estimatedMinutes: Math.round(seconds / 60),
    plannedDistanceMeters: Math.round(steps.reduce((m, st) => m + stepMeters(ctx, st), 0)),
    plannedLoad: Math.round((seconds / 60) * 2.5),
    scaling: { easier: "Shorten or slow down — effort matters more than pace." },
    substitutions: ["Equal time on a bike erg at easy effort"],
  };
}

function strengthSession(env: SessionEnv, date: IsoDate): PlannedWorkout {
  const have = new Set(env.athlete.equipment);
  // Strength days use the coach's strength-support options, never the conditioning stations.
  const support = (st: HyroxStation): string | null => {
    const { recommended, alternatives } = resolveStation(st, have, "strength");
    return [recommended, ...alternatives].find((o) => o?.kind === "support")?.name ?? null;
  };
  const hinge = have.has("barbell_rack") || have.has("dumbbells") ? "Romanian deadlifts" : have.has("kettlebells") ? "Kettlebell deadlifts" : "Single-leg hip hinges";
  const items = [
    support("sled_push") ?? "Bodyweight split squats",
    hinge,
    support("sled_pull") ?? "Band rows",
    support("skierg") ?? "Band pulldowns",
    "Core: dead bugs and side planks",
  ];
  const unique = [...new Set(items)].filter((x) => !env.athlete.exclusions.some((e) => x.toLowerCase().includes(e.toLowerCase())));
  const minutes = env.phase === "taper" ? 25 : 45;
  return finalize(env, {
    id: wid(env.opts.planId, date, "strength"), date, sport: "strength", type: "strength",
    title: env.phase === "taper" ? "Strength maintenance" : "HYROX strength",
    objective: "Build the strength behind the sleds, lunges and carries.",
    rationale: "Heavy, controlled strength work makes station loads feel lighter and protects you from injury.",
    steps: [
      timeStep(env.ctx, "warmup", 300, "easy", { note: "Mobility and activation" }),
      { kind: "steady", durationSeconds: (minutes - 5) * 60, target: STRENGTH_TARGET, note: `${unique.join("; ")}. 3–4 sets, leave 2 reps in reserve.` },
    ],
    scaling: { easier: "Two sets per exercise.", harder: "Add load when all sets feel ≤ RPE 7." },
    substitutions: [],
  });
}

function raceDay(planId: string, goal: HyroxGoal, level: HyroxLevel): PlannedWorkout {
  const seconds = 8 * (STATION_SECONDS[level] + 330);
  return {
    id: wid(planId, goal.date, "race"), date: goal.date, sport: "hyrox", type: "race",
    title: `HYROX race day (${goal.division === "pro" ? "Pro" : "Open"})`,
    objective: "Execute your race.",
    rationale: "Start the first run controlled, settle into your race pace, and save your push for the wall balls.",
    steps: [{ kind: "work", durationSeconds: seconds, target: { zone: "threshold", rpe: { min: 8, max: 10 } }, note: "8 × (1 km run + station)" }],
    estimatedMinutes: Math.round(seconds / 60),
    plannedDistanceMeters: 8000,
    plannedLoad: Math.round((seconds / 60) * 9),
    scaling: { easier: "Pace by effort; adjust for how the day feels." },
    substitutions: [],
  };
}

function kindOf(w: PlannedWorkout): Slot["kind"] {
  if (w.type in PRIORITY) return w.type as Slot["kind"];
  return w.type === "race" ? "full_simulation" : "easy_run";
}
