import { createServer, type Server } from "node:http";

import { describe, expect, it } from "vitest";

import { app } from "../../src/actions.js";

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

/**
 * Guest-accepting routes check the presented token and answer an invalid one
 * with 401 GUEST_TOKEN_INVALID. Routes that validate their request body first
 * would answer an empty body with 400, so these cases send the smallest valid
 * body and reach the token check. A route that does not accept guest tokens
 * keeps the general invalid-credential answer.
 */
const GUEST_TOKEN_INVALID_MESSAGE_TEXT =
  "This link is not valid or has expired. Ask the sender for a new link.";

const INVALID_BEARER_ROUTES: ReadonlyArray<{
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  expectedCode: "GUEST_TOKEN_INVALID" | "AUTH_INVALID";
}> = [
  {
    method: "GET",
    path: "/entities/duplicates?entity_type=note",
    expectedCode: "AUTH_INVALID",
  },
  {
    method: "GET",
    path: "/events/stream?subscription_id=probe-subscription",
    expectedCode: "GUEST_TOKEN_INVALID",
  },
  {
    method: "POST",
    path: "/get_subscription_status",
    body: { subscription_id: "probe-subscription" },
    expectedCode: "GUEST_TOKEN_INVALID",
  },
  {
    method: "POST",
    path: "/issues/add_message",
    body: { entity_id: "probe-entity", body: "probe" },
    expectedCode: "GUEST_TOKEN_INVALID",
  },
  {
    method: "POST",
    path: "/issues/status",
    body: { entity_id: "probe-entity" },
    expectedCode: "GUEST_TOKEN_INVALID",
  },
  {
    method: "POST",
    path: "/issues/submit",
    body: { title: "probe", body: "probe" },
    expectedCode: "GUEST_TOKEN_INVALID",
  },
  { method: "POST", path: "/list_subscriptions", body: {}, expectedCode: "GUEST_TOKEN_INVALID" },
  {
    method: "POST",
    path: "/subscribe",
    body: { entity_ids: ["probe-entity"], delivery_method: "sse" },
    expectedCode: "GUEST_TOKEN_INVALID",
  },
  {
    method: "POST",
    path: "/unsubscribe",
    body: { subscription_id: "probe-subscription" },
    expectedCode: "GUEST_TOKEN_INVALID",
  },
];

describe("invalid bearer on guest-capable protected routes", () => {
  it.each(INVALID_BEARER_ROUTES)(
    "returns 401 $expectedCode for $method $path",
    async ({ method, path, body, expectedCode }) => {
      await withHttpServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: "Bearer invalid-guest-token",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        expect(response.status).toBe(401);
        const text = await response.text();
        if (expectedCode === "GUEST_TOKEN_INVALID") {
          const parsed = JSON.parse(text) as { error_code?: string; message?: string };
          expect(parsed.error_code).toBe("GUEST_TOKEN_INVALID");
          expect(parsed.message).toBe(GUEST_TOKEN_INVALID_MESSAGE_TEXT);
        } else {
          expect(text).toMatch(/AUTH_INVALID|Unauthorized - invalid/i);
        }
      });
    }
  );
});
