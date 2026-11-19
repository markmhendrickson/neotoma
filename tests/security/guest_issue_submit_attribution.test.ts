/**
 * Which account a guest issue submit is stored under.
 *
 * A submit that presents a valid guest access token is stored under the
 * account that owns the token, whether the token arrives as the access_token
 * query parameter or as a Bearer header. A submit with no token is stored under the local default user.
 *
 * Drives the real request path over a live server: POST /issues/submit.
 */
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { generateGuestAccessToken } from "../../src/services/guest_access_token.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";

let baseUrl: string;
let server: ReturnType<typeof app.listen>;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function submit(
  extraBody: Record<string, unknown>,
  headers: Record<string, string> = {},
  query = ""
): Promise<{ status: number; issueId: string }> {
  const res = await fetch(`${baseUrl}/issues/submit${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      title: `Attribution probe ${randomUUID()}`,
      body: "Attribution probe body",
      visibility: "private",
      reporter_app_version: "0.0.0-test",
      ...extraBody,
    }),
  });
  const body = (await res.json()) as { issue_entity_id?: string };
  return { status: res.status, issueId: body.issue_entity_id ?? "" };
}

async function ownerOf(entityId: string): Promise<string | null> {
  const { data } = await db.from("entities").select("user_id").eq("id", entityId).single();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

/** A guest token owned by an account other than the local default user. */
async function tokenOwnedByOtherAccount(): Promise<{ token: string; owner: string }> {
  const owner = randomUUID();
  expect(owner).not.toBe(LOCAL_DEV_USER_ID);
  const token = await generateGuestAccessToken({
    entityIds: [`ent_probe_${randomUUID().replace(/-/g, "").slice(0, 16)}`],
    userId: owner,
  });
  return { token, owner };
}

describe("guest issue submit: attribution", () => {
  it("a submit with no token is stored under the local default user", async () => {
    const res = await submit({});
    expect(res.status).toBe(200);
    expect(await ownerOf(res.issueId)).toBe(LOCAL_DEV_USER_ID);
  });

  it("a submit with a guest token in the query is stored under the token's owner", async () => {
    const { token, owner } = await tokenOwnedByOtherAccount();
    const res = await submit({}, {}, `?access_token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(await ownerOf(res.issueId)).toBe(owner);
  });

  it("a submit with a guest token as Bearer is stored under the token's owner", async () => {
    const { token, owner } = await tokenOwnedByOtherAccount();
    const res = await submit({}, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(await ownerOf(res.issueId)).toBe(owner);
  });
});
