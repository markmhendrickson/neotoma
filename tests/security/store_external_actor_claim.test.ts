/**
 * `external_actor` supplied in a `POST /store` body is recorded as an
 * unverified claim.
 *
 * A request body can assert who authored an upstream artifact but carries no
 * proof of it. The stronger `verified_via` tiers are assigned only by
 * server-side verification paths (the signed GitHub webhook route, AAuth token
 * claims, grant linkage), so whatever tier a caller names in the body, the
 * observation's provenance must record `claim`.
 */

import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";

const PORT = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ENTITY_TYPE = "store_ext_actor_claim_test";

const storedEntityIds: string[] = [];

async function storeWithActor(verifiedVia: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idempotency_key: `store-ext-actor-claim-${randomUUID()}`,
      entities: [{ entity_type: ENTITY_TYPE, title: `actor ${verifiedVia} ${randomUUID()}` }],
      external_actor: {
        provider: "github",
        login: "octocat",
        id: 583231,
        type: "User",
        verified_via: verifiedVia,
        delivery_id: "caller-supplied-delivery",
        repository: "owner/repo",
        event_id: 7,
      },
    }),
  });
  const json = (await res.json()) as any;
  expect(res.status).toBe(200);
  const entityId = (json.structured?.entities ?? json.entities)?.[0]?.entity_id as
    | string
    | undefined;
  expect(entityId).toBeTruthy();
  storedEntityIds.push(entityId!);

  const { data: observations } = await db
    .from("observations")
    .select("provenance")
    .eq("entity_id", entityId!);
  expect(observations?.length).toBeGreaterThan(0);
  const raw = observations![0].provenance;
  const provenance = typeof raw === "string" ? JSON.parse(raw) : raw;
  return provenance.external_actor as Record<string, unknown>;
}

describe("POST /store external_actor is recorded as a claim", () => {
  afterAll(async () => {
    if (storedEntityIds.length === 0) return;
    await db.from("observations").delete().in("entity_id", storedEntityIds);
    await db.from("entity_snapshots").delete().in("entity_id", storedEntityIds);
    await db.from("entities").delete().in("id", storedEntityIds);
  });

  it("keeps a caller-supplied claim as claim", async () => {
    const actor = await storeWithActor("claim");
    expect(actor.login).toBe("octocat");
    expect(actor.verified_via).toBe("claim");
  });

  for (const tier of ["webhook_signature", "oauth_link", "linked_attestation"]) {
    it(`downgrades a caller-supplied verified_via "${tier}" to claim`, async () => {
      const actor = await storeWithActor(tier);
      expect(actor.login).toBe("octocat");
      expect(actor.id).toBe(583231);
      expect(actor.repository).toBe("owner/repo");
      expect(actor.verified_via).toBe("claim");
      expect(actor.delivery_id).toBeUndefined();
    });
  }
});
