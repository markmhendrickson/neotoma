/**
 * Generic entity submission pipeline (config-driven).
 * Issue-specific GitHub-first flows remain in `services/issues/issue_operations.ts`.
 */

import { createHash, randomUUID } from "node:crypto";

import type { Operations, StoreEntityInput, StoreInput, StoreResult } from "../../core/operations.js";
import type { GuestIdentity } from "../access_policy.js";
import { assertGuestWriteAllowed } from "../access_policy.js";
import { tokenGrantsAccessTo } from "../guest_access_token.js";
import { getCurrentExternalActor } from "../request_context.js";
import { runWithExternalActor } from "../request_context.js";
import {
  appendMessageToConversation,
  bootstrapConversationThreadForRoot,
  mintGuestReadBackToken,
  resolveConversationForRoot,
  storeRootWithThread,
} from "../submitted_thread/submitted_thread.js";
import { syncIssuesFromGitHub } from "../issues/syncIssuesFromGitHub.js";
import { postEntityToWebhookMirror } from "./mirrors/webhook_mirror.js";
import { getSubmissionConfigForTargetType } from "./submission_config_loader.js";
import type { SubmitEntityParams, SubmitEntityResult } from "./types.js";

function guestIdentityFromContext(): GuestIdentity {
  const a = getCurrentExternalActor();
  if (!a) return {};
  return {
    thumbprint: a.attesting_aauth_thumbprint,
  };
}

function idempotencyForSubmit(entityType: string, fields: Record<string, unknown>): string {
  const h = createHash("sha256")
    .update(JSON.stringify({ entityType, fields }))
    .digest("hex")
    .slice(0, 40);
  return `entity-submit-${entityType}-${h}`;
}

export async function submitEntity(
  ops: Operations,
  params: { userId: string } & SubmitEntityParams,
): Promise<SubmitEntityResult> {
  const { userId, entity_type, fields, initial_message } = params;
  const cfg = await getSubmissionConfigForTargetType(entity_type);
  if (!cfg) {
    throw new Error(
      `No active submission_config for entity_type "${entity_type}". Create an active submission_config row for this type (operator-seeded).`,
    );
  }

  const typesToCheck = cfg.enable_conversation_threading
    ? [entity_type, "conversation", "conversation_message"]
    : [entity_type];
  await assertGuestWriteAllowed(typesToCheck, guestIdentityFromContext());

  const primary: StoreEntityInput = {
    entity_type,
    ...fields,
  };

  const entities: StoreInput["entities"] = [primary];
  const relationships: StoreInput["relationships"] = [];

  if (cfg.enable_conversation_threading) {
    const title =
      (typeof fields.title === "string" && fields.title) ||
      (typeof fields.name === "string" && fields.name) ||
      `${entity_type} thread`;
    const now = new Date().toISOString();
    const msg =
      initial_message ??
      (typeof fields.body === "string" ? fields.body : "") ??
      (typeof fields.content === "string" ? fields.content : "");
    entities.push(
      {
        entity_type: "conversation",
        title,
        thread_kind: "human_agent",
      } as StoreEntityInput,
      {
        entity_type: "conversation_message",
        role: "user",
        sender_kind: "user",
        content: msg,
        turn_key: `${entity_type}-submit:${randomUUID()}`,
        created_at: now,
      } as StoreEntityInput,
    );
    relationships.push(
      { relationship_type: "REFERS_TO", source_index: 0, target_index: 1 },
      { relationship_type: "PART_OF", source_index: 2, target_index: 1 },
    );
  }

  const actor = getCurrentExternalActor();
  const storeResult = (await storeRootWithThread(
    ops,
    {
      entities,
      relationships: relationships.length ? relationships : undefined,
      idempotency_key: idempotencyForSubmit(entity_type, fields),
    },
    {
      runStore: (inp) => runWithExternalActor(actor, () => ops.store(inp)),
    },
  )) as StoreResult;

  const structured = storeResult.structured?.entities ?? [];
  const entity_id = structured[0]?.entity_id ?? "";
  const conversation_id = cfg.enable_conversation_threading ? structured[1]?.entity_id : undefined;

  let guest_access_token: string | undefined;
  if (cfg.enable_guest_read_back && entity_id) {
    const ids = cfg.enable_conversation_threading && conversation_id ? [entity_id, conversation_id] : [entity_id];
    guest_access_token = await mintGuestReadBackToken({
      entityIds: ids,
      userId,
      thumbprint: actor?.attesting_aauth_thumbprint,
    });
  }

  const snapshotPayload: Record<string, unknown> = {
    entity_type,
    entity_id,
    ...(conversation_id ? { conversation_id } : {}),
    snapshot: structured,
  };

  for (const mirror of cfg.external_mirrors) {
    if (mirror.provider === "custom_webhook") {
      const url = typeof mirror.config.url === "string" ? mirror.config.url : "";
      if (!url) continue;
      const secret = typeof mirror.config.secret === "string" ? mirror.config.secret : undefined;
      void postEntityToWebhookMirror({
        url,
        secret,
        payload: snapshotPayload,
      });
    }
  }

  return { entity_id, conversation_id, guest_access_token };
}

