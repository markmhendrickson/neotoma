/**
 * Shared agent_session + session_transcript store envelope construction.
 *
 * Used by both the Bearer CLI ingest path (`ingest_agent_sessions.ts`) and the
 * AAuth bulk path (`store_via_aauth.ts`) so PART_OF relationship shape stays
 * identical across surfaces (cross_surface_contract_parity_tested_all_surfaces).
 */

export interface SessionStoreRecord {
  entity_type: "agent_session";
  harness: string;
  native_session_id: string;
  kind: string;
  cwd: string | null;
  repo: string | null;
  source_branch: string | null;
  branch: string | null;
  worktree_path: string | null;
  model: string | null;
  message_count: number;
  created_at: string | null;
  last_activity_at: string | null;
  /** Parent agent_session entity_id once resolved; null for top-level. */
  parent_session_id: string | null;
  /** Internal: parent native id before entity_id resolution (not stored). */
  _parentNativeSessionId: string | null;
  _contentHash: string;
  _filePath: string;
  _fileSize: number;
}

export interface StoreEnvelope {
  entities: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
}

/**
 * PART_OF edges for a same-request [session, transcript] pair (indexes relative
 * to the entities array that will be POSTed together).
 */
export function buildSessionTranscriptRelationships(
  opts: {
    sessionIndex?: number;
    transcriptIndex?: number;
    parentEntityId?: string | null;
  } = {}
): Array<Record<string, unknown>> {
  const sessionIndex = opts.sessionIndex ?? 0;
  const transcriptIndex = opts.transcriptIndex ?? 1;
  const relationships: Array<Record<string, unknown>> = [
    {
      relationship_type: "PART_OF",
      source_index: transcriptIndex,
      target_index: sessionIndex,
    },
  ];
  if (opts.parentEntityId) {
    relationships.push({
      relationship_type: "PART_OF",
      source_index: sessionIndex,
      target_entity_id: opts.parentEntityId,
    });
  }
  return relationships;
}

/**
 * Build the store envelope for [session, transcript].
 * `sessionEntityId` — when known (re-ingest), set as transcript.agent_session_id.
 * `parentEntityId` — parent agent_session entity_id for sub-agents.
 */
export function buildSessionTranscriptEnvelope(
  rec: SessionStoreRecord,
  opts: { sessionEntityId?: string | null; parentEntityId?: string | null } = {}
): StoreEnvelope {
  const {
    _contentHash,
    _filePath: _fp,
    _fileSize,
    _parentNativeSessionId: _p,
    ...sessionFields
  } = rec;
  const session: Record<string, unknown> = {
    ...sessionFields,
    parent_session_id: opts.parentEntityId ?? null,
  };

  const transcript: Record<string, unknown> = {
    entity_type: "session_transcript",
    content_hash: _contentHash,
    file_size: _fileSize,
    mime_type: "application/jsonl",
    harness: rec.harness,
    format: "claude_code_jsonl",
    transcript_kind: rec.kind === "subagent" ? "subagent" : "main",
    // Prefer entity_id when known; null on first write until follow-up fill.
    agent_session_id: opts.sessionEntityId ?? null,
  };

  return {
    entities: [session, transcript],
    relationships: buildSessionTranscriptRelationships({
      parentEntityId: opts.parentEntityId,
    }),
  };
}

/** Alias used by ingest_agent_sessions (and its tests). */
export const buildStoreEnvelope = buildSessionTranscriptEnvelope;

/**
 * Follow-up envelope: set session_transcript.agent_session_id to the session
 * entity_id and emit a cross-request PART_OF edge.
 */
export function buildTranscriptSessionFkEnvelope(
  contentHash: string,
  sessionEntityId: string
): StoreEnvelope {
  return {
    entities: [
      {
        entity_type: "session_transcript",
        content_hash: contentHash,
        agent_session_id: sessionEntityId,
      },
    ],
    relationships: [
      {
        relationship_type: "PART_OF",
        source_index: 0,
        target_entity_id: sessionEntityId,
      },
    ],
  };
}

/**
 * Infer PART_OF relationships for a flat entity batch that contains consecutive
 * [agent_session, session_transcript] pairs (ingest dump order). Used by the
 * AAuth bulk path so flat entity files still get the same edges as envelopes.
 */
export function inferSessionTranscriptRelationships(
  entities: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const relationships: Array<Record<string, unknown>> = [];
  for (let i = 0; i < entities.length - 1; i++) {
    if (
      entities[i]?.entity_type === "agent_session" &&
      entities[i + 1]?.entity_type === "session_transcript"
    ) {
      relationships.push(
        ...buildSessionTranscriptRelationships({
          sessionIndex: i,
          transcriptIndex: i + 1,
          parentEntityId:
            typeof entities[i].parent_session_id === "string"
              ? (entities[i].parent_session_id as string)
              : null,
        })
      );
    }
  }
  return relationships;
}
