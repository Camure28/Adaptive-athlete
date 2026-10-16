/**
 * The weekly review (D-026): what the adaptation engine checked, what it changed and why, why the
 * rest stayed the same, what it's waiting on, and its questions. Opened with `run=1` straight
 * after a log is saved, which runs adaptation on the server first; answering a question re-runs it.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { TechLoader } from "@/components/loader";
import { Button, Callout, Heading, Pills, Screen } from "@/components/ui";
import { backend, type SavedReview } from "@/data";
import { localToday, useSession } from "@/lib/session";
import { color, space, type } from "@/lib/theme";
import { answerOptions } from "@/logging/questions";

const SOURCE: Record<string, string> = { manual: "your logs", apple_health: "Apple Health", file_import: "file import" };

export default function ReviewScreen() {
  const { run } = useLocalSearchParams<{ run?: string }>();
  const { review, setReview, setPlanAndLogs } = useSession();
  const [busy, setBusy] = useState(run === "1");
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  /** Runs adaptation and, if the plan changed, reloads it so the plan screen shows the new version. */
  const adapt = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await backend.adaptPlan(localToday());
      setReview(r);
      if (r.toVersion !== null) {
        const saved = await backend.loadPlan();
        if (saved) setPlanAndLogs(saved, await backend.listLogs(saved.plan.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your plan couldn't be updated. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [setReview, setPlanAndLogs]);

  // Runs once per visit when opened after a log, whatever else re-renders the screen.
  const ran = useRef(false);
  useEffect(() => {
    if (run !== "1" || ran.current) return;
    ran.current = true;
    void adapt();
  }, [run, adapt]);

  const answer = async (questionId: string, value: string) => {
    setBusy(true);
    setError(null);
    try {
      await backend.answerQuestion(questionId, value, localToday());
      setAnswered((s) => new Set(s).add(questionId));
      await adapt();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your answer couldn't be saved. Try again.");
      setBusy(false);
    }
  };

  if (busy) return <TechLoader lines={["READING YOUR LOGS", "CHECKING THE RULES", "UPDATING YOUR PLAN"]} />;

  const footer = <Button title="Back to my plan" onPress={() => (router.canGoBack() ? router.back() : router.replace("/plan"))} />;

  if (!review) {
    return (
      <Screen footer={footer}>
        <Heading title="Your review" />
        {error ? <ErrorNote message={error} onRetry={adapt} /> : <Text style={type.body}>Log a session and your review appears here.</Text>}
      </Screen>
    );
  }

  return (
    <Screen footer={footer}>
      <Heading title="Your review" detail={stampOf(review)} />
      {error ? <ErrorNote message={error} onRetry={adapt} /> : null}
      <Body review={review.review} answered={answered} onAnswer={answer} />
    </Screen>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: space.sm, marginBottom: space.lg }}>
      <Callout tone="safety">{message} Your log is saved.</Callout>
      <Button kind="quiet" title="Try again" onPress={onRetry} />
    </View>
  );
}

const stampOf = (r: SavedReview) => {
  const when = new Date(r.createdAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return r.toVersion !== null ? `${when} · your plan is now version ${r.toVersion}` : `${when} · no changes to your plan`;
};

function Body({ review, answered, onAnswer }: { review: SavedReview["review"]; answered: Set<string>; onAnswer: (id: string, value: string) => void }) {
  const open = review.questions.filter((q) => !answered.has(q.questionId));
  const sources = review.checked.sources.map((s) => SOURCE[s] ?? s).join(" and ");
  return (
    <View style={{ gap: space.xl }}>
      <Section title="Checked">
        <Text style={type.body}>
          {review.checked.sessionsLogged} {review.checked.sessionsLogged === 1 ? "session" : "sessions"} logged in the last 7 days{sources ? `, from ${sources}` : ""}.
        </Text>
      </Section>

      {open.length > 0 ? (
        <Section title={open.length === 1 ? "A question for you" : "Questions for you"}>
          {open.map((q) => {
            const opts = answerOptions(q.questionId);
            return (
              <View key={q.questionId} style={{ gap: space.sm, marginBottom: space.md }}>
                <Text style={type.strong}>{q.question}</Text>
                {opts.kind === "rpe" ? (
                  <Pills label="Effort" options={Array.from({ length: 11 }, (_, n) => ({ value: n, label: String(n) }))} isOn={() => false} onToggle={(n) => onAnswer(q.questionId, String(n))} />
                ) : (
                  <View style={{ gap: space.xs }}>
                    {opts.options.map((o) => (
                      <Button key={o.value} kind="quiet" title={o.label} onPress={() => onAnswer(q.questionId, o.value)} />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </Section>
      ) : null}

      {review.changed.length > 0 ? (
        <Section title="Changed">
          {review.changed.map((c, i) => (
            <View key={`${c.ruleId}-${i}`} style={{ gap: 4, marginBottom: space.md, paddingLeft: space.md, borderLeftWidth: 3, borderLeftColor: c.ruleId.startsWith("S-") ? color.safety : color.accent }}>
              <Text style={type.strong}>{c.whatChanged}</Text>
              <Text style={type.explain}>{c.why}</Text>
              {c.sessions.map((s) => (
                <Text key={s} style={type.small}>• {s}</Text>
              ))}
              <Text style={type.small}>{c.nextSteps}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {review.kept.length > 0 ? (
        <Section title={review.changed.length > 0 ? "Everything else" : "No change"}>
          {review.kept.map((k) => (
            <Text key={k} style={[type.body, { marginBottom: space.sm }]}>{k}</Text>
          ))}
        </Section>
      ) : null}

      {review.waitingOn.length > 0 ? (
        <Section title="Waiting on more data">
          {review.waitingOn.map((w) => (
            <Text key={w.ruleId} style={[type.explain, { marginBottom: space.sm }]}>{w.reason}</Text>
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text style={[type.eyebrow, { marginBottom: space.sm }]}>{title}</Text>
      {children}
    </View>
  );
}
