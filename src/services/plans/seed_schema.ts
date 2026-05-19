/**
 * Seed / extend the generic `plan` entity schema.
 *
 * Plans are first-class Neotoma rows that capture three categories of work:
 *   1. Harness-authored plans — markdown files written by Cursor
 *      (`.cursor/plans/<slug>_<hex>.plan.md`), Claude Code, Codex, OpenClaw,
 *      etc. Frontmatter (`name`, `overview`, `todos`, `isProject`) plus the
 *      markdown body is preserved verbatim.
 *   2. Issue-resolution plans — emitted by the `process-issues` skill when
 *      it analyzes an open `issue` and proposes a fix; carry reproduction
 *      environment fields and link back to the source `issue`.
 *   3. Skill / agent ad-hoc plans — anything an agent sketches in a turn
 *      worth keeping (refactor outlines, research notes, `neotoma_repair`
 *      payloads).
 *
 * Identity rules let the same schema cover all three: harness plans dedupe
 * per `(harness, harness_plan_id)`, issue plans dedupe per
 * `(source_entity_id, title)`, and `slug` / `title` are fallbacks.
 *
 * Registered as a GLOBAL schema (user_specific: false). Idempotent boot-time
 * registration — safe to call on every server start.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";

export const PLAN_ENTITY_TYPE = "plan";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

const PLAN_FIELDS: FieldSpec = [
  {
    name: "title",
    type: "string",
    required: true,
    description: "Human-readable plan title (matches harness `name`)",
  },
  {
    name: "slug",
    type: "string",
    description:
      "URL-safe identifier; for harness plans the on-disk filename stem (e.g. process-issues_skill_2d3bdfdc)",
  },
  {
    name: "harness",
    type: "string",
    description:
      "Authoring harness: cursor | claude_code | codex | openclaw | cli | agent | human | other",
  },
  {
    name: "harness_plan_id",
    type: "string",
    description:
      "Stable id assigned by the harness (e.g. Cursor's hex suffix); null for non-harness plans",
  },
  {
    name: "plan_file_path",
    type: "string",
    description: "Absolute path on disk when the plan is materialized as a file; null otherwise",
  },
  {
    name: "plan_kind",
    type: "string",
    description:
      "Free-form kind: issue_resolution | feature_implementation | refactor | research | neotoma_repair | other",
  },
  {
    name: "overview",
    type: "string",
    description: "One-paragraph summary (matches harness `overview` frontmatter field)",
  },
  {
    name: "body",
    type: "string",
    description: "Full markdown body of the plan; preserves harness-authored content verbatim",
  },
  {
    name: "public_overview",
    type: "string",
    description: "Redacted overview suitable for public artifacts derived from a private source",
  },
  {
    name: "public_body",
    type: "string",
    description: "Redacted body suitable for public artifacts derived from a private source",
  },
  {
    name: "is_project",
    type: "boolean",
    description: "Matches harness `isProject` frontmatter flag",
  },
  {
    name: "status",
    type: "string",
    description:
      "draft | awaiting_input | approved | executing | executed | abandoned | superseded",
  },
  {
    name: "outcome",
    type: "string",
    description:
      "pr_opened | worktree_created | commits_landed | input_requested | abandoned | null",
  },
  {
    name: "decision_required",
    type: "boolean",
    description: "True when the plan requires human input before execution can proceed",
  },
  {
    name: "decision_blockers",
    type: "array",
    reducer: "merge_array",
    description:
      "List of strings naming blockers (schema change, security review, ambiguous architecture, etc.)",
  },
  {
    name: "todos",
    type: "array",
    description:
      "Structured todo items: [{ id, content, status }] matching harness frontmatter shape",
  },
  {
    name: "source_entity_id",
    type: "string",
    description:
      "When the plan is `about` something, the entity_id of that source (e.g. an `issue`, `feature_unit`, `repository`)",
  },
  {
    name: "source_entity_type",
    type: "string",
    description: "Entity_type of the source (e.g. `issue`, `feature_unit`)",
  },
  {
    name: "source_message_entity_id",
    type: "string",
    description:
      "The prompting `conversation_message` entity_id when the plan was generated in chat",
  },
  {
    name: "conversation_id",
    type: "string",
    description:
      "Stable conversation_id this plan belongs to (for harness plans this is the active session)",
  },
  {
    name: "repository_name",
    type: "string",
    description: "Repository the plan is scoped to (e.g. neotoma)",
  },
  {
    name: "repository_root",
    type: "string",
    description: "Local checkout path of the repository when applicable",
  },
  {
    name: "reproduction_environment_kind",
    type: "string",
    description: "public_release | local_commit | local_branch | not_applicable | unknown",
  },
  {
    name: "git_sha",
    type: "string",
    description: "Git commit SHA the plan targets or was authored against",
  },
  { name: "git_ref", type: "string", description: "Branch or ref name the plan targets" },
  {
    name: "release_tag",
    type: "string",
    description: "Release tag (e.g. v0.11.0) when reproduction is a public release",
  },
  {
    name: "app_version",
    type: "string",
    description: "App / CLI version (semver) the plan targets",
  },
  {
    name: "worktree_path",
    type: "string",
    description:
      "Absolute path to the git worktree created during execution (local-commit/branch repros)",
  },
  {
    name: "branch_name",
    type: "string",
    description: "Branch name created or targeted during execution",
  },
  { name: "pr_url", type: "string", description: "Pull request URL after execution opens one" },
  {
    name: "github_issue_url",
    type: "string",
    description: "GitHub issue URL when the plan resolves a public issue with a GitHub mirror",
  },
  {
    name: "data_source",
    type: "string",
    description:
      "Provenance — e.g. 'cursor harness plan file 2026-05-11' or 'process-issues skill 2026-05-11'",
  },
  {
    name: "agent_id",
    type: "string",
    description: "Authoring agent identifier (AAuth thumbprint, clientInfo.name, etc.)",
  },
  { name: "created_at", type: "date", description: "Plan creation timestamp" },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of PLAN_FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: [
      { composite: ["harness", "harness_plan_id"] },
      { composite: ["source_entity_id", "title"] },
      "slug",
      "title",
    ],
    temporal_fields: [{ field: "created_at", event_type: "plan_created" }],
    agent_instructions:
      "Plans are stored as Neotoma entities — the canonical source of truth. " +
      "Do NOT write plan markdown files directly to docs/plans/ or any other filesystem path. " +
      "docs/plans/ is a mirror output directory populated automatically by the mirror process " +
      "(`neotoma mirror rebuild --profile neotoma-plans`); writing there directly causes " +
      "drift or conflicts when the mirror next runs. " +
      "To create or update a plan: store it as a `plan` entity via the store tool. " +
      "Set `slug` to a kebab-case identifier so the mirror can derive a stable filename. " +
      "Set `plan_file_path` only when referencing a harness-authored file that already " +
      "exists on disk (e.g. a Cursor .plan.md file); leave it null for agent-authored plans. " +
      "Always set `status` to one of: draft | awaiting_input | approved | executing | " +
      "executed | abandoned | superseded. " +
      "Set `decision_required: true` and populate `decision_blockers` whenever the plan " +
      "cannot proceed without a human choice.",
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of PLAN_FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

/**
 * Ensure the global `plan` schema exists and has every field required by
 * harness-plan capture, the process-issues skill, and ad-hoc plan stores.
 * Safe to call multiple times.
 */
