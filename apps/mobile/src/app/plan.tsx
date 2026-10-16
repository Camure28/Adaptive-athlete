/**
 * Plan preview. The plan is generated on the device from the saved answers by the same engine that
 * will run on the server. Saving plans server-side (so adaptations have a history) is the next step;
 * until then this screen says plainly that the plan isn't stored.
 */
import { router } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { generateHyroxPlan, HyroxPlanError, type PlannedWorkout, type PlanWeek, type TrainingPlan, type WorkoutStep } from "@adaptive-athlete/engine";
import { Button, Callout, Heading, Screen } from "@/components/ui";
import { backend } from "@/data";
import { dashboardStats } from "@/lib/dashboard";
import { distance, minutes, paceRange, shortDate } from "@/lib/format";
import { localToday, useSession } from "@/lib/session";
import { color, font, radius, space, type } from "@/lib/theme";
import { toEngineInputs, type OnboardingAnswers, type Units } from "@/onboarding/model";

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
  const { answers, setAccount } = useSession();
  const today = localToday();
  const result = useMemo((): { plan: TrainingPlan } | { error: string } => {
    try {
      const { athlete, goal } = toEngineInputs(answers, today);
      return { plan: generateHyroxPlan(athlete, goal, { planId: "preview", today, now: new Date().toISOString() }) };
    } catch (e) {
      return { error: e instanceof HyroxPlanError ? e.message : "Your answers are incomplete. Go back and finish onboarding." };
    }
  }, [answers, today]);
  const [openWeek, setOpenWeek] = useState(0);

  if ("error" in result) {
    return (
      <Screen footer={<Button title="Edit my answers" onPress={() => router.replace("/onboarding/race")} />}>
        <Heading title="We couldn't build your plan" />
        <Callout>{result.error}</Callout>
      </Screen>
    );
  }

  const { plan } = result;

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button title="Edit my answers" onPress={() => router.push("/onboarding/race")} />
          <Button kind="quiet" title="Sign out" onPress={async () => { await backend.signOut(); setAccount(null); router.replace("/sign-in"); }} />
        </View>
      }
    >
      <Dashboard plan={plan} answers={answers} today={today} />
      <Callout>This plan is built on your phone from your answers. Saving it, logging workouts and automatic adjustments come next.</Callout>
      {plan.basis.notes.map((n) => (
        <Callout key={n}>{n}</Callout>
      ))}

      {plan.weeks.map((w) => (
        <Week key={w.index} week={w} open={openWeek === w.index} onToggle={() => setOpenWeek(openWeek === w.index ? -1 : w.index)} units={answers.units} />
      ))}
    </Screen>
  );
}

function Week({ week, open, onToggle, units }: { week: PlanWeek; open: boolean; onToggle: () => void; units: Units }) {
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
            <Session key={w.id} w={w} units={units} />
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

function Session({ w, units }: { w: PlannedWorkout; units: Units }) {
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
