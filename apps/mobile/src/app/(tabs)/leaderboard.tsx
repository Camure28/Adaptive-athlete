/**
 * Leaderboard (D-029): opt in with a nickname, then compare consistency with your gym or everyone.
 * Ranked by how much of their own plan athletes complete (so every level competes fairly), then
 * days trained. Other athletes only ever see your nickname and these figures.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { nav } from "@/components/plan";
import { Button, Callout, Field, Screen } from "@/components/ui";
import { backend, type LeaderboardProfile, type LeaderboardRow, type LeaderboardScope } from "@/data";
import { localToday } from "@/lib/session";
import { color, font, radius, space, type } from "@/lib/theme";

type Window = 7 | 28;

export default function LeaderboardScreen() {
  const [profile, setProfile] = useState<LeaderboardProfile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<LeaderboardScope>("world");
  const [days, setDays] = useState<Window>(7);
  const [settings, setSettings] = useState(false);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const p = await backend.loadLeaderboardProfile();
      setProfile(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The leaderboard couldn't be loaded.");
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (profile === undefined) {
    return (
      <Screen tab>
        <Text style={type.display}>Leaderboard</Text>
      </Screen>
    );
  }

  if (!profile || !profile.optedIn) return <JoinCard existing={profile} onJoined={reload} />;

  return (
    <Screen tab>
      <View style={st.head}>
        <Text style={[type.display, { flex: 1 }]} accessibilityRole="header">Leaderboard</Text>
        <Pressable onPress={() => setSettings(!settings)} accessibilityRole="button" hitSlop={10}>
          <Text style={st.link}>{settings ? "Done" : "Settings"}</Text>
        </Pressable>
      </View>
      {error ? <Callout tone="safety">{error}</Callout> : null}

      {settings ? (
        <Settings profile={profile} onChanged={reload} />
      ) : (
        <>
          <Segmented<LeaderboardScope> value={scope} onChange={setScope} options={[{ value: "gym", label: profile.gym ? profile.gym.name : "My gym" }, { value: "world", label: "Worldwide" }]} />
          <Segmented<Window> value={days} onChange={setDays} options={[{ value: 7, label: "This week" }, { value: 28, label: "4 weeks" }]} small />
          {scope === "gym" && !profile.gym ? <GymSetup onDone={reload} /> : <Board scope={scope} days={days} profile={profile} />}
          <Text style={[type.data, { marginTop: space.lg }]}>
            Ranked by how much of your own plan you completed, then days trained. Everyone is measured against their own plan, so every level competes fairly. Others see your nickname and these figures only.
          </Text>
        </>
      )}
    </Screen>
  );
}

function Segmented<T extends string | number>({ value, onChange, options, small = false }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; small?: boolean }) {
  return (
    <View style={[nav.toggle, small && { marginBottom: space.md }]} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: value === o.value }} style={[nav.tab, small && { minHeight: 34 }, value === o.value && nav.tabOn]}>
          <Text style={[nav.tabText, small && { fontSize: 14 }, value === o.value && { color: color.text }]} numberOfLines={1}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Board({ scope, days, profile }: { scope: LeaderboardScope; days: Window; profile: LeaderboardProfile }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    backend
      .leaderboard(scope, days, localToday())
      .then((r) => live && setRows(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "The leaderboard couldn't be loaded."));
    return () => {
      live = false;
    };
  }, [scope, days]);

  if (error) return <Callout>{error}</Callout>;
  if (!rows) return <Text style={[type.small, { paddingVertical: space.lg }]}>Loading the leaderboard…</Text>;
  const others = rows.filter((r) => !r.isMe).length;

  return (
    <View>
      <View style={st.board}>
        {rows.map((r) => (
          <View key={`${r.rank}-${r.nickname}`} style={[st.row, r.isMe && st.rowMe]}>
            <Text style={[st.rank, r.rank <= 3 && { color: color.accent }]}>{r.rank}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={type.strong} numberOfLines={1}>
                {r.nickname}
                {r.isMe ? <Text style={st.you}>  You</Text> : null}
              </Text>
              <Text style={type.data}>
                {r.daysTrained} {r.daysTrained === 1 ? "day" : "days"} trained, {r.sessionsLogged} {r.sessionsLogged === 1 ? "session" : "sessions"} logged
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={st.pct}>{r.completionPct === null ? "–" : `${r.completionPct}%`}</Text>
              <Text style={type.data}>of plan</Text>
            </View>
          </View>
        ))}
      </View>
      {others === 0 ? (
        <Text style={[type.small, { marginTop: space.md }]}>
          {backend.mode === "demo"
            ? "Demo mode has no other athletes, so only you are shown."
            : scope === "gym" && profile.gym
              ? `No one else from ${profile.gym.name} has joined yet. Share your gym code: ${profile.gym.joinCode}.`
              : "No one else has joined yet."}
        </Text>
      ) : null}
    </View>
  );
}

/** Join your gym with a code, or create one and share its code. */
function GymSetup({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: space.md }}>
      <View style={st.card}>
        <Text style={type.title}>Join your gym</Text>
        <Text style={[type.small, { marginBottom: space.md }]}>Ask your coach for the 6-character gym code.</Text>
        <Field style={{ backgroundColor: color.raised, borderColor: color.raised }} value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="ABC123" autoCapitalize="characters" autoCorrect={false} maxLength={6} accessibilityLabel="Gym code" />
        <View style={{ marginTop: space.md }}>
          <Button title="Join gym" busy={busy} onPress={() => run(() => backend.joinGym(code))} />
        </View>
      </View>
      <View style={st.card}>
        <Text style={type.title}>Coach or gym owner?</Text>
        <Text style={[type.small, { marginBottom: space.md }]}>Create your gym and share its code with your athletes.</Text>
        <Field style={{ backgroundColor: color.raised, borderColor: color.raised }} value={name} onChangeText={setName} placeholder="Gym name" maxLength={60} accessibilityLabel="Gym name" />
        <View style={{ marginTop: space.md }}>
          <Button kind="soft" onCard title="Create gym" busy={busy} onPress={() => run(() => backend.createGym(name))} />
        </View>
      </View>
      {error ? <Callout tone="safety">{error}</Callout> : null}
    </View>
  );
}

