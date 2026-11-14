/**
 * Related-entity expansion for a guest returns only entities the guest's link
 * covers, under every type-level access policy mode. A caller holding only a
 * guest token keeps every relationship row (ids and relationship type), but a
 * related entity its token does not cover gets no name, type or snapshot.
 *
 * Also: the observations and relationships routes answer 404 for a deleted
 * entity the token covers, and for a merged entity, as the entity detail and
 * HTML routes do.
 *
 * Drives the real request path over a live server.
 */
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app, GUEST_EXPANSION_MAX_RELATED_ENTITIES } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { softDeleteEntity } from "../../src/services/deletion.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
import {
  GUEST_TOKEN_INVALID_CODE,
  GUEST_TOKEN_SCOPE_CODE,
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";

const POLICIES = ["closed", "read_only", "submit_only", "submitter_scoped", "open"] as const;
type Policy = (typeof POLICIES)[number];

/** Policies under which a guest may read an entity's relationships. */
const READ_POLICIES: ReadonlySet<Policy> = new Set(["read_only", "submitter_scoped", "open"]);

const OWNER = LOCAL_DEV_USER_ID;
const PAGE_POLICY_ENV = "NEOTOMA_ACCESS_POLICY_RENDERED_PAGE";
const CONTACT_POLICY_ENV = "NEOTOMA_ACCESS_POLICY_CONTACT";
const ISSUE_POLICY_ENV = "NEOTOMA_ACCESS_POLICY_ISSUE";

let baseUrl: string;
let server: ReturnType<typeof app.listen>;
const entityIds: string[] = [];
const tokenEntityIds: string[] = [];
const relationshipKeys: string[] = [];

type EntityType = "rendered_page" | "contact" | "issue";

const ID_PREFIX: Record<EntityType, string> = {
  rendered_page: "ent_rp",
  contact: "ent_ct",
  issue: "ent_is",
};

const ENTITY_FIELDS: Record<EntityType, (marker: string) => Record<string, unknown>> = {
  rendered_page: (marker) => ({ title: `${marker}-TITLE`, html_body: `<p>${marker}-BODY</p>` }),
  contact: (marker) => ({ name: `${marker}-TITLE`, notes: `${marker}-BODY` }),
  issue: (marker) => ({ title: `${marker}-TITLE`, body: `${marker}-BODY` }),
};

const POLICY_ENV: Record<EntityType, string> = {
  rendered_page: "NEOTOMA_ACCESS_POLICY_RENDERED_PAGE",
  contact: "NEOTOMA_ACCESS_POLICY_CONTACT",
  issue: "NEOTOMA_ACCESS_POLICY_ISSUE",
};

async function createEntity(entityType: EntityType, marker: string): Promise<string> {
  const prefix = ID_PREFIX[entityType];
  const id = `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
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
    fields: ENTITY_FIELDS[entityType](marker),
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

/** An issue whose own records carry the token's hash (the issue submitter rule). */
async function createSubmittedIssue(marker: string, token: string): Promise<string> {
  const id = `ent_is_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id,
    entity_type: "issue",
    canonical_name: `${marker}-NAME`,
    user_id: OWNER,
    created_at: now,
    updated_at: now,
  });
  await db.from("observations").insert({
    entity_id: id,
    entity_type: "issue",
    user_id: OWNER,
    fields: {
      title: `${marker}-TITLE`,
      body: `${marker}-BODY`,
      guest_access_token_hash: hashGuestAccessToken(token),
    },
    observed_at: now,
    source_priority: 0,
  });
  await recomputeSnapshot(id, OWNER);
  entityIds.push(id);
  return id;
}

async function mint(ids: string[]): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds: ids, userId: OWNER });
  tokenEntityIds.push(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
  return token;
}

/** A remote request (not the local owner), optionally carrying a guest token. */
async function guestGet(path: string, token: string): Promise<{ status: number; body: string }> {
  const sep = path.includes("?") ? "&" : "?";
  const response = await fetch(`${baseUrl}${path}${sep}access_token=${token}`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
  return { status: response.status, body: await response.text() };
}

/** A loopback request with no credentials resolves to the local owner. */
async function ownerGet(path: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.text() };
}

