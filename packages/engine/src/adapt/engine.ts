/**
 * Adaptation arbiter. Runs all rules, resolves conflicts, enforces guardrails, and produces a new
 * immutable plan version. The previous version is never modified.
 *
 * Conflict policy (in order):
 *  1. Rules are applied in descending priority. A workout changed by a higher-priority rule is not
 *     touched again by a lower-priority one.
 *  2. While any reducing/protective decision applies (pain, recovery, effort, missed, load), any
 *     progression is suppressed — we never push harder and ease off in the same evaluation.
 *  3. Target recalculations are deferred while a pain report is active.
 *  4. Combined non-safety reductions may not cut the next 7 days' planned load by more than
 *     `maxWeeklyLoadReduction`. The safety rule is exempt: pain protection always applies.
 *  5. Changes may never increase planned volume or add sessions.
 */

import type { AdaptationDecision, IsoInstant, PlannedWorkout, TrainingPlan } from "../types.js";
import { addDays } from "../units/units.js";
import { trainingPaces } from "../performance/vdot.js";
import { DEFAULT_ADAPTATION_CONFIG, type AdaptationConfig } from "./config.js";
import { DEFAULT_RULES, type Rule } from "./rules.js";
import { allWorkouts, makeContext, type AdaptationInput } from "./context.js";

export interface AdaptationResult {
  /** The plan after adaptation — a new version if anything changed, otherwise the input plan. */
  plan: TrainingPlan;
  changed: boolean;
  applied: AdaptationDecision[];
  suppressed: { decision: AdaptationDecision; reason: string }[];
  /** Always present: what the engine concluded, even when nothing changed. */
  summary: AdaptationDecision;
}

const REDUCING = new Set(["reduce_intensity", "reduce_volume", "replace_easier", "add_recovery"]);

export function adaptPlan(
  input: AdaptationInput,
  opts: { now: IsoInstant; config?: Partial<AdaptationConfig>; rules?: readonly Rule[] } ,
): AdaptationResult {
  const cfg = { ...DEFAULT_ADAPTATION_CONFIG, ...opts.config };
  const ctx = makeContext(input, cfg);
  const proposals = (opts.rules ?? DEFAULT_RULES)
    .map((r) => r.evaluate(ctx))
    .filter((d): d is AdaptationDecision => d !== null)
    .sort((a, b) => b.priority - a.priority);

  const applied: AdaptationDecision[] = [];
  const suppressed: AdaptationResult["suppressed"] = [];
  const touched = new Map<string, PlannedWorkout | null>();
  const painActive = proposals.some((p) => p.ruleId === "pain_safety");
  const reducing = proposals.some((p) => REDUCING.has(p.action));

  const weekEnd = addDays(input.today, 6);
  const baselineLoad = allWorkouts(input.plan)
    .filter((w) => w.date >= input.today && w.date <= weekEnd)
    .reduce((s, w) => s + w.plannedLoad, 0);
  let reductionSoFar = 0;

  for (const d of proposals) {
    if (d.action === "progress" && reducing) {
      suppressed.push({ decision: d, reason: "Progression is not applied while signals point toward reducing load." });
      continue;
    }
    if (d.targetUpdate && painActive) {
      suppressed.push({ decision: d, reason: "Target changes are deferred until the pain report is resolved." });
      continue;
    }

    const changes = d.changes.filter((c) => !touched.has(c.workoutId));
    if (d.changes.length > 0 && changes.length === 0 && !d.targetUpdate) {
      suppressed.push({ decision: d, reason: "Superseded: the affected sessions were already changed by a higher-priority rule." });
      continue;
    }
    // Guardrail: never increase volume through adaptation.
    for (const c of changes) {
      const before = c.before?.plannedDistanceMeters ?? 0;
      const after = c.after?.plannedDistanceMeters ?? 0;
      if (after > before + 1) throw new Error(`Rule ${d.ruleId} attempted to increase volume of ${c.workoutId}`);
    }

    if (d.ruleId !== "pain_safety" && REDUCING.has(d.action) && baselineLoad > 0) {
      const delta = changes
        .filter((c) => c.before && c.before.date <= weekEnd)
        .reduce((s, c) => s + (c.before!.plannedLoad - (c.after?.plannedLoad ?? 0)), 0);
      if ((reductionSoFar + delta) / baselineLoad > cfg.maxWeeklyLoadReduction) {
        suppressed.push({
          decision: d,
          reason: `Would reduce this week's load by more than ${Math.round(cfg.maxWeeklyLoadReduction * 100)}% combined with other changes.`,
        });
        continue;
      }
      reductionSoFar += delta;
    }

    for (const c of changes) touched.set(c.workoutId, c.after);
    applied.push({ ...d, changes });
  }

  const effective = applied.filter((d) => d.changes.length > 0 || d.targetUpdate);
  const changed = effective.length > 0;
  const plan = changed ? applyToPlan(input.plan, touched, applied, opts.now, input.today) : input.plan;

  return { plan, changed, applied, suppressed, summary: summarize(applied, suppressed) };
}

function applyToPlan(
  plan: TrainingPlan,
  touched: Map<string, PlannedWorkout | null>,
  applied: AdaptationDecision[],
  now: IsoInstant,
  today: string,
): TrainingPlan {
  const target = applied.find((d) => d.targetUpdate)?.targetUpdate;
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
            note: `Recalculated by adaptation engine (${applied.find((d) => d.targetUpdate)!.ruleId})`,
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
      workouts: week.workouts.flatMap((w) => {
        if (!touched.has(w.id)) return [w];
        const after = touched.get(w.id);
        return after ? [after] : [];
      }),
    })),
  };
}

function summarize(applied: AdaptationDecision[], suppressed: AdaptationResult["suppressed"]): AdaptationDecision {
  if (applied.length > 0) return applied[0]!;
  return {
    ruleId: "no_change",
    ruleVersion: 1,
    action: "keep",
    priority: 0,
    confidence: 1,
    whatChanged: "Nothing — your plan is on track.",
    why:
      suppressed.length > 0
        ? "Some signals were noted but held back by safety limits: " + suppressed.map((s) => s.reason).join(" ")
        : "No rule found a consistent trend strong enough to justify a change. Single unusual sessions or nights are expected and don't change the plan.",
    nextSteps: "Keep logging effort (RPE) after each session — it's the most useful signal we have.",
    evidence: [],
    changes: [],
  };
}
