import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { db } from "../../src/db.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

const tracker = new TestIdTracker();

/** A guest token must name the entity_ids it covers (subscription routes now
 * enforce this scope) — seed a real owned entity for the token to name. */
async function seedOwnedEntity(userId: string, idSuffix: string): Promise<string> {
  const entityId = `ent_unsub_${idSuffix}_${Date.now().toString(16)}`;
  const now = new Date().toISOString();
  await db.from("entities").insert({
    id: entityId,
    entity_type: "note",
    canonical_name: `unsub-test-${idSuffix}-${Date.now()}`,
    user_id: userId,
    created_at: now,
    updated_at: now,
  });
  return entityId;
}

interface SubscribeResponse {
  subscription_id: string;
  entity_id: string;
}

interface SubscriptionStatusResponse {
  subscription: {
    subscription_id: string;
    active: boolean;
    delivery_method: string;
  } | null;
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

async function guestTokenFor(userId: string, entityIds: string[]): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds, userId });
  tracker.trackEntity(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
  return token;
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  token: string,
  body: Record<string, unknown>,
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

async function subscribe(baseUrl: string, token: string, entityId: string): Promise<SubscribeResponse> {
  const result = await postJson<SubscribeResponse>(baseUrl, "/subscribe", token, {
    entity_ids: [entityId],
    delivery_method: "sse",
  });
  expect(result.response.status).toBe(200);
  tracker.trackEntity(result.body.entity_id);
  return result.body;
}

async function status(
  baseUrl: string,
  token: string,
  subscriptionId: string,
): Promise<SubscriptionStatusResponse> {
  const result = await postJson<SubscriptionStatusResponse>(
    baseUrl,
    "/get_subscription_status",
    token,
    { subscription_id: subscriptionId },
  );
  expect(result.response.status).toBe(200);
  return result.body;
}

describe("POST /unsubscribe", () => {
  afterEach(async () => {
    await tracker.cleanup();
  });

  it("deactivates an active subscription for its owner", async () => {
    await withHttpServer(async (baseUrl) => {
      const userId = "sp009-unsubscribe-owner";
      const entityId = await seedOwnedEntity(userId, "owner");
      tracker.trackEntity(entityId);
      const ownerToken = await guestTokenFor(userId, [entityId]);
      const created = await subscribe(baseUrl, ownerToken, entityId);

      const result = await postJson<{ success: boolean }>(baseUrl, "/unsubscribe", ownerToken, {
        subscription_id: created.subscription_id,
      });

      expect(result.response.status).toBe(200);
      expect(result.body).toEqual({ success: true });
      await expect(status(baseUrl, ownerToken, created.subscription_id)).resolves.toMatchObject({
        subscription: { active: false, delivery_method: "sse" },
      });
    });
  });

  it("denies unsubscribe attempts from a different user", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerEntityId = await seedOwnedEntity("sp009-unsubscribe-owner", "owner2");
      const otherEntityId = await seedOwnedEntity("sp009-unsubscribe-other", "other2");
      tracker.trackEntity(ownerEntityId);
      tracker.trackEntity(otherEntityId);
      const ownerToken = await guestTokenFor("sp009-unsubscribe-owner", [ownerEntityId]);
      const otherToken = await guestTokenFor("sp009-unsubscribe-other", [otherEntityId]);
      const created = await subscribe(baseUrl, ownerToken, ownerEntityId);

      const result = await postJson<Record<string, unknown>>(baseUrl, "/unsubscribe", otherToken, {
        subscription_id: created.subscription_id,
      });

      expect(result.response.status).toBeGreaterThanOrEqual(400);
      await expect(status(baseUrl, ownerToken, created.subscription_id)).resolves.toMatchObject({
        subscription: { active: true },
      });
    });
  });

  it("keeps already-deactivated subscriptions inactive on repeated unsubscribe", async () => {
    await withHttpServer(async (baseUrl) => {
      const userId = "sp009-unsubscribe-repeat";
      const entityId = await seedOwnedEntity(userId, "repeat");
      tracker.trackEntity(entityId);
      const ownerToken = await guestTokenFor(userId, [entityId]);
      const created = await subscribe(baseUrl, ownerToken, entityId);

      const first = await postJson<{ success: boolean }>(baseUrl, "/unsubscribe", ownerToken, {
        subscription_id: created.subscription_id,
      });
      const second = await postJson<{ success: boolean }>(baseUrl, "/unsubscribe", ownerToken, {
        subscription_id: created.subscription_id,
      });

      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      await expect(status(baseUrl, ownerToken, created.subscription_id)).resolves.toMatchObject({
        subscription: { active: false },
      });
    });
  });
});
