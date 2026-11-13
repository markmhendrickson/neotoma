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
import { softDeleteEntity } from "../../src/services/deletion.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
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
const relationshipKeys: string[] = [];

const CONTACT_POLICY_ENV = "NEOTOMA_ACCESS_POLICY_CONTACT";

async function createEntity(
  entityType: "rendered_page" | "contact",
  marker: string
): Promise<string> {
  const id = `ent_sx_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id,
    entity_type: entityType,
    canonical_name: `${marker}-NAME`,
    user_id: OWNER,
    created_at: now,
    updated_at: now,
  });
  await db.from("observations").insert({
    entity_id: id,
    entity_type: entityType,
    user_id: OWNER,
    fields: { title: marker, name: marker, html_body: `<p>${marker}</p>` },
    observed_at: now,
    source_priority: 0,
  });
  await recomputeSnapshot(id, OWNER);
  entityIds.push(id);
  return id;
}

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

async function link(sourceId: string, targetId: string): Promise<void> {
  const relationshipKey = `REFERS_TO:${sourceId}:${targetId}`;
  await db.from("relationship_snapshots").insert({
    relationship_key: relationshipKey,
    relationship_type: "REFERS_TO",
    source_entity_id: sourceId,
    target_entity_id: targetId,
    schema_version: "1",
    snapshot: JSON.stringify({}),
    user_id: OWNER,
  });
  relationshipKeys.push(relationshipKey);
}

async function get(path: string, token?: string): Promise<{ status: number; body: string }> {
  const sep = path.includes("?") ? "&" : "?";
  const response = await fetch(`${baseUrl}${path}${token ? `${sep}access_token=${token}` : ""}`, {
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
  delete process.env[CONTACT_POLICY_ENV];
  for (const key of relationshipKeys) {
    await db.from("relationship_snapshots").delete().eq("relationship_key", key);
  }
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

type ExpansionBody = {
  outgoing: Array<Record<string, unknown>>;
  related_entities?: Record<string, Record<string, unknown>>;
};

function isExpanded(body: ExpansionBody, id: string): boolean {
  const entry = body.related_entities?.[id];
  expect(entry, `entry for ${id}`).toBeDefined();
  return entry!.entity_type !== null || entry!.canonical_name !== null;
}

/** Every related entity is expanded exactly when the caller's own GET of it is 200. */
async function expectExpansionMatchesDetailReads(
  body: ExpansionBody,
  token?: string
): Promise<void> {
  for (const id of Object.keys(body.related_entities ?? {})) {
    const detail = await get(`/entities/${id}`, token);
    expect(isExpanded(body, id), `${id} detail=${detail.status}`).toBe(detail.status === 200);
  }
}

describe.each(["closed", "read_only", "submit_only", "submitter_scoped", "open"] as const)(
  "signed identity reading related-entity expansion under policy %s",
  (policy) => {
    const pageReadable = policy === "read_only" || policy === "open";
    const routeOpen = pageReadable || policy === "submitter_scoped";

    it("with a guest token: expansion is limited to related entities the caller can read", async () => {
      process.env[POLICY_ENV] = policy;
      process.env[CONTACT_POLICY_ENV] = "closed";
      const a = await createEntity("rendered_page", `SIGT-A-${policy}`);
      const b = await createEntity("rendered_page", `SIGT-B-${policy}`);
      const c = await createEntity("contact", `SIGT-C-${policy}`);
      await link(a, b);
      await link(a, c);
      const token = await generateGuestAccessToken({ entityIds: [a], userId: OWNER });
      tokenEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);

      const res = await get(`/entities/${a}/relationships?expand_entities=true`, token);
      expect(res.body).not.toContain(`SIGT-C-${policy}`);
      if (!routeOpen) {
        expect(res.status, policy).toBe(403);
        expect(res.body).not.toContain(`SIGT-B-${policy}`);
        return;
      }
      expect(res.status, policy).toBe(200);
      const body = JSON.parse(res.body) as ExpansionBody;
      // The contact type is closed to this caller: never expanded.
      expect(isExpanded(body, c)).toBe(false);
      // The other page follows the page policy for this identity.
      expect(isExpanded(body, b)).toBe(pageReadable);
      if (!pageReadable) expect(res.body).not.toContain(`SIGT-B-${policy}`);
      await expectExpansionMatchesDetailReads(body, token);
    });

    it("without a token: expansion is limited by the identity's own policy per related entity", async () => {
      process.env[POLICY_ENV] = policy;
      process.env[CONTACT_POLICY_ENV] = "closed";
      const a = await createEntity("rendered_page", `SIGN-A-${policy}`);
      const b = await createEntity("rendered_page", `SIGN-B-${policy}`);
      const c = await createEntity("contact", `SIGN-C-${policy}`);
      await link(a, b);
      await link(a, c);

      const res = await get(`/entities/${a}/relationships?expand_entities=true`);
      expect(res.body).not.toContain(`SIGN-C-${policy}`);
      // With no token, A itself is readable only where the page policy allows.
      if (!pageReadable) {
        expect(res.status, policy).toBe(403);
        expect(res.body).not.toContain(`SIGN-B-${policy}`);
        return;
      }
      expect(res.status, policy).toBe(200);
      const body = JSON.parse(res.body) as ExpansionBody;
      expect(isExpanded(body, c)).toBe(false);
      expect(isExpanded(body, b)).toBe(pageReadable);
      if (!pageReadable) expect(res.body).not.toContain(`SIGN-B-${policy}`);
      await expectExpansionMatchesDetailReads(body);
    });
  }
);

describe.each(["closed", "read_only", "submit_only", "submitter_scoped", "open"] as const)(
  "signed identity and a merged entity under policy %s",
  (policy) => {
    const pageReadable = policy === "read_only" || policy === "open";

    /**
     * R is a page this caller can read under the page policy; it is merged into
     * T, a contact whose policy is closed to the caller. A links to R.
     */
    async function mergedFixture(tag: string, token?: string) {
      process.env[POLICY_ENV] = policy;
      process.env[CONTACT_POLICY_ENV] = "closed";
      const a = await createEntity("rendered_page", `${tag}-A-${policy}`);
      const r = await createEntity("rendered_page", `${tag}-R-${policy}`);
      const t = await createEntity("contact", `${tag}-T-${policy}`);
      const before = await get(`/entities/${r}`, token);
      if (pageReadable) expect(before.status, "readable before the merge").toBe(200);
      await mergeEntities({ fromEntityId: r, toEntityId: t, userId: OWNER, mergedBy: "test" });
      await link(a, r);
      // The merge target's own read route refuses this caller.
      expect((await get(`/entities/${t}`, token)).status).toBe(403);
      return { a, r, t };
    }

    async function expectNoTargetContent(
      ids: { a: string; r: string; t: string },
      tag: string,
      token?: string
    ): Promise<void> {
      const marker = `${tag}-T-${policy}`;
      for (const path of [`/entities/${ids.r}`, `/entities/${ids.r}/html`]) {
        const res = await get(path, token);
        expect(res.body, path).not.toContain(marker);
        expect(res.status, `${policy} ${path}`).toBe(pageReadable ? 404 : 403);
      }
      const rel = await get(`/entities/${ids.a}/relationships?expand_entities=true`, token);
      expect(rel.body).not.toContain(marker);
      if (!pageReadable) {
        expect(rel.status).toBe(403);
        return;
      }
      expect(rel.status).toBe(200);
      const body = JSON.parse(rel.body) as ExpansionBody;
      expect(isExpanded(body, ids.r)).toBe(false);
      await expectExpansionMatchesDetailReads(body, token);
    }

    it("without a token: a merged entity is answered as absent, never as its merge target", async () => {
      const ids = await mergedFixture("MNT");
      await expectNoTargetContent(ids, "MNT");
    });

    it("with a token that does not name it: a merged entity is answered as absent, never as its merge target", async () => {
      const seed = await createEntity("rendered_page", `MTK-SEED-${policy}`);
      const token = await generateGuestAccessToken({ entityIds: [seed], userId: OWNER });
      tokenEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
      const ids = await mergedFixture("MTK", token);
      await expectNoTargetContent(ids, "MTK", token);
    });

    it("with a token: a covered related entity that was deleted is not expanded", async () => {
      process.env[POLICY_ENV] = policy;
      process.env[CONTACT_POLICY_ENV] = "closed";
      const a = await createEntity("rendered_page", `DTK-A-${policy}`);
      const d = await createEntity("rendered_page", `DTK-D-${policy}`);
      await link(a, d);
      const token = await generateGuestAccessToken({ entityIds: [a, d], userId: OWNER });
      tokenEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
      const deleted = await softDeleteEntity(d, "rendered_page", OWNER);
      expect(deleted.success, JSON.stringify(deleted)).toBe(true);

      const res = await get(`/entities/${a}/relationships?expand_entities=true`, token);
      expect(res.body).not.toContain(`DTK-D-${policy}`);
      if (policy === "closed" || policy === "submit_only") {
        expect(res.status).toBe(403);
        return;
      }
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as ExpansionBody;
      expect(isExpanded(body, d)).toBe(false);
      await expectExpansionMatchesDetailReads(body, token);
    });
  }
);
