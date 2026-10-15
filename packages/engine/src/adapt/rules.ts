/**
 * Layer 4 — Adaptation rules.
 *
 * Each rule is a pure function (context) → decision | null. Rules never mutate the plan; they
 * propose WorkoutChanges which the arbiter (engine.ts) validates and applies.
 *
 * Bump a rule's `version` whenever its logic or meaning changes, so the audit trail shows which
 * logic produced each historical decision.
 */

import type { AdaptationDecision, DataSource, Evidence, PlannedWorkout, WorkoutChange } from "../types.js";
import { addDays, daysBetween, formatPace } from "../units/units.js";
import { acuteChronicRatio } from "../load/load.js";
import { assessRace, trainingPaces } from "../performance/vdot.js";
import {
  allWorkouts,
  downgradeToEasy,
  isKeyRun,
  protectedSession,
  recentKeySessions,
  retarget,
  scaleWorkout,
  singleSourceRecovery,
  upcoming,
  type RuleContext,
} from "./context.js";

export interface Rule {
  id: string;
  version: number;
  priority: number;
  evaluate(ctx: RuleContext): AdaptationDecision | null;
}

const change = (before: PlannedWorkout, after: PlannedWorkout | null, summary: string): WorkoutChange => ({
  workoutId: before.id,
  before,
  after,
  summary,
});

const sourcesOf = (xs: { source: DataSource }[]): DataSource[] => [...new Set(xs.map((x) => x.source))];

// ---------------------------------------------------------------------------------------------
// R1 — Pain / safety. Highest priority. Acts on a single report: safety does not wait for trends.
// ---------------------------------------------------------------------------------------------
export const painSafetyRule: Rule = {
  id: "pain_safety",
  version: 1,
  priority: 100,
  evaluate(ctx) {
    const since = addDays(ctx.today, -ctx.cfg.painLookbackDays);
    const reports = ctx.completed.filter(
      (c) => c.date >= since && c.date <= ctx.today && c.pain && (c.pain.level >= ctx.cfg.painThreshold || c.pain.alteredMovement),
    );
    if (reports.length === 0) return null;
    const worst = reports.reduce((a, b) => ((a.pain?.level ?? 0) >= (b.pain?.level ?? 0) ? a : b));

    const affected = upcoming(ctx, ctx.cfg.painProtectDays, addDays(ctx.today, 1)).filter(
      (w) => w.sport === "run" || w.sport === "trail_run" || w.sport === "hyrox",
    );
    const changes = affected.map((w) => change(w, protectedSession(w, this.id), `${w.title} → rest or pain-free cross-training`));
    const where = worst.pain?.location ? ` (${worst.pain.location})` : "";
    return {
      ruleId: this.id,
      ruleVersion: this.version,
      action: "add_recovery",
      priority: this.priority,
      confidence: 1,
      whatChanged: `Running sessions for the next ${ctx.cfg.painProtectDays} days were replaced with rest or optional pain-free cross-training.`,
      why: `You reported pain of ${worst.pain?.level}/10${where}${worst.pain?.alteredMovement ? " that changed how you move" : ""} on ${worst.date}. Training through pain risks a longer layoff.`,
      nextSteps:
        "Log how it feels each day. If it is still present after 3 days, gets worse, or causes swelling, numbness or limping, see a physiotherapist or doctor. When you've had 2 pain-free days, tell the app and we'll ease you back in.",
      evidence: [
        {
          signal: "pain_reported",
          description: `Pain ${worst.pain?.level}/10 reported after ${worst.date} session`,
          sources: sourcesOf(reports),
          refs: reports.map((r) => r.id),
        },
      ],
      changes,
      question: "Is the pain gone, improving, or the same/worse?",
    };
  },
};

