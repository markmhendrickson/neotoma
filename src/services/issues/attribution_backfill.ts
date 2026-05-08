/**
 * Attribution backfill for existing issue and conversation_message entities.
 *
 * Scans all `issue` entities and linked `conversation_message` entities that
 * have an `author` field (GitHub login) but whose provenance does not contain
 * `external_actor`. For each, writes a `correct` observation that adds
 * structured `github_actor` fields and stamps `external_actor` in provenance
 * with `verified_via: "claim"`.
 *
 * Invoked via `neotoma issues attribution-backfill`.
 * Idempotent: rows that already carry `external_actor` in provenance are skipped.
 */

import type { ExternalActor } from "../../crypto/agent_identity.js";
import { runWithExternalActor } from "../request_context.js";
import type { Operations, StoreResult } from "../../core/operations.js";

export interface BackfillResult {
  issues_updated: number;
  messages_updated: number;
  skipped: number;
  errors: string[];
}

function entityPrimaryId(row: { entity_id?: unknown; id?: unknown }): string {
  const entityId = typeof row.entity_id === "string" ? row.entity_id : "";
  if (entityId) return entityId;
  const id = typeof row.id === "string" ? row.id : "";
  if (id) return id;
  throw new Error("Entity row missing entity_id");
}

export async function runAttributionBackfill(ops: Operations): Promise<BackfillResult> {
  const result: BackfillResult = {
    issues_updated: 0,
    messages_updated: 0,
    skipped: 0,
    errors: [],
  };

  const issuesResponse = await ops.retrieveEntities({
    entity_type: "issue",
    limit: 500,
  }) as { entities?: Array<{ entity_id: string; snapshot?: Record<string, unknown>; provenance?: Record<string, unknown> }> };

  const issues = issuesResponse?.entities ?? [];

  for (const issue of issues) {
    try {
      const provenance = issue.provenance ?? {};
      if (provenance.external_actor) {
        result.skipped++;
        continue;
      }

      const author = issue.snapshot?.author as string | undefined;
      if (!author || author === "unknown" || author === "local") {
        result.skipped++;
        continue;
      }

      const actor: ExternalActor = {
        provider: "github",
        login: author,
        id: 0,
        type: "User",
        verified_via: "claim",
      };

      await runWithExternalActor(actor, () =>
        ops.store({
          entities: [
            {
              entity_type: "issue",
              ...issue.snapshot,
              github_actor: { login: author, id: 0, type: "User" },
            } as any,
          ],
          idempotency_key: `backfill-issue-actor-${issue.entity_id}`,
        }),
      ) as StoreResult;
      result.issues_updated++;

      const relatedResponse = await ops.retrieveRelatedEntities({
        entity_id: issue.entity_id,
        relationship_types: ["REFERS_TO"],
        direction: "outbound",
      }) as { entities?: Array<{ entity_id: string; entity_type: string; snapshot?: Record<string, unknown> }> };

      const conversation = relatedResponse?.entities?.find(
        (e) => e.entity_type === "conversation",
      );
      if (!conversation) continue;

      const partsResponse = await ops.retrieveRelatedEntities({
        entity_id: entityPrimaryId(conversation as { entity_id?: unknown; id?: unknown }),
        relationship_types: ["PART_OF"],
        direction: "inbound",
      }) as { entities?: Array<{ entity_id: string; entity_type: string; snapshot?: Record<string, unknown>; provenance?: Record<string, unknown> }> };

      const messages = (partsResponse?.entities ?? []).filter(
        (e) => e.entity_type === "conversation_message",
      );

      for (const msg of messages) {
        if (msg.provenance?.external_actor) continue;
        const msgAuthor = msg.snapshot?.author as string | undefined;
        if (!msgAuthor || msgAuthor === "unknown" || msgAuthor === "local") continue;

        const msgActor: ExternalActor = {
          provider: "github",
          login: msgAuthor,
          id: 0,
          type: "User",
          verified_via: "claim",
        };

        await runWithExternalActor(msgActor, () =>
          ops.store({
            entities: [
              {
                entity_type: "conversation_message",
                ...msg.snapshot,
                github_actor: { login: msgAuthor, id: 0, type: "User" },
              } as any,
            ],
            idempotency_key: `backfill-msg-actor-${msg.entity_id}`,
          }),
        ) as StoreResult;
        result.messages_updated++;
      }
    } catch (err) {
      result.errors.push(`Issue ${issue.entity_id}: ${(err as Error).message}`);
    }
  }

  return result;
}
