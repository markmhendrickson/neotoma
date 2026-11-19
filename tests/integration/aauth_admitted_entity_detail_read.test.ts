/**
 * An admitted AAuth agent (a verified signature that matches an active
 * `agent_grant`) reads an entity through GET /entities/:id and its
 * /observations, /relationships and /html sub-routes as the grant's owner, the same
 * as it already does through POST /entities/query. It is not judged as a
 * guest, so the entity type's guest access policy does not refuse it.
 *
 * What stays as it was:
 * - an admitted agent that also presents a guest token is judged by the token;
 * - a signed agent with no matching grant is still a guest and still refused
 *   under a closed policy;
 * - an admitted agent reads only its grant owner's entities.
 *
 * Each case drives the real Express app over HTTP against the local test
 * database. Agent admission is injected by mocking the AAuth signature
 * verifier and the grant lookup (the pattern in
 * batch_correct_capability_parity.test.ts), so the request still runs the
 * real middleware chain and route. Requests run both as remote callers
 * (untrusted X-Forwarded-For) and as loopback callers, which take different
 * branches of the auth middleware.
 */

import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const SIGNED_HEADER = "x-test-admitted-read-signed";
const THUMBPRINT_PREFIX = "tp-admitted-entity-read-";
const GRANT_OWNER = vi.hoisted(() => `usr_admitted_read_${Date.now().toString(36)}`);

vi.mock("../../src/middleware/aauth_verify.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/middleware/aauth_verify.js")>();
  return {
    ...original,
    aauthVerify: () => (req: Request, _res: Response, next: NextFunction) => {
      const signed = req.headers[SIGNED_HEADER];
      if (typeof signed === "string") {
        (req as Request & { aauth?: unknown }).aauth = {
          verified: true,
          publicKey: '{"kty":"EC"}',
          thumbprint: `${THUMBPRINT_PREFIX}${signed}`,
          algorithm: "ES256",
          sub: "reader@swarm.test",
          iss: "https://swarm.test",
        };
      }
      next();
    },
  };
});

vi.mock("../../src/services/aauth_admission.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/services/aauth_admission.js")>();
  return {
    ...original,
    admitFromAAuthContext: async (ctx: { verified?: boolean; thumbprint?: string } | null) => {
      if (!ctx?.verified) return { admitted: false, reason: "not_signed" };
      const key = (ctx.thumbprint ?? "").slice(THUMBPRINT_PREFIX.length);
      if (key !== "granted") return { admitted: false, reason: "no_match" };
      return {
        admitted: true,
        reason: "admitted",
        user_id: GRANT_OWNER,
        grant_id: "ent_test_admitted_entity_read_grant",
        agent_label: "admitted entity read",
        capabilities: [{ op: "retrieve", entity_types: ["*"] }],
      };
    },
  };
});

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";

const POLICY_ENV = "NEOTOMA_ACCESS_POLICY_TRANSCRIPTION";
const PAGE_POLICY_ENV = "NEOTOMA_ACCESS_POLICY_RENDERED_PAGE";

let httpServer: Server;
let baseUrl: string;
const entityIds: string[] = [];
const tokenEntityIds: string[] = [];
const relationshipKeys: string[] = [];
let previousPolicy: string | undefined;
let previousPagePolicy: string | undefined;

async function createEntity(
  entityType: "transcription" | "rendered_page",
  userId: string,
  marker: string
): Promise<string> {
  const id = `ent_ar_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id,
    entity_type: entityType,
    canonical_name: `${marker}-NAME`,
    user_id: userId,
    created_at: now,
    updated_at: now,
  });
  await db.from("observations").insert({
    entity_id: id,
    entity_type: entityType,
    user_id: userId,
    fields: { title: marker, text: marker, html_body: `<p>${marker}</p>` },
    observed_at: now,
    source_priority: 0,
  });
  await recomputeSnapshot(id, userId);
  entityIds.push(id);
  return id;
}

function createTranscription(userId: string, marker: string): Promise<string> {
  return createEntity("transcription", userId, marker);
}

async function link(userId: string, sourceId: string, targetId: string): Promise<void> {
  const relationshipKey = `REFERS_TO:${sourceId}:${targetId}`;
  await db.from("relationship_snapshots").insert({
    relationship_key: relationshipKey,
    relationship_type: "REFERS_TO",
    source_entity_id: sourceId,
    target_entity_id: targetId,
    schema_version: "1",
    snapshot: JSON.stringify({}),
    user_id: userId,
  });
  relationshipKeys.push(relationshipKey);
}

async function mintToken(entityId: string): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds: [entityId], userId: GRANT_OWNER });
  tokenEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
  return token;
}

type Caller = "remote" | "loopback";

async function get(
  caller: Caller,
  path: string,
  opts: { signed?: "granted" | "ungranted"; token?: string } = {}
): Promise<{ status: number; body: string }> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${baseUrl}${path}${opts.token ? `${sep}access_token=${opts.token}` : ""}`;
  const headers: Record<string, string> = {};
  if (caller === "remote") headers["x-forwarded-for"] = "203.0.113.9";
  if (opts.signed) headers[SIGNED_HEADER] = opts.signed;
  const response = await fetch(url, { headers });
  return { status: response.status, body: await response.text() };
}

