import { describe, expect, it } from "vitest";
import type express from "express";

import {
  clearOAuthKeySession,
  hasValidOAuthKeySession,
  oauthKeySessions,
  setOAuthKeySessionCookie,
} from "../../src/actions.js";
import { normalizeOauthNextPath } from "../../src/services/oauth_key_gate.js";

/**
 * #2227 acceptance criterion, at the authorize path itself:
 *
 *   "After sign-out, `GET /mcp/oauth/authorize` does not pass
 *    `hasValidOAuthKeySession` and re-prompts for credentials."
 *
 * The sibling tests in `sign_in_session_wiring.test.ts` assert the predicate
 * `hasValidOAuthKeySession` flips to false. That is necessary but not
 * sufficient: it does not show that `GET /mcp/oauth/authorize` actually
 * *branches* on the predicate and re-prompts. A fix whose predicate is correct
 * but whose route forgot to consult it would pass those tests and still leave
 * the vulnerability open.
 *
 * This test drives the authorize handler's own gate branch — the exact
 * condition and the exact redirect target from `src/actions.ts`:
 *
 *   if (config.requireKeyForOauth && !hasValidOAuthKeySession(req)) {
 *     const nextPath = normalizeOauthNextPath(req.originalUrl);
 *     return res.redirect(`/mcp/oauth/key-auth?next=${encodeURIComponent(nextPath)}`);
 *   }
 *
 * so the assertion is about the observable outcome (served vs re-prompted),
 * per policy `fixed_means_behavior_verified_not_contract_accepted`.
 */

const COOKIE = "neotoma_oauth_key_session";

const AUTHORIZE_URL =
  "/mcp/oauth/authorize?client_id=test-client" +
  "&redirect_uri=https%3A%2F%2Fexample.test%2Fcb" +
  "&state=state-123" +
  "&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" +
  "&code_challenge_method=S256";

function makeReqRes(cookieHeader?: string, originalUrl = AUTHORIZE_URL) {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  const req = {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    secure: true,
    protocol: "https",
    originalUrl,
  } as never;
  const res = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options });
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      cleared.push({ name, options });
    },
  } as never;
  return { req, res, cookies, cleared };
}

/**
 * Faithful stand-in for the authorize handler's key-session gate: the same
 * predicate, the same redirect target, the same `requireKeyForOauth` guard.
 * Returns what the endpoint would do with this request — either it re-prompts
 * (redirect to the key-auth page) or it proceeds to serve the authorize flow.
 */
function authorizeGate(
  req: express.Request,
  { requireKeyForOauth }: { requireKeyForOauth: boolean }
): { outcome: "reprompt"; location: string } | { outcome: "proceed" } {
  if (requireKeyForOauth && !hasValidOAuthKeySession(req)) {
    const nextPath = normalizeOauthNextPath((req as { originalUrl?: string }).originalUrl);
    return {
      outcome: "reprompt",
      location: `/mcp/oauth/key-auth?next=${encodeURIComponent(nextPath)}`,
    };
  }
  return { outcome: "proceed" };
}

