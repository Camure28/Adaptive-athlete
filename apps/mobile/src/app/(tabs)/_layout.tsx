/**
 * The signed-in app: Home, Training and Profile tabs with a bottom bar.
 * Loads the athlete's current saved plan once (building it on first open, D-022) and again after
 * the answers are edited (`planRevision`), so every tab reads the same plan from the session.
 */
import { router } from "expo-router";
import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeIcon, ProfileIcon, TrainingIcon } from "@/components/icons";
import { TechLoader } from "@/components/loader";
import { Button, Callout, Heading, Screen } from "@/components/ui";
import { backend } from "@/data";
import { localToday, useSession } from "@/lib/session";
import { color, font, space } from "@/lib/theme";

const ICONS = { home: HomeIcon, training: TrainingIcon, profile: ProfileIcon } as const;
const LABELS = { home: "Home", training: "Training", profile: "Profile" } as const;

export default function TabsLayout() {
  const { plan, setPlanAndLogs, setReview, planRevision } = useSession();
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadedRevision, setLoadedRevision] = useState(-1);
  const today = localToday();

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        setError(null);
        setStage(0);
        let saved = await backend.loadPlan();
        if (!saved) {
          if (live) setStage(1);
          await backend.buildPlan(today);
          saved = await backend.loadPlan();
        }
        if (!saved) throw new Error("Your plan couldn't be loaded. Try again in a moment.");
        const [logged, latest] = await Promise.all([backend.listLogs(saved.plan.id), backend.latestReview()]);
        if (!live) return;
        setPlanAndLogs(saved, logged);
        setReview(latest);
        setLoadedRevision(planRevision);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Your plan couldn't be loaded. Try again in a moment.");
      }
    })();
    return () => {
      live = false;
    };
  }, [today, attempt, planRevision, setPlanAndLogs, setReview]);

  if (error) {
    return (
      <Screen
        footer={
          <View style={{ gap: space.xs }}>
            <Button title="Try again" onPress={() => setAttempt((n) => n + 1)} />
            <Button kind="quiet" title="Edit my answers" onPress={() => router.push("/onboarding/race")} />
          </View>
        }
      >
        <Heading title="We couldn't load your plan" />
        <Callout>{error}</Callout>
      </Screen>
    );
  }
  if (!plan || loadedRevision !== planRevision) return <TechLoader lines={["Loading your plan", "Building your plan"]} stage={stage} />;

  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="training" options={{ title: "Training" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

/** Bottom bar: drawn icon and label per tab; the current tab in yellow. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const name = route.name as keyof typeof ICONS;
        const Icon = ICONS[name];
        const on = state.index === i;
        const tint = on ? color.accent : color.muted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={LABELS[name]}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!on && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={st.item}
          >
            {Icon ? <Icon tint={tint} filled={false} /> : null}
            <Text style={[st.label, { color: tint }]}>{LABELS[name] ?? route.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: color.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.sm },
  item: { flex: 1, alignItems: "center", gap: 3, minHeight: 48, justifyContent: "center" },
  label: { fontFamily: font.medium, fontSize: 12 },
});
