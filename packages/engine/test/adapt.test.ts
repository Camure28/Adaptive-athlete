/**
 * The approved adaptation rubric (docs/ADAPTATION_ENGINE.md), rule by rule, plus the §9 scenarios.
 * Plan fixture: half-marathon plan starting Mon 2026-10-19; threshold sessions every Wednesday
 * (10-21, 10-28, 11-04, 11-11 recovery week, 11-18 …).
 */
import { describe, expect, it } from "vitest";
import { adaptPlan } from "../src/adapt/engine.js";
import { allWorkouts, isKeyRun } from "../src/adapt/context.js";
import type { Rule } from "../src/adapt/rules.js";
import { llmSafeContext } from "../src/explain/llm-context.js";
import { generateHyroxPlan, type HyroxAthlete } from "../src/hyrox/generator.js";
import { isAvoided, presetFor } from "../src/hyrox/equipment.js";
import type { AthleteAnswer, CheckIn, CompletedWorkout, IsoDate, PlannedWorkout, RaceResult, TrainingPlan } from "../src/types.js";
import { addDays } from "../src/units/units.js";
import { complete, halfPlan, NOW, recoverySeries, TODAY } from "./fixtures.js";

const PLAN_START = "2026-10-19";
const keys = (p: TrainingPlan): PlannedWorkout[] => allWorkouts(p).filter(isKeyRun).sort((a, b) => a.date.localeCompare(b.date));
const on = (p: TrainingPlan, date: IsoDate, type?: string) => allWorkouts(p).filter((w) => w.date === date && (!type || w.type === type));

/** Everything before `today` completed as planned, with per-session overrides. */
function history(plan: TrainingPlan, today: IsoDate, overrides: Map<string, Parameters<typeof complete>[1]> = new Map(), skip: string[] = []): CompletedWorkout[] {
  return allWorkouts(plan)
    .filter((w) => w.date >= PLAN_START && w.date < today && w.type !== "rest" && !skip.includes(w.id))
    .map((w) => complete(w, overrides.get(w.id) ?? {}));
}

type Extra = { recovery?: ReturnType<typeof recoverySeries>; races?: RaceResult[]; checkIns?: CheckIn[]; answers?: AthleteAnswer[] };
const run = (plan: TrainingPlan, today: IsoDate, completed: CompletedWorkout[], extra: Extra = {}, config = {}, rules?: readonly Rule[]) =>
  adaptPlan({ plan, today, completed, recovery: [], races: [], ...extra }, { now: NOW, config, ...(rules ? { rules } : {}) });

const ruleIds = (r: ReturnType<typeof run>) => r.applied.map((d) => d.ruleId);
const find = (r: ReturnType<typeof run>, id: string) => r.applied.find((d) => d.ruleId === id);

describe("no change without justification", () => {
  it("keeps the plan when there is no data yet, and says why", () => {
    const plan = halfPlan();
    const r = run(plan, PLAN_START, []);
    expect(r.changed).toBe(false);
    expect(r.plan).toBe(plan);
    expect(r.summary.action).toBe("keep");
    expect(r.review.kept.length).toBeGreaterThan(0);
  });

  it("does not react to a single hard session", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map([[k[2]!.id, { rpeDelta: 3 }]])));
    expect(r.changed).toBe(false);
    expect(ruleIds(r).filter((id) => id.startsWith("F-"))).toEqual([]);
  });

  it("one great workout and one bad night: no change", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const recovery = recoverySeries(addDays(today, -40), 41, (i) => (i === 40 ? { hrv: 35, rhr: 62 } : { hrv: 60 + (i % 3), rhr: 50 }));
    const r = run(plan, today, history(plan, today, new Map([[k[2]!.id, { rpeDelta: -2, paceFactor: 0.95 }]])), { recovery });
    expect(r.changed).toBe(false);
  });
});

