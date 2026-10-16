/** S — Safety. Acts on a single report: safety never waits for a trend. Never paywalled (§7). */
import type { CompletedWorkout, PainReport, PlannedWorkout, WorkoutChange } from "../../types.js";
import { addDays } from "../../units/units.js";
import { downgradeToEasy, isHard, restDay, upcoming, type RuleContext } from "../context.js";
import { PAIN_AREA_MAP, painArea } from "../pain-map.js";
import { adaptedBy, change, decision, sourcesOf, withoutMovements, type Rule } from "./shared.js";

const ADVICE =
  "Log how it feels each day. If it persists, gets worse, or causes swelling, numbness or limping, see a physiotherapist or doctor. This app can't diagnose injuries.";

type Report = CompletedWorkout & { pain: PainReport };
const reportsSince = (ctx: RuleContext, days: number): Report[] =>
  ctx.completed
    .filter((c): c is Report => c.pain != null && c.pain.level > 0 && c.date <= ctx.today && c.date >= addDays(ctx.today, -(days - 1)))
    .sort((a, b) => a.date.localeCompare(b.date));

const severe = (p: PainReport, ctx: RuleContext) => p.level >= ctx.cfg.painSevere || !!p.sharp || !!p.stoppedSession || !!p.alteredMovement;

const isRun = (w: PlannedWorkout) => w.sport === "run" || w.sport === "trail_run";

// S-2 — severe pain: rest only until the athlete reports improvement.
export const severePainRule: Rule = {
  id: "S-2",
  version: 1,
  group: "S",
  priority: 100,
  evaluate(ctx) {
    const latest = reportsSince(ctx, ctx.cfg.painMovementDays).filter((r) => severe(r.pain, ctx)).at(-1);
    if (!latest) return null;
    const improvedLog = ctx.completed.some((c) => c.date > latest.date && c.pain != null && !severe(c.pain, ctx));
    const improvedCheckIn = ctx.checkIns.some((c) => c.date >= latest.date && c.painImproved === true);
    if (improvedLog || improvedCheckIn) return null;

    // Rolling 3-day window, re-checked every day, so sessions come back as soon as it improves.
    const window = upcoming(ctx, ctx.cfg.painEaseDays, ctx.today).filter((w) => w.type !== "rest" && !adaptedBy(w, "S-2"));
    const area = PAIN_AREA_MAP[painArea(latest.pain)].label;
    const what = [
      `pain ${latest.pain.level}/10`,
      latest.pain.sharp ? "described as sharp" : null,
      latest.pain.stoppedSession ? "stopped the session" : null,
      latest.pain.alteredMovement ? "changed how you move" : null,
    ].filter(Boolean).join(", ");
    return decision(this, {
      action: "add_recovery",
      confidence: 1,
      whatChanged: window.length ? `The next ${ctx.cfg.painEaseDays} days are rest days.` : "Rest until it improves.",
      why: `On ${latest.date} you reported ${what} (${area}). Training through pain like that risks a much longer layoff.`,
      nextSteps: `Rest until it improves, then tell the app and we'll ease you back in. Please see a physiotherapist or doctor about this. ${ADVICE}`,
      evidence: [{ signal: "severe_pain", description: `${what} on ${latest.date}`, sources: [latest.source], refs: [latest.id] }],
      changes: window.map((w) => change(w, restDay(w, this.id, "Rest: pain check", "You reported severe pain. Rest until it improves."), `${w.title} → rest`)),
      question: "How is the pain now: better, the same, or worse?",
      questionId: "S-2.followup",
      holdsProgression: "all",
    });
  },
};

