/**
 * Log a planned session (D-025): done / partly done / skipped, time, distance (runs), effort,
 * pain, fatigue and soreness, note. Opened from a session on the plan; saving again edits the log.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { LOG_BODY_AREAS, LOG_SCALES } from "@adaptive-athlete/engine";
import { Button, Callout, Choice, Field, Heading, Pills, Question, Screen } from "@/components/ui";
import { backend } from "@/data";
import { minutes, shortDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { space } from "@/lib/theme";
import { asksDistance, BODY_AREA_LABELS, formFor, toManualLog, type FormErrors, type LogForm } from "@/logging/form";

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const scale = (lo: number, hi: number) => range(lo, hi).map((n) => ({ value: n, label: String(n) }));

export default function LogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, logs, putLog, answers } = useSession();
  const workout = plan?.plan.weeks.flatMap((w) => w.workouts).find((w) => w.id === id);
  const existing = id ? logs[id] : undefined;
  const [form, setForm] = useState<LogForm | null>(() => (workout ? formFor(workout, answers.units, existing) : null));
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!workout || !form) {
    return (
      <Screen footer={<Button title="Back to my plan" onPress={() => router.replace("/plan")} />}>
        <Heading title="Session not found" detail="Open the session from your plan to log it." />
      </Screen>
    );
  }

  const set = (patch: Partial<LogForm>) => {
    setForm({ ...form, ...patch });
    setErrors({});
  };
  const done = form.status !== null && form.status !== "skipped";
  const unit = answers.units === "mi" ? "miles" : "km";

  const save = async () => {
    const result = toManualLog(form, workout, answers.units);
    if ("errors" in result) return setErrors(result.errors);
    setBusy(true);
    setSaveError(null);
    try {
      putLog(await backend.saveLog(result.log, existing?.id ?? null));
      // Adapt the plan to this log and show what changed (D-026).
      router.replace({ pathname: "/review", params: { run: "1" } });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Your log couldn't be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button title={existing ? "Save changes" : "Save log"} onPress={save} busy={busy} />
          <Button kind="quiet" title="Cancel" onPress={() => router.back()} />
        </View>
      }
    >
      <Heading title={workout.title} detail={`${shortDate(workout.date)} · planned ${minutes(workout.estimatedMinutes)}`} />
      {saveError ? <Callout tone="safety">{saveError}</Callout> : null}

      <Question label="Did you do it?" error={errors.status}>
        <Choice label="Done" selected={form.status === "completed"} onPress={() => set({ status: "completed" })} />
        <Choice label="Partly done" detail="Cut short or changed" selected={form.status === "partial"} onPress={() => set({ status: "partial" })} />
        <Choice label="Skipped" selected={form.status === "skipped"} onPress={() => set({ status: "skipped" })} />
      </Question>

      {done ? (
        <>
          <Question label="How long did it take?" help="Minutes, including warm-up." error={errors.duration}>
            <Field value={form.minutes} onChangeText={(v) => set({ minutes: v })} keyboardType="number-pad" invalid={!!errors.duration} accessibilityLabel="Minutes" />
          </Question>

          {asksDistance(workout) ? (
            <Question label={`Distance (${unit})`} help="Optional." error={errors.distance}>
              <Field value={form.distance} onChangeText={(v) => set({ distance: v })} keyboardType="decimal-pad" invalid={!!errors.distance} accessibilityLabel={`Distance in ${unit}`} />
            </Question>
          ) : null}

          <Question label="How hard was it?" help="0 = rest, 5 = hard, 10 = all-out." error={errors.rpe}>
            <Pills label="Effort" options={scale(...LOG_SCALES.rpe)} isOn={(v) => form.rpe === v} onToggle={(v) => set({ rpe: v })} />
          </Question>

          <Question label="Did anything hurt?" help="Pain, not normal training soreness." error={errors.pain}>
            <Choice label="No" selected={form.hurt === false} onPress={() => set({ hurt: false, painLevel: null, painArea: null, painAltered: null, painSharp: null, painStopped: null })} />
            <Choice label="Yes" selected={form.hurt === true} onPress={() => set({ hurt: true })} />
          </Question>

          {form.hurt ? (
            <>
              <Question label="How bad, from 1 to 10?" error={form.painLevel === null ? errors.pain : undefined}>
                <Pills label="Pain level" options={scale(...LOG_SCALES.pain)} isOn={(v) => form.painLevel === v} onToggle={(v) => set({ painLevel: v })} />
              </Question>
              <Question label="Where?" error={errors.painLocation}>
                {LOG_BODY_AREAS.map((a) => (
                  <Choice key={a} label={BODY_AREA_LABELS[a]} selected={form.painArea === a} onPress={() => set({ painArea: a })} />
                ))}
              </Question>
              <Question label="Was it sharp?" error={errors.painSharp}>
                <Choice label="No" selected={form.painSharp === false} onPress={() => set({ painSharp: false })} />
                <Choice label="Yes" selected={form.painSharp === true} onPress={() => set({ painSharp: true })} />
              </Question>
              <Question label="Did it make you stop the session?" error={errors.painStopped}>
                <Choice label="No" selected={form.painStopped === false} onPress={() => set({ painStopped: false })} />
                <Choice label="Yes" selected={form.painStopped === true} onPress={() => set({ painStopped: true })} />
              </Question>
              <Question label="Did it change how you moved?" error={errors.painAltered}>
                <Choice label="No" selected={form.painAltered === false} onPress={() => set({ painAltered: false })} />
                <Choice label="Yes" selected={form.painAltered === true} onPress={() => set({ painAltered: true })} />
              </Question>
              {(form.painLevel ?? 0) >= 7 || form.painAltered || form.painSharp || form.painStopped ? (
                <Callout tone="safety">
                  If the pain is sharp, getting worse or changing how you move, rest that area and check with a physio or coach before training it again.
                </Callout>
              ) : null}
            </>
          ) : null}

          <Question label="Overall fatigue" help="1 = fresh, 5 = exhausted. Optional." error={errors.fatigue}>
            <Pills label="Fatigue" options={scale(...LOG_SCALES.fatigue)} isOn={(v) => form.fatigue === v} onToggle={(v) => set({ fatigue: form.fatigue === v ? null : v })} />
          </Question>
          <Question label="Muscle soreness" help="1 = none, 5 = very sore. Optional." error={errors.soreness}>
            <Pills label="Soreness" options={scale(...LOG_SCALES.soreness)} isOn={(v) => form.soreness === v} onToggle={(v) => set({ soreness: form.soreness === v ? null : v })} />
          </Question>
        </>
      ) : null}

      <Question label="Note" help="Optional." error={errors.notes}>
        <Field value={form.notes} onChangeText={(v) => set({ notes: v })} multiline maxLength={2000} style={{ minHeight: 88, textAlignVertical: "top" }} accessibilityLabel="Note" />
      </Question>
    </Screen>
  );
}
