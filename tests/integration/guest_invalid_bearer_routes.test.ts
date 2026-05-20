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

const INVALID_BEARER_ROUTES: ReadonlyArray<{
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
}> = [
  { method: "GET", path: "/entities/duplicates?entity_type=note" },
  { method: "GET", path: "/events/stream?subscription_id=probe-subscription" },
  { method: "POST", path: "/get_subscription_status", body: {} },
  { method: "POST", path: "/issues/add_message", body: {} },
  { method: "POST", path: "/issues/status", body: {} },
  { method: "POST", path: "/issues/submit", body: {} },
  { method: "POST", path: "/list_subscriptions", body: {} },
  { method: "POST", path: "/subscribe", body: {} },
  { method: "POST", path: "/unsubscribe", body: {} },
];

describe("invalid bearer on guest-capable protected routes", () => {
  it.each(INVALID_BEARER_ROUTES)("returns 401 for $method $path", async ({ method, path, body }) => {
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
      await expect(response.text()).resolves.toMatch(/AUTH_INVALID|Unauthorized - invalid/i);
    });
  });
});
