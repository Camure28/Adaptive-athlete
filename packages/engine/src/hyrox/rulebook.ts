/**
 * HYROX race standards, stored as versioned data per season (D-002).
 * Source: HYROX 26/27 Singles Rulebook (EN, FINAL), sections 8.1–8.8. Verified 2026-10-15.
 * Update by adding a new season object — never edit a past season.
 */

import type { HyroxStation } from "../types.js";

export type HyroxDivision = "open" | "pro";
export type HyroxSex = "women" | "men";

export const STATION_ORDER: readonly HyroxStation[] = [
  "skierg",
  "sled_push",
  "sled_pull",
  "burpee_broad_jump",
  "row",
  "farmers_carry",
  "sandbag_lunges",
  "wall_balls",
];

export const STATION_NAMES: Record<HyroxStation, string> = {
  skierg: "SkiErg",
  sled_push: "Sled push",
  sled_pull: "Sled pull",
  burpee_broad_jump: "Burpee broad jumps",
  row: "Rowing",
  farmers_carry: "Farmers carry",
  sandbag_lunges: "Sandbag lunges",
  wall_balls: "Wall balls",
};

/** Race volume per station (identical across Singles divisions). */
export const RACE_VOLUME: Record<HyroxStation, { amount: number; unit: "m" | "reps" }> = {
  skierg: { amount: 1000, unit: "m" },
  sled_push: { amount: 50, unit: "m" },
  sled_pull: { amount: 50, unit: "m" },
  burpee_broad_jump: { amount: 80, unit: "m" },
  row: { amount: 1000, unit: "m" },
  farmers_carry: { amount: 200, unit: "m" },
  sandbag_lunges: { amount: 100, unit: "m" },
  wall_balls: { amount: 100, unit: "reps" },
};

export interface SeasonStandards {
  season: string;
  source: string;
  verifiedOn: string;
  /** Run segments: 8 × 1 km. */
  runMeters: number;
  loads: Record<HyroxSex, Record<HyroxDivision, Partial<Record<HyroxStation, string>>>>;
}

export const SEASON_2026_27: SeasonStandards = {
  season: "2026/27",
  source: "HYROX 26/27 Singles Rulebook (EN, FINAL), §8",
  verifiedOn: "2026-10-15",
  runMeters: 1000,
  loads: {
    women: {
      open: {
        sled_push: "102 kg incl. sled",
        sled_pull: "78 kg incl. sled",
        farmers_carry: "2 × 16 kg",
        sandbag_lunges: "10 kg",
        wall_balls: "4 kg ball, 2.70 m target",
      },
      pro: {
        sled_push: "152 kg incl. sled",
        sled_pull: "103 kg incl. sled",
        farmers_carry: "2 × 24 kg",
        sandbag_lunges: "20 kg",
        wall_balls: "6 kg ball, 2.70 m target",
      },
    },
    men: {
      open: {
        sled_push: "152 kg incl. sled",
        sled_pull: "103 kg incl. sled",
        farmers_carry: "2 × 24 kg",
        sandbag_lunges: "20 kg",
        wall_balls: "6 kg ball, 3.00 m target",
      },
      pro: {
        sled_push: "202 kg incl. sled",
        sled_pull: "153 kg incl. sled",
        farmers_carry: "2 × 32 kg",
        sandbag_lunges: "30 kg",
        wall_balls: "9 kg ball, 3.00 m target",
      },
    },
  },
};

export const CURRENT_SEASON = SEASON_2026_27;

export function raceLoad(station: HyroxStation, sex: HyroxSex, division: HyroxDivision, season = CURRENT_SEASON): string | undefined {
  return season.loads[sex][division][station];
}
