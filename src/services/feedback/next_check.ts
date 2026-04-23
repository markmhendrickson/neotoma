import type { FeedbackStatus } from "./types.js";

const HOUR = 60 * 60 * 1000;

export function isTerminalStatus(status: FeedbackStatus): boolean {
  return (
    status === "resolved" ||
    status === "duplicate" ||
    status === "wontfix" ||
    status === "removed"
  );
}

export function deriveNextCheckAt(
  status: FeedbackStatus,
  consecutiveSameStatusPolls: number,
  now: Date = new Date(),
): string | null {
  if (isTerminalStatus(status)) return null;
  const t = now.getTime();
  if (status === "submitted") return new Date(t + 1 * HOUR).toISOString();
  if (status === "triaged") return new Date(t + 4 * HOUR).toISOString();
  const base = 1;
  const cap = 24;
  const polls = Math.max(0, consecutiveSameStatusPolls);
  const hours = Math.min(cap, base * Math.pow(2, polls));
  return new Date(t + hours * HOUR).toISOString();
}
