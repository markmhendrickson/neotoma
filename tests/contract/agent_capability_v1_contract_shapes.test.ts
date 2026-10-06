/**
 * Second layer of contract pins for the reserved `agent_capability_v1` type.
 *
 * `agent_capability_v1_contract.test.ts` pins the top-level shapes and the
 * runtime readers. This file pins what a later edit could change without any
 * other check noticing: nested closure, the error vocabulary, the validity
 * patterns, `$ref` integrity, the errors.md rows, and the wording of the
 * statements about which surfaces refuse a v1-shaped grant. It also validates
 * the example entry (and legacy entries) against the DECLARED schema with a
 * small JSON-Schema subset evaluator, so the fixture and the schema cannot
 * drift apart. (The evaluator is deliberately local: the repo has no direct
 * schema-validator dependency to import.)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { resolveOpenApiPath } from "../../src/shared/openapi_file.js";

type Json = Record<string, any>;

const spec = yaml.load(readFileSync(resolveOpenApiPath(), "utf-8")) as Json;
const schemas = spec.components.schemas as Record<string, Json>;
const errorsMd = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../docs/subsystems/errors.md"),
  "utf-8"
);

function resolve(ref: string): Json {
  const parts = ref.replace(/^#\//, "").split("/");
  let cur: any = spec;
  for (const p of parts) cur = cur?.[p];
  if (!cur) throw new Error(`dangling $ref ${ref}`);
  return cur;
}

/** Returns a list of violations (empty when `value` satisfies `schema`). */
function validate(schema: Json, value: any, path = "$"): string[] {
  if (schema.$ref) return validate(resolve(schema.$ref), value, path);
  const errs: string[] = [];
  if (schema.allOf) {
    for (const s of schema.allOf) errs.push(...validate(s, value, path));
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((s: Json) => validate(s, value, path).length === 0);
    if (matches.length !== 1) errs.push(`${path}: matched ${matches.length} oneOf branches`);
    return errs;
  }
  const t = schema.type;
  if (t === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return [`${path}: not an object`];
    }
    for (const r of schema.required ?? []) {
      if (!(r in value)) errs.push(`${path}.${r}: required`);
    }
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (k in props) errs.push(...validate(props[k], v, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}.${k}: unknown key`);
    }
  } else if (t === "array") {
    if (!Array.isArray(value)) return [`${path}: not an array`];
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errs.push(`${path}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errs.push(`${path}: maxItems`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      errs.push(`${path}: uniqueItems`);
    }
    if (schema.items)
      value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  } else if (t === "string") {
    if (typeof value !== "string") return [`${path}: not a string`];
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errs.push(`${path}: minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: pattern`);
  } else if (t === "integer") {
    if (!Number.isInteger(value)) return [`${path}: not an integer`];
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: maximum`);
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: not in enum`);
  return errs;
}

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
      sources: [
        { source_id: "src_1", sha256: "b".repeat(64), byte_length: 3, mime_type: "text/plain" },
      ],
      entities: {
        entity_type: "configuration",
        composite: { system: "example", key: "example" },
        bound_fields: { schema_version: 1 },
        max_observations: 10,
      },
    },
  };
}

function mutated(fn: (e: Json) => void): Json {
  const e = v1Entry();
  fn(e);
  return e;
}

describe("the declared schema accepts exactly the shapes the contract describes", () => {
  const entry = schemas.AgentCapabilityEntry;

  it("accepts the example v1 entry and legacy entries, each by exactly one branch", () => {
    expect(validate(entry, v1Entry())).toEqual([]);
    expect(validate(entry, { op: "retrieve", entity_types: ["task"] })).toEqual([]);
    expect(
      validate(entry, {
        op: "create_relationship",
        entity_types: ["task"],
        relationship_types: ["PART_OF"],
      })
    ).toEqual([]);
  });

  it("the evaluator can fail: a clearly wrong entry is rejected", () => {
    expect(validate(entry, { op: "teleport" }).length).toBeGreaterThan(0);
  });

  const rejected: Array<[string, Json]> = [
    ["extra top-level key", mutated((e) => (e.extra = 1))],
    ["legacy entity_types on a v1 entry", mutated((e) => (e.entity_types = ["task"]))],
    ["non-empty delegation chain", mutated((e) => (e.delegation_chain = [{}]))],
    ["open purpose", mutated((e) => (e.purpose.extra = 1))],
    ["open owner", mutated((e) => (e.param_constraints.owner.extra = 1))],
    ["open composite", mutated((e) => (e.param_constraints.entities.composite.extra = 1))],
    ["open entities constraint", mutated((e) => (e.param_constraints.entities.extra = 1))],
    ["open source_bytes item", mutated((e) => (e.param_constraints.source_bytes[0].extra = 1))],
    ["open sources item", mutated((e) => (e.param_constraints.sources[0].extra = 1))],
    [
      "sources item without source_id",
      mutated((e) => delete e.param_constraints.sources[0].source_id),
    ],
    [
      "uppercase digest",
      mutated((e) => (e.param_constraints.source_bytes[0].sha256 = "A".repeat(64))),
    ],
    [
      "float max_observations",
      mutated((e) => (e.param_constraints.entities.max_observations = 1.5)),
    ],
    ["zero max_observations", mutated((e) => (e.param_constraints.entities.max_observations = 0))],
    [
      "missing max_observations",
      mutated((e) => delete e.param_constraints.entities.max_observations),
    ],
    ["refused operation id", mutated((e) => (e.param_constraints.operation_ids = ["correct"]))],
    [
      "duplicate operation ids",
      mutated((e) => (e.param_constraints.operation_ids = ["store", "store"])),
    ],
    ["other entity type", mutated((e) => (e.param_constraints.entities.entity_type = "task"))],
    ["unknown contract version", mutated((e) => (e.param_constraints.contract_version = 2))],
  ];
  for (const [name, bad] of rejected) {
    it(`rejects: ${name}`, () => {
      expect(validate(entry, bad).length).toBeGreaterThan(0);
    });
  }
});

