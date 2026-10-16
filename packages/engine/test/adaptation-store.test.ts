/** Adaptation on the server (D-026): stored rows in, decisions and review out. */
import { describe, expect, it } from "vitest";
import { adaptPlan } from "../src/adapt/engine.js";
import { allWorkouts } from "../src/adapt/context.js";
import { adaptationInputFromRows, decisionRows, reviewForStorage, type AdaptationRows } from "../src/store/adaptation.js";
import { fromManualLog, toLogRow } from "../src/store/logs.js";
import { planFromRecord, planToRecord } from "../src/store/record.js";
import type { TrainingPlan } from "../src/types.js";
import { complete, halfPlan, NOW } from "./fixtures.js";

const PLAN_ID = "6f1c2b9e-1111-4222-8333-944455556666";
const TODAY = "2026-11-03";

/** The fixture plan as the server reads it back from the database. */
function stored(): TrainingPlan {
  const plan = { ...halfPlan(), id: PLAN_ID };
  plan.weeks = plan.weeks.map((w) => ({ ...w, workouts: w.workouts.map((x) => ({ ...x, id: x.id.replace(/^[^:]+/, PLAN_ID) })) }));
  const r = JSON.parse(JSON.stringify(planToRecord(plan))) as ReturnType<typeof planToRecord>;
  return planFromRecord({ planId: PLAN_ID, athleteId: plan.athleteId, version: 1, createdAt: NOW, goal: plan.goal, basis: r.basis, weeks: r.weeks, workouts: r.workouts });
}

/** Every session before today logged as planned, as rows; the 11-02 run logged with shin pain. */
function rows(plan: TrainingPlan): AdaptationRows {
  const logs = allWorkouts(plan)
    .filter((w) => w.date >= "2026-10-19" && w.date < TODAY && w.type !== "rest")
    .map((w, i) => {
      const c = complete(w, {});
      const log = { ...toLogRow(c, "ath-1"), id: `log-${i}` };
      return w.date === "2026-11-02" && w.sport === "run"
        ? { ...log, pain_level: 5, pain_location: "calf_shin", pain_sharp: false, pain_stopped_session: false, pain_altered_movement: false }
        : log;
    });
  return {
    logs: [...logs, { ...toLogRow(fromManualLog({ date: "2026-08-01", sport: "run", status: "completed", rpe: 4, pain: null }, "old"), "ath-1"), id: "old" }],
    answers: [{ question_id: "S-1.followup", value: "same", answered_on: "2026-11-02" }],
    recovery: [{ day: "2026-11-01", source: "apple_health", hrv_ms: "62.5", resting_hr: 48, sleep_hours: null }],
    runResults: [{ id: "r1", event_date: "2026-09-27", distance_meters: "5000.0", finish_seconds: 1260, timing: "official" }],
  };
}

describe("adaptationInputFromRows", () => {
  it("maps stored rows to the engine's input and drops data outside the window", () => {
    const plan = stored();
    const input = adaptationInputFromRows(plan, TODAY, rows(plan));
    expect(input.completed.some((c) => c.id === "old")).toBe(false);
    expect(input.completed.find((c) => c.pain && c.pain.level > 0)!.pain).toMatchObject({ level: 5, area: "foot_ankle_lower_leg" });
    expect(input.answers).toEqual([{ questionId: "S-1.followup", value: "same", date: "2026-11-02" }]);
    expect(input.recovery).toEqual([{ date: "2026-11-01", source: "apple_health", hrvMs: 62.5, restingHr: 48 }]);
    expect(input.races).toEqual([{ id: "r1", date: "2026-09-27", distanceMeters: 5000, finishSeconds: 1260, timing: "official" }]);
  });
});

