/**
 * Pins the product owner's approved HYROX rules (docs/HYROX_WEEK.md, docs/HYROX_EQUIPMENT.md, D-002..D-004).
 * If one of these tests fails, a coaching decision has been broken — change it only with the coach.
 */
import { describe, expect, it } from "vitest";
import { generateHyroxPlan, HyroxPlanError, type HyroxAthlete } from "../src/hyrox/generator.js";
import { EXCLUDED_BY_COACH, PRESETS, presetFor, resolveStation, type Equipment } from "../src/hyrox/equipment.js";
import { CURRENT_SEASON, raceLoad, STATION_ORDER } from "../src/hyrox/rulebook.js";
import { LEVELS, type HyroxLevel } from "../src/hyrox/config.js";
import { HARD_SESSION_TYPES, type HyroxGoal, type PlannedWorkout, type TrainingPlan } from "../src/types.js";
import { addDays, daysBetween, weekdayOf } from "../src/units/units.js";

const TODAY = "2026-10-15";
const NOW = "2026-10-15T12:00:00-06:00";
const RACE = "2027-02-27"; // Saturday, ~19 weeks out
const tracked = (v: number) => ({ value: v, provenance: { source: "manual" as const, kind: "user_reported" as const, confidence: 0.7, observedAt: TODAY } });
const fiveK = (seconds: number) => [{ id: "5k", date: "2026-09-27", distanceMeters: 5000, finishSeconds: seconds, timing: "official" as const }];

const athlete = (level: HyroxLevel, over: Partial<HyroxAthlete> = {}): HyroxAthlete => ({
  id: `ath-${level}`,
  level,
  currentWeeklyRunMeters: tracked(level === "first_timer" ? 12_000 : level === "intermediate" ? 25_000 : level === "advanced" ? 40_000 : 60_000),
  availableDays: level === "first_timer" ? [0, 2, 3, 5] : level === "competitive" ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5],
  maxWeekdayMinutes: 90,
  maxWeekendMinutes: 150,
  equipment: [...presetFor(["hyrox_club"])],
  runResults: level === "first_timer" ? [] : fiveK(21 * 60),
  exclusions: [],
  ...over,
});
const goal = (over: Partial<HyroxGoal> = {}): HyroxGoal => ({ id: "g", kind: "hyrox", date: RACE, division: "open", sex: "women", priority: "A", ...over });
const plan = (a: HyroxAthlete, g: HyroxGoal = goal()) => generateHyroxPlan(a, g, { planId: "p", today: TODAY, now: NOW });
const all = (p: TrainingPlan): PlannedWorkout[] => p.weeks.flatMap((w) => w.workouts);
const isHard = (w: PlannedWorkout) => HARD_SESSION_TYPES.has(w.type) && w.type !== "race";

