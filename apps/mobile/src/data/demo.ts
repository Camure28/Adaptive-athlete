/** Demo mode: in-memory only. Never used when a Supabase project is configured. */
import {
  adaptationInputFromRows,
  adaptPlan,
  fromManualLog,
  generateHyroxPlan,
  HyroxPlanError,
  reviewForStorage,
  toLogRow,
  type CompletedWorkout,
  type ManualLog,
} from "@adaptive-athlete/engine";
import { toEngineInputs, type OnboardingAnswers } from "@/onboarding/model";
import { BackendError, type Account, type Backend, type HyroxEvent, type SavedPlan, type SavedReview } from "./backend";

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
  private logs = new Map<string, CompletedWorkout>();
  private replies: { question_id: string; value: string; answered_on: string }[] = [];
  private review: SavedReview | null = null;

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
    this.logs.clear();
    this.replies = [];
    this.review = null;
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
  async listLogs(planId: string) {
    return [...this.logs.values()].filter((l) => l.plannedWorkoutId?.startsWith(`${planId}:`));
  }
  async saveLog(log: ManualLog, existingId: string | null) {
    const saved = fromManualLog(log, existingId ?? `demo-log-${this.logs.size + 1}`);
    this.logs.set(saved.id, saved);
    return saved;
  }
  /** Demo: the same engine and row mapping as the server, run on the phone and kept in memory. */
  async adaptPlan(today: string) {
    if (!this.plan) throw new BackendError("Build your plan first.");
    const logs = [...this.logs.values()].map((c) => ({ ...toLogRow(c, "demo"), id: c.id }));
    const input = adaptationInputFromRows(this.plan.plan, today, { logs, answers: this.replies, recovery: [], runResults: [] });
    const result = adaptPlan(input, { now: new Date().toISOString() });
    if (result.changed) this.plan = { plan: result.plan, version: result.plan.version, savedAt: result.plan.createdAt };
    this.review = { review: reviewForStorage(result.review, input.answers, today), createdAt: new Date().toISOString(), toVersion: result.changed ? result.plan.version : null };
    return this.review;
  }
  async latestReview() {
    return this.review;
  }
  async answerQuestion(questionId: string, value: string, today: string) {
    const log = questionId.startsWith("Q-1.") ? this.logs.get(questionId.slice(4)) : undefined;
    if (log) this.logs.set(log.id, { ...log, rpe: Number(value) });
    this.replies.push({ question_id: questionId, value, answered_on: today });
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