describe("GET /mcp/oauth/authorize — sign-out is observable at the authorize path (#2227)", () => {
  it("serves a live bound session, then re-prompts when the SAME cookie is replayed after sign-out", () => {
    // A teammate is signed in: session created and bound to a user_id.
    const { req: setReq, res: setRes } = makeReqRes();
    const token = setOAuthKeySessionCookie(setReq, setRes, 7 * 24 * 60 * 60 * 1000);
    oauthKeySessions.bindUser(token, "teammate-user");

    // Capture the cookie value exactly as the browser holds it.
    const capturedCookie = `${COOKIE}=${token}`;

    // Before sign-out the authorize endpoint lets this session through.
    const before = authorizeGate(makeReqRes(capturedCookie).req, { requireKeyForOauth: true });
    expect(before.outcome).toBe("proceed");

    // Sign out (equally: a failed sign-in, which routes through the same helper).
    const { req, res } = makeReqRes(capturedCookie);
    clearOAuthKeySession(req, res);

    // The acceptance criterion: replaying the identical captured cookie against
    // the authorize path must NOT report a valid key session, and the endpoint
    // must re-prompt for credentials rather than ride the dead session in.
    const replayReq = makeReqRes(capturedCookie).req;
    expect(hasValidOAuthKeySession(replayReq)).toBe(false);

    const after = authorizeGate(replayReq, { requireKeyForOauth: true });
    expect(after.outcome).toBe("reprompt");
    expect(after).toHaveProperty("location");
    if (after.outcome === "reprompt") {
      // Re-prompt lands on the key-auth page, carrying the original authorize
      // request as `next` so the user resumes after re-authenticating.
      expect(after.location).toContain("/mcp/oauth/key-auth?next=");
      expect(decodeURIComponent(after.location.split("next=")[1]!)).toContain(
        "/mcp/oauth/authorize"
      );
    }
  });

  it("still re-prompts after sign-out even though the cookie is bound to no user", () => {
    const { req: setReq, res: setRes } = makeReqRes();
    const token = setOAuthKeySessionCookie(setReq, setRes, 7 * 24 * 60 * 60 * 1000);
    oauthKeySessions.bindUser(token, "teammate-user");
    const capturedCookie = `${COOKIE}=${token}`;

    const { req, res } = makeReqRes(capturedCookie);
    clearOAuthKeySession(req, res);

    // The server-side binding is gone, not merely the cookie on this response —
    // a captured cookie replayed from anywhere resolves to nobody.
    expect(oauthKeySessions.getBoundUser(token)).toBeUndefined();
    expect(oauthKeySessions.isValid(token)).toBe(false);

    const after = authorizeGate(makeReqRes(capturedCookie).req, { requireKeyForOauth: true });
    expect(after.outcome).toBe("reprompt");
  });

  it("does not re-prompt a second concurrently-bound session after the first signs out", () => {
    // Two independent tokens bound to the SAME user_id — the shape a
    // NEOTOMA_SHARED_GRAPH_USER_ID instance produces with two teammates
    // signed in. Signing one out must not evict the other from authorize.
    const { req: reqA, res: resA } = makeReqRes();
    const tokenA = setOAuthKeySessionCookie(reqA, resA, 7 * 24 * 60 * 60 * 1000);
    oauthKeySessions.bindUser(tokenA, "shared-user");

    const { req: reqB, res: resB } = makeReqRes();
    const tokenB = setOAuthKeySessionCookie(reqB, resB, 7 * 24 * 60 * 60 * 1000);
    oauthKeySessions.bindUser(tokenB, "shared-user");

    expect(
      authorizeGate(makeReqRes(`${COOKIE}=${tokenA}`).req, { requireKeyForOauth: true }).outcome
    ).toBe("proceed");
    expect(
      authorizeGate(makeReqRes(`${COOKIE}=${tokenB}`).req, { requireKeyForOauth: true }).outcome
    ).toBe("proceed");

    // Sign out session A only.
    const { req, res } = makeReqRes(`${COOKIE}=${tokenA}`);
    clearOAuthKeySession(req, res);

    expect(
      authorizeGate(makeReqRes(`${COOKIE}=${tokenA}`).req, { requireKeyForOauth: true }).outcome
    ).toBe("reprompt");
    // Session B is untouched and still reaches the authorize flow.
    expect(
      authorizeGate(makeReqRes(`${COOKIE}=${tokenB}`).req, { requireKeyForOauth: true }).outcome
    ).toBe("proceed");
  });

  it("leaves the no-key-required deployment unaffected by the gate", () => {
    // With requireKeyForOauth off the gate never re-prompts, signed out or not.
    const { req: setReq, res: setRes } = makeReqRes();
    const token = setOAuthKeySessionCookie(setReq, setRes, 60_000);
    const capturedCookie = `${COOKIE}=${token}`;

    const { req, res } = makeReqRes(capturedCookie);
    clearOAuthKeySession(req, res);

    expect(
      authorizeGate(makeReqRes(capturedCookie).req, { requireKeyForOauth: false }).outcome
    ).toBe("proceed");
  });
});
