/** Workout logs (D-025): manual logs validate, store and read back in the shape imports use. */
import { describe, expect, it } from "vitest";
import type { ImportedActivity } from "../src/imports/activity.js";
import { decideImport, mergeIntoManual } from "../src/imports/dedupe.js";
import { athleteFollowUp } from "../src/imports/match.js";
import { PAIN_AREA_MAP, painArea } from "../src/adapt/pain-map.js";
import { fromLogRow, fromManualLog, LOG_BODY_AREAS, PAIN_GROUP, splitPlannedId, toLogRow, validateManualLog, type ManualLog } from "../src/store/logs.js";

const PLAN = "6f1c2b9e-1111-4222-8333-944455556666";
const done: ManualLog = {
  plannedWorkoutId: `${PLAN}:2026-10-20:threshold`,
  date: "2026-10-20",
  sport: "run",
  status: "completed",
  durationSeconds: 3000,
  distanceMeters: 9000,
  rpe: 7,
  pain: null,
  fatigue: 3,
  soreness: 2,
  notes: "  Felt good  ",
};

/** The log without some answers (optional fields are left out, never set to undefined). */
const without = (log: ManualLog, ...keys: (keyof ManualLog)[]): ManualLog => {
  const copy = { ...log };
  for (const k of keys) delete copy[k];
  return copy;
};

describe("validateManualLog", () => {
  it("accepts a complete log", () => {
    expect(validateManualLog(done)).toEqual({});
  });

  it("needs effort and the pain answer for a session that was done", () => {
    const e = validateManualLog(without(done, "rpe", "pain"));
    expect(Object.keys(e).sort()).toEqual(["pain", "rpe"]);
    expect(validateManualLog({ ...without(done, "rpe"), status: "partial" }).rpe).toBeDefined();
  });

  it("needs nothing but the status for a skipped session", () => {
    expect(validateManualLog({ date: "2026-10-20", sport: "run", status: "skipped" })).toEqual({});
  });

  it("needs a level of 1–10 and a body area when something hurt", () => {
    expect(validateManualLog({ ...done, pain: { level: 0, location: "knee", alteredMovement: false, sharp: false, stoppedSession: false } }).pain).toBeDefined();
    expect(validateManualLog({ ...done, pain: { level: 11, location: "knee", alteredMovement: false, sharp: false, stoppedSession: false } }).pain).toBeDefined();
    expect(validateManualLog({ ...done, pain: { level: 4, location: "left knee" as never, alteredMovement: false, sharp: false, stoppedSession: false } }).painLocation).toBeDefined();
    expect(validateManualLog({ ...done, pain: { level: 4, location: "knee", alteredMovement: true, sharp: false, stoppedSession: false } })).toEqual({});
  });

  it("keeps fatigue and soreness on 1–5 and RPE on 0–10", () => {
    expect(validateManualLog({ ...done, fatigue: 0 }).fatigue).toBeDefined();
    expect(validateManualLog({ ...done, soreness: 6 }).soreness).toBeDefined();
    expect(validateManualLog({ ...done, rpe: 10.5 }).rpe).toBeDefined();
    expect(validateManualLog({ ...done, rpe: 0 })).toEqual({});
  });

  it("rejects impossible duration and distance", () => {
    expect(validateManualLog({ ...done, durationSeconds: 0 }).duration).toBeDefined();
    expect(validateManualLog({ ...done, durationSeconds: 90_000 }).duration).toBeDefined();
    expect(validateManualLog({ ...done, distanceMeters: 600_000 }).distance).toBeDefined();
  });
});

describe("fromManualLog", () => {
  it("records 'no pain' as pain level 0, so it counts as answered", () => {
    const c = fromManualLog(done, "log-1");
    expect(c.pain).toEqual({ level: 0 });
    expect(c.notes).toBe("Felt good");
    expect(c.source).toBe("manual");
    expect(athleteFollowUp(c)).toEqual([]);
  });

  it("keeps only status, date and note for a skipped session", () => {
    const c = fromManualLog({ ...done, status: "skipped", notes: "Work trip" }, "log-2");
    expect(c).toEqual({ id: "log-2", plannedWorkoutId: done.plannedWorkoutId, date: "2026-10-20", sport: "run", status: "skipped", source: "manual", notes: "Work trip" });
  });
});

