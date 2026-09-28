import { createHash } from "node:crypto";
import { stableSerialize } from "./stable_serialize.js";

export interface EntityVersionInput {
  entity_id: string;
  observation_count: number;
  last_observation_at: string | null | undefined;
}

/**
 * Collision-resistant optimistic-concurrency token for an append-only entity.
 * The count advances for every committed observation, including observations
 * written under the same fixed-clock millisecond.
 */
export function computeEntityVersion(input: EntityVersionInput): string {
  return createHash("sha256")
    .update(
      stableSerialize({
        entity_id: input.entity_id,
        observation_count: input.observation_count,
        last_observation_at: input.last_observation_at ?? null,
      })
    )
    .digest("hex");
}
