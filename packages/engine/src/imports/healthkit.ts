/**
 * Apple Health (HealthKit) adapter: HealthKit workout → ImportedActivity.
 *
 * The native layer (apps/mobile, once the HealthKit capability is enabled with the paid Apple
 * Developer Program) reads HKWorkout objects and passes plain values here, already in metres,
 * seconds, kcal and bpm. Keeping the mapping in the engine means it is tested now, before the
 * native code exists.
 *
 * Apple Health is a hub: workouts recorded by an Apple Watch, or written by Garmin Connect, Strava,
 * COROS, Polar and others (when the athlete enables it in that app), all arrive through here.
 * `source` is always "apple_health" (the channel); `originApp` records who wrote it.
 */
import type { Sport } from "../types.js";
import type { ImportedActivity } from "./activity.js";

export interface HealthKitWorkoutInput {
  uuid: string;
  /** HKWorkoutActivityType raw value (37) or its case name ("running"). */
  workoutActivityType: number | string;
  startDate: string | Date;
  endDate: string | Date;
  /** Seconds. Falls back to end − start when absent. */
  duration?: number;
  totalDistanceMeters?: number;
  totalEnergyKcal?: number;
  sourceName?: string;
  sourceBundleId?: string;
  deviceName?: string;
  avgHeartRate?: number;
  maxHeartRate?: number;
  metadata?: {
    HKIndoorWorkout?: boolean | 0 | 1;
    /** Metres. */
    HKElevationAscended?: number;
  };
}

/**
 * HKWorkoutActivityType raw values for the types our athletes use.
 * ENGINE ASSUMPTION: values per Apple's HKWorkoutActivityType enum; re-check against the HealthKit
 * library's constants when the native layer is wired up (a test pins them).
 */
export const HK_ACTIVITY_TYPES: Readonly<Record<string, number>> = {
  crossTraining: 11,
  cycling: 13,
  elliptical: 16,
  functionalStrengthTraining: 20,
  hiking: 24,
  mixedMetabolicCardioTraining: 30,
  rowing: 35,
  running: 37,
  stairClimbing: 44,
  swimming: 46,
  traditionalStrengthTraining: 50,
  walking: 52,
  coreTraining: 59,
  highIntensityIntervalTraining: 63,
  jumpRope: 64,
  mixedCardio: 73,
  other: 3000,
};

const NAME_BY_VALUE = new Map(Object.entries(HK_ACTIVITY_TYPES).map(([name, v]) => [v, name]));

/**
 * Which of our sports each HealthKit type counts as. HealthKit has no HYROX type: watches usually
 * record HYROX-style sessions as HIIT, cross training, functional strength or mixed cardio, so those
 * map to "other" and plan matching treats them as candidates for HYROX sessions.
 */
const SPORT_BY_NAME: Readonly<Record<string, Sport>> = {
  running: "run",
  hiking: "trail_run",
  cycling: "bike",
  rowing: "row",
  swimming: "swim",
  traditionalStrengthTraining: "strength",
  functionalStrengthTraining: "strength",
  coreTraining: "strength",
  crossTraining: "other",
  highIntensityIntervalTraining: "other",
  mixedCardio: "other",
  mixedMetabolicCardioTraining: "other",
};

export function healthKitTypeName(t: number | string): string {
  if (typeof t === "string") return t;
  return NAME_BY_VALUE.get(t) ?? `type_${t}`;
}

const iso = (d: string | Date) => (typeof d === "string" ? new Date(d) : d).toISOString();

export function fromHealthKitWorkout(w: HealthKitWorkoutInput): ImportedActivity {
  const providerType = healthKitTypeName(w.workoutActivityType);
  const startedAt = iso(w.startDate);
  const endedAt = iso(w.endDate);
  const elapsed = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
  const indoor = w.metadata?.HKIndoorWorkout;

  const a: ImportedActivity = {
    source: "apple_health",
    externalId: w.uuid,
    sport: SPORT_BY_NAME[providerType] ?? "other",
    providerType,
    startedAt,
    endedAt,
    durationSeconds: w.duration ?? elapsed,
  };
  if (w.sourceName) a.originApp = w.sourceName;
  if (w.sourceBundleId) a.originBundleId = w.sourceBundleId;
  if (w.deviceName) a.device = w.deviceName;
  if (w.totalDistanceMeters !== undefined) a.distanceMeters = w.totalDistanceMeters;
  if (w.totalEnergyKcal !== undefined) a.activeEnergyKcal = Math.round(w.totalEnergyKcal);
  if (w.avgHeartRate !== undefined) a.avgHeartRate = w.avgHeartRate;
  if (w.maxHeartRate !== undefined) a.maxHeartRate = w.maxHeartRate;
  if (w.metadata?.HKElevationAscended !== undefined) a.elevationGainMeters = w.metadata.HKElevationAscended;
  if (indoor !== undefined) a.indoor = Boolean(indoor);
  return a;
}