describe("S — safety", () => {
  it("S-1: pain in the shin eases hard running for the week, asks a follow-up, never diagnoses", () => {
    const plan = halfPlan();
    const today = "2026-11-03";
    const hist = history(plan, today);
    hist.find((c) => c.date === "2026-11-02" && c.sport === "run")!.pain = { level: 5, location: "left shin" };
    const r = run(plan, today, hist);
    const d = find(r, "S-1")!;
    expect(d.questionId).toBe("S-1.followup");
    expect(d.nextSteps).toMatch(/physiotherapist or doctor/);
    expect(`${d.why} ${d.whatChanged}`).not.toMatch(/diagnos(is|ed)|stress fracture|shin splints/i);
    const thr = on(r.plan, "2026-11-04")[0]!;
    expect(thr.type).toBe("easy_run");
    expect(thr.adaptedBy).toBe("S-1");
  });

  it("S-1: knee pain removes movements that load the knee from HYROX sessions for 7 days", () => {
    const athlete: HyroxAthlete = {
      id: "h", level: "intermediate", availableDays: [0, 1, 2, 3, 4, 5], maxWeekdayMinutes: 90, maxWeekendMinutes: 150,
      currentWeeklyRunMeters: { value: 25_000, provenance: { source: "manual", kind: "user_reported", confidence: 0.7, observedAt: TODAY } },
      equipment: [...presetFor(["hyrox_club"])], runResults: [], exclusions: [],
    };
    const plan = generateHyroxPlan(athlete, { id: "g", kind: "hyrox", date: "2027-02-27", division: "open", sex: "women", priority: "A" }, { planId: "hp", today: TODAY, now: NOW });
    const avoid = ["deep_knee_bends", "jumping", "running_downhill"];
    const loadsKnee = (w: PlannedWorkout) => w.steps.some((s) => s.station?.recommended && isAvoided(s.station.recommended.id, avoid));
    const target = allWorkouts(plan).find((w) => w.date > addDays(PLAN_START, 7) && loadsKnee(w))!;
    const today = addDays(target.date, -2);
    const hist = history(plan, today);
    hist.at(-1)!.pain = { level: 4, area: "knee" };
    const r = run(plan, today, hist);
    expect(find(r, "S-1")).toBeTruthy();
    const window = allWorkouts(r.plan).filter((w) => w.date >= today && w.date <= addDays(hist.at(-1)!.date, 6));
    expect(window.some(loadsKnee)).toBe(false);
  });

  it("S-1: low pain in the same area twice in a week still counts", () => {
    const plan = halfPlan();
    const today = "2026-11-03";
    const hist = history(plan, today);
    hist.find((c) => c.date === "2026-10-29")!.pain = { level: 2, location: "right knee" };
    hist.find((c) => c.date === "2026-11-02" && c.sport === "run")!.pain = { level: 3, location: "knee" };
    expect(find(run(plan, today, hist), "S-1")?.why).toMatch(/more than once/);
  });

  it("S-2: severe pain means rest until it improves", () => {
    const plan = halfPlan();
    const today = "2026-11-03";
    const hist = history(plan, today);
    hist.at(-1)!.pain = { level: 8, location: "knee" };
    const r = run(plan, today, hist);
    expect(find(r, "S-2")!.nextSteps).toMatch(/physiotherapist or doctor/);
    for (const d of [today, "2026-11-04", "2026-11-05"]) expect(on(r.plan, d).every((w) => w.type === "rest")).toBe(true);

    const better = run(plan, today, hist, { checkIns: [{ date: today, painImproved: true }] });
    expect(find(better, "S-2")).toBeUndefined();
    expect(find(better, "S-1")).toBeTruthy();
  });

  it("S-3: 'not feeling 100%' makes the next 2 days easy or rest", () => {
    const plan = halfPlan();
    const today = "2026-11-03";
    const r = run(plan, today, history(plan, today), { checkIns: [{ date: today, notFeeling100: true }] });
    expect(find(r, "S-3")).toBeTruthy();
    expect(on(r.plan, "2026-11-04", "threshold")).toEqual([]);
    expect(on(r.plan, "2026-11-04").every((w) => w.type === "easy_run" || w.type === "rest")).toBe(true);
  });

  it("safety blocks progression", () => {
    const plan = halfPlan();
    const today = "2026-11-03";
    const hist = history(plan, today);
    hist.at(-1)!.pain = { level: 6, location: "hip" };
    const r = run(plan, today, hist);
    expect(r.applied.some((d) => d.action === "progress")).toBe(false);
    expect(r.suppressed.some((s) => s.decision.ruleId === "P-1")).toBe(true);
  });
});