// ---------------------------------------------------------------------------------------------
describe("rulebook data (26/27 Singles, verified 2026-10-15)", () => {
  it("stores loads by sex and division, including the shared Women Pro / Men Open loads", () => {
    expect(raceLoad("sled_push", "women", "open")).toBe("102 kg incl. sled");
    expect(raceLoad("sled_push", "women", "pro")).toBe(raceLoad("sled_push", "men", "open"));
    expect(raceLoad("sled_pull", "men", "pro")).toBe("153 kg incl. sled");
    expect(raceLoad("farmers_carry", "men", "pro")).toBe("2 × 32 kg");
  });
  it("uses the 2.70 m wall-ball target for both women's divisions", () => {
    expect(raceLoad("wall_balls", "women", "open")).toContain("2.70 m");
    expect(raceLoad("wall_balls", "women", "pro")).toBe("6 kg ball, 2.70 m target");
    expect(raceLoad("wall_balls", "men", "pro")).toBe("9 kg ball, 3.00 m target");
  });
  it("records its source and season", () => {
    expect(CURRENT_SEASON.season).toBe("2026/27");
    expect(STATION_ORDER).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------------------------
describe("equipment and substitutions (coach ratings)", () => {
  const has = (...e: Equipment[]) => new Set<Equipment>(e);

  it("always prefers the real station when available", () => {
    expect(resolveStation("sled_push", presetFor(["hyrox_club"]), "race_specific").recommended?.kind).toBe("real");
  });
  it("recommends the coach's Best sled-push substitute first", () => {
    const r = resolveStation("sled_push", has("curved_treadmill", "plates", "turf_lane", "dumbbells", "barbell_rack"), "race_specific");
    expect(r.recommended?.name).toBe("Resisted treadmill pushing");
    expect(r.alternatives.map((a) => a.name)).toEqual([
      "Pushing heavy plates across turf",
      "Weighted walking lunges",
      "Heavy back squats",
      "Bulgarian split squats",
    ]);
  });
  it("never offers options the coach rated Don't use", () => {
    const everything = new Set(PRESETS.hyrox_club.concat("cable_machine"));
    for (const station of STATION_ORDER) {
      for (const ctx of ["race_specific", "strength"] as const) {
        const r = resolveStation(station, everything, ctx);
        const names = [r.recommended, ...r.alternatives].map((o) => o?.name.toLowerCase() ?? "");
        for (const banned of EXCLUDED_BY_COACH[station] ?? []) {
          expect(names.some((n) => n.includes(banned.toLowerCase()))).toBe(false);
        }
        if (station === "skierg") expect(names.some((n) => n.includes("bike"))).toBe(false);
      }
    }
  });
  it("SkiErg context rule: rower first in race-specific work, pulldowns first on strength days", () => {
    const gym = has("rower", "cable_machine");
    expect(resolveStation("skierg", gym, "race_specific").recommended?.name).toMatch(/Rower/);
    expect(resolveStation("skierg", gym, "strength").recommended?.name).toMatch(/pulldowns/);
    expect(resolveStation("skierg", has("cable_machine"), "race_specific").recommended?.name).toMatch(/pulldowns/);
  });
  it("presets: CrossFit doesn't assume a SkiErg or sled; HYROX club has the full race setup", () => {
    expect(PRESETS.crossfit).not.toContain("skierg");
    expect(PRESETS.crossfit).not.toContain("sled");
    for (const e of ["skierg", "sled", "turf_lane", "rower", "wall_ball", "sandbag"] as const) expect(PRESETS.hyrox_club).toContain(e);
    expect(presetFor(["home", "crossfit"]).has("rower")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
const LEVEL_CASES: [HyroxLevel, Partial<HyroxAthlete>][] = [
  ["first_timer", { equipment: [...presetFor(["commercial"])] }],
  ["intermediate", { equipment: [...presetFor(["crossfit"])] }],
  ["advanced", { wantsDoubles: true }],
  ["advanced", {}],
  ["competitive", {}],
];

describe.each(LEVEL_CASES)("approved week structure: %s %o", (level, over) => {
  const a = athlete(level, over);
  const p = plan(a);
  const ws = all(p);
  const lvl = LEVELS[level];

  it("schedules only on available days, nothing after race day, and ends with the race", () => {
    expect(ws.filter((w) => w.type === "race").map((w) => w.date)).toEqual([RACE]);
    for (const w of ws.filter((x) => x.type !== "race")) {
      expect(a.availableDays).toContain(weekdayOf(w.date));
      expect(w.date < RACE && w.date > TODAY).toBe(true);
    }
  });

  it("never has hard days back to back", () => {
    const hardDates = [...new Set(ws.filter(isHard).map((w) => w.date))].sort();
    for (let i = 1; i < hardDates.length; i++) expect(daysBetween(hardDates[i - 1]!, hardDates[i]!)).toBeGreaterThanOrEqual(2);
  });

  it("stays within the level's sessions and hard days per week", () => {
    for (const wk of p.weeks.slice(0, -1)) {
      expect(wk.workouts.length).toBeLessThanOrEqual(lvl.sessions.max);
      expect(new Set(wk.workouts.filter(isHard).map((w) => w.date)).size).toBeLessThanOrEqual(lvl.hardDays.max);
    }
  });

  it("allows double days only where approved (Competitive default, Advanced opt-in)", () => {
    const perDay = new Map<string, number>();
    for (const w of ws) perDay.set(w.date, (perDay.get(w.date) ?? 0) + 1);
    const maxPerDay = Math.max(...perDay.values());
    const allowed = level === "competitive" || (level === "advanced" && a.wantsDoubles === true);
    if (!allowed) expect(maxPerDay).toBe(1);
    expect(maxPerDay).toBeLessThanOrEqual(2);
  });

  it("makes the day after a hard double an easy day", () => {
    const byDate = new Map<string, PlannedWorkout[]>();
    for (const w of ws) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w]);
    for (const [date, list] of byDate) {
      if (list.filter(isHard).length < 2) continue;
      const next = byDate.get(addDays(date, 1)) ?? [];
      expect(next.every((w) => w.type === "easy_run" || w.type === "long_run")).toBe(true);
    }
  });

  it("schedules the approved simulations: half sims in build, 1–2 full sims, last ≥ 10 days out", () => {
    const fulls = ws.filter((w) => w.type === "full_simulation");
    const halves = ws.filter((w) => w.type === "half_simulation");
    expect(fulls.length).toBe(lvl.fullSimulations);
    expect(halves.length).toBeGreaterThanOrEqual(1);
    expect(daysBetween(fulls.at(-1)!.date, RACE)).toBeGreaterThanOrEqual(10);
    for (const h of halves) expect(p.weeks.find((wk) => wk.workouts.includes(h))!.phase).toBe("build");
    for (const f of fulls) {
      const wk = p.weeks.find((x) => x.workouts.includes(f))!;
      expect(wk.isRecoveryWeek).toBe(false);
      expect(["peak", "build"]).toContain(wk.phase);
    }
  });

  it("never stacks two of the same session in one day", () => {
    const seen = new Set<string>();
    for (const w of ws) {
      const key = `${w.date}:${w.type}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("puts full simulations in the peak phase when peak has room", () => {
    const peakWeeks = p.weeks.filter((wk) => wk.phase === "peak" && !wk.isRecoveryWeek).length;
    if (peakWeeks >= lvl.fullSimulations) {
      for (const f of ws.filter((w) => w.type === "full_simulation")) {
        expect(p.weeks.find((x) => x.workouts.includes(f))!.phase).toBe("peak");
      }
    }
  });

  it("keeps strength and station work off the day before a simulation or the race", () => {
    const key = new Set(ws.filter((w) => w.type.endsWith("simulation") || w.type === "race").map((w) => w.date));
    for (const w of ws.filter((x) => x.type === "strength" || x.type === "station_endurance")) {
      expect(key.has(addDays(w.date, 1))).toBe(false);
    }
  });

  it("gives every session an objective, rationale, scaling and steps with RPE", () => {
    for (const w of ws) {
      expect(w.objective.length).toBeGreaterThan(10);
      expect(w.rationale.length).toBeGreaterThan(10);
      expect(w.steps.length).toBeGreaterThan(0);
      for (const s of w.steps) expect(s.target.rpe.max).toBeGreaterThanOrEqual(s.target.rpe.min);
    }
  });

  it("is deterministic", () => {
    expect(plan(a)).toEqual(p);
  });
});

describe("station prescriptions", () => {
  it("shows rulebook loads only on the real station, for the athlete's division", () => {
    const p = plan(athlete("advanced"), goal({ division: "pro", sex: "men" }));
    const steps = all(p).flatMap((w) => w.steps).filter((s) => s.station);
    const sled = steps.find((s) => s.station!.station === "sled_push" && s.station!.recommended?.kind === "real")!;
    expect(sled.station!.raceLoad).toBe("202 kg incl. sled");
  });

  it("prescribes substitutes by time and never with a race load", () => {
    const p = plan(athlete("intermediate", { equipment: [...presetFor(["commercial"])] }));
    const subs = all(p).flatMap((w) => w.steps).filter((s) => s.station && s.station.recommended && s.station.recommended.kind !== "real");
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) {
      expect(s.station!.raceLoad).toBeUndefined();
      expect(s.station!.volume).toMatch(/s of hard work/);
    }
  });

  it("uses the rower (not pulldowns) for SkiErg blocks in compromised runs when the athlete has one", () => {
    const p = plan(athlete("intermediate", { equipment: [...presetFor(["commercial"])] }));
    const ski = all(p).filter((w) => w.type === "compromised_run").flatMap((w) => w.steps).filter((s) => s.station?.station === "skierg");
    expect(ski.length).toBeGreaterThan(0);
    for (const s of ski) expect(s.station!.recommended?.name).toMatch(/Rower/);
  });

  it("strength days use support exercises, never the conditioning stations", () => {
    const p = plan(athlete("advanced"));
    for (const w of all(p).filter((x) => x.type === "strength")) {
      const text = w.steps.map((s) => s.note ?? "").join(" ");
      expect(text).not.toMatch(/\bSled push\b|\bSkiErg\b|\bSled pull\b/);
      expect(text).toMatch(/pulldowns/);
    }
  });

  it("covers all eight stations across the plan", () => {
    const p = plan(athlete("intermediate"));
    const seen = new Set(all(p).flatMap((w) => w.steps).flatMap((s) => (s.station ? [s.station.station] : [])));
    expect(seen.size).toBe(8);
  });
});

describe("personalisation", () => {
  it("sets run paces from a 5K benchmark, and uses RPE without one", () => {
    const withPace = plan(athlete("intermediate"));
    const run = all(withPace).find((w) => w.type === "compromised_run")!.steps.find((s) => s.kind === "work" && s.distanceMeters === 1000)!;
    expect(run.target.pace).toBeDefined();
    const noPace = plan(athlete("first_timer"));
    expect(noPace.basis.vdot).toBeNull();
    expect(noPace.basis.notes.join(" ")).toMatch(/RPE/);
    const run2 = all(noPace).find((w) => w.type === "compromised_run")!.steps.find((s) => s.kind === "work")!;
    expect(run2.distanceMeters).toBe(1000); // HYROX segments stay 1 km even without paces
    expect(run2.target.pace).toBeUndefined();
  });

  it("gives higher levels more training than lower levels", () => {
    const sessions = (l: HyroxLevel) => plan(athlete(l, { availableDays: [0, 1, 2, 3, 4, 5, 6] })).weeks[9]!.workouts.length;
    expect(sessions("first_timer")).toBeLessThan(sessions("intermediate"));
    expect(sessions("intermediate")).toBeLessThan(sessions("advanced"));
    expect(sessions("advanced")).toBeLessThanOrEqual(sessions("competitive"));
  });

  it("never makes an easy run longer than the week's long run", () => {
    for (const l of ["first_timer", "intermediate", "advanced"] as const) {
      for (const wk of plan(athlete(l)).weeks) {
        const long = wk.workouts.find((w) => w.type === "long_run")?.plannedDistanceMeters;
        if (!long) continue;
        for (const e of wk.workouts.filter((w) => w.type === "easy_run")) expect(e.plannedDistanceMeters!).toBeLessThanOrEqual(long);
      }
    }
  });
});

describe("input validation", () => {
  it("rejects past races, too-close races, too few days, and no place to run", () => {
    expect(() => plan(athlete("intermediate"), goal({ date: "2026-10-01" }))).toThrow(HyroxPlanError);
    expect(() => plan(athlete("intermediate"), goal({ date: "2026-10-30" }))).toThrow(HyroxPlanError);
    expect(() => plan(athlete("intermediate", { availableDays: [1, 4] }))).toThrow(HyroxPlanError);
    expect(() => plan(athlete("intermediate", { equipment: ["rower", "dumbbells"] }))).toThrow(/place to run/);
  });

  it("flags a compressed timeline instead of silently cramming", () => {
    const p = plan(athlete("intermediate"), goal({ date: "2026-12-05" }));
    expect(p.basis.notes.join(" ")).toMatch(/recommended/);
  });
});
