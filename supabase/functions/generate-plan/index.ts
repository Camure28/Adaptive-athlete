// generate-plan (D-022): builds the signed-in athlete's HYROX plan from their SAVED answers and
// stores it as a new immutable plan version. The app calls this after onboarding is saved.
//
// - Who: the caller is checked and their rows are read with their own token (../_shared/request.ts).
// - What: the request carries only the athlete's local date. Answers are never taken from the
//   request, so a stored plan always matches the stored answers.
// - Writing: through record_plan_version with the secret key. Athletes can't call that function.
//
// The engine is bundled into ../_shared/engine.js by `pnpm functions:build` (git-ignored).
import { ENGINE_VERSION, generateHyroxPlan, HyroxPlanError, inputsFromProfile, planToRecord } from "../_shared/engine.js";
import { admin, caller, reply } from "../_shared/request.ts";

Deno.serve(async (req) => {
  const who = await caller(req, "Sign in to build your plan.");
  if (who instanceof Response) return who;
  const { asUser, today } = who;

  const [athlete, profile, equipment, limits, goal, runs] = await Promise.all([
    asUser.from("athletes").select("id").maybeSingle(),
    asUser.from("hyrox_profiles").select("*").maybeSingle(),
    asUser.from("athlete_equipment").select("equipment"),
    asUser.from("athlete_limitations").select("movement"),
    asUser.from("goals").select("id, event_date, hyrox_division, target_finish_seconds")
      .eq("kind", "hyrox").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    asUser.from("race_results").select("id, event_date, distance_meters, finish_seconds, timing").eq("kind", "run"),
  ]);
  const readError = [athlete, profile, equipment, limits, goal, runs].find((r) => r.error)?.error;
  if (readError) {
    console.error("read failed", readError.message);
    return reply(500, { error: "Your profile couldn't be loaded. Try again in a moment." });
  }
  if (!athlete.data || !profile.data || !goal.data) return reply(409, { error: "Finish onboarding first." });

  const inputs = inputsFromProfile(
    {
      athleteId: athlete.data.id,
      profile: profile.data,
      equipment: (equipment.data ?? []).map((e) => e.equipment),
      limitations: (limits.data ?? []).map((l) => l.movement),
      goal: goal.data,
      runResults: runs.data ?? [],
    },
    today,
  );

  let record;
  try {
    record = planToRecord(generateHyroxPlan(inputs.athlete, inputs.goal, { planId: "plan", today, now: new Date().toISOString() }));
  } catch (e) {
    if (e instanceof HyroxPlanError) return reply(422, { error: e.message });
    throw e;
  }

  const { data, error } = await admin().rpc("record_plan_version", {
    p_athlete_id: athlete.data.id,
    p_goal_id: goal.data.id,
    p_engine_version: ENGINE_VERSION,
    p_starts_on: record.startsOn,
    p_basis: record.basis,
    p_weeks: record.weeks,
    p_inputs: inputs,
    p_workouts: record.workouts,
  });
  if (error) {
    console.error("save failed", error.message);
    return reply(500, { error: "Your plan couldn't be saved. Try again in a moment." });
  }
  return reply(200, data as Record<string, unknown>);
});
