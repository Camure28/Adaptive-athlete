/** F — Fatigue: RPE, heart rate, recovery and soreness trends. Never from one session or one night. */
import type { PlannedWorkout } from "../../types.js";
import { addDays, paceSecPerKm } from "../../units/units.js";
import { acuteChronicRatio } from "../../load/load.js";
import {
  downgradeToEasy,
  isKeyRun,
  nextWeek,
  recentKeySessions,
  recentSessions,
  restDay,
  scaleWork,
  scaleWorkout,
  singleSourceRecovery,
  upcoming,
  type Compliance,
} from "../context.js";
import { adaptedBy, change, decision, sourcesOf, type Rule } from "./shared.js";

const harder = (s: Compliance, margin: number) => s.rpeDelta != null && s.rpeDelta >= margin;

const evidenceOf = (hits: Compliance[]) =>
  hits.map((h) => ({
    signal: "rpe_above_target",
    description: `${h.planned.title} on ${h.completed.date}: RPE ${h.completed.rpe} vs target ≤ ${h.completed.rpe! - h.rpeDelta!}`,
    sources: [h.completed.source],
    refs: [h.completed.id],
  }));

// F-2 — RPE ≥ target + 2 on 3 of the last 4 hard sessions: next week's hard volume −20%.
export const hardVolumeRule: Rule = {
  id: "F-2",
  version: 1,
  group: "F",
  priority: 90,
  evaluate(ctx) {
    const sessions = recentKeySessions(ctx, 4);
    const hits = sessions.filter((s) => harder(s, ctx.cfg.rpeMargin));
    if (hits.length < 3) return null;
    const week = nextWeek(ctx.plan, ctx.today);
    const pct = Math.round(ctx.cfg.hardVolumeReduction * 100);
    const changes = (week?.workouts ?? [])
      .filter((w) => isKeyRun(w) && !adaptedBy(w, this.id) && !ctx.byPlannedId.has(w.id))
      .map((w) => change(w, scaleWork(w, 1 - ctx.cfg.hardVolumeReduction, this.id, `Hard work cut ${pct}%: recent hard sessions felt much harder than intended.`), `${w.title}: ${pct}% fewer reps or less work`));
    return decision(this, {
      action: "reduce_volume",
      confidence: 0.8,
      whatChanged: changes.length ? `Next week's hard sessions have ${pct}% less work (fewer reps or rounds). Progression is on hold.` : "Progression is on hold.",
      why: `${hits.length} of your last ${sessions.length} hard sessions felt much harder than intended (effort 2+ points above target). That pattern usually means fatigue is building.`,
      nextSteps: "Keep easy days truly easy and prioritise sleep. We'll keep checking each session.",
      evidence: evidenceOf(hits),
      changes,
      question: "How have your sleep and stress been lately?",
      questionId: "F-2.sleep_stress",
      holdsProgression: "all",
    });
  },
};

// F-1 — RPE ≥ target + 2 on 2 of the last 3 hard sessions: hold progression.
export const effortHoldRule: Rule = {
  id: "F-1",
  version: 1,
  group: "F",
  priority: 85,
  evaluate(ctx) {
    const sessions = recentKeySessions(ctx, 3);
    const withRpe = sessions.filter((s) => s.rpeDelta != null);
    if (sessions.length > 0 && withRpe.length < 2) return { ruleId: this.id, notEvaluated: "Effort (RPE) not logged on enough recent hard sessions." };
    const hits = sessions.filter((s) => harder(s, ctx.cfg.rpeMargin));
    if (hits.length < 2) return null;
    return decision(this, {
      action: "keep",
      confidence: 0.7,
      whatChanged: "No sessions changed. Progression is on hold.",
      why: `${hits.length} of your last ${sessions.length} hard sessions felt much harder than intended (effort 2+ points above target).`,
      nextSteps: "Run the next hard session at the easier end of its targets. If the pattern continues, we'll trim hard-session volume.",
      evidence: evidenceOf(hits),
      holdsProgression: "all",
    });
  },
};

