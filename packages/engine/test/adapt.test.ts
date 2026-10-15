import { describe, expect, it } from "vitest";
import { adaptPlan } from "../src/adapt/engine.js";
import { allWorkouts, isKeyRun, makeContext } from "../src/adapt/context.js";
import { DEFAULT_ADAPTATION_CONFIG } from "../src/adapt/config.js";
import { loadSpikeRule } from "../src/adapt/rules.js";
import { llmSafeContext } from "../src/explain/llm-context.js";
import type { CompletedWorkout, IsoDate, PlannedWorkout, TrainingPlan } from "../src/types.js";
import { addDays } from "../src/units/units.js";
import { complete, completeRange, halfPlan, NOW, recoverySeries } from "./fixtures.js";

const PLAN_START = "2026-10-19";
const keys = (p: TrainingPlan): PlannedWorkout[] => allWorkouts(p).filter(isKeyRun).sort((a, b) => a.date.localeCompare(b.date));

/** Everything before `today` completed as planned, with per-key-session overrides. */
function history(plan: TrainingPlan, today: IsoDate, overrides: Map<string, Parameters<typeof complete>[1]> = new Map()): CompletedWorkout[] {
  return allWorkouts(plan)
    .filter((w) => w.date >= PLAN_START && w.date < today)
    .map((w) => complete(w, overrides.get(w.id) ?? {}));
}

const run = (plan: TrainingPlan, today: IsoDate, completed: CompletedWorkout[], extra: Partial<Parameters<typeof adaptPlan>[0]> = {}, config = {}) =>
  adaptPlan({ plan, today, completed, recovery: [], races: [], ...extra }, { now: NOW, config });

describe("no change without justification", () => {
  it("keeps the plan when there is no data yet", () => {
    const plan = halfPlan();
    const r = run(plan, PLAN_START, []);
    expect(r.changed).toBe(false);
    expect(r.plan).toBe(plan);
    expect(r.summary.action).toBe("keep");
  });

  it("does not react to a single hard session", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map([[k[2]!.id, { rpeDelta: 3, paceFactor: 1.08 }]])));
    expect(r.changed).toBe(false);
    expect(r.summary.why).toMatch(/Single unusual sessions/);
  });

  it("does not react to one bad night of recovery data", () => {
    const plan = halfPlan();
    const today = addDays(keys(plan)[3]!.date, -1);
    const recovery = recoverySeries(addDays(today, -24), 25, (i) => (i === 24 ? { hrv: 35, rhr: 62 } : { hrv: 60 + (i % 3), rhr: 50 }));
    const r = run(plan, today, history(plan, today), { recovery });
    expect(r.applied.find((d) => d.ruleId === "recovery_trend")).toBeUndefined();
  });
});

describe("effort trend", () => {
  it("reduces the next key session after 2 of 3 sessions were harder than intended", () => {
    const plan = halfPlan();
    const snapshot = JSON.parse(JSON.stringify(plan)) as TrainingPlan;
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const overrides = new Map([[k[1]!.id, { rpeDelta: 2 }], [k[2]!.id, { rpeDelta: 2 }]]);
    const r = run(plan, today, history(plan, today, overrides));

    expect(r.changed).toBe(true);
    expect(r.plan.version).toBe(2);
    const d = r.applied.find((x) => x.ruleId === "effort_trend")!;
    expect(d.action).toBe("reduce_intensity");
    expect(d.evidence.length).toBe(2);
    expect(d.whatChanged && d.why && d.nextSteps).toBeTruthy();

    const next = k.find((w) => w.date > today)!;
    const revised = allWorkouts(r.plan).find((w) => w.id === next.id)!;
    expect(revised.adaptedBy).toBe("effort_trend");
    expect(revised.plannedLoad).toBeLessThan(next.plannedLoad);
    // The previous version is untouched (auditable history).
    expect(plan).toEqual(snapshot);
  });

  it("detects pace shortfall from interval splits even when RPE looks normal", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const overrides = new Map([[k[1]!.id, { paceFactor: 1.07 }], [k[2]!.id, { paceFactor: 1.07 }]]);
    const r = run(plan, today, history(plan, today, overrides));
    expect(r.applied.map((d) => d.ruleId)).toContain("effort_trend");
  });
});