// ---------------------------------------------------------------------------------------------
// R2 — Data quality. A key session with no effort or pace information cannot be evaluated.
// ---------------------------------------------------------------------------------------------
export const dataQualityRule: Rule = {
  id: "data_quality",
  version: 1,
  priority: 90,
  evaluate(ctx) {
    const [latest] = recentKeySessions(ctx, 1);
    if (!latest || daysBetween(latest.completed.date, ctx.today) > 2) return null;
    if (latest.rpeDelta != null || latest.paceShortfall != null) return null;
    return {
      ruleId: this.id,
      ruleVersion: this.version,
      action: "ask_clarification",
      priority: this.priority,
      confidence: 1,
      whatChanged: "Nothing yet.",
      why: `Your ${latest.planned.title.toLowerCase()} on ${latest.completed.date} was logged without effort (RPE) or interval splits, so we can't tell how it went.`,
      nextSteps: "Add an RPE (0–10) for that session, and splits if you have them. The plan stays as-is until then.",
      evidence: [
        {
          signal: "missing_effort_data",
          description: "Key session lacks RPE and work-interval splits",
          sources: [latest.completed.source],
          refs: [latest.completed.id],
        },
      ],
      changes: [],
      question: "How hard did that session feel, from 0 (rest) to 10 (maximal)?",
    };
  },
};

// ---------------------------------------------------------------------------------------------
// R3 — Missed sessions. Never "make up" missed work; if a lot was missed, ease back in.
// ---------------------------------------------------------------------------------------------
export const missedSessionsRule: Rule = {
  id: "missed_sessions",
  version: 1,
  priority: 70,
  evaluate(ctx) {
    const from = addDays(ctx.today, -7);
    const planned = allWorkouts(ctx.plan).filter((w) => w.date >= from && w.date < ctx.today && w.type !== "rest");
    if (planned.length < 2) return null;
    const missed = planned.filter((w) => {
      const c = ctx.byPlannedId.get(w.id);
      return !c || c.status === "skipped";
    });
    if (missed.length / planned.length < ctx.cfg.missedFraction) return null;

    const next = upcoming(ctx, 7, ctx.today);
    const factor = 1 - ctx.cfg.missedReduction;
    let downgraded = false;
    const changes: WorkoutChange[] = [];
    for (const w of next) {
      if (isKeyRun(w) && !downgraded) {
        downgraded = true;
        changes.push(change(w, downgradeToEasy(w, ctx.plan, this.id, "Easing back in after missed sessions."), `${w.title} → easy run`));
      } else if (w.sport === "run" && (w.type === "easy_run" || w.type === "long_run" || w.type === "strides")) {
        changes.push(change(w, scaleWorkout(w, factor, this.id, "Volume reduced while you get back into routine."), `${w.title} shortened ${Math.round(ctx.cfg.missedReduction * 100)}%`));
      }
    }
    return {
      ruleId: this.id,
      ruleVersion: this.version,
      action: "reduce_volume",
      priority: this.priority,
      confidence: 0.8,
      whatChanged: `This week's runs are ${Math.round(ctx.cfg.missedReduction * 100)}% shorter and the first hard session is now an easy run.`,
      why: `You missed ${missed.length} of ${planned.length} planned sessions in the last 7 days. Jumping straight back to full load after a gap raises injury risk; missed sessions are not added back.`,
      nextSteps: "Complete this week as written. Full volume resumes next week if things go smoothly. If something is getting in the way (illness, travel, schedule), tell the app so we can plan around it.",
      evidence: [
        {
          signal: "missed_sessions",
          description: `${missed.length}/${planned.length} sessions missed`,
          sources: ["engine"],
          refs: missed.map((m) => m.id),
        },
      ],
      changes,
      question: "Was there a reason for the missed sessions (illness, injury, travel, schedule)?",
    };
  },
};

