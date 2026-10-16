/**
 * The athlete's plan: the current saved version (D-022). Plans are built and stored on the server
 * from the saved answers; if this account has no plan yet, one is built on first open.
 */
import { router } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CompletedWorkout, PlannedWorkout, PlanWeek, TrainingPlan, WorkoutStep } from "@adaptive-athlete/engine";
import { TechLoader } from "@/components/loader";
import { Button, Callout, Heading, Screen, Wordmark } from "@/components/ui";
import { backend, type SavedPlan } from "@/data";
import { dashboardStats } from "@/lib/dashboard";
import { useDismissedNotes } from "@/lib/dismissed";
import { distance, minutes, paceRange, shortDate } from "@/lib/format";
import { localToday, useSession } from "@/lib/session";
import { color, font, radius, space, type } from "@/lib/theme";
import { logBadge } from "@/logging/form";
import type { OnboardingAnswers, Units } from "@/onboarding/model";

const PHASE: Record<PlanWeek["phase"], string> = { base: "Base", build: "Build", peak: "Peak", taper: "Taper" };
const LEVEL: Record<string, string> = { first_timer: "First-timer", intermediate: "Intermediate", advanced: "Advanced", competitive: "Competitive" };
const DIVISION: Record<string, string> = { women_open: "Women Open", women_pro: "Women Pro", men_open: "Men Open", men_pro: "Men Pro" };
const STATUS: Record<string, string> = { building: "Building up", consistent: "Training consistently", race_ready: "Race-ready" };
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const stamp = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`; };

/** Personal banner: who they are, the race, the countdown, and this week at a glance. */
function Dashboard({ plan, answers, today }: { plan: TrainingPlan; answers: OnboardingAnswers; today: string }) {
  const d = dashboardStats(plan, today);
  const tags = [answers.level && LEVEL[answers.level], answers.division && DIVISION[answers.division], answers.trainingStatus && STATUS[answers.trainingStatus]].filter(Boolean).join(" · ");
  const race = answers.eventLabel || "Race day";
  return (
    <View style={hud.card} accessibilityRole="summary">
      {(["tl", "tr", "bl", "br"] as const).map((c) => <View key={c} style={[hud.corner, hud[c]]} />)}
      <Text style={hud.tags} numberOfLines={1}>{tags.toUpperCase()}</Text>
      <View style={hud.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={hud.race} numberOfLines={2}>{race.toUpperCase()}</Text>
          <Text style={hud.date}>{stamp(d.raceDate)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={hud.count} accessibilityLabel={`${d.daysToRace} days to race`}>{d.daysToRace}</Text>
          <Text style={hud.label}>DAYS TO RACE</Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <View style={hud.rowTight}>
          <Text style={hud.label}>WEEK {String(d.weekNumber).padStart(2, "0")}/{String(d.totalWeeks).padStart(2, "0")} · {PHASE[d.week.phase].toUpperCase()}{d.week.isRecoveryWeek ? " · LIGHTER" : ""}</Text>
          {!d.started ? <Text style={hud.label}>STARTS {stamp(d.week.startDate).slice(0, 10)}</Text> : null}
        </View>
        <View style={hud.strip}>
          {plan.weeks.map((w) => (
            <View key={w.index} style={[hud.tick, w.index < d.week.index && hud.tickDone, w.index === d.week.index && hud.tickNow, w.phase === "taper" && w.index > d.week.index && hud.tickTaper]} />
          ))}
        </View>
      </View>

      <View style={hud.grid}>
        <Stat label="THIS WEEK" value={`${d.thisWeek.sessions}`} unit="SESSIONS" sub={`${d.thisWeek.hard} hard · ${minutes(d.thisWeek.minutes)}`} />
        <Stat label="RUN VOLUME" value={distance(d.thisWeek.runMeters, answers.units).split(" ")[0]!} unit={answers.units.toUpperCase()} sub="planned this week" />
        <Stat
          label="RACE-EFFORT PACE"
          value={d.threshold ? paceRange(d.threshold.fastSecPerKm, d.threshold.slowSecPerKm, answers.units).replace(`/${answers.units}`, "") : "RPE"}
          unit={d.threshold ? `/${answers.units.toUpperCase()}` : "7–8"}
          sub={d.threshold ? "estimated from your benchmark" : "no benchmark yet"}
          small={!!d.threshold}
        />
        <Stat label="FULL SIMS" value={`${d.fullSims.total}`} unit="PLANNED" sub={d.fullSims.next ? `next ${stamp(d.fullSims.next).slice(4, 10).trim()}` : "none left"} />
      </View>

      {d.next ? (
        <View style={hud.next}>
          <Text style={hud.label}>NEXT UP · {stamp(d.next.date).slice(0, 10)}</Text>
          <Text style={hud.nextTitle} numberOfLines={2}>{d.next.title}</Text>
          <Text style={hud.data}>{minutes(d.next.estimatedMinutes)}{d.next.plannedDistanceMeters ? ` · ${distance(d.next.plannedDistanceMeters, answers.units)}` : ""}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, unit, sub, small = false }: { label: string; value: string; unit: string; sub: string; small?: boolean }) {
  return (
    <View style={hud.stat}>
      <Text style={hud.label}>{label}</Text>
      <Text style={[hud.value, small && { fontSize: 18 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        <Text style={hud.unit}> {unit}</Text>
      </Text>
      <Text style={hud.sub} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

export default function PlanScreen() {
  const { answers, account, logs, setPlanAndLogs, plan: current, review, setReview } = useSession();
  const { dismissed, dismiss } = useDismissedNotes(account?.userId);
  const today = localToday();
  const [result, setResult] = useState<SavedPlan | { error: string } | null>(null);
  const [stage, setStage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [openWeek, setOpenWeek] = useState(0);
  const [view, setView] = useState<"weeks" | "calendar">("weeks");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        setStage(0);
        let saved = await backend.loadPlan();
        if (!saved) {
          if (live) setStage(1);
          await backend.buildPlan(today);
          saved = await backend.loadPlan();
        }
        if (!saved) {
          if (live) setResult({ error: "Your plan couldn't be loaded. Try again in a moment." });
          return;
        }
        const [logged, latest] = await Promise.all([backend.listLogs(saved.plan.id), backend.latestReview()]);
        if (!live) return;
        setPlanAndLogs(saved, logged);
        setReview(latest);
        setResult(saved);
      } catch (e) {
        if (live) setResult({ error: e instanceof Error ? e.message : "Your plan couldn't be loaded. Try again in a moment." });
      }
    })();
    return () => {
      live = false;
    };
  }, [today, attempt, setPlanAndLogs, setReview]);

  if (!result) return <TechLoader lines={["LOADING YOUR PLAN", "GENERATING TRAINING PLAN"]} stage={stage} />;

  if ("error" in result) {
    return (
      <Screen
        footer={
          <View style={{ gap: space.xs }}>
            <Button title="Try again" onPress={() => { setResult(null); setAttempt((n) => n + 1); }} />
            <Button kind="quiet" title="Edit my answers" onPress={() => router.replace("/onboarding/race")} />
          </View>
        }
      >
        <Heading title="We couldn't load your plan" />
        <Callout>{result.error}</Callout>
      </Screen>
    );
  }

  // The shared copy updates when adaptation saves a new version (review screen).
  const saved = current ?? result;
  const { plan } = saved;
  const questions = review?.review.questions.length ?? 0;

  return (
    <Screen>
      <View style={nav.bar}>
        <Wordmark />
        <Pressable onPress={() => router.push("/account")} accessibilityRole="button" accessibilityLabel="Account menu" hitSlop={10} style={nav.menu}>
          <View style={nav.lineLong} />
          <View style={nav.lineShort} />
          <View style={nav.lineLong} />
        </Pressable>
      </View>
      <Dashboard plan={plan} answers={answers} today={today} />
      <View style={{ marginBottom: space.md, gap: space.xs }}>
        {review ? (
          <Button
            kind={questions > 0 ? "primary" : "quiet"}
            title={questions > 0 ? `Your review · ${questions} ${questions === 1 ? "question" : "questions"}` : "Your latest review"}
            onPress={() => router.push("/review")}
          />
        ) : null}
        <Button kind="quiet" title="Log other workout" onPress={() => router.push({ pathname: "/log", params: { id: "new" } })} />
      </View>
      {dismissed
        ? plan.basis.notes.filter((n) => !dismissed.has(n)).map((n) => (
            <Callout key={n} onDismiss={() => dismiss(n)}>{n}</Callout>
          ))
        : null}

      <View style={nav.toggle} accessibilityRole="tablist">
        {(["weeks", "calendar"] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} accessibilityRole="tab" accessibilityState={{ selected: view === v }} style={[nav.tab, view === v && nav.tabOn]}>
            <Text style={[nav.tabText, view === v && { color: color.onAccent }]}>{v === "weeks" ? "WEEKS" : "CALENDAR"}</Text>
          </Pressable>
        ))}
      </View>

      {view === "weeks"
        ? plan.weeks.map((w) => (
            <Week key={w.index} week={w} open={openWeek === w.index} onToggle={() => setOpenWeek(openWeek === w.index ? -1 : w.index)} units={answers.units} logs={logs} today={today} />
          ))
        : <Calendar plan={plan} today={today} units={answers.units} logs={logs} />}

      <Text style={[type.data, { textAlign: "center", marginTop: space.lg }]}>{backend.mode === "demo" ? "Demo mode: built on your phone, not saved." : `Plan version ${saved.version} · saved ${shortDate(localToday(new Date(saved.savedAt)))}. Log sessions and your plan adapts to them.`}</Text>
    </Screen>
  );
}

// ---- Calendar -----------------------------------------------------------------------------------

const MONTH_NAME = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const isoOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Month grid, Monday first. Each day shows its sessions as marks; tap a day to see them. */
function Calendar({ plan, today, units, logs }: { plan: TrainingPlan; today: string; units: Units; logs: Record<string, CompletedWorkout> }) {
  const all = useMemo(() => plan.weeks.flatMap((w) => w.workouts), [plan]);
  const byDate = useMemo(() => {
    const m = new Map<string, PlannedWorkout[]>();
    for (const w of all) m.set(w.date, [...(m.get(w.date) ?? []), w]);
    return m;
  }, [all]);
  const first = plan.weeks[0]!.startDate;
  const last = plan.goal.date;
  const months: { y: number; m: number }[] = [];
  for (let y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7)) - 1; isoOf(y, m, 1) <= last; m === 11 ? (y++, (m = 0)) : m++) months.push({ y, m });
  const startIdx = Math.max(0, months.findIndex((x) => isoOf(x.y, x.m, 1) <= today && today.slice(0, 7) === isoOf(x.y, x.m, 1).slice(0, 7)));
  const [mi, setMi] = useState(startIdx);
  const [selected, setSelected] = useState<string>(all.find((w) => w.date >= today)?.date ?? first);
  const { y, m } = months[mi]!;
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => isoOf(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const dayList = byDate.get(selected) ?? [];

  return (
    <View>
      <View style={cal.head}>
        <Pressable onPress={() => setMi(Math.max(0, mi - 1))} disabled={mi === 0} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10} style={[cal.arrow, mi === 0 && { opacity: 0.3 }]}>
          <Text style={cal.arrowText}>‹</Text>
        </Pressable>
        <Text style={cal.month}>{MONTH_NAME[m]} {y}</Text>
        <Pressable onPress={() => setMi(Math.min(months.length - 1, mi + 1))} disabled={mi === months.length - 1} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10} style={[cal.arrow, mi === months.length - 1 && { opacity: 0.3 }]}>
          <Text style={cal.arrowText}>›</Text>
        </Pressable>
      </View>
      <View style={cal.grid}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <Text key={i} style={cal.dow}>{d}</Text>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <View key={i} style={cal.cell} />;
          const ws = byDate.get(iso) ?? [];
          const race = ws.some((w) => w.type === "race");
          const inPlan = iso >= first && iso <= last;
          return (
            <Pressable
              key={i}
              onPress={() => setSelected(iso)}
              accessibilityRole="button"
              accessibilityLabel={`${iso}, ${ws.length ? ws.map((w) => w.title).join(", ") : "rest"}`}
              style={[cal.cell, cal.day, !inPlan && { opacity: 0.35 }, iso === selected && cal.daySel, race && cal.dayRace]}
            >
              <Text style={[cal.num, iso === today && cal.today, race && { color: color.onAccent }]}>{Number(iso.slice(8))}</Text>
              <View style={cal.marks}>
                {ws.slice(0, 3).map((w) => (
                  <View key={w.id} style={[cal.mark, markStyle(w)]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={cal.legend}>
        <Legend style={markStyle({ sport: "hyrox", type: "compromised_run" } as PlannedWorkout)} label="HYROX" />
        <Legend style={markStyle({ sport: "run", type: "threshold" } as PlannedWorkout)} label="HARD RUN" />
        <Legend style={markStyle({ sport: "run", type: "easy_run" } as PlannedWorkout)} label="EASY RUN" />
        <Legend style={markStyle({ sport: "strength", type: "strength" } as PlannedWorkout)} label="STRENGTH" />
      </View>

      <Text style={[type.eyebrow, { marginTop: space.lg, marginBottom: space.xs }]}>{shortDate(selected)}</Text>
      {dayList.length ? dayList.map((w) => <Session key={w.id} w={w} units={units} log={logs[w.id]} today={today} />) : <Text style={[type.small, { paddingVertical: space.md }]}>Rest day. Nothing planned.</Text>}
    </View>
  );
}

function markStyle(w: Pick<PlannedWorkout, "sport" | "type">) {
  if (w.sport === "hyrox" || w.type === "race") return { backgroundColor: color.accent };
  if (w.sport === "strength") return { borderWidth: 1.5, borderColor: color.accent, backgroundColor: "transparent" };
  if (w.type === "easy_run" || w.type === "long_run" || w.type === "recovery_run") return { backgroundColor: color.muted };
  return { backgroundColor: color.text };
}

function Legend({ style, label }: { style: object; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={[cal.mark, style]} />
      <Text style={[type.data, { fontSize: 10 }]}>{label}</Text>
    </View>
  );
}

const nav = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  menu: { width: 40, height: 32, alignItems: "flex-end", justifyContent: "center", gap: 5 },
  lineLong: { width: 24, height: 2, backgroundColor: color.text },
  lineShort: { width: 16, height: 2, backgroundColor: color.accent },
  toggle: { flexDirection: "row", borderWidth: 1, borderColor: color.line, borderRadius: radius.control, padding: 3, marginBottom: space.md, gap: 3 },
  tab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 4 },
  tabOn: { backgroundColor: color.accent },
  tabText: { fontFamily: font.mono, fontSize: 12, letterSpacing: 1.6, color: color.muted },
});

const cal = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  arrow: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.line, borderRadius: radius.control },
  arrowText: { fontFamily: font.title, fontSize: 24, color: color.text, marginTop: -2 },
  month: { fontFamily: font.mono, fontSize: 14, letterSpacing: 2, color: color.text },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dow: { width: `${100 / 7}%`, textAlign: "center", fontFamily: font.mono, fontSize: 10, letterSpacing: 1, color: color.muted, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 0.9, padding: 2 },
  day: { borderRadius: 4, borderWidth: 1, borderColor: "transparent", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  daySel: { borderColor: color.accent, backgroundColor: color.surface },
  dayRace: { backgroundColor: color.accent },
  num: { fontFamily: font.mono, fontSize: 13, color: color.text },
  today: { color: color.accent, textDecorationLine: "underline" },
  marks: { flexDirection: "row", gap: 3, minHeight: 7 },
  mark: { width: 7, height: 7, borderRadius: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.sm },
});

function Week({ week, open, onToggle, units, logs, today }: { week: PlanWeek; open: boolean; onToggle: () => void; units: Units; logs: Record<string, CompletedWorkout>; today: string }) {
  const run = week.workouts.reduce((m, w) => m + (w.sport === "run" || w.sport === "hyrox" ? w.plannedDistanceMeters ?? 0 : 0), 0);
  const mins = week.workouts.reduce((m, w) => m + w.estimatedMinutes, 0);
  return (
    <View style={[st.week, open && st.weekOpen]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={st.weekHead}>
        <View style={{ flex: 1 }}>
          <Text style={type.eyebrow}>
            {PHASE[week.phase]}
            {week.isRecoveryWeek ? " · lighter week" : ""}
          </Text>
          <Text style={type.title}>Week {week.index + 1}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[type.label, type.figure]}>{distance(run, units)} running</Text>
          <Text style={[type.small, type.figure]}>{minutes(mins)} total</Text>
        </View>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          {week.workouts.map((w) => (
            <Session key={w.id} w={w} units={units} log={logs[w.id]} today={today} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const RUN_TAG = { label: "Run", bg: color.raised, fg: color.text };
const TAG: Partial<Record<PlannedWorkout["sport"], { label: string; bg: string; fg: string }>> = {
  run: RUN_TAG,
  trail_run: RUN_TAG,
  hyrox: { label: "HYROX", bg: color.accent, fg: color.onAccent },
  strength: { label: "Strength", bg: color.accentSoft, fg: color.accent },
};

function Session({ w, units, log, today }: { w: PlannedWorkout; units: Units; log?: CompletedWorkout; today?: string }) {
  const [open, setOpen] = useState(false);
  const key = w.type === "race" || w.type.endsWith("simulation");
  const tag = TAG[w.sport] ?? RUN_TAG;
  return (
    <View style={st.session}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", gap: space.md }}>
        <Text style={[type.small, type.figure, { width: 84, paddingTop: 3 }]}>{shortDate(w.date)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[type.title, { fontSize: 19, lineHeight: 23 }, key && { color: color.accent }]}>{w.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 4 }}>
            <View style={[st.tag, { backgroundColor: tag.bg }]}>
              <Text style={[type.eyebrow, { fontSize: 10, lineHeight: 14, color: tag.fg }]}>{tag.label}</Text>
            </View>
            <Text style={[type.small, type.figure]}>{minutes(w.estimatedMinutes)}</Text>
            {log ? <Text style={[type.eyebrow, { fontSize: 10, lineHeight: 14, color: log.status === "skipped" ? color.muted : color.accent }]}>{logBadge(log)}</Text> : null}
          </View>
        </View>
        <Text style={[type.title, { color: color.muted }]}>{open ? "−" : "+"}</Text>
      </Pressable>
      {open ? (
        <View style={{ marginTop: space.md, gap: space.md }}>
          <Text style={type.strong}>{w.objective}</Text>
          <View>
            <Text style={[type.eyebrow, { marginBottom: space.sm }]}>The work</Text>
            <View style={st.work}>
              {w.steps.map((s, i) => (
                <Step key={i} s={s} units={units} />
              ))}
            </View>
          </View>
          <View>
            <Text style={[type.eyebrow, { marginBottom: 4 }]}>Why</Text>
            <Text style={type.explain}>{w.rationale}</Text>
          </View>
          <View>
            <Text style={[type.eyebrow, { marginBottom: 4 }]}>Make it easier</Text>
            <Text style={type.explain}>{w.scaling.easier}</Text>
          </View>
          {today && w.date <= today ? (
            <Button kind={log ? "quiet" : "primary"} title={log ? "Edit log" : "Log session"} onPress={() => router.push({ pathname: "/log", params: { id: w.id } })} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** One line of work: what to do in semibold, the target in regular, extras in small type. */
function Step({ s, units }: { s: WorkoutStep; units: Units }) {
  const reps = s.repeat && s.repeat > 1 ? `${s.repeat} × ` : "";
  const between = s.recoveryBetween ? `${minutesSeconds(s.recoveryBetween.durationSeconds)} ${s.recoveryBetween.note?.toLowerCase() ?? "rest"} between` : null;
  if (s.exercise) {
    return (
      <Line>
        <Text style={type.strong}>{s.exercise.name}</Text>
        <Text style={[type.body, type.figure]}>{s.exercise.prescription}</Text>
      </Line>
    );
  }
  if (s.station) {
    const sp = s.station;
    return (
      <Line accent={color.text}>
        <Text style={type.strong}>
          {reps}
          {sp.recommended?.name ?? "No option available"}
        </Text>
        <Text style={[type.body, type.figure]}>
          {sp.volume}
          {sp.raceLoad ? ` at ${sp.raceLoad}` : ""}
        </Text>
        {sp.load ? <Text style={type.small}>{sp.load}</Text> : null}
        {between ? <Text style={type.small}>{between}</Text> : null}
        {sp.alternatives.length ? <Text style={type.small}>Or: {sp.alternatives.map((a) => a.name).join(", ")}</Text> : null}
        {sp.unavailableNote ? <Callout tone={sp.recommended ? "note" : "safety"}>{sp.unavailableNote}</Callout> : null}
      </Line>
    );
  }
  // HYROX run segments keep their official 1 km label (D-007).
  const amount = s.distanceMeters === 1000 ? `1 km${units === "mi" ? " (0.62 mi)" : ""}` : s.distanceMeters ? distance(s.distanceMeters, units) : s.durationSeconds ? minutesSeconds(s.durationSeconds) : "";
  const target = s.target.pace ? paceRange(s.target.pace.fastSecPerKm, s.target.pace.slowSecPerKm, units) : `effort ${s.target.rpe.min}–${s.target.rpe.max} out of 10`;
  const what = { warmup: "Warm-up", cooldown: "Cool-down", recovery: "Rest", work: "", steady: "", station: "" }[s.kind];
  const quiet = s.kind === "warmup" || s.kind === "cooldown" || s.kind === "recovery";
  return (
    <Line accent={quiet ? color.line : color.accent}>
      <Text style={quiet ? type.body : type.strong}>
        {what ? `${what}: ` : ""}
        {reps}
        {amount}
      </Text>
      {s.kind === "recovery" ? null : <Text style={[type.body, type.figure]}>at {target}</Text>}
      {s.note ? <Text style={type.small}>{s.note}</Text> : null}
      {between ? <Text style={type.small}>{between}</Text> : null}
    </Line>
  );
}

function Line({ children, accent = color.accent }: { children: ReactNode; accent?: string }) {
  return <View style={[st.line, { borderLeftColor: accent }]}>{children}</View>;
}

const minutesSeconds = (sec: number): string => (sec < 120 ? `${Math.round(sec)} s` : sec % 60 === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`);