// F-3 — easy-run heart rate above the easy ceiling on 3 of the last 5 easy runs, at the same or slower pace.
export const easyHeartRateRule: Rule = {
  id: "F-3",
  version: 1,
  group: "F",
  priority: 80,
  evaluate(ctx) {
    const easy = recentSessions(ctx, 5, (w) => w.type === "easy_run" || w.type === "recovery_run");
    const ceiling = (w: PlannedWorkout) => w.steps.find((s) => s.kind === "steady")?.target.heartRate?.max;
    const comparable = easy.filter((s) => s.completed.avgHeartRate != null && ceiling(s.planned) != null);
    const source = sourcesOf(comparable.map((c) => c.completed))[0];
    const sameSource = comparable.filter((c) => c.completed.source === source);
    if (sameSource.length < 3) return { ruleId: this.id, notEvaluated: "Needs heart rate from the same device on 3+ easy runs with heart-rate targets." };
    const hits = sameSource.filter((s) => {
      const fast = s.planned.steps.find((x) => x.kind === "steady")?.target.pace?.fastSecPerKm;
      const pace = s.completed.distanceMeters && s.completed.durationSeconds ? paceSecPerKm(s.completed.distanceMeters, s.completed.durationSeconds) : null;
      const notFaster = fast == null || pace == null || pace >= fast;
      return s.completed.avgHeartRate! > ceiling(s.planned)! && notFaster;
    });
    if (hits.length < 3) return null;
    return decision(this, {
      action: "ask_clarification",
      confidence: 0.6,
      whatChanged: "No sessions changed. Progression is on hold.",
      why: `On ${hits.length} of your last ${sameSource.length} easy runs your heart rate was above your easy ceiling without running faster.`,
      nextSteps: "Slow easy runs down until heart rate settles. Heat, illness, stress and poor sleep all raise it.",
      evidence: [{ signal: "easy_hr_above_ceiling", description: `${hits.length}/${sameSource.length} easy runs above ceiling`, sources: [source!], refs: hits.map((h) => h.completed.id) }],
      question: "Has anything been different lately: heat, illness, stress or sleep?",
      questionId: "F-3.context",
      holdsProgression: "all",
    });
  },
};

