import { METERS_PER_MILE, formatDuration } from "@adaptive-athlete/engine";
import type { Units } from "@/onboarding/model";

export function distance(meters: number, units: Units): string {
  if (units === "mi") return `${(meters / METERS_PER_MILE).toFixed(meters < 16093 ? 1 : 0)} mi`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

/** Engine paces are sec/km; show per mile or per km. */
export function pace(secPerKm: number, units: Units): string {
  const s = units === "mi" ? secPerKm * (METERS_PER_MILE / 1000) : secPerKm;
  return `${formatDuration(s)}/${units}`;
}

/** "9:02–9:57/mi" — one unit suffix for the whole range so it doesn't wrap mid-range. */
export function paceRange(fastSecPerKm: number, slowSecPerKm: number, units: Units): string {
  const k = units === "mi" ? METERS_PER_MILE / 1000 : 1;
  return `${formatDuration(fastSecPerKm * k)}–${formatDuration(slowSecPerKm * k)}/${units}`;
}

export const minutes = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY[(d.getUTCDay() + 6) % 7]} ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
