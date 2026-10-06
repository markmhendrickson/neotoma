/**
 * Contract tests for the reserved `agent_capability_v1` capability type.
 *
 * This change only DECLARES the contract (OpenAPI shapes, the `agent_grant`
 * schema fields, error vocabulary). Nothing enforces it yet, so the tests pin
 * three things:
 *
 *   1. The declared shapes are what the contract says they are (closed v1
 *      branch, legacy branch unchanged, reserved fields present).
 *   2. The runtime still refuses the v1 shape. A test that only checked the
 *      YAML would stay green if a later edit made the validator accept it.
 *   3. Editing `openapi.yaml` is runtime-live (the unknown-fields guard and the
 *      advertised MCP `store` schema read it at runtime), so those two readers
 *      are pinned to "no behaviour change" here. A later change that flips
 *      either one must update these assertions on purpose.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import type express from "express";
import { resolveOpenApiPath } from "../../src/shared/openapi_file.js";
import { getOpenApiInputSchemaOrThrow } from "../../src/shared/openapi_schema.js";
import {
  _resetUnknownFieldsGuardCache,
  unknownFieldsGuard,
} from "../../src/middleware/unknown_fields_guard.js";
import { buildToolDefinitions } from "../../src/tool_definitions.js";
import { ENTITY_SCHEMAS } from "../../src/services/schema_definitions.js";
import {
  AgentGrantValidationError,
  validateCapabilities,
} from "../../src/services/agent_grants.js";
import {
  AgentCapabilityError,
  enforceAgentCapability,
  type AgentCapabilityContext,
} from "../../src/services/agent_capabilities.js";

type Json = Record<string, any>;

const spec = yaml.load(readFileSync(resolveOpenApiPath(), "utf-8")) as Json;
const schemas = spec.components.schemas as Record<string, Json>;

/** A complete, well-formed v1 entry as the contract describes it. */
function v1Entry(): Json {
  return {
    op: "agent_capability_v1",
    capability_id: "cap-1",
    purpose: { name: "example_purpose", version: "1" },
    delegation_chain: [],
    param_constraints: {
      contract_version: 1,
      operation_ids: ["store"],
      owner: { user_id: "00000000-0000-0000-0000-000000000001" },
      source_bytes: [{ sha256: "a".repeat(64), byte_length: 12, mime_type: "text/plain" }],
      sources: [],
      entities: {
        entity_type: "configuration",
        composite: { system: "example", key: "example" },
        bound_fields: { schema_version: 1 },
        max_observations: 10,
      },
    },
  };
}

