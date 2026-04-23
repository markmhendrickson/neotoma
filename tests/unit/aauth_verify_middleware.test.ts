/**
 * Unit tests for the AAuth verification middleware (Phase 1.7).
 *
 * Scope:
 * - Short-circuits (no AAuth headers → `req.aauth` unset, `next()` called).
 * - Successful signature → populates `req.aauth` with thumbprint, sub, iss.
 * - Failed signature → no `req.aauth`, but middleware still calls `next()`
 *   (non-blocking contract).
 * - Expired / malformed JWT → treated the same as failure.
 *
 * We mock `@hellocoop/httpsig.expressVerify` directly so these tests stay
 * fast and don't require generating real keys. End-to-end signed flows are
 * covered in tests/integration/aauth_mcp_signed.test.ts (below).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hellocoop/httpsig", () => ({
  expressVerify: vi.fn(),
}));

import { expressVerify } from "@hellocoop/httpsig";
import { aauthVerify, getAAuthContextFromRequest } from "../../src/middleware/aauth_verify.js";

const verifyMock = vi.mocked(expressVerify);

function buildReq(overrides: Record<string, unknown> = {}): any {
  return {
    method: "POST",
    protocol: "https",
    hostname: "neotoma.io",
    originalUrl: "/mcp",
    headers: {},
    rawBody: Buffer.from(""),
    ...overrides,
  };
}

describe("aauthVerify middleware", () => {
  beforeEach(() => {
    verifyMock.mockReset();
  });

  it("short-circuits when no AAuth headers are present", async () => {
    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();

    await middleware(req, {} as any, next);

    expect(verifyMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.aauth).toBeUndefined();
    expect(getAAuthContextFromRequest(req)).toBeNull();
  });

  it("populates req.aauth with thumbprint and JWT sub/iss on success", async () => {
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" })
    ).toString("base64url");
    const payloadB64 = Buffer.from(
      JSON.stringify({
        sub: "agent:test",
        iss: "https://agent.example",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    const jwtRaw = `${headerB64}.${payloadB64}.sig`;

    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
      thumbprint: "tp-123",
      created: Math.floor(Date.now() / 1000),
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq({
      headers: {
        signature: "sig=:abc:",
        "signature-input": "sig=(\"@method\");created=1",
        "signature-key": "sk",
      },
    });
    const next = vi.fn();

    await middleware(req, {} as any, next);

    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.aauth).toBeDefined();
    expect(req.aauth.verified).toBe(true);
    expect(req.aauth.thumbprint).toBe("tp-123");
    expect(req.aauth.algorithm).toBe("ES256");
    expect(req.aauth.sub).toBe("agent:test");
    expect(req.aauth.iss).toBe("https://agent.example");
    expect(getAAuthContextFromRequest(req)).toBe(req.aauth);
  });

  it("treats failed verification as unsigned but still calls next()", async () => {
    verifyMock.mockResolvedValue({
      verified: false,
      label: "sig",
      keyType: "hwk",
      publicKey: {},
      thumbprint: "",
      created: 0,
      error: "bad signature",
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq({
      headers: { signature: "sig=:abc:" },
    });
    const next = vi.fn();

    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.aauth).toBeUndefined();
  });

  it("rejects expired JWTs and does not set aauth", async () => {
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "EdDSA", typ: "aa-agent+jwt" })
    ).toString("base64url");
    // exp far in the past
    const payloadB64 = Buffer.from(
      JSON.stringify({ sub: "x", iss: "y", exp: 1000 })
    ).toString("base64url");
    const jwtRaw = `${headerB64}.${payloadB64}.sig`;

    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "OKP", crv: "Ed25519", alg: "EdDSA" },
      thumbprint: "tp-expired",
      created: Math.floor(Date.now() / 1000),
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq({
      headers: { signature: "sig=:abc:" },
    });
    const next = vi.fn();

    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.aauth).toBeUndefined();
  });

  it("throws at construction if authority is missing", () => {
    expect(() => aauthVerify({ authority: "" } as any)).toThrow();
  });

  describe("NEOTOMA_STRICT_AAUTH_SUBS (pinned identity enforcement)", () => {
    const originalStrict = process.env.NEOTOMA_STRICT_AAUTH_SUBS;

    beforeEach(() => {
      process.env.NEOTOMA_STRICT_AAUTH_SUBS = "agent-site@neotoma.io";
    });

    // Restore env after the nested describe block.
    afterEach(() => {
      if (originalStrict === undefined) {
        delete process.env.NEOTOMA_STRICT_AAUTH_SUBS;
      } else {
        process.env.NEOTOMA_STRICT_AAUTH_SUBS = originalStrict;
      }
    });

    function buildStatusJsonRes(): {
      res: any;
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    } {
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const res = { status };
      return { res, status, json };
    }

    it("rejects pinned-label requests that carry no signature", async () => {
      const middleware = aauthVerify({ authority: "neotoma.io" });
      const req = buildReq({
        headers: { "x-agent-label": "agent-site@neotoma.io" },
      });
      const next = vi.fn();
      const { res, status, json } = buildStatusJsonRes();

      await middleware(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error_code: "AAUTH_REQUIRED" }),
      );
    });

    it("rejects pinned-label requests signed by the wrong sub", async () => {
      const headerB64 = Buffer.from(
        JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" }),
      ).toString("base64url");
      const payloadB64 = Buffer.from(
        JSON.stringify({
          sub: "someone-else@example.com",
          iss: "https://agent.neotoma.io",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url");
      const jwtRaw = `${headerB64}.${payloadB64}.sig`;

      verifyMock.mockResolvedValue({
        verified: true,
        label: "sig",
        keyType: "jwt",
        publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
        thumbprint: "tp-other",
        created: Math.floor(Date.now() / 1000),
        jwt: { header: {}, payload: {}, raw: jwtRaw },
      } as any);

      const middleware = aauthVerify({ authority: "neotoma.io" });
      const req = buildReq({
        headers: {
          "x-agent-label": "agent-site@neotoma.io",
          signature: "sig=:abc:",
          "signature-input": "sig=(\"@method\");created=1",
          "signature-key": "sk",
        },
      });
      const next = vi.fn();
      const { res, status, json } = buildStatusJsonRes();

      await middleware(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.aauth).toBeUndefined();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error_code: "AAUTH_REQUIRED" }),
      );
    });

    it("accepts pinned-label requests when the signed sub matches", async () => {
      const headerB64 = Buffer.from(
        JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" }),
      ).toString("base64url");
      const payloadB64 = Buffer.from(
        JSON.stringify({
          sub: "agent-site@neotoma.io",
          iss: "https://agent.neotoma.io",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url");
      const jwtRaw = `${headerB64}.${payloadB64}.sig`;

      verifyMock.mockResolvedValue({
        verified: true,
        label: "sig",
        keyType: "jwt",
        publicKey: { kty: "EC", crv: "P-256", alg: "ES256" },
        thumbprint: "tp-match",
        created: Math.floor(Date.now() / 1000),
        jwt: { header: {}, payload: {}, raw: jwtRaw },
      } as any);

      const middleware = aauthVerify({ authority: "neotoma.io" });
      const req = buildReq({
        headers: {
          "x-agent-label": "agent-site@neotoma.io",
          signature: "sig=:abc:",
          "signature-input": "sig=(\"@method\");created=1",
          "signature-key": "sk",
        },
      });
      const next = vi.fn();

      await middleware(req, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.aauth?.sub).toBe("agent-site@neotoma.io");
    });

    it("ignores unknown x-agent-label values (non-strict)", async () => {
      const middleware = aauthVerify({ authority: "neotoma.io" });
      const req = buildReq({
        headers: { "x-agent-label": "some-other-agent@example.com" },
      });
      const next = vi.fn();

      await middleware(req, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.aauth).toBeUndefined();
    });
  });
});
