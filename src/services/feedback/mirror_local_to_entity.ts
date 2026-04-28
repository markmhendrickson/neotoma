/**
 * Mirror a `LocalFeedbackRecord` into the Neotoma entity graph as a
 * `neotoma_feedback` observation.
 *
 * Best-effort: errors are caught, logged, and swallowed so the JSON
 * source-of-record is never blocked by a mirror failure. The mirror
 * uses a stable idempotency key (`neotoma_feedback-<feedback_id>`) so
 * submit → classify → triage hops all collapse onto one entity.
 *
 * User scoping: each write is issued under `record.submitter_id` (or
 * an explicit `userId` override) to keep per-user isolation consistent
 * with how other per-user entities are stored.
 */

import type { LocalFeedbackRecord } from "./local_store.js";
import {
  localRecordToStoredFeedback,
  storedFeedbackToEntity,
} from "./neotoma_payload.js";
import { logger } from "../../utils/logger.js";

export interface MirrorStore {
  storeStructured(input: {
    entities: Record<string, unknown>[];
    idempotency_key: string;
    userId?: string;
  }): Promise<{
    structured?: {
      entities?: Array<{ entity_id: string; action?: string }>;
    };
  }>;
}

let cachedStore: MirrorStore | null = null;

async function getDefaultMirrorStore(): Promise<MirrorStore> {
  if (cachedStore) return cachedStore;
  const { storeStructuredForApi } = await import("../../actions.js");
  cachedStore = {
    async storeStructured(input) {
      const result = await storeStructuredForApi({
        userId: input.userId ?? "00000000-0000-0000-0000-000000000000",
        entities: input.entities,
        idempotencyKey: input.idempotency_key,
        sourcePriority: 50,
        observationSource: "llm_summary",
      });
      return { structured: result };
    },
  };
  return cachedStore;
}

export function __resetMirrorStoreCacheForTests(): void {
  cachedStore = null;
}

export interface MirrorResult {
  mirrored: boolean;
  entity_id?: string;
  action?: string;
  idempotency_key: string;
  reason?: string;
}

export async function mirrorLocalFeedbackToEntity(
  record: LocalFeedbackRecord,
  options?: {
    store?: MirrorStore;
    dataSource?: string;
    userId?: string;
  },
): Promise<MirrorResult> {
  const idempotencyKey = `neotoma_feedback-${record.id}`;
  try {
    const stored = localRecordToStoredFeedback(record, options?.userId);
    const submittedDate = record.submitted_at.slice(0, 10);
    const dataSource =
      options?.dataSource ?? `neotoma local transport ${submittedDate}`;
    const projection = storedFeedbackToEntity(stored, {
      dataSource,
      sourceFile: null,
    });

    const store = options?.store ?? (await getDefaultMirrorStore());
    const result = await store.storeStructured({
      entities: [projection.entity],
      idempotency_key: projection.idempotency_key,
      userId: options?.userId ?? record.submitter_id,
    });

    const first = result?.structured?.entities?.[0];
    return {
      mirrored: true,
      entity_id: first?.entity_id,
      action: first?.action,
      idempotency_key: idempotencyKey,
    };
  } catch (err) {
    logger.warn(
      `[feedback-local-mirror] mirror failed feedback_id=${record.id} reason=${(err as Error).message}`,
    );
    return {
      mirrored: false,
      reason: (err as Error).message,
      idempotency_key: idempotencyKey,
    };
  }
}
