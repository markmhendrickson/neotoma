import { createHash } from "crypto";

/**
 * Generate deterministic source IDs from stable source keys.
 * Keeps source inserts deterministic in local adapters that require caller-provided IDs.
 */
export function generateDeterministicSourceId(
  userId: string,
  stableSourceKey: string,
): string {
  const hash = createHash("sha256")
    .update(`source:${userId}:${stableSourceKey}`)
    .digest("hex");

  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32),
  ].join("-");
}
