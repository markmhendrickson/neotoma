/**
 * Seed the `rendered_page` entity schema.
 *
 * A `rendered_page` carries a bespoke HTML expression of something. It is
 * intentionally distinct from the entity (or entities) it discusses: the
 * `rendered_page` holds presentation, and `REFERS_TO` relationships link it
 * to the data entities it describes. Keeping presentation separate from data
 * prevents `source` (evidence) and presentation from colliding, and prevents
 * every entity type from growing presentation fields it does not need.
 *
 * Served via `GET /entities/:id/html` (paired with this schema in actions.ts).
 * That route 404s for any entity type other than `rendered_page`, keeping the
 * publish surface explicit.
 *
 * Registered as a GLOBAL schema. Idempotent boot-time registration.
 */

import type {
  FieldDefinition,
  ReducerConfig,
  SchemaDefinition,
  SchemaRegistryEntry,
} from "../schema_registry.js";
import { SchemaRegistryService } from "../schema_registry.js";

export const RENDERED_PAGE_ENTITY_TYPE = "rendered_page";

type FieldSpec = Array<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}>;

const RENDERED_PAGE_FIELDS: FieldSpec = [
  {
    name: "title",
    type: "string",
    required: true,
    description: "Page title; rendered into <title> and the <h1> if no html_body header overrides",
  },
  {
    name: "html_body",
    type: "string",
    required: true,
    description:
      "Body HTML injected verbatim into <body>. Do not include <html>/<head>/<body> wrappers — the server wraps this in a minimal template. Not escaped on render.",
  },
  {
    name: "meta_description",
    type: "string",
    description: "Optional <meta name=description> value; escaped on render",
  },
  {
    name: "slug",
    type: "string",
    description: "Optional URL-safe identifier; reserved for future pretty-URL routing (/p/<slug>)",
  },
  {
    name: "custom_css",
    type: "string",
    description: "Optional CSS injected as an inline <style> tag in <head>",
  },
  {
    name: "created_at",
    type: "date",
    description: "Page creation timestamp",
  },
];

function buildSchemaDefinition(): SchemaDefinition {
  const fields: Record<string, FieldDefinition> = {
    schema_version: { type: "string", required: true },
  };
  for (const spec of RENDERED_PAGE_FIELDS) {
    fields[spec.name] = {
      type: spec.type,
      required: spec.required === true,
      ...(spec.description ? { description: spec.description } : {}),
    };
  }
  return {
    fields,
    canonical_name_fields: ["slug", "title"],
    temporal_fields: [{ field: "created_at", event_type: "rendered_page_created" }],
  };
}

function buildReducerConfig(): ReducerConfig {
  const merge_policies: ReducerConfig["merge_policies"] = {
    schema_version: { strategy: "last_write" },
  };
  for (const spec of RENDERED_PAGE_FIELDS) {
    merge_policies[spec.name] = { strategy: spec.reducer ?? "last_write" };
  }
  return { merge_policies };
}

export async function seedRenderedPageSchema(options?: {
  registry?: SchemaRegistryService;
}): Promise<SchemaRegistryEntry> {
  const registry = options?.registry ?? new SchemaRegistryService();
  const existing = await registry.loadGlobalSchema(RENDERED_PAGE_ENTITY_TYPE);

  const definition = buildSchemaDefinition();
  const reducerConfig = buildReducerConfig();

  if (!existing) {
    return await registry.register({
      entity_type: RENDERED_PAGE_ENTITY_TYPE,
      schema_version: "1.0",
      schema_definition: definition,
      reducer_config: reducerConfig,
      user_specific: false,
      activate: true,
      metadata: {
        label: "Rendered page",
        description:
          "A bespoke HTML expression of something — proposal pages, public memos, shareable narratives. Distinct from the data entities it describes; uses REFERS_TO to link them. Served via GET /entities/:id/html.",
        category: "knowledge",
        // submitter_scoped lets a guest read a specific rendered_page when they
        // present a guest_access_token bound to that page's entity_id. This is
        // the standard pattern for "publish one entity at a stable URL" —
        // matches how /entities/:id already permits guest reads of issues.
        guest_access_policy: "submitter_scoped",
      },
    });
  }

  const existingFieldNames = new Set(Object.keys(existing.schema_definition.fields ?? {}));
  const missing = RENDERED_PAGE_FIELDS.filter((spec) => !existingFieldNames.has(spec.name));
  if (missing.length === 0) return existing;

  return await registry.updateSchemaIncremental({
    entity_type: RENDERED_PAGE_ENTITY_TYPE,
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

export const RENDERED_PAGE_FIELD_SPECS: ReadonlyArray<{
  name: string;
  type: FieldDefinition["type"];
  required?: boolean;
  reducer?: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  description?: string;
}> = RENDERED_PAGE_FIELDS;
