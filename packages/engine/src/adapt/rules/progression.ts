/** P — Progression (running pace sessions) and T — target recalculation. */
import type { PlannedWorkout, RaceResult, SessionType, WorkoutStep } from "../../types.js";
import { addDays, daysBetween, formatPace } from "../../units/units.js";
import { assessRace, trainingPaces } from "../../performance/vdot.js";
import {
  allWorkouts,
  recentKeySessions,
  recentSessions,
  retarget,
  weekOf,
  weekRunMeters,
  type Compliance,
  type RuleContext,
} from "../context.js";
import { adaptedBy, change, decision, type Rule } from "./shared.js";

/** Session types P-1 and P-3 apply to (threshold and race-pace sessions). */
const PACE_TYPES: readonly SessionType[] = ["threshold", "race_pace_intervals"];

const mainWork = (w: PlannedWorkout): number => {
  let best = -1;
  w.steps.forEach((s, i) => {
    if (s.kind === "work" && (best < 0 || (s.repeat ?? 1) > (w.steps[best]!.repeat ?? 1))) best = i;
  });
  return best;
};

/** Seconds one rep takes: its duration, or its distance at the middle of the pace band (5:00/km if none). */
const repSeconds = (s: WorkoutStep): number => {
  if (s.durationSeconds != null) return s.durationSeconds;
  const pace = s.target.pace ? (s.target.pace.fastSecPerKm + s.target.pace.slowSecPerKm) / 2 : 300;
  return ((s.distanceMeters ?? 0) / 1000) * pace;
};

const scalePace = (w: PlannedWorkout, factor: number): WorkoutStep[] =>
  w.steps.map((s) =>
    s.kind === "work" && s.target.pace
      ? { ...s, target: { ...s.target, pace: { fastSecPerKm: Math.round(s.target.pace.fastSecPerKm * factor), slowSecPerKm: Math.round(s.target.pace.slowSecPerKm * factor) } } }
      : s,
  );

const nextOfType = (ctx: RuleContext, type: SessionType) =>
  allWorkouts(ctx.plan)
    .filter((w) => w.type === type && w.date > ctx.today && !ctx.byPlannedId.has(w.id))
    .sort((a, b) => a.date.localeCompare(b.date))[0];

/** Weeks where progression never happens (§4): recovery, taper and race weeks. */
function progressionWeekOk(ctx: RuleContext, w: PlannedWorkout): boolean {
  const week = weekOf(ctx.plan, w.date);
  return !!week && !week.isRecoveryWeek && week.phase !== "taper" && !week.workouts.some((x) => x.type === "race");
}

/** Run metres a week may reach: the larger of its current plan and +10% over the previous non-recovery week. */
function weekCap(ctx: RuleContext, date: string): number {
  const week = weekOf(ctx.plan, date)!;
  const prev = ctx.plan.weeks.filter((w) => w.startDate < week.startDate && !w.isRecoveryWeek).at(-1);
  return Math.max(weekRunMeters(week), prev ? weekRunMeters(prev) * (1 + ctx.cfg.maxWeeklyVolumeIncrease) : 0);
}

const inBand = (s: Compliance, margin = 0) =>
  s.completed.status === "completed" && s.rpeDelta != null && s.rpeDelta <= margin && !!s.reps && s.reps.slower === 0 && s.reps.muchFaster === 0;
const missedBand = (s: Compliance, rpeMargin: number) =>
  (s.reps != null && s.reps.slower * 2 >= s.reps.total) || (s.rpeDelta != null && s.rpeDelta >= rpeMargin);

