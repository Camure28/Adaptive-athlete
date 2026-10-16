/**
 * Adaptation arbiter (docs/ADAPTATION_ENGINE.md §3–§4, §7). Runs every rule, resolves conflicts,
 * enforces the guardrails, and produces a new immutable plan version plus the weekly review.
 * The previous version is never modified.
 *
 * Order and conflicts:
 *  1. Groups run S → F → Q → A → P → T (priority within a group). A session changed by an earlier
 *     rule is not touched again by a later one; earlier groups are the more conservative.
 *  2. Any applied S or F decision that reduces load or holds progression, and any explicit hold
 *     (F-1, F-3, A-2, P-3 for its session type), blocks progression.
 *  3. Target changes wait while a safety rule is active.
 *  4. Only safety changes may touch today's sessions; everything else applies to later dates (the
 *     24-hour rule, in calendar days).
 *  5. Combined non-safety reductions may cut the next 7 days' planned load by at most 30%.
 *  6. Only a safety rule may remove every hard session from a week; otherwise the change is held.
 *  7. Only progression may add volume, and never past +10% over the previous non-recovery week.
 */

import type { AdaptationDecision, CompletedWorkout, DataSource, IsoInstant, PlannedWorkout, SessionType, TrainingPlan } from "../types.js";
import { addDays } from "../units/units.js";
import { trainingPaces } from "../performance/vdot.js";
import { DEFAULT_ADAPTATION_CONFIG, type AdaptationConfig } from "./config.js";
import { DEFAULT_RULES, GROUP_ORDER, isNotEvaluated, type NotEvaluated, type Rule, type RuleGroup } from "./rules.js";
import { allWorkouts, isHard, makeContext, weekOf, weekRunMeters, type AdaptationInput } from "./context.js";

export interface WeeklyReview {
  checked: { sessionsLogged: number; sources: DataSource[] };
  /** Applied decisions that changed sessions or targets. */
  changed: AdaptationDecision[];
  /** "No change because …" lines, always at least one when nothing changed. */
  kept: string[];
  /** Rules that couldn't run for lack of data, and how to fix it. */
  waitingOn: NotEvaluated[];
  /** Questions for the athlete, one per rule. */
  questions: { questionId: string; question: string; ruleId: string }[];
}

export interface AdaptationResult {
  /** The plan after adaptation: a new version if anything changed, otherwise the input plan. */
  plan: TrainingPlan;
  changed: boolean;
  applied: AdaptationDecision[];
  suppressed: { decision: AdaptationDecision; reason: string }[];
  /** Always present: what the engine concluded, even when nothing changed. */
  summary: AdaptationDecision;
  review: WeeklyReview;
}

const NO_HARD_LEFT = "Would remove every hard session from a week, so we ask you first.";
const REDUCING = new Set(["reduce_intensity", "reduce_volume", "replace_easier", "add_recovery"]);

export function ruleGroup(ruleId: string): RuleGroup {
  const g = ruleId.split("-")[0] as RuleGroup;
  return GROUP_ORDER.includes(g) ? g : "P";
}