describe("agent_capability_v1 OpenAPI contract", () => {
  it("AgentCapabilityEntry is a oneOf of the legacy and v1 branches", () => {
    const entry = schemas.AgentCapabilityEntry;
    expect(entry.oneOf).toEqual([
      { $ref: "#/components/schemas/AgentCapabilityEntryLegacy" },
      { $ref: "#/components/schemas/AgentCapabilityEntryV1" },
    ]);
  });

  it("the legacy branch is the pre-v1 shape, including relationship_types", () => {
    const legacy = schemas.AgentCapabilityEntryLegacy;
    expect(legacy.required).toEqual(["op", "entity_types"]);
    expect(Object.keys(legacy.properties).sort()).toEqual(
      ["entity_types", "op", "relationship_types", "repos"].sort()
    );
    expect(legacy.properties.op.enum).toEqual([
      "store",
      "store_structured",
      "create_relationship",
      "correct",
      "retrieve",
      "github_harness:read",
      "github_harness:write",
      "github_harness:*",
    ]);
    expect(legacy.properties.op.enum).not.toContain("agent_capability_v1");
  });

  it("the v1 branch is closed, discriminated, and carries no legacy keys", () => {
    const v1 = schemas.AgentCapabilityEntryV1;
    expect(v1.additionalProperties).toBe(false);
    expect(v1.properties.op.enum).toEqual(["agent_capability_v1"]);
    expect([...v1.required].sort()).toEqual(
      ["capability_id", "delegation_chain", "op", "param_constraints", "purpose"].sort()
    );
    for (const legacyKey of ["entity_types", "repos", "relationship_types"]) {
      expect(v1.properties).not.toHaveProperty(legacyKey);
    }
    // The chain is declared as the empty array only.
    expect(v1.properties.delegation_chain.maxItems).toBe(0);
  });

  it("v1 param_constraints has exactly the six required keys, all closed", () => {
    const pc = schemas.AgentCapabilityParamConstraintsV1;
    expect(pc.additionalProperties).toBe(false);
    const keys = [
      "contract_version",
      "operation_ids",
      "owner",
      "source_bytes",
      "sources",
      "entities",
    ];
    expect([...pc.required].sort()).toEqual([...keys].sort());
    expect(Object.keys(pc.properties).sort()).toEqual([...keys].sort());
    expect(pc.properties.contract_version.enum).toEqual([1]);
    expect(schemas.AgentCapabilityEntitiesConstraintV1.additionalProperties).toBe(false);
  });

  it("v1 operation_ids vocabulary is closed and names only declared operationIds", () => {
    const vocab: string[] =
      schemas.AgentCapabilityParamConstraintsV1.properties.operation_ids.items.enum;
    expect(vocab.slice().sort()).toEqual(
      [
        "getEntitySnapshot",
        "getFieldProvenance",
        "getSourceById",
        "listObservations",
        "listSources",
        "queryObservations",
        "store",
      ].sort()
    );
    const declared = new Set<string>();
    for (const methods of Object.values(spec.paths as Json)) {
      for (const op of Object.values(methods as Json)) {
        if (op && typeof op === "object" && (op as Json).operationId)
          declared.add((op as Json).operationId);
      }
    }
    for (const id of vocab)
      expect(declared.has(id), `${id} must be a declared operationId`).toBe(true);
    // Refused vocabulary stays out of the contract.
    for (const forbidden of [
      "correct",
      "createInterpretation",
      "createObservation",
      "createAgentGrant",
    ]) {
      expect(vocab).not.toContain(forbidden);
    }
  });

  it("max_observations is a required positive integer with no default", () => {
    const entities = schemas.AgentCapabilityEntitiesConstraintV1;
    expect(entities.required).toContain("max_observations");
    const mo = entities.properties.max_observations;
    expect(mo.type).toBe("integer");
    expect(mo.minimum).toBe(1);
    expect(mo).not.toHaveProperty("default");
  });

  it("grant schemas declare the reserved validity fields; create/update carry no default", () => {
    for (const name of ["AgentGrant", "AgentGrantCreate", "AgentGrantUpdate"]) {
      for (const field of ["valid_from", "valid_until"]) {
        const prop = schemas[name].properties[field];
        expect(prop, `${name}.${field}`).toBeTruthy();
        expect(prop.description).toMatch(/RESERVED/);
        expect(prop).not.toHaveProperty("default");
      }
      for (const field of ["match_thumbprint", "match_sub", "match_iss"]) {
        expect(schemas[name].properties[field]).toBeTruthy();
      }
    }
    // Neither request schema became required-field stricter.
    expect(schemas.AgentGrantCreate.required).toEqual(["label", "capabilities"]);
    expect(schemas.AgentGrantUpdate.required).toBeUndefined();
  });

  it("projections computed by the server are not declared as request fields", () => {
    for (const name of ["AgentGrantCreate", "AgentGrantUpdate"]) {
      for (const projected of ["grant_revision", "issued_by", "capability_digest"]) {
        expect(schemas[name].properties).not.toHaveProperty(projected);
      }
    }
  });

  it("AgentAttribution reserves the four grant-attribution keys", () => {
    for (const key of ["grant_id", "grant_revision", "capability_id", "capability_digest"]) {
      expect(schemas.AgentAttribution.properties[key]?.description).toMatch(/RESERVED/);
    }
  });

  it("the store entry precondition is declared as a reserved component, not on /store", () => {
    const entry = schemas.StoreEntityEntryConditionalV1;
    expect(entry.properties.expected_last_observation_id.nullable).toBe(true);
    for (const requestSchema of ["StoreRequest", "StoreStructuredRequest"]) {
      const items = schemas[requestSchema].properties.entities.items;
      expect(items.properties ?? {}).not.toHaveProperty("expected_last_observation_id");
      expect(schemas[requestSchema].properties).not.toHaveProperty("expected_last_observation_id");
    }
  });
});

describe("agent_grant SchemaDefinition", () => {
  const def = ENTITY_SCHEMAS.agent_grant;

  it("declares valid_from and valid_until with last_write merge policies", () => {
    for (const field of ["valid_from", "valid_until"]) {
      expect(def.schema_definition.fields[field]).toEqual({ type: "string", required: false });
      expect(def.reducer_config.merge_policies[field]).toEqual({ strategy: "last_write" });
    }
  });

  it("bumped the schema version", () => {
    expect(def.schema_version).toBe("1.1.0");
  });

  it("left every pre-existing field and identity rule unchanged", () => {
    const fields = def.schema_definition.fields;
    expect(fields.match_thumbprint).toEqual({ type: "string", required: false });
    expect(fields.capabilities).toEqual({ type: "array", required: true });
    expect(fields.status).toEqual({ type: "string", required: true });
    expect(def.schema_definition.canonical_name_fields).toEqual([
      { composite: ["match_thumbprint"] },
      { composite: ["match_sub", "match_iss"] },
      { composite: ["match_sub"] },
    ]);
    expect(def.schema_definition.name_collision_policy).toBe("merge");
  });
});

