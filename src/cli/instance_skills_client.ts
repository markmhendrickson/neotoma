/**
 * API-facing fetch layer for instance-stored `skill` rows (#1950) and their
 * embedded script attachments (#1951).
 *
 * Kept separate from `instance_skills.ts` (materialization to disk) so the
 * network calls can be mocked/injected in unit tests without touching the
 * filesystem-reconciliation logic.
 *
 * Data shape assumed (see src/services/skills/seed_schema.ts and
 * docs/specs/MCP_SPEC.md EMBEDS convention):
 *   - `skill` entities carry name/description/triggers/content/slug/
 *     user_invocable/enabled/version/supported_harnesses/harness_config.
 *   - A skill may EMBEDS one or more `file_asset` entities (source=skill,
 *     target=file_asset), each carrying source_id/content_hash/mime_type/
 *     original_filename/file_size on its snapshot (set by
 *     ensureUnstructuredAssetEntity in src/server.ts).
 */

import type { NeotomaApiClient } from "../shared/api_client.js";

export interface InstanceSkillRow {
  entity_id: string;
  name: string;
  description?: string;
  triggers?: string[];
  content?: string;
  slug?: string;
  user_invocable?: boolean;
  enabled?: boolean;
  version?: string;
  supported_harnesses?: string[];
}

export interface InstanceScriptAttachment {
  /** entity_id of the file_asset entity EMBEDS'd by the skill. */
  entity_id: string;
  /** sources.id — required to download bytes via GET /sources/:id/content. */
  source_id: string;
  content_hash: string;
  mime_type?: string;
  original_filename: string;
  file_size?: number;
}

/**
 * Fetch every `enabled: true` `skill` entity visible to the authenticated
 * user on the connected instance via `POST /entities/query` (the actually-
 * registered HTTP route backing entity listing — `queryEntitiesWithCount`,
 * the same function the MCP `retrieve_entities` tool calls internally).
 *
 * NOTE: `src/cli/plans.ts::plansList` calls `POST /retrieve_entities`, which
 * has no HTTP route in `src/actions.ts` (that action name only exists as an
 * MCP tool case in `src/server.ts` and the in-process `Operations` dispatch
 * in `src/core/operations.ts`). Confirmed via a live smoke test against a
 * local dev instance during #1950/#1951 implementation — filed as a
 * follow-up rather than fixed here to keep this diff scoped to instance
 * skills/scripts. `/entities/query` is used here instead since it is the
 * real, typed, working equivalent.
 *
 * Filtering by `enabled` is client-side (matching the existing `plansList`
 * pattern for other snapshot fields) since `/entities/query` has no
 * per-field server-side filter beyond `entity_type`/`search`/etc.
 */
export async function fetchEnabledInstanceSkills(
  api: NeotomaApiClient
): Promise<InstanceSkillRow[]> {
  const { data, error } = await api.POST("/entities/query", {
    body: {
      entity_type: "skill",
      include_snapshots: true,
      limit: 500,
    },
  });

  if (error) {
    throw new Error(`Failed to fetch instance skills: ${JSON.stringify(error)}`);
  }

  type QueriedEntity = { entity_id?: string; snapshot?: Record<string, unknown> | null };
  const rows: InstanceSkillRow[] = [];
  for (const entity of ((data as { entities?: QueriedEntity[] } | undefined)?.entities ??
    []) as QueriedEntity[]) {
    const snapshot = entity.snapshot ?? {};
    if (snapshot.enabled !== true) continue;
    const name = typeof snapshot.name === "string" ? snapshot.name : undefined;
    const entityId = entity.entity_id;
    if (!name || !entityId) continue;
    rows.push({
      entity_id: entityId,
      name,
      description: typeof snapshot.description === "string" ? snapshot.description : undefined,
      triggers: Array.isArray(snapshot.triggers)
        ? snapshot.triggers.filter((t): t is string => typeof t === "string")
        : undefined,
      content: typeof snapshot.content === "string" ? snapshot.content : undefined,
      slug: typeof snapshot.slug === "string" ? snapshot.slug : undefined,
      user_invocable:
        typeof snapshot.user_invocable === "boolean" ? snapshot.user_invocable : undefined,
      enabled: true,
      version: typeof snapshot.version === "string" ? snapshot.version : undefined,
      supported_harnesses: Array.isArray(snapshot.supported_harnesses)
        ? snapshot.supported_harnesses.filter((t): t is string => typeof t === "string")
        : undefined,
    });
  }
  return rows;
}

