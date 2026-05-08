import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { routeAcceptsGuestPrincipal } from "../../src/actions.js";

/**
 * Routes where `routeAcceptsGuestPrincipal` must return true so auth middleware
 * can stamp a guest principal before handlers that call
 * `resolveRoutePrincipal(req, ["user", "guest"])`.
 *
 * Keep in sync with `src/actions.ts` (`routeAcceptsGuestPrincipal` + subscription handlers).
 */
const SUBSCRIPTION_GUEST_CAPABLE: ReadonlyArray<{ method: string; path: string }> = [
  { method: "POST", path: "/subscribe" },
  { method: "POST", path: "/unsubscribe" },
  { method: "POST", path: "/list_subscriptions" },
  { method: "POST", path: "/get_subscription_status" },
  { method: "GET", path: "/events/stream" },
];

const ISSUE_GUEST_CAPABLE: ReadonlyArray<{ method: string; path: string }> = [
  { method: "POST", path: "/issues/submit" },
  { method: "POST", path: "/api/issues/submit" },
  { method: "POST", path: "/issues/status" },
  { method: "POST", path: "/api/issues/status" },
  { method: "POST", path: "/issues/add_message" },
  { method: "POST", path: "/api/issues/add_message" },
];

const ENTITY_GUEST_READ_EXAMPLES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/entities/ent_0123456789abcdef01234567" },
  { method: "GET", path: "/entities/ent_0123456789abcdef01234567/observations" },
  { method: "GET", path: "/entities/ent_0123456789abcdef01234567/relationships" },
];

/** Minimal `req` shape used by `routeAcceptsGuestPrincipal` (method + path only). */
function guestRouteReq(method: string, path: string): Pick<Request, "method" | "path"> {
  return { method, path };
}

describe("routeAcceptsGuestPrincipal — subscription parity with issues", () => {
  describe("subscription HTTP routes", () => {
    it.each(SUBSCRIPTION_GUEST_CAPABLE)("accepts guest for $method $path", ({ method, path }) => {
      expect(routeAcceptsGuestPrincipal(guestRouteReq(method, path))).toBe(true);
    });
  });

  describe("issue HTTP routes (regression)", () => {
    it.each(ISSUE_GUEST_CAPABLE)("accepts guest for $method $path", ({ method, path }) => {
      expect(routeAcceptsGuestPrincipal(guestRouteReq(method, path))).toBe(true);
    });
  });

  describe("entity read paths (guest GET)", () => {
    it.each(ENTITY_GUEST_READ_EXAMPLES)("accepts guest for $method $path", ({ method, path }) => {
      expect(routeAcceptsGuestPrincipal(guestRouteReq(method, path))).toBe(true);
    });
  });

  describe("subscription — wrong method or paths without guest acceptance", () => {
    it.each([
      { method: "GET", path: "/subscribe", reason: "subscribe is POST-only for guest stamp" },
      { method: "GET", path: "/unsubscribe", reason: "unsubscribe is POST-only" },
      { method: "GET", path: "/list_subscriptions", reason: "list is POST-only" },
      { method: "GET", path: "/get_subscription_status", reason: "status is POST-only" },
      { method: "POST", path: "/events/stream", reason: "SSE stream is GET-only" },
      { method: "POST", path: "/api/subscribe", reason: "no /api mirror in guest list" },
      { method: "POST", path: "/api/unsubscribe", reason: "no /api mirror in guest list" },
    ] as const)("rejects guest for $method $path ($reason)", ({ method, path }) => {
      expect(routeAcceptsGuestPrincipal(guestRouteReq(method, path))).toBe(false);
    });

    it("rejects unrelated high-risk write paths", () => {
      expect(routeAcceptsGuestPrincipal(guestRouteReq("POST", "/store"))).toBe(false);
      expect(routeAcceptsGuestPrincipal(guestRouteReq("POST", "/correct"))).toBe(false);
      expect(routeAcceptsGuestPrincipal(guestRouteReq("POST", "/peers"))).toBe(false);
    });
  });

  it("subscription guest-capable set is stable (update intentionally when API changes)", () => {
    expect(SUBSCRIPTION_GUEST_CAPABLE).toHaveLength(5);
    const keys = SUBSCRIPTION_GUEST_CAPABLE.map((r) => `${r.method} ${r.path}`).sort();
    expect(keys).toEqual(
      [
        "GET /events/stream",
        "POST /get_subscription_status",
        "POST /list_subscriptions",
        "POST /subscribe",
        "POST /unsubscribe",
      ].sort(),
    );
  });
});
