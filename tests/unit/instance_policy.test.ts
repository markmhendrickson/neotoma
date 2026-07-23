/**
 * Instance data-policy tests (#1974 advisory + #1975 enforcement).
 *
 * The evaluator and the instructions renderer are pure given an explicit
 * policy, so these exercise real behavior rather than mocking the DB: every
 * test passes its policy through `policyOverride`, which is the same code path
 * production takes once `getInstancePolicy()` has resolved.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateStorePolicy,
  assertStorePolicyAllows,
  renderInstancePolicyInstructions,
  StorePolicyDeniedError,
  type InstancePolicy,
  type SchemaResolver,
} from "../../src/services/instance_policy.js";
import type { SchemaDefinition } from "../../src/services/schema_registry.js";

/** A resolver returning no schema — the unregistered-type case. */
const noSchema: SchemaResolver = async () => null;

/** Build a resolver over a fixed map of schemas. */
function resolverFor(map: Record<string, SchemaDefinition>): SchemaResolver {
  return async (entityType: string) => map[entityType] ?? null;
}

const personSchema: SchemaDefinition = {
  fields: {
    name: { type: "string" },
    lawful_basis: { type: "string" },
    data_source: { type: "string" },
  },
  person_data: true,
};

const enforced = (extra: Partial<InstancePolicy>): InstancePolicy => ({
  enforcement: "enforced",
  policy_id: "pol_test",
  ...extra,
});

describe("instance policy — enforcement posture", () => {
  it("does not deny anything when no policy is configured", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "payment_profile", fields: {} }],
      noSchema,
      null
    );
    expect(denied).toEqual([]);
  });

  it("does not deny when the policy is advisory, even if the write violates it", async () => {
    // This is the #1974-only posture: the policy is declared to agents but not
    // enforced. Adding a policy record must not retroactively start rejecting
    // writes that previously succeeded.
    const denied = await evaluateStorePolicy(
      [{ entity_type: "payment_profile", fields: {} }],
      noSchema,
      { enforcement: "advisory", out_of_scope_entity_types: ["payment_profile"] }
    );
    expect(denied).toEqual([]);
  });
});

describe("instance policy — entity-type predicates", () => {
  it("denies a deny-listed type with an actionable hint", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "payment_profile", fields: { iban: "x" } }],
      noSchema,
      enforced({ out_of_scope_entity_types: ["payment_profile"] })
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].reason_code).toBe("entity_type_denied");
    expect(denied[0].entity_index).toBe(0);
    expect(denied[0].policy_id).toBe("pol_test");
    // The hint must name the next tool call, not merely restate the reason.
    expect(denied[0].hint).toContain("describe_instance_policy");
  });

  it("allows a type absent from the deny-list", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "contact", fields: {} }],
      noSchema,
      enforced({ out_of_scope_entity_types: ["payment_profile"] })
    );
    expect(denied).toEqual([]);
  });

  it("denies a type absent from a non-empty allow-list", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "workout_session", fields: {} }],
      noSchema,
      enforced({ in_scope_entity_types: ["contact", "organization"] })
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].reason_code).toBe("entity_type_denied");
  });

  it("allows a type present in the allow-list", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "contact", fields: {} }],
      noSchema,
      enforced({ in_scope_entity_types: ["contact", "organization"] })
    );
    expect(denied).toEqual([]);
  });

  it("treats an EMPTY allow-list as 'no allow-list', not 'deny everything'", async () => {
    // An operator who saves a policy without filling in the allow-list must not
    // silently brick every write on the instance.
    const denied = await evaluateStorePolicy(
      [{ entity_type: "contact", fields: {} }],
      noSchema,
      enforced({ in_scope_entity_types: [] })
    );
    expect(denied).toEqual([]);
  });

  it("lets the deny-list win when a type appears in both lists", async () => {
    // A mistaken overlap must fail closed.
    const denied = await evaluateStorePolicy(
      [{ entity_type: "contact", fields: {} }],
      noSchema,
      enforced({
        in_scope_entity_types: ["contact"],
        out_of_scope_entity_types: ["contact"],
      })
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].reason_code).toBe("entity_type_denied");
  });

  it("does not deny an unlisted type when neither list is configured", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "anything_at_all", fields: {} }],
      noSchema,
      enforced({})
    );
    expect(denied).toEqual([]);
  });
});

