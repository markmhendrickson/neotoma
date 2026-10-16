import { describe, expect, it } from "vitest";
import { parseNativeTransitionRequest } from "./native_transition_request.js";
import { nativeSchemaReducerHash } from "./native_transition_projection.js";
import { getOpenApiInputSchemaForOperationId } from "../shared/openapi_schema.js";
import { buildToolDefinitions } from "../tool_definitions.js";

const entity = "ent_" + "a".repeat(24);
const digest = "b".repeat(64);
const subject = { entity_type: "task", entity_id: entity };
const target = { entity_type: "task", entity_id: entity, step_name: null };
const transitions = [
  {
    name: "checkpoint.raise",
    subject,
    reason: "Synthetic hold",
    needed_input: "Synthetic decision",
    options: [{ name: "approved", confidence: 0.76 }],
    awaited_roles: ["synthetic-seat"],
  },
  {
    name: "checkpoint.resolve",
    checkpoint_id: entity,
    subject,
    decision: "approved",
    self_resolved: false,
    resolution_note: "Synthetic decision",
  },
  {
    name: "lease.acquire",
    target,
    runner_id: "runner-a",
    requested_duration_seconds: 30,
    pinned_agent_version: "test-version",
    pinned_declaration_sha256: digest,
  },
  {
    name: "lease.renew",
    target,
    runner_id: "runner-a",
    requested_duration_seconds: 30,
    claim_observation_id: "test-claim",
    expected_lease_observation_id: "test-current",
  },
  {
    name: "lease.return",
    target,
    runner_id: "runner-a",
    claim_observation_id: "test-claim",
    expected_lease_observation_id: "test-current",
  },
  {
    name: "verdict.submit",
    batch_id: entity,
    step_name: "test-step",
    claim_observation_id: "test-claim",
    runner_id: "runner-a",
    agent_version: "test-version",
    declaration_sha256: digest,
    conclusion: "blocked",
    artifact_refs: [],
    read_refs: [],
    findings: [
      {
        severity: "test-severity",
        kind: "test-kind",
        scope: {},
        evidence: { confidence: 0.76 },
        text: "Synthetic finding",
      },
    ],
    successor: null,
  },
];
function body(index = 1): Record<string, any> {
  return structuredClone({
    protocol: "native-record-transition-v1",
    idempotency_key: "test-native-key",
    expected: {
      recipe_version: "native-readset-v1",
      schema_reducer_sha256: nativeSchemaReducerHash(digest),
      groups: [
        {
          selector: {
            registry: {
              entity_types: ["checkpoint"],
              relationship_types: [],
              reducer_versions: ["test-reducer"],
            },
          },
          count: 1,
          rows_sha256: digest,
        },
      ],
    },
    transition: transitions[index],
  });
}

