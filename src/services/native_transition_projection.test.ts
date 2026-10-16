import { describe, expect, it } from "vitest";
import vectors from "../../tests/fixtures/json/native_transition_projection.json";
import {
  nativeEntityIdentity,
  nativeOperationKey,
  nativeReceiptMember,
  nativeReceiptMembership,
  nativeReceiptProjection,
  nativeSchemaReducerHash,
  type NativeReceiptTable,
} from "./native_transition_projection.js";

const anchorId = "synthetic-anchor";
const observation = () => structuredClone(vectors.receipt_row) as Record<string, unknown>;
function anchor() {
  return {
    ...observation(),
    id: anchorId,
    fields: {},
    canonical_hash: null,
    idempotency_key: vectors.identity_vectors[0].K,
    provenance: {
      authenticated_actual_principal: "synthetic-principal",
      native_transition_receipt: { version: 1 },
    },
  };
}
function entity() {
  return {
    id: "ent_000000000000000000000003",
    entity_type: "checkpoint",
    user_id: "synthetic-tenant",
    canonical_name: "synthetic-name",
    aliases: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    first_seen_at: null,
    last_seen_at: null,
    merged_to_entity_id: null,
    merged_at: null,
  };
}
function relationship(): Record<string, unknown> {
  return {
    id: "synthetic-edge",
    relationship_key: "synthetic-key",
    relationship_type: "CHECKPOINTS",
    source_entity_id: "ent_000000000000000000000003",
    target_entity_id: "ent_000000000000000000000004",
    source_id: null,
    interpretation_id: null,
    observed_at: "2026-01-01T00:00:00Z",
    specificity_score: 0.76,
    source_priority: 100,
    metadata: {},
    canonical_hash: null,
    created_at: "2026-01-01T00:00:00Z",
    user_id: "synthetic-tenant",
    provenance: {},
  };
}