// P-1 — reps in band at RPE ≤ target on 2 consecutive sessions of a type: add a rep or 2% faster, alternating.
export const progressRule: Rule = {
  id: "P-1",
  version: 1,
  group: "P",
  priority: 40,
  evaluate(ctx) {
    for (const type of PACE_TYPES) {
      const hist = recentSessions(ctx, 2, (w) => w.type === type);
      if (hist.length < 2 || !hist.every((h) => inBand(h))) continue;
      const lastProgressed = allWorkouts(ctx.plan)
        .filter((w) => w.type === type && w.date <= ctx.today && adaptedBy(w, "P-1"))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (lastProgressed && hist.some((h) => h.planned.date < lastProgressed.date)) continue;
      const next = nextOfType(ctx, type);
      if (!next || adaptedBy(next, "P-") || !progressionWeekOk(ctx, next)) continue;
      const week = weekOf(ctx.plan, next.date)!;
      if (week.workouts.some((w) => w.type === type && w.id !== next.id && adaptedBy(w, "P-1"))) continue;

      const idx = mainWork(next);
      if (idx < 0) continue;
      const step = next.steps[idx]!;
      let mode: "rep" | "pace" = lastProgressed?.adaptedBy === "P-1:rep" ? "pace" : "rep";
      const added = step.distanceMeters ?? 0;
      if (mode === "rep" && ((step.repeat ?? 1) < 2 || weekRunMeters(week) + added > weekCap(ctx, next.date))) mode = "pace";
      if (mode === "pace" && !step.target.pace) continue;

      const after: PlannedWorkout =
        mode === "rep"
          ? {
              ...next,
              steps: next.steps.map((s, i) => (i === idx ? { ...s, repeat: (s.repeat ?? 1) + 1 } : s)),
              ...(next.plannedDistanceMeters != null ? { plannedDistanceMeters: next.plannedDistanceMeters + added } : {}),
              estimatedMinutes: next.estimatedMinutes + Math.round((repSeconds(step) + (step.recoveryBetween?.durationSeconds ?? 0)) / 60),
              rationale: `One more rep: your last two sessions were on target at the right effort. ${next.rationale}`,
              adaptedBy: "P-1:rep",
            }
          : {
              ...next,
              steps: scalePace(next, 1 - ctx.cfg.progressionPaceStep),
              rationale: `Paces 2% faster: your last two sessions were on target at the right effort. ${next.rationale}`,
              adaptedBy: "P-1:pace",
            };
      const label = type === "threshold" ? "threshold" : "race-pace";
      return decision(this, {
        action: "progress",
        confidence: 0.75,
        whatChanged: mode === "rep" ? `${next.title} on ${next.date}: one more rep.` : `${next.title} on ${next.date}: work paces 2% faster.`,
        why: `Your last two ${label} sessions were on target at or below the intended effort.`,
        nextSteps: "Hold the target pace through every rep. If it's too much, run it as originally written.",
        evidence: hist.map((h) => ({
          signal: "on_target_at_intended_effort",
          description: `${h.planned.title} on ${h.completed.date}: ${h.reps!.inBand}/${h.reps!.total} reps in band, RPE ${h.completed.rpe}`,
          sources: [h.completed.source],
          refs: [h.completed.id],
        })),
        changes: [change(next, after, mode === "rep" ? `${next.title}: +1 rep` : `${next.title}: 2% faster`)],
      });
    }
    return null;
  },
};