const C = 12;
const hud = StyleSheet.create({
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: 4, padding: space.lg, gap: space.lg, marginBottom: space.lg },
  corner: { position: "absolute", width: C, height: C, borderColor: color.accent },
  tl: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  tags: { fontFamily: font.mono, fontSize: 11, letterSpacing: 1.2, color: color.accent },
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  rowTight: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  race: { fontFamily: font.display, fontSize: 30, lineHeight: 32, letterSpacing: 0.5, color: color.text },
  date: { fontFamily: font.mono, fontSize: 12, letterSpacing: 1, color: color.muted, marginTop: 4 },
  count: { fontFamily: font.monoBold, fontSize: 52, lineHeight: 54, color: color.accent, letterSpacing: -2 },
  label: { fontFamily: font.mono, fontSize: 10, letterSpacing: 1.4, color: color.muted },
  strip: { flexDirection: "row", gap: 2 },
  tick: { flex: 1, height: 8, backgroundColor: color.raised },
  tickDone: { backgroundColor: "#6B5A1C" },
  tickNow: { backgroundColor: color.accent },
  tickTaper: { backgroundColor: color.line },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  stat: { flexBasis: "47%", flexGrow: 1, backgroundColor: color.bg, borderRadius: 4, padding: space.md, gap: 2, minWidth: 0 },
  value: { fontFamily: font.monoBold, fontSize: 24, lineHeight: 30, color: color.text },
  unit: { fontFamily: font.mono, fontSize: 11, letterSpacing: 1, color: color.accent },
  sub: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted },
  next: { borderLeftWidth: 3, borderLeftColor: color.accent, paddingLeft: space.md, gap: 2 },
  nextTitle: { fontFamily: font.title, fontSize: 20, lineHeight: 24, color: color.text },
  data: { fontFamily: font.mono, fontSize: 12, color: color.muted },
});

const st = StyleSheet.create({
  week: { marginBottom: space.sm, borderRadius: radius.row, borderWidth: 1, borderColor: color.line },
  weekOpen: { backgroundColor: color.surface, borderColor: color.surface },
  weekHead: { padding: space.lg, flexDirection: "row", alignItems: "flex-end" },
  session: { borderTopWidth: 1, borderTopColor: color.bg, paddingVertical: space.md },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  work: { gap: space.sm },
  line: { borderLeftWidth: 3, paddingLeft: space.md, paddingVertical: 2 },
});
