import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatDuration,
  formatPace,
  parseDuration,
  secPerMileToSecPerKm,
  startOfWeek,
  weekdayOf,
} from "../src/units/units.js";

describe("durations", () => {
  it("parses h:mm:ss, mm:ss and seconds", () => {
    expect(parseDuration("1:30:00")).toBe(5400);
    expect(parseDuration("45:00")).toBe(2700);
    expect(parseDuration("59")).toBe(59);
  });
  it("rejects malformed input instead of guessing", () => {
    for (const bad of ["", "1:75", "abc", "1::2", "-5:00"]) expect(() => parseDuration(bad)).toThrow();
  });
  it("formats", () => {
    expect(formatDuration(5400)).toBe("1:30:00");
    expect(formatDuration(255)).toBe("4:15");
    expect(formatPace(300)).toBe("5:00/km");
    expect(formatPace(secPerMileToSecPerKm(480), "mi")).toBe("8:00/mi");
  });
});

describe("calendar dates", () => {
  it("does date arithmetic across month/year/DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // US DST ends 2026-11-01
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-15", "2027-02-07")).toBe(115);
  });
  it("uses Monday = 0", () => {
    expect(weekdayOf("2026-10-15")).toBe(3); // Thursday
    expect(startOfWeek("2026-10-15")).toBe("2026-10-12");
  });
  it("rejects impossible dates", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow();
  });
});