export async function seedPlanSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  const existing = await registry.loadGlobalSchema(PLAN_ENTITY_TYPE);

  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: PLAN_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Plan",
        description:
          "Generic plan entity covering harness-authored markdown plans (Cursor, Claude Code, Codex, OpenClaw), issue-resolution plans from the process-issues skill, and ad-hoc agent plans. The full markdown body is preserved verbatim in `body`; structured fields cover identity, status, todos, source linkage, and reproduction environment.",
        category: "productivity",
      },
    });
  }

  const existingFieldNames = new Set(Object.keys(existing.schema_definition.fields ?? {}));
  const missing = PLAN_FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  // Only backfill agent_instructions when it was never set (undefined). Once set, it
  // is owned by the operator/schema author and should not be silently overwritten on
  // every boot.
  const needsInstructions = existing.schema_definition.agent_instructions === undefined;

  if (missing.length === 0 && !needsInstructions) return existing;

  if (missing.length > 0) {
    await registry.updateSchemaIncremental({
      entity_type: PLAN_ENTITY_TYPE,
      fields_to_add: missing.map((spec) => ({
        field_name: spec.name,
        field_type: spec.type,
        required: spec.required === true,
        reducer_strategy: spec.reducer ?? "last_write",
      })),
      user_specific: false,
      activate: true,
    });
  }

  // Patch agent_instructions onto the live schema definition when it's absent or stale.
  // updateSchemaIncremental preserves the existing definition via spread, so we write
  // directly to the registry row here.
  if (needsInstructions) {
    const current = await registry.loadGlobalSchema(PLAN_ENTITY_TYPE);
    if (current) {
      const patched: SchemaDefinition = {
        ...current.schema_definition,
        agent_instructions: definition.agent_instructions,
      };
      return await registry.register({
        entity_type: PLAN_ENTITY_TYPE,
        schema_version: current.schema_version,
        schema_definition: patched,
        reducer_config: current.reducer_config,
        user_specific: false,
        activate: true,
        metadata: current.metadata ?? undefined,
      });
    }
  }

  return (await registry.loadGlobalSchema(PLAN_ENTITY_TYPE))!;
}

export const PLAN_FIELD_SPECS: ReadonlyArray<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}> = PLAN_FIELDS;
