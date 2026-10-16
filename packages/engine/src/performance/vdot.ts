/**
 * Race-based fitness estimation using the Daniels–Gilbert equations (Daniels' Running Formula).
 *
 *   VO2(v)   = -4.60 + 0.182258·v + 0.000104·v²            (v in m/min)
 *   %max(t)  = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)   (t in min)
 *   VDOT     = VO2(v) / %max(t)
 *
 * "VDOT" here is a performance index, not a lab VO2max. It is labelled `calculated` when derived
 * from an official race and `estimated` otherwise. It is never shown as a measured value.
 */

import type { PaceRange, RaceResult, Tracked, TrainingPaces, IsoDate } from "../types.js";
import { daysBetween } from "../units/units.js";

export function vo2AtVelocity(metersPerMinute: number): number {
  return -4.6 + 0.182258 * metersPerMinute + 0.000104 * metersPerMinute ** 2;
}

export function fractionOfMaxSustainable(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

export function vdotFromPerformance(distanceMeters: number, seconds: number): number {
  if (distanceMeters <= 0 || seconds <= 0) throw new RangeError("distance and time must be positive");
  const minutes = seconds / 60;
  return vo2AtVelocity(distanceMeters / minutes) / fractionOfMaxSustainable(minutes);
}

/** Inverse of vo2AtVelocity: velocity (m/min) that costs the given VO2. */
export function velocityAtVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Predicted equivalent race time for a distance at a given VDOT (bisection, monotonic). */
export function predictRaceSeconds(vdot: number, distanceMeters: number): number {
  let lo = 60;
  let hi = 60 * 60 * 10;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    // Faster time → higher VDOT. If mid gives VDOT above target, the athlete would be slower: raise lo.
    if (vdotFromPerformance(distanceMeters, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const paceAtFraction = (vdot: number, fraction: number): number => {
  const v = velocityAtVo2(vdot * fraction); // m/min
  return 60_000 / v; // sec/km
};

const range = (vdot: number, slowFraction: number, fastFraction: number): PaceRange => ({
  fastSecPerKm: paceAtFraction(vdot, fastFraction),
  slowSecPerKm: paceAtFraction(vdot, slowFraction),
});

/**
 * Training paces as fractions of VDOT. These approximate published Daniels tables
 * (verified in tests to within a few seconds/km at representative VDOTs).
 * Marathon pace uses the equivalent-performance prediction rather than a fixed fraction.
 */
export function trainingPaces(vdot: number): TrainingPaces {
  const mp = predictRaceSeconds(vdot, 42195) / 42.195;
  return {
    easy: range(vdot, 0.62, 0.7),
    marathon: { fastSecPerKm: mp - 3, slowSecPerKm: mp + 5 },
    threshold: range(vdot, 0.86, 0.88),
    interval: range(vdot, 0.975, 1.0),
    repetition: range(vdot, 1.06, 1.09),
  };
}

// ---- Plausibility --------------------------------------------------------------------------

/**
 * Average speeds no real result can have. World records average about 6.6 m/s over 5K and
 * 5.8 m/s over the marathon; 0.9 m/s is slower than an easy walk. A time outside this range is
 * almost always a typing slip, usually h:mm entered as mm:ss ("1:45" read as 1 min 45 s).
 */
export const MAX_RACE_SPEED_MPS = 6.7;
export const MIN_RACE_SPEED_MPS = 0.9;

/** Why a result can't be real, or null when it's plausible. */
export function implausibleRaceTime(distanceMeters: number, seconds: number): "too_fast" | "too_slow" | null {
  if (!(distanceMeters > 0) || !(seconds > 0)) return "too_fast";
  const v = distanceMeters / seconds;
  if (v > MAX_RACE_SPEED_MPS) return "too_fast";
  if (v < MIN_RACE_SPEED_MPS) return "too_slow";
  return null;
}

// ---- Confidence -----------------------------------------------------------------------------

export interface RaceAssessment {
  race: RaceResult;
  vdot: number;
  confidence: number;
  reasons: string[];
}

/**
 * How much a race result should be trusted as a current fitness indicator.
 * Factors: recency, timing method, distance (very short/long races are noisier), and conditions.
 */
export function assessRace(race: RaceResult, today: IsoDate): RaceAssessment {
  const reasons: string[] = [];
  let confidence = 1;

  const ageDays = daysBetween(race.date, today);
  if (ageDays < 0) throw new RangeError(`Race ${race.id} is dated in the future`);
  if (ageDays > 56) {
    // Linear decay from 8 weeks to ~0.2 at 1 year.
    const decay = Math.max(0.2, 1 - ((ageDays - 56) / (365 - 56)) * 0.8);
    confidence *= decay;
    reasons.push(`Race was ${Math.round(ageDays / 7)} weeks ago`);
  }

  if (race.timing === "self_reported") {
    confidence *= 0.8;
    reasons.push("Self-reported time");
  } else if (race.timing === "device") {
    confidence *= 0.9;
    reasons.push("Watch-timed, not official");
  }

  if (race.distanceMeters < 3000 || race.distanceMeters > 43000) {
    confidence *= 0.7;
    reasons.push("Distance outside the formula's most reliable range");
  }

  const c = race.conditions ?? {};
  if (c.trail || (c.elevationGainMeters ?? 0) > race.distanceMeters * 0.01) {
    confidence *= 0.5;
    reasons.push("Trail or hilly course understates road fitness");
  }
  if (c.hot) {
    confidence *= 0.85;
    reasons.push("Hot conditions");
  }
  if (c.notAllOut) {
    confidence *= 0.5;
    reasons.push("Not an all-out effort");
  }

  const impossible = implausibleRaceTime(race.distanceMeters, race.finishSeconds);
  if (impossible) {
    // Never set paces from a result that can't be real; the plan stays effort-based instead.
    confidence = 0;
    reasons.push(impossible === "too_fast" ? "Time is faster than the world record for this distance" : "Time is slower than walking pace");
  }

  return {
    race,
    vdot: vdotFromPerformance(race.distanceMeters, race.finishSeconds),
    confidence: Math.max(0, Math.min(1, confidence)),
    reasons,
  };
}

export const MIN_VDOT_CONFIDENCE = 0.35;

/**
 * Select the athlete's current VDOT from race history.
 * Uses the highest-confidence-weighted result; returns null when nothing is trustworthy enough,
 * in which case plans fall back to RPE-based targets and the athlete is asked for a benchmark.
 */
export function currentVdot(races: RaceResult[], today: IsoDate): Tracked<number> | null {
  const assessed = races
    .filter((r) => r.date <= today)
    .map((r) => assessRace(r, today))
    .filter((a) => a.confidence >= MIN_VDOT_CONFIDENCE);
  if (assessed.length === 0) return null;

  // Rank by confidence first; break near-ties (within 0.1) by the higher VDOT, since a poor day
  // understates fitness more often than a good day overstates it.
  assessed.sort((a, b) =>
    Math.abs(a.confidence - b.confidence) > 0.1 ? b.confidence - a.confidence : b.vdot - a.vdot,
  );
  const best = assessed[0]!;
  const official = best.race.timing === "official";
  return {
    value: Math.round(best.vdot * 10) / 10,
    provenance: {
      source: "engine",
      kind: official && best.confidence >= 0.7 ? "calculated" : "estimated",
      confidence: Math.round(best.confidence * 100) / 100,
      observedAt: best.race.date,
      note: [`From ${(best.race.distanceMeters / 1000).toFixed(1)} km race on ${best.race.date}`, ...best.reasons].join(
        "; ",
      ),
    },
  };
}