describe("native transition deterministic projections (not admission)", () => {
  it.each(vectors.identity_vectors)(
    "matches the frozen identity bytes for $entity_type $tenant_salt $actor",
    (vector) => {
      const key = nativeOperationKey("synthetic-tenant", vector.actor, "same-valid-opaque-key");
      expect(key).toBe(vector.K);
      const findingIndex =
        vector.entity_type === "finding"
          ? Number(vector.canonical_name.split(":").at(-1))
          : undefined;
      expect(
        nativeEntityIdentity(
          key,
          vector.transition,
          vector.entity_type as "checkpoint" | "verdict" | "finding",
          {
            tenantSalt: vector.tenant_salt ?? undefined,
            findingIndex,
          }
        )
      ).toEqual({
        scope: vector.S,
        canonicalName: vector.canonical_name,
        entityId: vector.entity_id,
      });
    }
  );

  it("separates actors while retaining the same key for changed transition content", () => {
    const first = nativeOperationKey("tenant", "actual-principal-one", "same-key");
    const second = nativeOperationKey("tenant", "actual-principal-two", "same-key");
    expect(first).not.toBe(second);
    expect(nativeOperationKey("tenant", "actual-principal-one", "same-key")).toBe(first);
    expect(nativeEntityIdentity(first, "checkpoint.raise", "checkpoint").scope).not.toBe(
      nativeEntityIdentity(first, "verdict.submit", "verdict").scope
    );
    // Storage must still enforce the operation fingerprint under this same key.
  });

  it("rejects absent identities, invalid operations and malformed finding ordinals", () => {
    for (const identity of ["", " ", null, undefined])
      expect(() => nativeOperationKey("tenant", identity as string, "key")).toThrow();
    expect(() => nativeOperationKey("tenant", "actor", "x".repeat(201))).toThrow();
    const key = nativeOperationKey("tenant", "actor", "key");
    for (const ordinal of [undefined, null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity])
      expect(() =>
        nativeEntityIdentity(key, "verdict.submit", "finding", { findingIndex: ordinal as number })
      ).toThrow();
    expect(() => nativeEntityIdentity(key, "unknown", "verdict")).toThrow();
    expect(() =>
      nativeEntityIdentity(key, "verdict.submit", "verdict", { findingIndex: 0 })
    ).toThrow();
    expect(() =>
      nativeEntityIdentity(key, "verdict.submit", "verdict", { tenantSalt: "" })
    ).toThrow();
    expect(() => nativeEntityIdentity(key, "verdict.submit", "verdict", false as never)).toThrow();
    expect(() =>
      nativeEntityIdentity(key, "verdict.submit", "verdict", { extra: true } as never)
    ).toThrow();
  });

  it("matches the frozen full observation payload hash, including finite fractions", () => {
    expect(nativeReceiptMember("observations", observation(), anchorId).payload_sha256).toBe(
      vectors.receipt_original_sha256
    );
  });

  it.each(vectors.receipt_mutation_vectors)("matches the frozen $field mutation hash", (vector) => {
    const values: Record<string, string> = {
      user_id: "different-tenant",
      observation_source: "llm_summary",
      source_peer_id: "different-peer",
      canonical_key: "different-key",
      created_at: "2026-01-02T00:00:00Z",
    };
    expect(
      nativeReceiptMember(
        "observations",
        { ...observation(), [vector.field]: values[vector.field] },
        anchorId
      ).payload_sha256
    ).toBe(vector.sha256);
  });

  it.each(Object.keys(vectors.receipt_row))(
    "binds every classified observation column: %s",
    (field) => {
      const row = observation();
      const original = nativeReceiptMember("observations", row, anchorId);
      const value = row[field];
      row[field] =
        typeof value === "number"
          ? value + 1
          : value && typeof value === "object"
            ? { changed: true }
            : "changed";
      expect(nativeReceiptMember("observations", row, anchorId).payload_sha256).not.toBe(
        original.payload_sha256
      );
      delete row[field];
      expect(() => nativeReceiptMember("observations", row, anchorId)).toThrowError(
        expect.objectContaining({
          code: "NATIVE_DEPENDENCY_UNAVAILABLE",
          dependency: "receipt_projection_version",
        })
      );
    }
  );

  it.each(Object.keys(relationship()))(
    "binds every classified relationship column: %s",
    (field) => {
      const row = relationship();
      const original = nativeReceiptMember("relationship_observations", row, anchorId);
      row[field] =
        typeof row[field] === "number"
          ? Number(row[field]) + 1
          : row[field] && typeof row[field] === "object"
            ? { changed: true }
            : "changed";
      expect(
        nativeReceiptMember("relationship_observations", row, anchorId).payload_sha256
      ).not.toBe(original.payload_sha256);
    }
  );

  it("binds entity identity and owner while explicitly excluding catalogue materialization", () => {
    const row = entity();
    const before = nativeReceiptMember("entities", row, anchorId).payload_sha256;
    for (const field of ["id", "entity_type", "user_id"])
      expect(
        nativeReceiptMember("entities", { ...row, [field]: "different" }, anchorId).payload_sha256
      ).not.toBe(before);
    expect(
      nativeReceiptProjection(
        "entities",
        { ...row, canonical_name: "renamed", aliases: ["new-alias"], updated_at: "later" },
        anchorId
      )
    ).toEqual({ id: row.id, entity_type: row.entity_type, user_id: row.user_id });
    expect(
      nativeReceiptMember(
        "entities",
        { ...row, canonical_name: "renamed", aliases: ["new-alias"] },
        anchorId
      ).payload_sha256
    ).toBe(before);
    expect(() =>
      nativeReceiptMember("entities", { ...row, unclassified_column: null }, anchorId)
    ).toThrow();
  });

  it("excludes only the anchor receipt subtree without mutating the supplied row", () => {
    const row = anchor();
    const copy = structuredClone(row);
    const before = nativeReceiptMember("observations", row, anchorId).payload_sha256;
    expect(row).toEqual(copy);
    row.provenance.native_transition_receipt = { version: 2 };
    expect(nativeReceiptMember("observations", row, anchorId).payload_sha256).toBe(before);
    row.provenance.authenticated_actual_principal = "other-principal";
    expect(nativeReceiptMember("observations", row, anchorId).payload_sha256).not.toBe(before);
    expect(copy.provenance.native_transition_receipt).toEqual({ version: 1 });
    expect(() => nativeReceiptMember("observations", row, "different-anchor")).toThrow();
    expect(() =>
      nativeReceiptMember("observations", { ...anchor(), canonical_hash: "self-hash" }, anchorId)
    ).toThrow();
    expect(() =>
      nativeReceiptMember("observations", { ...anchor(), fields: { unexpected: true } }, anchorId)
    ).toThrow();
    // The caller must independently verify actual receipt origin and operation binding.
  });

  it("sorts complete membership independently of input order and rejects duplicates or absent anchor", () => {
    const rows = [
      { table: "observations" as const, row: anchor() },
      { table: "entities" as const, row: entity() },
      { table: "relationship_observations" as const, row: relationship() },
    ];
    const before = structuredClone(rows);
    const result = nativeReceiptMembership(rows, anchorId);
    expect(nativeReceiptMembership([...rows].reverse(), anchorId)).toEqual(result);
    expect(result.members.map((member) => member.table)).toEqual([
      "entities",
      "observations",
      "relationship_observations",
    ]);
    expect(rows).toEqual(before);
    expect(() => nativeReceiptMembership([...rows, rows[0]], anchorId)).toThrow();
    expect(() => nativeReceiptMembership(rows.slice(1), anchorId)).toThrow();
    expect(nativeReceiptMembership(rows.slice(0, 2), anchorId).sha256).not.toBe(result.sha256);
    expect(
      nativeReceiptMembership([...rows, { table: "observations", row: observation() }], anchorId)
        .sha256
    ).not.toBe(result.sha256);
  });

  it("refuses nonfinite, undecoded, accessor and unclassified input without invoking getters", () => {
    for (const value of [NaN, Infinity, -Infinity])
      expect(() =>
        nativeReceiptMember(
          "observations",
          { ...observation(), specificity_score: value },
          anchorId
        )
      ).toThrow();
    expect(() =>
      nativeReceiptMember(
        "observations",
        { ...observation(), fields: '{"status":"open"}' },
        anchorId
      )
    ).toThrow();
    expect(() =>
      nativeReceiptMember("observations", { ...observation(), fields: null }, anchorId)
    ).toThrow();
    expect(() =>
      nativeReceiptMember("observations", { ...observation(), extra: null }, anchorId)
    ).toThrow();
    let getterCalls = 0;
    const row = observation();
    Object.defineProperty(row, "fields", {
      enumerable: true,
      get: () => {
        getterCalls++;
        return {};
      },
    });
    expect(() => nativeReceiptMember("observations", row, anchorId)).toThrow();
    expect(getterCalls).toBe(0);
    expect(() =>
      nativeReceiptMember("unknown" as NativeReceiptTable, observation(), anchorId)
    ).toThrow();
  });

  it("retains existing number encoding and exact outer schema hash arithmetic", () => {
    const minusZero = { ...observation(), fields: { value: -0 } };
    expect(nativeReceiptMember("observations", minusZero, anchorId)).toEqual(
      nativeReceiptMember("observations", { ...minusZero, fields: { value: 0 } }, anchorId)
    );
    for (const value of [0.76, 1e-7, 1e-6, 1e20, 1e21])
      expect(
        nativeReceiptMember("observations", { ...observation(), fields: { value } }, anchorId)
          .payload_sha256
      ).toMatch(/^[a-f0-9]{64}$/);
    expect(nativeSchemaReducerHash(vectors.registry_group_sha256)).toBe(
      vectors.schema_reducer_sha256
    );
    expect(nativeSchemaReducerHash("2".repeat(64))).not.toBe(vectors.schema_reducer_sha256);
    for (const value of ["", "0".repeat(63), "Z".repeat(64), null])
      expect(() => nativeSchemaReducerHash(value as string)).toThrow();
  });
});
