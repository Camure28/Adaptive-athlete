import { describe, expect, it } from "vitest";
import { fromManualLog, type PlannedWorkout } from "@adaptive-athlete/engine";
import { formFor, formFromLog, logBadge, logSummary, logTitle, otherWorkoutForm, toManualLog, type LogForm } from "../src/logging/form";

const run: PlannedWorkout = {
  id: "plan-1:2026-10-20:threshold", date: "2026-10-20", sport: "run", type: "threshold", title: "Threshold intervals",
  objective: "", rationale: "", steps: [], estimatedMinutes: 50, plannedDistanceMeters: 9656, plannedLoad: 350,
  scaling: { easier: "" }, substitutions: [],
};
const strength: PlannedWorkout = { ...run, id: "plan-1:2026-10-21:strength", date: "2026-10-21", sport: "strength", type: "strength" };
delete strength.plannedDistanceMeters;

const filled = (over: Partial<LogForm> = {}): LogForm => ({ ...formFor(run, "mi"), status: "completed", rpe: 7, hurt: false, ...over });

describe("log form", () => {
  it("prefills time and distance from the plan, in the athlete's units", () => {
    expect(formFor(run, "mi")).toMatchObject({ status: null, minutes: "50", distance: "6", rpe: null, hurt: null });
    expect(formFor(run, "km").distance).toBe("9.66");
    expect(formFor(strength, "mi").distance).toBe("");
  });

  it("builds the log in the engine's shape", () => {
    const r = toManualLog(filled({ distance: "6.2", fatigue: 3, notes: " Windy " }), run, "mi");
    expect(r).toEqual({
      log: {
        plannedWorkoutId: run.id, date: "2026-10-20", sport: "run", status: "completed",
        durationSeconds: 3000, distanceMeters: 9978, rpe: 7, pain: null, fatigue: 3, notes: "Windy",
      },
    });
  });

  it("asks whether they did it, how hard it was and whether anything hurt", () => {
    expect(toManualLog(formFor(run, "mi"), run, "mi")).toEqual({ errors: { status: "Did you do this session?" } });
    const r = toManualLog({ ...formFor(run, "mi"), status: "completed" }, run, "mi");
    expect("errors" in r && Object.keys(r.errors).sort()).toEqual(["pain", "rpe"]);
  });

  it("needs level, area and the movement question when something hurt", () => {
    const r = toManualLog(filled({ hurt: true }), run, "mi");
    expect("errors" in r && Object.keys(r.errors).sort()).toEqual(["pain", "painAltered", "painLocation", "painSharp", "painStopped"]);
    const ok = toManualLog(filled({ hurt: true, painLevel: 5, painArea: "knee", painAltered: true, painSharp: false, painStopped: true }), run, "mi");
    expect("log" in ok && ok.log.pain).toEqual({ level: 5, location: "knee", alteredMovement: true, sharp: false, stoppedSession: true });
  });

  it("logs a skipped session with only the note", () => {
    const r = toManualLog({ ...formFor(run, "mi"), status: "skipped", notes: "Travel" }, run, "mi");
    expect(r).toEqual({ log: { plannedWorkoutId: run.id, date: "2026-10-20", sport: "run", status: "skipped", notes: "Travel" } });
  });

  it("rejects a blank or impossible time", () => {
    for (const minutes of ["", "abc", "0", "2000"]) {
      const r = toManualLog(filled({ minutes }), run, "mi");
      expect("errors" in r && r.errors.duration).toBeTruthy();
    }
  });

  it("doesn't ask for distance on non-running sessions", () => {
    const r = toManualLog({ ...formFor(strength, "mi"), status: "completed", rpe: 6, hurt: false, distance: "3" }, strength, "mi");
    expect("log" in r && r.log.distanceMeters).toBeUndefined();
  });

  it("reopens a saved log as it was entered", () => {
    const form = filled({ hurt: true, painLevel: 4, painArea: "calf_shin", painAltered: false, painSharp: false, painStopped: false, fatigue: 2, soreness: 4, notes: "Tight calf" });
    const r = toManualLog(form, run, "mi");
    if (!("log" in r)) throw new Error("expected a log");
    const saved = fromManualLog(r.log, "log-1");
    expect(formFor(run, "mi", saved)).toEqual({ ...form, distance: "6" });
    expect(logBadge(saved)).toBe("DONE · RPE 7 · PAIN 4");
    expect(logBadge(fromManualLog({ ...r.log, status: "skipped" }, "log-2"))).toBe("SKIPPED");
  });
});

describe("logging a workout that wasn't in the plan", () => {
  const TODAY = "2026-10-16";
  const other = (over: Partial<LogForm> = {}): LogForm => ({ ...otherWorkoutForm(TODAY), sport: "run", minutes: "40", rpe: 8, hurt: false, ...over });

  it("asks what kind and when, and is always logged as done", () => {
    const r = toManualLog(otherWorkoutForm(TODAY), null, "mi", TODAY);
    expect("errors" in r && Object.keys(r.errors).sort()).toEqual(["duration", "pain", "rpe", "sport"]);
  });

  it("builds an unplanned log the engine counts (no planned session id)", () => {
    const r = toManualLog(other({ date: "2026-10-15", distance: "5" }), null, "mi", TODAY);
    expect(r).toEqual({ log: { date: "2026-10-15", sport: "run", status: "completed", durationSeconds: 2400, distanceMeters: 8047, rpe: 8, pain: null } });
  });

  it("only accepts the last two weeks, never the future", () => {
    for (const date of ["2026-10-17", "2026-10-02"]) {
      const r = toManualLog(other({ date }), null, "mi", TODAY);
      expect("errors" in r && r.errors.date).toBeTruthy();
    }
    expect("log" in toManualLog(other({ date: "2026-10-03" }), null, "mi", TODAY)).toBe(true);
  });

  it("asks for distance on rides, rows and swims too, but not strength", () => {
    expect(toManualLog(other({ sport: "bike", distance: "12" }), null, "km", TODAY)).toMatchObject({ log: { distanceMeters: 12000 } });
    const r = toManualLog(other({ sport: "strength", distance: "3" }), null, "km", TODAY);
    expect("log" in r && r.log.distanceMeters).toBeUndefined();
  });
});

describe("recent workouts", () => {
  const TODAY = "2026-10-16";

  it("reopen an unplanned workout as it was entered, and save it unchanged", () => {
    const form: LogForm = { ...otherWorkoutForm(TODAY), date: "2026-10-14", sport: "bike", minutes: "60", distance: "20", rpe: 5, hurt: false, fatigue: 3, notes: "Commute" };
    const r = toManualLog(form, null, "km", TODAY);
    if (!("log" in r)) throw new Error("expected a log");
    const saved = fromManualLog(r.log, "log-9");
    expect(formFromLog(saved, "km")).toEqual(form);
    expect(toManualLog(formFromLog(saved, "km"), null, "km", TODAY)).toEqual(r);
  });

  it("are titled by their planned session, or by kind when not in the plan", () => {
    const c = fromManualLog({ date: TODAY, sport: "row", status: "completed", durationSeconds: 1800, distanceMeters: 6000, rpe: 6, pain: null }, "x");
    expect(logTitle(c)).toBe("Row");
    expect(logTitle(c, "Threshold intervals")).toBe("Threshold intervals");
    expect(logSummary(c, "km")).toBe("30 min · 6 km");
    expect(logSummary({ ...c, status: "skipped" }, "km")).toBe("");
  });
});