beforeAll(async () => {
  previousPolicy = process.env[POLICY_ENV];
  process.env[POLICY_ENV] = "closed";
  previousPagePolicy = process.env[PAGE_POLICY_ENV];
  process.env[PAGE_POLICY_ENV] = "closed";
  httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("expected TCP address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (previousPolicy === undefined) delete process.env[POLICY_ENV];
  else process.env[POLICY_ENV] = previousPolicy;
  if (previousPagePolicy === undefined) delete process.env[PAGE_POLICY_ENV];
  else process.env[PAGE_POLICY_ENV] = previousPagePolicy;
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  for (const key of relationshipKeys) {
    await db.from("relationship_snapshots").delete().eq("relationship_key", key);
  }
  for (const id of [...tokenEntityIds, ...entityIds]) {
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  }
});

describe.each(["remote", "loopback"] as const)(
  "admitted agent entity reads under a closed type policy (%s caller)",
  (caller) => {
    it("GET /entities/:id returns the grant owner's snapshot", async () => {
      const marker = `AR-DETAIL-${caller}-${randomUUID().slice(0, 8)}`;
      const id = await createTranscription(GRANT_OWNER, marker);

      const res = await get(caller, `/entities/${id}`, { signed: "granted" });
      expect(res.status, res.body).toBe(200);
      const body = JSON.parse(res.body) as { entity_id?: string; snapshot?: unknown };
      expect(body.entity_id).toBe(id);
      expect(JSON.stringify(body.snapshot)).toContain(marker);
    });

    it("GET /entities/:id/observations returns the grant owner's observations", async () => {
      const marker = `AR-OBS-${caller}-${randomUUID().slice(0, 8)}`;
      const id = await createTranscription(GRANT_OWNER, marker);

      const res = await get(caller, `/entities/${id}/observations`, { signed: "granted" });
      expect(res.status, res.body).toBe(200);
      const body = JSON.parse(res.body) as { observations: unknown[]; total: number };
      expect(body.total).toBe(1);
      expect(res.body).toContain(marker);
    });

    it("GET /entities/:id/relationships returns the grant owner's relationships", async () => {
      const a = await createTranscription(GRANT_OWNER, `AR-REL-A-${caller}`);
      const b = await createTranscription(GRANT_OWNER, `AR-REL-B-${caller}`);
      await link(GRANT_OWNER, a, b);

      const res = await get(caller, `/entities/${a}/relationships`, { signed: "granted" });
      expect(res.status, res.body).toBe(200);
      const body = JSON.parse(res.body) as {
        outgoing: Array<{ target_entity_id: string }>;
      };
      expect(body.outgoing.map((r) => r.target_entity_id)).toEqual([b]);
    });

    it("GET /entities/:id/html renders the grant owner's rendered page", async () => {
      const marker = `AR-HTML-${caller}-${randomUUID().slice(0, 8)}`;
      const id = await createEntity("rendered_page", GRANT_OWNER, marker);

      const res = await get(caller, `/entities/${id}/html`, { signed: "granted" });
      expect(res.status, res.body).toBe(200);
      expect(res.body).toContain(`<p>${marker}</p>`);
    });

    it("an admitted agent presenting a guest token is judged by the token", async () => {
      const covered = await createTranscription(GRANT_OWNER, `AR-TOK-COVERED-${caller}`);
      const marker = `AR-TOK-OTHER-${caller}-${randomUUID().slice(0, 8)}`;
      const other = await createTranscription(GRANT_OWNER, marker);
      const token = await mintToken(covered);

      // Without the token the same agent reads `other` as its owner.
      const asOwner = await get(caller, `/entities/${other}`, { signed: "granted" });
      expect(asOwner.status, asOwner.body).toBe(200);

      // With a token that names only `covered`, the request is a guest request:
      // the token covers `covered` and gives nothing for `other`.
      const ownEntity = await get(caller, `/entities/${covered}`, { signed: "granted", token });
      expect(ownEntity.status, ownEntity.body).toBe(200);
      for (const path of [
        `/entities/${other}`,
        `/entities/${other}/observations`,
        `/entities/${other}/relationships`,
      ]) {
        const res = await get(caller, path, { signed: "granted", token });
        expect(res.status, `${path} ${res.body}`).toBe(403);
        expect(res.body).not.toContain(marker);
      }
    });

    it("a signed agent with no matching grant is still refused as a guest", async () => {
      const marker = `AR-UNGRANTED-${caller}-${randomUUID().slice(0, 8)}`;
      const id = await createTranscription(GRANT_OWNER, marker);

      for (const path of [`/entities/${id}`, `/entities/${id}/observations`]) {
        const res = await get(caller, path, { signed: "ungranted" });
        expect(res.status, `${path} ${res.body}`).toBe(403);
        expect(res.body).toContain("guest");
        expect(res.body).not.toContain(marker);
      }
    });

    it("an admitted agent cannot read another user's entity", async () => {
      const marker = `AR-FOREIGN-${caller}-${randomUUID().slice(0, 8)}`;
      const foreign = await createTranscription(LOCAL_DEV_USER_ID, marker);

      for (const path of [
        `/entities/${foreign}`,
        `/entities/${foreign}/observations`,
        `/entities/${foreign}/relationships`,
      ]) {
        const res = await get(caller, path, { signed: "granted" });
        expect(res.status, `${path} ${res.body}`).toBe(404);
        expect(res.body).not.toContain(marker);
      }
    });
  }
);
