/** A — Adherence (missed or extra sessions) and Q — ask when data is missing. */
import type { PlannedWorkout } from "../../types.js";
import { addDays, daysBetween } from "../../units/units.js";
import {
  allWorkouts,
  downgradeToEasy,
  freeNonAdjacentDay,
  isHard,
  isKeyRun,
  nextWeek,
  recentKeySessions,
  scaleWorkout,
  upcoming,
  weekOf,
  type RuleContext,
} from "../context.js";
import { adaptedBy, answer, change, decision, type Rule } from "./shared.js";

const missedIn = (ctx: RuleContext, from: string): PlannedWorkout[] =>
  allWorkouts(ctx.plan).filter((w) => {
    if (w.date < from || w.date >= ctx.today || w.type === "rest" || w.type === "race") return false;
    const c = ctx.byPlannedId.get(w.id);
    return !c || c.status === "skipped";
  });

const moved = (w: PlannedWorkout, date: string, ruleId: string, why: string): PlannedWorkout => ({
  ...w,
  date,
  rationale: `${why} ${w.rationale}`,
  adaptedBy: ruleId,
});

// A-1 — one missed session: don't make it up; move a key session if a non-adjacent day is free this week.
export const missedOneRule: Rule = {
  id: "A-1",
  version: 1,
  group: "A",
  priority: 60,
  evaluate(ctx) {
    const missed = missedIn(ctx, addDays(ctx.today, -7));
    if (missed.length !== 1) return null;
    const w = missed[0]!;
    const week = weekOf(ctx.plan, ctx.today);
    if (!isKeyRun(w) || !week || w.date < week.startDate || w.date < addDays(ctx.today, -2) || adaptedBy(w, this.id)) return null;
    const day = freeNonAdjacentDay(ctx.plan, addDays(ctx.today, 1), addDays(week.startDate, 6), w.id);
    const evidence = [{ signal: "missed_key_session", description: `${w.title} on ${w.date} not logged`, sources: ["engine" as const], refs: [w.id] }];
    if (!day) {
      return decision(this, {
        action: "keep",
        confidence: 0.9,
        whatChanged: `${w.title} is dropped this week.`,
        why: `You missed ${w.title.toLowerCase()} on ${w.date}, and there's no free day this week that isn't next to another hard session.`,
        nextSteps: "Carry on with the plan as written. Missed sessions aren't made up; one missed session won't change your fitness.",
        evidence,
      });
    }
    return decision(this, {
      action: "reschedule",
      confidence: 0.9,
      whatChanged: `${w.title} moved from ${w.date} to ${day}.`,
      why: `You missed it on ${w.date}, and ${day} is free and not next to another hard session.`,
      nextSteps: "Do it on the new day. If that doesn't work either, skip it; we don't make up missed sessions.",
      evidence,
      changes: [change(w, moved(w, day, this.id, `Moved from ${w.date} after it was missed.`), `${w.title} → ${day}`)],
    });
  },
};

