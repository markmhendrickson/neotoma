import type { Request } from "express";
import { describe, expect, it } from "vitest";

import {
  guestWriteRateLimitKey,
  routeConsumesGuestWriteBudget,
} from "../../src/actions.js";
import { hashGuestAccessToken } from "../../src/services/guest_access_token.js";

const GUEST_WRITE_BUDGET_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "POST", path: "/issues/submit" },
  { method: "POST", path: "/api/issues/submit" },
  { method: "POST", path: "/issues/add_message" },
  { method: "POST", path: "/api/issues/add_message" },
  { method: "POST", path: "/subscribe" },
  { method: "POST", path: "/unsubscribe" },
];

function routeReq(method: string, path: string): Pick<Request, "method" | "path"> {
  return { method, path };
}

describe("guest write-rate-limit routing", () => {
  it.each(GUEST_WRITE_BUDGET_ROUTES)(
    "consumes guest write budget for $method $path",
    ({ method, path }) => {
      expect(routeConsumesGuestWriteBudget(routeReq(method, path))).toBe(true);
    },
  );

  it.each([
    { method: "POST", path: "/issues/status" },
    { method: "POST", path: "/api/issues/status" },
    { method: "POST", path: "/list_subscriptions" },
    { method: "POST", path: "/get_subscription_status" },
    { method: "GET", path: "/events/stream" },
  ] as const)("does not consume guest write budget for $method $path", ({ method, path }) => {
    expect(routeConsumesGuestWriteBudget(routeReq(method, path))).toBe(false);
  });
});

describe("guest write-rate-limit key precedence", () => {
  it("prefers guest thumbprint when present", () => {
    const req = {
      ip: "203.0.113.10",
      principal: {
        kind: "guest",
        guestId: {
          thumbprint: "thumbprint-123",
          accessToken: "guest-token-123",
        },
        accessToken: "guest-token-123",
      },
    } as Request;
    expect(guestWriteRateLimitKey(req)).toBe("guest-thumbprint:thumbprint-123");
  });

  it("falls back to the guest token hash when no thumbprint exists", () => {
    const token = "guest-token-456";
    const req = {
      ip: "203.0.113.10",
      principal: {
        kind: "guest",
        guestId: {
          accessToken: token,
        },
        accessToken: token,
      },
    } as Request;
    expect(guestWriteRateLimitKey(req)).toBe(
      `guest-token:${hashGuestAccessToken(token).slice(0, 16)}`,
    );
  });

  it("falls back to IP when no guest identity is stamped", () => {
    const req = {
      ip: "203.0.113.10",
    } as Request;
    expect(guestWriteRateLimitKey(req)).toMatch(/^ip:/);
  });
});