type RelationshipsBody = {
  outgoing: Array<Record<string, unknown>>;
  incoming: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
  related_entities?: Record<string, Record<string, unknown>>;
};

/** A related entity entry carries no name, type, label or snapshot. */
function expectNotExpanded(body: RelationshipsBody, id: string): void {
  const entry = body.related_entities?.[id];
  expect(entry, `entry for ${id}`).toBeDefined();
  expect(entry).toEqual({ entity_id: id, canonical_name: null, entity_type: null });
}

beforeAll(() => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const env of Object.values(POLICY_ENV)) delete process.env[env];
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

describe.each(POLICIES)("related-entity expansion for a guest under policy %s", (policy) => {
  /** A covered page A, linked to a contact (outgoing) and to page B (incoming). */
  async function fixture(tag: string) {
    const a = await createEntity("rendered_page", `A-${tag}-${policy}`);
    const b = await createEntity("rendered_page", `B-${tag}-${policy}`);
    const c = await createEntity("contact", `C-${tag}-${policy}`);
    await link(a, c);
    await link(b, a);
    return { a, b, c };
  }

  function expectGuestExpansion(
    res: { status: number; body: string },
    ids: { a: string; b: string; c: string },
    hiddenMarkers: string[]
  ): void {
    for (const marker of hiddenMarkers) expect(res.body).not.toContain(marker);
    if (!READ_POLICIES.has(policy)) {
      expect(res.status).toBe(403);
      return;
    }
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as RelationshipsBody;
    // Relationship rows stay, with their ids and relationship type.
    expect(body.outgoing).toHaveLength(1);
    expect(body.outgoing[0]).toMatchObject({
      relationship_type: "REFERS_TO",
      source_entity_id: ids.a,
      target_entity_id: ids.c,
      target_entity_name: null,
      target_entity_type: null,
      target_entity_type_label: null,
    });
    expect(body.incoming).toHaveLength(1);
    expect(body.incoming[0]).toMatchObject({
      relationship_type: "REFERS_TO",
      source_entity_id: ids.b,
      target_entity_id: ids.a,
      source_entity_name: null,
      source_entity_type: null,
      source_entity_type_label: null,
    });
    expectNotExpanded(body, ids.c);
    expectNotExpanded(body, ids.b);
  }

  it("expansion for a token-only guest shows no content of a linked entity of another type or a linked page", async () => {
    process.env[PAGE_POLICY_ENV] = policy;
    process.env[CONTACT_POLICY_ENV] = policy;
    const ids = await fixture("same");
    const token = await mint([ids.a]);
    const res = await guestGet(`/entities/${ids.a}/relationships?expand_entities=true`, token);
    expectGuestExpansion(res, ids, [`B-same-${policy}`, `C-same-${policy}`]);
  });

  it("an open policy on the linked type does not expand an entity the token does not cover", async () => {
    process.env[PAGE_POLICY_ENV] = policy;
    process.env[CONTACT_POLICY_ENV] = "open";
    const ids = await fixture("open");
    const token = await mint([ids.a]);
    const res = await guestGet(`/entities/${ids.a}/relationships?expand_entities=true`, token);
    expectGuestExpansion(res, ids, [`B-open-${policy}`, `C-open-${policy}`]);
  });

  it("expansion for a token-only guest returns a related entity the token also covers", async () => {
    process.env[PAGE_POLICY_ENV] = policy;
    process.env[CONTACT_POLICY_ENV] = policy;
    const ids = await fixture("both");
    const token = await mint([ids.a, ids.b]);
    const res = await guestGet(`/entities/${ids.a}/relationships?expand_entities=true`, token);
    expect(res.body).not.toContain(`C-both-${policy}`);
    if (!READ_POLICIES.has(policy)) {
      expect(res.status).toBe(403);
      return;
    }
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as RelationshipsBody;
    expect(body.related_entities?.[ids.b]).toMatchObject({
      entity_id: ids.b,
      entity_type: "rendered_page",
      canonical_name: expect.stringContaining(`B-both-${policy}`),
    });
    expect(res.body).toContain(`B-both-${policy}-BODY`);
    expect(body.incoming[0]).toMatchObject({
      source_entity_id: ids.b,
      source_entity_name: expect.stringContaining(`B-both-${policy}`),
      source_entity_type: "rendered_page",
    });
    expectNotExpanded(body, ids.c);
  });

  it("expansion for a token-only guest leaves out a covered related entity that was deleted", async () => {
    process.env[PAGE_POLICY_ENV] = policy;
    process.env[CONTACT_POLICY_ENV] = policy;
    const ids = await fixture("gone");
    const token = await mint([ids.a, ids.b]);
    const deleted = await softDeleteEntity(ids.b, "rendered_page", OWNER);
    expect(deleted.success, JSON.stringify(deleted)).toBe(true);
    const res = await guestGet(`/entities/${ids.a}/relationships?expand_entities=true`, token);
    expectGuestExpansion(res, ids, [`B-gone-${policy}`, `C-gone-${policy}`]);
  });

  it("the owner still gets full expansion", async () => {
    process.env[PAGE_POLICY_ENV] = policy;
    process.env[CONTACT_POLICY_ENV] = policy;
    const ids = await fixture("owner");
    const res = await ownerGet(`/entities/${ids.a}/relationships?expand_entities=true`);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as RelationshipsBody;
    expect(body.related_entities?.[ids.b]).toMatchObject({
      entity_type: "rendered_page",
      canonical_name: expect.stringContaining(`B-owner-${policy}`),
    });
    expect(body.related_entities?.[ids.c]).toMatchObject({
      entity_type: "contact",
      canonical_name: expect.stringContaining(`C-owner-${policy}`),
    });
    expect(res.body).toContain(`B-owner-${policy}-BODY`);
    expect(body.outgoing[0]).toMatchObject({
      target_entity_name: expect.stringContaining(`C-owner-${policy}`),
    });
    expect(body.incoming[0]).toMatchObject({
      source_entity_name: expect.stringContaining(`B-owner-${policy}`),
    });
  });

  it("observations and relationships answer 404 for a deleted entity the token covers, like the detail and HTML routes", async () => {
    process.env[PAGE_POLICY_ENV] = policy;
    process.env[CONTACT_POLICY_ENV] = policy;
    const a = await createEntity("rendered_page", `DEL-A-${policy}`);
    const token = await mint([a]);
    const deleted = await softDeleteEntity(a, "rendered_page", OWNER);
    expect(deleted.success, JSON.stringify(deleted)).toBe(true);
    for (const path of [
      `/entities/${a}`,
      `/entities/${a}/html`,
      `/entities/${a}/observations`,
      `/entities/${a}/relationships`,
      `/entities/${a}/relationships?expand_entities=true`,
    ]) {
      const res = await guestGet(path, token);
      expect(res.status, `${policy} ${path}`).toBe(404);
      expect(res.body).not.toContain(`DEL-A-${policy}`);
      expect(JSON.parse(res.body)).toMatchObject({ error_code: "RESOURCE_NOT_FOUND" });
    }
  });

  it("a deleted entity the token does not cover gets the same 403 as a live one", async () => {
    process.env[PAGE_POLICY_ENV] = policy;
    process.env[CONTACT_POLICY_ENV] = policy;
    const a = await createEntity("rendered_page", `KEEP-A-${policy}`);
    const b = await createEntity("rendered_page", `DEL-B-${policy}`);
    const token = await mint([a]);
    const deleted = await softDeleteEntity(b, "rendered_page", OWNER);
    expect(deleted.success, JSON.stringify(deleted)).toBe(true);
    for (const path of [`/entities/${b}/observations`, `/entities/${b}/relationships`]) {
      const res = await guestGet(path, token);
      expect(res.status, `${policy} ${path}`).toBe(403);
      expect(JSON.parse(res.body)).toMatchObject({ error_code: GUEST_TOKEN_SCOPE_CODE });
    }
  });
});