// A-2 — 2+ missed in a week: ask before pulling back; hold progression either way.
export const missedSeveralRule: Rule = {
  id: "A-2",
  version: 1,
  group: "A",
  priority: 58,
  evaluate(ctx) {
    const from = addDays(ctx.today, -7);
    const missed = missedIn(ctx, from);
    if (missed.length < 2) return null;
    const evidence = [{ signal: "missed_sessions", description: `${missed.length} sessions missed in the last 7 days`, sources: ["engine" as const], refs: missed.map((m) => m.id) }];
    const reply = answer(ctx, this.id, missed[0]!.date);
    const pct = Math.round(ctx.cfg.pullBackReduction * 100);
    if (reply === "yes") {
      const week = nextWeek(ctx.plan, ctx.today);
      const changes = (week?.workouts ?? [])
        .filter((w) => !isKeyRun(w) && w.type !== "rest" && w.type !== "race" && !adaptedBy(w, this.id) && (w.plannedDistanceMeters ?? w.estimatedMinutes) > 0)
        .map((w) => change(w, scaleWorkout(w, 1 - ctx.cfg.pullBackReduction, this.id, "Pulled back a little, as you asked."), `${w.title} ${pct}% shorter`));
      return decision(this, {
        action: "reduce_volume",
        confidence: 0.8,
        whatChanged: `Next week keeps its key sessions; everything else is ${pct}% shorter. Progression is on hold this week.`,
        why: `You missed ${missed.length} sessions this week and chose to pull back next week.`,
        nextSteps: "Focus on the key sessions. Full volume returns the week after if things go smoothly.",
        evidence,
        changes,
        holdsProgression: "all",
      });
    }
    return decision(this, {
      action: reply === "no" ? "keep" : "ask_clarification",
      confidence: 0.8,
      whatChanged: "No sessions changed. Progression is on hold this week.",
      why: `You missed ${missed.length} sessions in the last 7 days. Missed sessions aren't made up.`,
      nextSteps: reply === "no" ? "Next week stays as planned." : "If we don't hear back within 2 days, the plan stays as written.",
      evidence,
      holdsProgression: "all",
      ...(reply === "no" ? {} : { question: "You missed a few sessions this week. Would you like to pull back a little next week?", questionId: this.id }),
    });
  },
};

/** Days in a row with nothing logged, counted from the later of the last log and the plan's start. */
function daysWithoutLog(ctx: RuleContext): { days: number; since: string } | null {
  const first = allWorkouts(ctx.plan).map((w) => w.date).sort()[0];
  if (!first || first > ctx.today) return null;
  const last = ctx.completed
    .filter((c) => c.date <= ctx.today && c.status !== "skipped")
    .map((c) => c.date)
    .sort()
    .at(-1);
  const since = last && last >= first ? last : addDays(first, -1);
  return { days: daysBetween(since, ctx.today), since };
}

// A-3 / A-4 — a run of days with nothing logged.
export const daysOffRule: Rule = {
  id: "A-3",
  version: 1,
  group: "A",
  priority: 62,
  evaluate(ctx) {
    const gap = daysWithoutLog(ctx);
    if (!gap || gap.days < ctx.cfg.checkInAfterDays) return null;
    const plannedInGap = allWorkouts(ctx.plan).some((w) => w.date > gap.since && w.date < ctx.today && w.type !== "rest");
    if (!plannedInGap) return null;
    const evidence = [{ signal: "days_without_log", description: `${gap.days} days with nothing logged since ${gap.since}`, sources: ["engine" as const], refs: [] }];

    if (gap.days >= ctx.cfg.reassessAfterDays) {
      return {
        ...decision(this, {
          action: "reassess_block",
          confidence: 0.8,
          whatChanged: "Nothing yet: your plan needs a rethink after a long break.",
          why: `Nothing has been logged for ${gap.days} days.`,
          nextSteps: "Tell us how you're doing and when you can train again. We may push phases back or adjust your race goal.",
          evidence,
          question: "It's been a couple of weeks. How are you doing, and when can you start training again?",
          questionId: "A-4",
          holdsProgression: "all",
        }),
        ruleId: "A-4",
      };
    }

    if (gap.days < ctx.cfg.reentryAfterDays) {
      return decision(this, {
        action: "ask_clarification",
        confidence: 0.7,
        whatChanged: "No sessions changed.",
        why: `Nothing has been logged for ${gap.days} days.`,
        nextSteps: "If you've been training, log the sessions so the plan stays accurate. If you're taking time off, tell us.",
        evidence,
        question: "We haven't seen a workout in a few days. Training without logging, taking time off, or getting back to it?",
        questionId: "A-3.checkin",
      });
    }

    const reply = answer(ctx, "A-3", gap.since);
    if (reply === "resume") {
      const pct = Math.round(ctx.cfg.reentryFactor * 100);
      const changes = upcoming(ctx, 7, addDays(ctx.today, 1))
        .filter((w) => w.type !== "rest" && !adaptedBy(w, this.id))
        .map((w) => change(w, scaleWorkout(w, ctx.cfg.reentryFactor, this.id, "Re-entry week after time off."), `${w.title} at ${pct}%`));
      return decision(this, {
        action: "reduce_volume",
        confidence: 0.8,
        whatChanged: `This week is a re-entry week at about ${pct}% of planned volume. The plan resumes after it.`,
        why: `You had ${gap.days} days off and are ready to start again.`,
        nextSteps: "Ease in. Let us know if anything hurts.",
        evidence,
        changes,
        holdsProgression: "all",
      });
    }
    return decision(this, {
      action: "ask_clarification",
      confidence: 0.8,
      whatChanged: reply === "pause" ? "Your plan stays as is for now. Pausing with a return date is coming soon." : "No sessions changed yet.",
      why: `Nothing has been logged for ${gap.days} days.`,
      nextSteps: "Tell us when you're ready, and we'll start you with a lighter re-entry week.",
      evidence,
      question: "How do you want to continue: on vacation or taking time off, or ready to start again?",
      questionId: "A-3",
      holdsProgression: "all",
    });
  },
};

