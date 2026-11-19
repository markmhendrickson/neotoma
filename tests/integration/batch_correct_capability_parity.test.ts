/**
 * Capability parity across correction entry points: `POST /entities/:id/batch_correct`
 * must apply the same `correct` capability scope as `POST /correct`,
 * `POST /patch_array_item`, the MCP `correct` tool and the atomic correction
 * transaction.
 *
 * Each case drives the real Express app over HTTP against the local test
 * database. Agent admission is injected by mocking the AAuth signature verifier
 * and the grant lookup (the pattern in
 * relationship_write_capability_surfaces.test.ts), so the request still runs
 * the real middleware chain, identity threading, route and service. Every
 * assertion is on the EFFECT: a refused request leaves the entity's
 * observations and snapshot untouched.
 */

import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const GRANT_HEADER = "x-test-batch-correct-grant";
const THUMBPRINT_PREFIX = "tp-batch-correct-parity-";

vi.mock("../../src/middleware/aauth_verify.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/middleware/aauth_verify.js")>();
  return {
    ...original,
    aauthVerify: () => (req: Request, _res: Response, next: NextFunction) => {
      const grant = req.headers[GRANT_HEADER];
      if (typeof grant === "string") {
        (req as Request & { aauth?: unknown }).aauth = {
          verified: true,
          publicKey: '{"kty":"EC"}',
          thumbprint: `${THUMBPRINT_PREFIX}${grant}`,
          algorithm: "ES256",
          sub: "editor@swarm.test",
          iss: "https://swarm.test",
        };
      }
      next();
    },
  };
});

vi.mock("../../src/services/aauth_admission.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/services/aauth_admission.js")>();
  const { LOCAL_DEV_USER_ID: owner } = await import("../../src/services/local_auth.js");
  const grants: Record<string, Array<{ op: string; entity_types: string[] }>> = {
    // Can correct a different type only.
    "other-type": [
      { op: "store", entity_types: ["contact", "task"] },
      { op: "retrieve", entity_types: ["*"] },
      { op: "correct", entity_types: ["task"] },
    ],
    // Can store and read the type but holds no `correct` capability at all.
    "no-correct": [
      { op: "store", entity_types: ["contact"] },
      { op: "retrieve", entity_types: ["*"] },
    ],
    // Holds `correct` for the entity's own type.
    "in-scope": [
      { op: "store", entity_types: ["contact"] },
      { op: "retrieve", entity_types: ["*"] },
      { op: "correct", entity_types: ["contact"] },
    ],
  };
  return {
    ...original,
    admitFromAAuthContext: async (ctx: { verified?: boolean; thumbprint?: string } | null) => {
      if (!ctx?.verified) return { admitted: false, reason: "not_signed" };
      const key = (ctx.thumbprint ?? "").slice(THUMBPRINT_PREFIX.length);
      const capabilities = grants[key];
      if (!capabilities) return { admitted: false, reason: "no_match" };
      return {
        admitted: true,
        reason: "admitted",
        user_id: owner,
        grant_id: `ent_test_batch_correct_${key}`,
        agent_label: `batch correct parity ${key}`,
        capabilities,
      };
    },
  };
});

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { resolveEntityWithTrace } from "../../src/services/entity_resolution.js";

const USER_ID = LOCAL_DEV_USER_ID;

async function makeContact(name: string): Promise<string> {
  const result = await resolveEntityWithTrace({
    entityType: "contact",
    fields: { name },
    userId: USER_ID,
    commit: true,
  });
  return result.entityId;
}

async function observationCount(entityId: string): Promise<number> {
  const { data, error } = await db
    .from("observations")
    .select("id")
    .eq("entity_id", entityId)
    .eq("user_id", USER_ID);
  if (error) throw new Error(`count observations: ${error.message}`);
  return (data as unknown[] | null)?.length ?? 0;
}

