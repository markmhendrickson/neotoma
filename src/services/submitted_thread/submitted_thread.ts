/**
 * Shared helpers for “root entity + conversation + thread message” submission flows.
 * Issue-specific GitHub logic stays in `services/issues/`; generic submission stays in
 * `entity_submission/`.
 *
 * Append semantics: generic `add_entity_message` uses `standalone_then_part_of` (message row +
 * `PART_OF` link). Guest issue append uses `conversation_extend_batch` (one `store` with
 * `target_id` conversation extension + message) to match existing issue thread behavior; both
 * paths are covered by service + integration tests.
 */

import type {
  Operations,
  StoreEntityInput,
  StoreInput,
  StoreResult,
} from "../../core/operations.js";
import { generateGuestAccessToken, hashGuestAccessToken } from "../guest_access_token.js";

export function entitySnapshotPayload(entity: {
  snapshot?: Record<string, unknown>;
}): Record<string, unknown> {
  const snapshot = entity.snapshot ?? {};
  return snapshot.snapshot && typeof snapshot.snapshot === "object"
    ? (snapshot.snapshot as Record<string, unknown>)
    : snapshot;
}

/**
 * Outbound REFERS_TO from root → linked `conversation` entity (first match).
 */
export async function resolveConversationForRoot(
  ops: Operations,
  rootEntityId: string
): Promise<{ entity_id: string; snapshot: Record<string, unknown> } | null> {
  const related = (await ops.retrieveRelatedEntities({
    entity_id: rootEntityId,
    relationship_types: ["REFERS_TO"],
    direction: "outbound",
  })) as {
    entities?: Array<{
      id?: string;
      entity_id?: string;
      entity_type: string;
      snapshot?: Record<string, unknown>;
    }>;
  };

  const conversationEntity = related?.entities?.find((e) => e.entity_type === "conversation");
  const entity_id = conversationEntity?.entity_id ?? conversationEntity?.id ?? "";
  if (!conversationEntity || !entity_id) return null;
  return { entity_id, snapshot: entitySnapshotPayload(conversationEntity) };
}

/**
 * Runs `ops.store` unless callers inject a wrapper (e.g. `runWithExternalActor` for submission).
 */
export async function storeRootWithThread(
  ops: Operations,
  input: StoreInput,
  options?: { runStore?: (inp: StoreInput) => Promise<StoreResult> | StoreResult }
): Promise<StoreResult> {
  const run = options?.runStore ?? ((inp: StoreInput) => ops.store(inp));
  return Promise.resolve(run(input));
}

export async function mintGuestReadBackToken(params: {
  entityIds: string[];
  userId: string;
  thumbprint?: string;
}): Promise<string> {
  return generateGuestAccessToken(params);
}

export async function persistGuestTokenHashOnIssue(
  ops: Operations,
  params: { issueEntityId: string; token: string; idempotency_key: string }
): Promise<void> {
  await ops.store({
    entities: [
      {
        entity_type: "issue",
        target_id: params.issueEntityId,
        guest_access_token_hash: hashGuestAccessToken(params.token),
      } as StoreEntityInput,
    ],
    idempotency_key: params.idempotency_key,
  });
}

export function structuredEntityIdAt(result: StoreResult, index: number): string {
  const legacy = result as { entities?: Array<{ entity_id?: string }> };
  const rows = result.structured?.entities ?? legacy.entities;
  return rows?.[index]?.entity_id ?? "";
}

export function structuredEntities(result: StoreResult): Array<{ entity_id?: string }> {
  const legacy = result as { entities?: Array<{ entity_id?: string }> };
  return result.structured?.entities ?? legacy.entities ?? [];
}

/**
 * Append strategies:
 * - `standalone_then_part_of`: store `conversation_message` alone, then `PART_OF` → conversation (generic submission).
 * - `conversation_extend_batch`: extend conversation row + message in one `store` (guest issue append).
 */
export async function appendMessageToConversation(
  ops: Operations,
  params:
    | {
        strategy: "standalone_then_part_of";
        conversationEntityId: string;
        message: StoreEntityInput;
        idempotency_key: string;
        runStore?: (inp: StoreInput) => Promise<StoreResult> | StoreResult;
      }
    | {
        strategy: "conversation_extend_batch";
        conversationExtend: StoreEntityInput;
        message: StoreEntityInput;
        idempotency_key: string;
      }
): Promise<{ message_entity_id: string }> {
  if (params.strategy === "standalone_then_part_of") {
    const runStore = params.runStore ?? ((inp: StoreInput) => ops.store(inp));
    const storeResult = await Promise.resolve(
      runStore({
        entities: [params.message],
        idempotency_key: params.idempotency_key,
      })
    );
    const message_entity_id = structuredEntityIdAt(storeResult, 0);
    if (message_entity_id) {
      await ops.createRelationship({
        relationship_type: "PART_OF",
        source_entity_id: message_entity_id,
        target_entity_id: params.conversationEntityId,
      });
    }
    return { message_entity_id };
  }

  const storeResult = await ops.store({
    entities: [params.conversationExtend, params.message],
    relationships: [{ relationship_type: "PART_OF", source_index: 1, target_index: 0 }],
    idempotency_key: params.idempotency_key,
  });
  return { message_entity_id: structuredEntityIdAt(storeResult, 1) };
}

/**
 * Create a new conversation + first message, then link root → conversation via REFERS_TO.
 */
export async function bootstrapConversationThreadForRoot(
  ops: Operations,
  params: {
    rootEntityId: string;
    conversationTitle: string;
    message: StoreEntityInput;
    idempotency_key: string;
    runStore?: (inp: StoreInput) => Promise<StoreResult> | StoreResult;
  }
): Promise<{ conversation_id: string; message_entity_id: string }> {
  const entities: StoreInput["entities"] = [
    {
      entity_type: "conversation",
      title: params.conversationTitle,
      thread_kind: "human_agent",
    } as StoreEntityInput,
    params.message,
  ];
  const relationships: StoreInput["relationships"] = [
    { relationship_type: "PART_OF", source_index: 1, target_index: 0 },
  ];
  const runStore = params.runStore ?? ((inp: StoreInput) => ops.store(inp));
  const storeResult = await Promise.resolve(
    runStore({
      entities,
      relationships,
      idempotency_key: params.idempotency_key,
    })
  );
  const conversation_id = structuredEntityIdAt(storeResult, 0);
  const message_entity_id = structuredEntityIdAt(storeResult, 1);
  if (conversation_id && params.rootEntityId) {
    await ops.createRelationship({
      relationship_type: "REFERS_TO",
      source_entity_id: params.rootEntityId,
      target_entity_id: conversation_id,
    });
  }
  return { conversation_id, message_entity_id };
}
