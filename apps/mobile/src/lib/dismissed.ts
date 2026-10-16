/**
 * Plan notes an athlete has closed, remembered on this phone so each one shows once.
 * Keyed by account and note text: if a note's wording changes (the plan changed), it shows again.
 * Storage failures just mean the note shows again; nothing else depends on this.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const KEY = (userId: string) => `aa.dismissedNotes.v1.${userId}`;

export function useDismissedNotes(userId: string | undefined) {
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY(userId ?? "anon"))
      .then((raw) => live && setDismissed(new Set(raw ? (JSON.parse(raw) as string[]) : [])))
      .catch(() => live && setDismissed(new Set()));
    return () => { live = false; };
  }, [userId]);
  const dismiss = useCallback(
    (note: string) => {
      setDismissed((prev) => {
        const next = new Set(prev ?? []);
        next.add(note);
        AsyncStorage.setItem(KEY(userId ?? "anon"), JSON.stringify([...next])).catch(() => undefined);
        return next;
      });
    },
    [userId],
  );
  return { dismissed, dismiss };
}
