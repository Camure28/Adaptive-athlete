/** App-wide state: signed-in account and the onboarding answers being edited. */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CompletedWorkout } from "@adaptive-athlete/engine";
import type { Account, SavedPlan } from "@/data";
import { EMPTY_ANSWERS, type OnboardingAnswers } from "@/onboarding/model";

interface SessionState {
  account: Account | null;
  setAccount: (a: Account | null) => void;
  answers: OnboardingAnswers;
  setAnswers: (a: OnboardingAnswers) => void;
  update: (patch: Partial<OnboardingAnswers>) => void;
  /** The current saved plan and its logs, keyed by planned session id. */
  plan: SavedPlan | null;
  logs: Record<string, CompletedWorkout>;
  setPlanAndLogs: (plan: SavedPlan | null, logs: CompletedWorkout[]) => void;
  putLog: (log: CompletedWorkout) => void;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [logs, setLogs] = useState<Record<string, CompletedWorkout>>({});
  const value = useMemo<SessionState>(
    () => ({
      account,
      setAccount,
      answers,
      setAnswers,
      update: (patch) => setAnswers((a) => ({ ...a, ...patch })),
      plan,
      logs,
      setPlanAndLogs: (p, l) => {
        setPlan(p);
        setLogs(Object.fromEntries(l.filter((x) => x.plannedWorkoutId).map((x) => [x.plannedWorkoutId!, x])));
      },
      putLog: (log) => {
        const id = log.plannedWorkoutId;
        if (id) setLogs((m) => ({ ...m, [id]: log }));
      },
    }),
    [account, answers, plan, logs],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}

/** Today's date (or the given moment's date) in the athlete's own time zone, as YYYY-MM-DD. */
export function localToday(at: Date = new Date()): string {
  const d = at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
