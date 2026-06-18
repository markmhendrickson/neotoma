/**
 * Unit tests for the `content_field` SchemaDefinition declaration (#949).
 *
 * Covers:
 * - Document-type schemas declare `content_field`
 * - MISSING_CONTENT_FIELD warning logic (mirrors the server / actions check)
 * - SchemaRegistryService validation rejects malformed `content_field` values
 */

import { describe, it, expect } from "vitest";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";
import type { SchemaDefinition } from "../../src/services/schema_registry.js";

// ---------------------------------------------------------------------------
// Schema-level content_field declarations
// ---------------------------------------------------------------------------

describe("content_field declarations on document-type schemas (#949)", () => {
  it("`message` schema declares content_field = 'body'", () => {
    const schema = ENTITY_SCHEMAS["message"];
    expect(schema.schema_definition.content_field).toBe("body");
  });

  it("`note` schema declares content_field = 'content'", () => {
    const schema = ENTITY_SCHEMAS["note"];
    expect(schema.schema_definition.content_field).toBe("content");
  });

  it("`gist` schema declares content_field = 'content'", () => {
    const schema = ENTITY_SCHEMAS["gist"];
    expect(schema.schema_definition.content_field).toBe("content");
  });

  it("declared content_field references an existing field on each schema", () => {
    for (const entityType of ["message", "note", "gist"]) {
      const schema = ENTITY_SCHEMAS[entityType];
      const cf = schema.schema_definition.content_field;
      expect(cf).toBeDefined();
      expect(schema.schema_definition.fields[cf!]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// MISSING_CONTENT_FIELD warning behavior (mirrors server.ts / actions.ts)
// ---------------------------------------------------------------------------

function evaluateContentFieldWarning(
  fields: Record<string, unknown>,
  entityType: string,
): Array<{ code: string; message: string }> {
  const schema = ENTITY_SCHEMAS[entityType];
  const contentField = schema?.schema_definition?.content_field;
  if (!contentField) return [];
  const value = fields[contentField];
  const isMissing =
    value === undefined || value === null || (typeof value === "string" && value === "");
  if (!isMissing) return [];
  return [
    {
      code: "MISSING_CONTENT_FIELD",
      message:
        `${entityType} stored without its primary content field "${contentField}". ` +
        "For document-derived entities, include the full original markdown/prose " +
        "in this field; structured fields complement it but do not replace it.",
    },
  ];
}

describe("MISSING_CONTENT_FIELD store_warning (#949)", () => {
  it("fires on `note` when content is absent", () => {
    const w = evaluateContentFieldWarning({ title: "Idea" }, "note");
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("MISSING_CONTENT_FIELD");
    expect(w[0].message).toContain("content");
  });

  it("fires on `note` when content is an empty string", () => {
    const w = evaluateContentFieldWarning({ title: "Idea", content: "" }, "note");
    expect(w).toHaveLength(1);
  });

  it("does NOT fire on `note` when content is populated", () => {
    const w = evaluateContentFieldWarning(
      { title: "Idea", content: "# Full markdown body\n\nDetails..." },
      "note",
    );
    expect(w).toHaveLength(0);
  });

  it("fires on `message` when body is absent", () => {
    const w = evaluateContentFieldWarning(
      { sender: "alice", sent_at: "2026-05-26T10:00:00Z" },
      "message",
    );
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("body");
  });

  it("does NOT fire on `message` when body is populated", () => {
    const w = evaluateContentFieldWarning(
      { sender: "alice", sent_at: "2026-05-26T10:00:00Z", body: "hi" },
      "message",
    );
    expect(w).toHaveLength(0);
  });

  it("does NOT fire on schemas that do not declare content_field", () => {
    const w = evaluateContentFieldWarning({ name: "Acme" }, "company");
    expect(w).toHaveLength(0);
  });

  it("message mentions the schema's specific content_field name", () => {
    const noteW = evaluateContentFieldWarning({ title: "x" }, "note");
    expect(noteW[0].message).toMatch(/"content"/);
    const messageW = evaluateContentFieldWarning(
      { sender: "a", sent_at: "2026-05-26T10:00:00Z" },
      "message",
    );
    expect(messageW[0].message).toMatch(/"body"/);
  });
});

// ---------------------------------------------------------------------------
// SchemaRegistryService.validateSchemaDefinition rejects malformed values
// ---------------------------------------------------------------------------

describe("SchemaRegistry content_field validation (#949)", () => {
  const registry = new SchemaRegistryService();

  // The validator lives behind a private method; we exercise it via register().
  // Using a synthetic global schema so we don't touch any seeded type.
  function validate(def: SchemaDefinition): Error | null {
    try {
      // @ts-expect-error private method intentionally invoked for unit test
      registry["validateSchemaDefinition"](def);
      return null;
    } catch (err) {
      return err as Error;
    }
  }

  it("accepts a content_field that exists on the schema", () => {
    const err = validate({
      fields: { body: { type: "string" }, title: { type: "string" } },
      canonical_name_fields: ["title"],
      content_field: "body",
    });
    expect(err).toBeNull();
  });

  it("rejects a content_field that does not exist on the schema", () => {
    const err = validate({
      fields: { title: { type: "string" } },
      canonical_name_fields: ["title"],
      content_field: "body",
    });
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/content_field references unknown field/);
  });

  it("rejects an empty-string content_field", () => {
    const err = validate({
      fields: { body: { type: "string" }, title: { type: "string" } },
      canonical_name_fields: ["title"],
      content_field: "",
    });
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/content_field must be a non-empty string/);
  });

  it("accepts schemas with no content_field at all (declaration is optional)", () => {
    const err = validate({
      fields: { title: { type: "string" } },
      canonical_name_fields: ["title"],
    });
    expect(err).toBeNull();
  });
});
