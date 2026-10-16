/**
 * The phone (toEngineInputs) and the generate-plan Edge Function (inputsFromProfile) must build the
 * same engine inputs, or a stored plan wouldn't match what the athlete answered. This runs the
 * answers through the save payload, stores them the way save_hyrox_onboarding does, and compares.
 */
import { describe, expect, it } from "vitest";
import { inputsFromProfile, type StoredProfile } from "@adaptive-athlete/engine";
import { applyGymTypes, EMPTY_ANSWERS, toEngineInputs, toSavePayload, type OnboardingAnswers } from "../src/onboarding/model";

const TODAY = "2026-10-15";
const base: OnboardingAnswers = {
  ...applyGymTypes(EMPTY_ANSWERS, ["crossfit"]),
  raceDate: "02/27/2027",
  division: "women_open",
  level: "first_timer",
  trainingStatus: "consistent",
  weeklyRun: "10",
  benchmarkDistance: "5k",
  benchmarkTime: "26:30",
  benchmarkDate: "09/20/2026",
  days: [5, 0, 2, 3],
  longDay: 5,
  consentHealthData: true,
};

/** What save_hyrox_onboarding stores for this payload (supabase/migrations/20261016000005_hyrox_events.sql). */
function storedRows(a: OnboardingAnswers): StoredProfile {
  const p = toSavePayload(a, TODAY);
  const limitations = p.limitations.length === 0 && p.limitationNote ? ["other"] : [...p.limitations];
  return {
    athleteId: "me",
    profile: {
      level: p.level,
      wants_doubles: p.wantsDoubles,
      available_days: p.availableDays,
      long_session_day: p.longDay,
      max_weekday_minutes: p.weekdayMinutes,
      max_weekend_minutes: p.weekendMinutes,
      weekly_run_meters: p.weeklyRunMeters,
      training_status: p.trainingStatus,
    },
    equipment: p.equipment,
    limitations,
    goal: { id: "goal", event_date: p.raceDate, hyrox_division: p.division!, target_finish_seconds: p.targetFinishSeconds },
    runResults: p.results
      .filter((r) => r.kind === "run")
      .map((r) => ({ id: "benchmark", event_date: r.date as string, distance_meters: String(r.distanceMeters), finish_seconds: r.finishSeconds as number, timing: r.timing as string })),
  };
}

const CASES: [string, Partial<OnboardingAnswers>][] = [
  ["first-timer with a 5K", {}],
  ["advanced with doubles, time goal, limitations", { level: "advanced", wantsDoubles: true, goal: "time", targetTime: "1:25:00", limitations: ["jumping", "overhead"], division: "men_pro" }],
  ["competitive, no benchmark, km, race-ready", { level: "competitive", wantsDoubles: false, benchmarkDistance: null, units: "km", weeklyRun: "55", trainingStatus: "race_ready", longDay: null }],
  ["intermediate with only a limitation note", { level: "intermediate", limitationNote: "Sore shoulder", trainingStatus: null }],
];

describe("phone and server build the same engine inputs", () => {
  for (const [name, patch] of CASES) {
    it(name, () => {
      const a = { ...base, ...patch };
      const phone = toEngineInputs(a, TODAY);
      const server = inputsFromProfile(storedRows(a), TODAY);
      expect(server.athlete).toEqual(phone.athlete);
      expect(server.goal).toEqual(phone.goal);
    });
  }
});
