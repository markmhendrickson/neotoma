/**
 * Unit tests for the override_validation service.
 *
 * Tests cover the two pure functions (`checkFieldAllowed` and
 * `parseOverridePolicy`) exhaustively without hitting the database. The async
 * `enforceOverridePolicy` function is integration-tested separately as it
 * requires a live DB context.
 */

import { describe, it, expect } from "vitest";
import {
  checkFieldAllowed,
  parseOverridePolicy,
  OverridePolicyViolationError,
  type FieldPolicy,
} from "../override_validation.js";

// ---------------------------------------------------------------------------
// checkFieldAllowed
// ---------------------------------------------------------------------------

describe("checkFieldAllowed", () => {
  const operatorOnlyPolicy: FieldPolicy = {
    allowed_roles: ["operator"],
    deny_message: "Only operators may change this field",
  };

  const multiRolePolicy: FieldPolicy = {
    allowed_roles: ["operator", "service"],
  };

  const tieredPolicy: FieldPolicy = {
    allowed_roles: ["operator", "service"],
    min_tier: "software",
  };

  it("allows when agent role is in allowed_roles", () => {
    const result = checkFieldAllowed("agent_grant", operatorOnlyPolicy, "operator");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("denies when agent role is NOT in allowed_roles", () => {
    const result = checkFieldAllowed("agent_grant", operatorOnlyPolicy, "service");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("operator");
  });

  it("uses deny_message when provided on denial", () => {
    const result = checkFieldAllowed("agent_grant", operatorOnlyPolicy, "service");
    expect(result.reason).toBe("Only operators may change this field");
  });

  it("allows any role listed in a multi-role policy", () => {
    const resultOp = checkFieldAllowed("prompt_markdown", multiRolePolicy, "operator");
    const resultSvc = checkFieldAllowed("prompt_markdown", multiRolePolicy, "service");
    expect(resultOp.allowed).toBe(true);
    expect(resultSvc.allowed).toBe(true);
  });

  it("denies an unlisted role from a multi-role policy", () => {
    const result = checkFieldAllowed("prompt_markdown", multiRolePolicy, "guest");
    expect(result.allowed).toBe(false);
  });

  it("denies when tier is below min_tier even if role matches", () => {
    const result = checkFieldAllowed(
      "prompt_markdown",
      tieredPolicy,
      "service",
      "unverified_client"
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("unverified_client");
    expect(result.reason).toContain("software");
  });

  it("allows when role matches and tier meets min_tier", () => {
    const result = checkFieldAllowed("prompt_markdown", tieredPolicy, "service", "software");
    expect(result.allowed).toBe(true);
  });

  it("allows when min_tier is specified but no agentTier is provided (unknown tier is not blocked)", () => {
    // When tier is unknown we can't verify the constraint — fail-open per spec.
    const result = checkFieldAllowed("prompt_markdown", tieredPolicy, "service", undefined);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseOverridePolicy
// ---------------------------------------------------------------------------

describe("parseOverridePolicy", () => {
  it("parses a valid full policy", () => {
    const json = JSON.stringify({
      field_policies: {
        agent_grant: { allowed_roles: ["operator"], deny_message: "Operators only" },
        prompt_markdown: { allowed_roles: ["operator", "service"] },
      },
      default_policy: "allow",
    });
    const policy = parseOverridePolicy(json);
    expect(policy).not.toBeNull();
    expect(policy!.field_policies["agent_grant"].allowed_roles).toEqual(["operator"]);
    expect(policy!.field_policies["agent_grant"].deny_message).toBe("Operators only");
    expect(policy!.field_policies["prompt_markdown"].allowed_roles).toEqual([
      "operator",
      "service",
    ]);
    expect(policy!.default_policy).toBe("allow");
  });

  it("parses policy with default_policy omitted (defaults to allow)", () => {
    const json = JSON.stringify({
      field_policies: {
        name: { allowed_roles: ["operator"] },
      },
    });
    const policy = parseOverridePolicy(json);
    expect(policy).not.toBeNull();
    expect(policy!.default_policy).toBeUndefined();
  });

  it("parses policy with default_policy deny", () => {
    const json = JSON.stringify({
      field_policies: {
        name: { allowed_roles: ["operator"] },
      },
      default_policy: "deny",
    });
    const policy = parseOverridePolicy(json);
    expect(policy!.default_policy).toBe("deny");
  });

  it("returns null for invalid JSON (fail-open)", () => {
    expect(parseOverridePolicy("{not valid json")).toBeNull();
  });

  it("returns null for JSON that is not an object", () => {
    expect(parseOverridePolicy('"just a string"')).toBeNull();
    expect(parseOverridePolicy("[1, 2, 3]")).toBeNull();
  });

  it("returns null when field_policies is missing", () => {
    expect(parseOverridePolicy('{"default_policy":"allow"}')).toBeNull();
  });

  it("silently skips malformed field entries while keeping valid ones", () => {
    const json = JSON.stringify({
      field_policies: {
        good_field: { allowed_roles: ["operator"] },
        bad_field: "not an object",
        no_roles: { allowed_roles: "not an array" },
      },
    });
    const policy = parseOverridePolicy(json);
    expect(policy).not.toBeNull();
    expect(Object.keys(policy!.field_policies)).toEqual(["good_field"]);
  });

  it("parses min_tier from a field policy", () => {
    const json = JSON.stringify({
      field_policies: {
        secure_field: { allowed_roles: ["operator"], min_tier: "hardware" },
      },
    });
    const policy = parseOverridePolicy(json);
    expect(policy!.field_policies["secure_field"].min_tier).toBe("hardware");
  });
});

// ---------------------------------------------------------------------------
// OverridePolicyViolationError shape
// ---------------------------------------------------------------------------

describe("OverridePolicyViolationError", () => {
  it("carries structured fields and toErrorEnvelope()", () => {
    const err = new OverridePolicyViolationError({
      fieldName: "agent_grant",
      agentRole: "service",
      entityId: "entity-abc",
      reason: "Only operators may change agent grants",
    });
    expect(err.code).toBe("OVERRIDE_POLICY_VIOLATION");
    expect(err.statusCode).toBe(403);
    expect(err.fieldName).toBe("agent_grant");
    expect(err.agentRole).toBe("service");
    expect(err.entityId).toBe("entity-abc");
    const envelope = err.toErrorEnvelope();
    expect(envelope.code).toBe("OVERRIDE_POLICY_VIOLATION");
    expect(envelope.field_name).toBe("agent_grant");
    expect(envelope.agent_role).toBe("service");
    expect(envelope.entity_id).toBe("entity-abc");
  });
});
