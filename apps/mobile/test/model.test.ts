import { describe, expect, it } from "vitest";
import { generateHyroxPlan } from "@adaptive-athlete/engine";
import {
  applyGymTypes,
  EMPTY_ANSWERS,
  parseTime,
  parseUsDate,
  toEngineInputs,
  toSavePayload,
  suggestStatusFromPastRace,
  validateAll,
  validateStep,
  type OnboardingAnswers,
} from "../src/onboarding/model";

const TODAY = "2026-10-15";
const complete: OnboardingAnswers = {
  ...applyGymTypes(EMPTY_ANSWERS, ["crossfit"]),
  raceDate: "02/27/2027",
  division: "women_open",
  level: "first_timer",
  trainingStatus: "consistent",
  weeklyRun: "10",
  benchmarkDistance: "5k",
  benchmarkTime: "26:30",
  benchmarkDate: "09/20/2026",
  days: [0, 2, 3, 5],
  longDay: 5,
  consentHealthData: true,
};

describe("parsing", () => {
  it("reads US dates and rejects impossible ones", () => {
    expect(parseUsDate("2/27/2027")).toBe("2027-02-27");
    expect(parseUsDate("02/30/2027")).toBeNull();
    expect(parseUsDate("2027-02-27")).toBeNull();
  });
  it("reads times and rejects malformed ones", () => {
    expect(parseTime("1:25:00")).toBe(5100);
    expect(parseTime("24:30")).toBe(1470);
    expect(parseTime("24:75")).toBeNull();
    expect(parseTime("fast")).toBeNull();
  });
});

describe("validation", () => {
  it("accepts a complete set of answers", () => {
    expect(validateAll(complete, TODAY)).toEqual({});
  });
  it("explains each problem in plain language", () => {
    const e = validateStep("race", { ...EMPTY_ANSWERS, raceDate: "10/01/2026", goal: "time", targetTime: "soon" }, TODAY);
    expect(e.raceDate).toMatch(/future/);
    expect(e.division).toBeTruthy();
    expect(e.targetTime).toMatch(/1:25:00/);
    expect(validateStep("schedule", { ...complete, days: [1, 4] }, TODAY).days).toMatch(/at least 3/);
    expect(validateStep("equipment", { ...complete, equipment: ["rower"] }, TODAY).equipment).toMatch(/run/);
    expect(validateStep("review", { ...complete, consentHealthData: false }, TODAY).consentHealthData).toBeTruthy();
  });
  it("only requires a benchmark time and date when a benchmark distance is chosen", () => {
    expect(validateStep("running", { ...complete, benchmarkDistance: null, benchmarkTime: "" }, TODAY)).toEqual({});
    expect(validateStep("running", { ...complete, benchmarkTime: "" }, TODAY).benchmarkTime).toBeTruthy();
  });
});

describe("equipment presets", () => {
  it("pre-ticks the gym type's equipment and keeps manual ticks when types change", () => {
    const a = applyGymTypes(EMPTY_ANSWERS, ["crossfit"]);
    expect(a.equipment).toContain("rower");
    expect(a.equipment).not.toContain("skierg");
    const manual = { ...a, equipment: [...a.equipment, "skierg" as const] };
    const b = applyGymTypes(manual, ["crossfit", "commercial"]);
    expect(b.equipment).toContain("skierg");
    expect(b.equipment).toContain("cable_machine");
  });
});

describe("conversion", () => {
  it("converts miles, divisions and benchmarks into engine inputs", () => {
    const { athlete, goal } = toEngineInputs(complete, TODAY);
    expect(athlete.currentWeeklyRunMeters.value).toBe(16093);
    expect(goal).toMatchObject({ date: "2027-02-27", sex: "women", division: "open" });
    expect(athlete.runResults[0]).toMatchObject({ distanceMeters: 5000, finishSeconds: 1590, timing: "self_reported" });
    expect(athlete.wantsDoubles).toBeUndefined(); // only asked of Advanced athletes
  });
  it("produces a plan from onboarding answers alone", () => {
    const { athlete, goal } = toEngineInputs(complete, TODAY);
    const plan = generateHyroxPlan(athlete, goal, { planId: "p", today: TODAY, now: `${TODAY}T12:00:00Z` });
    expect(plan.weeks.length).toBeGreaterThan(10);
    expect(plan.weeks.at(-1)!.workouts.some((w) => w.type === "race")).toBe(true);
  });
  it("builds the database payload, including a past HYROX result when given", () => {
    const p = toSavePayload({ ...complete, pastHyroxTime: "1:35:00", pastHyroxDate: "04/12/2026" }, TODAY);
    expect(p.raceDate).toBe("2027-02-27");
    expect(p.results).toHaveLength(2);
    expect(p.results[1]).toMatchObject({ kind: "hyrox", finishSeconds: 5700 });
    expect(p.consentHealthData).toBe(true);
  });
});

describe("training status", () => {
  it("is required on the experience step and passed to the engine and the save payload", () => {
    expect(validateStep("experience", { ...complete, trainingStatus: null }, TODAY).trainingStatus).toBeDefined();
    expect(toEngineInputs(complete, TODAY).athlete.trainingStatus).toBe("consistent");
    expect(toSavePayload(complete, TODAY).trainingStatus).toBe("consistent");
  });
  it("a HYROX in the last 8 weeks pre-selects race-ready, without overriding a choice", () => {
    expect(suggestStatusFromPastRace({ ...complete, trainingStatus: null }, "09/27/2026", TODAY).trainingStatus).toBe("race_ready");
    expect(suggestStatusFromPastRace({ ...complete, trainingStatus: null }, "06/01/2026", TODAY).trainingStatus).toBeUndefined();
    expect(suggestStatusFromPastRace(complete, "09/27/2026", TODAY).trainingStatus).toBeUndefined();
  });
});

describe("race picker and past result splits", () => {
  it("asks for the race day when an event is picked but no day chosen", () => {
    expect(validateStep("race", { ...complete, eventId: "denver-2026-11", raceDate: "" }, TODAY).raceDate).toMatch(/which day/);
    expect(toSavePayload({ ...complete, eventId: "denver-2026-11", raceDate: "11/14/2026" }, TODAY).eventId).toBe("denver-2026-11");
  });
  it("saves splits only when some are given, and rejects badly typed ones", () => {
    const withPast = { ...complete, level: "intermediate" as const, pastHyroxTime: "1:32:10", pastHyroxDate: "05/02/2026" };
    const none = toSavePayload(withPast, TODAY).results.find((r) => r.kind === "hyrox");
    expect(none?.splits).toBeNull();
    const runs = ["4:35", "4:50", "", "", "", "", "", ""];
    const some = toSavePayload({ ...withPast, pastRunSplits: runs, pastStationSplits: { skierg: "4:30" } }, TODAY).results.find((r) => r.kind === "hyrox");
    expect(some?.splits).toEqual({ runs: [275, 290, null, null, null, null, null, null], stations: { skierg: 270 } });
    expect(validateStep("experience", { ...withPast, pastRunSplits: ["4.35", "", "", "", "", "", "", ""] }, TODAY).pastSplits).toBeDefined();
  });
});
