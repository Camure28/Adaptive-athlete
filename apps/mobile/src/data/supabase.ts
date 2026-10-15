/**
 * Real backend: Supabase Auth + the schema in supabase/migrations.
 * Client setup follows Supabase's Expo guide (verified 2026-10-15): AsyncStorage session storage,
 * auto refresh, no URL session detection, publishable key.
 * Row-level security means this code can only ever read or write the signed-in athlete's rows.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_ANSWERS, toSavePayload, type Division, type OnboardingAnswers } from "@/onboarding/model";
import type { Equipment, GymType, HyroxLevel, Limitation, Weekday } from "@adaptive-athlete/engine";
import { BackendError, type Account, type Backend } from "./backend";

export class SupabaseBackend implements Backend {
  readonly mode = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, publishableKey: string) {
    this.db = createClient(url, publishableKey, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
  }

  async currentAccount(): Promise<Account | null> {
    const { data } = await this.db.auth.getSession();
    const u = data.session?.user;
    return u ? { userId: u.id, email: u.email ?? "" } : null;
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.db.auth.signUp({ email, password });
    if (error) throw new BackendError(friendly(error.message));
    const u = data.user;
    return {
      account: data.session && u ? { userId: u.id, email: u.email ?? email } : null,
      needsEmailConfirmation: !data.session,
    };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new BackendError(friendly(error?.message ?? "Sign-in failed"));
    return { userId: data.user.id, email: data.user.email ?? email };
  }

  async signOut() {
    await this.db.auth.signOut();
  }

  async saveOnboarding(answers: OnboardingAnswers, today: string) {
    const { error } = await this.db.rpc("save_hyrox_onboarding", { p: toSavePayload(answers, today) });
    if (error) throw new BackendError("Your answers couldn't be saved. Check your connection and try again.");
  }

  async loadOnboarding(): Promise<OnboardingAnswers | null> {
    const [athlete, profile, equipment, limits, goal, results] = await Promise.all([
      this.db.from("athletes").select("units").maybeSingle(),
      this.db.from("hyrox_profiles").select("*").maybeSingle(),
      this.db.from("athlete_equipment").select("equipment"),
      this.db.from("athlete_limitations").select("movement, note"),
      this.db.from("goals").select("*").eq("kind", "hyrox").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      this.db.from("race_results").select("*").order("event_date", { ascending: false }),
    ]);
    const firstError = [athlete, profile, equipment, limits, goal, results].find((r) => r.error)?.error;
    if (firstError) throw new BackendError("Your profile couldn't be loaded. Check your connection and try again.");
    if (!profile.data || !goal.data) return null;

    const run = (results.data ?? []).find((r) => r.kind === "run");
    const hyrox = (results.data ?? []).find((r) => r.kind === "hyrox");
    const benchMeters = run ? Number(run.distance_meters) : null;
    const knownLimits = (limits.data ?? []).filter((l) => l.movement !== "other");
    return {
      ...EMPTY_ANSWERS,
      units: (athlete.data?.units ?? "mi") as "mi" | "km",
      raceDate: usDate(goal.data.event_date),
      division: goal.data.hyrox_division as Division,
      goal: goal.data.target_finish_seconds ? "time" : "finish",
      targetTime: goal.data.target_finish_seconds ? hms(goal.data.target_finish_seconds) : "",
      level: profile.data.level as HyroxLevel,
      pastHyroxTime: hyrox ? hms(hyrox.finish_seconds) : "",
      pastHyroxDate: hyrox ? usDate(hyrox.event_date) : "",
      weeklyRun: String(Math.round((profile.data.weekly_run_meters / ((athlete.data?.units ?? "mi") === "mi" ? 1609.344 : 1000)) * 10) / 10),
      benchmarkDistance: benchMeters === 5000 ? "5k" : benchMeters === 10000 ? "10k" : benchMeters ? "half_marathon" : null,
      benchmarkTime: run ? hms(run.finish_seconds) : "",
      benchmarkDate: run ? usDate(run.event_date) : "",
      days: profile.data.available_days as Weekday[],
      longDay: (profile.data.long_session_day ?? null) as Weekday | null,
      weekdayMinutes: profile.data.max_weekday_minutes,
      weekendMinutes: profile.data.max_weekend_minutes,
      wantsDoubles: profile.data.wants_doubles,
      gymTypes: profile.data.gym_types as GymType[],
      equipment: (equipment.data ?? []).map((e) => e.equipment as Equipment),
      limitations: knownLimits.map((l) => l.movement as Limitation),
      limitationNote: (limits.data ?? []).find((l) => l.note)?.note ?? "",
      consentHealthData: true,
    };
  }
}

const usDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};
const hms = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** Supabase error text → interface voice. Unknown errors get a generic, actionable message. */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match an account.";
  if (/already registered/i.test(message)) return "An account with that email already exists. Sign in instead.";
  if (/password/i.test(message)) return "Use a password with at least 8 characters.";
  if (/email/i.test(message)) return "Enter a valid email address.";
  return "Something went wrong reaching the server. Try again in a moment.";
}
