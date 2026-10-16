// adapt-plan (D-026): runs the adaptation engine on the signed-in athlete's current plan after a
// workout is logged or a question is answered, and stores the result through record_adaptation:
// a new plan version ('adapted') plus its decisions when anything changed, and the weekly review
// every time. Replies with the review for the app to show.
//
// Everything is read from the database with the caller's own token (row-level security); the
// request carries only the athlete's local date. If another run saved a newer version first,
// this one re-runs once on that version. If nothing has changed since the latest review (same
// day, same version, no new logs, answers or results), that review is returned without running
// again, so repeated calls can't fill the history.
import {
  adaptPlan,
  adaptationInputFromRows,
  ADAPTATION_LOOKBACK_DAYS,
  decisionRows,
  ENGINE_VERSION,
  planFromRecord,
  planToRecord,
  reviewForStorage,
  reviewStillCurrent,
} from "../_shared/engine.js";
import { admin, caller, reply } from "../_shared/request.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  const who = await caller(req, "Sign in to update your plan.");
  if (who instanceof Response) return who;
  const { asUser, today } = who;

  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await runOnce(asUser, today);
    if (outcome !== "retry") return outcome;
  }
  return reply(409, { error: "Your plan changed while we were updating it. Try again in a moment." });
});

async function runOnce(asUser: SupabaseClient, today: string): Promise<Response | "retry"> {
  const failed = (what: string, message: string) => {
    console.error(what, message);
    return reply(500, { error: "Your plan couldn't be updated. Try again in a moment." });
  };

  const plan = await asUser.from("training_plans").select("id, athlete_id, current_version")
    .eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (plan.error) return failed("plan read failed", plan.error.message);
  if (!plan.data) return reply(409, { error: "Build your plan first." });

  const cached = await latestIfCurrent(asUser, plan.data.current_version, today);
  if (cached instanceof Response) return cached;
  if (cached) return reply(200, { version: plan.data.current_version, changed: false, review: cached, reused: true });

  const version = await asUser.from("plan_versions").select("id, version, created_at, basis, weeks, inputs")
    .eq("plan_id", plan.data.id).eq("version", plan.data.current_version).single();
  if (version.error) return failed("version read failed", version.error.message);

  const since = addDays(today, -ADAPTATION_LOOKBACK_DAYS);
  const [workouts, logs, answers, recovery, runs] = await Promise.all([
    asUser.from("planned_workouts").select("workout_key, scheduled_date, position, sport, session_type, title, estimated_minutes, planned_meters, planned_load, adapted_by_rule, body")
      .eq("plan_version_id", version.data.id),
    asUser.from("completed_workouts").select("*").gte("workout_date", since),
    asUser.from("athlete_answers").select("question_id, value, answered_on").gte("answered_on", since),
    asUser.from("daily_recovery").select("day, source, hrv_ms, resting_hr, sleep_hours").gte("day", since),
    asUser.from("race_results").select("id, event_date, distance_meters, finish_seconds, timing").eq("kind", "run"),
  ]);
  const readError = [workouts, logs, answers, recovery, runs].find((r) => r.error)?.error;
  if (readError) return failed("read failed", readError.message);

  const current = planFromRecord({
    planId: plan.data.id,
    athleteId: plan.data.athlete_id,
    version: version.data.version,
    createdAt: version.data.created_at,
    goal: version.data.inputs.goal,
    basis: version.data.basis,
    weeks: version.data.weeks,
    workouts: workouts.data ?? [],
  });
  const input = adaptationInputFromRows(current, today, {
    logs: logs.data ?? [],
    answers: answers.data ?? [],
    recovery: recovery.data ?? [],
    runResults: runs.data ?? [],
  });
  const result = adaptPlan(input, { now: new Date().toISOString() });
  const record = result.changed ? planToRecord(result.plan) : null;
  const review = reviewForStorage(result.review, input.answers, today);

  const { data, error } = await admin().rpc("record_adaptation", {
    p_plan_id: plan.data.id,
    p_athlete_id: plan.data.athlete_id,
    p_from_version: version.data.version,
    p_engine_version: ENGINE_VERSION,
    p_basis: record ? record.basis : null,
    p_weeks: record ? record.weeks : null,
    p_workouts: record ? record.workouts : null,
    p_decisions: decisionRows(result),
    p_review: review,
  });
  if (error?.code === "40001") return "retry"; // another run saved a newer version first
  if (error) return failed("save failed", error.message);
  return reply(200, { ...(data as Record<string, unknown>), review });
}

/** The latest review if it still applies (reviewStillCurrent), null to run, or an error reply. */
async function latestIfCurrent(asUser: SupabaseClient, currentVersion: number, today: string) {
  const newest = (table: string, column: string) => asUser.from(table).select(column).order(column, { ascending: false }).limit(1).maybeSingle();
  const [review, log, answer, recovery, result] = await Promise.all([
    asUser.from("plan_reviews").select("review, from_version, to_version, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    newest("completed_workouts", "updated_at"),
    newest("athlete_answers", "created_at"),
    newest("daily_recovery", "created_at"),
    newest("race_results", "created_at"),
  ]);
  const readError = [review, log, answer, recovery, result].find((r) => r.error)?.error;
  if (readError) {
    console.error("freshness read failed", readError.message);
    return reply(500, { error: "Your plan couldn't be updated. Try again in a moment." });
  }
  if (!review.data) return null;
  const times = [log.data?.updated_at, answer.data?.created_at, recovery.data?.created_at, result.data?.created_at].filter((t): t is string => !!t);
  const latestInputAt = times.length ? times.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null;
  const latest = { review: review.data.review, resultVersion: review.data.to_version ?? review.data.from_version, createdAt: review.data.created_at };
  return reviewStillCurrent(latest, currentVersion, today, latestInputAt) ? review.data.review : null;
}

