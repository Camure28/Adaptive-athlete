/**
 * Real backend: Supabase Auth + the schema in supabase/migrations.
 * Client setup follows Supabase's Expo guide (verified 2026-10-15): AsyncStorage session storage,
 * auto refresh, no URL session detection, publishable key.
 * Row-level security means this code can only ever read or write the signed-in athlete's rows.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_ANSWERS, toSavePayload, type Division, type OnboardingAnswers } from "@/onboarding/model";
import { fromLogRow, fromManualLog, planFromRecord, toLogRow, type CompletedWorkout, type Equipment, type GymType, type HyroxGoal, type HyroxLevel, type Limitation, type LogRow, type ManualLog, type StoredReview, type TrainingStatus, type WeekRecord, type Weekday, type WorkoutRow } from "@adaptive-athlete/engine";
import { BackendError, type Account, type Backend, type GymInfo, type HyroxEvent, type LeaderboardProfile, type LeaderboardRow, type LeaderboardScope, type SavedPlan, type SavedReview } from "./backend";

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

  async listEvents(today: string): Promise<HyroxEvent[]> {
    const { data, error } = await this.db
      .from("hyrox_events")
      .select("id, name, city, region, country, venue, start_date, end_date, verified")
      .eq("status", "scheduled")
      .gte("end_date", today)
      .order("start_date");
    if (error) throw new BackendError("The race list couldn't be loaded. You can enter your race date instead.");
    return (data ?? []).map((e) => ({
      id: e.id, name: e.name, city: e.city, region: e.region, country: e.country, venue: e.venue,
      startDate: e.start_date, endDate: e.end_date, verified: e.verified,
    }));
  }

  async exportMyData(): Promise<string> {
    const { data, error } = await this.db.rpc("export_my_data");
    if (error) throw new BackendError("Your data couldn't be exported. Check your connection and try again.");
    return JSON.stringify(data, null, 2);
  }

  async signOut() {
    await this.db.auth.signOut();
  }

  async deleteMyAccount() {
    const { error } = await this.db.rpc("delete_my_account");
    if (error) throw new BackendError("Your account couldn't be deleted. Check your connection and try again.");
    // The account no longer exists on the server, so only clear the session on this phone.
    await this.db.auth.signOut({ scope: "local" });
  }

  async saveOnboarding(answers: OnboardingAnswers, today: string) {
    const { error } = await this.db.rpc("save_hyrox_onboarding", { p: toSavePayload(answers, today) });
    if (error) throw new BackendError("Your answers couldn't be saved. Check your connection and try again.");
  }

  /** Calls an Edge Function. They explain failures they understand (e.g. "At least 3 training days…") as { error }. */
  private async invoke<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
    const { data, error } = await this.db.functions.invoke(name, { body });
    if (!error) return data as T;
    let message = fallback;
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      const reply = (await response.json().catch(() => null)) as { error?: unknown } | null;
      if (typeof reply?.error === "string") message = reply.error;
    }
    throw new BackendError(message);
  }

  async buildPlan(today: string) {
    await this.invoke("generate-plan", { today }, "Your plan couldn't be built. Check your connection and try again.");
  }

  async adaptPlan(today: string): Promise<SavedReview> {
    const r = await this.invoke<{ version: number; changed: boolean; review: StoredReview }>(
      "adapt-plan", { today }, "Your plan couldn't be updated. Check your connection and try again.",
    );
    return { review: r.review, createdAt: new Date().toISOString(), toVersion: r.changed ? r.version : null };
  }

  // ---- Leaderboard (D-029) ------------------------------------------------------------------

  async loadLeaderboardProfile(): Promise<LeaderboardProfile | null> {
    const failed = new BackendError("The leaderboard couldn't be loaded. Check your connection and try again.");
    const [profile, gym] = await Promise.all([
      this.db.from("leaderboard_profiles").select("nickname, opted_in").maybeSingle(),
      this.db.from("gyms").select("id, name, join_code").maybeSingle(),
    ]);
    if (profile.error || gym.error) throw failed;
    if (!profile.data) return null;
    return {
      nickname: profile.data.nickname,
      optedIn: profile.data.opted_in,
      gym: gym.data ? { id: gym.data.id, name: gym.data.name, joinCode: gym.data.join_code } : null,
    };
  }

  async saveLeaderboardProfile(p: { nickname: string; optedIn: boolean }) {
    const nickname = p.nickname.trim();
    const existing = await this.db.from("leaderboard_profiles").select("athlete_id").maybeSingle();
    if (existing.error) throw new BackendError("Your leaderboard settings couldn't be saved. Try again.");
    let error;
    if (existing.data) {
      ({ error } = await this.db.from("leaderboard_profiles").update({ nickname, opted_in: p.optedIn }).eq("athlete_id", existing.data.athlete_id));
    } else {
      const athlete = await this.db.from("athletes").select("id").single();
      if (athlete.error) throw new BackendError("Finish setting up your plan first.");
      ({ error } = await this.db.from("leaderboard_profiles").insert({ athlete_id: athlete.data.id, nickname, opted_in: p.optedIn }));
    }
    if (error) {
      if (error.code === "23505") throw new BackendError("That nickname is taken. Try another.");
      if (error.code === "23514") throw new BackendError("Use 2 to 24 letters, numbers, spaces, dots, dashes or underscores, starting with a letter or number.");
      throw new BackendError("Your leaderboard settings couldn't be saved. Try again.");
    }
  }

  private async gymCall(name: "create_gym" | "join_gym", args: Record<string, string>): Promise<GymInfo> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw new BackendError(error.code === "P0001" ? error.message : "That didn't work. Check your connection and try again.");
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; name: string; join_code: string } | undefined;
    if (!row) throw new BackendError("That didn't work. Try again.");
    return { id: row.id, name: row.name, joinCode: row.join_code };
  }
  createGym(name: string) {
    return this.gymCall("create_gym", { p_name: name.trim() });
  }
  joinGym(code: string) {
    return this.gymCall("join_gym", { p_code: code.trim() });
  }
  async leaveGym() {
    const { error } = await this.db.rpc("leave_gym");
    if (error) throw new BackendError("You couldn't leave the gym. Try again.");
  }

  async leaderboard(scope: LeaderboardScope, days: 7 | 28, today: string): Promise<LeaderboardRow[]> {
    const { data, error } = await this.db.rpc("leaderboard", { p_scope: scope, p_days: days, p_today: today });
    if (error) throw new BackendError(error.code === "P0001" ? error.message : "The leaderboard couldn't be loaded. Check your connection and try again.");
    return ((data ?? []) as { rank: number; nickname: string; completion_pct: number | null; days_trained: number; sessions_logged: number; is_me: boolean }[]).map((r) => ({
      rank: r.rank,
      nickname: r.nickname,
      completionPct: r.completion_pct,
      daysTrained: r.days_trained,
      sessionsLogged: r.sessions_logged,
      isMe: r.is_me,
    }));
  }

  async latestReview(): Promise<SavedReview | null> {
    const { data, error } = await this.db.from("plan_reviews").select("review, created_at, to_version").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new BackendError("Your review couldn't be loaded. Check your connection and try again.");
    return data ? { review: data.review as StoredReview, createdAt: data.created_at, toVersion: data.to_version } : null;
  }

  async answerQuestion(questionId: string, value: string, today: string) {
    const failed = new BackendError("Your answer couldn't be saved. Check your connection and try again.");
    const athlete = await this.db.from("athletes").select("id").single();
    if (athlete.error) throw failed;
    // Q-1 asks for a missing effort score: it belongs on that session's log, where the rules read it.
    const logId = questionId.startsWith("Q-1.") ? questionId.slice(4) : null;
    if (logId) {
      const { error } = await this.db.from("completed_workouts").update({ rpe: Number(value) }).eq("id", logId);
      if (error) throw failed;
    }
    const { error } = await this.db.from("athlete_answers").insert({ athlete_id: athlete.data.id, question_id: questionId, value, answered_on: today });
    if (error) throw failed;
  }

  async loadPlan(): Promise<SavedPlan | null> {
    const failed = new BackendError("Your plan couldn't be loaded. Check your connection and try again.");
    const plan = await this.db
      .from("training_plans")
      .select("id, athlete_id, current_version")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plan.error) throw failed;
    if (!plan.data) return null;
    const version = await this.db
      .from("plan_versions")
      .select("id, version, created_at, basis, weeks, inputs")
      .eq("plan_id", plan.data.id)
      .eq("version", plan.data.current_version)
      .single();
    if (version.error) throw failed;
    const rows = await this.db
      .from("planned_workouts")
      .select("workout_key, scheduled_date, position, sport, session_type, title, estimated_minutes, planned_meters, planned_load, adapted_by_rule, body")
      .eq("plan_version_id", version.data.id);
    if (rows.error) throw failed;
    return {
      version: version.data.version,
      savedAt: version.data.created_at,
      plan: planFromRecord({
        planId: plan.data.id,
        athleteId: plan.data.athlete_id,
        version: version.data.version,
        createdAt: version.data.created_at,
        goal: (version.data.inputs as { goal: HyroxGoal }).goal,
        basis: version.data.basis,
        weeks: version.data.weeks as WeekRecord[],
        workouts: rows.data as WorkoutRow[],
      }),
    };
  }

  async listLogs(planId: string): Promise<CompletedWorkout[]> {
    const { data, error } = await this.db.from("completed_workouts").select("*").eq("plan_id", planId);
    if (error) throw new BackendError("Your logged sessions couldn't be loaded. Check your connection and try again.");
    return (data as (LogRow & { id: string })[]).map(fromLogRow);
  }

  async listRecentLogs(since: string): Promise<CompletedWorkout[]> {
    const { data, error } = await this.db.from("completed_workouts").select("*").gte("workout_date", since)
      .order("workout_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw new BackendError("Your workouts couldn't be loaded. Check your connection and try again.");
    return (data as (LogRow & { id: string })[]).map(fromLogRow);
  }

  async saveLog(log: ManualLog, existingId: string | null): Promise<CompletedWorkout> {
    const failed = new BackendError("Your log couldn't be saved. Check your connection and try again.");
    const athlete = await this.db.from("athletes").select("id").single();
    if (athlete.error) throw failed;
    const row = toLogRow(fromManualLog(log, existingId ?? ""), athlete.data.id);
    const saved = existingId
      ? await this.db.from("completed_workouts").update(row).eq("id", existingId).select("*").single()
      : await this.db.from("completed_workouts").insert(row).select("*").single();
    if (saved.error) throw failed;
    return fromLogRow(saved.data as LogRow & { id: string });
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

    let eventLabel = "";
    const run = (results.data ?? []).find((r) => r.kind === "run");
    const hyrox = (results.data ?? []).find((r) => r.kind === "hyrox");
    const benchMeters = run ? Number(run.distance_meters) : null;
    const knownLimits = (limits.data ?? []).filter((l) => l.movement !== "other");
    if (goal.data.hyrox_event_id) {
      const ev = await this.db.from("hyrox_events").select("name, start_date, end_date").eq("id", goal.data.hyrox_event_id).maybeSingle();
      if (ev.data) eventLabel = ev.data.name;
    }
    return {
      ...EMPTY_ANSWERS,
      eventLabel,
      units: (athlete.data?.units ?? "mi") as "mi" | "km",
      raceDate: usDate(goal.data.event_date),
      division: goal.data.hyrox_division as Division,
      goal: goal.data.target_finish_seconds ? "time" : "finish",
      targetTime: goal.data.target_finish_seconds ? hms(goal.data.target_finish_seconds) : "",
      eventId: goal.data.hyrox_event_id ?? null,
      level: profile.data.level as HyroxLevel,
      trainingStatus: (profile.data.training_status ?? null) as TrainingStatus | null,
      pastHyroxTime: hyrox ? hms(hyrox.finish_seconds) : "",
      pastHyroxDate: hyrox ? usDate(hyrox.event_date) : "",
      ...splitsFrom(hyrox?.splits),
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

function splitsFrom(splits: unknown): Pick<OnboardingAnswers, "pastRunSplits" | "pastStationSplits"> {
  const sp = (splits ?? {}) as { runs?: (number | null)[]; stations?: Record<string, number> };
  return {
    pastRunSplits: Array.from({ length: 8 }, (_, i) => (sp.runs?.[i] ? hms(sp.runs[i]!) : "")),
    pastStationSplits: Object.fromEntries(Object.entries(sp.stations ?? {}).map(([k, v]) => [k, hms(v)])),
  };
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
  if (/email not confirmed/i.test(message)) return "Confirm your email first: tap the link we sent you, then sign in.";
  if (/already registered/i.test(message)) return "An account with that email already exists. Sign in instead.";
  if (/password/i.test(message)) return "Use a password with at least 8 characters.";
  if (/email/i.test(message)) return "Enter a valid email address.";
  return "Something went wrong reaching the server. Try again in a moment.";
}