// ---------------------------------------------------------------------------------------------
// R4 — Recovery trend (HRV / resting HR). Requires a personal baseline; one bad night never acts.
// ---------------------------------------------------------------------------------------------
export const recoveryTrendRule: Rule = {
  id: "recovery_trend",
  version: 1,
  priority: 65,
  evaluate(ctx) {
    const records = singleSourceRecovery(ctx.recovery.filter((r) => r.date <= ctx.today));
    const windowStart = addDays(ctx.today, -(ctx.cfg.recoveryWindowDays - 1));
    const baseline = records.filter((r) => r.date < windowStart && r.date >= addDays(ctx.today, -42));
    const recent = records.filter((r) => r.date >= windowStart);
    if (baseline.length < ctx.cfg.recoveryMinBaselineDays || recent.length < ctx.cfg.recoveryMinFlaggedDays) return null;

    const stats = (xs: number[]): { mean: number; sd: number } | null => {
      if (xs.length < ctx.cfg.recoveryMinBaselineDays) return null;
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return { mean, sd: Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) };
    };
    const hrv = stats(baseline.flatMap((r) => (r.hrvMs != null ? [r.hrvMs] : [])));
    const rhr = stats(baseline.flatMap((r) => (r.restingHr != null ? [r.restingHr] : [])));
    if (!hrv && !rhr) return null;

    const flagged = recent.filter((r) => {
      const lowHrv = hrv && r.hrvMs != null ? r.hrvMs < hrv.mean - ctx.cfg.hrvSdBelow * hrv.sd : null;
      const highRhr = rhr && r.restingHr != null ? r.restingHr > rhr.mean + ctx.cfg.restingHrAbove : null;
      // Both metrics available → require both (fewer false alarms). One metric → that one alone.
      if (lowHrv != null && highRhr != null) return lowHrv && highRhr;
      return lowHrv ?? highRhr ?? false;
    });
    if (flagged.length < ctx.cfg.recoveryMinFlaggedDays) return null;

    const nextKey = upcoming(ctx, 3).find(isKeyRun);
    if (!nextKey) return null;
    const source = records[0]!.source;
    return {
      ruleId: this.id,
      ruleVersion: this.version,
      action: "replace_easier",
      priority: this.priority,
      confidence: 0.6,
      whatChanged: `${nextKey.title} on ${nextKey.date} is now an easy run.`,
      why: `On ${flagged.length} of the last ${recent.length} days your recovery markers were outside your usual range (${[
        hrv ? "HRV below baseline" : null,
        rhr ? "resting heart rate elevated" : null,
      ]
        .filter(Boolean)
        .join(" and ")}). A sustained pattern like this often means accumulated fatigue, illness, or life stress.`,
      nextSteps:
        "Prioritise sleep and easy days. Hard training resumes once markers return toward baseline. If you feel unwell, rest. Device recovery metrics are estimates and vary between brands.",
      evidence: [
        {
          signal: "recovery_markers_suppressed",
          description: `${flagged.length}/${recent.length} recent days flagged vs a ${baseline.length}-day baseline from ${source}`,
          sources: [source],
          refs: flagged.map((f) => f.date),
        },
      ],
      changes: [change(nextKey, downgradeToEasy(nextKey, ctx.plan, this.id, "Recovery markers suggest you need an easier day."), `${nextKey.title} → easy run`)],
    };
  },
};

// ---------------------------------------------------------------------------------------------
// R5 — Effort trend. Key sessions repeatedly harder than intended → ease the next one.
// ---------------------------------------------------------------------------------------------
export const effortTrendRule: Rule = {
  id: "effort_trend",
  version: 1,
  priority: 60,
  evaluate(ctx) {
    const sessions = recentKeySessions(ctx, ctx.cfg.trendWindow);
    if (sessions.length < ctx.cfg.trendMinHits) return null;
    const hits = sessions.filter(
      (s) =>
        (s.rpeDelta != null && s.rpeDelta >= ctx.cfg.rpeExcess) ||
        (s.paceShortfall != null && s.paceShortfall > ctx.cfg.paceShortfall) ||
        s.completed.status === "partial",
    );
    if (hits.length < ctx.cfg.trendMinHits) return null;

    const next = upcoming(ctx, 7, addDays(ctx.today, 1)).find(isKeyRun);
    if (!next) return null;
    const scaled = scaleWorkout(next, 0.75, this.id, "Work volume reduced: recent key sessions felt harder than intended.");
    return {
      ruleId: this.id,
      ruleVersion: this.version,
      action: "reduce_intensity",
      priority: this.priority,
      confidence: Math.min(0.9, 0.5 + 0.15 * hits.length),
      whatChanged: `${next.title} on ${next.date}: work portion reduced by 25%.`,
      why: `${hits.length} of your last ${sessions.length} key sessions were harder than prescribed (higher effort than expected, slower than target, or cut short). One tough day is normal; a pattern suggests fatigue or targets that are currently too ambitious.`,
      nextSteps:
        "Run the next session at the lower end of the target range. If it still feels too hard, we'll reassess your training paces.",
      evidence: hits.map((h) => ({
        signal: "key_session_harder_than_intended",
        description: [
          `${h.planned.title} on ${h.completed.date}`,
          h.rpeDelta != null ? `RPE ${h.completed.rpe} vs expected ≤ ${h.completed.rpe! - h.rpeDelta}` : null,
          h.paceShortfall != null ? `${(h.paceShortfall * 100).toFixed(1)}% slower than target` : null,
          h.completed.status === "partial" ? "cut short" : null,
        ]
          .filter(Boolean)
          .join("; "),
        sources: [h.completed.source],
        refs: [h.completed.id],
      })),
      changes: [change(next, scaled, `${next.title}: 25% less work`)],
    };
  },
};