describe("batch_correct applies the same correct-capability scope as the other correction entry points", () => {
  let httpServer: Server;
  let baseUrl: string;
  const createdEntityIds: string[] = [];

  async function newContact(): Promise<string> {
    const id = await makeContact(`Batch Capability ${randomUUID()}`);
    createdEntityIds.push(id);
    return id;
  }

  async function batchCorrect(
    entityId: string,
    changes: Array<{ field: string; value: unknown }>,
    grant?: string
  ) {
    const res = await fetch(`${baseUrl}/entities/${encodeURIComponent(entityId)}/batch_correct`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(grant ? { [GRANT_HEADER]: grant } : {}),
      },
      body: JSON.stringify({ changes, idempotency_prefix: `batch-cap-${randomUUID()}` }),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
    return { status: res.status, body };
  }

  async function correct(entityId: string, value: string, grant?: string) {
    const res = await fetch(`${baseUrl}/correct`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(grant ? { [GRANT_HEADER]: grant } : {}),
      },
      body: JSON.stringify({
        entity_id: entityId,
        entity_type: "contact",
        field: "name",
        value,
        idempotency_key: `correct-cap-${randomUUID()}`,
      }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (createdEntityIds.length > 0) {
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
    }
  });

  it("refuses an admitted agent whose grant scopes correct to a different entity type, and writes nothing", async () => {
    const entityId = await newContact();
    const before = await observationCount(entityId);

    const res = await batchCorrect(
      entityId,
      [{ field: "name", value: "Out Of Scope" }],
      "other-type"
    );

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("capability_denied");
    expect(await observationCount(entityId)).toBe(before);
  });

  it("refuses an admitted agent whose grant holds no correct capability, and writes nothing", async () => {
    const entityId = await newContact();
    const before = await observationCount(entityId);

    const res = await batchCorrect(
      entityId,
      [{ field: "name", value: "No Capability" }],
      "no-correct"
    );

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("capability_denied");
    expect(await observationCount(entityId)).toBe(before);
  });

  it("applies the same scope to an empty change set, so the entity snapshot is not returned", async () => {
    const entityId = await newContact();

    const res = await batchCorrect(entityId, [], "no-correct");

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("capability_denied");
    expect(res.body.snapshot).toBeUndefined();
  });

  it("answers the same way /correct does for the same grant and entity", async () => {
    const entityId = await newContact();

    const single = await correct(entityId, "Single Field", "other-type");
    const batch = await batchCorrect(
      entityId,
      [{ field: "name", value: "Batch Field" }],
      "other-type"
    );

    expect(single.status).toBe(403);
    expect(batch.status).toBe(single.status);
    expect(batch.body.error_code).toBe(single.body.error_code);
  });

  it("applies the batch for an admitted agent whose grant covers correct on the entity type", async () => {
    const entityId = await newContact();

    const res = await batchCorrect(
      entityId,
      [{ field: "name", value: "Allowed Rename" }],
      "in-scope"
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("applied");
    expect((res.body.snapshot as Record<string, unknown>).name).toBe("Allowed Rename");
  });

  it("is unchanged for an operator request that carries no agent identity", async () => {
    const entityId = await newContact();

    const res = await batchCorrect(entityId, [{ field: "name", value: "Operator Rename" }]);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("applied");
    expect((res.body.snapshot as Record<string, unknown>).name).toBe("Operator Rename");
  });

  it("refuses an unadmitted signed agent on a governance entity type with 403, and writes nothing", async () => {
    const seeded = await resolveEntityWithTrace({
      entityType: "agent_grant",
      fields: { label: `Batch Capability Grant ${randomUUID()}` },
      userId: USER_ID,
      commit: true,
    });
    createdEntityIds.push(seeded.entityId);
    const before = await observationCount(seeded.entityId);

    const res = await batchCorrect(
      seeded.entityId,
      [{ field: "label", value: "Renamed" }],
      "unknown"
    );

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("capability_denied");
    expect(await observationCount(seeded.entityId)).toBe(before);
  });

  it("leaves an unadmitted signed agent on the legacy allow path, as /correct does", async () => {
    const entityId = await newContact();

    const res = await batchCorrect(entityId, [{ field: "name", value: "Legacy Path" }], "unknown");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("applied");
  });
});
