import { describe, expect, it } from "vitest";
import { parseNativeTransitionRequest } from "./native_transition_request.js";
import { nativeSchemaReducerHash } from "./native_transition_projection.js";
import { getOpenApiInputSchemaForOperationId } from "../shared/openapi_schema.js";
import { buildToolDefinitions } from "../tool_definitions.js";
import * as wire from "./native_transition_request.js";
import { createHash } from "node:crypto";
import { canonicalStoreRequest } from "./store_condition_keys.js";

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
function v2Body(index = 0) {
  const input = body(index);
  input.expected.recipe_version = "native-readset-v2";
  input.expected.groups.unshift({
    selector: { bindings: { credential_kind: "aauth_sub", credential_key_sha256: digest } },
    count: 0,
    rows_sha256: digest,
  });
  return input;
}
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("versioned native wire preimages without authority", () => {
  it.each(transitions.map((t, i) => [t.name, i] as const))(
    "retains complete v2 %s intent without admitting it",
    (_name, i) => {
      const input = v2Body(i);
      expect(parseNativeTransitionRequest(input)).toEqual(input);
      expect(input).toEqual(v2Body(i));
    }
  );
  it.each([
    ["absent binding", (n: any) => n.expected.groups.shift()],
    [
      "duplicate binding",
      (n: any) => n.expected.groups.unshift(structuredClone(n.expected.groups[0])),
    ],
    [
      "foreign kind",
      (n: any) => {
        n.expected.groups[0].selector.bindings.credential_kind = "other";
      },
    ],
    [
      "extra binding field",
      (n: any) => {
        n.expected.groups[0].selector.bindings.permit = true;
      },
    ],
    [
      "mixed version",
      (n: any) => {
        n.expected.recipe_version = "native-readset-v1";
      },
    ],
    ["unsorted groups", (n: any) => n.expected.groups.reverse()],
    [
      "unknown version",
      (n: any) => {
        n.expected.recipe_version = "native-readset-v3";
      },
    ],
    [
      "extra expected field",
      (n: any) => {
        n.expected.complete = true;
      },
    ],
    [
      "unsafe count",
      (n: any) => {
        n.expected.groups[0].count = 2 ** 53;
      },
    ],
    [
      "fractional count",
      (n: any) => {
        n.expected.groups[0].count = 0.76;
      },
    ],
    [
      "nonfinite data",
      (n: any) => {
        n.transition.options[0].confidence = Infinity;
      },
    ],
    [
      "undefined data",
      (n: any) => {
        n.transition.options[0].confidence = undefined;
      },
    ],
    [
      "sparse data",
      (n: any) => {
        n.transition.options = new Array(1);
      },
    ],
    [
      "cyclic data",
      (n: any) => {
        n.transition.options[0] = n;
      },
    ],
    [
      "wrong registry digest",
      (n: any) => {
        n.expected.schema_reducer_sha256 = digest;
      },
    ],
    ["absent registry", (n: any) => n.expected.groups.pop()],
  ] as const)("refuses %s before hashing", (_name, mutate) => {
    const input = v2Body();
    mutate(input);
    expect(() => parseNativeTransitionRequest(input)).toThrow();
    if (!["nonfinite data", "undefined data", "sparse data", "cyclic data"].includes(_name))
      expect(() => wire.nativeExpectedReadsetHash(input.expected)).toThrow();
    expect(() => wire.nativeMcpIntentHash(input)).toThrow();
    expect(() => wire.nativeMcpOperationFingerprint("tenant-a", "agent-a", input)).toThrow();
  });
  it("checks original descriptors before hashing without invoking an accessor", () => {
    const input = v2Body();
    let reads = 0;
    Object.defineProperty(input.expected, "groups", {
      enumerable: true,
      get() {
        reads++;
        return [];
      },
    });
    expect(() => wire.nativeExpectedReadsetHash(input.expected)).toThrow();
    expect(() => wire.nativeMcpIntentHash(input)).toThrow();
    expect(reads).toBe(0);
  });
  it("pins the exact complete expected preimage and every group count/digest", () => {
    const input = v2Body();
    const expectedBytes =
      '["native-expected-readset-v1",{"groups":[{"count":0,"rows_sha256":"' +
      digest +
      '","selector":{"bindings":{"credential_key_sha256":"' +
      digest +
      '","credential_kind":"aauth_sub"}}},{"count":1,"rows_sha256":"' +
      digest +
      '","selector":{"registry":{"entity_types":["checkpoint"],"reducer_versions":["test-reducer"],"relationship_types":[]}}}],"recipe_version":"native-readset-v2","schema_reducer_sha256":"' +
      nativeSchemaReducerHash(digest) +
      '"}]';
    expect(canonicalStoreRequest(["native-expected-readset-v1", input.expected])).toBe(
      expectedBytes
    );
    const original = wire.nativeExpectedReadsetHash(input.expected);
    expect(original).toBe(sha(expectedBytes));
    for (const i of [0, 1]) {
      const changed = v2Body();
      changed.expected.groups[i].count++;
      expect(wire.nativeExpectedReadsetHash(changed.expected)).not.toBe(original);
    }
    const changed = v2Body();
    changed.expected.groups[0].rows_sha256 = "c".repeat(64);
    expect(wire.nativeExpectedReadsetHash(changed.expected)).not.toBe(original);
    const added = v2Body();
    added.expected.groups.push({
      selector: { slot: { target_type: "task", target_id: entity, step_name: null } },
      count: 0,
      rows_sha256: digest,
    });
    expect(wire.nativeExpectedReadsetHash(added.expected)).not.toBe(original);
    const registry = v2Body();
    registry.expected.groups[1].rows_sha256 = "c".repeat(64);
    registry.expected.schema_reducer_sha256 = nativeSchemaReducerHash("c".repeat(64));
    expect(wire.nativeExpectedReadsetHash(registry.expected)).not.toBe(original);
    expect(() => wire.nativeExpectedReadsetHash(body().expected)).toThrow();
  });
  it("binds every native argument into MCP I/F with fixed versioned method/path and actor", () => {
    const input = v2Body();
    const I = wire.nativeMcpIntentHash(input);
    expect(I).toBe(sha(canonicalStoreRequest(["native-mcp-intent-v1", input])));
    const F = wire.nativeMcpOperationFingerprint("tenant-a", "agent-a", input);
    const bytes =
      '["native-transition-v2","tenant-a","agent-a",null,"POST","/mcp","tools/call","correct_transaction","' +
      I +
      '","' +
      input.expected.schema_reducer_sha256 +
      '"]';
    expect(F).toBe(sha(bytes));
    for (const mutate of [
      (n: any) => {
        n.idempotency_key += "-other";
      },
      (n: any) => {
        n.transition.reason += " changed";
      },
      (n: any) => {
        n.transition.options[0].confidence = 0.77;
      },
      (n: any) => {
        n.expected.groups[0].count++;
      },
    ]) {
      const changed = v2Body();
      mutate(changed);
      expect(wire.nativeMcpIntentHash(changed)).not.toBe(I);
      expect(wire.nativeMcpOperationFingerprint("tenant-a", "agent-a", changed)).not.toBe(F);
    }
    expect(wire.nativeMcpOperationFingerprint("tenant-b", "agent-a", input)).not.toBe(F);
    expect(wire.nativeMcpOperationFingerprint("tenant-a", "agent-b", input)).not.toBe(F);
    expect(() => wire.nativeMcpIntentHash(body())).toThrow();
    const unknown = v2Body();
    unknown._meta = { progressToken: 1 };
    expect(() => wire.nativeMcpIntentHash(unknown)).toThrow();
  });
  it("preserves finite fractional/-0/exponent C semantics without claiming raw envelope verification", () => {
    const a = v2Body(),
      b = v2Body();
    a.transition.options[0] = { confidence: 0.76, zero: -0, small: 1e-7 };
    b.transition.options[0] = { small: 0.0000001, zero: 0, confidence: 0.76 };
    expect(wire.nativeMcpIntentHash(a)).toBe(wire.nativeMcpIntentHash(b));
    expect(wire.nativeMcpOperationFingerprint("tenant-a", "agent-a", a)).toBe(
      wire.nativeMcpOperationFingerprint("tenant-a", "agent-a", b)
    );
  });
  it("keeps REST exact raw-byte fingerprinting distinct from MCP semantic intent", () => {
    const n = v2Body();
    const first = JSON.stringify(n),
      second = JSON.stringify(n, null, 2);
    const firstHash = sha(first),
      secondHash = sha(second);
    const F = wire.nativeRestOperationFingerprint(
      "tenant-a",
      "agent-a",
      firstHash,
      n.expected.schema_reducer_sha256
    );
    expect(F).toBe(
      sha(
        '["native-transition-v1","tenant-a","agent-a",null,"POST","/corrections/transaction","' +
          firstHash +
          '","' +
          n.expected.schema_reducer_sha256 +
          '"]'
      )
    );
    expect(
      wire.nativeRestOperationFingerprint(
        "tenant-a",
        "agent-a",
        secondHash,
        n.expected.schema_reducer_sha256
      )
    ).not.toBe(F);
    expect(wire.nativeMcpOperationFingerprint("tenant-a", "agent-a", n)).not.toBe(F);
  });
  it.each(["", " ", null, 0, undefined])(
    "refuses invalid arithmetic scope %s without defaults",
    (value) => {
      expect(() =>
        wire.nativeMcpOperationFingerprint(value as string, "agent-a", v2Body())
      ).toThrow();
      expect(() =>
        wire.nativeMcpOperationFingerprint("tenant-a", value as string, v2Body())
      ).toThrow();
      expect(() =>
        wire.nativeRestOperationFingerprint(value as string, "agent-a", digest, digest)
      ).toThrow();
      expect(() =>
        wire.nativeRestOperationFingerprint("tenant-a", value as string, digest, digest)
      ).toThrow();
    }
  );
  it.each(["", "A".repeat(64), "b".repeat(63), "b".repeat(65), null, 0])(
    "refuses invalid digest %s",
    (value) => {
      expect(() =>
        wire.nativeRestOperationFingerprint("tenant-a", "agent-a", value as string, digest)
      ).toThrow();
      expect(() =>
        wire.nativeRestOperationFingerprint("tenant-a", "agent-a", digest, value as string)
      ).toThrow();
    }
  );
});

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
    const expected = branches[1].properties.expected.oneOf;
    expect(expected.map((e: any) => e.properties.recipe_version.enum)).toEqual([
      ["native-readset-v1"],
      ["native-readset-v2"],
    ]);
    expect(
      expected[1].properties.groups.items.properties.selector.oneOf[1].properties.bindings
        .properties.credential_kind.enum
    ).toEqual(["aauth_sub"]);
    expect(expected[0].properties.groups.description).toContain("More than 256 distinct IDs");
    expect(expected[0].properties.groups.description).toContain("lower-bound refusal only");
    expect(JSON.stringify(schema)).not.toContain('"$ref"');
    const actual = buildToolDefinitions().find((t) => t.name === "correct_transaction")!;
    expect(actual.inputSchema).toEqual(schema);
  });
});