// A-5 — unplanned hard training: never back-to-back with the next hard session.
export const unplannedHardRule: Rule = {
  id: "A-5",
  version: 1,
  group: "A",
  priority: 55,
  evaluate(ctx) {
    const extra = ctx.completed
      .filter((c) => !c.plannedWorkoutId && c.status !== "skipped" && (c.rpe ?? 0) >= 7 && c.date >= addDays(ctx.today, -1) && c.date <= ctx.today)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!extra) return null;
    const next = upcoming(ctx, 2, addDays(ctx.today, 1)).find((w) => w.date === addDays(extra.date, 1) && isHard(w) && w.type !== "race" && !adaptedBy(w, this.id));
    if (!next) return null;
    const week = weekOf(ctx.plan, next.date);
    const day = week ? freeNonAdjacentDay(ctx.plan, addDays(next.date, 1), addDays(week.startDate, 6), next.id) : null;
    const after = day ? moved(next, day, this.id, "Moved so it isn't the day after your extra hard session.") : downgradeToEasy(next, ctx.plan, this.id, "Eased: it was the day after an extra hard session.");
    return decision(this, {
      action: day ? "reschedule" : "replace_easier",
      confidence: 0.8,
      whatChanged: day ? `${next.title} moved to ${day}.` : `${next.title} on ${next.date} is now an easy run.`,
      why: `You logged an extra hard session on ${extra.date} (RPE ${extra.rpe}). Hard days back to back raise injury risk.`,
      nextSteps: "Extra sessions count toward your week, so keep logging them.",
      evidence: [{ signal: "unplanned_hard_session", description: `Unplanned session on ${extra.date}, RPE ${extra.rpe}`, sources: [extra.source], refs: [extra.id] }],
      changes: [change(next, after, day ? `${next.title} → ${day}` : `${next.title} → easy run`)],
    });
  },
};

// Q-1 — a key session logged without effort or splits: ask instead of guessing.
export const askForDataRule: Rule = {
  id: "Q-1",
  version: 1,
  group: "Q",
  priority: 50,
  evaluate(ctx) {
    const [latest] = recentKeySessions(ctx, 1);
    if (!latest || daysBetween(latest.completed.date, ctx.today) > 2) return null;
    if (latest.rpeDelta != null || latest.paceShortfall != null) return null;
    return decision(this, {
      action: "ask_clarification",
      confidence: 1,
      whatChanged: "Nothing yet.",
      why: `Your ${latest.planned.title.toLowerCase()} on ${latest.completed.date} was logged without effort (RPE) or interval splits, so we can't tell how it went.`,
      nextSteps: "Add an RPE (0–10) for that session, and splits if you have them. The plan stays as it is until then.",
      evidence: [{ signal: "missing_effort_data", description: "Key session lacks RPE and work-interval splits", sources: [latest.completed.source], refs: [latest.completed.id] }],
      question: "How hard did that session feel, from 0 (rest) to 10 (maximal)?",
      questionId: `Q-1.${latest.completed.id}`,
    });
  },
};
