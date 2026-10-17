import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { Button, Callout, Field, Heading, Question, Screen, Wordmark } from "@/components/ui";
import { backend } from "@/data";
import { useSession } from "@/lib/session";
import { color, space, type } from "@/lib/theme";

export default function SignIn() {
  const { setAccount } = useSession();
  const [mode, setMode] = useState<"create" | "sign_in">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "create") {
        const { account, needsEmailConfirmation } = await backend.signUp(email.trim().toLowerCase(), password);
        if (needsEmailConfirmation || !account) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("sign_in");
          return;
        }
        setAccount(account);
      } else {
        setAccount(await backend.signIn(email.trim().toLowerCase(), password));
      }
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button title={mode === "create" ? "Create account" : "Sign in"} onPress={submit} busy={busy} />
          <Button kind="quiet" title={mode === "create" ? "I already have an account" : "Create a new account"} onPress={() => { setMode(mode === "create" ? "sign_in" : "create"); setError(null); }} />
        </>
      }
    >
      <Wordmark />
      <Heading
        title={mode === "create" ? "Train for your HYROX" : "Welcome back"}
        detail={mode === "create" ? "A plan built around your race, your level, and the equipment you actually have. It adjusts as you log your training." : undefined}
      />
      {notice ? <Callout>{notice}</Callout> : null}
      {backend.mode === "demo" ? <Callout>This preview isn't connected to a server. Use any email and an 8+ character password.</Callout> : null}
      <Question label="Email">
        <Field value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" accessibilityLabel="Email" />
      </Question>
      <Question label="Password" error={error ?? undefined}>
        <Field value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "create" ? "new-password" : "current-password"} placeholder="At least 8 characters" accessibilityLabel="Password" />
      </Question>
      <Text style={[type.small, { marginTop: -space.md }]}>
        Your training data is only visible to you.{" "}
        <Text style={{ color: color.accent }} accessibilityRole="link" onPress={() => router.push("/privacy")}>
          Privacy policy
        </Text>
      </Text>
    </Screen>
  );
}