describe("closed native transaction input", () => {
  it.each(transitions.map((t, index) => [t.name, index] as const))(
    "retains the exact %s structural body without granting admission",
    (_name, index) => {
      const input = body(index);
      expect(parseNativeTransitionRequest(input)).toEqual(input);
      expect(input).toEqual(body(index));
    }
  );
  it.each([
    [
      "unknown protocol",
      (v: ReturnType<typeof body>) => {
        v.protocol = "native-record-transition-v2";
      },
    ],
    [
      "mixed ordinary branch",
      (v: ReturnType<typeof body>) => {
        v.entities = [];
      },
    ],
    [
      "body tenant",
      (v: ReturnType<typeof body>) => {
        v.user_id = "synthetic-owner";
      },
    ],
    [
      "body actor",
      (v: ReturnType<typeof body>) => {
        v.actor = entity;
      },
    ],
    [
      "unknown expected field",
      (v: ReturnType<typeof body>) => {
        v.expected.permit = true;
      },
    ],
    [
      "unknown transition field",
      (v: ReturnType<typeof body>) => {
        v.transition.force = true;
      },
    ],
    [
      "missing decision",
      (v: ReturnType<typeof body>) => {
        delete v.transition.decision;
      },
    ],
    [
      "unknown transition",
      (v: ReturnType<typeof body>) => {
        v.transition.name = "checkpoint.dispatch";
      },
    ],
    [
      "unknown decision",
      (v: ReturnType<typeof body>) => {
        v.transition.decision = "rejected";
      },
    ],
    [
      "nonboolean self resolution",
      (v: ReturnType<typeof body>) => {
        v.transition.self_resolved = "false";
      },
    ],
    [
      "unscoped identity",
      (v: ReturnType<typeof body>) => {
        v.transition.checkpoint_id = "checkpoint";
      },
    ],
    [
      "blank key",
      (v: ReturnType<typeof body>) => {
        v.idempotency_key = " ";
      },
    ],
    [
      "long key",
      (v: ReturnType<typeof body>) => {
        v.idempotency_key = "a".repeat(201);
      },
    ],
    [
      "old expected grammar",
      (v: ReturnType<typeof body>) => {
        v.expected = { entity_counts: [] };
      },
    ],
    [
      "fractional count",
      (v: ReturnType<typeof body>) => {
        v.expected.groups[0].count = 0.76;
      },
    ],
    [
      "unsafe count",
      (v: ReturnType<typeof body>) => {
        v.expected.groups[0].count = 2 ** 53;
      },
    ],
    [
      "negative count",
      (v: ReturnType<typeof body>) => {
        v.expected.groups[0].count = -1;
      },
    ],
    [
      "nonfinite count",
      (v: ReturnType<typeof body>) => {
        v.expected.groups[0].count = Infinity;
      },
    ],
    [
      "missing registry",
      (v: ReturnType<typeof body>) => {
        v.expected.groups = [];
      },
    ],
    [
      "duplicate registry",
      (v: ReturnType<typeof body>) => {
        v.expected.groups.push(structuredClone(v.expected.groups[0]));
      },
    ],
    [
      "outer hash mismatch",
      (v: ReturnType<typeof body>) => {
        v.expected.schema_reducer_sha256 = "c".repeat(64);
      },
    ],
    [
      "mixed selector",
      (v: ReturnType<typeof body>) => {
        v.expected.groups[0].selector.entity = { entity_id: entity };
      },
    ],
    [
      "unsorted registry types",
      (v: ReturnType<typeof body>) => {
        v.expected.groups[0].selector.registry.entity_types = ["verdict", "checkpoint"];
      },
    ],
    [
      "duplicate registry types",
      (v: ReturnType<typeof body>) => {
        v.expected.groups[0].selector.registry.entity_types = ["checkpoint", "checkpoint"];
      },
    ],
  ] as const)("refuses %s without coercion", (_name, mutate) => {
    const input = body();
    mutate(input);
    expect(() => parseNativeTransitionRequest(input)).toThrow();
  });
  it.each([0.76, Number.MAX_SAFE_INTEGER + 1, 0, -1, Infinity])(
    "refuses invalid duration %s",
    (duration) => {
      const input = body(2);
      input.transition.requested_duration_seconds = duration;
      expect(() => parseNativeTransitionRequest(input)).toThrow();
    }
  );
  it("checks both slot selector and target step domains without truncating UTF-8", () => {
    const input = body(2);
    input.transition.target.step_name = "step";
    expect(() => parseNativeTransitionRequest(input)).toThrow();
    input.transition.target.entity_type = "batch";
    input.transition.target.step_name = "é".repeat(128);
    expect(parseNativeTransitionRequest(input)).toEqual(input);
    input.transition.target.step_name += "é";
    expect(() => parseNativeTransitionRequest(input)).toThrow();
    input.transition.target.step_name = "test";
    input.expected.groups.unshift({
      selector: { slot: { target_type: "task", target_id: entity, step_name: "test" } },
      count: 0,
      rows_sha256: digest,
    });
    expect(() => parseNativeTransitionRequest(input)).toThrow();
  });
  it("requires original declared JSON keys even where their registered type is unknown", () => {
    for (const field of ["successor", "findings"]) {
      const input = body(5);
      if (field === "successor") delete input.transition.successor;
      else delete input.transition.findings[0].evidence;
      expect(() => parseNativeTransitionRequest(input)).toThrow();
    }
  });
  it("rejects an accessor before reading it", () => {
    const input = body();
    let reads = 0;
    Object.defineProperty(input, "transition", {
      enumerable: true,
      get() {
        reads++;
        return transitions[1];
      },
    });
    expect(() => parseNativeTransitionRequest(input)).toThrow();
    expect(reads).toBe(0);
  });
  it("retains the ordinary/native union and resolves every nested reference in actual MCP metadata", () => {
    const schema = getOpenApiInputSchemaForOperationId("correctTransaction");
    expect(schema.type).toBe("object");
    const branches = schema.oneOf as Record<string, any>[];
    expect(branches).toHaveLength(2);
    expect(branches[0].required).toEqual(["idempotency_key", "entities"]);
    expect(branches[1].additionalProperties).toBe(false);
    expect(branches[1].properties.transition.oneOf).toHaveLength(6);
    expect(branches[1].properties.expected.properties.recipe_version.enum).toEqual([
      "native-readset-v1",
    ]);
    expect(JSON.stringify(schema)).not.toContain('"$ref"');
    const actual = buildToolDefinitions().find((t) => t.name === "correct_transaction")!;
    expect(actual.inputSchema).toEqual(schema);
  });
});