export function adaptPlan(
  input: AdaptationInput,
  opts: { now: IsoInstant; config?: Partial<AdaptationConfig>; rules?: readonly Rule[] },
): AdaptationResult {
  const cfg = { ...DEFAULT_ADAPTATION_CONFIG, ...opts.config };
  const ctx = makeContext(input, cfg);
  const rules = [...(opts.rules ?? DEFAULT_RULES)].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.priority - a.priority,
  );
  const waitingOn: NotEvaluated[] = [];
  const proposals: { d: AdaptationDecision; group: RuleGroup }[] = [];
  for (const r of rules) {
    const out = r.evaluate(ctx);
    if (out === null) continue;
    if (isNotEvaluated(out)) waitingOn.push(out);
    else proposals.push({ d: out, group: r.group });
  }

  const applied: AdaptationDecision[] = [];
  const suppressed: AdaptationResult["suppressed"] = [];
  const touched = new Map<string, PlannedWorkout | null>();
  const original = new Map(allWorkouts(input.plan).map((w) => [w.id, w]));
  const current = (id: string) => (touched.has(id) ? touched.get(id)! : original.get(id)!);
  let holdAll = false;
  const heldTypes = new Set<SessionType>();
  let safetyActive = false;

  const weekEnd = addDays(input.today, 6);
  const baselineLoad = allWorkouts(input.plan).filter((w) => w.date >= input.today && w.date <= weekEnd).reduce((s, w) => s + w.plannedLoad, 0);
  let reductionSoFar = 0;

  for (const { d, group } of proposals) {
    const safety = group === "S";
    if (d.action === "progress") {
      const types = new Set(d.changes.map((c) => c.before?.type).filter((t): t is SessionType => !!t));
      if (holdAll || [...types].some((t) => heldTypes.has(t))) {
        suppressed.push({ decision: d, reason: "Progression is on hold while other signals point toward holding or reducing load." });
        continue;
      }
    }
    if (d.targetUpdate && safetyActive) {
      suppressed.push({ decision: d, reason: "Target changes wait until the safety issue has cleared." });
      continue;
    }

    // 24-hour rule: only safety may change today's sessions.
    const changes = d.changes.filter((c) => !touched.has(c.workoutId) && (safety || (c.after?.date ?? c.before?.date ?? "") > input.today));
    if (d.changes.length > 0 && changes.length === 0 && !d.targetUpdate) {
      suppressed.push({ decision: d, reason: "The sessions it would change were already changed by an earlier rule, or are today." });
      continue;
    }

    const blocked = guardrails(d, changes, safety);
    if (blocked === NO_HARD_LEFT) {
      const questionId = `${d.ruleId}.confirm`;
      const confirmed = (input.answers ?? []).some((a) => a.questionId === questionId && a.value === "yes" && a.date >= addDays(input.today, -2));
      if (!confirmed) {
        // §4: only safety may remove every hard session from a week; otherwise ask the athlete.
        suppressed.push({ decision: d, reason: blocked });
        applied.push({
          ...d,
          action: "ask_clarification",
          changes: [],
          whatChanged: "Nothing yet.",
          question: `${d.whatChanged} That would leave no hard session this week. Make the change?`,
          questionId,
        });
        if (d.holdsProgression === "all") holdAll = true;
        continue;
      }
    } else if (blocked) {
      suppressed.push({ decision: d, reason: blocked });
      continue;
    }

    // A-3's re-entry week is the athlete's own choice, so the 30% cap doesn't apply (§4, like B-4).
    if (!safety && d.ruleId !== "A-3" && REDUCING.has(d.action) && baselineLoad > 0) {
      const delta = changes
        .filter((c) => c.before && c.before.date <= weekEnd)
        .reduce((s, c) => s + (c.before!.plannedLoad - (c.after?.plannedLoad ?? 0)), 0);
      if ((reductionSoFar + delta) / baselineLoad > cfg.maxWeeklyLoadReduction) {
        suppressed.push({ decision: d, reason: `Would reduce this week's load by more than ${Math.round(cfg.maxWeeklyLoadReduction * 100)}% combined with other changes.` });
        continue;
      }
      reductionSoFar += delta;
    }

    for (const c of changes) touched.set(c.workoutId, c.after);
    const final = { ...d, changes };
    applied.push(final);
    if (safety) safetyActive = true;
    const holds = final.holdsProgression;
    if (holds === "all" || ((group === "S" || group === "F") && REDUCING.has(d.action))) holdAll = true;
    else if (holds) holds.forEach((t) => heldTypes.add(t));
  }

  const effective = applied.filter((d) => d.changes.length > 0 || d.targetUpdate);
  const changed = effective.length > 0;
  const plan = changed ? applyToPlan(input.plan, touched, applied, opts.now, input.today) : input.plan;
  const summary = summarize(applied, suppressed);
  return { plan, changed, applied, suppressed, summary, review: review(input.completed, input.today, applied, summary, waitingOn) };

  function guardrails(d: AdaptationDecision, changes: AdaptationDecision["changes"], safety: boolean): string | null {
    // Volume: only progression may add, and within +10% over the previous non-recovery week.
    for (const c of changes) {
      const before = c.before?.plannedDistanceMeters ?? 0;
      const after = c.after?.plannedDistanceMeters ?? 0;
      if (after > before + 1) {
        if (d.action !== "progress") return `Rule ${d.ruleId} may not add volume.`;
        const week = weekOf(input.plan, c.after!.date)!;
        const prev = input.plan.weeks.filter((w) => w.startDate < week.startDate && !w.isRecoveryWeek).at(-1);
        const cap = Math.max(weekRunMeters(week), prev ? weekRunMeters(prev) * (1 + cfg.maxWeeklyVolumeIncrease) : 0);
        if (weekRunMeters(week) + (after - before) > cap + 1) return "Would raise weekly running volume more than 10% over the previous week.";
      }
    }
    // Only safety may remove every hard session from a week.
    if (!safety) {
      const weeks = new Set(changes.map((c) => weekOf(input.plan, c.before?.date ?? c.after!.date)?.startDate));
      for (const start of weeks) {
        const week = input.plan.weeks.find((w) => w.startDate === start);
        if (!week || !week.workouts.some(isHard)) continue;
        const after = week.workouts.map((w) => {
          const c = changes.find((x) => x.workoutId === w.id);
          return c ? c.after : current(w.id);
        });
        if (!after.some((w) => w && isHard(w))) return NO_HARD_LEFT;
      }
    }
    return null;
  }
}

