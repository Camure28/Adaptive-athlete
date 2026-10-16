/** Demo mode: in-memory only. Never used when a Supabase project is configured. */
import { generateHyroxPlan, HyroxPlanError } from "@adaptive-athlete/engine";
import { toEngineInputs, type OnboardingAnswers } from "@/onboarding/model";
import { BackendError, type Account, type Backend, type HyroxEvent, type SavedPlan } from "./backend";

/** Demo-mode sample races only; the real list lives in the database. */
const DEMO_EVENTS: HyroxEvent[] = [
  { id: "demo-denver", name: "HYROX Denver (demo)", city: "Denver", region: "CO", country: "USA", venue: null, startDate: "2026-11-12", endDate: "2026-11-15", verified: false },
  { id: "demo-phoenix", name: "HYROX Phoenix (demo)", city: "Phoenix", region: "AZ", country: "USA", venue: "State Farm Stadium", startDate: "2027-02-25", endDate: "2027-02-28", verified: false },
  { id: "demo-las-vegas", name: "HYROX Las Vegas (demo)", city: "Las Vegas", region: "NV", country: "USA", venue: null, startDate: "2027-03-12", endDate: "2027-03-14", verified: false },
];

export class DemoBackend implements Backend {
  readonly mode = "demo" as const;
  private account: Account | null = null;
  private answers: OnboardingAnswers | null = null;
  private plan: SavedPlan | null = null;

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
    this.plan = null;
  }
  async saveOnboarding(answers: OnboardingAnswers) {
    if (!this.account) throw new BackendError("Sign in to save your answers.");
    this.answers = structuredClone(answers);
  }
  /** Demo: built on the phone and kept in memory; earlier versions aren't kept. */
  async buildPlan(today: string) {
    if (!this.answers) throw new BackendError("Finish onboarding first.");
    try {
      const { athlete, goal } = toEngineInputs(this.answers, today);
      const now = new Date().toISOString();
      const version = (this.plan?.version ?? 0) + 1;
      const plan = { ...generateHyroxPlan(athlete, goal, { planId: "demo", today, now }), version };
      this.plan = { plan, version, savedAt: now };
    } catch (e) {
      throw new BackendError(e instanceof HyroxPlanError ? e.message : "Your answers are incomplete. Go back and finish onboarding.");
    }
  }
  async loadPlan() {
    return this.plan;
  }
  async listEvents(today: string) {
    return DEMO_EVENTS.filter((e) => e.endDate >= today);
  }
  async exportMyData() {
    return JSON.stringify({ exported_at: new Date().toISOString(), demo: true, answers: this.answers }, null, 2);
  }
  async loadOnboarding() {
    return this.answers ? structuredClone(this.answers) : null;
  }
}
