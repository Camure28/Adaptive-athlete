import { describe, expect, it } from "vitest";
import { generateHyroxPlan, type HyroxAthlete } from "../src/hyrox/generator.js";
import { presetFor, type Equipment } from "../src/hyrox/equipment.js";
import { sessionEquipment, stepGear } from "../src/hyrox/session-equipment.js";
import type { PlannedWorkout } from "../src/types.js";

const TODAY = "2026-10-15";
const NOW = "2026-10-15T12:00:00-06:00";
const athlete = (equipment: Equipment[]): HyroxAthlete => ({
  id: "a", level: "intermediate", availableDays: [0, 1, 2, 3, 4, 5], maxWeekdayMinutes: 90, maxWeekendMinutes: 150,
  currentWeeklyRunMeters: { value: 25_000, provenance: { source: "manual", kind: "user_reported", confidence: 0.7, observedAt: TODAY } },
  equipment, runResults: [], exclusions: [],
});
const sessions = (equipment: Equipment[]): PlannedWorkout[] =>
  generateHyroxPlan(athlete(equipment), { id: "g", kind: "hyrox", date: "2027-02-27", division: "open", sex: "women", priority: "A" }, { planId: "p", today: TODAY, now: NOW })
    .weeks.flatMap((w) => w.workouts);

describe("session equipment", () => {
  it("a HYROX club session lists the real stations and running, never the turf lane", () => {
    const have = presetFor(["hyrox_club"]);
    const all = sessions([...have]);
    const comp = all.find((w) => w.type === "compromised_run")!;
    const gear = sessionEquipment(comp, have);
    expect(gear).toContain("outdoor_run");
    expect(gear.length).toBeGreaterThan(1);
    expect(all.flatMap((w) => sessionEquipment(w, have))).not.toContain("turf_lane");
  });

  it("only lists equipment the athlete has when a movement could use several things", () => {
    const have = new Set<Equipment>(["outdoor_run", "kettlebells", "open_floor"]);
    const all = sessions([...have]);
    for (const w of all) for (const g of sessionEquipment(w, have)) {
      if (g !== "bodyweight") expect(have.has(g as Equipment) || g === "outdoor_run").toBe(true);
    }
  });

  it("treadmill-only athletes run on the treadmill", () => {
    const have = new Set<Equipment>(["treadmill", "dumbbells"]);
    const run = sessions([...have]).find((w) => w.type === "easy_run")!;
    expect(sessionEquipment(run, have)).toEqual(["treadmill"]);
  });

  it("rest steps need nothing, bodyweight moves say so", () => {
    expect(stepGear({ kind: "recovery", durationSeconds: 60, target: { zone: "recovery", rpe: { min: 1, max: 2 } } }, new Set())).toEqual([]);
    expect(stepGear({ kind: "steady", target: { zone: "easy", rpe: { min: 3, max: 4 } }, exercise: { name: "Push-ups", prescription: "3 × 10" } }, new Set())).toEqual(["bodyweight"]);
  });
});