describe("the runtime still refuses the v1 shape", () => {
  it("validateCapabilities rejects a complete, well-formed v1 entry on capabilities[0].op", () => {
    try {
      validateCapabilities([v1Entry()]);
      throw new Error("expected the legacy validator to refuse the v1 entry");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentGrantValidationError);
      expect((err as AgentGrantValidationError).code).toBe("agent_grant_invalid");
      expect((err as AgentGrantValidationError).field).toBe("capabilities[0].op");
    }
  });

  it("a v1 entry beside a legacy entry is refused as a whole", () => {
    try {
      validateCapabilities([{ op: "retrieve", entity_types: ["task"] }, v1Entry()]);
      throw new Error("expected the legacy validator to refuse the mixed grant");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentGrantValidationError);
      expect((err as AgentGrantValidationError).field).toBe("capabilities[1].op");
    }
  });

  it("a v1 entry cannot be smuggled in under a legacy op", () => {
    const smuggled = { ...v1Entry(), op: "store" };
    // Legacy validation demands entity_types for a Neotoma-native op.
    expect(() => validateCapabilities([smuggled])).toThrow(AgentGrantValidationError);
  });

  it("legacy entries still validate to the same normalised shape", () => {
    expect(
      validateCapabilities([{ op: "retrieve", entity_types: [" task ", "task", "note"] }])
    ).toEqual([{ op: "retrieve", entity_types: ["task", "note"] }]);
    expect(
      validateCapabilities([
        {
          op: "create_relationship",
          entity_types: ["task"],
          relationship_types: ["PART_OF"],
        },
      ])
    ).toEqual([
      { op: "create_relationship", entity_types: ["task"], relationship_types: ["PART_OF"] },
    ]);
  });

  it("no legacy coverage check treats a v1 entry as covering any operation", () => {
    // A context whose only capability is a v1-shaped entry (as a stored grant
    // would carry it if an older writer had let it through). The legacy
    // enforcement path must deny every legacy op rather than throw or allow.
    const ctx = {
      sub: "agent@example.com",
      iss: "https://agent.example.com",
      thumbprint: "thumb-abc",
      tier: "software",
      capabilities: [v1Entry()],
      agentLabel: "agent@example.com",
      admitted: true,
    } as unknown as AgentCapabilityContext;
    for (const op of ["store", "store_structured", "correct", "retrieve"] as const) {
      for (const entityType of ["configuration", "task"]) {
        expect(() => enforceAgentCapability(op, [entityType], ctx)).toThrow(AgentCapabilityError);
      }
    }
  });
});

describe("OpenAPI edits that are runtime-live stay inert", () => {
  function run(method: string, path: string, body: Json) {
    let nextCalled = false;
    let status: number | undefined;
    let payload: Json | undefined;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(p: Json) {
        payload = p;
        return this;
      },
    } as unknown as express.Response;
    unknownFieldsGuard({ method, path, body } as express.Request, res, () => {
      nextCalled = true;
    });
    return { nextCalled, status, payload };
  }

  it("the unknown-fields guard registers no closed shape for the grant routes", () => {
    _resetUnknownFieldsGuardCache();
    const body = {
      label: "x",
      capabilities: [],
      match_thumbprint: "t",
      valid_from: "2030-01-01T00:00:00Z",
      valid_until: "2031-01-01T00:00:00Z",
      some_future_key: true,
    };
    // Open request schemas: the guard neither rejects nor newly accepts anything.
    expect(run("POST", "/agents/grants", body).nextCalled).toBe(true);
    expect(run("PATCH", "/agents/grants/g1", body).nextCalled).toBe(true);
  });

  it("POST /store keeps its closed top-level field set", () => {
    _resetUnknownFieldsGuardCache();
    const rejected = run("POST", "/store", {
      entities: [],
      expected_last_observation_id: "obs_x",
    });
    expect(rejected.status).toBe(400);
    expect(rejected.payload?.error_code).toBe("ERR_UNKNOWN_FIELD");
    expect(rejected.payload?.details.unknown_fields).toEqual(["expected_last_observation_id"]);
    const allowed = new Set<string>(rejected.payload?.details.allowed_fields);
    expect([...allowed].sort()).toEqual(Object.keys(schemas.StoreRequest.properties).sort());
    for (const reservedKey of ["capability_id", "grant_id", "valid_from", "capability_digest"]) {
      expect(allowed.has(reservedKey)).toBe(false);
    }
  });

  it("the advertised store tool schema does not mention the reserved precondition", () => {
    const storeSchema = getOpenApiInputSchemaOrThrow("store") as Json;
    expect(JSON.stringify(storeSchema)).not.toContain("expected_last_observation_id");
    const tools = buildToolDefinitions();
    const store = tools.find((t) => t.name === "store");
    expect(store).toBeTruthy();
    expect(JSON.stringify(store?.inputSchema)).not.toContain("expected_last_observation_id");
    expect(JSON.stringify(tools)).not.toContain("agent_capability_v1");
  });
});
