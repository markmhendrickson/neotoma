/**
 * Seed the `agent_session` and `session_transcript` schemas.
 *
 * Transcript ingest (`neotoma init --import-transcripts`) emits both types, so
 * a fresh instance needs them registered before the first import — otherwise
 * the rows land against no declared schema and lose their canonical-name
 * dedupe.
 *
 * `agent_session` is keyed on (harness, native_session_id): the pair a harness
 * itself resumes by. `session_transcript` is keyed on content_hash, which is
 * what makes re-importing the same bytes idempotent.
 *
 * Safe to call repeatedly: registers when absent, adds only missing fields when
 * present, and never rewrites an existing definition.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";

const AGENT_SESSION_ENTITY_TYPE = "agent_session";
const SESSION_TRANSCRIPT_ENTITY_TYPE = "session_transcript";

interface FieldSpec {
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  description?: string;
}

/**
 * Identity + resume context for one harness session. `cwd` is load-bearing:
 * Cursor keys its on-disk chat directory by md5(cwd) and Codex filters its
 * resume picker by it, so a session stored without cwd cannot be relocated.
 */
const AGENT_SESSION_FIELDS: FieldSpec[] = [
  { name: "harness", type: "string", required: true, description: "claude-code | codex | cursor" },
  {
    name: "native_session_id",
    type: "string",
    required: true,
    description: "The id the harness itself resumes by (bare, not namespaced)",
  },
  { name: "kind", type: "string", description: "interactive | autonomous | cli" },
  { name: "title", type: "string", description: "Human-readable session title" },
  { name: "summary", type: "string", description: "Short description of the session's work" },
  { name: "model", type: "string", description: "Model the session ran on" },
  { name: "status", type: "string", description: "Session lifecycle status" },
  { name: "message_count", type: "number", description: "Turns recorded in the transcript" },
  { name: "created_at", type: "date", description: "Session start" },
  { name: "last_activity_at", type: "date", description: "Most recent turn" },
  {
    name: "cwd",
    type: "string",
    description: "Working directory the session ran in — required to relocate or resume it",
  },
  { name: "repo", type: "string", description: "Repository name when the cwd is a checkout" },
  { name: "repo_remote_url", type: "string", description: "Remote URL of that repository" },
  { name: "source_branch", type: "string", description: "Branch the session forked from" },
  { name: "branch", type: "string", description: "Git branch at session time" },
  { name: "git_head_sha", type: "string", description: "HEAD sha at session time" },
  { name: "worktree_path", type: "string", description: "Worktree path when not the main clone" },
  { name: "origin_device", type: "string", description: "Device the session originated on" },
  { name: "parent_session_id", type: "string", description: "Session this one forked from" },
  { name: "is_archived", type: "boolean", description: "Archived in the harness UI" },
  { name: "resume_command", type: "string", description: "Command that resumes this session" },
];

/** One row per transcript file, content-addressed so re-imports dedupe. */
const SESSION_TRANSCRIPT_FIELDS: FieldSpec[] = [
  {
    name: "content_hash",
    type: "string",
    required: true,
    description: "sha256 of the raw transcript bytes — content-addressed identity",
  },
  {
    name: "agent_session_id",
    type: "string",
    description: "native_session_id of the agent_session this transcript belongs to",
  },
  { name: "harness", type: "string", description: "claude-code | codex | cursor" },
  { name: "format", type: "string", description: "jsonl | sqlite" },
  { name: "format_version", type: "string", description: "On-disk format version when known" },
  { name: "file_size", type: "number", description: "Transcript size in bytes" },
  { name: "turn_count", type: "number", description: "Messages parsed from the transcript" },
  { name: "storage_url", type: "string", description: "Where the raw bytes live" },
  { name: "source_id", type: "string", description: "Content-addressed source row, when stored" },
  { name: "mime_type", type: "string", description: "MIME type of the raw file" },
  { name: "transcript_kind", type: "string", description: "Classification of the transcript" },
];

function buildDefinition(specs: FieldSpec[], canonical: SchemaDefinition["canonical_name_fields"]) {
  const fields: Record<string, FieldDefinition> = {};
  for (const spec of specs) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return { fields, canonical_name_fields: canonical } as SchemaDefinition;
}

function buildReducerConfig(specs: FieldSpec[]): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {};
  for (const spec of specs) {
    merge_policies[spec.name] = { strategy: "last_write" };
  }
  return { merge_policies };
}

async function seedOne(
  registry: SchemaRegistryService,
  entityType: string,
  specs: FieldSpec[],
  canonical: SchemaDefinition["canonical_name_fields"],
  metadata: { label: string; description: string }
): Promise<SchemaRegistryEntry> {
  const existing = await registry.loadGlobalSchema(entityType);

  if (!existing) {
    return await registry.register({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: buildDefinition(specs, canonical),
      reducer_config: buildReducerConfig(specs),
      user_specific: false,
      activate: true,
      metadata: { ...metadata, category: "productivity" },
    });
  }

  // Present already — add only what's missing. Never rewrite: an instance may
  // carry fields this build doesn't know about.
  const existingFields = new Set(Object.keys(existing.schema_definition.fields ?? {}));
  const missing = specs.filter((spec) => !existingFields.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: entityType,
    fields_to_add: missing.map((spec) => ({
      field_name: spec.name,
      field_type: spec.type,
      required: false, // never retro-require a field on existing rows
      reducer_strategy: "last_write",
    })),
  });
}

/** Ensure both session schemas exist. Safe to call multiple times. */
export async function seedSessionSchemas(options?: {
  registry?: SchemaRegistryService;
}): Promise<{ agentSession: SchemaRegistryEntry; sessionTranscript: SchemaRegistryEntry }> {
  const registry = options?.registry ?? new SchemaRegistryService();

  const agentSession = await seedOne(
    registry,
    AGENT_SESSION_ENTITY_TYPE,
    AGENT_SESSION_FIELDS,
    [{ composite: ["harness", "native_session_id"] }],
    {
      label: "Agent session",
      description:
        "One harness session (Claude Code, Codex, Cursor) with the identity and context needed to locate and resume it: native session id, working directory, repo/branch, and origin device.",
    }
  );

  const sessionTranscript = await seedOne(
    registry,
    SESSION_TRANSCRIPT_ENTITY_TYPE,
    SESSION_TRANSCRIPT_FIELDS,
    ["content_hash"],
    {
      label: "Session transcript",
      description:
        "One transcript file for a harness session, content-addressed by sha256 so re-importing identical bytes is idempotent.",
    }
  );

  return { agentSession, sessionTranscript };
}
