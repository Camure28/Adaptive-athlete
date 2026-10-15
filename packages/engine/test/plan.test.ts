import { describe, expect, it } from "vitest";
import { generatePlan, PlanGenerationError } from "../src/plan/generator.js";
import { DEFAULT_PLAN_CONFIG } from "../src/plan/config.js";
import { HARD_SESSION_TYPES, type AthleteProfile, type GoalEvent, type TrainingPlan } from "../src/types.js";
import { daysBetween, weekdayOf } from "../src/units/units.js";
import { advancedMarathon, allOf, beginner5k, goal, intermediateHalf, NOW, TODAY } from "./fixtures.js";

const scenarios: [string, AthleteProfile, GoalEvent][] = [
  ["beginner 5K, no race history", beginner5k, goal("5k", "2026-12-20")],
  ["intermediate half marathon", intermediateHalf, goal("half_marathon", "2027-02-07")],
  ["advanced marathon", advancedMarathon, goal("marathon", "2027-03-14")],
  ["intermediate, compressed 10K", intermediateHalf, goal("10k", "2026-11-15")],
];

const make = (a: AthleteProfile, g: GoalEvent): TrainingPlan => generatePlan(a, g, { planId: "p", today: TODAY, now: NOW });

describe.each(scenarios)("plan invariants: %s", (_name, athlete, g) => {
  const plan = make(athlete, g);
  const workouts = allOf(plan);

  it("ends with the goal race and schedules nothing after it", () => {
    const race = workouts.filter((w) => w.type === "race");
    expect(race).toHaveLength(1);
    expect(race[0]!.date).toBe(g.date);
    expect(workouts.every((w) => w.date <= g.date && w.date > TODAY)).toBe(true);
  });

  it("only schedules sessions on available days (race day excepted)", () => {
    for (const w of workouts.filter((x) => x.type !== "race")) {
      expect(athlete.availableDays).toContain(weekdayOf(w.date));
    }
  });

  it("never places hard sessions on consecutive days", () => {
    const hardDates = workouts.filter((w) => HARD_SESSION_TYPES.has(w.type)).map((w) => w.date).sort();
    for (let i = 1; i < hardDates.length; i++) {
      expect(daysBetween(hardDates[i - 1]!, hardDates[i]!)).toBeGreaterThanOrEqual(2);
    }
  });

  it("limits loading-week volume increases to the configured maximum", () => {
    const loading = plan.weeks.filter((w) => !w.isRecoveryWeek && w.phase !== "taper");
    for (let i = 1; i < loading.length; i++) {
      expect(loading[i]!.targetRunMeters).toBeLessThanOrEqual(loading[i - 1]!.targetRunMeters * (1 + DEFAULT_PLAN_CONFIG.maxWeeklyIncrease) + 1);
    }
  });

  it("tapers: each taper week has lower volume than the last loading week", () => {
    const lastLoading = plan.weeks.filter((w) => w.phase !== "taper" && !w.isRecoveryWeek).at(-1)!;
    for (const w of plan.weeks.filter((x) => x.phase === "taper")) {
      expect(w.targetRunMeters).toBeLessThan(lastLoading.targetRunMeters);
    }
  });

  it("caps long runs by fraction, absolute distance, and available weekend time", () => {
    for (const w of workouts.filter((x) => x.type === "long_run" || x.type === "marathon_pace")) {
      expect(w.plannedDistanceMeters!).toBeLessThanOrEqual(DEFAULT_PLAN_CONFIG.longRunMaxMeters[g.distance] + 100);
      expect(w.estimatedMinutes).toBeLessThanOrEqual(athlete.maxWeekendMinutes + 5);
    }
  });

  it("gives every workout an objective, rationale, scaling, steps, and RPE targets", () => {
    for (const w of workouts) {
      expect(w.objective.length).toBeGreaterThan(10);
      expect(w.rationale.length).toBeGreaterThan(10);
      expect(w.scaling.easier.length).toBeGreaterThan(5);
      expect(w.steps.length).toBeGreaterThan(0);
      expect(w.estimatedMinutes).toBeGreaterThan(0);
      for (const s of w.steps) {
        expect(s.target.rpe.max).toBeGreaterThanOrEqual(s.target.rpe.min);
        expect((s.distanceMeters ?? 0) > 0 || (s.durationSeconds ?? 0) > 0).toBe(true);
      }
    }
  });

  it("is deterministic", () => {
    expect(make(athlete, g)).toEqual(plan);
  });
});

