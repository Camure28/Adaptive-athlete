/**
 * Equipment checklist, gym presets and coach-rated station substitutions.
 * Mirrors docs/HYROX_EQUIPMENT.md (product-owner ratings, 2026-10-15). Change ratings here
 * and in that doc together; tests pin the coach's decisions.
 */

import type { HyroxStation, StationOption } from "../types.js";

export const EQUIPMENT = [
  "outdoor_run",
  "treadmill",
  "curved_treadmill",
  "skierg",
  "rower",
  "bike_erg",
  "sled",
  "turf_lane",
  "plates",
  "barbell_rack",
  "dumbbells",
  "kettlebells",
  "cable_machine",
  "battle_rope",
  "wall_ball",
  "sandbag",
  "open_floor",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export type GymType = "home" | "crossfit" | "commercial" | "hyrox_club";

export const PRESETS: Record<GymType, readonly Equipment[]> = {
  home: ["outdoor_run"],
  crossfit: ["outdoor_run", "rower", "bike_erg", "plates", "barbell_rack", "dumbbells", "kettlebells", "wall_ball", "sandbag", "open_floor"],
  commercial: ["outdoor_run", "treadmill", "rower", "bike_erg", "plates", "barbell_rack", "dumbbells", "kettlebells", "cable_machine", "open_floor"],
  hyrox_club: [...EQUIPMENT.filter((e) => e !== "cable_machine")],
};

/** Pre-ticked checklist for one or more setups. The athlete then corrects it. */
export function presetFor(types: GymType[]): Set<Equipment> {
  return new Set(types.flatMap((t) => PRESETS[t]));
}

/**
 * Equipment requirement: every inner group must be satisfied; within a group, any item works.
 * [["sled"], ["turf_lane"]] = sled AND turf; [["dumbbells", "kettlebells"]] = dumbbells OR kettlebells.
 */
type Requirement = Equipment[][];

interface CatalogEntry extends StationOption {
  requires: Requirement;
}

const RATING_ORDER = { race: 0, best: 1, good: 2, fallback: 3 } as const;

const REAL: Record<HyroxStation, CatalogEntry> = {
  skierg: { id: "skierg", name: "SkiErg", kind: "real", rating: "race", requires: [["skierg"]] },
  sled_push: { id: "sled_push", name: "Sled push", kind: "real", rating: "race", requires: [["sled"], ["turf_lane"]] },
  sled_pull: { id: "sled_pull", name: "Sled pull", kind: "real", rating: "race", requires: [["sled"], ["turf_lane"]] },
  burpee_broad_jump: { id: "bbj", name: "Burpee broad jumps", kind: "real", rating: "race", requires: [["open_floor"]] },
  row: { id: "row", name: "Rowing", kind: "real", rating: "race", requires: [["rower"]] },
  farmers_carry: { id: "farmers_kb", name: "Farmers carry (kettlebells)", kind: "real", rating: "race", requires: [["kettlebells"]] },
  sandbag_lunges: { id: "sandbag_lunges", name: "Sandbag lunges", kind: "real", rating: "race", requires: [["sandbag"]] },
  wall_balls: { id: "wall_balls", name: "Wall balls", kind: "real", rating: "race", requires: [["wall_ball"]] },
};

/** Coach-rated substitutes (product owner, 2026-10-15). "Don't use" options are deliberately absent. */
const SUBSTITUTES: Record<HyroxStation, CatalogEntry[]> = {
  sled_push: [
    { id: "treadmill_push", name: "Resisted treadmill pushing", kind: "specific", rating: "best", requires: [["curved_treadmill"]] },
    { id: "plate_push", name: "Pushing heavy plates across turf", kind: "specific", rating: "good", requires: [["plates"], ["turf_lane"]] },
    { id: "walking_lunges", name: "Weighted walking lunges", kind: "support", rating: "good", requires: [["dumbbells", "kettlebells"]] },
    { id: "back_squat", name: "Heavy back squats", kind: "support", rating: "fallback", requires: [["barbell_rack"]] },
    { id: "bulgarian_split_squat", name: "Bulgarian split squats", kind: "support", rating: "fallback", requires: [["dumbbells", "kettlebells"]] },
  ],
  sled_pull: [
    { id: "cable_hand_over_hand", name: "Timed hand-over-hand cable rows", kind: "specific", rating: "good", requires: [["cable_machine"]] },
    { id: "battle_rope_pull", name: "Battle rope pulls", kind: "specific", rating: "good", requires: [["battle_rope"]] },
    { id: "kb_see_saw_row", name: "Kettlebell see-saw rows", kind: "support", rating: "good", requires: [["kettlebells"]] },
    { id: "kb_dl_high_pull", name: "Kettlebell deadlift to high pull", kind: "support", rating: "fallback", requires: [["kettlebells"]] },
    { id: "rdl_rows", name: "Romanian deadlifts + bent-over rows", kind: "support", rating: "fallback", requires: [["barbell_rack", "dumbbells"]] },
    { id: "rowerg_d10", name: "RowErg, damper 10", kind: "specific", rating: "fallback", requires: [["rower"]] },
  ],
  skierg: [
    { id: "straight_arm_pulldown", name: "Straight-arm pulldowns (cable or band)", kind: "support", rating: "good", requires: [] },
    { id: "rower_for_ski", name: "Rower intervals at matched effort", kind: "specific", rating: "fallback", requires: [["rower"]] },
  ],
  row: [
    { id: "bike_for_row", name: "Bike erg at matched effort", kind: "specific", rating: "good", requires: [["bike_erg"]] },
    { id: "ski_for_row", name: "SkiErg at matched effort", kind: "specific", rating: "fallback", requires: [["skierg"]] },
  ],
  burpee_broad_jump: [
    { id: "burpees_plus_broad_jumps", name: "Burpees and broad jumps separately", kind: "specific", rating: "good", requires: [["open_floor"]] },
    { id: "burpee_step_back", name: "Burpee + step-back", kind: "specific", rating: "good", requires: [] },
  ],
  farmers_carry: [
    { id: "farmers_db", name: "Farmers carry (dumbbells)", kind: "specific", rating: "good", requires: [["dumbbells"]] },
    { id: "farmers_trap_bar", name: "Farmers carry (trap bar)", kind: "specific", rating: "good", requires: [["barbell_rack"]] },
    { id: "loaded_holds", name: "Loaded holds", kind: "support", rating: "good", requires: [] },
  ],
  sandbag_lunges: [
    { id: "front_rack_lunges", name: "Dumbbell or kettlebell front-rack lunges", kind: "specific", rating: "good", requires: [["dumbbells", "kettlebells"]] },
  ],
  wall_balls: [
    { id: "thrusters", name: "Dumbbell or kettlebell thrusters", kind: "specific", rating: "good", requires: [["dumbbells", "kettlebells"]] },
  ],
};

export type SessionContext = "race_specific" | "strength";

/** Movements an athlete can ask to avoid at onboarding (data minimisation: no diagnoses). */
export const LIMITATIONS = ["jumping", "deep_knee_bends", "overhead", "heavy_hinging", "running_downhill"] as const;
export type Limitation = (typeof LIMITATIONS)[number];

/** Which options involve each avoidable movement. Plans are flat, so downhill running excludes nothing here. */
const AVOID: Record<Limitation, readonly string[]> = {
  jumping: ["bbj", "burpees_plus_broad_jumps"],
  deep_knee_bends: ["back_squat", "bulgarian_split_squat", "walking_lunges", "front_rack_lunges", "sandbag_lunges", "wall_balls", "thrusters"],
  overhead: ["wall_balls", "thrusters"],
  heavy_hinging: ["rdl_rows", "kb_dl_high_pull"],
  running_downhill: [],
};

/** True when a station or substitute, looked up by its display name, involves an avoided movement. */
export function optionAvoidedByName(name: string, avoid: readonly string[]): boolean {
  const all = [...Object.values(REAL), ...Object.values(SUBSTITUTES).flat()];
  const hit = all.find((o) => o.name === name);
  return hit ? isAvoided(hit.id, avoid) : false;
}

/** The equipment a station or substitute needs, looked up by id or display name (null if unknown). */
export function optionRequirement(idOrName: string): Equipment[][] | null {
  const all = [...Object.values(REAL), ...Object.values(SUBSTITUTES).flat()];
  return all.find((o) => o.id === idOrName || o.name === idOrName)?.requires ?? null;
}

export function isAvoided(optionId: string, avoid: readonly string[]): boolean {
  return avoid.some((a) => (AVOID as Record<string, readonly string[]>)[a]?.includes(optionId));
}

const satisfies = (req: Requirement, have: ReadonlySet<Equipment>): boolean =>
  req.every((group) => group.some((e) => have.has(e)));

const strip = ({ requires: _r, ...o }: CatalogEntry): StationOption => o;

export interface StationResolution {
  recommended: StationOption | null;
  alternatives: StationOption[];
  /** True when the real race station involves a movement the athlete asked to avoid. */
  conflictsWithLimitation: boolean;
}

/**
 * Options the athlete can do for a station, best first.
 * - The real station always wins when available.
 * - In race-specific sessions, race-specific substitutes outrank support substitutes of equal or
 *   better rating (D-003). Concretely for SkiErg: rower first, pulldowns only without a rower.
 * - In strength sessions, the coach rating order applies as-is.
 */
export function resolveStation(
  station: HyroxStation,
  have: ReadonlySet<Equipment>,
  context: SessionContext,
  avoid: readonly string[] = [],
): StationResolution {
  const real = REAL[station];
  const subs = SUBSTITUTES[station].filter((s) => satisfies(s.requires, have) && !isAvoided(s.id, avoid));
  const ordered = subs
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      if (context === "race_specific" && a.s.kind !== b.s.kind) {
        if (a.s.kind === "specific") return -1;
        if (b.s.kind === "specific") return 1;
      }
      return RATING_ORDER[a.s.rating] - RATING_ORDER[b.s.rating] || a.i - b.i;
    })
    .map(({ s }) => strip(s));
  const conflictsWithLimitation = isAvoided(real.id, avoid);
  const all = satisfies(real.requires, have) && !conflictsWithLimitation ? [strip(real), ...ordered] : ordered;
  return { recommended: all[0] ?? null, alternatives: all.slice(1), conflictsWithLimitation };
}

/** Options the coach rated "don't use". Never offered; listed so tests can pin the exclusion. */
export const EXCLUDED_BY_COACH: Record<string, string[]> = {
  sled_push: ["Heavy farmer's carries"],
  skierg: ["Bike erg intervals"],
};

export function catalogFor(station: HyroxStation): readonly StationOption[] {
  return [strip(REAL[station]), ...SUBSTITUTES[station].map(strip)];
}