describe("F — fatigue", () => {
  it("F-1: RPE 2+ over target on 2 of 3 hard sessions holds progression without changing sessions", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[1]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map([[k[0]!.id, { rpeDelta: 2 }], [k[1]!.id, { rpeDelta: 2 }]])));
    const d = find(r, "F-1")!;
    expect(d.changes).toEqual([]);
    expect(d.holdsProgression).toBe("all");
    expect(find(r, "F-2")).toBeUndefined();
    expect(r.applied.some((x) => x.action === "progress")).toBe(false);
  });

  it("F-2: 3 of the last 4 hard sessions much harder than intended cuts next week's hard work 20%", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[3]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map(k.slice(0, 4).map((w) => [w.id, { rpeDelta: 2 }]))));
    const d = find(r, "F-2")!;
    expect(d.question).toMatch(/sleep and stress/);
    const before = k[4]!;
    const after = allWorkouts(r.plan).find((w) => w.id === before.id)!;
    expect(after.adaptedBy).toBe("F-2");
    expect(after.plannedDistanceMeters!).toBeLessThan(before.plannedDistanceMeters!);
    expect(after.type).toBe(before.type);
  });

  it("F-4: low HRV and high resting HR for 3+ days asks before removing the week's only hard session", () => {
    const plan = halfPlan();
    const today = "2026-10-26";
    const recovery = recoverySeries(addDays(today, -40), 41, (i) => (i >= 34 ? { hrv: 45, rhr: 58 } : { hrv: 60 + (i % 3) - 1, rhr: 50 + (i % 2) }));
    const r = run(plan, today, history(plan, today), { recovery });
    const ask = find(r, "F-4")!;
    expect(ask.action).toBe("ask_clarification");
    expect(ask.questionId).toBe("F-4.confirm");
    expect(on(r.plan, "2026-10-28", "threshold")).toHaveLength(1);

    const yes = run(plan, today, history(plan, today), { recovery, answers: [{ questionId: "F-4.confirm", date: today, value: "yes" }] });
    expect(find(yes, "F-4")!.action).toBe("replace_easier");
    expect(on(yes.plan, "2026-10-28", "threshold")).toEqual([]);
  });

  it("F-4: never mixes baselines from different devices, and needs 28 days", () => {
    const plan = halfPlan();
    const today = "2026-10-26";
    const mixed = [
      ...recoverySeries(addDays(today, -40), 34, () => ({ hrv: 60, rhr: 50 }), "garmin"),
      ...recoverySeries(addDays(today, -6), 7, () => ({ hrv: 30, rhr: 65 }), "oura"),
    ];
    expect(find(run(plan, today, history(plan, today), { recovery: mixed }), "F-4")).toBeUndefined();
    const short = recoverySeries(addDays(today, -20), 21, (i) => (i >= 14 ? { hrv: 30, rhr: 65 } : { hrv: 60, rhr: 50 }));
    const r = run(plan, today, history(plan, today), { recovery: short });
    expect(find(r, "F-4")).toBeUndefined();
    expect(r.review.waitingOn.map((w) => w.ruleId)).toContain("F-4");
  });

  it("F-5: fatigue or soreness 4/5 on 3 logs in a row adds a rest day, replacing the easiest session", () => {
    const plan = halfPlan();
    const today = "2026-10-27";
    const hist = history(plan, today);
    hist.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).forEach((c) => (c.fatigue = 4));
    const r = run(plan, today, hist);
    expect(find(r, "F-5")).toBeTruthy();
    expect(on(r.plan, "2026-10-29")[0]).toMatchObject({ type: "rest", adaptedBy: "F-5" });
    expect(on(r.plan, "2026-10-28", "threshold")).toHaveLength(1);
  });

  it("F-6: load spike needs a valid 4-week window and fires on a real spike", () => {
    const plan = halfPlan();
    const today = "2026-11-10";
    const mk = (date: string, min: number, rpe: number): CompletedWorkout => ({ id: date, date, sport: "run", status: "completed", source: "manual", durationSeconds: min * 60, rpe });
    const steady = Array.from({ length: 28 }, (_, i) => mk(addDays(today, -i), 40, 3));
    expect(find(run(plan, today, steady), "F-6")).toBeUndefined();
    const spiked = steady.map((w, i) => (i < 7 ? { ...w, durationSeconds: 110 * 60, rpe: 6 } : w));
    expect(find(run(plan, today, spiked), "F-6")?.why).toMatch(/4-week average/);
  });

  it("no heart-rate device: recovery rules wait for data, RPE rules still work", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[1]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map([[k[0]!.id, { rpeDelta: 2 }], [k[1]!.id, { rpeDelta: 2 }]])));
    expect(r.review.waitingOn.map((w) => w.ruleId)).toEqual(expect.arrayContaining(["F-3", "F-4"]));
    expect(find(r, "F-1")).toBeTruthy();
  });
});

