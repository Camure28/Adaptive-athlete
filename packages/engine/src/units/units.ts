/** Unit conversions and date helpers. Pure functions, no time-zone magic: planning uses calendar dates. */

import type { IsoDate } from "../types.js";

export const METERS_PER_MILE = 1609.344;

export const milesToMeters = (mi: number): number => mi * METERS_PER_MILE;
export const metersToMiles = (m: number): number => m / METERS_PER_MILE;
export const kmToMeters = (km: number): number => km * 1000;

/** Seconds per km → seconds per mile. */
export const secPerKmToSecPerMile = (s: number): number => s * (METERS_PER_MILE / 1000);
export const secPerMileToSecPerKm = (s: number): number => s / (METERS_PER_MILE / 1000);

export const paceSecPerKm = (distanceMeters: number, durationSeconds: number): number => {
  if (distanceMeters <= 0 || durationSeconds <= 0) {
    throw new RangeError("distance and duration must be positive");
  }
  return durationSeconds / (distanceMeters / 1000);
};

/** Parse "h:mm:ss", "mm:ss" or "ss" into seconds. Throws on malformed input. */
export function parseDuration(text: string): number {
  const trimmed = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(trimmed)) {
    throw new RangeError(`Invalid duration: "${text}"`);
  }
  const parts = trimmed.split(":").map(Number);
  for (let i = 1; i < parts.length; i++) {
    if ((parts[i] ?? 0) >= 60) throw new RangeError(`Invalid duration: "${text}"`);
  }
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatPace(secPerKm: number, unit: "km" | "mi" = "km"): string {
  const s = unit === "km" ? secPerKm : secPerKmToSecPerMile(secPerKm);
  return `${formatDuration(s)}/${unit}`;
}

// ---- Calendar dates (UTC arithmetic on date-only values avoids DST bugs) -------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toUtcDate(d: IsoDate): Date {
  if (!DATE_RE.test(d)) throw new RangeError(`Invalid ISO date: "${d}"`);
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== d) {
    throw new RangeError(`Invalid ISO date: "${d}"`);
  }
  return date;
}

export const fromUtcDate = (d: Date): IsoDate => d.toISOString().slice(0, 10);

export function addDays(d: IsoDate, days: number): IsoDate {
  const date = toUtcDate(d);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(d: IsoDate): number {
  return (toUtcDate(d).getUTCDay() + 6) % 7;
}

export function startOfWeek(d: IsoDate): IsoDate {
  return addDays(d, -weekdayOf(d));
}
