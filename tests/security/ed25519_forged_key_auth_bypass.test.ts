/**
 * Regression gate — advisory 2026-08-07-ed25519-bearer-forged-key-auth-bypass.
 *
 * The REST Ed25519 bearer path auto-registered ANY 32-byte token and verified
 * the request signature only `if (signature ...)`, so an UNSIGNED forged public
 * key was accepted; getAuthenticatedUserId then TRUSTED a caller-supplied
 * `user_id` for any Bearer request whose token resolved to no principal. Net
 * effect: an anonymous caller read/wrote the whole graph by presenting a random
 * 32-byte key + the well-known nil-UUID owner.
 *
 * The decisive fix is in `getAuthenticatedUserId`: a Bearer request that reaches
 * the tail with NO resolved `authenticatedUserId` must FAIL CLOSED, never return
 * the caller-supplied `user_id`. This test drives that function directly with
 * fake requests modelling each case, so the assertion depends on the fix and not
 * on the test server's boot mode.
 *
 * Pre-fix, the "unresolved Bearer + provided user_id" case returned the provided
 * id (the exploit). Post-fix it throws. The test is verified to fail against the
 * pre-fix tail (see advisory § Fix).
 */
import { describe, it, expect } from "vitest";
import type express from "express";
import { getAuthenticatedUserId } from "../../src/actions.js";

const NIL_UUID = "00000000-0000-0000-0000-000000000000"; // LOCAL_DEV_USER_ID
const OTHER_UUID = "11111111-1111-1111-1111-111111111111";

/** Minimal request stub: a forged Ed25519 bearer that resolved to no principal. */
function reqWithBearerNoPrincipal(): express.Request {
  return {
    headers: { authorization: "Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
    // no authenticatedUserId stamped — models a forged/unregistered key
  } as unknown as express.Request;
}

/** A request that WAS resolved to a principal by the middleware. */
function reqWithPrincipal(userId: string): express.Request {
  return {
    headers: { authorization: "Bearer whatever" },
    authenticatedUserId: userId,
  } as unknown as express.Request;
}

describe("getAuthenticatedUserId fail-closed for unresolved Bearer (advisory 2026-08-07)", () => {
  it("THROWS when a Bearer request resolved to no principal, even with a provided user_id", async () => {
    // This is the exploit: forged key (no principal) + attacker-chosen user_id.
    await expect(
      getAuthenticatedUserId(reqWithBearerNoPrincipal(), NIL_UUID)
    ).rejects.toThrow(/Not authenticated/);
  });

  it("THROWS for an unresolved Bearer with no provided user_id", async () => {
    await expect(getAuthenticatedUserId(reqWithBearerNoPrincipal(), undefined)).rejects.toThrow(
      /Not authenticated/
    );
  });

  it("does NOT return the caller-supplied user_id for an unresolved Bearer", async () => {
    let resolved: string | undefined;
    try {
      resolved = await getAuthenticatedUserId(reqWithBearerNoPrincipal(), OTHER_UUID);
    } catch {
      resolved = undefined;
    }
    // Pre-fix this returned OTHER_UUID (the pivot). Post-fix it must never resolve.
    expect(resolved).not.toBe(OTHER_UUID);
    expect(resolved).toBeUndefined();
  });

  it("still returns a legitimately-resolved principal (no regression)", async () => {
    await expect(getAuthenticatedUserId(reqWithPrincipal(OTHER_UUID))).resolves.toBe(OTHER_UUID);
  });

  it("still rejects a user_id override that mismatches a non-dev resolved principal", async () => {
    // A resolved principal (not the local dev user) cannot be overridden by a
    // caller-supplied user_id — the existing tenant guard.
    await expect(
      getAuthenticatedUserId(reqWithPrincipal(OTHER_UUID), NIL_UUID)
    ).rejects.toThrow(/user_id parameter/);
  });
});