function JoinCard({ existing, onJoined }: { existing: LeaderboardProfile | null; onJoined: () => void }) {
  const [nickname, setNickname] = useState(existing?.nickname ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await backend.saveLeaderboardProfile({ nickname, optedIn: true });
      onJoined();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen tab footer={<Button title={existing ? "Rejoin the leaderboard" : "Join the leaderboard"} busy={busy} onPress={join} />}>
      <Text style={type.display} accessibilityRole="header">Leaderboard</Text>
      <Text style={[type.explain, { marginTop: space.sm, marginBottom: space.xl }]}>
        See how consistently you follow your plan, alongside your gym and athletes everywhere. It's optional and you can leave anytime.
      </Text>
      <View style={st.card}>
        <Text style={type.label}>What others see</Text>
        <Text style={[type.small, { marginTop: 4 }]}>Your nickname, how much of your plan you completed, days trained and sessions logged.</Text>
        <Text style={[type.label, { marginTop: space.md }]}>What they never see</Text>
        <Text style={[type.small, { marginTop: 4 }]}>Your name, email, workouts, times, paces, effort, pain or any health details.</Text>
      </View>
      <View style={{ marginTop: space.xl }}>
        <Text style={[type.label, { marginBottom: space.sm }]}>Pick a nickname</Text>
        <Field value={nickname} onChangeText={setNickname} placeholder="e.g. SledQueen" maxLength={24} autoCorrect={false} accessibilityLabel="Nickname" />
        <Text style={[type.data, { marginTop: 4 }]}>2–24 letters or numbers. Don't use your full name.</Text>
        {error ? <Text style={[type.small, { color: color.safety, marginTop: space.sm }]}>{error}</Text> : null}
      </View>
    </Screen>
  );
}

function Settings({ profile, onChanged }: { profile: LeaderboardProfile; onChanged: () => void }) {
  const [nickname, setNickname] = useState(profile.nickname);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const act = async (f: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await f();
      setMessage({ text: done });
      onChanged();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "That didn't work. Try again.", bad: true });
    }
  };
  return (
    <View style={{ gap: space.md }}>
      <View style={st.card}>
        <Text style={[type.label, { marginBottom: space.sm }]}>Nickname</Text>
        <Field style={{ backgroundColor: color.raised, borderColor: color.raised }} value={nickname} onChangeText={setNickname} maxLength={24} autoCorrect={false} accessibilityLabel="Nickname" />
        <View style={{ marginTop: space.md }}>
          <Button kind="soft" onCard title="Save nickname" onPress={() => act(() => backend.saveLeaderboardProfile({ nickname, optedIn: true }), "Nickname saved.")} />
        </View>
      </View>
      {profile.gym ? (
        <View style={st.card}>
          <Text style={type.label}>{profile.gym.name}</Text>
          <Text style={[type.small, { marginTop: 2 }]}>Gym code: {profile.gym.joinCode}</Text>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <Button kind="soft" onCard title="Share code" onPress={() => { Share.share({ message: `Join ${profile.gym!.name} on the Adapt leaderboard with code ${profile.gym!.joinCode}.` }).catch(() => undefined); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind="soft" onCard title="Leave gym" onPress={() => act(() => backend.leaveGym(), "You left the gym.")} />
            </View>
          </View>
        </View>
      ) : null}
      <Button kind="quiet" title="Leave the leaderboard" onPress={() => act(() => backend.saveLeaderboardProfile({ nickname: profile.nickname, optedIn: false }), "You've left the leaderboard.")} />
      {message ? <Callout tone={message.bad ? "safety" : "note"}>{message.text}</Callout> : null}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", marginBottom: space.lg },
  link: { fontFamily: font.medium, fontSize: 15, color: color.accent },
  card: { backgroundColor: color.surface, borderRadius: radius.row, padding: space.lg },
  board: { backgroundColor: color.surface, borderRadius: radius.row, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  rowMe: { backgroundColor: color.accentSoft },
  rank: { width: 28, fontFamily: font.semibold, fontSize: 18, color: color.muted, textAlign: "center" },
  you: { fontFamily: font.medium, fontSize: 13, color: color.accent },
  pct: { fontFamily: font.semibold, fontSize: 20, color: color.text },
});
