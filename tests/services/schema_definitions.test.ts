/**
 * Unit tests for schema_definitions (alias resolution, getSchemaDefinition, etc.)
 */

import { describe, it, expect } from "vitest";
import {
  resolveEntityTypeFromAlias,
  getRegisteredEntityTypes,
  getSchemaDefinition,
  refineEntityTypeFromExtractedFields,
} from "../../src/services/schema_definitions.js";

describe("resolveEntityTypeFromAlias", () => {
  it("resolves Recibo to receipt (Spanish)", () => {
    expect(resolveEntityTypeFromAlias("Recibo")).toBe("receipt");
  });

  it("resolves recibo (lowercase) to receipt", () => {
    expect(resolveEntityTypeFromAlias("recibo")).toBe("receipt");
  });

  it("resolves factura to invoice", () => {
    expect(resolveEntityTypeFromAlias("factura")).toBe("invoice");
  });

  it("resolves canonical type receipt to receipt", () => {
    expect(resolveEntityTypeFromAlias("receipt")).toBe("receipt");
  });

  it("resolves nota to note", () => {
    expect(resolveEntityTypeFromAlias("nota")).toBe("note");
  });

  it("returns null for unknown type", () => {
    expect(resolveEntityTypeFromAlias("unknown_type_xyz")).toBeNull();
  });

  it("returns null for empty or whitespace", () => {
    expect(resolveEntityTypeFromAlias("")).toBeNull();
    expect(resolveEntityTypeFromAlias("   ")).toBeNull();
  });
});

describe("getRegisteredEntityTypes", () => {
  it("includes receipt and invoice", () => {
    const types = getRegisteredEntityTypes();
    expect(types).toContain("receipt");
    expect(types).toContain("invoice");
  });
});

describe("getSchemaDefinition", () => {
  it("returns receipt schema for receipt", () => {
    const schema = getSchemaDefinition("receipt");
    expect(schema).not.toBeNull();
    expect(schema?.entity_type).toBe("receipt");
    expect(schema?.metadata?.aliases).toContain("recibo");
  });
});

