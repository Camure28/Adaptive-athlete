/** The athlete's chosen start day (onboarding: today, tomorrow, next Monday or a date). */
import { describe, expect, it } from "vitest";
import { generateHyroxPlan, planStart, type HyroxAthlete } from "../src/hyrox/generator.js";
import { presetFor } from "../src/hyrox/equipment.js";
import { HARD_SESSION_TYPES, type HyroxGoal, type TrainingPlan } from "../src/types.js";
import { addDays, daysBetween } from "../src/units/units.js";

const TODAY = "2026-10-15"; // Thursday
const NOW = "2026-10-15T12:00:00-06:00";
const athlete = (over: Partial<HyroxAthlete> = {}): HyroxAthlete => ({
  id: "a",
  level: "intermediate",
  currentWeeklyRunMeters: { value: 25_000, provenance: { source: "manual", kind: "user_reported", confidence: 0.7, observedAt: TODAY } },
  availableDays: [0, 1, 3, 4, 5], // Mon, Tue, Thu, Fri, Sat
  maxWeekdayMinutes: 90,
  maxWeekendMinutes: 150,
  equipment: [...presetFor(["hyrox_club"])],
  runResults: [],
  exclusions: [],
  ...over,
});
const goal: HyroxGoal = { id: "g", kind: "hyrox", date: "2027-02-27", division: "open", sex: "women", priority: "A" };
const plan = (a: HyroxAthlete): TrainingPlan => generateHyroxPlan(a, goal, { planId: "p", today: TODAY, now: NOW });
const all = (p: TrainingPlan) => p.weeks.flatMap((w) => w.workouts);
const first = (p: TrainingPlan) => all(p).map((w) => w.date).sort()[0]!;

describe("plan start date", () => {
  it("defaults to next Monday", () => {
    expect(planStart({}, TODAY)).toBe("2026-10-19");
    expect(first(plan(athlete()))).toBe("2026-10-19");
  });

  it("can start today: the first session is today, and week 1 is a short week", () => {
    const p = plan(athlete({ planStartDate: TODAY }));
    expect(first(p)).toBe(TODAY);
    const week1 = p.weeks[0]!;
    expect(week1.startDate).toBe("2026-10-12");
    expect(week1.workouts.every((w) => w.date >= TODAY)).toBe(true);
    // Thu, Fri, Sat are 3 of the athlete's 5 days, so the week's running shrinks to match.
    expect(week1.targetRunMeters).toBeLessThan(p.weeks[1]!.targetRunMeters);
    const full = plan(athlete());
    expect(week1.workouts.length).toBeLessThan(full.weeks[0]!.workouts.length);
  });

  it("shapes the short first week by training status (approved 2026-10-16)", () => {
    const hard = (p: TrainingPlan) => p.weeks[0]!.workouts.filter((w) => HARD_SESSION_TYPES.has(w.type));
    const building = plan(athlete({ planStartDate: TODAY, trainingStatus: "building" }));
    expect(hard(building)).toEqual([]);
    expect(building.weeks[0]!.workouts.every((w) => ["easy_run", "long_run", "strength"].includes(w.type))).toBe(true);

    const consistent = plan(athlete({ planStartDate: TODAY, trainingStatus: "consistent" }));
    expect(hard(consistent).length).toBeLessThanOrEqual(1);
    const firstSession = consistent.weeks[0]!.workouts.find((w) => w.date === TODAY)!;
    expect(firstSession.type).toBe("easy_run");

    const ready = plan(athlete({ planStartDate: TODAY, trainingStatus: "race_ready" }));
    expect(hard(ready).length).toBeGreaterThan(0);
  });

  it("never puts hard sessions on back-to-back days in a short first week", () => {
    const p = plan(athlete({ planStartDate: TODAY, trainingStatus: "race_ready" }));
    const hardDays = [...new Set(p.weeks[0]!.workouts.filter((w) => HARD_SESSION_TYPES.has(w.type)).map((w) => w.date))].sort();
    for (let i = 1; i < hardDays.length; i++) expect(daysBetween(hardDays[i - 1]!, hardDays[i]!)).toBeGreaterThan(1);
  });

  it("can start tomorrow or on a later date", () => {
    expect(first(plan(athlete({ planStartDate: "2026-10-16" })))).toBe("2026-10-16");
    const later = plan(athlete({ planStartDate: "2026-11-04" }));
    expect(first(later) >= "2026-11-04").toBe(true);
    expect(later.weeks[0]!.startDate).toBe("2026-11-02");
  });

  it("starts the next Monday when no training day is left in the start week", () => {
    // Sunday start, but the athlete doesn't train on Sundays.
    const p = plan(athlete({ planStartDate: "2026-10-18" }));
    expect(p.weeks[0]!.startDate).toBe("2026-10-19");
    expect(first(p)).toBe("2026-10-19");
  });

  it("ignores a start date that has passed, so a rebuilt plan keeps this week (D-022)", () => {
    const p = plan(athlete({ planStartDate: addDays(TODAY, -3) }));
    expect(first(p)).toBe("2026-10-19");
  });
});
