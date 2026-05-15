/**
 * Unit tests for schema-level and per-entity agent_instructions (issue #129).
 *
 * Tests cover:
 * - validateSchemaDefinition rejects empty string for agent_instructions
 * - snapshot response includes schema_instructions when schema declares agent_instructions
 * - snapshot response includes entity_instructions when entity snapshot has agent_instructions
 * - snapshot response includes both when schema and entity both have agent_instructions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SchemaRegistryService, type SchemaDefinition } from "../../src/services/schema_registry.js";

// ---------------------------------------------------------------------------
// validateSchemaDefinition tests — accessed via the public register() path,
// which calls validateSchemaDefinition before any DB access. We mock the DB
// so the validation throw is the first observable failure.
// ---------------------------------------------------------------------------

vi.mock("../../src/db.js", () => ({
  db: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: { message: "DB mocked" } })),
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: null })),
            order: vi.fn(() => ({
              limit: vi.fn(() => ({ data: [], error: null })),
            })),
          })),
          order: vi.fn(() => ({
            limit: vi.fn(() => ({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
}));

vi.mock("../../src/services/schema_definitions.js", () => ({
  getSchemaDefinition: vi.fn().mockReturnValue(null),
  ENTITY_SCHEMAS: {},
}));

function makeMinimalSchema(overrides?: Partial<SchemaDefinition>): SchemaDefinition {
  return {
    fields: {
      name: { type: "string" },
    },
    identity_opt_out: "heuristic_canonical_name",
    ...overrides,
  };
}

describe("SchemaDefinition.agent_instructions validation", () => {
  let service: SchemaRegistryService;

  beforeEach(() => {
    service = new SchemaRegistryService();
  });

  it("accepts a schema with no agent_instructions", () => {
    // validateSchemaDefinition is called synchronously before any DB access.
    // If validation passes the error will be the DB mock failure, not a
    // validation error. We distinguish by checking the error message.
    const schema = makeMinimalSchema();
    // Access private method directly for a focused unit test.
    expect(() => {
      (service as unknown as { validateSchemaDefinition(d: SchemaDefinition): void })
        .validateSchemaDefinition(schema);
    }).not.toThrow();
  });

  it("accepts a schema with a non-empty agent_instructions string", () => {
    const schema = makeMinimalSchema({
      agent_instructions: "When retrieving a task, always check its due_date field.",
    });
    expect(() => {
      (service as unknown as { validateSchemaDefinition(d: SchemaDefinition): void })
        .validateSchemaDefinition(schema);
    }).not.toThrow();
  });

  it("rejects agent_instructions as an empty string", () => {
    const schema = makeMinimalSchema({ agent_instructions: "" });
    expect(() => {
      (service as unknown as { validateSchemaDefinition(d: SchemaDefinition): void })
        .validateSchemaDefinition(schema);
    }).toThrow("agent_instructions must be a non-empty string when present");
  });

  it("rejects agent_instructions as a whitespace-only string", () => {
    const schema = makeMinimalSchema({ agent_instructions: "   " });
    expect(() => {
      (service as unknown as { validateSchemaDefinition(d: SchemaDefinition): void })
        .validateSchemaDefinition(schema);
    }).toThrow("agent_instructions must be a non-empty string when present");
  });

  it("rejects agent_instructions as a non-string value", () => {
    const schema = makeMinimalSchema({ agent_instructions: 42 as unknown as string });
    expect(() => {
      (service as unknown as { validateSchemaDefinition(d: SchemaDefinition): void })
        .validateSchemaDefinition(schema);
    }).toThrow("agent_instructions must be a non-empty string when present");
  });
});

// ---------------------------------------------------------------------------
// snapshot response injection tests — test the logic that injects
// schema_instructions and entity_instructions into the JSON payload.
// ---------------------------------------------------------------------------

/**
 * Mirrors the injection logic from server.ts renderEntitySnapshotResponse so
 * we can test it in isolation without needing a running MCP server.
 */
function buildSnapshotPayloadWithInstructions(
  snapshot: Record<string, unknown>,
  schemaAgentInstructions: string | null,
): Record<string, unknown> {
  const schemaInstructions = schemaAgentInstructions;
  const entityInstructions =
    typeof snapshot.agent_instructions === "string" ? snapshot.agent_instructions : null;

  return {
    entity_id: "ent_test",
    entity_type: "task",
    schema_version: "1.0",
    snapshot,
    provenance: {},
    computed_at: "2025-01-01T00:00:00Z",
    observation_count: 1,
    last_observation_at: "2025-01-01T00:00:00Z",
    ...(schemaInstructions !== null ? { schema_instructions: schemaInstructions } : {}),
    ...(entityInstructions !== null ? { entity_instructions: entityInstructions } : {}),
  };
}

describe("snapshot payload — schema_instructions injection", () => {
  it("includes schema_instructions when schema declares agent_instructions", () => {
    const schemaInstructions = "When retrieving a task, always surface due_date prominently.";
    const payload = buildSnapshotPayloadWithInstructions({}, schemaInstructions);
    expect(payload).toHaveProperty("schema_instructions", schemaInstructions);
    expect(payload).not.toHaveProperty("entity_instructions");
  });

  it("omits schema_instructions when schema has no agent_instructions", () => {
    const payload = buildSnapshotPayloadWithInstructions({}, null);
    expect(payload).not.toHaveProperty("schema_instructions");
    expect(payload).not.toHaveProperty("entity_instructions");
  });
});

describe("snapshot payload — entity_instructions injection", () => {
  it("includes entity_instructions when entity snapshot has agent_instructions field", () => {
    const entityInstructions = "This task belongs to project Alpha; always mention the project.";
    const payload = buildSnapshotPayloadWithInstructions(
      { name: "Fix bug", agent_instructions: entityInstructions },
      null,
    );
    expect(payload).toHaveProperty("entity_instructions", entityInstructions);
    expect(payload).not.toHaveProperty("schema_instructions");
  });

  it("omits entity_instructions when snapshot has no agent_instructions field", () => {
    const payload = buildSnapshotPayloadWithInstructions({ name: "Fix bug" }, null);
    expect(payload).not.toHaveProperty("entity_instructions");
  });

  it("omits entity_instructions when snapshot.agent_instructions is not a string", () => {
    const payload = buildSnapshotPayloadWithInstructions(
      { name: "Fix bug", agent_instructions: 42 },
      null,
    );
    expect(payload).not.toHaveProperty("entity_instructions");
  });
});

describe("snapshot payload — both schema_instructions and entity_instructions", () => {
  it("includes both when schema and entity each have agent_instructions", () => {
    const schemaInstructions = "Schema-level: surface due_date prominently.";
    const entityInstructions = "Entity-level: this task is high-priority.";
    const payload = buildSnapshotPayloadWithInstructions(
      { name: "Deploy release", agent_instructions: entityInstructions },
      schemaInstructions,
    );
    expect(payload).toHaveProperty("schema_instructions", schemaInstructions);
    expect(payload).toHaveProperty("entity_instructions", entityInstructions);
  });

  it("schema_instructions and entity_instructions are independent values", () => {
    const schemaInstructions = "Schema rule A.";
    const entityInstructions = "Entity rule B.";
    const payload = buildSnapshotPayloadWithInstructions(
      { agent_instructions: entityInstructions },
      schemaInstructions,
    );
    expect(payload.schema_instructions).not.toBe(payload.entity_instructions);
    expect(payload.schema_instructions).toBe(schemaInstructions);
    expect(payload.entity_instructions).toBe(entityInstructions);
  });
});