// P-3 — missed the band on half the reps, or RPE ≥ target + 2: repeat; twice → ease.
export const missedTargetRule: Rule = {
  id: "P-3",
  version: 1,
  group: "P",
  priority: 45,
  evaluate(ctx) {
    for (const type of PACE_TYPES) {
      const hist = recentSessions(ctx, 2, (w) => w.type === type);
      if (!hist[0] || !missedBand(hist[0], ctx.cfg.rpeMargin)) continue;
      const next = nextOfType(ctx, type);
      const twice = hist.length === 2 && missedBand(hist[1]!, ctx.cfg.rpeMargin) && !hist.some((h) => adaptedBy(h.planned, this.id));
      const evidence = hist.filter((h) => missedBand(h, ctx.cfg.rpeMargin)).map((h) => ({
        signal: "missed_pace_band",
        description: `${h.planned.title} on ${h.completed.date}: ${h.reps ? `${h.reps.slower}/${h.reps.total} reps slower than target` : "no splits"}, RPE ${h.completed.rpe ?? "not logged"}`,
        sources: [h.completed.source],
        refs: [h.completed.id],
      }));
      if (!twice || !next || adaptedBy(next, "P-")) {
        return decision(this, {
          action: "keep",
          confidence: 0.7,
          whatChanged: "No sessions changed. This session type won't progress until it's back on target.",
          why: `Your last ${type === "threshold" ? "threshold" : "race-pace"} session missed its targets.`,
          nextSteps: "Aim for the same targets next time. One tough session is normal.",
          evidence,
          holdsProgression: [type],
        });
      }
      const idx = mainWork(next);
      const step = idx >= 0 ? next.steps[idx]! : null;
      const dropRep = !!step && (step.repeat ?? 1) > 2;
      const after: PlannedWorkout = dropRep
        ? {
            ...next,
            steps: next.steps.map((s, i) => (i === idx ? { ...s, repeat: (s.repeat ?? 1) - 1 } : s)),
            ...(next.plannedDistanceMeters != null ? { plannedDistanceMeters: Math.max(0, next.plannedDistanceMeters - (step!.distanceMeters ?? 0)) } : {}),
            rationale: `One rep fewer: the last two sessions of this type missed their targets. ${next.rationale}`,
            adaptedBy: this.id,
          }
        : { ...next, steps: scalePace(next, 1 + ctx.cfg.easePaceStep), rationale: `Paces eased 2%: the last two sessions of this type missed their targets. ${next.rationale}`, adaptedBy: this.id };
      return decision(this, {
        action: "reduce_intensity",
        confidence: 0.75,
        whatChanged: dropRep ? `${next.title} on ${next.date}: one rep fewer.` : `${next.title} on ${next.date}: paces 2% easier.`,
        why: "The last two sessions of this type missed their targets.",
        nextSteps: "Nail this version first; progression resumes once you're back on target.",
        evidence,
        changes: [change(next, after, dropRep ? `${next.title}: −1 rep` : `${next.title}: 2% easier`)],
        holdsProgression: [type],
      });
    }
    return null;
  },
};

// ---- Targets ------------------------------------------------------------------------------

/** The highest VDOT reachable from `from` toward `to` without threshold pace getting more than `cap` faster. */
export function cappedVdot(from: number, to: number, cap: number): number {
  if (to <= from) return to;
  const limit = trainingPaces(from).threshold.fastSecPerKm * (1 - cap);
  if (trainingPaces(to).threshold.fastSecPerKm >= limit) return to;
  let lo = from, hi = to;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (trainingPaces(mid).threshold.fastSecPerKm >= limit) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 10) / 10;
}

const validBenchmarks = (ctx: RuleContext): { race: RaceResult; vdot: number; confidence: number }[] =>
  ctx.races
    .filter((r) => r.date <= ctx.today && daysBetween(r.date, ctx.today) <= ctx.cfg.benchmarkMaxAgeDays && r.distanceMeters >= ctx.cfg.benchmarkMinMeters)
    .map((r) => assessRace(r, ctx.today))
    .filter((a) => a.confidence >= ctx.cfg.raceRecalcMinConfidence)
    .sort((a, b) => b.race.date.localeCompare(a.race.date));

const weekSinceUpdate = (ctx: RuleContext) => !ctx.plan.basis.lastTargetUpdate || daysBetween(ctx.plan.basis.lastTargetUpdate, ctx.today) >= 7;

function retargetDecision(ctx: RuleContext, rule: Rule, newVdot: number, why: string, evidence: Parameters<typeof decision>[1]["evidence"], capped: boolean) {
  const paces = trainingPaces(newVdot);
  const old = ctx.plan.basis.paces;
  const t = (p: { fastSecPerKm: number; slowSecPerKm: number }) => `${formatPace(p.fastSecPerKm)}–${formatPace(p.slowSecPerKm)}`;
  const future = allWorkouts(ctx.plan).filter((w) => w.date > ctx.today && w.sport === "run" && !ctx.byPlannedId.has(w.id));
  return decision(rule, {
    action: "recalculate_targets",
    confidence: 0.75,
    whatChanged: old
      ? `Training paces updated. Threshold: ${t(old.threshold)} → ${t(paces.threshold)}. Easy: ${t(old.easy)} → ${t(paces.easy)}.`
      : `Pace targets added. Threshold: ${t(paces.threshold)}. Easy: ${t(paces.easy)}.`,
    why: why + (capped ? " Paces change by at most 3% a week, so the rest follows over the coming weeks." : ""),
    nextSteps: "Use the new targets from your next session. Effort (RPE) still comes first on hot, hilly or tired days.",
    evidence,
    changes: future.map((w) => change(w, retarget(w, paces, ctx.plan, rule.id), `${w.title}: targets updated`)),
    targetUpdate: { vdot: Math.round(newVdot * 10) / 10 },
  });
}

