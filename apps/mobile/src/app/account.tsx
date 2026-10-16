/**
 * Account menu: who's signed in, plan settings, subscription, data and sign-out.
 * Items that don't exist yet are shown as "Soon" and can't be tapped, so nothing pretends to work.
 */
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/ui";
import { backend } from "@/data";
import { useSession } from "@/lib/session";
import { color, font, radius, space, type } from "@/lib/theme";

export default function AccountScreen() {
  const { account, setAccount } = useSession();
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const exportData = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const json = await backend.exportMyData();
      await Share.share({ title: "Adaptive Athlete data export", message: json });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Your data couldn't be exported.");
    } finally {
      setExporting(false);
    }
  };

  const signOut = async () => {
    await backend.signOut();
    setAccount(null);
    router.replace("/sign-in");
  };

  return (
    <Screen>
      <View style={st.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to plan" hitSlop={12} style={st.back}>
          <Text style={st.backText}>{"‹"} Plan</Text>
        </Pressable>
      </View>
      <Text style={type.display} accessibilityRole="header">Account</Text>
      <Text style={[type.data, { marginTop: space.xs, marginBottom: space.xl }]}>{account?.email ?? "Not signed in"}</Text>

      <Section title="Training">
        <Row label="Edit my answers" detail="Race, level, schedule, equipment, limitations" onPress={() => router.push("/onboarding/race")} />
      </Section>

      <Section title="Subscription">
        <Row label="Current plan" value="Pilot · free" />
        <Row label="Change subscription" soon />
        <Row label="Manage billing" soon />
      </Section>

      <Section title="Your data">
        <Row label={exporting ? "Preparing export…" : "Export my data"} detail="Everything we store about you, as a file you can save or send" onPress={exporting ? undefined : exportData} />
        <Row label="Delete my account" soon />
      </Section>
      {message ? <Text style={[type.small, { color: color.safety, marginBottom: space.lg }]}>{message}</Text> : null}

      <Section title="Session">
        <Row label="Sign out" onPress={signOut} danger />
      </Section>

      <Text style={[type.data, { textAlign: "center", marginTop: space.lg }]}>Adaptive Athlete, version {Constants.expoConfig?.version ?? "1.0.0"}{backend.mode === "demo" ? " (demo)" : ""}</Text>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: space.xl }}>
      <Text style={[type.eyebrow, { marginBottom: space.sm }]}>{title}</Text>
      <View style={st.group}>{children}</View>
    </View>
  );
}

function Row({ label, detail, value, onPress, soon = false, danger = false }: { label: string; detail?: string; value?: string; onPress?: () => void; soon?: boolean; danger?: boolean }) {
  const body = (
    <View style={[st.row, soon && { opacity: 0.55 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.strong, danger && { color: color.safety }]}>{label}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
      {value ? <Text style={st.value}>{value}</Text> : null}
      {soon ? <Text style={st.soon}>Soon</Text> : null}
      {onPress && !soon ? <Text style={st.chev}>›</Text> : null}
    </View>
  );
  if (!onPress || soon) return <View accessibilityLabel={soon ? `${label}, coming soon` : undefined}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { backgroundColor: color.raised }}>
      {body}
    </Pressable>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: "row", marginBottom: space.lg },
  back: { paddingVertical: space.xs },
  backText: { fontFamily: font.medium, fontSize: 15, color: color.muted },
  group: { backgroundColor: color.surface, borderRadius: radius.row, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  value: { fontFamily: font.medium, fontSize: 14, color: color.accent },
  soon: { fontFamily: font.medium, fontSize: 12, color: color.muted, backgroundColor: color.raised, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: "hidden" },
  chev: { fontFamily: font.title, fontSize: 24, color: color.muted },
});
