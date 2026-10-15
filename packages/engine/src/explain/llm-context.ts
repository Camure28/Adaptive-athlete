/**
 * Layer 5 boundary — the ONLY path by which athlete data may reach an LLM.
 *
 * Some provider terms prohibit sending their data (including derived data) to AI models
 * (e.g. Strava API Policy, effective 2026-06-01). The engine itself is deterministic and may use
 * lawfully held data, but anything an LLM sees must come from an eligible source.
 *
 * Policy: any decision or record whose evidence touches an ineligible source is withheld from the
 * LLM entirely. The app shows the engine's own deterministic explanation for those instead.
 */

import type { AdaptationDecision, CompletedWorkout, DataSource } from "../types.js";
import { LLM_ELIGIBLE_SOURCES } from "../types.js";

export interface LlmContext {
  decisions: Pick<AdaptationDecision, "action" | "whatChanged" | "why" | "nextSteps">[];
  workouts: Pick<CompletedWorkout, "date" | "sport" | "status" | "durationSeconds" | "distanceMeters" | "rpe">[];
  /** Count of items withheld, so the assistant can say "some data can't be discussed here". */
  withheld: number;
}

const eligible = (sources: DataSource[], allowed: ReadonlySet<DataSource>): boolean =>
  sources.every((s) => allowed.has(s));

export function llmSafeContext(
  decisions: AdaptationDecision[],
  workouts: CompletedWorkout[],
  allowed: ReadonlySet<DataSource> = LLM_ELIGIBLE_SOURCES,
): LlmContext {
  let withheld = 0;
  const safeDecisions = decisions.flatMap((d) => {
    if (!eligible(d.evidence.flatMap((e) => e.sources), allowed)) {
      withheld++;
      return [];
    }
    return [{ action: d.action, whatChanged: d.whatChanged, why: d.why, nextSteps: d.nextSteps }];
  });
  const safeWorkouts = workouts.flatMap((w) => {
    if (!allowed.has(w.source)) {
      withheld++;
      return [];
    }
    // Free-text notes and pain details are excluded: least data necessary for the explanation.
    const out: LlmContext["workouts"][number] = { date: w.date, sport: w.sport, status: w.status };
    if (w.durationSeconds != null) out.durationSeconds = w.durationSeconds;
    if (w.distanceMeters != null) out.distanceMeters = w.distanceMeters;
    if (w.rpe != null) out.rpe = w.rpe;
    return [out];
  });
  return { decisions: safeDecisions, workouts: safeWorkouts, withheld };
}
