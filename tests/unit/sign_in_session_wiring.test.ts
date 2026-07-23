import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIGN_IN_SESSION_TTL_MIN,
  getGoogleVerifiedUserId,
  oauthKeySessions,
  resolveSignInSessionTtlMs,
  setOAuthKeySessionCookie,
} from "../../src/actions.js";

/**
 * #2005 — wiring-level coverage for the sign-in session TTL.
 *
 * The store itself is unit-tested in src/services/__tests__/oauth_key_gate.test.ts.
 * These tests cover the layer where the bug actually shipped: the actions.ts
 * functions that connect the TTL to the cookie's maxAge and to the user
 * binding. The invariant under test is the one setOAuthKeySessionCookie's own
 * docstring names — the cookie lifetime and the server-side session expiry MUST
 * agree, or the browser keeps presenting a cookie the server has forgotten
 * (or the reverse).
 */

/** Minimal express req/res doubles: we only need cookie capture + header reads. */
function makeReqRes(cookieHeader?: string) {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const req = {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    secure: true,
    protocol: "https",
  } as never;
  const res = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options });
    },
  } as never;
  return { req, res, cookies };
}

describe("sign-in session TTL wiring (#2005)", () => {
  describe("resolveSignInSessionTtlMs — NEOTOMA_SIGN_IN_SESSION_TTL_MIN parsing", () => {
    const defaultMs = DEFAULT_SIGN_IN_SESSION_TTL_MIN * 60 * 1000;

    it("defaults to 7 days when the override is unset", () => {
      expect(resolveSignInSessionTtlMs(undefined)).toBe(defaultMs);
      expect(resolveSignInSessionTtlMs("")).toBe(defaultMs);
    });

    it("honors a positive integer override", () => {
      expect(resolveSignInSessionTtlMs("30")).toBe(30 * 60 * 1000);
      expect(resolveSignInSessionTtlMs("1")).toBe(60 * 1000);
    });

    it("falls back to the default on a non-numeric value", () => {
      expect(resolveSignInSessionTtlMs("not-a-number")).toBe(defaultMs);
      expect(resolveSignInSessionTtlMs("abc123")).toBe(defaultMs);
    });

    it("falls back to the default on zero or negative rather than a degenerate session", () => {
      // A prior draft clamped these to 1 minute via Math.max(1, …), which would
      // have produced a near-unusable session from a typo'd env value.
      expect(resolveSignInSessionTtlMs("0")).toBe(defaultMs);
      expect(resolveSignInSessionTtlMs("-5")).toBe(defaultMs);
    });
  });

  describe("setOAuthKeySessionCookie — cookie maxAge matches server-side expiry", () => {
    it("uses the short key-entry default when no ttl is passed", () => {
      const { req, res, cookies } = makeReqRes();
      const token = setOAuthKeySessionCookie(req, res);

      expect(cookies).toHaveLength(1);
      expect(cookies[0]!.options.maxAge).toBe(15 * 60 * 1000);

      // Server agrees: valid inside the window, expired past it.
      const now = Date.now();
      expect(oauthKeySessions.isValid(token, now + 5 * 60 * 1000)).toBe(true);
      expect(oauthKeySessions.isValid(token, now + 16 * 60 * 1000)).toBe(false);
    });

    it("applies a sign-in ttl override to BOTH the cookie and the session", () => {
      const ttlMs = 7 * 24 * 60 * 60 * 1000;
      const { req, res, cookies } = makeReqRes();
      const token = setOAuthKeySessionCookie(req, res, ttlMs);

      // The invariant: cookie lifetime == server session lifetime.
      expect(cookies[0]!.options.maxAge).toBe(ttlMs);

      const now = Date.now();
      // Far past the 15-minute gate default — this is the regression.
      expect(oauthKeySessions.isValid(token, now + 60 * 60 * 1000)).toBe(true);
      expect(oauthKeySessions.isValid(token, now + ttlMs - 1000)).toBe(true);
      expect(oauthKeySessions.isValid(token, now + ttlMs + 1000)).toBe(false);
    });

    it("sets the cookie with hardening flags on an https request", () => {
      const { req, res, cookies } = makeReqRes();
      setOAuthKeySessionCookie(req, res, 60_000);
      const opts = cookies[0]!.options;
      expect(opts.httpOnly).toBe(true);
      expect(opts.secure).toBe(true);
      expect(opts.sameSite).toBe("lax");
    });
  });

  describe("getGoogleVerifiedUserId — binding resolves only for a live session", () => {
    const COOKIE = "neotoma_oauth_key_session";

    it("resolves the bound user while the session is live", () => {
      const { req, res } = makeReqRes();
      const token = setOAuthKeySessionCookie(req, res, 60_000);
      oauthKeySessions.bindUser(token, "user-live");

      const { req: readReq } = makeReqRes(`${COOKIE}=${token}`);
      expect(getGoogleVerifiedUserId(readReq)).toBe("user-live");
    });

    it("returns undefined when no session cookie is present", () => {
      const { req } = makeReqRes();
      expect(getGoogleVerifiedUserId(req)).toBeUndefined();
    });

    it("returns undefined for a token that was never issued", () => {
      const { req } = makeReqRes(`${COOKIE}=never-issued-token`);
      expect(getGoogleVerifiedUserId(req)).toBeUndefined();
    });

    it("does not resolve a user once the session has expired", () => {
      const { req, res } = makeReqRes();
      // 1ms session: expired by the time we read it back.
      const token = setOAuthKeySessionCookie(req, res, 1);
      oauthKeySessions.bindUser(token, "user-expired");
      oauthKeySessions.cleanup(Date.now() + 1000);

      const { req: readReq } = makeReqRes(`${COOKIE}=${token}`);
      expect(getGoogleVerifiedUserId(readReq)).toBeUndefined();
    });

    it("keeps bindings separate across concurrent sessions", () => {
      const a = setOAuthKeySessionCookie(makeReqRes().req, makeReqRes().res, 60_000);
      const b = setOAuthKeySessionCookie(makeReqRes().req, makeReqRes().res, 60_000);
      oauthKeySessions.bindUser(a, "user-a");
      oauthKeySessions.bindUser(b, "user-b");

      expect(getGoogleVerifiedUserId(makeReqRes(`${COOKIE}=${a}`).req)).toBe("user-a");
      expect(getGoogleVerifiedUserId(makeReqRes(`${COOKIE}=${b}`).req)).toBe("user-b");
    });

    it("overwrites the binding when the same token is bound twice", () => {
      const { req, res } = makeReqRes();
      const token = setOAuthKeySessionCookie(req, res, 60_000);
      oauthKeySessions.bindUser(token, "user-first");
      oauthKeySessions.bindUser(token, "user-second");

      expect(getGoogleVerifiedUserId(makeReqRes(`${COOKIE}=${token}`).req)).toBe("user-second");
    });
  });
});