describe("answers the engine reads", () => {
  it("a pain follow-up of 'better' counts as a pain check-in; 'same' doesn't", () => {
    const plan = stored();
    const r = rows(plan);
    r.answers = [
      { question_id: "S-2.followup", value: "better", answered_on: "2026-11-02" },
      { question_id: "S-1.followup", value: "same", answered_on: "2026-11-02" },
      { question_id: "S-1.followup", value: "improving", answered_on: "2026-11-03" },
    ];
    expect(adaptationInputFromRows(plan, TODAY, r).checkIns).toEqual([
      { date: "2026-11-02", painImproved: true },
      { date: "2026-11-03", painImproved: true },
    ]);
  });

  it("'better' lifts S-2's rest: severe pain rests, then eases once it improves", () => {
    const plan = stored();
    const r = rows(plan);
    r.logs = r.logs.map((l) => (l.pain_level === 5 ? { ...l, pain_level: 8 } : l));
    r.answers = [];
    expect(adaptPlan(adaptationInputFromRows(plan, TODAY, r), { now: NOW }).applied.map((d) => d.ruleId)).toContain("S-2");
    r.answers = [{ question_id: "S-2.followup", value: "better", answered_on: TODAY }];
    const after = adaptPlan(adaptationInputFromRows(plan, TODAY, r), { now: NOW }).applied.map((d) => d.ruleId);
    expect(after).not.toContain("S-2");
    expect(after).toContain("S-1");
  });

  it("an S-1.area answer fills in the area of the latest pain log it was asked about", () => {
    const plan = stored();
    const r = rows(plan);
    r.logs = r.logs.map((l) => (l.pain_level === 5 ? { ...l, pain_location: "thigh_hamstring" } : l));
    r.answers = [{ question_id: "S-1.area", value: "knee", answered_on: TODAY }];
    const pain = adaptationInputFromRows(plan, TODAY, r).completed.find((c) => c.pain && c.pain.level > 0)!.pain!;
    expect(pain).toMatchObject({ location: "thigh_hamstring", area: "knee" });
    r.answers = [{ question_id: "S-1.area", value: "elbow", answered_on: TODAY }];
    expect(adaptationInputFromRows(plan, TODAY, r).completed.find((c) => c.pain && c.pain.level > 0)!.pain!.area).toBe("other");
  });
});

describe("questions", () => {
  it("aren't asked again within 2 days of an answer, then come back while the rule is active", () => {
    const plan = stored();
    const r = rows(plan);
    r.answers = [{ question_id: "S-1.followup", value: "same_or_worse", answered_on: TODAY }];
    const input = adaptationInputFromRows(plan, TODAY, r);
    const result = adaptPlan(input, { now: NOW });
    expect(result.review.questions.map((q) => q.questionId)).toContain("S-1.followup");
    expect(reviewForStorage(result.review, input.answers, TODAY).questions.map((q) => q.questionId)).not.toContain("S-1.followup");
    expect(reviewForStorage(result.review, input.answers, "2026-11-06").questions.map((q) => q.questionId)).toContain("S-1.followup");
  });
});

describe("a server run end to end", () => {
  it("a logged pain report adapts the stored plan, and the new version stores cleanly", () => {
    const plan = stored();
    const result = adaptPlan(adaptationInputFromRows(plan, TODAY, rows(plan)), { now: NOW });
    expect(result.changed).toBe(true);
    expect(result.applied.map((d) => d.ruleId)).toContain("S-1");

    // Adapted sessions keep their ids, so they store under the same plan and keys.
    const record = planToRecord(result.plan);
    const before = new Set(planToRecord(plan).workouts.map((w) => w.workout_key));
    expect(record.workouts.every((w) => before.has(w.workout_key))).toBe(true);
    expect(record.workouts.some((w) => w.adapted_by_rule === "S-1")).toBe(true);

    const decisions = decisionRows(result);
    expect(decisions.filter((d) => d.outcome === "applied").map((d) => d.rule_id)).toContain("S-1");
    expect(decisions.every((d) => d.confidence >= 0 && d.confidence <= 1)).toBe(true);
    expect(decisions.filter((d) => d.outcome === "suppressed").every((d) => d.suppressed_reason)).toBe(true);

    const review = reviewForStorage(result.review);
    expect(review.changed[0]).toMatchObject({ ruleId: "S-1" });
    expect(review.changed[0]!.sessions.length).toBeGreaterThan(0);
    expect(review.questions.map((q) => q.questionId)).toContain("S-1.followup");
    expect(JSON.stringify(review)).not.toMatch(/"before"|"after"/);
  });

  it("a run that changes nothing stores no decisions, only its review", () => {
    const plan = stored();
    const quiet = rows(plan);
    quiet.logs = quiet.logs.map((l) => ({ ...l, pain_level: l.pain_level === null ? null : 0 }));
    quiet.runResults = []; // a new race result would recalculate paces (T-1)
    const result = adaptPlan(adaptationInputFromRows(plan, "2026-10-19", quiet), { now: NOW });
    expect(result.changed).toBe(false);
    expect(decisionRows(result)).toEqual([]);
    expect(reviewForStorage(result.review).kept.length).toBeGreaterThan(0);
  });
});
