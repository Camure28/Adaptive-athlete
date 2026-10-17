/** Training: the whole plan, as weeks or a month calendar. Opens on the current week. */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Calendar, nav, Week } from "@/components/plan";
import { Screen } from "@/components/ui";
import { backend } from "@/data";
import { dashboardStats } from "@/lib/dashboard";
import { shortDate } from "@/lib/format";
import { localToday, useSession } from "@/lib/session";
import { color, space, type } from "@/lib/theme";

export default function TrainingScreen() {
  const { plan: saved, answers, logs } = useSession();
  const today = localToday();
  const [view, setView] = useState<"weeks" | "calendar">("weeks");
  const [openWeek, setOpenWeek] = useState(() => (saved ? dashboardStats(saved.plan, today).week.index : 0));
  if (!saved) return null;
  const { plan } = saved;

  return (
    <Screen tab>
      <Text style={[type.display, { marginBottom: space.lg }]} accessibilityRole="header">Training</Text>
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

      <Text style={[type.data, { textAlign: "center", marginTop: space.lg }]}>
        {backend.mode === "demo" ? "Demo mode: built on your phone, not saved." : `Plan version ${saved.version}, saved ${shortDate(localToday(new Date(saved.savedAt)))}. Log sessions and your plan adapts to them.`}
      </Text>
    </Screen>
  );
}