// T-1 — a faster benchmark (or P-2): recalculate paces, at most 3% faster a week.
export const fasterBenchmarkRule: Rule = {
  id: "T-1",
  version: 1,
  group: "T",
  priority: 30,
  evaluate(ctx) {
    const old = ctx.plan.basis.vdot?.value ?? null;
    const best = validBenchmarks(ctx)[0];
    if (!best || (old != null && best.vdot < old + ctx.cfg.raceRecalcThreshold) || !weekSinceUpdate(ctx)) return null;
    const v = old == null ? best.vdot : cappedVdot(old, best.vdot, ctx.cfg.maxPaceGainPerWeek);
    return retargetDecision(ctx, this, v, `Your ${(best.race.distanceMeters / 1000).toFixed(1)} km on ${best.race.date} shows fitness above what your plan assumed.`, [
      { signal: "faster_benchmark", description: `${(best.race.distanceMeters / 1000).toFixed(1)} km on ${best.race.date} (confidence ${best.confidence.toFixed(2)})`, sources: ["manual"], refs: [best.race.id] },
    ], old != null && v < best.vdot);
  },
};

// T-2 — a slower benchmark: only when a second data point confirms it, and no illness flag.
export const slowerBenchmarkRule: Rule = {
  id: "T-2",
  version: 1,
  group: "T",
  priority: 28,
  evaluate(ctx) {
    const old = ctx.plan.basis.vdot?.value;
    if (old == null) return null;
    const slower = validBenchmarks(ctx).filter((b) => b.vdot <= old - ctx.cfg.raceRecalcThreshold).slice(0, 2);
    if (slower.length === 0) return null;
    if (slower.length < 2) return { ruleId: this.id, notEvaluated: "A slower result needs a second benchmark to confirm it before paces change." };
    if (ctx.checkIns.some((c) => c.notFeeling100 && c.date >= addDays(slower[1]!.race.date, -14))) return { ruleId: this.id, notEvaluated: "Slower results came around an illness check-in, so paces stay as they are." };
    const v = Math.max(slower[0]!.vdot, slower[1]!.vdot);
    return retargetDecision(ctx, this, v, "Two recent results were both slower than your plan assumed, so targets come down to match where you are now.", slower.map((b) => ({
      signal: "slower_benchmark",
      description: `${(b.race.distanceMeters / 1000).toFixed(1)} km on ${b.race.date}`,
      sources: ["manual" as const],
      refs: [b.race.id],
    })), false);
  },
};

// P-2 — reps more than 3% faster than the band on 3 sessions: recalculate paces (via T-1's cap).
export const tooEasyRule: Rule = {
  id: "P-2",
  version: 1,
  group: "T",
  priority: 29,
  evaluate(ctx) {
    const old = ctx.plan.basis.vdot?.value;
    if (old == null || !weekSinceUpdate(ctx)) return null;
    const sessions = recentKeySessions(ctx, 3);
    if (sessions.length < 3 || !sessions.every((s) => s.reps && s.reps.muchFaster * 2 > s.reps.total)) return null;
    const v = cappedVdot(old, old + 5, ctx.cfg.maxPaceGainPerWeek);
    return retargetDecision(ctx, this, v, "Your last 3 hard sessions were run well faster than their targets, so the targets are behind your fitness.", sessions.map((s) => ({
      signal: "reps_much_faster_than_band",
      description: `${s.planned.title} on ${s.completed.date}: ${s.reps!.muchFaster}/${s.reps!.total} reps >3% faster`,
      sources: [s.completed.source],
      refs: [s.completed.id],
    })), true);
  },
};
