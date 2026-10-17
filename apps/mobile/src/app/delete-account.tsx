/**
 * Delete my account (App Store guideline 5.1.1(v)): permanent, so it explains what goes, offers the
 * export first, and asks the athlete to type DELETE before the button does anything.
 */
import { router } from "expo-router";
import { useState } from "react";
import { Share, Text, View } from "react-native";
import { Button, Callout, Field, Heading, Question, Screen } from "@/components/ui";
import { backend } from "@/data";
import { useSession } from "@/lib/session";
import { space, type } from "@/lib/theme";

const WORD = "DELETE";

export default function DeleteAccountScreen() {
  const { account, setAccount } = useSession();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toUpperCase() === WORD;

  const exportFirst = async () => {
    setError(null);
    try {
      await Share.share({ title: "Adaptive Athlete data export", message: await backend.exportMyData() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your data couldn't be exported.");
    }
  };

  const remove = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await backend.deleteMyAccount();
      setAccount(null);
      if (router.canDismiss()) router.dismissAll();
      router.replace("/sign-in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your account couldn't be deleted. Try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          {ready ? <Button title="Delete my account for good" busy={busy} onPress={remove} /> : null}
          <Button kind="quiet" title="Keep my account" onPress={() => router.back()} />
        </View>
      }
    >
      <Heading title="Delete my account" detail={account?.email} />
      <Callout tone="safety">This permanently deletes your account and everything stored about you. It can't be undone.</Callout>
      <View style={{ gap: space.sm, marginVertical: space.xl }}>
        <Text style={type.strong}>What's deleted</Text>
        <Text style={type.body}>Your answers, your plan and every version of it, your workout logs, the record of plan changes, and your leaderboard nickname. A gym you created stays for its members.</Text>
      </View>
      <View style={{ marginBottom: space.xl }}>
        <Button kind="soft" title="Export my data first" onPress={exportFirst} />
      </View>
      <Question label={`Type ${WORD} to confirm`}>
        <Field value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder={WORD} accessibilityLabel={`Type ${WORD} to confirm`} />
      </Question>
      {error ? <Callout tone="safety">{error}</Callout> : null}
    </Screen>
  );
}
