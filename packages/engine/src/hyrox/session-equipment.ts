/**
 * What a session needs: the equipment for each movement and for the whole session, so the app
 * can show an equipment row and an icon per movement (D-030). Picks the athlete's own equipment
 * where a movement can use several things (dumbbells or kettlebells).
 */
import type { PlannedWorkout, WorkoutStep } from "../types.js";
import { optionRequirement, type Equipment } from "./equipment.js";
import { strengthItemEquipment } from "./strength.js";

/** An equipment id, or "bodyweight" for movements that need nothing. */
export type MovementGear = Equipment | "bodyweight";

/** Lanes and floor space aren't things you fetch, so they don't appear in the equipment row. */
const NOT_SHOWN: ReadonlySet<Equipment> = new Set<Equipment>(["turf_lane"]);

function pick(group: readonly Equipment[], have: ReadonlySet<Equipment>): Equipment | undefined {
  return group.find((e) => have.has(e)) ?? group[0];
}

const isRun = (s: WorkoutStep) => !s.station && !s.exercise;

/** The equipment one step uses, most characteristic first. */
export function stepGear(step: WorkoutStep, have: ReadonlySet<Equipment>): MovementGear[] {
  if (step.station) {
    const opt = step.station.recommended;
    if (!opt) return [];
    const req = optionRequirement(opt.id) ?? [];
    const gear = req.map((g) => pick(g, have)).filter((e): e is Equipment => !!e && !NOT_SHOWN.has(e));
    return gear.length ? gear : ["bodyweight"];
  }
  if (step.exercise) {
    const own = strengthItemEquipment(step.exercise.name);
    if (own) return own.length ? [pick(own, have)!] : ["bodyweight"];
    const req = optionRequirement(step.exercise.name);
    if (req) {
      const gear = req.map((g) => pick(g, have)).filter((e): e is Equipment => !!e && !NOT_SHOWN.has(e));
      return gear.length ? gear : ["bodyweight"];
    }
    return ["bodyweight"];
  }
  if (step.kind === "recovery") return [];
  return [have.has("outdoor_run") || !have.has("treadmill") ? "outdoor_run" : "treadmill"];
}

/** Everything the session uses, in the order it first appears, without duplicates. */
export function sessionEquipment(w: PlannedWorkout, have: ReadonlySet<Equipment>): MovementGear[] {
  if (w.type === "rest") return [];
  const out: MovementGear[] = [];
  for (const s of w.steps) for (const g of stepGear(s, have)) if (!out.includes(g)) out.push(g);
  // Only show "bodyweight" when nothing else is needed.
  return out.length > 1 ? out.filter((g) => g !== "bodyweight") : out;
}

export { isRun as isRunStep };
