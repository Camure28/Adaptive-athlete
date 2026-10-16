/**
 * Adaptation results as stored (D-026, supabase/migrations/20261016000008_adaptation_runs.sql):
 * adaptation_decisions rows for a run that changed the plan, and the weekly review every run
 * saves for the athlete. Pure, so the Edge Function stays thin and this is unit-tested.
 */
import type { AdaptationResult, WeeklyReview } from "../adapt/engine.js";
import type { AdaptationInput } from "../adapt/context.js";
import type { AdaptationDecision, BodyArea, CheckIn, CompletedWorkout, DataSource, IsoDate, RaceResult, TrainingPlan } from "../types.js";
import { PAIN_AREA_MAP } from "../adapt/pain-map.js";
import { addDays } from "../units/units.js";
import { fromLogRow, type LogRow } from "./logs.js";

/** How far back the server reads data: the longest rule window (28-day baselines, 4-week load) plus margin. */
export const ADAPTATION_LOOKBACK_DAYS = 60;

export interface AdaptationRows {
  logs: (LogRow & { id: string })[];
  answers: { question_id: string; value: string; answered_on: IsoDate }[];
  recovery: { day: IsoDate; source: string; hrv_ms: number | string | null; resting_hr: number | null; sleep_hours: number | string | null }[];
  runResults: { id: string; event_date: IsoDate; distance_meters: number | string; finish_seconds: number; timing: string }[];
}

/**
 * Answer values the app offers that the engine reads beyond the question itself (D-026, awaiting
 * coach review): a pain follow-up of "better", "gone" or "improving" counts as a pain check-in
 * (rules S-1/S-2 read `painImproved`), and an "S-1.area" answer fills in the area of the pain log
 * it was asked about.
 */
export const PAIN_IMPROVED_ANSWERS: Readonly<Record<string, readonly string[]>> = {
  "S-2.followup": ["better"],
  "S-1.followup": ["gone", "improving"],
};

/** adaptPlan's input from stored rows (numeric columns may arrive as strings). */
export function adaptationInputFromRows(plan: TrainingPlan, today: IsoDate, rows: AdaptationRows): AdaptationInput {
  const since = addDays(today, -ADAPTATION_LOOKBACK_DAYS);
  const answers = rows.answers.map((a) => ({ questionId: a.question_id, value: a.value, date: a.answered_on }));
  const checkIns: CheckIn[] = answers
    .filter((a) => PAIN_IMPROVED_ANSWERS[a.questionId]?.includes(a.value))
    .map((a) => ({ date: a.date, painImproved: true }));
  const completed = rows.logs.filter((r) => r.workout_date >= since && r.workout_date <= today).map(fromLogRow);
  return {
    plan,
    today,
    completed: withAnsweredAreas(completed, answers),
    answers,
    recovery: rows.recovery
      .filter((r) => r.day >= since && r.day <= today)
      .map((r) => {
        const d: AdaptationInput["recovery"][number] = { date: r.day, source: r.source as DataSource };
        if (r.hrv_ms !== null) d.hrvMs = Number(r.hrv_ms);
        if (r.resting_hr !== null) d.restingHr = r.resting_hr;
        if (r.sleep_hours !== null) d.sleepHours = Number(r.sleep_hours);
        return d;
      }),
    races: rows.runResults.map((r): RaceResult => ({
      id: r.id, date: r.event_date, distanceMeters: Number(r.distance_meters), finishSeconds: r.finish_seconds, timing: r.timing as RaceResult["timing"],
    })),
    checkIns,
  };
}

/** The latest "other"-area pain log on or before an S-1.area answer takes the answered area. */
function withAnsweredAreas(completed: CompletedWorkout[], answers: { questionId: string; value: string; date: IsoDate }[]): CompletedWorkout[] {
  const areaAnswers = answers.filter((a) => a.questionId === "S-1.area" && a.value in PAIN_AREA_MAP && a.value !== "other");
  if (areaAnswers.length === 0) return completed;
  const out = completed.map((c) => (c.pain ? { ...c, pain: { ...c.pain } } : c));
  for (const a of areaAnswers) {
    const log = out
      .filter((c) => c.pain && c.pain.level > 0 && (c.pain.area ?? "other") === "other" && c.date <= a.date)
      .sort((x, y) => y.date.localeCompare(x.date))[0];
    if (log?.pain) log.pain.area = a.value as BodyArea;
  }
  return out;
}

/** An adaptation_decisions row (without ids, versions and timestamps, which the database sets). */
export interface DecisionRow {
  rule_id: string;
  rule_version: number;
  action: AdaptationDecision["action"];
  outcome: "applied" | "suppressed";
  suppressed_reason: string | null;
  confidence: number;
  what_changed: string;
  why: string;
  next_steps: string;
  question: string | null;
  evidence: AdaptationDecision["evidence"];
  changes: AdaptationDecision["changes"];
}

/** The review the athlete sees. Changes are summarised; full before/after lives in the decisions. */
export interface StoredReview {
  checked: { sessionsLogged: number; sources: DataSource[] };
  changed: { ruleId: string; whatChanged: string; why: string; nextSteps: string; sessions: string[] }[];
  kept: string[];
  waitingOn: { ruleId: string; reason: string }[];
  questions: { questionId: string; question: string; ruleId: string }[];
}

const row = (d: AdaptationDecision, outcome: DecisionRow["outcome"], reason: string | null): DecisionRow => ({
  rule_id: d.ruleId,
  rule_version: d.ruleVersion,
  action: d.action,
  outcome,
  suppressed_reason: reason,
  confidence: Math.round(Math.min(1, Math.max(0, d.confidence)) * 100) / 100,
  what_changed: d.whatChanged,
  why: d.why,
  next_steps: d.nextSteps,
  question: d.question ?? null,
  evidence: d.evidence,
  changes: d.changes,
});

/**
 * Decisions to store for a run. Only a run that changed the plan stores them (with every applied
 * and suppressed decision, so the history explains the new version); a run that changed nothing
 * is fully described by its review, so repeated runs don't fill the history with duplicates.
 */
export function decisionRows(r: AdaptationResult): DecisionRow[] {
  if (!r.changed) return [];
  return [...r.applied.map((d) => row(d, "applied", null)), ...r.suppressed.map((s) => row(s.decision, "suppressed", s.reason))];
}

/** A question answered this recently isn't asked again, even while its rule stays active (rubric Q-1: 48 h). */
export const QUESTION_QUIET_DAYS = 2;

export function reviewForStorage(review: WeeklyReview, answers: AdaptationInput["answers"] = [], today?: IsoDate): StoredReview {
  const recent = new Set((answers ?? []).filter((a) => !today || a.date >= addDays(today, -QUESTION_QUIET_DAYS)).map((a) => a.questionId));
  return {
    checked: review.checked,
    changed: review.changed.map((d) => ({
      ruleId: d.ruleId,
      whatChanged: d.whatChanged,
      why: d.why,
      nextSteps: d.nextSteps,
      sessions: d.changes.map((c) => c.summary),
    })),
    kept: review.kept,
    waitingOn: review.waitingOn.map((w) => ({ ruleId: w.ruleId, reason: w.notEvaluated })),
    questions: review.questions.filter((q) => !recent.has(q.questionId)),
  };
}
