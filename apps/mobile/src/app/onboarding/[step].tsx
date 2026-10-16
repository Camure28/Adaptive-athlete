import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { TechLoader } from "@/components/loader";
import { Button, Callout, Lane, Screen } from "@/components/ui";
import { backend } from "@/data";
import { localToday, useSession } from "@/lib/session";
import { space } from "@/lib/theme";
import { STEPS, validateStep, type Errors, type Step } from "@/onboarding/model";
import { STEP_COMPONENTS } from "@/onboarding/steps";

export default function OnboardingStep() {
  const { step: param } = useLocalSearchParams<{ step: string }>();
  const step: Step = (STEPS as readonly string[]).includes(param ?? "") ? (param as Step) : "race";
  const index = STEPS.indexOf(step);
  const { answers, update, setAnswers } = useSession();
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const Body = STEP_COMPONENTS[step];

  const next = async () => {
    const today = localToday();
    const e = validateStep(step, answers, today);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (step !== "review") return router.push(`/onboarding/${STEPS[index + 1]}` as Href);
    setBusy(true);
    setStage(0);
    setSaveError(null);
    try {
      await backend.saveOnboarding(answers, today);
      setStage(1);
      // A new plan version from the answers just saved (built on the server; D-022).
      await backend.buildPlan(today);
      router.replace("/plan");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Your answers couldn't be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <TechLoader lines={["SAVING ATHLETE PROFILE", "GENERATING TRAINING PLAN"]} stage={stage} />;

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button title={step === "review" ? "Build my plan" : "Continue"} onPress={next} busy={busy} />
          {index > 0 ? <Button kind="quiet" title="Back" onPress={() => router.back()} /> : null}
        </View>
      }
    >
      <Lane total={STEPS.length} current={index} />
      {saveError ? <Callout tone="safety">{saveError}</Callout> : null}
      <Body a={answers} update={(p) => { update(p); setErrors({}); }} set={(a) => { setAnswers(a); setErrors({}); }} errors={errors} />
    </Screen>
  );
}