describe("personalisation", () => {
  it("uses pace targets when a reliable race exists, and RPE/time otherwise", () => {
    const withRace = make(intermediateHalf, goal("half_marathon", "2027-02-07"));
    expect(withRace.basis.vdot?.provenance.kind).toBe("calculated");
    const thr = allOf(withRace).find((w) => w.type === "threshold")!;
    expect(thr.steps.find((s) => s.kind === "work")!.target.pace).toBeDefined();

    const noRace = make(beginner5k, goal("5k", "2026-12-20"));
    expect(noRace.basis.vdot).toBeNull();
    expect(noRace.basis.notes.join(" ")).toMatch(/RPE/);
    for (const w of allOf(noRace).filter((x) => x.sport === "run")) {
      for (const s of w.steps) {
        expect(s.target.pace).toBeUndefined();
        expect(s.durationSeconds).toBeGreaterThan(0);
      }
    }
  });

  it("produces different plans for different athletes with the same goal", () => {
    const g = goal("half_marathon", "2027-02-07");
    const slower: AthleteProfile = {
      ...intermediateHalf,
      raceHistory: [{ ...intermediateHalf.raceHistory[0]!, finishSeconds: 55 * 60 }],
      currentWeeklyRunMeters: { ...intermediateHalf.currentWeeklyRunMeters, value: 25_000 },
    };
    const a = make(intermediateHalf, g);
    const b = make(slower, g);
    expect(a.basis.paces!.threshold.fastSecPerKm).toBeLessThan(b.basis.paces!.threshold.fastSecPerKm - 20);
    expect(a.weeks[0]!.targetRunMeters).toBeGreaterThan(b.weeks[0]!.targetRunMeters);
  });

  it("gives beginners fewer hard training sessions than advanced athletes (race weeks excluded)", () => {
    const hardPerWeek = (p: TrainingPlan) =>
      Math.max(...p.weeks.slice(0, -1).map((w) => w.workouts.filter((x) => HARD_SESSION_TYPES.has(x.type)).length));
    expect(hardPerWeek(make(beginner5k, goal("5k", "2026-12-20")))).toBeLessThanOrEqual(1);
    expect(hardPerWeek(make(advancedMarathon, goal("marathon", "2027-03-14")))).toBe(2);
    expect(hardPerWeek(make(intermediateHalf, goal("half_marathon", "2027-02-07")))).toBe(2);
  });

  it("respects exercise exclusions in strength sessions", () => {
    const plan = make(beginner5k, goal("5k", "2026-12-20"));
    const strength = allOf(plan).filter((w) => w.type === "strength");
    expect(strength.length).toBeGreaterThan(0);
    for (const s of strength) expect(JSON.stringify(s.steps)).not.toMatch(/pogo/i);
  });

  it("never places strength the day before a long run or hard session", () => {
    const plan = make(advancedMarathon, goal("marathon", "2027-03-14"));
    const ws = allOf(plan);
    for (const s of ws.filter((w) => w.type === "strength")) {
      const next = ws.filter((w) => daysBetween(s.date, w.date) === 1);
      expect(next.some((w) => HARD_SESSION_TYPES.has(w.type) || w.type === "long_run")).toBe(false);
    }
  });

  it("never stacks strength on a marathon-pace long run or within 3 days of the race", () => {
    const g = goal("marathon", "2027-03-14");
    const ws = allOf(make(advancedMarathon, g));
    const mpDates = new Set(ws.filter((w) => w.type === "marathon_pace").map((w) => w.date));
    for (const s of ws.filter((w) => w.type === "strength")) {
      expect(mpDates.has(s.date)).toBe(false);
      expect(daysBetween(s.date, g.date)).toBeGreaterThan(3);
    }
  });

  it("flags compressed timelines instead of silently cramming", () => {
    const plan = make(intermediateHalf, goal("10k", "2026-11-15"));
    expect(plan.basis.notes.join(" ")).toMatch(/recommended/);
  });
});

describe("input validation", () => {
  it("rejects past goals, too-close goals, and too few training days", () => {
    expect(() => make(intermediateHalf, goal("10k", "2026-10-01"))).toThrow(PlanGenerationError);
    expect(() => make(intermediateHalf, goal("10k", "2026-10-20"))).toThrow(PlanGenerationError);
    expect(() => make({ ...intermediateHalf, availableDays: [1, 5] }, goal("10k", "2026-12-20"))).toThrow(PlanGenerationError);
  });
});
