import { describe, expect, it } from "vitest";
import { assessRace, currentVdot, implausibleRaceTime, predictRaceSeconds, trainingPaces, vdotFromPerformance } from "../src/performance/vdot.js";
import type { RaceResult } from "../src/types.js";

// Reference values from the published Daniels VDOT tables (Daniels' Running Formula, 3rd ed.).
const TABLE: { vdot: number; d: number; t: number }[] = [
  { vdot: 40, d: 5000, t: 24 * 60 + 8 },
  { vdot: 40, d: 42195, t: 3 * 3600 + 49 * 60 + 45 },
  { vdot: 50, d: 5000, t: 19 * 60 + 57 },
  { vdot: 50, d: 10000, t: 41 * 60 + 21 },
  { vdot: 50, d: 21097.5, t: 3600 + 31 * 60 + 35 },
  { vdot: 50, d: 42195, t: 3 * 3600 + 10 * 60 + 49 },
  { vdot: 60, d: 5000, t: 17 * 60 + 3 },
  { vdot: 60, d: 42195, t: 2 * 3600 + 43 * 60 + 25 },
];

describe("VDOT", () => {
  it.each(TABLE)("VDOT $vdot ↔ $d m in $t s matches published table", ({ vdot, d, t }) => {
    expect(vdotFromPerformance(d, t)).toBeCloseTo(vdot, 0);
    expect(Math.abs(predictRaceSeconds(vdot, d) - t)).toBeLessThan(t * 0.005);
  });

  it("produces training paces close to the published VDOT 50 table", () => {
    const p = trainingPaces(50);
    const mid = (r: { fastSecPerKm: number; slowSecPerKm: number }) => (r.fastSecPerKm + r.slowSecPerKm) / 2;
    expect(mid(p.threshold)).toBeGreaterThan(252); // 4:15/km ± a few s
    expect(mid(p.threshold)).toBeLessThan(262);
    expect(p.interval.fastSecPerKm).toBeCloseTo(230, -1); // ~3:50/km
    expect(p.easy.fastSecPerKm).toBeGreaterThan(300);
    expect(p.easy.slowSecPerKm).toBeLessThan(345);
    // Order of zones must be strictly faster as intensity rises.
    expect(mid(p.easy)).toBeGreaterThan(mid(p.marathon));
    expect(mid(p.marathon)).toBeGreaterThan(mid(p.threshold));
    expect(mid(p.threshold)).toBeGreaterThan(mid(p.interval));
    expect(mid(p.interval)).toBeGreaterThan(mid(p.repetition));
  });
});

describe("race confidence", () => {
  const base: RaceResult = { id: "r", date: "2026-10-01", distanceMeters: 10000, finishSeconds: 2700, timing: "official" };

  it("trusts a recent official road race", () => {
    expect(assessRace(base, "2026-10-15").confidence).toBe(1);
  });
  it("discounts old, trail, and not-all-out races", () => {
    expect(assessRace({ ...base, date: "2025-11-01" }, "2026-10-15").confidence).toBeLessThan(0.4);
    expect(assessRace({ ...base, conditions: { trail: true } }, "2026-10-15").confidence).toBe(0.5);
    expect(assessRace({ ...base, conditions: { notAllOut: true, trail: true } }, "2026-10-15").confidence).toBe(0.25);
  });
  it("never trusts an impossible time (h:mm typed as mm:ss)", () => {
    // A half marathon entered as "1:30" is 90 seconds: faster than any human.
    const typo = { ...base, distanceMeters: 21097.5, finishSeconds: 90 };
    expect(implausibleRaceTime(typo.distanceMeters, typo.finishSeconds)).toBe("too_fast");
    expect(assessRace(typo, "2026-10-15").confidence).toBe(0);
    expect(currentVdot([typo], "2026-10-15")).toBeNull();
    expect(implausibleRaceTime(5000, 10 * 3600)).toBe("too_slow");
    expect(implausibleRaceTime(5000, 13 * 60)).toBeNull(); // world-class but real
    expect(implausibleRaceTime(21097.5, 90 * 60)).toBeNull();
  });
  it("rejects future-dated races", () => {
    expect(() => assessRace({ ...base, date: "2026-12-01" }, "2026-10-15")).toThrow();
  });
  it("returns null rather than guessing when no race is trustworthy", () => {
    expect(currentVdot([], "2026-10-15")).toBeNull();
    expect(currentVdot([{ ...base, conditions: { trail: true, notAllOut: true } }], "2026-10-15")).toBeNull();
  });
  it("labels provenance: official+recent = calculated; self-reported = estimated", () => {
    expect(currentVdot([base], "2026-10-15")!.provenance.kind).toBe("calculated");
    const est = currentVdot([{ ...base, timing: "self_reported", date: "2026-05-01" }], "2026-10-15")!;
    expect(est.provenance.kind).toBe("estimated");
    expect(est.provenance.note).toMatch(/Self-reported/);
  });
  it("prefers the most trustworthy result over the fastest", () => {
    const fastButOld: RaceResult = { ...base, id: "old", date: "2025-12-01", finishSeconds: 2400 };
    expect(currentVdot([base, fastButOld], "2026-10-15")!.value).toBeCloseTo(vdotFromPerformance(10000, 2700), 1);
  });
});