describe("pain safety", () => {
  it("protects the next days after a single pain report and asks for follow-up", () => {
    const plan = halfPlan();
    const today = "2026-10-29";
    const hist = history(plan, today);
    const last = hist.filter((c) => c.sport === "run").at(-1)!;
    last.pain = { level: 5, location: "left shin" };

    const r = run(plan, today, hist);
    const d = r.applied[0]!;
    expect(d.ruleId).toBe("pain_safety");
    expect(d.question).toBeTruthy();
    expect(d.nextSteps).toMatch(/physiotherapist or doctor/);
    expect(d.why).not.toMatch(/diagnos(is|ed)|stress fracture|shin splints/i);

    const window = allWorkouts(r.plan).filter((w) => w.date > today && w.date <= addDays(today, 5));
    expect(window.some((w) => w.sport === "run")).toBe(false);
  });

  it("suppresses progression while pain is active", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[4]!.date, 1);
    const overrides = new Map(k.slice(0, 5).map((w) => [w.id, { rpeDelta: -2, paceFactor: 0.985 }]));
    const hist = history(plan, today, overrides);
    hist.at(-1)!.pain = { level: 6 };
    const r = run(plan, today, hist);
    expect(r.applied.some((d) => d.action === "progress")).toBe(false);
    expect(r.suppressed.some((s) => s.decision.action === "progress")).toBe(true);
  });
});

describe("data quality", () => {
  it("asks for effort data instead of guessing when a key session has none", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[1]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map([[k[1]!.id, { rpeDelta: null, withSplits: false }]])));
    expect(r.changed).toBe(false);
    expect(r.applied[0]!.action).toBe("ask_clarification");
    expect(r.applied[0]!.question).toMatch(/0 \(rest\) to 10/);
  });
});

describe("missed sessions", () => {
  it("eases back in rather than making up missed work, and never increases volume", () => {
    const plan = halfPlan();
    const today = "2026-11-02";
    const done = history(plan, today).filter((c) => c.date < "2026-10-27"); // last week entirely missed
    const r = run(plan, today, done);
    const d = r.applied.find((x) => x.ruleId === "missed_sessions")!;
    expect(d.action).toBe("reduce_volume");
    for (const c of d.changes) {
      expect(c.after!.plannedDistanceMeters ?? 0).toBeLessThanOrEqual(c.before!.plannedDistanceMeters ?? 0);
    }
    expect(d.changes.some((c) => c.before!.type !== c.after!.type && c.after!.type === "easy_run")).toBe(true);
  });
});

describe("recovery trend", () => {
  const plan = halfPlan();
  const today = addDays(keys(plan)[3]!.date, -1);
  const baseline = (i: number) => ({ hrv: 60 + (i % 3) - 1, rhr: 50 + (i % 2) });

  it("eases the next hard session after sustained suppressed markers", () => {
    const recovery = recoverySeries(addDays(today, -24), 25, (i) => (i >= 21 ? { hrv: 45, rhr: 58 } : baseline(i)));
    const r = run(plan, today, history(plan, today), { recovery });
    const d = r.applied.find((x) => x.ruleId === "recovery_trend")!;
    expect(d.action).toBe("replace_easier");
    expect(d.changes[0]!.after!.type).toBe("easy_run");
  });

  it("never mixes baselines from different devices", () => {
    const recovery = [
      ...recoverySeries(addDays(today, -24), 20, baseline, "garmin"),
      ...recoverySeries(addDays(today, -4), 5, () => ({ hrv: 30, rhr: 65 }), "oura"),
    ];
    const r = run(plan, today, history(plan, today), { recovery });
    expect(r.applied.find((x) => x.ruleId === "recovery_trend")).toBeUndefined();
  });

  it("requires a minimum baseline", () => {
    const recovery = recoverySeries(addDays(today, -7), 8, (i) => (i >= 4 ? { hrv: 30, rhr: 65 } : baseline(i)));
    const r = run(plan, today, history(plan, today), { recovery });
    expect(r.applied.find((x) => x.ruleId === "recovery_trend")).toBeUndefined();
  });
});

