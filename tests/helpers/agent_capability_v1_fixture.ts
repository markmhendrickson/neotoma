/**
 * A complete, contract-conformant `agent_capability_v1` grant, shared by the
 * tests that need one.
 *
 * "Conformant" is the point: the ENABLE GATE test seeds this past every write
 * guard and asserts it confers no authority. If the seed were invalid for some
 * unrelated reason (a missing pin, a missing validity window), a future
 * validator that accepts v1 and enforces those requirements would reject it for
 * the wrong reason and the test would stay green while a genuinely complete
 * planted grant would be live. The contract-shapes test validates this fixture
 * against the declared schema and the grant-level rules, so it cannot drift
 * out of conformance silently.
 */

export const V1_FIXTURE_SUB = "agent@example.com";
export const V1_FIXTURE_ISS = "https://agent.example.com";
export const V1_FIXTURE_VALID_FROM = "2030-01-01T00:00:00Z";
export const V1_FIXTURE_VALID_UNTIL = "2031-01-01T00:00:00Z";

export function v1CapabilityFor(ownerUserId: string): Record<string, unknown> {
  return {
    op: "agent_capability_v1",
    capability_id: "cap-1",
    purpose: { name: "example_purpose", version: "1" },
    delegation_chain: [],
    param_constraints: {
      contract_version: 1,
      operation_ids: ["store"],
      owner: { user_id: ownerUserId },
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

/**
 * Every grant-level key the contract requires of a grant that carries a v1
 * capability: the three identity pins and the validity window, all non-null,
 * canonical, and `valid_until` later than `valid_from`.
 */
export function conformantV1GrantFields(
  ownerUserId: string,
  thumbprint: string
): Record<string, unknown> {
  return {
    label: "v1-conformant-fixture",
    status: "active",
    capabilities: [v1CapabilityFor(ownerUserId)],
    match_thumbprint: thumbprint,
    match_sub: V1_FIXTURE_SUB,
    match_iss: V1_FIXTURE_ISS,
    valid_from: V1_FIXTURE_VALID_FROM,
    valid_until: V1_FIXTURE_VALID_UNTIL,
  };
}