describe("instance policy — person-data gates", () => {
  const resolver = resolverFor({ contact: personSchema });

  it("denies a person-data entity missing its lawful-basis field", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "contact", fields: { name: "n" } }],
      resolver,
      enforced({ require_lawful_basis: true })
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].reason_code).toBe("pii_gate_missing_basis");
    // Hint names the schema-declared FIELD NAME.
    expect(denied[0].hint).toContain("lawful_basis");
  });

  it("treats a blank lawful-basis value as missing, not as satisfied", async () => {
    // Guards the common falsy-value bug: "" must not pass the gate.
    for (const blank of ["", "   ", null, undefined]) {
      const denied = await evaluateStorePolicy(
        [{ entity_type: "contact", fields: { name: "n", lawful_basis: blank } }],
        resolver,
        enforced({ require_lawful_basis: true })
      );
      expect(denied, `blank value ${JSON.stringify(blank)} should fail closed`).toHaveLength(1);
      expect(denied[0].reason_code).toBe("pii_gate_missing_basis");
    }
  });

  it("allows a person-data entity that carries a lawful basis", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "contact", fields: { name: "n", lawful_basis: "legitimate_interest" } }],
      resolver,
      enforced({ require_lawful_basis: true })
    );
    expect(denied).toEqual([]);
  });

  it("never applies person-data gates to a type not declaring person_data", async () => {
    // Regression guard against an over-broad predicate.
    const denied = await evaluateStorePolicy(
      [{ entity_type: "invoice", fields: {} }],
      resolverFor({ invoice: { fields: { total: { type: "number" } } } }),
      enforced({ require_lawful_basis: true, require_provenance: true })
    );
    expect(denied).toEqual([]);
  });

  it("denies a person-data entity missing provenance when required", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "contact", fields: { name: "n" } }],
      resolver,
      enforced({ require_provenance: true })
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].reason_code).toBe("provenance_required");
    expect(denied[0].hint).toContain("data_source");
  });

  it("honors schema-declared custom field names for the gates", async () => {
    const custom: SchemaDefinition = {
      fields: { name: { type: "string" } },
      person_data: true,
      lawful_basis_field: "gdpr_basis",
      provenance_field: "consent_ref",
    };
    const denied = await evaluateStorePolicy(
      [{ entity_type: "person", fields: { name: "n" } }],
      resolverFor({ person: custom }),
      enforced({ require_lawful_basis: true })
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].hint).toContain("gdpr_basis");
  });

  it("does not fire person-data gates for an unregistered type", async () => {
    // Gates are defined in terms of schema declarations; an unclassified type
    // has made no claim to gate on.
    const denied = await evaluateStorePolicy(
      [{ entity_type: "unregistered", fields: {} }],
      noSchema,
      enforced({ require_lawful_basis: true, require_provenance: true })
    );
    expect(denied).toEqual([]);
  });
});

describe("instance policy — field sensitivity threshold", () => {
  const sensitiveSchema: SchemaDefinition = {
    fields: {
      title: { type: "string", sensitivity_class: "public" },
      notes: { type: "string", sensitivity_class: "sensitive" },
      diagnosis: { type: "string", sensitivity_class: "restricted" },
    },
  };
  const resolver = resolverFor({ record: sensitiveSchema });

  it("denies a field classified above the configured maximum", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "record", fields: { diagnosis: "x" } }],
      resolver,
      enforced({ max_sensitivity_class: "internal" })
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].reason_code).toBe("field_sensitivity_exceeded");
    expect(denied[0].hint).toContain("diagnosis");
    expect(denied[0].hint).toContain("restricted");
  });

  it("allows a field at exactly the configured maximum", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "record", fields: { notes: "x" } }],
      resolver,
      enforced({ max_sensitivity_class: "sensitive" })
    );
    expect(denied).toEqual([]);
  });

  it("ignores undeclared fields — an unclassified field never trips the gate", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "record", fields: { undeclared_field: "x" } }],
      resolver,
      enforced({ max_sensitivity_class: "public" })
    );
    expect(denied).toEqual([]);
  });

  it("ignores a blank value in a sensitive field", async () => {
    const denied = await evaluateStorePolicy(
      [{ entity_type: "record", fields: { diagnosis: "" } }],
      resolver,
      enforced({ max_sensitivity_class: "public" })
    );
    expect(denied).toEqual([]);
  });

  it("reports the same field first regardless of key order (determinism)", async () => {
    const a = await evaluateStorePolicy(
      [{ entity_type: "record", fields: { diagnosis: "x", notes: "y" } }],
      resolver,
      enforced({ max_sensitivity_class: "public" })
    );
    const b = await evaluateStorePolicy(
      [{ entity_type: "record", fields: { notes: "y", diagnosis: "x" } }],
      resolver,
      enforced({ max_sensitivity_class: "public" })
    );
    expect(a[0].hint).toBe(b[0].hint);
  });
});

