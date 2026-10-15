/** Demo mode: in-memory only. Never used when a Supabase project is configured. */
import type { OnboardingAnswers } from "@/onboarding/model";
import { BackendError, type Account, type Backend } from "./backend";

export class DemoBackend implements Backend {
  readonly mode = "demo" as const;
  private account: Account | null = null;
  private answers: OnboardingAnswers | null = null;

  async currentAccount() {
    return this.account;
  }
  async signUp(email: string, password: string) {
    if (password.length < 8) throw new BackendError("Use at least 8 characters for your password.");
    this.account = { userId: "demo-user", email };
    return { account: this.account, needsEmailConfirmation: false };
  }
  async signIn(email: string, _password: string) {
    this.account = { userId: "demo-user", email };
    return this.account;
  }
  async signOut() {
    this.account = null;
    this.answers = null;
  }
  async saveOnboarding(answers: OnboardingAnswers) {
    if (!this.account) throw new BackendError("Sign in to save your answers.");
    this.answers = structuredClone(answers);
  }
  async loadOnboarding() {
    return this.answers ? structuredClone(this.answers) : null;
  }
}