describe("A — adherence", () => {
  it("A-1: one missed key session moves to a free day that isn't next to a hard day", () => {
    const plan = halfPlan();
    const today = "2026-10-22";
    const missed = on(plan, "2026-10-21", "threshold")[0]!;
    const r = run(plan, today, history(plan, today, new Map(), [missed.id]));
    expect(find(r, "A-1")!.action).toBe("reschedule");
    expect(allWorkouts(r.plan).find((w) => w.id === missed.id)!.date).toBe("2026-10-23");
  });

  it("A-2: two missed sessions asks before pulling back; 'yes' trims next week but keeps key sessions", () => {
    const plan = halfPlan();
    const today = "2026-10-22";
    const skip = [on(plan, "2026-10-20")[0]!.id, on(plan, "2026-10-21", "threshold")[0]!.id];
    const asked = run(plan, today, history(plan, today, new Map(), skip));
    expect(find(asked, "A-2")!.questionId).toBe("A-2");
    expect(find(asked, "A-1")).toBeUndefined();

    const yes = run(plan, today, history(plan, today, new Map(), skip), { answers: [{ questionId: "A-2", date: today, value: "yes" }] });
    const d = find(yes, "A-2")!;
    expect(d.action).toBe("reduce_volume");
    expect(d.changes.length).toBeGreaterThan(0);
    expect(d.changes.every((c) => !isKeyRun(c.before!))).toBe(true);
  });

  it("A-3: a few quiet days sends a check-in; 7+ days asks how to resume, then a 70% re-entry week", () => {
    const plan = halfPlan();
    expect(find(run(plan, "2026-10-23", []), "A-3")!.questionId).toBe("A-3.checkin");
    const asked = run(plan, "2026-10-29", []);
    expect(find(asked, "A-3")!.questionId).toBe("A-3");
    const resumed = run(plan, "2026-10-29", [], { answers: [{ questionId: "A-3", date: "2026-10-29", value: "resume" }] });
    const d = find(resumed, "A-3")!;
    expect(d.action).toBe("reduce_volume");
    for (const c of d.changes) expect(c.after!.plannedLoad).toBeCloseTo(c.before!.plannedLoad * 0.7, -1);
  });

  it("A-4: 14+ days off asks to reassess the block", () => {
    expect(find(run(halfPlan(), "2026-11-03", []), "A-4")!.action).toBe("reassess_block");
  });

  it("A-5: an unplanned hard session moves the next day's hard session", () => {
    const plan = halfPlan();
    const today = "2026-10-20";
    const extra: CompletedWorkout = { id: "x", date: today, sport: "hyrox", status: "completed", source: "manual", durationSeconds: 3600, rpe: 8 };
    const r = run(plan, today, [...history(plan, today), extra]);
    expect(find(r, "A-5")!.action).toBe("reschedule");
    expect(on(r.plan, "2026-10-21", "threshold")).toEqual([]);
    expect(on(r.plan, "2026-10-23", "threshold")).toHaveLength(1);
  });

  it("Q-1: asks for effort instead of guessing when a key session has no data", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[1]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map([[k[1]!.id, { rpeDelta: null, withSplits: false }]])));
    expect(r.changed).toBe(false);
    expect(find(r, "Q-1")!.question).toMatch(/0 \(rest\) to 10/);
  });
});

