/**
 * Confirms the new fail-closed ownership guard (EntityOwnerConflictError) is
 * a no-op under tenant-scoped ids / sandbox mode: with a tenant salt, two
 * users' same-canonical-name entities hash to DIFFERENT entity_ids (see
 * entityIdTenantSalt in entity_resolution.ts), so the collision the guard
 * exists to catch cannot occur there in the first place. This is a
 * regression guard against the fix accidentally coupling ownership
 * enforcement to id-collision detection in a way that would misfire once
 * ids stop colliding.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveEntityWithTrace } from "../../src/services/entity_resolution.js";

describe("tenant-scoped ids / sandbox mode: cross-owner guard is unaffected", () => {
  let prevTenantScoped: string | undefined;
  let prevSandbox: string | undefined;

  beforeEach(() => {
    prevTenantScoped = process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
    prevSandbox = process.env.NEOTOMA_SANDBOX_MODE;
  });

  afterEach(() => {
    if (prevTenantScoped === undefined) delete process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
    else process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = prevTenantScoped;
    if (prevSandbox === undefined) delete process.env.NEOTOMA_SANDBOX_MODE;
    else process.env.NEOTOMA_SANDBOX_MODE = prevSandbox;
  });

  it("NEOTOMA_TENANT_SCOPED_ENTITY_IDS=1: two users, same canonical_name, both succeed with distinct ids", async () => {
    process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS = "1";
    delete process.env.NEOTOMA_SANDBOX_MODE;

    const stamp = `${Date.now()}-${Math.floor(performance.now() * 1000)}`;
    const name = `Tenant Scoped Shared Name ${stamp}`;
    const userA = `tenant-scoped-a-${stamp}`;
    const userB = `tenant-scoped-b-${stamp}`;

    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userA,
      commit: true,
    });
    const b = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: userB,
      commit: true,
    });

    expect(a.entityId).not.toBe(b.entityId);
    expect(a.trace.action).toBe("created");
    expect(b.trace.action).toBe("created");
  });

  it("NEOTOMA_SANDBOX_MODE=1: two visitors, same canonical_name, both succeed with distinct ids", async () => {
    delete process.env.NEOTOMA_TENANT_SCOPED_ENTITY_IDS;
    process.env.NEOTOMA_SANDBOX_MODE = "1";

    const stamp = `${Date.now()}-${Math.floor(performance.now() * 1000)}`;
    const name = `Sandbox Shared Name ${stamp}`;
    const visitorA = `sandbox-visitor-a-${stamp}`;
    const visitorB = `sandbox-visitor-b-${stamp}`;

    const a = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: visitorA,
      commit: true,
    });
    const b = await resolveEntityWithTrace({
      entityType: "contact",
      fields: { name },
      userId: visitorB,
      commit: true,
    });

    expect(a.entityId).not.toBe(b.entityId);
    expect(a.trace.action).toBe("created");
    expect(b.trace.action).toBe("created");
  });
});