describe("reject-policy schemas have reachable canonical rules (R1/R2 regression)", () => {
  it("every schema declaring name_collision_policy: 'reject' also declares canonical_name_fields", () => {
    const types = getRegisteredEntityTypes();
    const offenders: Array<{ entity_type: string; reason: string }> = [];
    for (const t of types) {
      const schema = getSchemaDefinition(t);
      const def = (schema as { schema_definition?: Record<string, unknown> } | null)?.schema_definition;
      if (!def) continue;
      const policy = def.name_collision_policy;
      if (policy !== "reject") continue;
      const fields = def.canonical_name_fields;
      if (!Array.isArray(fields) || fields.length === 0) {
        offenders.push({
          entity_type: t,
          reason: "reject policy without canonical_name_fields — heuristic fallback would never trigger but caller has no schema-level identity rule to satisfy",
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("conversation and conversation_message are reject-policy with conversation_id / turn_key canonicals", () => {
    const conv = getSchemaDefinition("conversation");
    const msg = getSchemaDefinition("conversation_message");
    const convDef = (conv as { schema_definition?: Record<string, unknown> } | null)?.schema_definition;
    const msgDef = (msg as { schema_definition?: Record<string, unknown> } | null)?.schema_definition;
    expect(convDef?.name_collision_policy).toBe("reject");
    expect(msgDef?.name_collision_policy).toBe("reject");
    const convFields = (convDef?.canonical_name_fields ?? []) as unknown[];
    const msgFields = (msgDef?.canonical_name_fields ?? []) as unknown[];
    expect(convFields.some((f) => f === "conversation_id")).toBe(true);
    expect(msgFields.some((f) => f === "turn_key")).toBe(true);
  });

  it("conversation context fields are optional and not identity-bearing", () => {
    const schema = getSchemaDefinition("conversation");
    expect(schema).not.toBeNull();
    const fields = schema!.schema_definition.fields;
    for (const field of [
      "client_name",
      "harness",
      "workspace_kind",
      "repository_name",
      "repository_root",
      "repository_remote",
      "scope_summary",
    ]) {
      expect(fields[field], `${field} should be declared`).toBeDefined();
      expect(fields[field]!.required).toBe(false);
    }

    // v1.4: session_id added as an alternate single-field canonical rule (issue #138)
    expect(schema!.schema_definition.canonical_name_fields).toEqual(["conversation_id", "session_id"]);
  });

  it("conversation_turn is reject-policy with composite [session_id, turn_id] canonical", () => {
    const schema = getSchemaDefinition("conversation_turn");
    expect(schema).not.toBeNull();
    const def = (schema as { schema_definition?: Record<string, unknown> } | null)?.schema_definition;
    expect(def?.name_collision_policy).toBe("reject");
    const fields = (def?.canonical_name_fields ?? []) as unknown[];
    expect(fields).toEqual([{ composite: ["session_id", "turn_id"] }]);
  });

  it("conversation_turn accepts volatile turn context without changing identity", () => {
    const schema = getSchemaDefinition("conversation_turn");
    expect(schema).not.toBeNull();
    const fields = schema!.schema_definition.fields;
    for (const field of [
      "working_directory",
      "git_branch",
      "active_file_refs",
      "context_source",
    ]) {
      expect(fields[field], `${field} should be declared`).toBeDefined();
      expect(fields[field]!.required).toBe(false);
    }

    expect(schema!.schema_definition.canonical_name_fields).toEqual([
      { composite: ["session_id", "turn_id"] },
    ]);
  });

  it("turn_compliance and turn_activity resolve to conversation_turn", () => {
    expect(resolveEntityTypeFromAlias("turn_compliance")).toBe("conversation_turn");
    expect(resolveEntityTypeFromAlias("turn_activity")).toBe("conversation_turn");
  });

  it("tool_invocation has composite [turn_key, tool_name, invoked_at] canonical", () => {
    const schema = getSchemaDefinition("tool_invocation");
    expect(schema).not.toBeNull();
    const def = (schema as { schema_definition?: Record<string, unknown> } | null)?.schema_definition;
    expect(def?.name_collision_policy).toBe("reject");
    const fields = (def?.canonical_name_fields ?? []) as unknown[];
    expect(fields).toEqual([{ composite: ["turn_key", "tool_name", "invoked_at"] }]);
  });

  it("tool_invocation_failure has composite [turn_key, tool_name, error_class, observed_at] canonical", () => {
    const schema = getSchemaDefinition("tool_invocation_failure");
    expect(schema).not.toBeNull();
    const def = (schema as { schema_definition?: Record<string, unknown> } | null)?.schema_definition;
    expect(def?.name_collision_policy).toBe("reject");
    const fields = (def?.canonical_name_fields ?? []) as unknown[];
    expect(fields).toEqual([{ composite: ["turn_key", "tool_name", "error_class", "observed_at"] }]);
  });

  it("context_event has composite [turn_key, event, observed_at] canonical", () => {
    const schema = getSchemaDefinition("context_event");
    expect(schema).not.toBeNull();
    const def = (schema as { schema_definition?: Record<string, unknown> } | null)?.schema_definition;
    expect(def?.name_collision_policy).toBe("reject");
    const fields = (def?.canonical_name_fields ?? []) as unknown[];
    expect(fields).toEqual([{ composite: ["turn_key", "event", "observed_at"] }]);
  });
});

describe("refineEntityTypeFromExtractedFields", () => {
  it("refines note to receipt when extracted fields match receipt schema (2+ required)", () => {
    const keys = ["merchant_name", "amount_total", "currency", "date_purchased"];
    expect(refineEntityTypeFromExtractedFields("note", keys)).toBe("receipt");
  });

  it("keeps receipt when current type is receipt and has strong fit", () => {
    const keys = ["merchant_name", "amount_total", "currency", "date_purchased"];
    expect(refineEntityTypeFromExtractedFields("receipt", keys)).toBe("receipt");
  });

  it("keeps note when only note-like fields present", () => {
    const keys = ["content", "title"];
    expect(refineEntityTypeFromExtractedFields("note", keys)).toBe("note");
  });

  it("returns current type when no other schema has 2+ required match", () => {
    const keys = ["some_unknown_field"];
    expect(refineEntityTypeFromExtractedFields("note", keys)).toBe("note");
  });

  it("returns current type when extracted keys empty", () => {
    expect(refineEntityTypeFromExtractedFields("note", [])).toBe("note");
  });

  it("uses dynamic candidateSchemas when provided (e.g. from registry)", () => {
    const dynamicCandidates = [
      { entity_type: "receipt", schema_definition: { fields: { merchant_name: { type: "string", required: true }, amount_total: { type: "number", required: true }, currency: { type: "string", required: true } } } },
      { entity_type: "note", schema_definition: { fields: { content: { type: "string", required: true } } } },
    ];
    const keys = ["merchant_name", "amount_total", "currency"];
    expect(refineEntityTypeFromExtractedFields("note", keys, dynamicCandidates)).toBe("receipt");
  });

  it("keeps receipt when refinement could otherwise pick fixed_cost (trusted domain type)", () => {
    const keys = [
      "merchant",
      "transaction_date",
      "posting_date",
      "amount",
      "category",
      "account",
      "status",
      "transaction_id",
      "schema_version",
    ];
    expect(refineEntityTypeFromExtractedFields("receipt", keys)).toBe("receipt");
  });

  it("keeps invoice when current type is invoice (trusted domain type)", () => {
    const keys = ["merchant_name", "amount_total", "currency", "date_purchased"];
    expect(refineEntityTypeFromExtractedFields("invoice", keys)).toBe("invoice");
  });

  it("refines unregistered current type when extracted fields strongly match a known schema", () => {
    const keys = ["merchant_name", "amount_total", "currency", "date_purchased"];
    expect(refineEntityTypeFromExtractedFields("unknown_document", keys)).toBe("receipt");
  });
});
