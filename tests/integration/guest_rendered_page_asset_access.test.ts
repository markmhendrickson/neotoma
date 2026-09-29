/**
 * neotoma#1696: a rendered_page guest token may read ONLY the source assets
 * that page embeds (`/sources/<id>/content`), read-only, never anything else.
 */
import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app, isSourceContentPath, routeAcceptsGuestPrincipal } from "../../src/actions.js";
import { db } from "../../src/db.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { textReferencesSourceContent } from "../../src/services/rendered_page/asset_access.js";
import { storeRawContent } from "../../src/services/raw_storage.js";

import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";

// Loopback requests without a Bearer resolve to the local dev user, which owns
// every fixture below (pages via POST /store, sources, tokens).
const OWNER = LOCAL_DEV_USER_ID;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

describe("guest rendered_page token -> embedded asset access (#1696)", () => {
  let server: Server;
  let base: string;
  const sourceIds: string[] = [];
  const entityIds: string[] = [];
  let embeddedSource: string;
  let otherSource: string;
  let htmlSource: string;
  let pageId: string;
  let otherPageId: string;
  let pageToken: string;
  let otherPageToken: string;

  async function seedSource(buf: Buffer, mime: string, name: string): Promise<string> {
    const r = await storeRawContent({
      userId: OWNER,
      fileBuffer: buf,
      mimeType: mime,
      originalFilename: name,
      provenance: {},
    } as never);
    sourceIds.push(r.sourceId);
    // Test processes skip the raw upload; put the bytes where the route reads them.
    const { data: row } = await db.from("sources").select("storage_url").eq("id", r.sourceId).single();
    const { error } = await db.storage
      .from("sources")
      .upload(row!.storage_url as string, buf, { contentType: mime, upsert: true });
    expect(error).toBeNull();
    return r.sourceId;
  }

  async function seedPage(
    html: string,
    title = `guest-asset-page-${Math.random().toString(36).slice(2)}`
  ): Promise<string> {
    const resp = await fetch(`${base}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: OWNER,
        idempotency_key: `guest-asset-page-${Math.random().toString(36).slice(2)}`,
        entities: [{ entity_type: "rendered_page", title, html_body: html }],
      }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { entities?: Array<{ entity_id: string }> };
    const id = body.entities![0].entity_id;
    entityIds.push(id);
    return id;
  }

  async function mint(ids: string[]): Promise<string> {
    const t = await generateGuestAccessToken({ entityIds: ids, userId: OWNER });
    entityIds.push(`guest_token_${hashGuestAccessToken(t).slice(0, 16)}`);
    return t;
  }

  let prevPolicy: string | undefined;

  beforeAll(async () => {
    // Mirrors the seeded rendered_page schema policy (guest_access_policy).
    prevPolicy = process.env.NEOTOMA_ACCESS_POLICY_RENDERED_PAGE;
    process.env.NEOTOMA_ACCESS_POLICY_RENDERED_PAGE = "submitter_scoped";
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

    embeddedSource = await seedSource(PNG, "image/png", "fig-embedded.png");
    otherSource = await seedSource(Buffer.concat([PNG, Buffer.from("x")]), "image/png", "other.png");
    htmlSource = await seedSource(Buffer.from("<script>1</script>"), "text/html", "x.html");

    pageId = await seedPage(
      `<img src="/sources/${embeddedSource}/content?access_token=T"><a href="/sources/${htmlSource}/content">d</a>`
    );
    otherPageId = await seedPage(`<p>no assets</p>`);
    pageToken = await mint([pageId]);
    otherPageToken = await mint([otherPageId]);
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    if (prevPolicy === undefined) delete process.env.NEOTOMA_ACCESS_POLICY_RENDERED_PAGE;
    else process.env.NEOTOMA_ACCESS_POLICY_RENDERED_PAGE = prevPolicy;
    if (sourceIds.length) {
      await db.from("observations").delete().in("source_id", sourceIds);
      await db.from("sources").delete().in("id", sourceIds);
    }
    for (const id of entityIds) {
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  it("serves an embedded source to the page's guest token (200, inline, right type)", async () => {
    const r = await fetch(`${base}/sources/${embeddedSource}/content?access_token=${pageToken}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("content-disposition")).toMatch(/^inline/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("401s for a source the page does not reference", async () => {
    const r = await fetch(`${base}/sources/${otherSource}/content?access_token=${pageToken}`);
    expect(r.status).toBe(401);
  });

  it("401s when a different page's token requests this page's asset", async () => {
    const r = await fetch(`${base}/sources/${embeddedSource}/content?access_token=${otherPageToken}`);
    expect(r.status).toBe(401);
  });

  it("401s for a bogus token", async () => {
    const r = await fetch(`${base}/sources/${embeddedSource}/content?access_token=nope`);
    expect(r.status).toBe(401);
  });

  it("never renders active content inline for guests (html forced to attachment)", async () => {
    const r = await fetch(`${base}/sources/${htmlSource}/content?access_token=${pageToken}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(r.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("does not open other source routes or writes to the guest token", async () => {
    // Loopback requests are locally trusted regardless of token, so the
    // route-eligibility predicate is the authoritative check that a guest
    // principal is never stamped on any other source route or on writes.
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(routeAcceptsGuestPrincipal({ method, path: `/sources/${embeddedSource}/content` })).toBe(false);
    }
    expect(routeAcceptsGuestPrincipal({ method: "GET", path: `/sources/${embeddedSource}/relationships` })).toBe(false);
    expect(routeAcceptsGuestPrincipal({ method: "GET", path: `/sources/${embeddedSource}/content/extra` })).toBe(false);
    expect(routeAcceptsGuestPrincipal({ method: "GET", path: "/sources" })).toBe(false);
    expect(routeAcceptsGuestPrincipal({ method: "GET", path: `/sources/${embeddedSource}` })).toBe(false);
    expect(routeAcceptsGuestPrincipal({ method: "POST", path: `/sources/${embeddedSource}/content` })).toBe(false);
    expect(isSourceContentPath(`/sources/${embeddedSource}/content`)).toBe(true);
  });

  it("stops serving an asset once the page no longer references it (no stale scope)", async () => {
    const title = `guest-asset-edit-${Math.random().toString(36).slice(2)}`;
    const pid = await seedPage(`<img src="/sources/${embeddedSource}/content">`, title);
    const tok = await mint([pid]);
    expect(
      (await fetch(`${base}/sources/${embeddedSource}/content?access_token=${tok}`)).status
    ).toBe(200);
    // Same title resolves to the same entity; the new observation replaces html_body.
    expect(await seedPage("<p>removed</p>", title)).toBe(pid);
    expect(
      (await fetch(`${base}/sources/${embeddedSource}/content?access_token=${tok}`)).status
    ).toBe(401);
  });

  it("denies assets when the operator policy closes guest reads of rendered_page", async () => {
    process.env.NEOTOMA_ACCESS_POLICY_RENDERED_PAGE = "closed";
    try {
      const r = await fetch(`${base}/sources/${embeddedSource}/content?access_token=${pageToken}`);
      expect(r.status).toBe(401);
    } finally {
      process.env.NEOTOMA_ACCESS_POLICY_RENDERED_PAGE = "submitter_scoped";
    }
  });

  it("serves the page under a CSP that allows same-origin media only", async () => {
    const r = await fetch(`${base}/entities/${pageId}/html?access_token=${pageToken}`);
    expect(r.status).toBe(200);
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("media-src 'self'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("default-src 'none'");
  });
});

describe("textReferencesSourceContent", () => {
  it("matches whole ids only", () => {
    expect(textReferencesSourceContent('<img src="/sources/abc/content?x=1">', "abc")).toBe(true);
    expect(textReferencesSourceContent('<img src="/sources/abcd/content">', "abc")).toBe(false);
    expect(textReferencesSourceContent('<img src="/sources/abc/contentX">', "abc")).toBe(false);
    expect(textReferencesSourceContent('<img src="/sources/xabc/content">', "abc")).toBe(false);
    expect(textReferencesSourceContent("", "abc")).toBe(false);
  });
});