describe("P — progression", () => {
  it("P-1: two on-target sessions progress the next one, within the weekly volume cap", () => {
    const plan = halfPlan();
    const today = "2026-10-29";
    const r = run(plan, today, history(plan, today));
    const d = find(r, "P-1")!;
    expect(d.action).toBe("progress");
    const before = on(plan, "2026-11-04", "threshold")[0]!;
    const after = on(r.plan, "2026-11-04", "threshold")[0]!;
    expect(after.adaptedBy).toMatch(/^P-1:/);
    // Week 3 is already at +10% over week 2, so the extra rep would break the cap: paces get faster instead.
    expect(after.adaptedBy).toBe("P-1:pace");
    const w = (x: PlannedWorkout) => x.steps.find((s) => s.kind === "work")!.target.pace!.fastSecPerKm;
    expect(w(after) / w(before)).toBeCloseTo(0.98, 2);
  });

  it("P-1: needs two sessions at the new level before progressing again", () => {
    const plan = halfPlan();
    const v2 = run(plan, "2026-10-29", history(plan, "2026-10-29")).plan;
    const r = run(v2, "2026-11-05", history(v2, "2026-11-05"));
    expect(find(r, "P-1")).toBeUndefined();
  });

  it("P-1: never progresses into a recovery week", () => {
    const plan = halfPlan();
    const k = keys(plan);
    // Sessions through 11-04 on target; the next threshold (11-11) is in a recovery week.
    const hist = history(plan, "2026-11-05", new Map([[k[0]!.id, { rpeDelta: 2 }]]));
    expect(find(run(plan, "2026-11-05", hist), "P-1")).toBeUndefined();
  });

  it("P-3: one missed session holds that session type; two in a row eases the next one", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const once = run(plan, today, history(plan, today, new Map([[k[2]!.id, { paceFactor: 1.07 }]])));
    expect(find(once, "P-3")!.holdsProgression).toEqual(["threshold"]);
    expect(once.changed).toBe(false);

    const twice = run(plan, today, history(plan, today, new Map([[k[1]!.id, { paceFactor: 1.07 }], [k[2]!.id, { paceFactor: 1.07 }]])));
    expect(find(twice, "P-3")!.action).toBe("reduce_intensity");
    const next = allWorkouts(twice.plan).find((w) => w.id === k[3]!.id)!;
    expect(next.adaptedBy).toBe("P-3");
  });
});

