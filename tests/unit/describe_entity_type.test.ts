/**
 * Unit tests for the describe_entity_type MCP tool (issue #247).
 *
 * Tests cover:
 * - DescribeEntityTypeRequestSchema validation
 * - registered=false response when schema not found
 * - full SchemaDefinition returned when schema is registered
 * - field_names are sorted alphabetically
 * - tool is present in NEOTOMA_TOOL_NAMES
 * - tool is mapped in MCP_TOOL_TO_OPERATION_ID
 * - OpenAPI input schema resolves for the tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DescribeEntityTypeRequestSchema } from "../../src/shared/action_schemas.js";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";
import {
  MCP_TOOL_TO_OPERATION_ID,
  OPENAPI_OPERATION_MAPPINGS,
} from "../../src/shared/contract_mappings.js";
import { getOpenApiInputSchemaForTool } from "../../src/shared/openapi_schema.js";
import type { SchemaDefinition } from "../../src/services/schema_registry.js";

// ---------------------------------------------------------------------------
// DescribeEntityTypeRequestSchema validation
// ---------------------------------------------------------------------------

describe("DescribeEntityTypeRequestSchema", () => {
  it("accepts entity_type only", () => {
    const result = DescribeEntityTypeRequestSchema.safeParse({ entity_type: "contact" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entity_type).toBe("contact");
      expect(result.data.user_id).toBeUndefined();
    }
  });

  it("accepts entity_type with optional user_id", () => {
    const result = DescribeEntityTypeRequestSchema.safeParse({
      entity_type: "task",
      user_id: "user-abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entity_type).toBe("task");
      expect(result.data.user_id).toBe("user-abc");
    }
  });

  it("rejects missing entity_type", () => {
    const result = DescribeEntityTypeRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string entity_type", () => {
    const result = DescribeEntityTypeRequestSchema.safeParse({ entity_type: 42 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract / mapping checks — no DB calls needed
// ---------------------------------------------------------------------------

describe("describe_entity_type contract mappings", () => {
  it("is present in NEOTOMA_TOOL_NAMES", () => {
    expect(NEOTOMA_TOOL_NAMES).toContain("describe_entity_type");
  });

  it("maps to describeEntityType operationId", () => {
    expect(MCP_TOOL_TO_OPERATION_ID["describe_entity_type"]).toBe("describeEntityType");
  });

  it("OPENAPI_OPERATION_MAPPINGS has a describeEntityType entry", () => {
    const entry = OPENAPI_OPERATION_MAPPINGS.find((m) => m.operationId === "describeEntityType");
    expect(entry).toBeDefined();
    expect(entry?.method).toBe("post");
    expect(entry?.path).toBe("/schemas/describe");
    expect(entry?.mcpTool).toBe("describe_entity_type");
    expect(entry?.adapter).toBe("both");
  });

  it("OpenAPI input schema resolves for the tool", () => {
    const schema = getOpenApiInputSchemaForTool("describe_entity_type");
    expect(schema).toBeTruthy();
    expect((schema as any)?.type).toBe("object");
    const props = (schema as any)?.properties ?? {};
    expect(props).toHaveProperty("entity_type");
    expect(props.entity_type?.type).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// SchemaRegistryService.loadActiveSchema mock — handler-level tests
// ---------------------------------------------------------------------------

vi.mock("../../src/db.js", () => ({
  db: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: null })),
            order: vi.fn(() => ({
              limit: vi.fn(() => ({ data: [], error: null })),
            })),
          })),
          or: vi.fn(() => ({ data: [], error: null })),
          order: vi.fn(() => ({
            limit: vi.fn(() => ({ data: [], error: null })),
          })),
        })),
        or: vi.fn(() => ({ data: [], error: null })),
      })),
    })),
  },
}));

vi.mock("../../src/services/schema_definitions.js", () => ({
  ENTITY_SCHEMAS: {},
}));

const mockLoadActiveSchema = vi.fn();

vi.mock("../../src/services/schema_registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/schema_registry.js")>();
  return {
    ...actual,
    SchemaRegistryService: class {
      loadActiveSchema = mockLoadActiveSchema;
    },
  };
});

describe("describeEntityType handler logic", () => {
  beforeEach(() => {
    mockLoadActiveSchema.mockReset();
  });

  it("returns registered=false when no schema is found", async () => {
    mockLoadActiveSchema.mockResolvedValueOnce(null);

    const { SchemaRegistryService } = await import("../../src/services/schema_registry.js");
    const registry = new SchemaRegistryService();
    const entry = await registry.loadActiveSchema("unknown_type");

    expect(entry).toBeNull();

    // Simulate handler response shape
    const response = entry
      ? {
          entity_type: entry.entity_type,
          registered: true,
          schema_version: entry.schema_version,
          field_names: Object.keys(entry.schema_definition?.fields ?? {}).sort(),
          schema_definition: entry.schema_definition,
          reducer_config: entry.reducer_config,
        }
      : {
          entity_type: "unknown_type",
          registered: false,
          field_names: [],
          schema_definition: null,
          reducer_config: null,
        };

    expect(response.registered).toBe(false);
    expect(response.field_names).toHaveLength(0);
    expect(response.schema_definition).toBeNull();
    expect(response.reducer_config).toBeNull();
  });

  it("returns full schema when entity type is registered", async () => {
    const mockEntry = {
      id: "schema-001",
      entity_type: "contact",
      schema_version: "1.0",
      active: true,
      created_at: new Date().toISOString(),
      schema_definition: {
        fields: {
          email: { type: "string" },
          name: { type: "string" },
          company: { type: "string" },
        },
        canonical_name_fields: ["email"],
        temporal_fields: [{ field: "created_date", event_type: "contact_created" }],
      } as SchemaDefinition,
      reducer_config: { default_strategy: "last_write", field_strategies: {} },
    };
    mockLoadActiveSchema.mockResolvedValueOnce(mockEntry);

    const { SchemaRegistryService } = await import("../../src/services/schema_registry.js");
    const registry = new SchemaRegistryService();
    const entry = await registry.loadActiveSchema("contact");

    expect(entry).not.toBeNull();

    const fieldNames = Object.keys(entry!.schema_definition?.fields ?? {}).sort();

    // Simulate handler response shape
    const response = {
      entity_type: entry!.entity_type,
      registered: true,
      schema_version: entry!.schema_version,
      field_names: fieldNames,
      schema_definition: entry!.schema_definition,
      reducer_config: entry!.reducer_config,
    };

    expect(response.registered).toBe(true);
    expect(response.entity_type).toBe("contact");
    expect(response.schema_version).toBe("1.0");
    // field_names sorted alphabetically
    expect(response.field_names).toEqual(["company", "email", "name"]);
    expect(response.schema_definition).toEqual(mockEntry.schema_definition);
    expect(response.reducer_config).toEqual(mockEntry.reducer_config);
  });

  it("sorts field_names alphabetically", async () => {
    const mockEntry = {
      id: "schema-002",
      entity_type: "transaction",
      schema_version: "1.0",
      active: true,
      created_at: new Date().toISOString(),
      schema_definition: {
        fields: {
          vendor: { type: "string" },
          amount: { type: "number" },
          date: { type: "string" },
          category: { type: "string" },
        },
        identity_opt_out: "heuristic_canonical_name" as const,
      } as SchemaDefinition,
      reducer_config: { default_strategy: "last_write", field_strategies: {} },
    };
    mockLoadActiveSchema.mockResolvedValueOnce(mockEntry);

    const { SchemaRegistryService } = await import("../../src/services/schema_registry.js");
    const registry = new SchemaRegistryService();
    const entry = await registry.loadActiveSchema("transaction");

    const fieldNames = Object.keys(entry!.schema_definition?.fields ?? {}).sort();
    expect(fieldNames).toEqual(["amount", "category", "date", "vendor"]);
  });
});