// F-4 — HRV 7-day average below baseline by > 1 SD and resting HR above baseline, for 3+ days.
export const recoveryRule: Rule = {
  id: "F-4",
  version: 1,
  group: "F",
  priority: 75,
  evaluate(ctx) {
    const records = singleSourceRecovery(ctx.recovery.filter((r) => r.date <= ctx.today));
    const windowStart = addDays(ctx.today, -6);
    const baseline = records.filter((r) => r.date < windowStart && r.date >= addDays(windowStart, -42) && r.hrvMs != null && r.restingHr != null);
    const recent = records.filter((r) => r.date >= windowStart && r.hrvMs != null && r.restingHr != null);
    if (baseline.length < ctx.cfg.recoveryBaselineDays || recent.length < ctx.cfg.recoveryRecentMinDays) {
      return { ruleId: this.id, notEvaluated: `Needs ${ctx.cfg.recoveryBaselineDays} days of HRV and resting heart rate from one device, and 5 of the last 7 days.` };
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const hrv = baseline.map((r) => r.hrvMs!);
    const hrvMean = mean(hrv);
    const hrvSd = Math.sqrt(mean(hrv.map((x) => (x - hrvMean) ** 2)));
    const rhrMean = mean(baseline.map((r) => r.restingHr!));
    const lowAvg = mean(recent.map((r) => r.hrvMs!)) < hrvMean - ctx.cfg.hrvSdBelow * hrvSd;
    const flagged = recent.filter((r) => r.hrvMs! < hrvMean - ctx.cfg.hrvSdBelow * hrvSd && r.restingHr! > rhrMean);
    if (!lowAvg || flagged.length < ctx.cfg.recoveryFlaggedDays) return null;
    const next = upcoming(ctx, 7, addDays(ctx.today, 1)).find((w) => isKeyRun(w) && !adaptedBy(w, this.id));
    if (!next) return null;
    const source = records[0]!.source;
    return decision(this, {
      action: "replace_easier",
      confidence: 0.6,
      whatChanged: `${next.title} on ${next.date} is now an easy run.`,
      why: `On ${flagged.length} of the last ${recent.length} days your HRV was well below your usual range and your resting heart rate was above it. A pattern like that often means fatigue, illness or stress.`,
      nextSteps: "Prioritise sleep and easy days. We'll check again in 2 days. Device recovery numbers are estimates and vary between brands.",
      evidence: [{ signal: "recovery_markers_suppressed", description: `${flagged.length}/${recent.length} days flagged vs a ${baseline.length}-day ${source} baseline`, sources: [source], refs: flagged.map((f) => f.date) }],
      changes: [change(next, downgradeToEasy(next, ctx.plan, this.id, "Recovery markers suggest you need an easier day."), `${next.title} → easy run`)],
      holdsProgression: "all",
    });
  },
};

/** Lowest-priority first: the session F-5 gives up for a rest day. */
const REST_ORDER = ["recovery_run", "easy_run", "strides", "cross_train", "strength", "station_endurance", "long_run"];

// F-5 — fatigue or soreness ≥ 4/5 on 3 consecutive logs: add a rest day in the next 3 days.
export const sorenessRule: Rule = {
  id: "F-5",
  version: 1,
  group: "F",
  priority: 70,
  evaluate(ctx) {
    const rated = ctx.completed
      .filter((c) => c.date <= ctx.today && (c.fatigue != null || c.soreness != null) && c.status !== "skipped")
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
    if (rated.length < 3 || !rated.every((c) => Math.max(c.fatigue ?? 0, c.soreness ?? 0) >= ctx.cfg.fatigueHigh)) return null;
    const window = upcoming(ctx, 3, addDays(ctx.today, 1));
    if (window.some((w) => adaptedBy(w, this.id))) return null;
    const pick = window
      .filter((w) => w.type !== "rest")
      .sort((a, b) => {
        const ia = REST_ORDER.indexOf(a.type), ib = REST_ORDER.indexOf(b.type);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.date.localeCompare(b.date);
      })[0];
    if (!pick) return null;
    return decision(this, {
      action: "add_recovery",
      confidence: 0.7,
      whatChanged: `${pick.title} on ${pick.date} is now a rest day.`,
      why: "Your last 3 logs all had high fatigue or soreness (4 or 5 out of 5).",
      nextSteps: "Use the rest day fully. Sleep, food and an easy walk help more than extra training.",
      evidence: [{ signal: "fatigue_soreness_high", description: "3 consecutive logs at 4+/5", sources: sourcesOf(rated), refs: rated.map((r) => r.id) }],
      changes: [change(pick, restDay(pick, this.id, "Rest day (added)", "Added because fatigue and soreness have been high on your last 3 logs."), `${pick.title} → rest`)],
      holdsProgression: "all",
    });
  },
};

// F-6 — load spike. Not in the original rubric; kept by the product owner on 2026-10-16 (D-024).
export const loadSpikeRule: Rule = {
  id: "F-6",
  version: 1,
  group: "F",
  priority: 65,
  evaluate(ctx) {
    const acwr = acuteChronicRatio(ctx.completed, ctx.today);
    if (!acwr.ok || acwr.value <= ctx.cfg.acwrHigh) return null;
    const factor = 1 - ctx.cfg.loadSpikeReduction;
    const pct = Math.round(ctx.cfg.loadSpikeReduction * 100);
    const changes = upcoming(ctx, 7, addDays(ctx.today, 1))
      .filter((w) => (w.type === "easy_run" || w.type === "long_run" || w.type === "strides") && !adaptedBy(w, this.id))
      .map((w) => change(w, scaleWorkout(w, factor, this.id, "Volume trimmed after a sharp rise in training load."), `${w.title} shortened ${pct}%`));
    if (changes.length === 0) return null;
    return decision(this, {
      action: "reduce_volume",
      confidence: 0.5,
      whatChanged: `Easy and long runs over the next 7 days are ${pct}% shorter.`,
      why: `Your last 7 days of training load were ${acwr.value.toFixed(2)}× your 4-week average. Rapid jumps in load raise injury risk, so we're smoothing it out. Hard sessions are unchanged.`,
      nextSteps: "Train as written. Unplanned extra sessions count toward load, so log them.",
      evidence: [{ signal: "acute_chronic_ratio_high", description: `Acute:chronic load ratio ${acwr.value.toFixed(2)} (threshold ${ctx.cfg.acwrHigh}), ${acwr.daysOfData} days of data`, sources: sourcesOf(ctx.completed), refs: [] }],
      changes,
    });
  },
};

