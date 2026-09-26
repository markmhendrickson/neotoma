/**
 * Integration test: a guest token is scoped to the specific entity_ids it was
 * issued for (see `generateGuestAccessToken` / `tokenGrantsAccessTo` in
 * src/services/guest_access_token.ts) — but the subscription and event-stream
 * routes never apply that scope. They resolve the token to its owning
 * account's `user_id` (`resolveGuestUserId`) and then hand that account's
 * full subscription surface to the guest: every existing subscription
 * (`/list_subscriptions`, `/get_subscription_status`), the ability to create
 * or cancel subscriptions over entity_types/entity_ids the token was never
 * issued for (`/subscribe`, `/unsubscribe`), and an event stream that is not
 * limited to the entities the token covers (`/events/stream`).
 *
 * This is a narrower and separate defect from cross-owner isolation (already
 * covered by tests/integration/guest_token_isolation.test.ts and
 * tests/integration/subscription_list.test.ts, which use tokens with an
 * empty entity_ids scope and only check owner-vs-owner separation). Here the
 * token owner is a single account; the guest itself should be confined to
 * the entities its own token names, not the rest of that account's graph.
 */

import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { db } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

const tracker = new TestIdTracker();

interface SubscribeResponse {
  subscription_id: string;
  entity_id: string;
  webhook_secret?: string;
}

interface ListedSubscription {
  entity_id: string;
  user_id: string;
  subscription_id: string;
  delivery_method: "webhook" | "sse";
  active: boolean;
}

interface ListSubscriptionsResponse {
  subscriptions: ListedSubscription[];
}

async function withHttpServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind to a TCP port");
  }
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function seedOwnedEntity(userId: string, idSuffix: string): Promise<string> {
  const entityId = `ent_scope_${idSuffix}_${Date.now().toString(16)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id: entityId,
    entity_type: "issue",
    canonical_name: `owner-scope-test-${idSuffix}-${Date.now()}`,
    user_id: userId,
    created_at: now,
    updated_at: now,
  });
  tracker.trackEntity(entityId);
  return entityId;
}

/** A guest token minted for ONE named entity only — the scope it should carry. */
async function guestTokenScopedTo(userId: string, entityIds: string[]): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds, userId });
  tracker.trackEntity(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
  return token;
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  token: string,
  body: Record<string, unknown>
): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, body: (await response.json()) as T };
}

async function subscribeAs(
  baseUrl: string,
  token: string,
  ownerUserId: string,
  body: Record<string, unknown>
): Promise<SubscribeResponse> {
  const result = await postJson<SubscribeResponse>(baseUrl, "/subscribe", token, body);
  expect(result.response.status).toBe(200);
  tracker.trackEntity(result.body.entity_id);
  return result.body;
}

describe("guest subscription routes must not escalate to the token owner's whole graph", () => {
  afterEach(async () => {
    await tracker.cleanup();
  });

  it("a guest scoped to one entity can still list every subscription the account owns (defect)", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerId = `test-owner-scope-${randomUUID()}`;
      const scopedEntity = await seedOwnedEntity(ownerId, "scoped");
      const unrelatedEntity = await seedOwnedEntity(ownerId, "unrelated");

      // The account itself creates a subscription unrelated to the guest's
      // narrow grant (e.g. a personal webhook the operator set up).
      const ownerOnlyToken = await guestTokenScopedTo(ownerId, [unrelatedEntity]);
      const ownerOnlySub = await subscribeAs(baseUrl, ownerOnlyToken, ownerId, {
        entity_ids: [unrelatedEntity],
        delivery_method: "sse",
      });

      // A guest holding a token that names ONLY `scopedEntity` should never be
      // able to enumerate a subscription tied to `unrelatedEntity`, or any
      // other subscription belonging to the same account that the token does
      // not name.
      const guestToken = await guestTokenScopedTo(ownerId, [scopedEntity]);
      const { response, body } = await postJson<ListSubscriptionsResponse>(
        baseUrl,
        "/list_subscriptions",
        guestToken,
        {}
      );
      expect(response.status).toBe(200);

      const visibleIds = body.subscriptions.map((s) => s.subscription_id);
      // FIX TARGET: today this includes ownerOnlySub because both tokens
      // resolve to the same account's user_id and the route never narrows to
      // the guest's own entity_ids scope.
      expect(visibleIds).not.toContain(ownerOnlySub.subscription_id);
    });
  });

  it("a guest scoped to one entity cannot create a subscription over unrelated entity_ids (defect)", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerId = `test-owner-scope-${randomUUID()}`;
      const scopedEntity = await seedOwnedEntity(ownerId, "scoped2");
      const unrelatedEntity = await seedOwnedEntity(ownerId, "unrelated2");

      const guestToken = await guestTokenScopedTo(ownerId, [scopedEntity]);

      // The guest's token names only `scopedEntity`, so a subscribe request
      // naming a DIFFERENT entity_id it was never granted should be refused.
      const result = await postJson<{ error?: unknown } & Partial<SubscribeResponse>>(
        baseUrl,
        "/subscribe",
        guestToken,
        {
          entity_ids: [unrelatedEntity],
          delivery_method: "sse",
        }
      );

      if (result.response.ok && result.body.entity_id) {
        tracker.trackEntity(result.body.entity_id);
      }
      // FIX TARGET: today this succeeds (200) because the route only checks
      // that `unrelatedEntity` belongs to the SAME owner as the token, not
      // that the token itself names it.
      expect(result.response.status).toBeGreaterThanOrEqual(400);
    });
  });

  it("a guest scoped to one entity cannot cancel a subscription outside that scope (defect)", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerId = `test-owner-scope-${randomUUID()}`;
      const scopedEntity = await seedOwnedEntity(ownerId, "scoped3");
      const unrelatedEntity = await seedOwnedEntity(ownerId, "unrelated3");

      const ownerOnlyToken = await guestTokenScopedTo(ownerId, [unrelatedEntity]);
      const ownerOnlySub = await subscribeAs(baseUrl, ownerOnlyToken, ownerId, {
        entity_ids: [unrelatedEntity],
        delivery_method: "sse",
      });

      const guestToken = await guestTokenScopedTo(ownerId, [scopedEntity]);
      const result = await postJson<{ success?: boolean }>(baseUrl, "/unsubscribe", guestToken, {
        subscription_id: ownerOnlySub.subscription_id,
      });

      // FIX TARGET: today this succeeds because `unsubscribeUser` only checks
      // that the subscription's owning `user_id` matches the resolved
      // account, and the resolved account is the whole owner, not the
      // guest's own narrower grant.
      expect(result.response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