// ---------------------------------------------------------------------------------------------
// R6 — Load spike. Supporting signal only; requires a valid 28-day chronic window.
// ---------------------------------------------------------------------------------------------
export const loadSpikeRule: Rule = {
  id: "load_spike",
  version: 1,
  priority: 55,
  evaluate(ctx) {
    const acwr = acuteChronicRatio(ctx.completed, ctx.today);
    if (!acwr.ok || acwr.value <= ctx.cfg.acwrHigh) return null;
    const factor = 1 - ctx.cfg.loadSpikeReduction;
    const changes = upcoming(ctx, 7, addDays(ctx.today, 1))
      .filter((w) => w.type === "easy_run" || w.type === "long_run" || w.type === "strides")
      .map((w) => change(w, scaleWorkout(w, factor, this.id, "Volume trimmed after a sharp rise in training load."), `${w.title} shortened ${Math.round(ctx.cfg.loadSpikeReduction * 100)}%`));
    if (changes.length === 0) return null;
    return {
      ruleId: this.id,
      ruleVersion: this.version,
      action: "reduce_volume",
      priority: this.priority,
      confidence: 0.5,
      whatChanged: `Easy and long runs over the next 7 days are ${Math.round(ctx.cfg.loadSpikeReduction * 100)}% shorter.`,
      why: `Your last 7 days of training load were ${acwr.value.toFixed(2)}× your 4-week average. Rapid jumps in load are associated with higher injury risk, so we're smoothing it out. Key sessions are unchanged.`,
      nextSteps: "Train as written. Unplanned extra sessions count toward load — log them so the plan stays accurate.",
      evidence: [
        {
          signal: "acute_chronic_ratio_high",
          description: `Acute:chronic load ratio ${acwr.value.toFixed(2)} (threshold ${ctx.cfg.acwrHigh}), ${acwr.daysOfData} days with complete data`,
          sources: sourcesOf(ctx.completed),
          refs: [],
        },
      ],
      changes,
    };
  },
};

// ---------------------------------------------------------------------------------------------
// R7 — New race result → recalculate targets (up or down, bounded).
// ---------------------------------------------------------------------------------------------
export const newRaceRule: Rule = {
  id: "new_race_result",
  version: 1,
  priority: 40,
  evaluate(ctx) {
    const basis = ctx.plan.basis.vdot;
    const since = basis ? String(basis.provenance.observedAt).slice(0, 10) : "0000-00-00";
    const candidates = ctx.races
      .filter((r) => r.date > since && r.date <= ctx.today && daysBetween(r.date, ctx.today) <= 14)
      .map((r) => assessRace(r, ctx.today))
      .filter((a) => a.confidence >= ctx.cfg.raceRecalcMinConfidence)
      .sort((a, b) => b.race.date.localeCompare(a.race.date));
    const latest = candidates[0];
    if (!latest) return null;
    const old = basis?.value ?? null;
    if (old != null && Math.abs(latest.vdot - old) < ctx.cfg.raceRecalcThreshold) return null;

    const newVdot = old == null ? latest.vdot : Math.max(old - ctx.cfg.maxVdotDrop, latest.vdot);
    return retargetDecision(ctx, this, Math.round(newVdot * 10) / 10, {
      signal: "new_race_result",
      description: `${(latest.race.distanceMeters / 1000).toFixed(1)} km race on ${latest.race.date} (confidence ${latest.confidence.toFixed(2)})`,
      sources: ["manual"],
      refs: [latest.race.id],
    }, old == null
      ? "Your race result gives us a reliable fitness benchmark, so sessions now include personalised pace targets."
      : `Your race on ${latest.race.date} indicates a fitness level ${latest.vdot > old ? "above" : "below"} what your plan assumed${newVdot !== latest.vdot ? " (the downward change is capped to avoid over-reacting to one race)" : ""}.`);
  },
};