describe("instance policy — batch semantics", () => {
  it("enumerates EVERY violating entity, not just the first", async () => {
    // A caller must discover all violations in one round trip rather than
    // resubmitting repeatedly.
    const denied = await evaluateStorePolicy(
      [
        { entity_type: "payment_profile", fields: {} },
        { entity_type: "contact", fields: {} },
        { entity_type: "workout_session", fields: {} },
      ],
      noSchema,
      enforced({ out_of_scope_entity_types: ["payment_profile", "workout_session"] })
    );
    expect(denied).toHaveLength(2);
    expect(denied.map((d) => d.entity_index)).toEqual([0, 2]);
  });

  it("reports entity_index against the original request array", async () => {
    const denied = await evaluateStorePolicy(
      [
        { entity_type: "contact", fields: {} },
        { entity_type: "payment_profile", fields: {} },
      ],
      noSchema,
      enforced({ out_of_scope_entity_types: ["payment_profile"] })
    );
    expect(denied).toHaveLength(1);
    expect(denied[0].entity_index).toBe(1);
  });

  it("throws StorePolicyDeniedError carrying every denial", async () => {
    await expect(
      assertStorePolicyAllows(
        [
          { entity_type: "payment_profile", fields: {} },
          { entity_type: "workout_session", fields: {} },
        ],
        noSchema,
        enforced({ out_of_scope_entity_types: ["payment_profile", "workout_session"] })
      )
    ).rejects.toThrow(StorePolicyDeniedError);

    try {
      await assertStorePolicyAllows(
        [{ entity_type: "payment_profile", fields: {} }],
        noSchema,
        enforced({ out_of_scope_entity_types: ["payment_profile"] })
      );
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as StorePolicyDeniedError;
      expect(e.code).toBe("ERR_STORE_POLICY_DENIED");
      expect(e.denied).toHaveLength(1);
      // Whole-request reject: the message states nothing was persisted.
      expect(e.message).toContain("0 persisted");
    }
  });

  it("does not throw for a clean batch", async () => {
    await expect(
      assertStorePolicyAllows(
        [{ entity_type: "contact", fields: {} }],
        noSchema,
        enforced({ out_of_scope_entity_types: ["payment_profile"] })
      )
    ).resolves.toBeUndefined();
  });
});

describe("instance policy — no PII in the denial envelope", () => {
  it("never echoes a submitted field value into a hint", async () => {
    // The denied payload is exactly the data the policy refused to hold, so it
    // must not come back out through the error surface (guardrails MUST NOT 11).
    const secret = "SENSITIVE-VALUE-b7f3e9";
    const resolver = resolverFor({
      record: { fields: { diagnosis: { type: "string", sensitivity_class: "restricted" } } },
      contact: personSchema,
    });

    const denied = await evaluateStorePolicy(
      [
        { entity_type: "record", fields: { diagnosis: secret } },
        { entity_type: "contact", fields: { name: secret } },
      ],
      resolver,
      enforced({ max_sensitivity_class: "public", require_lawful_basis: true })
    );

    expect(denied.length).toBeGreaterThan(0);
    for (const d of denied) {
      expect(JSON.stringify(d)).not.toContain(secret);
    }
  });
});

describe("instance policy — advisory instruction rendering (#1974)", () => {
  it("renders an empty string when no policy is configured", () => {
    // An instance with no policy must serve byte-identical instructions.
    expect(renderInstancePolicyInstructions(null)).toBe("");
  });

  it("renders purpose, scope lists, and gates under a delimited heading", () => {
    const section = renderInstancePolicyInstructions({
      purpose: "Team CRM records only.",
      in_scope_entity_types: ["contact", "organization"],
      out_of_scope_entity_types: ["payment_profile"],
      require_lawful_basis: true,
      max_sensitivity_class: "internal",
      sensitivity_rules: ["No health data."],
      enforcement: "enforced",
    });

    expect(section).toContain("## Instance Data Policy");
    expect(section).toContain("Team CRM records only.");
    expect(section).toContain("contact, organization");
    expect(section).toContain("payment_profile");
    expect(section).toContain("lawful-basis");
    expect(section).toContain("internal");
    expect(section).toContain("No health data.");
    expect(section).toContain("describe_instance_policy");
  });

  it("states the posture honestly so agents calibrate their own checking", () => {
    const enforcedText = renderInstancePolicyInstructions({
      purpose: "p",
      enforcement: "enforced",
    });
    expect(enforcedText).toContain("ENFORCED");
    expect(enforcedText).toContain("ERR_STORE_POLICY_DENIED");

    const advisoryText = renderInstancePolicyInstructions({
      purpose: "p",
      enforcement: "advisory",
    });
    expect(advisoryText).toContain("ADVISORY");
    expect(advisoryText).not.toContain("ERR_STORE_POLICY_DENIED");
  });
});
