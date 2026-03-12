import { useCallback, useEffect, useRef, useState } from "react";

const copyFeedbackExpirations = new Map<string, number>();

function getRemainingMs(key: string): number {
  const expiration = copyFeedbackExpirations.get(key);
  if (expiration == null) return 0;
  const remaining = expiration - Date.now();
  if (remaining <= 0) {
    copyFeedbackExpirations.delete(key);
    return 0;
  }
  return remaining;
}

export function useCopyFeedback(key: string, durationMs = 4000): [boolean, () => void] {
  const [copied, setCopied] = useState(() => getRemainingMs(key) > 0);
  const resetTimeoutRef = useRef<number | null>(null);

  const scheduleReset = useCallback(
    (remainingMs: number) => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
      if (remainingMs <= 0) {
        setCopied(false);
        return;
      }
      resetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimeoutRef.current = null;
      }, remainingMs);
    },
    []
  );

  useEffect(() => {
    const remainingMs = getRemainingMs(key);
    setCopied(remainingMs > 0);
    scheduleReset(remainingMs);
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, [key, scheduleReset]);

  const activate = useCallback(() => {
    if (durationMs <= 0) {
      copyFeedbackExpirations.set(key, Number.POSITIVE_INFINITY);
      setCopied(true);
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      return;
    }

    const expiration = Date.now() + durationMs;
    copyFeedbackExpirations.set(key, expiration);
    setCopied(true);
    scheduleReset(durationMs);
  }, [durationMs, key, scheduleReset]);

  return [copied, activate];
}
