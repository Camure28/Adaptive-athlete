/**
 * Home: today first. Today's session(s) with one-tap logging, this week as a strip of days, the
 * countdown and the week's figures, then quick actions. The full plan lives in the Training tab.
 */
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PlannedWorkout } from "@adaptive-athlete/engine";
import { Countdown, kindTint, longDay, SessionDetails, StatGrid } from "@/components/plan";
import { Button, Callout, Dot, Screen } from "@/components/ui";
import { dashboardStats } from "@/lib/dashboard";
import { useDismissedNotes } from "@/lib/dismissed";
import { distance, minutes } from "@/lib/format";
import { localToday, useSession } from "@/lib/session";
import { color, font, radius, space, type } from "@/lib/theme";

const LETTER = ["M", "T", "W", "T", "F", "S", "S"];

export default function HomeScreen() {
  const { plan: saved, answers, logs, review, account } = useSession();
  const { dismissed, dismiss } = useDismissedNotes(account?.userId);
  const today = localToday();
  if (!saved) return null;
  const { plan } = saved;
  const d = dashboardStats(plan, today);
  const all = plan.weeks.flatMap((w) => w.workouts);
  const todays = all.filter((w) => w.date === today && w.type !== "rest");
  const questions = review?.review.questions.length ?? 0;

  return (
    <Screen tab>
      <View style={st.top}>
        <View style={{ flex: 1 }}>
          <Text style={type.small}>{longDay(today)}</Text>
          <Text style={type.display} accessibilityRole="header">Today</Text>
        </View>
        <Pressable onPress={() => router.navigate("/profile")} accessibilityRole="button" accessibilityLabel="Profile" hitSlop={10} style={st.avatar}>
          <Text style={st.initial}>{(account?.email ?? "A").slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>

      {questions > 0 ? (
        <View style={{ marginBottom: space.md }}>
          <Button title={`Your review: ${questions} ${questions === 1 ? "question" : "questions"}`} onPress={() => router.push("/review")} />
        </View>
      ) : null}

      {todays.length > 0 ? (
        todays.map((w) => <TodayCard key={w.id} w={w} logged={!!logs[w.id]} units={answers.units} />)
      ) : (
        <View style={st.card}>
          {!d.started ? (
            <>
              <Text style={type.small}>Your plan starts {longDay(d.week.startDate)}</Text>
              <Text style={[type.title, { marginTop: 4 }]}>Get ready for week 1</Text>
            </>
          ) : (
            <>
              <Text style={type.small}>Nothing planned today</Text>
              <Text style={[type.title, { marginTop: 4 }]}>Rest day</Text>
              <Text style={[type.explain, { marginTop: 4 }]}>Recovery is part of the plan. Did some training anyway? Log it so your week stays accurate.</Text>
            </>
          )}
          {d.next ? (
            <View style={st.nextRow}>
              <Dot tint={kindTint(d.next)} />
              <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>
                Next: {d.next.title}, {longDay(d.next.date)}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      <WeekStrip days={d.week.workouts} start={d.week.startDate} today={today} logged={logs} />

      <View style={{ marginTop: space.lg }}>
        <Countdown plan={plan} today={today} size={150} />
        <StatGrid plan={plan} answers={answers} today={today} />
      </View>

      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.lg, marginBottom: space.lg }}>
        <View style={{ flex: 1 }}>
          <Button kind="soft" title="Recent workouts" onPress={() => router.push("/workouts")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="soft" title="Log other workout" onPress={() => router.push({ pathname: "/log", params: { id: "new" } })} />
        </View>
      </View>
      {review && questions === 0 ? <Button kind="quiet" title="Your latest review" onPress={() => router.push("/review")} /> : null}

      {dismissed
        ? plan.basis.notes.filter((n) => !dismissed.has(n)).map((n) => (
            <Callout key={n} onDismiss={() => dismiss(n)}>{n}</Callout>
          ))
        : null}
    </Screen>
  );
}

/** Today's session, with logging one tap away and the details a tap further. */
function TodayCard({ w, logged, units }: { w: PlannedWorkout; logged: boolean; units: "mi" | "km" }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[st.card, { marginBottom: space.sm }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Dot tint={kindTint(w)} />
        <Text style={type.small}>
          {minutes(w.estimatedMinutes)}
          {w.plannedDistanceMeters ? `, ${distance(w.plannedDistanceMeters, units)}` : ""}
        </Text>
        {logged ? (
          <View style={st.done}>
            <Text style={st.doneText}>Logged</Text>
          </View>
        ) : null}
      </View>
      <Text style={[type.display, { fontSize: 26, lineHeight: 32, marginTop: 6 }]}>{w.title}</Text>
      <Text style={[type.explain, { marginTop: 4 }]}>{w.objective}</Text>
      <View style={{ marginTop: space.md }}>
        <Button kind={logged ? "soft" : "primary"} title={logged ? "Edit log" : "Log session"} onPress={() => router.push({ pathname: "/log", params: { id: w.id } })} />
      </View>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={st.details}>
        <Text style={[type.label, { color: color.muted }]}>{open ? "Hide the workout" : "See the workout"}</Text>
        <Text style={[st.chev, open && { transform: [{ rotate: "-90deg" }] }]}>›</Text>
      </Pressable>
      {open ? <SessionDetails w={w} units={units} showObjective={false} /> : null}
    </View>
  );
}

/** This week, Monday to Sunday: a dot per session, a tick once logged, today highlighted. */
function WeekStrip({ days, start, today, logged }: { days: PlannedWorkout[]; start: string; today: string; logged: Record<string, unknown> }) {
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return (
    <Pressable onPress={() => router.navigate("/training")} accessibilityRole="button" accessibilityLabel="This week. Open the full plan." style={st.strip}>
      {dates.map((iso, i) => {
        const ws = days.filter((w) => w.date === iso && w.type !== "rest");
        const done = ws.length > 0 && ws.every((w) => logged[w.id]);
        const isToday = iso === today;
        return (
          <View key={iso} style={[st.day, isToday && st.dayToday]}>
            <Text style={[st.dayLetter, isToday && { color: color.text }]}>{LETTER[i]}</Text>
            <Text style={[st.dayNum, isToday && { color: color.accent }]}>{Number(iso.slice(8))}</Text>
            <View style={st.dots}>
              {done ? <Text style={st.tick}>✓</Text> : ws.slice(0, 2).map((w) => <Dot key={w.id} tint={kindTint(w)} size={6} />)}
            </View>
          </View>
        );
      })}
    </Pressable>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-end", gap: space.md, marginBottom: space.lg },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.surface, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  initial: { fontFamily: font.semibold, fontSize: 16, color: color.text },
  card: { backgroundColor: color.surface, borderRadius: radius.card, padding: 20 },
  nextRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  done: { backgroundColor: color.accentSoft, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, marginLeft: "auto" },
  doneText: { fontFamily: font.medium, fontSize: 12, color: color.accent },
  details: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md, paddingTop: space.md, marginBottom: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  chev: { fontFamily: font.medium, fontSize: 22, lineHeight: 24, color: color.faint, transform: [{ rotate: "90deg" }] },
  strip: { flexDirection: "row", gap: 4, marginTop: space.md, backgroundColor: color.surface, borderRadius: radius.row, padding: 6 },
  day: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 14, gap: 2 },
  dayToday: { backgroundColor: color.raised },
  dayLetter: { fontFamily: font.medium, fontSize: 11, color: color.faint },
  dayNum: { fontFamily: font.semibold, fontSize: 16, color: color.text },
  dots: { flexDirection: "row", gap: 3, minHeight: 12, alignItems: "center" },
  tick: { fontFamily: font.bold, fontSize: 12, color: color.accent },
});
