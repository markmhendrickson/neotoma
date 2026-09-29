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
import { NeotomaServer } from "../../src/server.js";
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

interface ToolResponse {
  content: Array<{ text: string }>;
}

interface ErrorEnvelope {
  error_code: string;
  message: string;
}

interface SubscriptionToolSurface {
  handleSubscribe(args: unknown, userId: string): Promise<ToolResponse>;
  handleUnsubscribe(args: unknown, userId: string): Promise<ToolResponse>;
  handleListSubscriptions(userId: string): Promise<ToolResponse>;
  handleGetSubscriptionStatus(args: unknown, userId: string): Promise<ToolResponse>;
}

function subscriptionTools(server: NeotomaServer): SubscriptionToolSurface {
  return server as unknown as SubscriptionToolSurface;
}

function parseToolResponse<T>(response: ToolResponse): T {
  return JSON.parse(response.content[0]!.text) as T;
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

  it("agent-facing evaluation preserves the full in-grant lifecycle and denies empty or mixed scopes without effects", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerId = `test-owner-scope-${randomUUID()}`;
      const grantedEntity = await seedOwnedEntity(ownerId, "evaluation-granted");
      const ungrantedEntity = await seedOwnedEntity(ownerId, "evaluation-ungranted");
      const guestToken = await guestTokenScopedTo(ownerId, [grantedEntity]);

      const created = await subscribeAs(baseUrl, guestToken, ownerId, {
        entity_ids: [grantedEntity],
        delivery_method: "sse",
      });
      const listed = await postJson<ListSubscriptionsResponse>(
        baseUrl,
        "/list_subscriptions",
        guestToken,
        {}
      );
      expect(listed.body.subscriptions.map((row) => row.subscription_id)).toContain(
        created.subscription_id
      );
      const status = await postJson<{ subscription: ListedSubscription | null }>(
        baseUrl,
        "/get_subscription_status",
        guestToken,
        { subscription_id: created.subscription_id }
      );
      expect(status.body.subscription?.subscription_id).toBe(created.subscription_id);

      for (const entity_ids of [[], [ungrantedEntity], [grantedEntity, ungrantedEntity]]) {
        const denied = await postJson<ErrorEnvelope & Partial<SubscribeResponse>>(
          baseUrl,
          "/subscribe",
          guestToken,
          { entity_ids, delivery_method: "sse" }
        );
        expect(denied.response.status).toBe(403);
        expect(denied.body).toMatchObject({ error_code: "FORBIDDEN" });
      }

      const afterDenials = await postJson<ListSubscriptionsResponse>(
        baseUrl,
        "/list_subscriptions",
        guestToken,
        {}
      );
      expect(afterDenials.body.subscriptions.map((row) => row.subscription_id)).toEqual([
        created.subscription_id,
      ]);

      const unsubscribed = await postJson<{ success: boolean }>(
        baseUrl,
        "/unsubscribe",
        guestToken,
        { subscription_id: created.subscription_id }
      );
      expect(unsubscribed.response.status).toBe(200);
      expect(unsubscribed.body.success).toBe(true);
    });
  });

  it("a guest scoped to one entity cannot list subscriptions outside its entity grant", async () => {
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
      // Regression target: resolving both tokens to the same account user_id
      // must not widen the guest's own entity_ids scope.
      expect(visibleIds).not.toContain(ownerOnlySub.subscription_id);
    });
  });

  it("a guest scoped to one entity cannot create a subscription over unrelated entity_ids", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerId = `test-owner-scope-${randomUUID()}`;
      const scopedEntity = await seedOwnedEntity(ownerId, "scoped2");
      const unrelatedEntity = await seedOwnedEntity(ownerId, "unrelated2");

      const guestToken = await guestTokenScopedTo(ownerId, [scopedEntity]);

      // The guest's token names only `scopedEntity`, so a subscribe request
      // naming a DIFFERENT entity_id it was never granted should be refused.
      const result = await postJson<ErrorEnvelope & Partial<SubscribeResponse>>(
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
      // Regression target: same-owner membership is insufficient when the
      // guest token itself does not name the requested entity.
      expect(result.response.status).toBe(403);
      expect(result.body).toMatchObject({ error_code: "FORBIDDEN" });

      const listed = await postJson<ListSubscriptionsResponse>(
        baseUrl,
        "/list_subscriptions",
        guestToken,
        {}
      );
      expect(listed.body.subscriptions).toHaveLength(0);
    });
  });

  it("a guest scoped to one entity cannot cancel a subscription outside that scope", async () => {
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
      const result = await postJson<ErrorEnvelope & { success?: boolean }>(
        baseUrl,
        "/unsubscribe",
        guestToken,
        { subscription_id: ownerOnlySub.subscription_id }
      );

      // Regression target: matching the subscription's owning user_id must
      // not replace the guest token's narrower entity grant.
      expect(result.response.status).toBe(403);
      expect(result.body).toMatchObject({ error_code: "FORBIDDEN" });

      const preserved = await postJson<{ subscription: ListedSubscription | null }>(
        baseUrl,
        "/get_subscription_status",
        ownerOnlyToken,
        { subscription_id: ownerOnlySub.subscription_id }
      );
      expect(preserved.body.subscription).toMatchObject({
        subscription_id: ownerOnlySub.subscription_id,
        active: true,
      });
    });
  });

  it("refuses a mixed subscription on every guest HTTP read/write surface while its MCP owner retains access", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerId = `test-owner-scope-${randomUUID()}`;
      const grantedEntity = await seedOwnedEntity(ownerId, "mixed-granted");
      const ungrantedEntity = await seedOwnedEntity(ownerId, "mixed-ungranted");

      // The authenticated MCP owner may create a subscription spanning both
      // of its entities. This is the natural MCP call shape and protects the
      // owner-level contract while the guest HTTP surfaces are narrowed.
      const server = new NeotomaServer();
      const tools = subscriptionTools(server);
      const created = parseToolResponse<SubscribeResponse>(
        await tools.handleSubscribe(
          {
            entity_ids: [grantedEntity, ungrantedEntity],
            delivery_method: "sse",
          },
          ownerId
        )
      );
      tracker.trackEntity(created.entity_id);

      const ownerStatus = parseToolResponse<{ subscription: ListedSubscription | null }>(
        await tools.handleGetSubscriptionStatus(
          { subscription_id: created.subscription_id },
          ownerId
        )
      );
      expect(ownerStatus.subscription?.subscription_id).toBe(created.subscription_id);

      // A token that names only one member of a mixed subscription must not
      // gain authority over the other member by set intersection.
      const guestToken = await guestTokenScopedTo(ownerId, [grantedEntity]);

      const listed = await postJson<ListSubscriptionsResponse>(
        baseUrl,
        "/list_subscriptions",
        guestToken,
        {}
      );
      expect(listed.response.status).toBe(200);
      expect(listed.body.subscriptions.map((row) => row.subscription_id)).not.toContain(
        created.subscription_id
      );

      const status = await postJson<{ subscription: ListedSubscription | null }>(
        baseUrl,
        "/get_subscription_status",
        guestToken,
        { subscription_id: created.subscription_id }
      );
      expect(status.response.status).toBe(200);
      expect(status.body.subscription).toBeNull();

      const unsubscribe = await postJson<ErrorEnvelope & { success?: boolean }>(
        baseUrl,
        "/unsubscribe",
        guestToken,
        { subscription_id: created.subscription_id }
      );
      expect(unsubscribe.response.status).toBe(403);
      expect(unsubscribe.body).toMatchObject({ error_code: "FORBIDDEN" });

      const preservedStatus = parseToolResponse<{ subscription: ListedSubscription | null }>(
        await tools.handleGetSubscriptionStatus(
          { subscription_id: created.subscription_id },
          ownerId
        )
      );
      expect(preservedStatus.subscription).toMatchObject({
        subscription_id: created.subscription_id,
        active: true,
      });

      const stream = await fetch(
        `${baseUrl}/events/stream?subscription_id=${encodeURIComponent(created.subscription_id)}`,
        { headers: { Authorization: `Bearer ${guestToken}` } }
      );
      expect(stream.status).toBe(404);

      const ownerList = parseToolResponse<ListSubscriptionsResponse>(
        await tools.handleListSubscriptions(ownerId)
      );
      expect(ownerList.subscriptions.map((row) => row.subscription_id)).toContain(
        created.subscription_id
      );

      const ownerUnsubscribe = parseToolResponse<{ success: boolean }>(
        await tools.handleUnsubscribe({ subscription_id: created.subscription_id }, ownerId)
      );
      expect(ownerUnsubscribe.success).toBe(true);
    });
  });

  it("refuses guest webhook and peer-sync subscriptions that would outlive the guest credential", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerId = `test-owner-scope-${randomUUID()}`;
      const grantedEntity = await seedOwnedEntity(ownerId, "delivery-granted");
      const guestToken = await guestTokenScopedTo(ownerId, [grantedEntity]);

      const deniedBodies: Record<string, unknown>[] = [
        {
          entity_ids: [grantedEntity],
          delivery_method: "webhook",
          webhook_url: "http://127.0.0.1:9/guest-webhook-test",
        },
        {
          entity_ids: [grantedEntity],
          delivery_method: "sse",
          sync_peer_id: "peer-guest-test",
        },
      ];
      for (const body of deniedBodies) {
        const denied = await postJson<ErrorEnvelope & Partial<SubscribeResponse>>(
          baseUrl,
          "/subscribe",
          guestToken,
          body
        );
        expect(denied.response.status).toBe(403);
        expect(denied.body).toMatchObject({ error_code: "FORBIDDEN" });
        if (denied.body.entity_id) tracker.trackEntity(denied.body.entity_id);
      }

      // Nothing was written: the guest (and its owner) hold no subscription.
      const listed = await postJson<ListSubscriptionsResponse>(
        baseUrl,
        "/list_subscriptions",
        guestToken,
        {}
      );
      expect(listed.body.subscriptions).toEqual([]);
      const server = new NeotomaServer();
      const ownerList = parseToolResponse<ListSubscriptionsResponse>(
        await subscriptionTools(server).handleListSubscriptions(ownerId)
      );
      expect(ownerList.subscriptions).toEqual([]);

      // The same guest may still create the SSE subscription, which is
      // revalidated against the credential on every delivery.
      const created = await subscribeAs(baseUrl, guestToken, ownerId, {
        entity_ids: [grantedEntity],
        delivery_method: "sse",
      });
      expect(created.subscription_id).toBeTruthy();
    });
  });
});
