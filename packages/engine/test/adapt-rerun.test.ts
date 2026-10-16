/**
 * Re-running adaptation is stable. The server runs adaptPlan after every log (D-026), always on
 * the latest version, so running it again on its own output with the same data must change
 * nothing. Otherwise every log would stack another change onto the plan.
 */
import { describe, expect, it } from "vitest";
import { adaptPlan } from "../src/adapt/engine.js";
import { allWorkouts, isKeyRun } from "../src/adapt/context.js";
import { generateHyroxPlan, type HyroxAthlete } from "../src/hyrox/generator.js";
import { presetFor } from "../src/hyrox/equipment.js";
import type { CompletedWorkout, IsoDate, PlannedWorkout, TrainingPlan } from "../src/types.js";
import { addDays } from "../src/units/units.js";
import { complete, halfPlan, NOW, TODAY } from "./fixtures.js";

const PLAN_START = "2026-10-19";
const keys = (p: TrainingPlan): PlannedWorkout[] => allWorkouts(p).filter(isKeyRun).sort((a, b) => a.date.localeCompare(b.date));
const on = (p: TrainingPlan, date: IsoDate, type?: string) => allWorkouts(p).filter((w) => w.date === date && (!type || w.type === type));
function history(plan: TrainingPlan, today: IsoDate, overrides: Map<string, Parameters<typeof complete>[1]> = new Map(), skip: string[] = []): CompletedWorkout[] {
  return allWorkouts(plan)
    .filter((w) => w.date >= PLAN_START && w.date < today && w.type !== "rest" && !skip.includes(w.id))
    .map((w) => complete(w, overrides.get(w.id) ?? {}));
}
const run = (plan: TrainingPlan, today: IsoDate, completed: CompletedWorkout[]) =>
  adaptPlan({ plan, today, completed, recovery: [], races: [] }, { now: NOW });

type Scenario = { plan: TrainingPlan; today: IsoDate; hist: CompletedWorkout[]; expectChange: boolean };

const SCENARIOS: Record<string, () => Scenario> = {
  "no data yet": () => ({ plan: halfPlan(), today: PLAN_START, hist: [], expectChange: false }),
  "S-1 shin pain": () => {
    const plan = halfPlan();
    const hist = history(plan, "2026-11-03");
    hist.find((c) => c.date === "2026-11-02" && c.sport === "run")!.pain = { level: 5, location: "left shin" };
    return { plan, today: "2026-11-03", hist, expectChange: true };
  },
  "S-1 knee pain on a HYROX plan": () => {
    const athlete: HyroxAthlete = {
      id: "h", level: "intermediate", availableDays: [0, 1, 2, 3, 4, 5], maxWeekdayMinutes: 90, maxWeekendMinutes: 150,
      currentWeeklyRunMeters: { value: 25_000, provenance: { source: "manual", kind: "user_reported", confidence: 0.7, observedAt: TODAY } },
      equipment: [...presetFor(["hyrox_club"])], runResults: [], exclusions: [],
    };
    const plan = generateHyroxPlan(athlete, { id: "g", kind: "hyrox", date: "2027-02-27", division: "open", sex: "women", priority: "A" }, { planId: "hp", today: TODAY, now: NOW });
    const today = "2026-11-03";
    const hist = history(plan, today);
    hist.at(-1)!.pain = { level: 4, area: "knee" };
    return { plan, today, hist, expectChange: true };
  },
  "S-2 severe pain": () => {
    const plan = halfPlan();
    const hist = history(plan, "2026-11-03");
    hist.at(-1)!.pain = { level: 8, location: "knee" };
    return { plan, today: "2026-11-03", hist, expectChange: true };
  },
  "F-1 hold (P-3 also eases the next threshold)": () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[1]!.date, 1);
    return { plan, today, hist: history(plan, today, new Map([[k[0]!.id, { rpeDelta: 2 }], [k[1]!.id, { rpeDelta: 2 }]])), expectChange: true };
  },
  "F-2 rising effort": () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[3]!.date, 1);
    return { plan, today, hist: history(plan, today, new Map(k.slice(0, 4).map((w) => [w.id, { rpeDelta: 2 }]))), expectChange: true };
  },
  "F-5 fatigue": () => {
    const plan = halfPlan();
    const hist = history(plan, "2026-10-27");
    hist.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).forEach((c) => (c.fatigue = 4));
    return { plan, today: "2026-10-27", hist, expectChange: true };
  },
  "A-1 missed key session": () => {
    const plan = halfPlan();
    const missed = on(plan, "2026-10-21", "threshold")[0]!;
    return { plan, today: "2026-10-22", hist: history(plan, "2026-10-22", new Map(), [missed.id]), expectChange: true };
  },
  "P-1 on target": () => {
    const plan = halfPlan();
    return { plan, today: "2026-10-29", hist: history(plan, "2026-10-29"), expectChange: true };
  },
  "P-3 missed twice": () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    return { plan, today, hist: history(plan, today, new Map([[k[1]!.id, { paceFactor: 1.07 }], [k[2]!.id, { paceFactor: 1.07 }]])), expectChange: true };
  },
};

describe("re-running adaptation on its own output changes nothing", () => {
  for (const [name, make] of Object.entries(SCENARIOS)) {
    it(name, () => {
      const { plan, today, hist, expectChange } = make();
      const first = run(plan, today, hist);
      expect(first.changed).toBe(expectChange);
      const again = run(first.plan, today, hist);
      expect(again.changed).toBe(false);
      expect(again.plan).toBe(first.plan);
    });
  }

  it("the next day, with no new log, changes nothing either", () => {
    const { plan, today, hist } = SCENARIOS["F-2 rising effort"]!();
    const first = run(plan, today, hist);
    expect(run(first.plan, addDays(today, 1), hist).changed).toBe(false);
  });
});
