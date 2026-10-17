/**
 * Full-screen loading state: a calm spinning arc, the name, and one status line describing the real
 * work being done (pass `stage` to pin the current one). No fake percentages. Motion stops when the
 * phone's Reduce Motion setting is on. (Named TechLoader for existing call sites.)
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { color } from "@/lib/theme";

const SIZE = 44;

export function TechLoader({ lines, stage, systemFont = false }: { lines: string[]; stage?: number; systemFont?: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [cycle, setCycle] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => undefined);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    const txt = setInterval(() => setCycle((n) => n + 1), 1600);
    return () => {
      loop.stop();
      clearInterval(txt);
    };
  }, [still, spin]);

  const current = stage ?? (lines.length ? cycle % lines.length : 0);
  const line = lines[Math.min(current, lines.length - 1)] ?? "";
  const family = (f: string) => (systemFont ? { fontFamily: undefined } : { fontFamily: f });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={st.page} accessibilityRole="progressbar" accessibilityLabel={line || "Loading"} accessibilityLiveRegion="polite">
      <Animated.View style={{ opacity: fade, alignItems: "center", gap: 20 }}>
        <Animated.View style={[st.arc, { transform: [{ rotate: still ? "45deg" : rotate }] }]} />
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={[st.mark, family("Outfit_600SemiBold"), systemFont && { fontWeight: "600" }]}>Adapt</Text>
          <Text style={[st.status, family("Outfit_400Regular")]} numberOfLines={1}>
            {line}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  arc: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 3, borderColor: color.raised, borderTopColor: color.accent, borderRightColor: color.accent },
  mark: { color: color.text, fontSize: 18, letterSpacing: -0.2 },
  status: { color: color.muted, fontSize: 14 },
});
