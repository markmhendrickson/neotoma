/**
 * Derive `next_check_suggested_at` from status + consecutive-poll count.
 *
 * Terminal statuses (resolved / duplicate / wontfix / removed) return null so
 * polling stops. Non-terminal-but-slow statuses (planned / in_progress /
 * wait_for_next_release) use exponential backoff capped at 24h, doubling per
 * consecutive poll that returned the same status. Reset on status change.
 *
 * This matches `polling_backoff_non_terminal` from the plan.
 */

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

/**
 * @param status current feedback status
 * @param consecutiveSameStatusPolls number of consecutive GET /feedback/status
 *        calls that returned the same status; 0 on first poll or after a
 *        status change.
 * @param now Date (injectable for tests)
 */
export function deriveNextCheckAt(
  status: FeedbackStatus,
  consecutiveSameStatusPolls: number,
  now: Date = new Date(),
): string | null {
  if (isTerminalStatus(status)) return null;

  const t = now.getTime();

  if (status === "submitted") {
    return new Date(t + 1 * HOUR).toISOString();
  }
  if (status === "triaged") {
    return new Date(t + 4 * HOUR).toISOString();
  }
  const baseHours = 1;
  const capHours = 24;
  const polls = Math.max(0, consecutiveSameStatusPolls);
  const hours = Math.min(capHours, baseHours * Math.pow(2, polls));
  return new Date(t + hours * HOUR).toISOString();
}
