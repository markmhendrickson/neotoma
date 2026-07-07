import { describe, expect, it } from "vitest";
import { formatHttpErrorMessage } from "./client";

/**
 * Auth error strings must be mechanism-agnostic: the server only knows
 * about bearer tokens ("Missing Bearer token", "Authorization header
 * required", ...) but the Inspector now offers Sign in (OAuth or bearer)
 * from Settings. `formatHttpErrorMessage` is the single place every HTTP
 * error (plain text or JSON body) passes through before reaching a
 * `QueryErrorAlert`, so this is where the rewrite is asserted.
 */
describe("formatHttpErrorMessage — auth error rewriting", () => {
  it("rewrites a plain-text 'Missing Bearer token' 401 body", () => {
    const msg = formatHttpErrorMessage(401, "Missing Bearer token");
    expect(msg).toBe("Authentication required. Sign in from Settings.");
  });

  it("rewrites a JSON 401 body with message: Missing Bearer token", () => {
    const msg = formatHttpErrorMessage(
      401,
      JSON.stringify({ error_code: "AUTH_REQUIRED", message: "Missing Bearer token" })
    );
    expect(msg).toBe("Authentication required. Sign in from Settings.");
  });

  it("rewrites 'Authorization header required'", () => {
    const msg = formatHttpErrorMessage(401, "Authorization header required");
    expect(msg).toBe("Authentication required. Sign in from Settings.");
  });

  it("rewrites an empty 401 body to the generic auth-required message", () => {
    const msg = formatHttpErrorMessage(401, "");
    expect(msg).toBe("Authentication required. Sign in from Settings.");
  });

  it("rewrites an invalid/expired token 401 to the session-expired message", () => {
    const msg = formatHttpErrorMessage(
      401,
      JSON.stringify({
        error_code: "AUTH_INVALID",
        message: "Unauthorized - invalid authentication token",
      })
    );
    expect(msg).toBe("Your session is no longer valid. Sign in again from Settings.");
  });

  it("does not rewrite unrelated 401/403 messages", () => {
    const msg = formatHttpErrorMessage(
      403,
      JSON.stringify({ message: "Invalid request signature" })
    );
    expect(msg).toBe("Invalid request signature");
  });

  it("leaves non-auth error statuses untouched", () => {
    const msg = formatHttpErrorMessage(500, JSON.stringify({ message: "Database unavailable" }));
    expect(msg).toBe("Database unavailable");
  });

  it("still detects the missing-route hint on 404s", () => {
    const msg = formatHttpErrorMessage(
      404,
      "Cannot POST /issues/add_message",
      "/issues/add_message"
    );
    expect(msg).toContain("missing route /issues/add_message");
  });
});
