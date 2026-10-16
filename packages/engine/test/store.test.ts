/** Stored plans (D-022): plans survive the trip to the database and back unchanged. */
import { describe, expect, it } from "vitest";
import { generateHyroxPlan } from "../src/hyrox/generator.js";
import { presetFor } from "../src/hyrox/equipment.js";
import { inputsFromProfile, type StoredProfile } from "../src/store/inputs.js";
import { planFromRecord, planToRecord, PlanRecordError, type StoredVersion } from "../src/store/record.js";
import type { HyroxGoal, TrainingPlan } from "../src/types.js";

const TODAY = "2026-10-15";
const NOW = "2026-10-15T12:00:00-06:00";

const profile = (over: Partial<StoredProfile["profile"]> = {}): StoredProfile => ({
  athleteId: "ath-1",
  profile: {
    level: "advanced",
    wants_doubles: true,
    available_days: [5, 0, 1, 2, 3, 4],
    long_session_day: 5,
    max_weekday_minutes: 90,
    max_weekend_minutes: 150,
    weekly_run_meters: 40_000,
    training_status: "consistent",
    ...over,
  },
  equipment: [...presetFor(["hyrox_club"])],
  limitations: ["jumping", "other"],
  goal: { id: "goal-1", event_date: "2027-02-27", hyrox_division: "women_pro", target_finish_seconds: 4800 },
  runResults: [
    { id: "old", event_date: "2026-06-01", distance_meters: 10000, finish_seconds: 2700, timing: "self_reported" },
    { id: "new", event_date: "2026-09-27", distance_meters: "5000", finish_seconds: 1260, timing: "self_reported" },
  ],
});

const build = (s: StoredProfile = profile()): TrainingPlan => {
  const { athlete, goal } = inputsFromProfile(s, TODAY);
  return generateHyroxPlan(athlete, goal, { planId: "plan", today: TODAY, now: NOW });
};

const stored = (plan: TrainingPlan, over: Partial<StoredVersion> = {}): StoredVersion => {
  const r = JSON.parse(JSON.stringify(planToRecord(plan))) as ReturnType<typeof planToRecord>;
  return {
    planId: plan.id, athleteId: plan.athleteId, version: plan.version, createdAt: plan.createdAt,
    goal: plan.goal, basis: r.basis, weeks: r.weeks, workouts: r.workouts, ...over,
  };
};

describe("inputsFromProfile", () => {
  it("builds the engine inputs from saved rows", () => {
    const { athlete, goal } = inputsFromProfile(profile(), TODAY);
    expect(athlete.id).toBe("ath-1");
    expect(athlete.availableDays).toEqual([0, 1, 2, 3, 4, 5]);
    expect(athlete.preferredLongDay).toBe(5);
    expect(athlete.wantsDoubles).toBe(true);
    expect(athlete.trainingStatus).toBe("consistent");
    expect(athlete.exclusions).toEqual(["jumping"]); // "other" is a note, not a movement to exclude
    expect(athlete.currentWeeklyRunMeters.value).toBe(40_000);
    expect(goal).toEqual({ id: "goal-1", kind: "hyrox", date: "2027-02-27", division: "pro", sex: "women", priority: "A", targetFinishSeconds: 4800 });
  });

  it("uses the most recent run as the benchmark", () => {
    const { athlete } = inputsFromProfile(profile(), TODAY);
    expect(athlete.runResults).toEqual([{ id: "new", date: "2026-09-27", distanceMeters: 5000, finishSeconds: 1260, timing: "self_reported" }]);
  });

  it("passes the doubles choice only for advanced athletes, as onboarding does", () => {
    expect(inputsFromProfile(profile({ level: "competitive", wants_doubles: false }), TODAY).athlete.wantsDoubles).toBeUndefined();
    expect(inputsFromProfile(profile({ wants_doubles: null }), TODAY).athlete.wantsDoubles).toBeUndefined();
  });

  it("leaves out optional fields that weren't answered", () => {
    const s = profile({ long_session_day: null, training_status: null });
    s.goal.target_finish_seconds = null;
    s.runResults = [];
    const { athlete, goal } = inputsFromProfile(s, TODAY);
    expect("preferredLongDay" in athlete || "trainingStatus" in athlete || "targetFinishSeconds" in goal).toBe(false);
    expect(athlete.runResults).toEqual([]);
  });
});

describe("planToRecord / planFromRecord", () => {
  it("reads back exactly the plan the engine produced", () => {
    const plan = build();
    expect(planFromRecord(stored(plan))).toEqual(JSON.parse(JSON.stringify(plan)));
  });

  it("stores keys without the plan id, unique within the version, in the engine's order", () => {
    const plan = build();
    const r = planToRecord(plan);
    const all = plan.weeks.flatMap((w) => w.workouts);
    expect(r.workouts).toHaveLength(all.length);
    expect(new Set(r.workouts.map((w) => w.workout_key)).size).toBe(all.length);
    expect(r.workouts.every((w) => !w.workout_key.startsWith("plan:"))).toBe(true);
    expect(r.workouts.map((w) => w.position)).toEqual(all.map((_, i) => i));
    expect(r.startsOn).toBe(plan.weeks[0]!.startDate);
  });

  it("restores the order of sessions within a day even when rows come back shuffled", () => {
    const plan = build();
    const v = stored(plan);
    v.workouts = [...v.workouts].reverse();
    expect(planFromRecord(v)).toEqual(JSON.parse(JSON.stringify(plan)));
  });

  it("puts carried-over weeks first and numbers weeks from 0 in date order", () => {
    const plan = build();
    const v = stored(plan);
    const earlier = { startDate: "2026-10-12", phase: "base" as const, isRecoveryWeek: false, targetRunMeters: 30_000 };
    const carried = { ...v.workouts[0]!, workout_key: "2026-10-14:easy_run", scheduled_date: "2026-10-14", position: 0 };
    const back = planFromRecord({ ...v, weeks: [...v.weeks, earlier], workouts: [carried, ...v.workouts] });
    expect(back.weeks.map((w) => w.index)).toEqual(back.weeks.map((_, i) => i));
    expect(back.weeks[0]!.startDate).toBe("2026-10-12");
    expect(back.weeks[0]!.workouts.map((w) => w.id)).toEqual(["plan:2026-10-14:easy_run"]);
    expect(back.weeks[1]!.workouts).toEqual(JSON.parse(JSON.stringify(plan.weeks[0]!.workouts)));
  });

  it("rejects a session that doesn't belong to the plan", () => {
    const plan = build();
    plan.weeks[0]!.workouts[0]!.id = "other:2026-10-20:easy_run";
    expect(() => planToRecord(plan)).toThrow(PlanRecordError);
  });

  it("keeps the goal it was given", () => {
    const plan = build();
    const goal: HyroxGoal = { id: "goal-1", kind: "hyrox", date: "2027-02-27", division: "pro", sex: "women", priority: "A" };
    expect(planFromRecord(stored(plan, { goal })).goal).toEqual(goal);
  });
});
