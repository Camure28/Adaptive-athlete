/**
 * The athlete's plan: the current saved version (D-022). Plans are built and stored on the server
 * from the saved answers; if this account has no plan yet, one is built on first open.
 */
import { router } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CompletedWorkout, PlannedWorkout, PlanWeek, TrainingPlan, WorkoutStep } from "@adaptive-athlete/engine";
import { TechLoader } from "@/components/loader";
import { Button, Callout, Dot, Heading, Ring, Screen, Wordmark } from "@/components/ui";
import { backend, type SavedPlan } from "@/data";
import { dashboardStats } from "@/lib/dashboard";
import { useDismissedNotes } from "@/lib/dismissed";
import { distance, minutes, paceRange, shortDate } from "@/lib/format";
import { localToday, useSession } from "@/lib/session";
import { color, font, kind, radius, space, type } from "@/lib/theme";
import { logBadge } from "@/logging/form";
import type { OnboardingAnswers, Units } from "@/onboarding/model";

const PHASE: Record<PlanWeek["phase"], string> = { base: "Base", build: "Build", peak: "Peak", taper: "Taper" };
const LEVEL: Record<string, string> = { first_timer: "First-timer", intermediate: "Intermediate", advanced: "Advanced", competitive: "Competitive" };
const DIVISION: Record<string, string> = { women_open: "Women Open", women_pro: "Women Pro", men_open: "Men Open", men_pro: "Men Pro" };
const STATUS: Record<string, string> = { building: "Building up", consistent: "Training consistently", race_ready: "Race-ready" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** "Saturday, Feb 27" */
const longDay = (iso: string) => { const d = utc(iso); return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
/** "Mon, Oct 19" */
const shortDay = (iso: string) => { const d = utc(iso); return `${DOW[d.getUTCDay()]!.slice(0, 3)}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };

/** Personal banner: the race, a countdown ring for the plan, this week at a glance, and what's next. */
function Dashboard({ plan, answers, today }: { plan: TrainingPlan; answers: OnboardingAnswers; today: string }) {
  const d = dashboardStats(plan, today);
  const chips = [answers.level && LEVEL[answers.level], answers.division && DIVISION[answers.division], answers.trainingStatus && STATUS[answers.trainingStatus]].filter((x): x is string => !!x);
  const race = answers.eventLabel || "Race day";
  const progress = d.started ? d.weekNumber / d.totalWeeks : 0;
  return (
    <View accessibilityRole="summary" style={{ marginBottom: space.lg }}>
      <Text style={type.small}>Your race</Text>
      <Text style={[type.display, { fontSize: 28, lineHeight: 34 }]} numberOfLines={2}>{race}</Text>
      <Text style={[type.small, { marginTop: 2 }]}>{longDay(d.raceDate)}, {d.raceDate.slice(0, 4)}</Text>
      <View style={hud.chips}>
        {chips.map((c) => (
          <View key={c} style={hud.chip}>
            <Text style={hud.chipText}>{c}</Text>
          </View>
        ))}
      </View>

      <View style={hud.hero}>
        <Ring size={196} stroke={10} progress={progress}>
          <Text style={hud.count} accessibilityLabel={`${d.daysToRace} days to race`}>{d.daysToRace}</Text>
          <Text style={type.small}>days to go</Text>
        </Ring>
        <Text style={[type.label, { marginTop: space.lg }]}>
          Week {d.weekNumber} of {d.totalWeeks}, {PHASE[d.week.phase].toLowerCase()}{d.week.isRecoveryWeek ? " (lighter week)" : ""}
        </Text>
        {!d.started ? <Text style={type.small}>Starts {shortDay(d.week.startDate)}</Text> : null}
      </View>

      <View style={hud.grid}>
        <Stat label="This week" value={`${d.thisWeek.sessions}`} unit={d.thisWeek.sessions === 1 ? "session" : "sessions"} sub={`${d.thisWeek.hard} hard, ${minutes(d.thisWeek.minutes)}`} />
        <Stat label="Running" value={distance(d.thisWeek.runMeters, answers.units).split(" ")[0]!} unit={answers.units} sub="planned this week" />
        <Stat
          label="Race effort"
          value={d.threshold ? paceRange(d.threshold.fastSecPerKm, d.threshold.slowSecPerKm, answers.units).replace(`/${answers.units}`, "") : "RPE 7–8"}
          unit={d.threshold ? `/${answers.units}` : ""}
          sub={d.threshold ? "estimated from your benchmark" : "no benchmark yet"}
          small
        />
        <Stat label="Full simulations" value={`${d.fullSims.total}`} unit="planned" sub={d.fullSims.next ? `next ${shortDay(d.fullSims.next).slice(5)}` : "none left"} />
      </View>

      {d.next ? (
        <View style={hud.next}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Dot tint={kindTint(d.next)} />
            <Text style={type.small}>Next up, {shortDay(d.next.date)}</Text>
          </View>
          <Text style={[type.title, { marginTop: 4 }]} numberOfLines={2}>{d.next.title}</Text>
          <Text style={[type.small, type.figure]}>{minutes(d.next.estimatedMinutes)}{d.next.plannedDistanceMeters ? `, ${distance(d.next.plannedDistanceMeters, answers.units)}` : ""}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, unit, sub, small = false }: { label: string; value: string; unit: string; sub: string; small?: boolean }) {
  return (
    <View style={hud.stat}>
      <Text style={type.small}>{label}</Text>
      <Text style={[hud.value, small && { fontSize: 22, lineHeight: 30 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={hud.unit}> {unit}</Text> : null}
      </Text>
      <Text style={type.data} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

/** The dot colour for a session. */
function kindTint(w: Pick<PlannedWorkout, "sport" | "type">): string {
  if (w.sport === "hyrox" || w.type === "race") return kind.hyrox;
  if (w.sport === "strength") return kind.strength;
  if (w.type === "rest") return kind.rest;
  if (w.type === "easy_run" || w.type === "long_run" || w.type === "recovery_run" || w.type === "strides") return kind.easy;
  return kind.hard;
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

  if (!result) return <TechLoader lines={["Loading your plan", "Building your plan"]} stage={stage} />;

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
          <Text style={nav.initial}>{(account?.email ?? "A").slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>
      <Dashboard plan={plan} answers={answers} today={today} />
      <View style={{ marginBottom: space.lg, gap: space.sm }}>
        {review ? (
          <Button
            kind={questions > 0 ? "primary" : "soft"}
            title={questions > 0 ? `Your review: ${questions} ${questions === 1 ? "question" : "questions"}` : "Your latest review"}
            onPress={() => router.push("/review")}
          />
        ) : null}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button kind="soft" title="Recent workouts" onPress={() => router.push("/workouts")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button kind="soft" title="Log other workout" onPress={() => router.push({ pathname: "/log", params: { id: "new" } })} />
          </View>
        </View>
      </View>
      {dismissed
        ? plan.basis.notes.filter((n) => !dismissed.has(n)).map((n) => (
            <Callout key={n} onDismiss={() => dismiss(n)}>{n}</Callout>
          ))
        : null}

      <View style={nav.toggle} accessibilityRole="tablist">
        {(["weeks", "calendar"] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} accessibilityRole="tab" accessibilityState={{ selected: view === v }} style={[nav.tab, view === v && nav.tabOn]}>
            <Text style={[nav.tabText, view === v && { color: color.text }]}>{v === "weeks" ? "Weeks" : "Calendar"}</Text>
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

const MONTH_NAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
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
                {ws.filter((w) => w.type !== "rest").slice(0, 3).map((w) => (
                  <Dot key={w.id} tint={race ? color.onAccent : kindTint(w)} size={6} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={cal.legend}>
        <Legend tint={kind.hyrox} label="HYROX" />
        <Legend tint={kind.hard} label="Hard run" />
        <Legend tint={kind.easy} label="Easy run" />
        <Legend tint={kind.strength} label="Strength" />
      </View>

      <Text style={[type.label, { marginTop: space.xl, marginBottom: space.xs }]}>{longDay(selected)}</Text>
      {dayList.length ? dayList.map((w) => <Session key={w.id} w={w} units={units} log={logs[w.id]} today={today} />) : <Text style={[type.small, { paddingVertical: space.md }]}>Rest day. Nothing planned.</Text>}
    </View>
  );
}

function Legend({ tint, label }: { tint: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Dot tint={tint} size={7} />
      <Text style={type.data}>{label}</Text>
    </View>
  );
}

const nav = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xl },
  menu: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: font.semibold, fontSize: 16, color: color.text },
  toggle: { flexDirection: "row", backgroundColor: color.surface, borderRadius: radius.pill, padding: 4, marginBottom: space.lg, gap: 4 },
  tab: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  tabOn: { backgroundColor: color.raised },
  tabText: { fontFamily: font.medium, fontSize: 15, color: color.muted },
});

const cal = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md },
  arrow: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: color.surface, borderRadius: 20 },
  arrowText: { fontFamily: font.medium, fontSize: 22, color: color.text, marginTop: -2 },
  month: { fontFamily: font.semibold, fontSize: 18, color: color.text },
  grid: { flexDirection: "row", flexWrap: "wrap", backgroundColor: color.surface, borderRadius: radius.card, padding: space.sm },
  dow: { width: `${100 / 7}%`, textAlign: "center", fontFamily: font.medium, fontSize: 12, color: color.faint, paddingVertical: 8 },
  cell: { width: `${100 / 7}%`, aspectRatio: 0.92, padding: 3 },
  day: { borderRadius: 14, alignItems: "center", justifyContent: "space-between", paddingVertical: 7 },
  daySel: { backgroundColor: color.raised },
  dayRace: { backgroundColor: color.accent },
  num: { fontFamily: font.medium, fontSize: 15, color: color.text },
  today: { color: color.accent, fontFamily: font.bold },
  marks: { flexDirection: "row", gap: 3, minHeight: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, marginTop: space.md, paddingHorizontal: space.xs },
});

function Week({ week, open, onToggle, units, logs, today }: { week: PlanWeek; open: boolean; onToggle: () => void; units: Units; logs: Record<string, CompletedWorkout>; today: string }) {
  const run = week.workouts.reduce((m, w) => m + (w.sport === "run" || w.sport === "hyrox" ? w.plannedDistanceMeters ?? 0 : 0), 0);
  const mins = week.workouts.reduce((m, w) => m + w.estimatedMinutes, 0);
  return (
    <View style={st.week}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={st.weekHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.title}>Week {week.index + 1}</Text>
          <Text style={type.small}>
            {PHASE[week.phase]}
            {week.isRecoveryWeek ? ", lighter week" : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text style={[type.label, type.figure]}>{distance(run, units)} running</Text>
          <Text style={[type.small, type.figure]}>{minutes(mins)} total</Text>
        </View>
        <Text style={[st.chev, open && st.chevOpen]}>›</Text>
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

const KIND_LABEL: Partial<Record<PlannedWorkout["sport"], string>> = { run: "Run", trail_run: "Run", hyrox: "HYROX", strength: "Strength" };

function Session({ w, units, log, today }: { w: PlannedWorkout; units: Units; log?: CompletedWorkout; today?: string }) {
  const [open, setOpen] = useState(false);
  const key = w.type === "race" || w.type.endsWith("simulation");
  const label = w.type === "rest" ? "Rest" : (KIND_LABEL[w.sport] ?? "Session");
  return (
    <View style={st.session}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={[st.badge, key && { backgroundColor: color.accentSoft }]}>
          <Dot tint={kindTint(w)} size={10} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.small, type.figure]}>{shortDay(w.date)}</Text>
          <Text style={[st.sessionTitle, key && { color: color.accent }]}>{w.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 }}>
            <Text style={[type.small, type.figure]}>
              {label}, {minutes(w.estimatedMinutes)}
            </Text>
            {log ? (
              <View style={[st.logged, log.status === "skipped" && { backgroundColor: color.raised }]}>
                <Text style={[st.loggedText, log.status === "skipped" && { color: color.muted }]}>{logBadge(log)}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={[st.chev, open && st.chevOpen]}>›</Text>
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

const hud = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  chip: { backgroundColor: color.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  chipText: { fontFamily: font.medium, fontSize: 13, color: color.muted },
  hero: { alignItems: "center", backgroundColor: color.surface, borderRadius: radius.card, paddingVertical: 28, marginTop: space.xl, marginBottom: space.sm },
  count: { fontFamily: font.semibold, fontSize: 56, lineHeight: 62, letterSpacing: -1.5, color: color.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  stat: { flexBasis: "47%", flexGrow: 1, backgroundColor: color.surface, borderRadius: radius.row, paddingVertical: space.lg, paddingHorizontal: space.lg, gap: 2, minWidth: 0 },
  value: { fontFamily: font.semibold, fontSize: 28, lineHeight: 36, letterSpacing: -0.5, color: color.text },
  unit: { fontFamily: font.regular, fontSize: 15, letterSpacing: 0, color: color.muted },
  next: { backgroundColor: color.surface, borderRadius: radius.row, padding: space.lg, marginTop: space.sm },
});

const st = StyleSheet.create({
  week: { marginBottom: space.sm, borderRadius: radius.row, backgroundColor: color.surface, overflow: "hidden" },
  weekHead: { paddingVertical: space.lg, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", gap: space.md },
  chev: { fontFamily: font.medium, fontSize: 22, lineHeight: 24, color: color.faint, transform: [{ rotate: "90deg" }] },
  chevOpen: { transform: [{ rotate: "-90deg" }] },
  session: { paddingVertical: space.md },
  sessionTitle: { fontFamily: font.semibold, fontSize: 17, lineHeight: 23, color: color.text },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.raised, alignItems: "center", justifyContent: "center" },
  logged: { backgroundColor: color.accentSoft, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  loggedText: { fontFamily: font.medium, fontSize: 12, color: color.accent },
  work: { gap: space.sm },
  line: { borderLeftWidth: 2, borderRadius: 1, paddingLeft: space.md, paddingVertical: 2 },
});