describe("targets", () => {
  it("recalculates paces after a faster race, with the race as evidence", () => {
    const plan = halfPlan();
    const today = "2026-11-02";
    const races = [{ id: "new-10k", date: "2026-11-01", distanceMeters: 10_000, finishSeconds: 42 * 60, timing: "official" as const }];
    const r = run(plan, today, history(plan, today), { races });
    const d = r.applied.find((x) => x.ruleId === "new_race_result")!;
    expect(d.action).toBe("recalculate_targets");
    expect(d.evidence[0]!.refs).toEqual(["new-10k"]);
    expect(r.plan.basis.vdot!.value).toBeGreaterThan(plan.basis.vdot!.value + 1);
    expect(r.plan.basis.paces!.threshold.fastSecPerKm).toBeLessThan(plan.basis.paces!.threshold.fastSecPerKm);
  });

  it("caps downward revisions from a single bad race", () => {
    const plan = halfPlan();
    const races = [{ id: "bad", date: "2026-11-01", distanceMeters: 10_000, finishSeconds: 60 * 60, timing: "official" as const }];
    const r = run(plan, "2026-11-02", history(plan, "2026-11-02"), { races });
    expect(r.plan.basis.vdot!.value).toBeCloseTo(plan.basis.vdot!.value - DEFAULT_ADAPTATION_CONFIG.maxVdotDrop, 1);
  });

  it("progresses targets only after a consistent pattern of easier-than-intended sessions", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const easier = { rpeDelta: -2, paceFactor: 0.985 };
    const two = run(plan, today, history(plan, today, new Map(k.slice(1, 3).map((w) => [w.id, easier]))));
    expect(two.applied.some((d) => d.action === "progress")).toBe(false);

    const three = run(plan, today, history(plan, today, new Map(k.slice(0, 3).map((w) => [w.id, easier]))));
    const d = three.applied.find((x) => x.action === "progress")!;
    expect(three.plan.basis.vdot!.value).toBeCloseTo(plan.basis.vdot!.value + DEFAULT_ADAPTATION_CONFIG.progressionStep, 5);
    expect(d.changes.every((c) => (c.after!.plannedDistanceMeters ?? 0) === (c.before!.plannedDistanceMeters ?? 0))).toBe(true);
  });
});

describe("guardrails", () => {
  it("suppresses reductions that would exceed the weekly load cap", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const overrides = new Map([[k[1]!.id, { rpeDelta: 2 }], [k[2]!.id, { rpeDelta: 2 }]]);
    const r = run(plan, today, history(plan, today, overrides), {}, { maxWeeklyLoadReduction: 0.01 });
    expect(r.changed).toBe(false);
    expect(r.suppressed[0]!.reason).toMatch(/more than 1%/);
    expect(r.summary.action).toBe("keep");
  });

  it("load-spike rule needs a valid chronic window and fires on a real spike", () => {
    const plan = halfPlan();
    const today = "2026-11-10";
    const mk = (date: string, min: number, rpe: number): CompletedWorkout => ({ id: date, date, sport: "run", status: "completed", source: "manual", durationSeconds: min * 60, rpe });
    const steady = Array.from({ length: 28 }, (_, i) => mk(addDays(today, -i), 40, 3));
    const ctx = (completed: CompletedWorkout[]) => makeContext({ plan, today, completed, recovery: [], races: [] }, DEFAULT_ADAPTATION_CONFIG);
    expect(loadSpikeRule.evaluate(ctx(steady))).toBeNull();
    expect(loadSpikeRule.evaluate(ctx(steady.slice(0, 14)))).toBeNull(); // too little history

    const spiked = steady.map((w, i) => (i < 7 ? { ...w, durationSeconds: 110 * 60, rpe: 6 } : w));
    const d = loadSpikeRule.evaluate(ctx(spiked))!;
    expect(d.action).toBe("reduce_volume");
    expect(d.why).toMatch(/4-week average/);
  });
});

describe("LLM data boundary", () => {
  it("withholds data from providers whose terms prohibit AI use, plus free-text and pain details", () => {
    const plan = halfPlan();
    const [w1, w2] = allWorkouts(plan);
    const manual = { ...complete(w1!), notes: "felt rough after work", pain: { level: 3 } };
    const strava = complete(w2!, { source: "strava" });
    const ctx = llmSafeContext([], [manual, strava]);
    expect(ctx.workouts).toHaveLength(1);
    expect(ctx.withheld).toBe(1);
    expect(JSON.stringify(ctx)).not.toMatch(/rough|pain/);
  });
});

describe("history fixture sanity", () => {
  it("completeRange covers only the requested dates", () => {
    const plan = halfPlan();
    const done = completeRange(plan, "2026-10-19", "2026-10-25");
    expect(done.every((d) => d.date >= "2026-10-19" && d.date <= "2026-10-25")).toBe(true);
    expect(done.length).toBeGreaterThan(3);
  });
});