// ---------------------------------------------------------------------------------------------
// R8 — Progression. Key sessions consistently easier than intended at or faster than target.
// ---------------------------------------------------------------------------------------------
export const progressionRule: Rule = {
  id: "progression",
  version: 1,
  priority: 30,
  evaluate(ctx) {
    const basis = ctx.plan.basis.vdot;
    if (!basis || !ctx.plan.basis.paces) return null;
    const inTaper = ctx.plan.weeks.some((w) => w.phase === "taper" && w.startDate <= ctx.today && addDays(w.startDate, 6) >= ctx.today);
    if (inTaper) return null;
    const last = ctx.plan.basis.lastTargetUpdate ?? String(basis.provenance.observedAt).slice(0, 10);
    if (daysBetween(last, ctx.today) < ctx.cfg.progressionMinIntervalDays) return null;

    const sessions = recentKeySessions(ctx, ctx.cfg.trendWindow);
    if (sessions.length < ctx.cfg.trendWindow) return null;
    const allEasier = sessions.every(
      (s) =>
        s.completed.status === "completed" &&
        s.rpeDelta != null &&
        s.rpeDelta <= -1 &&
        s.paceVsFast != null &&
        s.paceVsFast <= 0.005,
    );
    if (!allEasier) return null;

    return retargetDecision(ctx, this, Math.round((basis.value + ctx.cfg.progressionStep) * 10) / 10, {
      signal: "key_sessions_easier_than_intended",
      description: `Last ${sessions.length} key sessions at or faster than target with effort ≥1 point below expected`,
      sources: sourcesOf(sessions.map((s) => s.completed)),
      refs: sessions.map((s) => s.completed.id),
    }, `Your last ${sessions.length} key sessions were completed at or faster than target pace while feeling easier than expected. Your fitness has likely improved.`, "progress");
  },
};

function retargetDecision(
  ctx: RuleContext,
  rule: Rule,
  newVdot: number,
  evidence: Evidence,
  why: string,
  action: "recalculate_targets" | "progress" = "recalculate_targets",
): AdaptationDecision {
  const paces = trainingPaces(newVdot);
  const future = allWorkouts(ctx.plan).filter((w) => w.date > ctx.today && w.sport === "run");
  const old = ctx.plan.basis.paces;
  const t = (p: { fastSecPerKm: number; slowSecPerKm: number }): string => `${formatPace(p.fastSecPerKm)}–${formatPace(p.slowSecPerKm)}`;
  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    action,
    priority: rule.priority,
    confidence: 0.75,
    whatChanged: old
      ? `Training paces updated. Threshold: ${t(old.threshold)} → ${t(paces.threshold)}. Easy: ${t(old.easy)} → ${t(paces.easy)}.`
      : `Pace targets added. Threshold: ${t(paces.threshold)}. Easy: ${t(paces.easy)}.`,
    why,
    nextSteps: "Use the new targets from your next session. Effort (RPE) still comes first on hot, hilly, or tired days.",
    evidence: [evidence],
    changes: future.map((w) => change(w, retarget(w, paces, ctx.plan, rule.id), `${w.title}: targets updated`)),
    targetUpdate: { vdot: newVdot },
  };
}

export const DEFAULT_RULES: readonly Rule[] = [
  painSafetyRule,
  dataQualityRule,
  missedSessionsRule,
  recoveryTrendRule,
  effortTrendRule,
  loadSpikeRule,
  newRaceRule,
  progressionRule,
];