describe("contract integrity", () => {
  it("every $ref in openapi.yaml resolves", () => {
    const dangling: string[] = [];
    const walk = (node: any) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          if (k === "$ref" && typeof v === "string" && v.startsWith("#/")) {
            try {
              resolve(v);
            } catch {
              dangling.push(v);
            }
          } else walk(v);
        }
      }
    };
    walk(spec);
    expect(dangling).toEqual([]);
  });

  it("the validity patterns exist on the request schemas and accept only RFC 3339 forms", () => {
    for (const name of ["AgentGrantCreate", "AgentGrantUpdate"]) {
      for (const field of ["valid_from", "valid_until"]) {
        const pattern = schemas[name].properties[field].pattern as string;
        expect(pattern, `${name}.${field}`).toBeTruthy();
        const re = new RegExp(pattern);
        for (const ok of [
          "2030-01-01T00:00:00Z",
          "2030-01-01T00:00:00+02:00",
          "2030-01-01T00:00:00.5-05:30",
        ]) {
          expect(re.test(ok), ok).toBe(true);
        }
        for (const bad of [
          "2030-01-01",
          "2030-01-01T00:00:00",
          "2030-01-01t00:00:00z",
          "tomorrow",
        ]) {
          expect(re.test(bad), bad).toBe(false);
        }
      }
    }
  });

  const reservedCodes = [
    "ERR_ACQUISITION_NOT_AUTHORIZED",
    "ERR_AUTHORITY_CHANGED",
    "ERR_V1_OWNER_SESSION_REQUIRED",
    "ERR_V1_ROUTE_NOT_PERMITTED",
    "ERR_V1_WRITE_BUDGET_EXHAUSTED",
  ];

  it("the reserved error envelope lists every reserved code", () => {
    const enumValues = schemas.AgentCapabilityV1ErrorEnvelope.allOf[1].properties.error_code.enum;
    expect([...enumValues].sort()).toEqual([...reservedCodes].sort());
  });

  it("ERR_REVISION_CONFLICT is a declared store resolution issue code", () => {
    expect(schemas.StoreResolutionIssue.properties.code.enum).toContain("ERR_REVISION_CONFLICT");
  });

  it("errors.md has a row for every reserved code, the conflict code and every v1 reason", () => {
    for (const code of [...reservedCodes, "ERR_REVISION_CONFLICT"]) {
      expect(errorsMd, code).toMatch(new RegExp("^\\| `" + code + "` \\|", "m"));
    }
    for (const reason of [
      "delegation_unsupported_v1",
      "validity_required",
      "validity_malformed",
      "validity_window_invalid",
      "pins_required",
      "operation_id_not_permitted",
      "legacy_capability_mixed",
      "key_already_pinned",
      "unknown_constraint",
      "write_budget_required",
    ]) {
      expect(errorsMd, reason).toMatch(new RegExp("^\\| `" + reason + "` \\|", "m"));
    }
  });
});

describe("statements about which surfaces refuse a v1-shaped grant are honest", () => {
  const collapse = (t: string) => t.replace(/\s+/g, " ");
  const entryDescription: string = collapse(schemas.AgentCapabilityEntry.description);
  const errorsIntro = errorsMd.slice(
    errorsMd.indexOf("### Agent Capability v1 Errors (reserved)"),
    errorsMd.indexOf("All of these ride in")
  );

  for (const [label, text] of [
    ["the AgentCapabilityEntry description", entryDescription],
    ["the errors.md section intro", errorsIntro],
  ] as const) {
    it(`${label} names the surfaces that refuse and the MCP store exception`, () => {
      for (const surface of [
        "POST /agents/grants",
        "PATCH /agents/grants",
        "POST /store",
        "POST /correct",
      ]) {
        expect(text, surface).toContain(surface);
      }
      expect(text).toMatch(/MCP `store`/);
      expect(text).toMatch(/fails? closed|no authority/i);
      expect(text).not.toMatch(/every write surface/i);
    });
  }

  it("the reserved attribution keys state their guest visibility and that they are not proof", () => {
    for (const key of ["grant_id", "grant_revision", "capability_id", "capability_digest"]) {
      const d: string = schemas.AgentAttribution.properties[key].description;
      expect(d, key).toMatch(/guest/i);
      expect(d, key).toMatch(/not proof|never proof|proof on its own/i);
    }
  });

  it("errors.md does not claim that no code carries a revision id while the conflict row does", () => {
    expect(errorsMd).toContain("current_last_observation_id");
    expect(errorsMd).not.toMatch(/None echoes a key, token, digest or revision id/);
  });
});

describe("store conflict status rule", () => {
  it("the /store 409 description states when 409 is used versus the 400 resolution envelope", () => {
    const d: string = spec.paths["/store"].post.responses["409"].description;
    expect(d).toMatch(/every issue/i);
    expect(d).toMatch(/ERR_REVISION_CONFLICT/);
    expect(d).toMatch(/400/);
  });
});
