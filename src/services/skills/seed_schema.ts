/**
 * Seed / extend the `skill` entity schema.
 *
 * Skills are first-class Neotoma rows that capture reusable agent workflows
 * invocable from any supported harness (Cursor, Claude Code, etc.). Each skill
 * has a canonical name, a description that drives trigger matching, a list of
 * natural-language trigger phrases, and a markdown `content` body containing
 * the full workflow instructions.
 *
 * The mirror profile (`render_mode: "frontmatter_content"`) writes each skill
 * as a `<name>/SKILL.md` file under the harness skill directory. The
 * `user_invocable` flag surfaces the skill in the harness slash-command
 * palette.
 *
 * Identity rule: `name` is the canonical identifier — one row per skill name
 * per user instance.
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

export const SKILL_ENTITY_TYPE = "skill";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

const SKILL_FIELDS: FieldSpec = [
  {
    name: "name",
    type: "string",
    required: true,
    description:
      "Kebab-case canonical identifier (e.g. import-audio). Used as the subdirectory name in the harness skill directory.",
  },
  {
    name: "description",
    type: "string",
    description:
      "One-sentence description used by the harness to match the skill to user intent and display in the slash-command palette.",
  },
  {
    name: "triggers",
    type: "array",
    reducer: "merge_array",
    description:
      "Natural-language trigger phrases that activate this skill (e.g. ['import audio', 'transcribe audio from desktop']).",
  },
  {
    name: "content",
    type: "string",
    description:
      "Full markdown workflow body. Rendered as the content section of the SKILL.md file by the mirror profile.",
  },
  {
    name: "slug",
    type: "string",
    description:
      "URL-safe identifier; typically matches `name`. Included for forward-compatibility with index-based lookup.",
  },
  {
    name: "user_invocable",
    type: "boolean",
    description:
      "When true the skill appears in the harness slash-command palette (Claude Code `user_invocable: true` frontmatter field).",
  },
  {
    name: "enabled",
    type: "boolean",
    description: "Whether the skill is active. Disabled skills are excluded from mirror output.",
  },
  {
    name: "version",
    type: "string",
    description: "Skill content version (semver or free-form). Informational only.",
  },
  {
    name: "supported_harnesses",
    type: "array",
    reducer: "merge_array",
    description:
      "Harnesses this skill is compatible with (e.g. ['cursor', 'claude-code']). Empty means all.",
  },
  {
    name: "harness_config",
    type: "object",
    description:
      "Per-harness configuration overrides (e.g. { cursor: { triggers: [...] }, claude-code: { description: '...' } }).",
  },
  {
    name: "synced_at",
    type: "date",
    description: "Timestamp of the last mirror write or external sync for this skill.",
  },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of SKILL_FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: ["name"],
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of SKILL_FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

/**
 * Ensure the global `skill` schema exists and has every field required by
 * the skill mirror profile and harness integrations.
 * Safe to call multiple times.
 */
export async function seedSkillSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  const existing = await registry.loadGlobalSchema(SKILL_ENTITY_TYPE);

  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: SKILL_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Skill",
        description:
          "Reusable agent workflow invocable from any supported harness (Cursor, Claude Code, etc.). Each skill has a canonical name, trigger phrases for intent matching, and a markdown content body containing the full workflow instructions. Mirrored to the harness skill directory as <name>/SKILL.md.",
        category: "productivity",
      },
    });
  }

  const existingFieldNames = new Set(Object.keys(existing.schema_definition.fields ?? {}));
  const missing = SKILL_FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: SKILL_ENTITY_TYPE,
    fields_to_add: missing.map((spec) => ({
      field_name: spec.name,
      field_type: spec.type,
      required: spec.required === true,
      reducer_strategy: spec.reducer ?? "last_write",
    })),
    user_specific: false,
    activate: true,
    migrate_existing: true,
  });
}

export const SKILL_FIELD_SPECS: ReadonlyArray<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}> = SKILL_FIELDS;