/**
 * For every related entity, expansion equals the caller's own read of that
 * entity through GET /entities/{id}: expanded exactly when that read is 200.
 */
async function expectExpansionMatchesDetailReads(
  body: RelationshipsBody,
  token: string
): Promise<void> {
  for (const [id, entry] of Object.entries(body.related_entities ?? {})) {
    const detail = await guestGet(`/entities/${id}`, token);
    const expanded = entry.entity_type !== null || entry.canonical_name !== null;
    expect(expanded, `${id}: expanded=${expanded}, detail=${detail.status}`).toBe(
      detail.status === 200
    );
  }
}

describe.each(POLICIES)(
  "related-entity expansion follows each entity's own read decision under policy %s",
  (policy) => {
    it("a submitter-scoped related issue whose type policy refuses is not expanded", async () => {
      process.env[PAGE_POLICY_ENV] = policy;
      process.env[ISSUE_POLICY_ENV] = "closed";
      const a = await createEntity("rendered_page", `SUBA-${policy}`);
      const token = await mint([a]);
      const issue = await createSubmittedIssue(`SUBI-${policy}`, token);
      await link(a, issue);

      // The issue's own read route refuses this caller.
      const detail = await guestGet(`/entities/${issue}`, token);
      expect(detail.status).toBe(403);

      const res = await guestGet(`/entities/${a}/relationships?expand_entities=true`, token);
      expect(res.body).not.toContain(`SUBI-${policy}`);
      if (!READ_POLICIES.has(policy)) {
        expect(res.status).toBe(403);
        return;
      }
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as RelationshipsBody;
      expect(body.outgoing[0]).toMatchObject({
        relationship_type: "REFERS_TO",
        target_entity_id: issue,
        target_entity_name: null,
        target_entity_type: null,
      });
      expectNotExpanded(body, issue);
      await expectExpansionMatchesDetailReads(body, token);
    });

    it("a submitter-scoped related issue its type policy allows is expanded, as its own read route allows", async () => {
      process.env[PAGE_POLICY_ENV] = policy;
      process.env[ISSUE_POLICY_ENV] = "submitter_scoped";
      const a = await createEntity("rendered_page", `SUBOKA-${policy}`);
      const token = await mint([a]);
      const issue = await createSubmittedIssue(`SUBOKI-${policy}`, token);
      await link(a, issue);
      expect((await guestGet(`/entities/${issue}`, token)).status).toBe(200);

      const res = await guestGet(`/entities/${a}/relationships?expand_entities=true`, token);
      if (!READ_POLICIES.has(policy)) {
        expect(res.status).toBe(403);
        return;
      }
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as RelationshipsBody;
      expect(body.related_entities?.[issue]).toMatchObject({ entity_type: "issue" });
      await expectExpansionMatchesDetailReads(body, token);
    });

    it("a merged related entity the token names gets an unexpanded entry", async () => {
      process.env[PAGE_POLICY_ENV] = policy;
      process.env[CONTACT_POLICY_ENV] = policy;
      const a = await createEntity("rendered_page", `MRGA-${policy}`);
      const m = await createEntity("rendered_page", `MRGM-${policy}`);
      const target = await createEntity("rendered_page", `MRGT-${policy}`);
      const token = await mint([a, m]);
      await mergeEntities({ fromEntityId: m, toEntityId: target, userId: OWNER, mergedBy: "test" });
      await link(a, m);

      expect((await guestGet(`/entities/${m}`, token)).status).toBe(404);
      const res = await guestGet(`/entities/${a}/relationships?expand_entities=true`, token);
      expect(res.body).not.toContain(`MRGM-${policy}`);
      expect(res.body).not.toContain(`MRGT-${policy}`);
      if (!READ_POLICIES.has(policy)) {
        expect(res.status).toBe(403);
        return;
      }
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as RelationshipsBody;
      expectNotExpanded(body, m);
      await expectExpansionMatchesDetailReads(body, token);
    });

    it("a token with no resolvable grant expands nothing", async () => {
      process.env[PAGE_POLICY_ENV] = policy;
      process.env[CONTACT_POLICY_ENV] = policy;
      const a = await createEntity("rendered_page", `NGA-${policy}`);
      const b = await createEntity("rendered_page", `NGB-${policy}`);
      await link(a, b);
      const unknown = randomUUID();
      const res = await guestGet(`/entities/${a}/relationships?expand_entities=true`, unknown);
      expect(res.status).toBe(401);
      expect(JSON.parse(res.body)).toMatchObject({ error_code: GUEST_TOKEN_INVALID_CODE });
      expect(res.body).not.toContain("related_entities");
      expect(res.body).not.toContain(`NGA-${policy}`);
      expect(res.body).not.toContain(`NGB-${policy}`);
    });
  }
);

