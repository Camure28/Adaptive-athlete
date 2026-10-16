/**
 * Engine inputs from the athlete's saved rows (athletes, hyrox_profiles, athlete_equipment,
 * athlete_limitations, goals, race_results). Used by the generate-plan Edge Function, which builds
 * plans only from what's stored, never from what a request claims. Must match the app's
 * toEngineInputs (apps/mobile/src/onboarding/model.ts); a test in the app checks they agree.
 */
import type { Equipment, Limitation } from "../hyrox/equipment.js";
import { LIMITATIONS } from "../hyrox/equipment.js";
import type { HyroxLevel } from "../hyrox/config.js";
import type { HyroxAthlete, TrainingStatus } from "../hyrox/generator.js";
import type { HyroxGoal, IsoDate, RaceResult, Weekday } from "../types.js";

export interface StoredProfile {
  athleteId: string;
  profile: {
    level: string;
    wants_doubles: boolean | null;
    available_days: number[];
    long_session_day: number | null;
    max_weekday_minutes: number;
    max_weekend_minutes: number;
    weekly_run_meters: number;
    training_status: string | null;
  };
  equipment: string[];
  /** Movements from athlete_limitations, including "other" (a free-text note only). */
  limitations: string[];
  goal: { id: string; event_date: IsoDate; hyrox_division: string; target_finish_seconds: number | null };
  /** race_results rows with kind = 'run'. The most recent is the running benchmark. */
  runResults: { id: string; event_date: IsoDate; distance_meters: number | string; finish_seconds: number; timing: string }[];
}

export function inputsFromProfile(s: StoredProfile, today: IsoDate): { athlete: HyroxAthlete; goal: HyroxGoal } {
  const p = s.profile;
  const level = p.level as HyroxLevel;
  const bench = [...s.runResults].sort((a, b) => b.event_date.localeCompare(a.event_date))[0];
  const runResults: RaceResult[] = bench
    ? [{ id: bench.id, date: bench.event_date, distanceMeters: Number(bench.distance_meters), finishSeconds: bench.finish_seconds, timing: bench.timing as RaceResult["timing"] }]
    : [];

  const athlete: HyroxAthlete = {
    id: s.athleteId,
    level,
    currentWeeklyRunMeters: {
      value: p.weekly_run_meters,
      provenance: { source: "manual", kind: "user_reported", confidence: 0.6, observedAt: today, note: "From onboarding" },
    },
    availableDays: [...p.available_days].sort((x, y) => x - y) as Weekday[],
    maxWeekdayMinutes: p.max_weekday_minutes,
    maxWeekendMinutes: p.max_weekend_minutes,
    equipment: s.equipment as Equipment[],
    runResults,
    exclusions: s.limitations.filter((m): m is Limitation => (LIMITATIONS as readonly string[]).includes(m)),
  };
  if (p.long_session_day !== null) athlete.preferredLongDay = p.long_session_day as Weekday;
  if (level === "advanced" && p.wants_doubles !== null) athlete.wantsDoubles = p.wants_doubles;
  if (p.training_status) athlete.trainingStatus = p.training_status as TrainingStatus;

  const division = s.goal.hyrox_division;
  const goal: HyroxGoal = {
    id: s.goal.id,
    kind: "hyrox",
    date: s.goal.event_date,
    division: division.endsWith("pro") ? "pro" : "open",
    sex: division.startsWith("women") ? "women" : "men",
    priority: "A",
  };
  if (s.goal.target_finish_seconds) goal.targetFinishSeconds = s.goal.target_finish_seconds;
  return { athlete, goal };
}
