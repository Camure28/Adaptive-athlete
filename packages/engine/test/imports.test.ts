import { describe, expect, it } from "vitest";
import {
  athleteFollowUp,
  decideImport,
  fromHealthKitWorkout,
  HK_ACTIVITY_TYPES,
  localDate,
  matchToPlan,
  mergeIntoManual,
  toCompletedWorkout,
  validateActivity,
  type HealthKitWorkoutInput,
  type ImportedActivity,
  type StoredActivity,
} from "../src/index.js";
import type { CompletedWorkout, PlannedWorkout, SessionType, Sport } from "../src/types.js";

const TZ = "America/Denver";

const hk = (over: Partial<HealthKitWorkoutInput> = {}): HealthKitWorkoutInput => ({
  uuid: "hk-1",
  workoutActivityType: 37,
  startDate: "2026-10-20T13:00:00Z", // 7:00 am in Denver
  endDate: "2026-10-20T13:45:00Z",
  totalDistanceMeters: 8012.4,
  avgHeartRate: 148.6,
  maxHeartRate: 171,
  sourceName: "Garmin Connect",
  sourceBundleId: "com.garmin.connect.mobile",
  ...over,
});

const act = (over: Partial<ImportedActivity> = {}): ImportedActivity => ({ ...fromHealthKitWorkout(hk()), ...over });

const session = (id: string, type: SessionType, sport: Sport, minutes: number, date = "2026-10-20"): PlannedWorkout => ({
  id, date, sport, type, title: id, objective: "", rationale: "", steps: [], estimatedMinutes: minutes, plannedLoad: 0,
  scaling: { easier: "" }, substitutions: [],
});

describe("Apple Health adapter", () => {
  it("maps a Garmin run written to Apple Health", () => {
    const a = fromHealthKitWorkout(hk());
    expect(a).toMatchObject({
      source: "apple_health", externalId: "hk-1", originApp: "Garmin Connect", sport: "run", providerType: "running",
      startedAt: "2026-10-20T13:00:00.000Z", durationSeconds: 2700,
    });
  });

  it("pins the HealthKit activity type values we depend on", () => {
    expect(HK_ACTIVITY_TYPES).toMatchObject({
      running: 37, traditionalStrengthTraining: 50, functionalStrengthTraining: 20, highIntensityIntervalTraining: 63,
      crossTraining: 11, rowing: 35, cycling: 13, other: 3000,
    });
  });

  it("treats HIIT and cross training as mixed sessions, not runs", () => {
    expect(fromHealthKitWorkout(hk({ workoutActivityType: 63 })).sport).toBe("other");
    expect(fromHealthKitWorkout(hk({ workoutActivityType: "crossTraining" })).sport).toBe("other");
    expect(fromHealthKitWorkout(hk({ workoutActivityType: 50 })).sport).toBe("strength");
    expect(fromHealthKitWorkout(hk({ workoutActivityType: 9999 })).providerType).toBe("type_9999");
  });

  it("uses the athlete's local date, not UTC", () => {
    expect(localDate("2026-10-21T03:30:00Z", TZ)).toBe("2026-10-20"); // 9:30 pm Denver
    expect(localDate("2026-10-21T03:30:00Z", "Europe/London")).toBe("2026-10-21");
  });
});

describe("validation", () => {
  it("rounds values and keeps a good workout", () => {
    const { activity, warnings } = validateActivity(act());
    expect(warnings).toEqual([]);
    expect(activity).toMatchObject({ distanceMeters: 8012, avgHeartRate: 149 });
  });

  it("drops a bad heart-rate reading but keeps the workout", () => {
    const { activity, warnings } = validateActivity(act({ avgHeartRate: 300 }));
    expect(activity?.avgHeartRate).toBeUndefined();
    expect(activity?.distanceMeters).toBe(8012);
    expect(warnings[0]).toMatch(/average heart rate dropped/);
  });

  it("rejects accidental 30-second recordings and broken times", () => {
    expect(validateActivity(act({ durationSeconds: 30 })).activity).toBeNull();
    expect(validateActivity(act({ endedAt: "2026-10-20T12:00:00Z" })).activity).toBeNull();
  });
});

describe("duplicates and re-deliveries", () => {
  const stored = (over: Partial<StoredActivity> = {}): StoredActivity => ({
    id: "c-1", source: "apple_health", externalId: "hk-1", sport: "run", date: "2026-10-20",
    startedAt: "2026-10-20T13:00:00.000Z", endedAt: "2026-10-20T13:45:00.000Z", durationSeconds: 2700, distanceMeters: 8012, avgHeartRate: 149, maxHeartRate: 171,
    ...over,
  });
  const clean = validateActivity(act()).activity!;

  it("is idempotent: the same workout delivered twice is not saved twice", () => {
    expect(decideImport(clean, [stored()], TZ)).toEqual({ action: "unchanged", id: "c-1" });
  });

  it("updates when the provider edited the workout", () => {
    expect(decideImport({ ...clean, distanceMeters: 8100 }, [stored()], TZ)).toEqual({ action: "update", id: "c-1" });
  });

  it("skips the second copy of one run (watch and Garmin both wrote it)", () => {
    const watchCopy = { ...clean, externalId: "hk-2", originApp: "Workout", startedAt: "2026-10-20T13:00:20.000Z" };
    const d = decideImport(watchCopy, [stored()], TZ);
    expect(d.action).toBe("skip_duplicate");
  });

  it("replaces a thinner copy with one that has heart rate", () => {
    const thin = stored({ externalId: "hk-0" });
    delete thin.avgHeartRate;
    delete thin.maxHeartRate;
    expect(decideImport(clean, [thin], TZ).action).toBe("replace");
  });

  it("keeps a separate session the same day (morning run, evening run)", () => {
    const evening = { ...clean, externalId: "hk-3", startedAt: "2026-10-21T00:00:00.000Z", endedAt: "2026-10-21T00:30:00.000Z", durationSeconds: 1800 };
    expect(decideImport(evening, [stored()], TZ)).toEqual({ action: "insert" });
  });

  it("does not merge a run into an overlapping strength session", () => {
    const lift = stored({ id: "c-9", externalId: "hk-9", sport: "strength" });
    expect(decideImport({ ...clean, externalId: "hk-4" }, [lift], TZ)).toEqual({ action: "insert" });
  });
});

