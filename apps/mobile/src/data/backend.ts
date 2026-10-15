/**
 * The app talks to storage only through this interface.
 * - SupabaseBackend: real accounts and storage, used when EXPO_PUBLIC_SUPABASE_URL is set.
 * - DemoBackend: in-memory, nothing leaves the device or survives a reload. Used only when no
 *   Supabase project is configured; the UI shows a permanent "Demo mode" banner.
 */
import type { OnboardingAnswers } from "@/onboarding/model";

export interface Account {
  userId: string;
  email: string;
}

export interface Backend {
  readonly mode: "supabase" | "demo";
  currentAccount(): Promise<Account | null>;
  signUp(email: string, password: string): Promise<{ account: Account | null; needsEmailConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<Account>;
  signOut(): Promise<void>;
  saveOnboarding(answers: OnboardingAnswers, today: string): Promise<void>;
  /** The answers last saved, or null if this account hasn't finished onboarding. */
  loadOnboarding(): Promise<OnboardingAnswers | null>;
}

export class BackendError extends Error {}
