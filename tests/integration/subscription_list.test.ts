import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
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
  webhook_url?: string;
  webhook_secret?: string;
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

async function guestTokenFor(userId: string): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds: [], userId });
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

async function subscribe(
  baseUrl: string,
  token: string,
  body: Record<string, unknown>,
): Promise<SubscribeResponse> {
  const result = await postJson<SubscribeResponse>(baseUrl, "/subscribe", token, body);
  expect(result.response.status).toBe(200);
  tracker.trackEntity(result.body.entity_id);
  return result.body;
}

async function list(baseUrl: string, token: string): Promise<ListSubscriptionsResponse> {
  const result = await postJson<ListSubscriptionsResponse>(baseUrl, "/list_subscriptions", token, {});
  expect(result.response.status).toBe(200);
  return result.body;
}

describe("POST /list_subscriptions", () => {
  afterEach(async () => {
    await tracker.cleanup();
  });

  it("lists subscriptions for the requesting user", async () => {
    await withHttpServer(async (baseUrl) => {
      const token = await guestTokenFor("sp009-list-owner");
      const created = await subscribe(baseUrl, token, {
        entity_types: ["task"],
        delivery_method: "sse",
      });

      const body = await list(baseUrl, token);
      const row = body.subscriptions.find((sub) => sub.subscription_id === created.subscription_id);

      expect(row).toMatchObject({
        subscription_id: created.subscription_id,
        user_id: "sp009-list-owner",
        delivery_method: "sse",
        active: true,
      });
    });
  });

  it("isolates subscription lists across users", async () => {
    await withHttpServer(async (baseUrl) => {
      const ownerToken = await guestTokenFor("sp009-list-owner");
      const otherToken = await guestTokenFor("sp009-list-other");
      const ownerSub = await subscribe(baseUrl, ownerToken, {
        entity_types: ["note"],
        delivery_method: "sse",
      });
      const otherSub = await subscribe(baseUrl, otherToken, {
        event_types: ["entity.created"],
        delivery_method: "sse",
      });

      const ownerRows = (await list(baseUrl, ownerToken)).subscriptions;
      const otherRows = (await list(baseUrl, otherToken)).subscriptions;

      expect(ownerRows.map((row) => row.subscription_id)).toContain(ownerSub.subscription_id);
      expect(ownerRows.map((row) => row.subscription_id)).not.toContain(otherSub.subscription_id);
      expect(otherRows.map((row) => row.subscription_id)).toContain(otherSub.subscription_id);
      expect(otherRows.map((row) => row.subscription_id)).not.toContain(ownerSub.subscription_id);
    });
  });

  it("redacts webhook secrets from client-facing rows", async () => {
    await withHttpServer(async (baseUrl) => {
      const token = await guestTokenFor("sp009-list-redact");
      const created = await subscribe(baseUrl, token, {
        entity_types: ["contact"],
        delivery_method: "webhook",
        webhook_url: "http://127.0.0.1:9/subscription-list-test",
        webhook_secret: "super-secret-test-value",
      });
      expect(created.webhook_secret).toBe("super-secret-test-value");

      const body = await list(baseUrl, token);
      const row = body.subscriptions.find((sub) => sub.subscription_id === created.subscription_id);

      expect(row).toMatchObject({
        subscription_id: created.subscription_id,
        delivery_method: "webhook",
        webhook_url: "http://127.0.0.1:9/subscription-list-test",
      });
      expect(row).not.toHaveProperty("webhook_secret");
    });
  });
});