describe("hand-logged sessions", () => {
  const manualRun: StoredActivity = { id: "m-1", source: "manual", sport: "run", date: "2026-10-20", durationSeconds: 2640 };
  const clean = validateActivity(act()).activity!;

  it("attaches device data to the athlete's own log instead of creating a second one", () => {
    expect(decideImport(clean, [manualRun], TZ)).toMatchObject({ action: "merge_into_manual", id: "m-1" });
  });

  it("keeps the athlete's numbers, fills blanks, and flags real disagreements", () => {
    const log: CompletedWorkout = { id: "m-1", date: "2026-10-20", sport: "run", status: "completed", source: "manual", durationSeconds: 2100, rpe: 6 };
    const { merged, conflicts } = mergeIntoManual(log, clean);
    expect(merged.durationSeconds).toBe(2100);
    expect(merged.distanceMeters).toBe(8012);
    expect(merged.avgHeartRate).toBe(149);
    expect(merged.rpe).toBe(6);
    expect(conflicts).toEqual([{ field: "durationSeconds", athlete: 2100, device: 2700 }]);
  });
});

describe("matching to the plan", () => {
  const clean = validateActivity(act()).activity!;

  it("matches a run to the planned run that day", () => {
    const plan = [session("easy", "easy_run", "run", 45), session("lift", "strength", "strength", 50)];
    expect(matchToPlan(clean, plan, TZ)).toMatchObject({ status: "matched", plannedWorkoutId: "easy" });
  });

  it("matches a HIIT recording to a HYROX compromised run", () => {
    const hyrox = validateActivity(act({ externalId: "hk-5", sport: "other", providerType: "highIntensityIntervalTraining", durationSeconds: 3500 })).activity!;
    const plan = [session("comp", "compromised_run", "hyrox", 60), session("lift", "strength", "strength", 50)];
    expect(matchToPlan(hyrox, plan, TZ)).toMatchObject({ status: "matched", plannedWorkoutId: "comp" });
  });

  it("asks when two planned sessions fit equally", () => {
    const plan = [session("am", "easy_run", "run", 45), session("pm", "recovery_run", "run", 45)];
    expect(matchToPlan(clean, plan, TZ)).toEqual({ status: "ambiguous", candidates: ["am", "pm"] });
  });

  it("skips a session that already has a log", () => {
    const plan = [session("am", "easy_run", "run", 45), session("pm", "recovery_run", "run", 45)];
    expect(matchToPlan(clean, plan, TZ, new Set(["am"]))).toMatchObject({ status: "matched", plannedWorkoutId: "pm" });
  });

  it("logs extra training as unplanned on a rest day", () => {
    expect(matchToPlan(clean, [session("rest", "rest", "other", 0)], TZ)).toEqual({ status: "unplanned" });
    expect(matchToPlan(clean, [session("tomorrow", "easy_run", "run", 45, "2026-10-21")], TZ)).toEqual({ status: "unplanned" });
  });
});

describe("after import", () => {
  const clean = validateActivity(act()).activity!;
  const planned = session("easy", "easy_run", "run", 45);

  it("builds the log entry linked to the planned session", () => {
    const c = toCompletedWorkout(clean, "c-new", TZ, { status: "matched", plannedWorkoutId: "easy", confidence: 1 });
    expect(c).toMatchObject({ date: "2026-10-20", plannedWorkoutId: "easy", source: "apple_health", status: "completed", distanceMeters: 8012 });
    expect(c.rpe).toBeUndefined();
  });

  it("asks for effort and pain, which a watch can't measure", () => {
    const c = toCompletedWorkout(clean, "c-new", TZ, { status: "matched", plannedWorkoutId: "easy", confidence: 1 });
    expect(athleteFollowUp(c, planned)).toEqual(["rpe", "pain"]);
  });

  it("asks whether a short recording was the whole session", () => {
    const short = toCompletedWorkout({ ...clean, durationSeconds: 900 }, "c-new", TZ, { status: "matched", plannedWorkoutId: "easy", confidence: 0.5 });
    expect(athleteFollowUp({ ...short, rpe: 4, pain: { level: 0 } }, planned)).toEqual(["completion"]);
  });

  it("asks which session when the match was ambiguous", () => {
    const c = toCompletedWorkout(clean, "c-new", TZ, { status: "ambiguous", candidates: ["am", "pm"] });
    expect(c.plannedWorkoutId).toBeUndefined();
    expect(athleteFollowUp(c, undefined, { status: "ambiguous", candidates: ["am", "pm"] })[0]).toBe("which_session");
  });
});
