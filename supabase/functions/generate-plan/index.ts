// generate-plan (D-022): builds the signed-in athlete's HYROX plan from their SAVED answers and
// stores it as a new immutable plan version. The app calls this after onboarding is saved.
//
// - Who: the caller's access token is checked with Supabase Auth; their rows are read with that
//   token, so row-level security limits it to their own data.
// - What: the request carries only the athlete's local date. Answers are never taken from the
//   request, so a stored plan always matches the stored answers.
// - Writing: through record_plan_version with the project's secret key (provided to Edge
//   Functions by Supabase; never in the app or the repo). Athletes can't call that function.
//
// The engine is bundled into ../_shared/engine.js by `pnpm functions:build` (git-ignored).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { ENGINE_VERSION, generateHyroxPlan, HyroxPlanError, inputsFromProfile, planToRecord } from "../_shared/engine.js";

const url = Deno.env.get("SUPABASE_URL")!;
const publishableKey = keyFrom("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secretKey = keyFrom("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

function keyFrom(jsonName: string, legacyName: string): string {
  const json = Deno.env.get(jsonName);
  const key = json ? (JSON.parse(json) as Record<string, string>).default : Deno.env.get(legacyName);
  if (!key) throw new Error(`Missing ${jsonName}`);
  return key;
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST." });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "Sign in to build your plan." });
  const asUser = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth } = await asUser.auth.getUser(token);
  if (!auth.user) return reply(401, { error: "Sign in to build your plan." });

  // The athlete's own calendar date. Allowed within a day of the server's, for time zones.
  const today = String(((await req.json().catch(() => ({}))) as { today?: unknown }).today ?? "");
  const serverDay = Date.parse(new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Math.abs(Date.parse(today) - serverDay) > 86_400_000) {
    return reply(400, { error: "Your phone's date looks wrong. Check it and try again." });
  }

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

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("record_plan_version", {
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
