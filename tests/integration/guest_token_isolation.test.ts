/**
 * Integration test: guest token userId isolation (defect 1.2 regression).
 *
 * Before the fix, every guest-capable handler resolved userId via
 * `(req as any).authenticatedUserId ?? ensureLocalDevUser().id`.
 * Since `stampGuestPrincipal` never sets `authenticatedUserId`, all guest
 * writes silently collapsed onto the local dev user — breaking tenant
 * isolation in hosted/multi-user deployments.
 *
 * After the fix, `resolveGuestUserId` derives userId from the validated
 * guest access token entity's `user_id` (the owner who generated the token).
 * This test exercises that path and verifies cross-user isolation.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db.js";
import { resolveGuestUserId } from "../../src/actions.js";
import { generateGuestAccessToken, hashGuestAccessToken } from "../../src/services/guest_access_token.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import {
  subscribeUser,
  listSubscriptionsForUser,
  unsubscribeUser,
} from "../../src/services/subscriptions/subscription_actions.js";

const USER_A_ID = `test-user-a-${Date.now()}`;
const USER_B_ID = `test-user-b-${Date.now()}`;

function makeGuestPrincipal(accessToken: string) {
  return {
    kind: "guest" as const,
    guestId: {
      thumbprint: undefined,
      sub: undefined,
      iss: undefined,
      accessToken,
    },
    agentIdentity: null,
    accessToken,
  };
}

function makeMockRequest(opts: {
  accessToken?: string;
  isLocal?: boolean;
  hasBearerToken?: boolean;
}) {
  return {
    headers: {
      authorization: opts.hasBearerToken ? "Bearer fake-token" : "",
    },
    socket: {
      remoteAddress: opts.isLocal !== false ? "127.0.0.1" : "203.0.113.42",
    },
  } as any;
}

describe("resolveGuestUserId — token-grant userId derivation", () => {
  let tokenA: string;
  let tokenB: string;
  const entityIdA = `ent_isolation_a_${Date.now().toString(16)}`;
  const entityIdB = `ent_isolation_b_${Date.now().toString(16)}`;

  beforeAll(async () => {
    const now = new Date().toISOString();
    await db.from("entities").insert({
      id: entityIdA,
      entity_type: "issue",
      canonical_name: `isolation-test-a-${Date.now()}`,
      user_id: USER_A_ID,
      created_at: now,
      updated_at: now,
    });
    await db.from("entities").insert({
      id: entityIdB,
      entity_type: "issue",
      canonical_name: `isolation-test-b-${Date.now()}`,
      user_id: USER_B_ID,
      created_at: now,
      updated_at: now,
    });

    tokenA = await generateGuestAccessToken({
      entityIds: [entityIdA],
      userId: USER_A_ID,
    });
    tokenB = await generateGuestAccessToken({
      entityIds: [entityIdB],
      userId: USER_B_ID,
    });
  });

  afterAll(async () => {
    const tokenHashA = hashGuestAccessToken(tokenA);
    const tokenHashB = hashGuestAccessToken(tokenB);
    const tokenEntityIdA = `guest_token_${tokenHashA.slice(0, 16)}`;
    const tokenEntityIdB = `guest_token_${tokenHashB.slice(0, 16)}`;
    for (const id of [entityIdA, entityIdB, tokenEntityIdA, tokenEntityIdB]) {
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  it("returns user A's userId for token A, not LOCAL_DEV_USER_ID", async () => {
    const principal = makeGuestPrincipal(tokenA);
    const req = makeMockRequest({ accessToken: tokenA, isLocal: true });
    const userId = await resolveGuestUserId(req, principal);
    expect(userId).toBe(USER_A_ID);
    expect(userId).not.toBe(LOCAL_DEV_USER_ID);
  });

  it("returns user B's userId for token B, not LOCAL_DEV_USER_ID", async () => {
    const principal = makeGuestPrincipal(tokenB);
    const req = makeMockRequest({ accessToken: tokenB, isLocal: true });
    const userId = await resolveGuestUserId(req, principal);
    expect(userId).toBe(USER_B_ID);
    expect(userId).not.toBe(LOCAL_DEV_USER_ID);
  });

  it("returns null for a non-guest principal", async () => {
    const userPrincipal = { kind: "user" as const, userId: USER_A_ID };
    const req = makeMockRequest({ isLocal: true });
    const userId = await resolveGuestUserId(req, userPrincipal);
    expect(userId).toBeNull();
  });

  it("falls back to local dev user for local request with unknown token", async () => {
    const principal = makeGuestPrincipal(randomUUID());
    const req = makeMockRequest({ isLocal: true });
    const userId = await resolveGuestUserId(req, principal);
    expect(userId).toBe(LOCAL_DEV_USER_ID);
  });

  it("throws for remote request with unknown token", async () => {
    const principal = makeGuestPrincipal(randomUUID());
    const req = makeMockRequest({ isLocal: false, hasBearerToken: true });
    await expect(resolveGuestUserId(req, principal)).rejects.toThrow(
      /cannot resolve a user_id/,
    );
  });
});

describe("subscription cross-user isolation via guest tokens", () => {
  let tokenA: string;
  let tokenB: string;
  let subscriptionIdA: string;
  const entityIdA = `ent_sub_iso_a_${Date.now().toString(16)}`;
  const entityIdB = `ent_sub_iso_b_${Date.now().toString(16)}`;

  beforeAll(async () => {
    const now = new Date().toISOString();
    await db.from("entities").insert({
      id: entityIdA,
      entity_type: "issue",
      canonical_name: `sub-isolation-a-${Date.now()}`,
      user_id: USER_A_ID,
      created_at: now,
      updated_at: now,
    });
    await db.from("entities").insert({
      id: entityIdB,
      entity_type: "issue",
      canonical_name: `sub-isolation-b-${Date.now()}`,
      user_id: USER_B_ID,
      created_at: now,
      updated_at: now,
    });
    tokenA = await generateGuestAccessToken({
      entityIds: [entityIdA],
      userId: USER_A_ID,
    });
    tokenB = await generateGuestAccessToken({
      entityIds: [entityIdB],
      userId: USER_B_ID,
    });
  });

  afterAll(async () => {
    const tokenHashA = hashGuestAccessToken(tokenA);
    const tokenHashB = hashGuestAccessToken(tokenB);
    const tokenEntityIdA = `guest_token_${tokenHashA.slice(0, 16)}`;
    const tokenEntityIdB = `guest_token_${tokenHashB.slice(0, 16)}`;
    for (const id of [entityIdA, entityIdB, tokenEntityIdA, tokenEntityIdB]) {
      await db.from("observations").delete().eq("entity_id", id);
      await db.from("entity_snapshots").delete().eq("entity_id", id);
      await db.from("entities").delete().eq("id", id);
    }
  });

  it("user A can subscribe and the subscription is scoped to user A", async () => {
    const result = await subscribeUser({
      userId: USER_A_ID,
      input: {
        entity_types: ["issue"],
        delivery_method: "sse",
      },
    });
    subscriptionIdA = result.subscription_id;
    expect(subscriptionIdA).toBeTruthy();

    const userAList = await listSubscriptionsForUser(USER_A_ID);
    const found = userAList.find((s) => s.subscription_id === subscriptionIdA);
    expect(found).toBeTruthy();
  });

  it("user B cannot see user A's subscription", async () => {
    const userBList = await listSubscriptionsForUser(USER_B_ID);
    const found = userBList.find((s) => s.subscription_id === subscriptionIdA);
    expect(found).toBeUndefined();
  });

  it("user B cannot unsubscribe user A's subscription", async () => {
    await expect(
      unsubscribeUser({ userId: USER_B_ID, subscription_id: subscriptionIdA }),
    ).rejects.toThrow(/not found/i);
  });

  it("user A can unsubscribe their own subscription", async () => {
    await unsubscribeUser({ userId: USER_A_ID, subscription_id: subscriptionIdA });
    const userAList = await listSubscriptionsForUser(USER_A_ID);
    const found = userAList.find(
      (s) => s.subscription_id === subscriptionIdA && s.active,
    );
    expect(found).toBeUndefined();
  });
});
