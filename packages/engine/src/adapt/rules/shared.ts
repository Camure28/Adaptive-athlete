/**
 * Layer 4 — Adaptation rules (docs/ADAPTATION_ENGINE.md). Shared rule types and helpers.
 *
 * Each rule is a pure function (context) → decision | not-evaluated | null. Rules never mutate the
 * plan; they propose WorkoutChanges which the arbiter (engine.ts) validates and applies.
 * Rule ids are the rubric ids (S-1, F-2 …). Bump `version` whenever a rule's logic or meaning
 * changes, so the audit trail shows which logic produced each historical decision.
 */
import type { AdaptationAction, AdaptationDecision, DataSource, Evidence, PlannedWorkout, WorkoutChange } from "../../types.js";
import { isAvoided } from "../../hyrox/equipment.js";
import { strengthItemAvoided } from "../../hyrox/strength.js";
import type { RuleContext } from "../context.js";

/** Rubric groups, in decision order (§3). Q (ask) sits after safety: it never changes a session. */
export type RuleGroup = "S" | "F" | "Q" | "A" | "P" | "T";
export const GROUP_ORDER: readonly RuleGroup[] = ["S", "F", "Q", "A", "P", "T"];

/** A rule that couldn't run because its minimum data was missing (§5). Shown as "waiting on". */
export interface NotEvaluated {
  ruleId: string;
  notEvaluated: string;
}

export type RuleOutcome = AdaptationDecision | NotEvaluated | null;

export interface Rule {
  id: string;
  version: number;
  group: RuleGroup;
  /** Within a group, higher runs first. */
  priority: number;
  evaluate(ctx: RuleContext): RuleOutcome;
}

export const isNotEvaluated = (o: RuleOutcome): o is NotEvaluated => o !== null && "notEvaluated" in o;

export const change = (before: PlannedWorkout, after: PlannedWorkout | null, summary: string): WorkoutChange => ({
  workoutId: before.id,
  before,
  after,
  summary,
});

export const sourcesOf = (xs: { source: DataSource }[]): DataSource[] => [...new Set(xs.map((x) => x.source))];

/** Already changed by this rule (or a rule id starting with this prefix): don't change it again. */
export const adaptedBy = (w: PlannedWorkout, prefix: string): boolean => (w.adaptedBy ?? "").startsWith(prefix);

export function decision(
  rule: Rule,
  d: {
    action: AdaptationAction;
    confidence: number;
    whatChanged: string;
    why: string;
    nextSteps: string;
    evidence: Evidence[];
    changes?: WorkoutChange[];
    question?: string;
    questionId?: string;
    holdsProgression?: AdaptationDecision["holdsProgression"];
    targetUpdate?: { vdot: number };
  },
): AdaptationDecision {
  const out: AdaptationDecision = {
    ruleId: rule.id,
    ruleVersion: rule.version,
    action: d.action,
    priority: rule.priority,
    confidence: d.confidence,
    whatChanged: d.whatChanged,
    why: d.why,
    nextSteps: d.nextSteps,
    evidence: d.evidence,
    changes: d.changes ?? [],
  };
  if (d.question) out.question = d.question;
  if (d.questionId) out.questionId = d.questionId;
  if (d.holdsProgression) out.holdsProgression = d.holdsProgression;
  if (d.targetUpdate) out.targetUpdate = d.targetUpdate;
  return out;
}

/** Latest answer to a question, given on or after `since`. */
export function answer(ctx: RuleContext, questionId: string, since: string): string | null {
  const xs = ctx.answers.filter((a) => a.questionId === questionId && a.date >= since).sort((a, b) => b.date.localeCompare(a.date));
  return xs[0]?.value ?? null;
}

/**
 * Remove movements the athlete must avoid from one session (S-1): a station swaps to its best safe
 * alternative (or is skipped), a strength exercise that loads the area is dropped. Returns null when
 * nothing in the session involves those movements.
 */
export function withoutMovements(w: PlannedWorkout, avoid: readonly string[], ruleId: string, areaLabel: string): PlannedWorkout | null {
  let touched = false;
  const steps = w.steps.flatMap((s) => {
    if (s.station?.recommended && isAvoided(s.station.recommended.id, avoid)) {
      touched = true;
      const safe = s.station.alternatives.filter((a) => !isAvoided(a.id, avoid));
      const [first, ...rest] = safe;
      const station = { ...s.station, recommended: first ?? null, alternatives: rest };
      if (!first) station.unavailableNote = `Skip this station for now (pain check: ${areaLabel}). Walk or rest for the same time.`;
      return [{ ...s, station }];
    }
    if (s.exercise && strengthItemAvoided(s.exercise.name, avoid)) {
      touched = true;
      return [];
    }
    return [s];
  });
  if (!touched) return null;
  return {
    ...w,
    steps,
    rationale: `Movements that load your ${areaLabel} are removed for now. ${w.rationale}`,
    adaptedBy: ruleId,
  };
}