function applyToPlan(plan: TrainingPlan, touched: Map<string, PlannedWorkout | null>, applied: AdaptationDecision[], now: IsoInstant, today: string): TrainingPlan {
  const updating = applied.find((d) => d.targetUpdate);
  const target = updating?.targetUpdate;
  const basis = target
    ? {
        ...plan.basis,
        vdot: {
          value: target.vdot,
          provenance: {
            source: "engine" as const,
            kind: "calculated" as const,
            confidence: Math.min(plan.basis.vdot?.provenance.confidence ?? 0.75, 0.9),
            observedAt: today,
            note: `Recalculated by the adaptation engine (${updating!.ruleId})`,
          },
        },
        paces: trainingPaces(target.vdot),
        lastTargetUpdate: today,
      }
    : plan.basis;

  return {
    ...plan,
    version: plan.version + 1,
    createdAt: now,
    basis,
    weeks: plan.weeks.map((week) => ({
      ...week,
      workouts: week.workouts
        .flatMap((w) => {
          if (!touched.has(w.id)) return [w];
          const after = touched.get(w.id);
          return after ? [after] : [];
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    })),
  };
}

function summarize(applied: AdaptationDecision[], suppressed: AdaptationResult["suppressed"]): AdaptationDecision {
  const changing = applied.find((d) => d.changes.length > 0 || d.targetUpdate) ?? applied[0];
  if (changing) return changing;
  return {
    ruleId: "no_change",
    ruleVersion: 1,
    action: "keep",
    priority: 0,
    confidence: 1,
    whatChanged: "Nothing. Your plan is on track.",
    why:
      suppressed.length > 0
        ? "Some signals were noted but held back by the plan's limits: " + suppressed.map((s) => s.reason).join(" ")
        : "No rule found a consistent trend strong enough to justify a change. Single unusual sessions or nights are expected and don't change the plan.",
    nextSteps: "Keep logging effort (RPE) after each session. It's the most useful signal we have.",
    evidence: [],
    changes: [],
  };
}

function review(completed: CompletedWorkout[], today: string, applied: AdaptationDecision[], summary: AdaptationDecision, waitingOn: NotEvaluated[]): WeeklyReview {
  const week = completed.filter((c) => c.date > addDays(today, -7) && c.date <= today && c.status !== "skipped");
  const changed = applied.filter((d) => d.changes.length > 0 || d.targetUpdate);
  const kept: string[] = [];
  if (changed.length === 0) kept.push(summary.ruleId === "no_change" ? summary.why : `No sessions changed: ${summary.why}`);
  for (const d of applied) if (d.changes.length === 0 && !d.targetUpdate && d.action === "keep") kept.push(d.why);
  return {
    checked: { sessionsLogged: week.length, sources: [...new Set(week.map((c) => c.source))] },
    changed,
    kept: [...new Set(kept)],
    waitingOn,
    questions: applied.filter((d) => d.question && d.questionId).map((d) => ({ questionId: d.questionId!, question: d.question!, ruleId: d.ruleId })),
  };
}