describe("T — targets", () => {
  it("T-1: a faster race recalculates paces, at most 3% faster a week", () => {
    const plan = halfPlan();
    const today = "2026-11-02";
    const races: RaceResult[] = [{ id: "new-10k", date: "2026-11-01", distanceMeters: 10_000, finishSeconds: 40 * 60, timing: "official" }];
    const r = run(plan, today, history(plan, today), { races });
    const d = find(r, "T-1")!;
    expect(d.evidence[0]!.refs).toEqual(["new-10k"]);
    expect(d.why).toMatch(/at most 3% a week/);
    const ratio = r.plan.basis.paces!.threshold.fastSecPerKm / plan.basis.paces!.threshold.fastSecPerKm;
    expect(ratio).toBeGreaterThanOrEqual(0.97 - 1e-9);
    expect(ratio).toBeLessThan(0.99);
  });

  it("T-2: a slower race waits for a second data point", () => {
    const plan = halfPlan();
    const today = "2026-11-02";
    const slow = (id: string, date: string): RaceResult => ({ id, date, distanceMeters: 10_000, finishSeconds: 52 * 60, timing: "official" });
    const one = run(plan, today, history(plan, today), { races: [slow("a", "2026-11-01")] });
    expect(find(one, "T-2")).toBeUndefined();
    expect(one.review.waitingOn.map((w) => w.ruleId)).toContain("T-2");
    const two = run(plan, today, history(plan, today), { races: [slow("a", "2026-11-01"), slow("b", "2026-10-25")] });
    expect(find(two, "T-2")).toBeTruthy();
    expect(two.plan.basis.vdot!.value).toBeLessThan(plan.basis.vdot!.value);
  });

  it("P-2: reps well faster than target on 3 sessions recalculates paces instead of adding reps", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[2]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map(k.slice(0, 3).map((w) => [w.id, { paceFactor: 0.95 }]))));
    expect(find(r, "P-2")!.targetUpdate).toBeTruthy();
    expect(find(r, "P-1")).toBeUndefined();
  });
});

describe("guardrails", () => {
  it("suppresses reductions beyond the weekly load cap", () => {
    const plan = halfPlan();
    const k = keys(plan);
    const today = addDays(k[3]!.date, 1);
    const r = run(plan, today, history(plan, today, new Map(k.slice(0, 4).map((w) => [w.id, { rpeDelta: 2 }]))), {}, { maxWeeklyLoadReduction: 0.01 });
    expect(r.suppressed.find((s) => s.decision.ruleId === "F-2")!.reason).toMatch(/more than 1%/);
  });

  it("only safety may change today's sessions; nothing but progression may add volume", () => {
    const plan = halfPlan();
    const today = "2026-10-21";
    const thr = on(plan, today, "threshold")[0]!;
    const longer = { ...thr, plannedDistanceMeters: thr.plannedDistanceMeters! + 5000 };
    const rule = (id: string, after: PlannedWorkout, action: "reduce_volume" | "add_recovery"): Rule => ({
      id, version: 1, group: id.startsWith("S") ? "S" : "F", priority: 1,
      evaluate: () => ({ ruleId: id, ruleVersion: 1, action, priority: 1, confidence: 1, whatChanged: "x", why: "x", nextSteps: "x", evidence: [], changes: [{ workoutId: thr.id, before: thr, after, summary: "x" }] }),
    });
    const fatigueToday = run(plan, today, [], {}, {}, [rule("F-9", { ...thr, plannedLoad: 1 }, "reduce_volume")]);
    expect(fatigueToday.changed).toBe(false);
    const safetyToday = run(plan, today, [], {}, {}, [rule("S-9", { ...thr, plannedLoad: 1 }, "add_recovery")]);
    expect(safetyToday.changed).toBe(true);
    const tomorrow = on(plan, "2026-10-22")[0]!;
    const adds = run(plan, today, [], {}, {}, [rule("F-8", { ...longer, id: tomorrow.id, date: tomorrow.date }, "reduce_volume")]);
    expect(adds.suppressed[0]!.reason).toMatch(/may not add volume/);
  });

  it("the previous plan version is never modified", () => {
    const plan = halfPlan();
    const snapshot = JSON.parse(JSON.stringify(plan)) as TrainingPlan;
    const r = run(plan, "2026-10-29", history(plan, "2026-10-29"));
    expect(r.plan.version).toBe(plan.version + 1);
    expect(plan).toEqual(snapshot);
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
