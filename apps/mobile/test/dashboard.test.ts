import { describe, expect, it } from "vitest";
import { generateHyroxPlan, presetFor } from "@adaptive-athlete/engine";
import { dashboardStats } from "../src/lib/dashboard";

const t = (v: number) => ({ value: v, provenance: { source: "manual" as const, kind: "user_reported" as const, confidence: 0.6, observedAt: "2026-10-16" } });
const athlete = (withBenchmark: boolean) => ({
  id: "a", level: "intermediate" as const, currentWeeklyRunMeters: t(25000), availableDays: [0, 1, 2, 3, 4, 5] as (0 | 1 | 2 | 3 | 4 | 5)[],
  maxWeekdayMinutes: 90, maxWeekendMinutes: 150, equipment: [...presetFor(["crossfit"])], exclusions: [],
  runResults: withBenchmark ? [{ id: "5k", date: "2026-09-27", distanceMeters: 5000, finishSeconds: 1380, timing: "official" as const }] : [],
});
const goal = { id: "g", kind: "hyrox" as const, date: "2027-02-27", division: "open" as const, sex: "men" as const, priority: "A" as const };
const plan = (b: boolean) => generateHyroxPlan(athlete(b), goal, { planId: "p", today: "2026-10-16", now: "2026-10-16T12:00:00Z" });

describe("dashboard banner figures", () => {
  it("counts down to the race and shows week 1 before the plan starts", () => {
    const d = dashboardStats(plan(true), "2026-10-16");
    expect(d.daysToRace).toBe(134);
    expect(d.started).toBe(false);
    expect(d.weekNumber).toBe(1);
    expect(d.next?.date).toBe("2026-10-19");
    expect(d.thisWeek.sessions).toBe(d.week.workouts.length);
  });
  it("tracks the current week once it starts, and the next full simulation", () => {
    const p = plan(true);
    const d = dashboardStats(p, "2026-11-04");
    expect(d.started).toBe(true);
    expect(d.week.startDate <= "2026-11-04").toBe(true);
    expect(d.fullSims.total).toBeGreaterThan(0);
    expect(d.fullSims.next! >= "2026-11-04").toBe(true);
  });
  it("only shows a pace when a benchmark supports it", () => {
    expect(dashboardStats(plan(true), "2026-10-16").threshold?.source).toBeTruthy();
    expect(dashboardStats(plan(false), "2026-10-16").threshold).toBeNull();
  });
});
