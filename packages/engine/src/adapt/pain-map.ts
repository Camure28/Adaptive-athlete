/**
 * Pain area → movements to remove (rubric S-1). Approved by the product owner 2026-10-16 (D-024).
 * Areas, never diagnoses: the engine does not name injuries.
 */
import type { Limitation } from "../hyrox/equipment.js";
import type { BodyArea, PainReport } from "../types.js";

export interface AreaRule {
  /** Movements removed from sessions for 7 days. */
  avoid: Limitation[];
  /** Running in the 7-day window becomes easy only (hard runs → easy run). */
  easyRunningOnly: boolean;
  label: string;
}

export const PAIN_AREA_MAP: Readonly<Record<BodyArea, AreaRule>> = {
  knee: { avoid: ["deep_knee_bends", "jumping", "running_downhill"], easyRunningOnly: false, label: "knee" },
  lower_back_hip: { avoid: ["heavy_hinging"], easyRunningOnly: false, label: "lower back or hip" },
  shoulder_arm: { avoid: ["overhead"], easyRunningOnly: false, label: "shoulder, elbow or wrist" },
  foot_ankle_lower_leg: { avoid: ["jumping"], easyRunningOnly: true, label: "foot, ankle, shin or calf" },
  // Unknown area: no movement list; the engine asks the athlete instead of guessing.
  other: { avoid: [], easyRunningOnly: false, label: "the reported area" },
};

const WORDS: ReadonlyArray<[RegExp, BodyArea]> = [
  [/knee|patell|kneecap/i, "knee"],
  [/back|hip|glute|groin|si joint/i, "lower_back_hip"],
  [/shoulder|elbow|wrist|arm|hand|forearm/i, "shoulder_arm"],
  [/foot|feet|ankle|shin|calf|calves|achilles|heel|toe|arch/i, "foot_ankle_lower_leg"],
];

/** The chosen area, or the first match in the athlete's own words, else "other". */
export function painArea(p: PainReport): BodyArea {
  if (p.area) return p.area;
  const text = p.location ?? "";
  return WORDS.find(([re]) => re.test(text))?.[1] ?? "other";
}
