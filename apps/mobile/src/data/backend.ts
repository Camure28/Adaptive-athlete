/**
 * The app talks to storage only through this interface.
 * - SupabaseBackend: real accounts and storage, used when EXPO_PUBLIC_SUPABASE_URL is set.
 * - DemoBackend: in-memory, nothing leaves the device or survives a reload. Used only when no
 *   Supabase project is configured; the UI shows a permanent "Demo mode" banner.
 */
import type { CompletedWorkout, ManualLog, StoredReview, TrainingPlan } from "@adaptive-athlete/engine";
import type { OnboardingAnswers } from "@/onboarding/model";

export interface Account {
  userId: string;
  email: string;
}

/** An upcoming HYROX race from our hand-maintained list (docs/INTEGRATIONS.md). */
export interface HyroxEvent {
  id: string;
  name: string;
  city: string;
  region: string | null;
  country: string;
  venue: string | null;
  startDate: string; // ISO
  endDate: string; // ISO
  verified: boolean;
}

/** The athlete's current saved plan version (D-022). */
export interface SavedPlan {
  plan: TrainingPlan;
  version: number;
  savedAt: string; // ISO instant
}

/** What one adaptation run concluded (D-026). */
export interface SavedReview {
  review: StoredReview;
  createdAt: string; // ISO instant
  /** The plan version this run created, or null when nothing changed. */
  toVersion: number | null;
}

/** Leaderboard (D-029): opt-in, nickname only, consistency figures only. */
export interface GymInfo {
  id: string;
  name: string;
  /** Six characters to share with members. */
  joinCode: string;
}
export interface LeaderboardProfile {
  nickname: string;
  optedIn: boolean;
  gym: GymInfo | null;
}
export interface LeaderboardRow {
  rank: number;
  nickname: string;
  /** Share of planned sessions done in the window; null when nothing was planned yet. */
  completionPct: number | null;
  daysTrained: number;
  sessionsLogged: number;
  isMe: boolean;
}
export type LeaderboardScope = "gym" | "world";

export interface Backend {
  readonly mode: "supabase" | "demo";
  currentAccount(): Promise<Account | null>;
  signUp(email: string, password: string): Promise<{ account: Account | null; needsEmailConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<Account>;
  signOut(): Promise<void>;
  /** Permanently deletes the signed-in account and everything stored about the athlete, then signs out. */
  deleteMyAccount(): Promise<void>;
  saveOnboarding(answers: OnboardingAnswers, today: string): Promise<void>;
  /** The answers last saved, or null if this account hasn't finished onboarding. */
  loadOnboarding(): Promise<OnboardingAnswers | null>;
  /**
   * Builds a new plan version from the SAVED answers and stores it. Supabase: the generate-plan
   * Edge Function does this on the server; the app never writes plans itself.
   */
  buildPlan(today: string): Promise<void>;
  /** The current saved plan version, or null if none has been built yet. */
  loadPlan(): Promise<SavedPlan | null>;
  /** Logged sessions for a plan (any version: logs follow workout_key across versions). */
  listLogs(planId: string): Promise<CompletedWorkout[]>;
  /** Every log from `since` (ISO date) on, planned or not, newest first. */
  listRecentLogs(since: string): Promise<CompletedWorkout[]>;
  /** Saves a manual log (D-025); pass the existing log's id to edit it. Returns what was stored. */
  saveLog(log: ManualLog, existingId: string | null): Promise<CompletedWorkout>;
  /**
   * Runs adaptation on the current plan and returns the review. Supabase: the adapt-plan Edge
   * Function does this on the server, from stored data only.
   */
  adaptPlan(today: string): Promise<SavedReview>;
  /** The most recent review, or null if adaptation hasn't run yet. */
  latestReview(): Promise<SavedReview | null>;
  /** Answers one of the engine's questions. Q-1 (missing effort) also writes the RPE into that log. */
  answerQuestion(questionId: string, value: string, today: string): Promise<void>;
  /** Races that haven't finished yet, soonest first. */
  listEvents(today: string): Promise<HyroxEvent[]>;
  /** Everything stored about this athlete, as formatted JSON (data export, SECURITY.md). */
  exportMyData(): Promise<string>;
  /** This athlete's leaderboard profile, or null if they've never joined. */
  loadLeaderboardProfile(): Promise<LeaderboardProfile | null>;
  /** Joins (or renames, or opts in or out). Nicknames are unique, ignoring capitals. */
  saveLeaderboardProfile(p: { nickname: string; optedIn: boolean }): Promise<void>;
  createGym(name: string): Promise<GymInfo>;
  joinGym(code: string): Promise<GymInfo>;
  leaveGym(): Promise<void>;
  /** Opted-in athletes ranked by consistency over the last `days` days ending `today`. */
  leaderboard(scope: LeaderboardScope, days: 7 | 28, today: string): Promise<LeaderboardRow[]>;
}

export class BackendError extends Error {}
