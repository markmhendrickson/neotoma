import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generateGuestAccessToken,
  hashGuestAccessToken,
} from "../../src/services/guest_access_token.js";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

const tracker = new TestIdTracker();

async function withGuestRateLimitedServer<T>(
  limitPerMinute: number,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const previousLimit = process.env.NEOTOMA_GUEST_WRITE_RATE_LIMIT_PER_MIN;
  if (limitPerMinute <= 0) {
    delete process.env.NEOTOMA_GUEST_WRITE_RATE_LIMIT_PER_MIN;
  } else {
    process.env.NEOTOMA_GUEST_WRITE_RATE_LIMIT_PER_MIN = String(limitPerMinute);
  }
  vi.resetModules();
  const { app } = await import("../../src/actions.js");
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
    if (previousLimit === undefined) {
      delete process.env.NEOTOMA_GUEST_WRITE_RATE_LIMIT_PER_MIN;
    } else {
      process.env.NEOTOMA_GUEST_WRITE_RATE_LIMIT_PER_MIN = previousLimit;
    }
    vi.resetModules();
  }
}

async function guestTokenFor(userId: string): Promise<string> {
  const token = await generateGuestAccessToken({ entityIds: [], userId });
  tracker.trackEntity(`guest_token_${hashGuestAccessToken(token).slice(0, 16)}`);
  return token;
}

describe("guest write route rate limiting", () => {
  afterEach(async () => {
    await tracker.cleanup();
  });

  it("returns 429 once a guest token exceeds the configured /subscribe write limit", async () => {
    await withGuestRateLimitedServer(1, async (baseUrl) => {
      const token = await guestTokenFor("guest-write-rate-limit-user");

      const first = await fetch(`${baseUrl}/subscribe`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entity_types: ["note"],
          delivery_method: "sse",
        }),
      });
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { entity_id?: string };
      if (firstBody.entity_id) tracker.trackEntity(firstBody.entity_id);

      const second = await fetch(`${baseUrl}/subscribe`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entity_types: ["note"],
          delivery_method: "sse",
        }),
      });
      expect(second.status).toBe(429);
      await expect(second.text()).resolves.toMatch(/Guest write rate limit exceeded/i);
    });
  });
});
