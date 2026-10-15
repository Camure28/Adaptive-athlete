/** Entry: route to sign-in, onboarding, or the plan depending on what's already saved. */
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "@/components/ui";
import { backend } from "@/data";
import { useSession } from "@/lib/session";
import { color, space, type } from "@/lib/theme";

export default function Index() {
  const { setAccount, setAnswers } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const account = await backend.currentAccount();
        if (!live) return;
        if (!account) return router.replace("/sign-in");
        setAccount(account);
        const saved = await backend.loadOnboarding();
        if (!live) return;
        if (saved) {
          setAnswers(saved);
          router.replace("/plan");
        } else router.replace("/onboarding/race");
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Something went wrong loading your account.");
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt, setAccount, setAnswers]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: color.concrete }}>
      {error ? (
        <>
          <Text style={[type.body, { textAlign: "center", marginBottom: space.lg }]}>{error}</Text>
          <Button title="Try again" onPress={() => { setError(null); setAttempt((n) => n + 1); }} />
        </>
      ) : (
        <ActivityIndicator color={color.turf} accessibilityLabel="Loading" />
      )}
    </View>
  );
}
