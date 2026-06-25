import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { entityIdTenantSalt, generateEntityId } from "../../src/services/entity_resolution.js";

const ID_RE = /^ent_[0-9a-f]{24}$/;

describe("generateEntityId tenant salting", () => {
  it("is unchanged (global) when no salt is given — prod backward-compat", () => {
    const a = generateEntityId("contact", "John Doe");
    const b = generateEntityId("contact", "John Doe", undefined);
    expect(a).toBe(b);
    expect(a).toMatch(ID_RE);
  });

  it("salted id differs from the global id but keeps the ent_ format", () => {
    const global = generateEntityId("contact", "John Doe");
    const salted = generateEntityId("contact", "John Doe", "user-1");
    expect(salted).not.toBe(global);
    expect(salted).toMatch(ID_RE);
  });

  it("different tenants get different ids for the same name; same tenant is stable", () => {
    const u1 = generateEntityId("contact", "John Doe", "user-1");
    const u2 = generateEntityId("contact", "John Doe", "user-2");
    expect(u1).not.toBe(u2);
    expect(generateEntityId("contact", "John Doe", "user-1")).toBe(u1);
  });
});

describe("entityIdTenantSalt gate", () => {
  const KEYS = ["NEOTOMA_SANDBOX_MODE", "NEOTOMA_TENANT_SCOPED_ENTITY_IDS"] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns undefined (global ids) by default — prod single-tenant", () => {
    expect(entityIdTenantSalt("user-1")).toBeUndefined();
  });

  it("returns the userId in sandbox mode", () => {
    process.env.NEOTOMA_SANDBOX_MODE = "1";
    expect(entityIdTenantSalt("user-1")).toBe("user-1");
  });

  it("returns the userId under the explicit override flag", () => {
    process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = "1";
    expect(entityIdTenantSalt("user-1")).toBe("user-1");
  });

  it("returns undefined when there is no userId, even if enabled", () => {
    process.env.NEOTOMA_SANDBOX_MODE = "1";
    expect(entityIdTenantSalt(undefined)).toBeUndefined();
    expect(entityIdTenantSalt(null)).toBeUndefined();
    expect(entityIdTenantSalt("")).toBeUndefined();
  });
});
