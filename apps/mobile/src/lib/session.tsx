/** App-wide state: signed-in account and the onboarding answers being edited. */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Account } from "@/data";
import { EMPTY_ANSWERS, type OnboardingAnswers } from "@/onboarding/model";

interface SessionState {
  account: Account | null;
  setAccount: (a: Account | null) => void;
  answers: OnboardingAnswers;
  setAnswers: (a: OnboardingAnswers) => void;
  update: (patch: Partial<OnboardingAnswers>) => void;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const value = useMemo<SessionState>(
    () => ({ account, setAccount, answers, setAnswers, update: (patch) => setAnswers((a) => ({ ...a, ...patch })) }),
    [account, answers],
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
