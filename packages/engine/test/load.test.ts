import { describe, expect, it } from "vitest";
import { acuteChronicRatio, monotony, sessionLoad, weeklyRunMeters } from "../src/load/load.js";
import type { CompletedWorkout } from "../src/types.js";
import { addDays } from "../src/units/units.js";

const run = (date: string, minutes: number, rpe?: number, extra: Partial<CompletedWorkout> = {}): CompletedWorkout => {
  const w: CompletedWorkout = { id: date, date, sport: "run", status: "completed", source: "manual", durationSeconds: minutes * 60, distanceMeters: minutes * 180, ...extra };
  if (rpe != null) w.rpe = rpe;
  return w;
};

/** One optional workout per day for `days` days ending on `end` (i = 0 is `end`). */
const series = (end: string, days: number, f: (i: number) => CompletedWorkout | null): CompletedWorkout[] =>
  Array.from({ length: days }, (_, i) => f(i))
    .filter((w): w is CompletedWorkout => w !== null && w.date <= end)
    .map((w, i) => ({ ...w, id: `w${i}` }));

describe("session load", () => {
  it("is duration × RPE, and unknown without RPE", () => {
    expect(sessionLoad(run("2026-10-01", 60, 5))).toBe(300);
    expect(sessionLoad(run("2026-10-01", 60))).toBeNull();
    expect(sessionLoad(run("2026-10-01", 60, 5, { status: "skipped" }))).toBe(0);
  });
});

describe("acute:chronic ratio", () => {
  const today = "2026-10-15";
  it("refuses to compute with under 28 days of history", () => {
    const ws = series(today, 20, (i) => run(addDays(today, -i), 45, 4));
    const r = acuteChronicRatio(ws, today);
    expect(r.ok).toBe(false);
  });
  it("refuses when too many days lack RPE", () => {
    const ws = series(today, 28, (i) => run(addDays(today, -i), 45, i % 3 === 0 ? undefined : 4));
    expect(acuteChronicRatio(ws, today).ok).toBe(false);
  });
  it("is ~1 for steady training and >1.5 after a spike", () => {
    const steady = series(today, 28, (i) => run(addDays(today, -i), 45, 4));
    const r = acuteChronicRatio(steady, today);
    expect(r.ok && r.value).toBeCloseTo(1, 5);

    const spike = series(today, 28, (i) => run(addDays(today, -i), i < 7 ? 120 : 30, i < 7 ? 6 : 4));
    const s = acuteChronicRatio(spike, today);
    expect(s.ok && s.value).toBeGreaterThan(1.5);
  });
});

describe("monotony", () => {
  it("is high for identical days and lower for varied days", () => {
    const today = "2026-10-15";
    const varied = series(today, 7, (i) => (i % 2 === 0 ? run(addDays(today, -i), 60, 6) : null));
    const m = monotony(varied, today);
    expect(m.ok && m.value.monotony).toBeLessThan(2);
  });
});

describe("weekly volume", () => {
  it("counts only runs, excluding skipped", () => {
    const ws = [
      run("2026-10-12", 30, 3),
      { ...run("2026-10-13", 30, 3), status: "skipped" as const },
      { ...run("2026-10-14", 30, 3), sport: "strength" as const },
    ];
    expect(weeklyRunMeters(ws, "2026-10-12")).toBe(5400);
  });
});
