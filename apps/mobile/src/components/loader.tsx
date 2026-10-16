/**
 * Full-screen loading state: a framed scanner bar, a segmented progress strip and a status line.
 * Status lines describe the real work being done (pass `stage` to pin the current one); nothing
 * here reports a fake percentage. Motion stops when the phone's Reduce Motion setting is on.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { color } from "@/lib/theme";

const SEGMENTS = 18;
const WIDTH = 240;

export function TechLoader({ lines, stage, systemFont = false }: { lines: string[]; stage?: number; systemFont?: boolean }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const [lit, setLit] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [blink, setBlink] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    const seg = setInterval(() => setLit((n) => (n + 1) % (SEGMENTS + 4)), 70);
    const cur = setInterval(() => setBlink((b) => !b), 500);
    const txt = setInterval(() => setCycle((n) => n + 1), 1100);
    return () => { loop.stop(); clearInterval(seg); clearInterval(cur); clearInterval(txt); };
  }, [still, sweep]);

  const current = stage ?? (lines.length ? cycle % lines.length : 0);
  const line = lines[Math.min(current, lines.length - 1)] ?? "";
  const mono = systemFont ? { fontFamily: undefined, fontWeight: "600" as const } : { fontFamily: "JetBrainsMono_500Medium" };
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-WIDTH * 0.35, WIDTH] });

  return (
    <View style={st.page} accessibilityRole="progressbar" accessibilityLabel={line ? line.toLowerCase() : "Loading"} accessibilityLiveRegion="polite">
      <View style={st.frame}>
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <View key={c} style={[st.corner, st[c]]} />
        ))}
        <Text style={[st.mark, systemFont ? { fontWeight: "800" } : { fontFamily: "BarlowCondensed_700Bold" }]}>
          ADAPTIVE<Text style={{ color: color.accent }}>//</Text>ATHLETE
        </Text>
        <View style={st.track}>
          <Animated.View style={[st.beam, { transform: [{ translateX: still ? WIDTH * 0.3 : translateX }] }]} />
        </View>
        <View style={st.segments}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <View key={i} style={[st.seg, (still ? i < SEGMENTS / 2 : i < lit) && st.segOn]} />
          ))}
        </View>
        <Text style={[st.status, mono]} numberOfLines={1}>
          <Text style={{ color: color.accent }}>{"> "}</Text>
          {line}
          <Text style={{ color: color.accent, opacity: blink ? 1 : 0 }}>_</Text>
        </Text>
        {stage !== undefined && lines.length > 1 ? (
          <Text style={[st.count, mono]}>{String(Math.min(stage + 1, lines.length)).padStart(2, "0")}/{String(lines.length).padStart(2, "0")}</Text>
        ) : null}
      </View>
    </View>
  );
}

const C = 14;
const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  frame: { width: WIDTH + 48, paddingVertical: 28, paddingHorizontal: 24, alignItems: "center", gap: 14 },
  corner: { position: "absolute", width: C, height: C, borderColor: color.accent },
  tl: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  mark: { color: color.text, fontSize: 22, letterSpacing: 3 },
  track: { width: WIDTH, height: 2, backgroundColor: color.line, overflow: "hidden" },
  beam: { width: WIDTH * 0.35, height: 2, backgroundColor: color.accent },
  segments: { flexDirection: "row", gap: 3, width: WIDTH },
  seg: { flex: 1, height: 10, backgroundColor: color.raised },
  segOn: { backgroundColor: color.accent },
  status: { color: color.text, fontSize: 12, letterSpacing: 1.2, width: WIDTH },
  count: { color: color.muted, fontSize: 11, letterSpacing: 1, alignSelf: "flex-end" },
});
