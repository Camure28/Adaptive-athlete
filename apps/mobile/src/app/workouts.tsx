/**
 * Recent workouts: everything logged in the last 2 weeks (the same window other workouts can be
 * logged in, so every row can be edited), planned or not, newest first. Tap one to
 * edit it; saving runs adaptation again (D-025, D-026).
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { addDays, type CompletedWorkout } from "@adaptive-athlete/engine";
import { TechLoader } from "@/components/loader";
import { Button, Callout, Heading, Screen } from "@/components/ui";
import { backend } from "@/data";
import { shortDate } from "@/lib/format";
import { localToday, useSession } from "@/lib/session";
import { color, radius, space, type } from "@/lib/theme";
import { logBadge, logSummary, logTitle, OTHER_WORKOUT_DAYS } from "@/logging/form";

const RECENT_DAYS = OTHER_WORKOUT_DAYS;

export default function WorkoutsScreen() {
  const { plan, recent, setRecent, answers } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      backend
        .listRecentLogs(addDays(localToday(), -(RECENT_DAYS - 1)))
        .then((logs) => live && (setRecent(logs), setError(null)))
        .catch((e) => live && setError(e instanceof Error ? e.message : "Your workouts couldn't be loaded."))
        .finally(() => live && setLoading(false));
      return () => {
        live = false;
      };
    }, [setRecent]),
  );

  const titles = new Map((plan?.plan.weeks ?? []).flatMap((w) => w.workouts).map((w) => [w.id, w.title]));
  const open = (c: CompletedWorkout) =>
    router.push(c.plannedWorkoutId ? { pathname: "/log", params: { id: c.plannedWorkoutId } } : { pathname: "/log", params: { id: "new", log: c.id } });

  if (loading && recent.length === 0) return <TechLoader lines={["Loading your workouts"]} />;

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button title="Log other workout" onPress={() => router.push({ pathname: "/log", params: { id: "new" } })} />
          <Button kind="quiet" title="Back to my plan" onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
        </View>
      }
    >
      <Heading title="Recent workouts" detail={`The last ${RECENT_DAYS / 7} weeks. Tap one to change it.`} />
      {error ? <Callout tone="safety">{error}</Callout> : null}
      {recent.length === 0 && !error ? (
        <Text style={type.body}>Nothing logged yet. Log a session from your plan, or a workout that wasn't in it.</Text>
      ) : null}
      {recent.map((c) => {
        const summary = logSummary(c, answers.units);
        const hurt = !!c.pain && c.pain.level > 0;
        return (
          <Pressable key={c.id} onPress={() => open(c)} accessibilityRole="button" style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]}>
            <Text style={[type.small, type.figure, { width: 84, paddingTop: 3 }]}>{shortDate(c.date)}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.strong}>{logTitle(c, c.plannedWorkoutId ? titles.get(c.plannedWorkoutId) : undefined)}</Text>
              <Text style={[type.eyebrow, { fontSize: 10, lineHeight: 14, color: hurt ? color.safety : c.status === "skipped" ? color.muted : color.accent }]}>
                {logBadge(c)}
                {c.plannedWorkoutId ? "" : " · NOT IN PLAN"}
              </Text>
              {summary ? <Text style={type.small}>{summary}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.row,
    backgroundColor: color.raised,
  },
});
