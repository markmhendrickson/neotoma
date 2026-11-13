/**
 * A caller with a signed agent identity is judged by that identity's own
 * access policy. A guest token presented alongside it covers only the entities
 * it names; it is never the grant for another entity.
 */
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/request_context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/request_context.js")>();
  return {
    ...actual,
    getCurrentAgentIdentity: () => ({ thumbprint: "signed-identity-test-thumbprint" }),
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

const OWNER = LOCAL_DEV_USER_ID;
const POLICY_ENV = "NEOTOMA_ACCESS_POLICY_RENDERED_PAGE";
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const entityIds: string[] = [];
const tokenEntityIds: string[] = [];

async function createPage(marker: string): Promise<string> {
  const id = `ent_rp_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id,
    entity_type: "rendered_page",
    canonical_name: `${marker}-${id}`,
    user_id: OWNER,
    created_at: now,
    updated_at: now,
  });
  await db.from("observations").insert({
    entity_id: id,
    entity_type: "rendered_page",
    user_id: OWNER,
    fields: { title: marker, html_body: `<p>${marker}</p>` },
    observed_at: now,
    source_priority: 0,
  });
  await recomputeSnapshot(id, OWNER);
  entityIds.push(id);
  return id;
}

async function get(path: string, token: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${baseUrl}${path}?access_token=${token}`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
  return { status: response.status, body: await response.text() };
}

beforeAll(() => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env[POLICY_ENV];
  for (const id of tokenEntityIds) {
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  }
  for (const id of entityIds) {
    await db.from("observations").delete().eq("entity_id", id);
    await db.from("entity_snapshots").delete().eq("entity_id", id);
    await db.from("entities").delete().eq("id", id);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe.each(["closed", "submit_only", "submitter_scoped"] as const)(
  "signed identity with a guest token under policy %s",
  (policy) => {
    it("a token for one page gives no access to another page", async () => {
      process.env[POLICY_ENV] = policy;
      const a = await createPage(`SIG-A-${policy}`);
      const b = await createPage(`SIG-B-${policy}`);
      const token = await generateGuestAccessToken({ entityIds: [a], userId: OWNER });
      tokenEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);

      const own = await get(`/entities/${a}/html`, token);
      expect(own.status).toBe(200);
      for (const path of [`/entities/${b}/html`, `/entities/${b}`, `/entities/${b}/observations`]) {
        const res = await get(path, token);
        expect(res.status, `${policy} ${path}`).toBe(403);
        expect(res.body).not.toContain(`SIG-B-${policy}`);
      }
    });
  }
);
