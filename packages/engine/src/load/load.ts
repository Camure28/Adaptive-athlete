/**
 * Training-load metrics. Every function returns `null` (with a reason) when the data is
 * insufficient, rather than a misleading number.
 *
 * - Session load: Foster's session-RPE method (duration in minutes × CR-10 RPE).
 * - Acute:chronic ratio: 7-day vs 28-day mean daily load. Used only as one supporting signal;
 *   the research on ACWR as an injury predictor is contested, so it never triggers changes alone
 *   except at an extreme threshold. See docs/ADAPTATION_ENGINE.md.
 * - Monotony & strain: Foster (1998). Mean daily load / SD of daily load over 7 days.
 */

import type { CompletedWorkout, IsoDate } from "../types.js";
import { addDays, daysBetween } from "../units/units.js";

export type Insufficient = { ok: false; reason: string };
export type Sufficient<T> = { ok: true; value: T; daysOfData: number };
export type Result<T> = Sufficient<T> | Insufficient;

export function sessionLoad(w: CompletedWorkout): number | null {
  if (w.status === "skipped") return 0;
  if (w.durationSeconds == null || w.rpe == null) return null;
  return (w.durationSeconds / 60) * w.rpe;
}

/** Daily loads for the `days` days ending on `endDate` (inclusive). Unknown loads are null. */
export function dailyLoads(workouts: CompletedWorkout[], endDate: IsoDate, days: number): (number | null)[] {
  const start = addDays(endDate, -(days - 1));
  const out: (number | null)[] = new Array(days).fill(0);
  for (const w of workouts) {
    const idx = daysBetween(start, w.date);
    if (idx < 0 || idx >= days) continue;
    const l = sessionLoad(w);
    const cur = out[idx];
    out[idx] = l == null || cur == null ? null : cur + l;
  }
  return out;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Requires history reaching back the full chronic window and ≤ 20% unknown-load days. */
export function acuteChronicRatio(workouts: CompletedWorkout[], today: IsoDate): Result<number> {
  if (workouts.length === 0) return { ok: false, reason: "No training history" };
  const earliest = workouts.reduce((min, w) => (w.date < min ? w.date : min), today);
  const historyDays = daysBetween(earliest, today) + 1;
  if (historyDays < 28) return { ok: false, reason: `Only ${historyDays} days of history; 28 required` };

  const loads = dailyLoads(workouts, today, 28);
  const unknown = loads.filter((l) => l == null).length;
  if (unknown / 28 > 0.2) {
    return { ok: false, reason: `${unknown} of 28 days missing duration or RPE` };
  }
  const known = loads.map((l) => l ?? 0);
  const chronic = mean(known);
  if (chronic === 0) return { ok: false, reason: "No load in chronic window" };
  const acute = mean(known.slice(-7));
  return { ok: true, value: acute / chronic, daysOfData: 28 - unknown };
}

export function monotony(workouts: CompletedWorkout[], today: IsoDate): Result<{ monotony: number; strain: number }> {
  const loads = dailyLoads(workouts, today, 7);
  if (loads.some((l) => l == null)) return { ok: false, reason: "A day in the last week is missing duration or RPE" };
  const xs = loads as number[];
  const m = mean(xs);
  if (m === 0) return { ok: false, reason: "No load in the last 7 days" };
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  // A perfectly uniform week has SD 0; cap rather than divide by zero.
  const mono = sd === 0 ? 10 : Math.min(10, m / sd);
  return { ok: true, value: { monotony: mono, strain: m * 7 * mono }, daysOfData: 7 };
}

export function weeklyRunMeters(workouts: CompletedWorkout[], weekStart: IsoDate): number {
  const end = addDays(weekStart, 6);
  return workouts
    .filter((w) => (w.sport === "run" || w.sport === "trail_run") && w.date >= weekStart && w.date <= end)
    .reduce((sum, w) => sum + (w.status === "skipped" ? 0 : (w.distanceMeters ?? 0)), 0);
}
