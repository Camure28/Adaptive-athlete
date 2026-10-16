/**
 * Onboarding answers: shape, per-step validation, and conversion into engine inputs and the
 * database payload. Pure functions — no React, no network — so they're unit-tested directly.
 * Spec: docs/ONBOARDING.md.
 */
import {
  LIMITATIONS,
  METERS_PER_MILE,
  presetFor,
  type Equipment,
  type GymType,
  type HyroxAthlete,
  type HyroxGoal,
  type HyroxLevel,
  type Limitation,
  type RaceResult,
  type TrainingStatus,
  type Weekday,
  daysBetween,
} from "@adaptive-athlete/engine";

export type Division = "women_open" | "women_pro" | "men_open" | "men_pro";
export type Units = "mi" | "km";
export type BenchmarkDistance = "5k" | "10k" | "half_marathon";

export const BENCHMARK_METERS: Record<BenchmarkDistance, number> = { "5k": 5000, "10k": 10000, half_marathon: 21097.5 };

export interface OnboardingAnswers {
  units: Units;
  // 1. Race
  raceDate: string; // as typed, MM/DD/YYYY
  division: Division | null;
  goal: "finish" | "time";
  targetTime: string; // h:mm:ss
  // 2. Experience
  level: HyroxLevel | null;
  trainingStatus: TrainingStatus | null;
  pastHyroxTime: string;
  pastHyroxDate: string;
  // 3. Running
  weeklyRun: string; // in `units`
  benchmarkDistance: BenchmarkDistance | null;
  benchmarkTime: string;
  benchmarkDate: string;
  // 4. Schedule
  days: Weekday[];
  longDay: Weekday | null;
  weekdayMinutes: number;
  weekendMinutes: number;
  wantsDoubles: boolean | null;
  // 5. Equipment
  gymTypes: GymType[];
  equipment: Equipment[];
  // 6. Limitations
  limitations: Limitation[];
  limitationNote: string;
  // 7. Review
  consentHealthData: boolean;
}

export const EMPTY_ANSWERS: OnboardingAnswers = {
  units: "mi",
  raceDate: "",
  division: null,
  goal: "finish",
  targetTime: "",
  level: null,
  trainingStatus: null,
  pastHyroxTime: "",
  pastHyroxDate: "",
  weeklyRun: "",
  benchmarkDistance: null,
  benchmarkTime: "",
  benchmarkDate: "",
  days: [],
  longDay: null,
  weekdayMinutes: 60,
  weekendMinutes: 90,
  wantsDoubles: null,
  gymTypes: [],
  equipment: [],
  limitations: [],
  limitationNote: "",
  consentHealthData: false,
};

export const STEPS = ["race", "experience", "running", "schedule", "equipment", "limitations", "review"] as const;
export type Step = (typeof STEPS)[number];

export type Errors = Partial<Record<keyof OnboardingAnswers, string>>;

// ---- Parsing ----------------------------------------------------------------------------------

