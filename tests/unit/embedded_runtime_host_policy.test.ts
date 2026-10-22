import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import {
  EmbeddedRuntimeContext,
  type EmbeddedRuntimeContextOptions,
} from "../../src/core/runtime_context.js";
import { createEmbeddedRuntimeConfiguration } from "../../src/core/runtime_configuration.js";
import { entityIdTenantSalt } from "../../src/services/entity_resolution.js";
import {
  enforceAttributionPolicy,
  getAttributionPolicySnapshot,
} from "../../src/services/attribution_policy.js";
import type { DbDatabase } from "../../src/repositories/db/driver.js";

function base() {
  return {
    database: { exec: vi.fn() } as unknown as DbDatabase,
    configuration: createEmbeddedRuntimeConfiguration({
      dataDirectory: join(process.cwd(), ".vitest", "host-policy"),
      packageRoot: process.cwd(),
    }),
    adapters: {},
  };
}

describe("explicit existing host-policy binding", () => {
  it("refuses missing and unknown policy bindings without touching the database", () => {
    const options = base();
    const construct = (policies: Record<string, unknown>) => () =>
      new EmbeddedRuntimeContext({ ...options, ...policies } as EmbeddedRuntimeContextOptions);
    expect(construct({})).toThrow("EXPLICIT_RUNTIME_IDENTITY_POLICY_REQUIRED");
    for (const legacyIdentityPolicy of [
      null,
      {},
      { tenantScopedEntityIds: "false" },
      { tenantScopedEntityIds: false, typo: true },
    ])
      expect(construct({ legacyIdentityPolicy })).toThrow(
        "EXPLICIT_RUNTIME_IDENTITY_POLICY_INVALID"
      );
    const legacyIdentityPolicy = { tenantScopedEntityIds: false };
    expect(construct({ legacyIdentityPolicy })).toThrow(
      "EXPLICIT_RUNTIME_ATTRIBUTION_POLICY_REQUIRED"
    );
    for (const attributionPolicy of [
      null,
      {},
      { anonymous_writes: "unknown" },
      { anonymous_writes: "allow", min_tier: "unknown" },
      { anonymous_writes: "allow", per_path: { unknown: "allow" } },
      { anonymous_writes: "allow", per_path: { sources: "unknown" } },
    ])
      expect(construct({ legacyIdentityPolicy, attributionPolicy })).toThrow(
        "EXPLICIT_RUNTIME_ATTRIBUTION_POLICY_INVALID"
      );
    expect(options.database.exec).not.toHaveBeenCalled();
  });

  it("uses immutable explicit salt and attribution choices rather than conflicting inherited settings", async () => {
    const previous = { ...process.env };
    process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = "1";
    process.env.NEOTOMA_ATTRIBUTION_POLICY = "warn";
    process.env.NEOTOMA_MIN_ATTRIBUTION_TIER = "hardware";
    const identity = { tenantScopedEntityIds: false };
    const policy = {
      anonymous_writes: "allow" as const,
      per_path: { corrections: "reject" as const },
    };
    const a = new EmbeddedRuntimeContext({
      ...base(),
      legacyIdentityPolicy: identity,
      attributionPolicy: policy,
    });
    const b = new EmbeddedRuntimeContext({
      ...base(),
      legacyIdentityPolicy: { tenantScopedEntityIds: true },
      attributionPolicy: { anonymous_writes: "reject" },
    });
    expect(Reflect.set(a, "legacyIdentityPolicy", { tenantScopedEntityIds: true })).toBe(false);
    expect(Reflect.set(a, "attributionPolicy", { anonymous_writes: "reject" })).toBe(false);
    identity.tenantScopedEntityIds = true;
    Object.assign(policy.per_path, { corrections: "allow" });
    try {
      await Promise.all([
        a.run(async () => {
          await Promise.resolve();
          expect(entityIdTenantSalt("same-user")).toBeUndefined();
          expect(enforceAttributionPolicy("observations", null).action).toBe("allow");
          expect(() => enforceAttributionPolicy("corrections", null)).toThrow();
          const snapshot = getAttributionPolicySnapshot();
          snapshot.anonymous_writes = "reject";
          expect(getAttributionPolicySnapshot().anonymous_writes).toBe("allow");
        }),
        b.run(async () => {
          await Promise.resolve();
          expect(entityIdTenantSalt("same-user")).toBe("same-user");
          expect(() => enforceAttributionPolicy("observations", null)).toThrow();
        }),
      ]);
      expect(entityIdTenantSalt("same-user")).toBe("same-user");
      expect(getAttributionPolicySnapshot()).toMatchObject({
        anonymous_writes: "warn",
        min_tier: "hardware",
      });
    } finally {
      for (const key of [
        "NEOTOMA_TENANT_SCOPED_ENTITY_IDS",
        "NEOTOMA_ATTRIBUTION_POLICY",
        "NEOTOMA_MIN_ATTRIBUTION_TIER",
      ]) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      await a.dispose();
      await b.dispose();
    }
  });
});
