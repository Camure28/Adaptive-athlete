/**
 * HYROX strength days (Layer 3). Two complementary days so a week never repeats a session:
 *   A — legs & push: squat pattern, single-leg, upper push, trunk (anti-extension)
 *   B — hinge & pull: hinge, row, straight-arm pulldown, carry, trunk (anti-rotation)
 * Exercises rotate every 3-week block, so main lifts stay long enough to progress (progressive
 * overload) while the athlete still gets variety across the plan. Rep schemes follow the phase.
 *
 * Station-linked slots (squat, row, pulldown, carry) draw on the coach-rated catalog in
 * equipment.ts so ratings and limitations stay in one place. ENGINE ASSUMPTION: the other
 * exercise lists and rep schemes below are Claude's defaults awaiting coach review.
 */
import type { Phase } from "../types.js";
import { isAvoided, resolveStation, type Equipment, type Limitation } from "./equipment.js";

export type StrengthDay = "A" | "B";

interface Exercise {
  name: string;
  /** Any one of these is enough; empty = bodyweight or band. */
  anyOf?: Equipment[];
  avoidIf?: Limitation[];
}

const SINGLE_LEG: Exercise[] = [
  { name: "Dumbbell or kettlebell front-rack lunges", anyOf: ["dumbbells", "kettlebells"], avoidIf: ["deep_knee_bends"] },
  { name: "Step-ups", avoidIf: ["deep_knee_bends"] },
  { name: "Reverse lunges", avoidIf: ["deep_knee_bends"] },
];
const PUSH: Exercise[] = [
  { name: "Push-ups" },
  { name: "Dumbbell bench press", anyOf: ["dumbbells"] },
  { name: "Dumbbell push press", anyOf: ["dumbbells", "kettlebells"], avoidIf: ["overhead"] },
];
const CORE_A: Exercise[] = [{ name: "Dead bugs" }, { name: "Front plank" }, { name: "Hollow holds" }];
const HINGE: Exercise[] = [
  { name: "Romanian deadlifts", anyOf: ["barbell_rack", "dumbbells"], avoidIf: ["heavy_hinging"] },
  { name: "Kettlebell deadlifts", anyOf: ["kettlebells"], avoidIf: ["heavy_hinging"] },
  { name: "Single-leg Romanian deadlifts", avoidIf: ["heavy_hinging"] },
];
const HINGE_SAFE: Exercise[] = [{ name: "Glute bridges" }, { name: "Hip thrusts" }];
const ROW_EXTRA: Exercise[] = [
  { name: "Single-arm dumbbell rows", anyOf: ["dumbbells"] },
  { name: "Band rows" },
];
const CORE_B: Exercise[] = [{ name: "Side planks" }, { name: "Pallof press (cable or band)" }, { name: "Bird dogs" }];

export interface StrengthItem {
  name: string;
  prescription: string;
}

export interface StrengthInput {
  day: StrengthDay;
  /** Week index in the plan; exercises rotate every 3 weeks. */
  week: number;
  phase: Phase;
  equipment: readonly Equipment[];
  avoid: readonly string[];
}

const BLOCK_WEEKS = 3;

/** Main-lift sets × reps by phase: volume early, heavier as the race nears, light in the taper. */
const MAIN: Record<Phase, string> = { base: "3 × 10, controlled tempo", build: "4 × 6, heavy", peak: "3 × 5, heavy and fast", taper: "2 × 5, moderate" };
const ACCESSORY: Record<Phase, string> = { base: "3 × 12", build: "3 × 10", peak: "3 × 8", taper: "2 × 8" };
const CORE: Record<Phase, string> = { base: "3 × 30 s", build: "3 × 40 s", peak: "3 × 45 s", taper: "2 × 30 s" };
const CARRY: Record<Phase, string> = { base: "3 × 40 m", build: "4 × 50 m, heavy", peak: "4 × 50 m, race load", taper: "2 × 40 m" };

export function strengthItems(input: StrengthInput): StrengthItem[] {
  const have = new Set(input.equipment);
  const block = Math.floor(input.week / BLOCK_WEEKS);
  const usable = (xs: Exercise[]) =>
    xs.filter((x) => (!x.anyOf || x.anyOf.some((e) => have.has(e))) && !(x.avoidIf ?? []).some((a) => input.avoid.includes(a)));
  const pick = <T>(xs: T[], offset = 0): T | undefined => (xs.length ? xs[(block + offset) % xs.length] : undefined);
  const support = (station: "sled_push" | "sled_pull" | "skierg" | "farmers_carry"): string[] => {
    const { recommended, alternatives } = resolveStation(station, have, "strength", input.avoid);
    const opts = [recommended, ...alternatives].filter((o) => o !== null);
    // Squat, row and pulldown slots use strength-support options; carries may use any carry option.
    return opts.filter((o) => station === "farmers_carry" || o.kind === "support").filter((o) => !isAvoided(o.id, input.avoid)).map((o) => o.name);
  };
  const items: StrengthItem[] = [];
  const add = (name: string | undefined, prescription: string) => {
    if (name && !items.some((i) => i.name === name)) items.push({ name, prescription });
  };

  if (input.day === "A") {
    const squat = support("sled_push");
    add(pick(squat) ?? (input.avoid.includes("deep_knee_bends") ? "Hamstring bridges" : "Bodyweight split squats"), MAIN[input.phase]);
    const single = usable(SINGLE_LEG).map((x) => x.name).filter((n) => !items.some((i) => i.name === n));
    add(pick(single, 1) ?? "Single-leg glute bridges", ACCESSORY[input.phase]);
    add(pick(usable(PUSH).map((x) => x.name)), ACCESSORY[input.phase]);
    add(pick(CORE_A.map((x) => x.name)), CORE[input.phase]);
  } else {
    const hinge = usable(HINGE).map((x) => x.name);
    add(pick(hinge.length ? hinge : HINGE_SAFE.map((x) => x.name)), MAIN[input.phase]);
    const rows = [...support("sled_pull").filter((n) => !/Romanian/.test(n)), ...usable(ROW_EXTRA).map((x) => x.name)];
    add(pick(rows), ACCESSORY[input.phase]);
    add(support("skierg")[0] ?? "Band pulldowns", ACCESSORY[input.phase]);
    add(pick(support("farmers_carry")), CARRY[input.phase]);
    add(pick(CORE_B.map((x) => x.name)), CORE[input.phase]);
  }
  return items;
}