/**
 * Resolve the `file_asset` entities a skill EMBEDS (source=skill,
 * target=file_asset), fetching each target's full snapshot to recover the
 * `source_id`/`content_hash`/`mime_type`/`original_filename` fields needed
 * for byte retrieval and hash verification.
 */
export async function fetchSkillScriptAttachments(
  api: NeotomaApiClient,
  skillEntityId: string
): Promise<InstanceScriptAttachment[]> {
  const { data, error } = await api.POST("/retrieve_related_entities", {
    body: {
      entity_id: skillEntityId,
      direction: "outbound",
      relationship_types: ["EMBEDS"],
      max_hops: 1,
      include_entities: false,
    },
  });
  if (error) {
    throw new Error(
      `Failed to fetch EMBEDS relationships for ${skillEntityId}: ${JSON.stringify(error)}`
    );
  }

  type RelRow = {
    source_entity_id?: string;
    target_entity_id?: string;
    relationship_type?: string;
  };
  const relationships = (
    (data as { relationships?: RelRow[] } | undefined)?.relationships ?? []
  ).filter((r) => r.relationship_type === "EMBEDS" && r.source_entity_id === skillEntityId);
  const targetIds = relationships
    .map((r) => r.target_entity_id)
    .filter((id): id is string => typeof id === "string");

  const attachments: InstanceScriptAttachment[] = [];
  for (const targetId of targetIds) {
    const { data: entityData, error: entityError } = await api.GET("/entities/{id}", {
      params: { path: { id: targetId } },
    });
    if (entityError || !entityData) continue;
    const snapshot = (entityData as { snapshot?: Record<string, unknown> }).snapshot ?? {};
    const sourceId = typeof snapshot.source_id === "string" ? snapshot.source_id : undefined;
    const contentHash =
      typeof snapshot.content_hash === "string" ? snapshot.content_hash : undefined;
    const originalFilename =
      typeof snapshot.original_filename === "string" ? snapshot.original_filename : undefined;
    if (!sourceId || !contentHash || !originalFilename) continue;
    attachments.push({
      entity_id: targetId,
      source_id: sourceId,
      content_hash: contentHash,
      mime_type: typeof snapshot.mime_type === "string" ? snapshot.mime_type : undefined,
      original_filename: originalFilename,
      file_size: typeof snapshot.file_size === "number" ? snapshot.file_size : undefined,
    });
  }
  return attachments;
}

/**
 * Download raw bytes for a source via the authenticated
 * `GET /sources/:id/content` endpoint (src/actions.ts). Not present in the
 * generated OpenAPI types, so called with a raw fetch through the same
 * base URL / auth the api client was constructed with.
 */
export async function downloadSourceBytes(
  api: NeotomaApiClient,
  sourceId: string
): Promise<Buffer> {
  const { data, error, response } = await (
    api as unknown as {
      GET: (
        path: "/sources/{id}/content",
        args: { params: { path: { id: string } }; parseAs: "arrayBuffer" }
      ) => Promise<{ data?: ArrayBuffer; error?: unknown; response?: Response }>;
    }
  ).GET("/sources/{id}/content", {
    params: { path: { id: sourceId } },
    parseAs: "arrayBuffer",
  });

  if (error || !data) {
    const status = response?.status;
    throw new Error(
      `Failed to download source ${sourceId} content${status ? ` (HTTP ${status})` : ""}`
    );
  }
  return Buffer.from(data);
}
