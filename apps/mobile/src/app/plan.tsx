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
import { distance, longDate, minutes, paceRange, shortDate } from "@/lib/format";
import { localToday, useSession } from "@/lib/session";
import { color, radius, space, type } from "@/lib/theme";
import { toEngineInputs, type Units } from "@/onboarding/model";

const PHASE: Record<PlanWeek["phase"], string> = { base: "Base", build: "Build", peak: "Peak", taper: "Taper" };

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
  const raceDate = plan.goal.date;
  const sims = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.type === "full_simulation");

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button title="Edit my answers" onPress={() => router.push("/onboarding/race")} />
          <Button kind="quiet" title="Sign out" onPress={async () => { await backend.signOut(); setAccount(null); router.replace("/sign-in"); }} />
        </View>
      }
    >
      <Heading
        title={`${plan.weeks.length} weeks to race day`}
        detail={`Racing ${longDate(raceDate)}. ${sims.length === 1 ? "One full race simulation" : `${sims.length} full race simulations`}, the last on ${longDate(sims.at(-1)?.date ?? raceDate)}.`}
      />
      <Callout>This is a preview built on your phone from your answers. Saving your plan, logging workouts and automatic adjustments come next.</Callout>
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

const RUN_TAG = { label: "Run", bg: color.turfSoft, fg: color.turf };
const TAG: Partial<Record<PlannedWorkout["sport"], { label: string; bg: string; fg: string }>> = {
  run: RUN_TAG,
  trail_run: RUN_TAG,
  hyrox: { label: "HYROX", bg: color.ink, fg: color.surface },
  strength: { label: "Strength", bg: color.note, fg: color.ink },
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
          <Text style={[type.title, { fontSize: 19, lineHeight: 23 }, key && { color: color.turf }]}>{w.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 4 }}>
            <View style={[st.tag, { backgroundColor: tag.bg }]}>
              <Text style={[type.eyebrow, { fontSize: 10, lineHeight: 14, color: tag.fg }]}>{tag.label}</Text>
            </View>
            <Text style={[type.small, type.figure]}>{minutes(w.estimatedMinutes)}</Text>
          </View>
        </View>
        <Text style={[type.title, { color: color.iron }]}>{open ? "−" : "+"}</Text>
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
      <Line accent={color.ink}>
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
    <Line accent={quiet ? color.rule : color.turf}>
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

function Line({ children, accent = color.turf }: { children: ReactNode; accent?: string }) {
  return <View style={[st.line, { borderLeftColor: accent }]}>{children}</View>;
}

const minutesSeconds = (sec: number): string => (sec < 120 ? `${Math.round(sec)} s` : sec % 60 === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`);

const st = StyleSheet.create({
  week: { marginBottom: space.sm, borderRadius: radius.row, borderWidth: 1, borderColor: color.rule },
  weekOpen: { backgroundColor: color.surface, borderColor: color.surface },
  weekHead: { padding: space.lg, flexDirection: "row", alignItems: "flex-end" },
  session: { borderTopWidth: 1, borderTopColor: color.concrete, paddingVertical: space.md },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  work: { gap: space.sm },
  line: { borderLeftWidth: 3, paddingLeft: space.md, paddingVertical: 2 },
});