// S-1 — pain ≥ 4/10, or pain in the same area on 2 logs within 7 days.
export const painRule: Rule = {
  id: "S-1",
  version: 1,
  group: "S",
  priority: 95,
  evaluate(ctx) {
    const reports = reportsSince(ctx, ctx.cfg.painMovementDays);
    if (reports.length === 0) return null;
    const byArea = new Map<string, Report[]>();
    for (const r of reports) byArea.set(painArea(r.pain), [...(byArea.get(painArea(r.pain)) ?? []), r]);
    const qualifying = [...byArea.entries()].filter(([, rs]) => rs.length >= 2 || rs.some((r) => r.pain.level >= ctx.cfg.painThreshold));
    if (qualifying.length === 0) return null;

    const changes = new Map<string, WorkoutChange>();
    const set = (w: PlannedWorkout, after: PlannedWorkout, summary: string) => {
      const prev = changes.get(w.id);
      changes.set(w.id, { workoutId: w.id, before: w, after, summary: prev ? `${prev.summary}; ${summary}` : summary });
    };
    const current = (w: PlannedWorkout) => changes.get(w.id)?.after ?? w;
    const areas: string[] = [];
    let unknownArea = false;

    for (const [area, rs] of qualifying) {
      const rule = PAIN_AREA_MAP[area as keyof typeof PAIN_AREA_MAP];
      areas.push(rule.label);
      if (area === "other") unknownArea = true;
      const last = rs.at(-1)!.date;
      const movementEnd = addDays(last, ctx.cfg.painMovementDays - 1);
      const easeEnd = addDays(last, ctx.cfg.painEaseDays);
      for (const w of upcoming(ctx, ctx.cfg.painMovementDays, ctx.today)) {
        if (w.date > movementEnd || adaptedBy(w, "S-")) continue;
        const safe = withoutMovements(current(w), rule.avoid, this.id, rule.label);
        if (safe) set(w, safe, `${w.title}: movements that load your ${rule.label} removed`);
        const hardEase = w.date <= easeEnd || (rule.easyRunningOnly && isRun(w));
        if (isHard(current(w)) && w.type !== "race" && hardEase) {
          const eased = isRun(w) || w.sport === "hyrox"
            ? downgradeToEasy(current(w), ctx.plan, this.id, `Eased after a pain report (${rule.label}).`)
            : restDay(w, this.id, "Rest: pain check", `Eased after a pain report (${rule.label}).`);
          set(w, eased, `${w.title} → ${eased.type === "rest" ? "rest" : "easy run"}`);
        }
      }
    }

    const worst = reports.reduce((a, b) => (a.pain.level >= b.pain.level ? a : b));
    const twice = qualifying.some(([, rs]) => rs.length >= 2);
    return decision(this, {
      action: "add_recovery",
      confidence: 1,
      whatChanged: changes.size
        ? `Movements that load your ${areas.join(" and ")} are removed for ${ctx.cfg.painMovementDays} days, and hard sessions in the next ${ctx.cfg.painEaseDays} days are eased.`
        : "No upcoming session loads that area, so nothing changed.",
      why: twice
        ? `You reported pain in your ${areas.join(" and ")} more than once this week.`
        : `You reported pain of ${worst.pain.level}/10 (${areas.join(" and ")}) on ${worst.date}.`,
      nextSteps: ADVICE,
      evidence: qualifying.map(([area, rs]) => ({
        signal: "pain_reported",
        description: `${rs.length} report(s), ${PAIN_AREA_MAP[area as keyof typeof PAIN_AREA_MAP].label}, worst ${Math.max(...rs.map((r) => r.pain.level))}/10`,
        sources: sourcesOf(rs),
        refs: rs.map((r) => r.id),
      })),
      changes: [...changes.values()],
      question: unknownArea ? "Where is the pain: knee, lower back or hip, shoulder or arm, foot/ankle/shin/calf, or somewhere else?" : "Is the pain gone, improving, or the same or worse?",
      questionId: unknownArea ? "S-1.area" : "S-1.followup",
      holdsProgression: "all",
    });
  },
};

// S-3 — "not feeling 100%": next 2 days easy or rest.
export const illnessRule: Rule = {
  id: "S-3",
  version: 1,
  group: "S",
  priority: 90,
  evaluate(ctx) {
    const since = addDays(ctx.today, -(ctx.cfg.illnessEaseDays - 1));
    const flag = ctx.checkIns.filter((c) => c.notFeeling100 && c.date >= since && c.date <= ctx.today).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!flag) return null;
    const end = addDays(flag.date, ctx.cfg.illnessEaseDays - 1);
    const changes = upcoming(ctx, ctx.cfg.illnessEaseDays, ctx.today)
      .filter((w) => w.date <= end && w.type !== "rest" && !adaptedBy(w, "S-") && (isHard(w) || w.type === "strength"))
      .map((w) => {
        const after = isRun(w)
          ? downgradeToEasy(w, ctx.plan, this.id, "You said you're not feeling 100%.")
          : restDay(w, this.id, "Rest: recover first", "You said you're not feeling 100%.");
        return change(w, after, `${w.title} → ${after.type === "rest" ? "rest" : "easy run"}`);
      });
    return decision(this, {
      action: "add_recovery",
      confidence: 1,
      whatChanged: `The next ${ctx.cfg.illnessEaseDays} days are easy or rest.`,
      why: `You told us on ${flag.date} you're not feeling 100%.`,
      nextSteps: "Recover first. Easy runs are optional; rest is fine. If you're off for a week or more, we'll ease you back in.",
      evidence: [{ signal: "not_feeling_100", description: `Check-in on ${flag.date}`, sources: ["manual"], refs: [flag.date] }],
      changes,
      holdsProgression: "all",
    });
  },
};