/** "MM/DD/YYYY" → "YYYY-MM-DD", or null if it isn't a real calendar date. */
export function parseUsDate(text: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const iso = `${yyyy}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** "h:mm:ss" or "mm:ss" → seconds, or null. */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t)) return null;
  const parts = t.split(":").map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  const secs = parts.reduce((acc, p) => acc * 60 + p, 0);
  return secs > 0 ? secs : null;
}

export function toMeters(value: number, units: Units): number {
  return Math.round(units === "mi" ? value * METERS_PER_MILE : value * 1000);
}

// ---- Validation -------------------------------------------------------------------------------

export function validateStep(step: Step, a: OnboardingAnswers, today: string): Errors {
  const e: Errors = {};
  switch (step) {
    case "race": {
      const iso = parseUsDate(a.raceDate);
      if (!iso) e.raceDate = "Enter the race date as MM/DD/YYYY.";
      else if (iso <= today) e.raceDate = "Pick a race date in the future.";
      if (!a.division) e.division = "Choose the division you're racing.";
      if (a.goal === "time" && parseTime(a.targetTime) === null) e.targetTime = "Enter a target time like 1:25:00, or choose Just finish.";
      break;
    }
    case "experience":
      if (!a.level) e.level = "Choose the level that fits you best.";
      if (!a.trainingStatus) e.trainingStatus = "Choose where your training is right now.";
      if (a.pastHyroxTime && parseTime(a.pastHyroxTime) === null) e.pastHyroxTime = "Enter your time like 1:32:10.";
      if (a.pastHyroxTime && !parseUsDate(a.pastHyroxDate)) e.pastHyroxDate = "Add the race date as MM/DD/YYYY.";
      break;
    case "running": {
      const v = Number(a.weeklyRun);
      if (a.weeklyRun.trim() === "" || Number.isNaN(v) || v < 0 || v > (a.units === "mi" ? 150 : 250)) {
        e.weeklyRun = `Enter how many ${a.units === "mi" ? "miles" : "kilometers"} you run in a typical week (0 is fine).`;
      }
      if (a.benchmarkDistance) {
        if (parseTime(a.benchmarkTime) === null) e.benchmarkTime = "Enter your finish time like 24:30.";
        const iso = parseUsDate(a.benchmarkDate);
        if (!iso) e.benchmarkDate = "Add the date as MM/DD/YYYY.";
        else if (iso > today) e.benchmarkDate = "That date is in the future.";
      }
      break;
    }
    case "schedule":
      if (a.days.length < 3) e.days = "Pick at least 3 days. HYROX plans need 3 or more sessions a week.";
      if (a.longDay !== null && !a.days.includes(a.longDay)) e.longDay = "Your long-session day needs to be one of your training days.";
      break;
    case "equipment":
      if (a.gymTypes.length === 0) e.gymTypes = "Choose where you train.";
      if (!a.equipment.some((x) => x === "outdoor_run" || x === "treadmill" || x === "curved_treadmill")) {
        e.equipment = "Tick somewhere to run — outdoors or a treadmill. Running is half of HYROX.";
      }
      break;
    case "limitations":
      if (a.limitationNote.length > 280) e.limitationNote = "Keep the note under 280 characters.";
      break;
    case "review":
      if (!a.consentHealthData) e.consentHealthData = "We need your agreement to use your training data to build your plan.";
      break;
  }
  return e;
}

export function validateAll(a: OnboardingAnswers, today: string): Errors {
  return Object.assign({}, ...STEPS.map((s) => validateStep(s, a, today)));
}

// ---- Derived state ----------------------------------------------------------------------------

/** Changing gym types re-applies presets: adds the new presets' items, keeps anything ticked manually. */
export function applyGymTypes(a: OnboardingAnswers, gymTypes: GymType[]): OnboardingAnswers {
  const before = presetFor(a.gymTypes);
  const after = presetFor(gymTypes);
  const manual = a.equipment.filter((e) => !before.has(e));
  return { ...a, gymTypes, equipment: [...new Set([...after, ...manual])] };
}

export const doublesQuestionApplies = (level: HyroxLevel | null): boolean => level === "advanced";

const [womenOrMen, openOrPro] = [(d: Division) => (d.startsWith("women") ? "women" : "men"), (d: Division) => (d.endsWith("pro") ? "pro" : "open")] as const;

// ---- Conversion -------------------------------------------------------------------------------

export interface EngineInputs {
  athlete: HyroxAthlete;
  goal: HyroxGoal;
}

/** Throws if answers are incomplete — callers validate first. */
export function toEngineInputs(a: OnboardingAnswers, today: string, athleteId = "me"): EngineInputs {
  const raceDate = parseUsDate(a.raceDate);
  if (!raceDate || !a.division || !a.level) throw new Error("Onboarding is incomplete");
  const runResults: RaceResult[] = [];
  const bench = benchmarkResult(a);
  if (bench) runResults.push(bench);

  const athlete: HyroxAthlete = {
    id: athleteId,
    level: a.level,
    currentWeeklyRunMeters: {
      value: toMeters(Number(a.weeklyRun) || 0, a.units),
      provenance: { source: "manual", kind: "user_reported", confidence: 0.6, observedAt: today, note: "From onboarding" },
    },
    availableDays: [...a.days].sort((x, y) => x - y),
    maxWeekdayMinutes: a.weekdayMinutes,
    maxWeekendMinutes: a.weekendMinutes,
    equipment: a.equipment,
    runResults,
    exclusions: [...a.limitations],
  };
  if (a.longDay !== null) athlete.preferredLongDay = a.longDay;
  if (a.level === "advanced" && a.wantsDoubles !== null) athlete.wantsDoubles = a.wantsDoubles;
  if (a.trainingStatus) athlete.trainingStatus = a.trainingStatus;

  const goal: HyroxGoal = {
    id: "goal",
    kind: "hyrox",
    date: raceDate,
    division: openOrPro(a.division),
    sex: womenOrMen(a.division),
    priority: "A",
  };
  const target = a.goal === "time" ? parseTime(a.targetTime) : null;
  if (target) goal.targetFinishSeconds = target;
  return { athlete, goal };
}

function benchmarkResult(a: OnboardingAnswers): RaceResult | null {
  if (!a.benchmarkDistance) return null;
  const secs = parseTime(a.benchmarkTime);
  const date = parseUsDate(a.benchmarkDate);
  if (!secs || !date) return null;
  // Self-entered: the engine discounts confidence accordingly and labels paces as estimated.
  return { id: "benchmark", date, distanceMeters: BENCHMARK_METERS[a.benchmarkDistance], finishSeconds: secs, timing: "self_reported" };
}

/** Payload for public.save_hyrox_onboarding (supabase/migrations/20261015000002_save_onboarding.sql). */
export function toSavePayload(a: OnboardingAnswers, today: string) {
  const { athlete, goal } = toEngineInputs(a, today);
  const results: Record<string, unknown>[] = [];
  const bench = athlete.runResults[0];
  if (bench) {
    results.push({ kind: "run", date: bench.date, distanceMeters: bench.distanceMeters, finishSeconds: bench.finishSeconds, timing: "self_reported" });
  }
  const pastTime = parseTime(a.pastHyroxTime);
  const pastDate = parseUsDate(a.pastHyroxDate);
  if (pastTime && pastDate) {
    results.push({ kind: "hyrox", date: pastDate, distanceMeters: null, finishSeconds: pastTime, timing: "self_reported", division: a.division });
  }
  return {
    units: a.units,
    level: athlete.level,
    wantsDoubles: athlete.wantsDoubles ?? null,
    trainingStatus: a.trainingStatus,
    gymTypes: a.gymTypes,
    availableDays: athlete.availableDays,
    longDay: a.longDay,
    weekdayMinutes: a.weekdayMinutes,
    weekendMinutes: a.weekendMinutes,
    weeklyRunMeters: athlete.currentWeeklyRunMeters.value,
    equipment: a.equipment,
    limitations: a.limitations,
    limitationNote: a.limitationNote.trim(),
    raceDate: goal.date,
    division: a.division,
    targetFinishSeconds: goal.targetFinishSeconds ?? null,
    results,
    consentHealthData: a.consentHealthData,
    policyVersion: "v1",
  };
}

export const LIMITATION_LABELS: Record<Limitation, string> = {
  jumping: "Jumping",
  deep_knee_bends: "Deep knee bends",
  overhead: "Overhead pressing or throwing",
  heavy_hinging: "Heavy hip hinging (deadlifts)",
  running_downhill: "Running downhill",
};
export { LIMITATIONS };

/** A HYROX raced in the last 8 weeks suggests the athlete is race-ready (they can change it). */
export const RECENT_RACE_DAYS = 56;
export function suggestStatusFromPastRace(a: OnboardingAnswers, pastHyroxDate: string, today: string): Partial<OnboardingAnswers> {
  const iso = parseUsDate(pastHyroxDate);
  const recent = iso !== null && iso <= today && daysBetween(iso, today) <= RECENT_RACE_DAYS;
  return recent && a.trainingStatus === null ? { pastHyroxDate, trainingStatus: "race_ready" } : { pastHyroxDate };
}