describe("related-entity expansion bound for a guest", () => {
  it("evaluates at most the documented number of related entities, in ascending id order", async () => {
    process.env[PAGE_POLICY_ENV] = "open";
    const a = await createEntity("rendered_page", "CAP-A");
    const related: string[] = [];
    for (let i = 0; i <= GUEST_EXPANSION_MAX_RELATED_ENTITIES; i++) {
      const id = await createEntity("rendered_page", `CAP-R${i}`);
      await link(a, id);
      related.push(id);
    }
    const token = await mint([a, ...related]);
    const res = await guestGet(`/entities/${a}/relationships?expand_entities=true`, token);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as RelationshipsBody;
    const sorted = [...related].sort();
    const expanded = sorted.filter((id) => body.related_entities?.[id]?.entity_type !== null);
    expect(expanded).toEqual(sorted.slice(0, GUEST_EXPANSION_MAX_RELATED_ENTITIES));
    for (const id of sorted.slice(GUEST_EXPANSION_MAX_RELATED_ENTITIES)) {
      expectNotExpanded(body, id);
    }
    expect(body.outgoing).toHaveLength(related.length);
  });

  it("the owner's expansion is not bounded", async () => {
    process.env[PAGE_POLICY_ENV] = "open";
    const a = await createEntity("rendered_page", "OCAP-A");
    for (let i = 0; i <= GUEST_EXPANSION_MAX_RELATED_ENTITIES; i++) {
      await link(a, await createEntity("rendered_page", `OCAP-R${i}`));
    }
    const res = await ownerGet(`/entities/${a}/relationships?expand_entities=true`);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as RelationshipsBody;
    const entries = Object.values(body.related_entities ?? {});
    expect(entries).toHaveLength(GUEST_EXPANSION_MAX_RELATED_ENTITIES + 1);
    expect(entries.every((entry) => entry.entity_type === "rendered_page")).toBe(true);
  });
});

