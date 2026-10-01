/**
 * Log-safe rendering of an MCP OAuth connection id.
 *
 * A connection id authenticates on its own (`X-Connection-Id` at `/mcp`), so
 * it is a credential and its value must never reach a log line at any level.
 * Where correlation across log lines is useful, log this fingerprint instead:
 * a short, non-reversible SHA-256 prefix that identifies the same connection
 * across lines without being usable to authenticate.
 */

import { createHash } from "node:crypto";

/** `absent`, or `fp:<12 hex chars of sha256>` for a present value. */
export function connectionIdForLog(connectionId: unknown): string {
  if (typeof connectionId !== "string" || connectionId.length === 0) return "absent";
  const digest = createHash("sha256").update(connectionId, "utf8").digest("hex");
  return `fp:${digest.slice(0, 12)}`;
}