export async function addEntityMessage(
  ops: Operations,
  params: { userId: string; entity_id: string; message: string },
): Promise<{ message_entity_id: string; conversation_id: string }> {
  const snap = (await ops.executeTool("retrieve_entity_snapshot", {
    entity_id: params.entity_id,
    format: "json",
  })) as { entity_type?: string } | null;
  const rootType = snap?.entity_type;
  if (!rootType || typeof rootType !== "string") {
    throw new Error("Could not resolve entity_type for entity_id");
  }
  const cfg = await getSubmissionConfigForTargetType(rootType);
  if (!cfg?.enable_conversation_threading) {
    throw new Error(`submission_config for "${rootType}" does not enable conversation threading`);
  }
  await assertGuestWriteAllowed(["conversation", "conversation_message"], guestIdentityFromContext());

  const resolved = await resolveConversationForRoot(ops, params.entity_id);
  const conversationId = resolved?.entity_id ?? "";

  const now = new Date().toISOString();
  const actor = getCurrentExternalActor();

  if (!conversationId) {
    return bootstrapConversationThreadForRoot(ops, {
      rootEntityId: params.entity_id,
      conversationTitle: `Thread for ${rootType}`,
      message: {
        entity_type: "conversation_message",
        role: "user",
        sender_kind: "user",
        content: params.message,
        turn_key: `${rootType}-msg:${randomUUID()}`,
        created_at: now,
      } as StoreEntityInput,
      idempotency_key: `entity-message-newthread-${params.entity_id}-${randomUUID()}`,
      runStore: (inp) => runWithExternalActor(actor, () => ops.store(inp)),
    });
  }

  return appendMessageToConversation(ops, {
    strategy: "standalone_then_part_of",
    conversationEntityId: conversationId,
    message: {
      entity_type: "conversation_message",
      role: "user",
      sender_kind: "user",
      content: params.message,
      turn_key: `${rootType}-msg:${randomUUID()}`,
      created_at: now,
    } as StoreEntityInput,
    idempotency_key: `entity-message-${params.entity_id}-${conversationId}-${randomUUID()}`,
    runStore: (inp) => runWithExternalActor(actor, () => ops.store(inp)),
  }).then((r) => ({ message_entity_id: r.message_entity_id, conversation_id: conversationId }));
}

export async function getEntitySubmissionStatus(params: {
  ops: Operations;
  entity_id: string;
  guest_access_token?: string;
}): Promise<unknown> {
  const { ops, entity_id, guest_access_token } = params;
  if (guest_access_token) {
    const ok = await tokenGrantsAccessTo(guest_access_token, entity_id);
    if (!ok) throw new Error("guest_access_token does not grant access to this entity");
  }
  return ops.executeTool("retrieve_entity_snapshot", { entity_id, format: "json" });
}

export async function listEntitySubmissions(
  ops: Operations,
  params: { entity_type: string; limit?: number; offset?: number },
): Promise<unknown> {
  return ops.retrieveEntities({
    entity_type: params.entity_type,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
}

export async function syncEntitySubmissions(
  ops: Operations,
  params: { entity_type?: string },
): Promise<unknown> {
  const t = params.entity_type ?? "issue";
  if (t === "issue") {
    return syncIssuesFromGitHub(ops, {});
  }
  return { synced: 0, entity_type: t, message: "No external sync provider for this entity type" };
}