describe("pain areas", () => {
  it("map each logged area to the approved pain-map group, keeping the athlete's choice", () => {
    const c = fromManualLog({ ...done, pain: { level: 5, location: "calf_shin", alteredMovement: false, sharp: true, stoppedSession: true } }, "log-5");
    expect(c.pain).toEqual({ level: 5, location: "calf_shin", area: "foot_ankle_lower_leg", alteredMovement: false, sharp: true, stoppedSession: true });
    expect(painArea(c.pain!)).toBe("foot_ankle_lower_leg");
    for (const a of LOG_BODY_AREAS) expect(Object.keys(PAIN_AREA_MAP)).toContain(PAIN_GROUP[a]);
    expect(PAIN_GROUP.thigh_hamstring).toBe("other");
  });
});

describe("log rows", () => {
  it("store and read back unchanged", () => {
    const c = fromManualLog({ ...done, pain: { level: 5, location: "knee", alteredMovement: true, sharp: false, stoppedSession: false } }, "log-3");
    const row = toLogRow(c, "ath-1");
    expect(row.plan_id).toBe(PLAN);
    expect(row.workout_key).toBe("2026-10-20:threshold");
    expect(row.started_at).toBeNull();
    // Postgres returns numeric columns (rpe) as strings.
    expect(fromLogRow({ ...row, id: "log-3", rpe: "7.0" as never })).toEqual(c);
  });

  it("keep the device fields of an import", () => {
    const a: ImportedActivity = {
      source: "apple_health", externalId: "HK-1", originApp: "Garmin Connect", device: "Forerunner 965", sport: "run",
      providerType: "running", startedAt: "2026-10-20T13:00:00Z", endedAt: "2026-10-20T13:50:00Z", durationSeconds: 3000,
      distanceMeters: 9050, elevationGainMeters: 41.6, activeEnergyKcal: 612.4,
    };
    const row = toLogRow({ id: "x", date: "2026-10-20", sport: "run", status: "completed", source: "apple_health", durationSeconds: 3000 }, "ath-1", a);
    expect(row).toMatchObject({ external_id: "HK-1", origin_app: "Garmin Connect", device: "Forerunner 965", started_at: a.startedAt, ended_at: a.endedAt, elevation_gain_meters: 42, active_energy_kcal: 612, plan_id: null });
  });

  it("split a planned session id into plan and key", () => {
    expect(splitPlannedId(`${PLAN}:2026-10-20:easy_run:1`)).toEqual({ planId: PLAN, workoutKey: "2026-10-20:easy_run:1" });
    expect(() => splitPlannedId("no-key")).toThrow();
  });
});

describe("manual logs and the import pipeline", () => {
  it("a watch recording of a hand-logged session merges into the athlete's log", () => {
    const manual = fromManualLog(done, "log-4");
    const a: ImportedActivity = {
      source: "apple_health", externalId: "HK-2", sport: "run", providerType: "running",
      startedAt: "2026-10-20T13:00:00Z", endedAt: "2026-10-20T13:51:00Z", durationSeconds: 3060, distanceMeters: 9100, avgHeartRate: 162,
    };
    const decision = decideImport(a, [{ id: manual.id, source: "manual", sport: manual.sport, date: manual.date, durationSeconds: 3000, distanceMeters: 9000 }], "America/Denver");
    expect(decision).toMatchObject({ action: "merge_into_manual", id: "log-4" });
    const merged = mergeIntoManual(manual, a).merged;
    expect(merged.rpe).toBe(7);
    expect(merged.avgHeartRate).toBe(162);
  });
});