/** Every guest-readable route for one entity. */
function entityRoutes(id: string): string[] {
  return [
    `/entities/${id}`,
    `/entities/${id}/html`,
    `/entities/${id}/observations`,
    `/entities/${id}/relationships`,
    `/entities/${id}/relationships?expand_entities=true`,
  ];
}

const MERGE_FIXTURES: ReadonlyArray<{ name: string; from: EntityType; to: EntityType }> = [
  { name: "a page merged into a page", from: "rendered_page", to: "rendered_page" },
  { name: "an issue merged into a page", from: "issue", to: "rendered_page" },
  { name: "a page merged into a contact", from: "rendered_page", to: "contact" },
  { name: "an issue merged into a contact", from: "issue", to: "contact" },
];

describe.each(POLICIES)("a merged entity on every guest route under policy %s", (policy) => {
  /**
   * A page A links to M; M is merged into T. A token-only caller holds a token
   * naming A and M, and also T when `targetAdmitted`, so the merge target is
   * itself readable to the caller: following the merge would serve content.
   */
  async function mergedFixture(
    fixture: { from: EntityType; to: EntityType },
    tag: string,
    targetAdmitted: boolean
  ) {
    process.env[POLICY_ENV.rendered_page] = policy;
    process.env[POLICY_ENV[fixture.from]] = policy;
    if (fixture.to !== "rendered_page") {
      process.env[POLICY_ENV[fixture.to]] = targetAdmitted ? "open" : "closed";
    }
    const a = await createEntity("rendered_page", `${tag}-A-${policy}`);
    const m = await createEntity(fixture.from, `${tag}-M-${policy}`);
    const t = await createEntity(fixture.to, `${tag}-T-${policy}`);
    const token = await mint(targetAdmitted ? [a, m, t] : [a, m]);
    expect((await guestGet(`/entities/${m}`, token)).status, "readable before the merge").toBe(200);
    await mergeEntities({ fromEntityId: m, toEntityId: t, userId: OWNER, mergedBy: "test" });
    await link(a, m);
    expect((await guestGet(`/entities/${t}`, token)).status, "merge target read").toBe(
      targetAdmitted ? 200 : 403
    );
    return { a, m, t, token };
  }

  describe.each(MERGE_FIXTURES)("$name", (fixture) => {
    it.each([false, true])(
      "a merged entity the token names answers 404 on every route (merge target admitted: %s)",
      async (targetAdmitted) => {
        const tag = `MRG${targetAdmitted ? "Y" : "N"}-${fixture.from}-${fixture.to}`;
        const { a, m, token } = await mergedFixture(fixture, tag, targetAdmitted);
        for (const path of entityRoutes(m)) {
          const res = await guestGet(path, token);
          expect(res.status, `${policy} ${path}`).toBe(404);
          expect(JSON.parse(res.body)).toMatchObject({ error_code: "RESOURCE_NOT_FOUND" });
          expect(res.body).not.toContain(`${tag}-M-${policy}`);
          expect(res.body).not.toContain(`${tag}-T-${policy}`);
        }

        const rel = await guestGet(`/entities/${a}/relationships?expand_entities=true`, token);
        expect(rel.body).not.toContain(`${tag}-M-${policy}`);
        expect(rel.body).not.toContain(`${tag}-T-${policy}`);
        if (!READ_POLICIES.has(policy)) {
          expect(rel.status).toBe(403);
          return;
        }
        expect(rel.status).toBe(200);
        const body = JSON.parse(rel.body) as RelationshipsBody;
        expectNotExpanded(body, m);
        await expectExpansionMatchesDetailReads(body, token);
      }
    );

    it("a merged entity the token does not name gets the same 403 as a live one on every route", async () => {
      const tag = `MRGU-${fixture.from}-${fixture.to}`;
      const { m } = await mergedFixture(fixture, tag, false);
      const seed = await createEntity("rendered_page", `${tag}-SEED-${policy}`);
      const other = await mint([seed]);
      for (const path of entityRoutes(m)) {
        const res = await guestGet(path, other);
        expect(res.status, `${policy} ${path}`).toBe(403);
        expect(JSON.parse(res.body)).toMatchObject({ error_code: GUEST_TOKEN_SCOPE_CODE });
        expect(res.body).not.toContain(`${tag}-M-${policy}`);
        expect(res.body).not.toContain(`${tag}-T-${policy}`);
      }
    });
  });
});

