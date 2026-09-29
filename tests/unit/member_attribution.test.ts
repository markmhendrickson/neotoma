/**
 * #2240 — per-member write-attribution ids and their guest redaction.
 *
 * The id stamped into provenance must be random and per-instance (not a
 * function of the email), stable for one member, and fail closed for anything
 * that is not a known member. Guest responses must never carry it.
 */

import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createLocalAuthUser } from "../../src/services/local_auth.js";
import { getOrCreateMemberAttributionId } from "../../src/services/member_attribution.js";
import { redactMemberAttribution } from "../../src/services/attribution_redaction.js";
import { getDb } from "../../src/repositories/db/connection.js";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("getOrCreateMemberAttributionId", () => {
  it("mints one stable random id per member, distinct across members", async () => {
    const a = await createLocalAuthUser(`attr-a-${randomUUID()}@example.com`, randomUUID());
    const b = await createLocalAuthUser(`attr-b-${randomUUID()}@example.com`, randomUUID());
    const idA = await getOrCreateMemberAttributionId(a.id);
    const idA2 = await getOrCreateMemberAttributionId(a.id);
    const idB = await getOrCreateMemberAttributionId(b.id);
    expect(idA).toMatch(UUID_SHAPE);
    expect(idA2).toBe(idA);
    expect(idB).not.toBe(idA);
  });

  it("is not derived from the email: not the local id, not a hash of the email", async () => {
    const email = `attr-derive-${randomUUID()}@example.com`;
    const member = await createLocalAuthUser(email, randomUUID());
    const id = await getOrCreateMemberAttributionId(member.id);
    expect(id).not.toBe(member.id);
    const emailHash = createHash("sha256").update(email).digest("hex");
    expect(id!.replace(/-/g, "")).not.toBe(emailHash.slice(0, 32));

    // Minted, not computed: dropping the row and resolving again yields a new id.
    const db = await getDb();
    await db.prepare("DELETE FROM member_attribution_ids WHERE local_user_id = ?").run(member.id);
    const reminted = await getOrCreateMemberAttributionId(member.id);
    expect(reminted).toMatch(UUID_SHAPE);
    expect(reminted).not.toBe(id);
  });

  it("converges on one id under concurrent first resolution", async () => {
    const member = await createLocalAuthUser(`attr-race-${randomUUID()}@example.com`, randomUUID());
    const ids = await Promise.all(
      Array.from({ length: 8 }, () => getOrCreateMemberAttributionId(member.id))
    );
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(UUID_SHAPE);
  });

  it("fails closed for anything that is not a known member", async () => {
    expect(await getOrCreateMemberAttributionId(undefined)).toBeNull();
    expect(await getOrCreateMemberAttributionId(null)).toBeNull();
    expect(await getOrCreateMemberAttributionId("")).toBeNull();
    const unknown = randomUUID();
    expect(await getOrCreateMemberAttributionId(unknown)).toBeNull();
    const db = await getDb();
    const row = await db
      .prepare("SELECT attribution_id FROM member_attribution_ids WHERE local_user_id = ?")
      .get(unknown);
    expect(row, "no id is minted for an unknown member").toBeFalsy();
  });
});

describe("redactMemberAttribution (guest responses)", () => {
  it("removes the member id at any depth and keeps everything else", () => {
    const body = {
      observations: [
        {
          id: "obs-1",
          provenance: {
            authenticated_actor_id: "actor",
            attribution_tier: "unverified_client",
            client_name: "c",
          },
          fields: { title: "t" },
        },
      ],
      nested: { deeper: [{ authenticated_actor_id: "actor", keep: 1 }] },
      total: 1,
    };
    const out = redactMemberAttribution(body);
    expect(JSON.stringify(out)).not.toContain("authenticated_actor_id");
    expect(out.observations[0]!.provenance).toEqual({
      attribution_tier: "unverified_client",
      client_name: "c",
    });
    expect(out.observations[0]!.fields).toEqual({ title: "t" });
    expect(out.nested.deeper[0]).toEqual({ keep: 1 });
    expect(out.total).toBe(1);
    // The input is not mutated (members reading the same object keep it).
    expect(body.observations[0]!.provenance.authenticated_actor_id).toBe("actor");
  });

  it("redacts provenance stored as a JSON string", () => {
    const out = redactMemberAttribution({
      provenance: JSON.stringify({ authenticated_actor_id: "actor", client_name: "c" }),
    });
    expect(JSON.parse(out.provenance)).toEqual({ client_name: "c" });
  });

  it("passes primitives and null through", () => {
    expect(redactMemberAttribution(null)).toBeNull();
    expect(redactMemberAttribution("x")).toBe("x");
    expect(redactMemberAttribution(3)).toBe(3);
  });
});
