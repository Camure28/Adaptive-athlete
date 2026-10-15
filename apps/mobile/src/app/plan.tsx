/**
 * Plan preview. The plan is generated on the device from the saved answers by the same engine that
 * will run on the server. Saving plans server-side (so adaptations have a history) is the next step;
 * until then this screen says plainly that the plan isn't stored.
 */
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
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
    <View style={{ marginBottom: space.sm, borderRadius: radius.row, backgroundColor: open ? color.surface : "transparent", borderWidth: 1, borderColor: open ? color.surface : color.rule }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ padding: space.lg, flexDirection: "row", alignItems: "baseline" }}>
        <View style={{ flex: 1 }}>
          <Text style={type.title}>Week {week.index + 1}</Text>
          <Text style={type.small}>
            {PHASE[week.phase]}
            {week.isRecoveryWeek ? ", lighter week" : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[type.label, type.figure]}>{distance(run, units)} running</Text>
          <Text style={[type.small, type.figure]}>{minutes(mins)} total</Text>
        </View>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
          {week.workouts.map((w) => (
            <Session key={w.id} w={w} units={units} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Session({ w, units }: { w: PlannedWorkout; units: Units }) {
  const [open, setOpen] = useState(false);
  const key = w.type === "race" || w.type.endsWith("simulation");
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: color.concrete, paddingVertical: space.md }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", gap: space.md }}>
        <Text style={[type.small, type.figure, { width: 92 }]}>{shortDate(w.date)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, key && { fontWeight: "700", color: color.turf }]}>{w.title}</Text>
          <Text style={type.small}>{minutes(w.estimatedMinutes)}</Text>
        </View>
      </Pressable>
      {open ? (
        <View style={{ marginTop: space.sm, marginLeft: 92 + space.md, gap: space.sm }}>
          <Text style={type.small}>{w.rationale}</Text>
          {w.steps.map((s, i) => (
            <Step key={i} s={s} units={units} />
          ))}
          <Text style={type.small}>Easier option: {w.scaling.easier}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Step({ s, units }: { s: WorkoutStep; units: Units }) {
  const reps = s.repeat && s.repeat > 1 ? `${s.repeat} × ` : "";
  if (s.station) {
    const st = s.station;
    return (
      <View>
        <Text style={type.body}>
          {reps}
          {st.volume}: {st.recommended?.name ?? "no option available"}
          {st.raceLoad ? ` at ${st.raceLoad}` : ""}
        </Text>
        {st.load ? <Text style={type.small}>{st.load}</Text> : null}
        {st.alternatives.length ? <Text style={type.small}>Or: {st.alternatives.map((a) => a.name).join(", ")}</Text> : null}
        {st.unavailableNote ? <Callout tone={st.recommended ? "note" : "safety"}>{st.unavailableNote}</Callout> : null}
      </View>
    );
  }
  // HYROX run segments keep their official 1 km label (D-007).
  const amount = s.distanceMeters === 1000 ? `1 km${units === "mi" ? " (0.62 mi)" : ""}` : s.distanceMeters ? distance(s.distanceMeters, units) : s.durationSeconds ? minutes(Math.round(s.durationSeconds / 60)) : "";
  const target = s.target.pace ? paceRange(s.target.pace.fastSecPerKm, s.target.pace.slowSecPerKm, units) : `effort ${s.target.rpe.min}–${s.target.rpe.max} out of 10`;
  const what = { warmup: "Warm-up", cooldown: "Cool-down", recovery: "Recovery", work: "", steady: "", station: "" }[s.kind];
  return (
    <Text style={type.body}>
      {what ? `${what}: ` : ""}
      {reps}
      {amount}
      {s.kind === "steady" && s.note && !s.distanceMeters ? `: ${s.note}` : ` at ${target}`}
    </Text>
  );
}