describe.each(["read_only", "submitter_scoped"] as const)(
  "related-entity expansion bound for a guest under policy %s, with related entities the token does not cover",
  (policy) => {
    it("the bound counts uncovered candidates; only covered ones inside it are expanded", async () => {
      process.env[PAGE_POLICY_ENV] = policy;
      const a = await createEntity("rendered_page", `UCAP-A-${policy}`);
      const markerOf = new Map<string, string>();
      const related: string[] = [];
      for (let i = 0; i < GUEST_EXPANSION_MAX_RELATED_ENTITIES + 10; i++) {
        const marker = `UCAP-${policy}-R${i}`;
        const id = await createEntity("rendered_page", marker);
        await link(a, id);
        related.push(id);
        markerOf.set(id, marker);
      }
      const sorted = [...related].sort();
      // Every other entity in id order is covered, so covered entities fall
      // both inside and beyond the bound, and so do uncovered ones.
      const covered = new Set(sorted.filter((_, i) => i % 2 === 0));
      const token = await mint([a, ...covered]);

      const res = await guestGet(`/entities/${a}/relationships?expand_entities=true`, token);
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as RelationshipsBody;
      expect(body.outgoing).toHaveLength(related.length);

      const inside = sorted.slice(0, GUEST_EXPANSION_MAX_RELATED_ENTITIES);
      const beyond = sorted.slice(GUEST_EXPANSION_MAX_RELATED_ENTITIES);
      expect(beyond.some((id) => covered.has(id))).toBe(true);
      expect(beyond.some((id) => !covered.has(id))).toBe(true);

      const expanded = sorted.filter((id) => body.related_entities?.[id]?.entity_type !== null);
      expect(expanded).toEqual(inside.filter((id) => covered.has(id)));
      for (const id of sorted) {
        if (expanded.includes(id)) continue;
        expectNotExpanded(body, id);
        expect(res.body).not.toContain(`${markerOf.get(id)}-`);
      }
    });
  }
);
