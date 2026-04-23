/**
 * Unit tests for the Phase 2 attribution diagnostics surface.
 *
 * Two pieces are exercised here in isolation:
 *
 * 1. `normaliseClientNameWithReason` — the single source of truth for
 *    *why* a self-reported clientInfo.name is dropped. Reason codes
 *    are promised in `docs/subsystems/agent_attribution_integration.md`
 *    and mirrored on the `/session` response.
 * 2. The AAuth middleware emits the stable `attribution_decision`
 *    structured log event on every request it inspects and stashes the
 *    same decision on `req.attributionDecision` for the `/session`
 *    handler to mirror.
 *
 * Integration-style coverage (the same decision arriving through real
 * HTTP + `/session` + MCP paths) lives in `aauth_attribution_stamping`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hellocoop/httpsig", () => ({
  expressVerify: vi.fn(),
}));

import { expressVerify } from "@hellocoop/httpsig";
import {
  aauthVerify,
  ATTRIBUTION_DECISION_EVENT,
  getAttributionDecisionFromRequest,
} from "../../src/middleware/aauth_verify.js";
import { normaliseClientNameWithReason } from "../../src/crypto/agent_identity.js";
import { logger } from "../../src/utils/logger.js";

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

describe("normaliseClientNameWithReason", () => {
  it("returns undefined reason when input is null or undefined", () => {
    expect(normaliseClientNameWithReason(null)).toEqual({ value: undefined });
    expect(normaliseClientNameWithReason(undefined)).toEqual({
      value: undefined,
    });
  });

  it("flags whitespace-only strings as empty", () => {
    const { value, reason } = normaliseClientNameWithReason("   ");
    expect(value).toBeUndefined();
    expect(reason).toBe("empty");
  });

  it("flags generic placeholders as too_generic", () => {
    for (const candidate of ["mcp", "Client", "MCP-Client", "anonymous"]) {
      const { value, reason } = normaliseClientNameWithReason(candidate);
      expect(value, `should drop ${candidate}`).toBeUndefined();
      expect(reason).toBe("too_generic");
    }
  });

  it("accepts and trims a real client name", () => {
    const { value, reason } = normaliseClientNameWithReason("  Claude Code  ");
    expect(value).toBe("Claude Code");
    expect(reason).toBeUndefined();
  });

  it("flags non-string input as not_a_string", () => {
    const { value, reason } = normaliseClientNameWithReason(
      // @ts-expect-error deliberately wrong shape for this test
      42,
    );
    expect(value).toBeUndefined();
    expect(reason).toBe("not_a_string");
  });
});

describe("aauthVerifyMiddleware attribution_decision emission", () => {
  beforeEach(() => {
    verifyMock.mockReset();
  });

  it("emits attribution_decision with signature_present=false for unsigned requests", async () => {
    const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq();
    const next = vi.fn();

    await middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision).toEqual({
      signature_present: false,
      signature_verified: false,
      resolved_tier: "anonymous",
    });

    const emitted = debugSpy.mock.calls
      .map(([arg]) => String(arg))
      .find((line) => line.includes(ATTRIBUTION_DECISION_EVENT));
    expect(emitted, "debug log should include attribution_decision").toBeDefined();
    const parsed = JSON.parse(emitted!);
    expect(parsed.event).toBe(ATTRIBUTION_DECISION_EVENT);
    expect(parsed.signature_present).toBe(false);
    debugSpy.mockRestore();
  });

  it("does not leak public keys or tokens in the log event", async () => {
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" }),
    ).toString("base64url");
    const payloadB64 = Buffer.from(
      JSON.stringify({
        sub: "agent:secret",
        iss: "https://agent.example",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const jwtRaw = `${headerB64}.${payloadB64}.sig`;

    verifyMock.mockResolvedValue({
      verified: true,
      label: "sig",
      keyType: "jwt",
      publicKey: { kty: "EC", crv: "P-256", alg: "ES256", x: "XSECRET" },
      thumbprint: "tp-secret",
      created: Math.floor(Date.now() / 1000),
      jwt: { header: {}, payload: {}, raw: jwtRaw },
    } as any);

    const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
    const middleware = aauthVerify({ authority: "neotoma.io" });
    const req = buildReq({
      headers: {
        signature: "sig=:deadbeef:",
        "signature-input": 'sig=();keyid="tp-secret"',
        "signature-key": jwtRaw,
      },
    });
    await middleware(req, {} as any, vi.fn());

    const emitted = debugSpy.mock.calls
      .map(([arg]) => String(arg))
      .find((line) => line.includes(ATTRIBUTION_DECISION_EVENT));
    expect(emitted).toBeDefined();
    expect(emitted).not.toContain("XSECRET");
    expect(emitted).not.toContain(jwtRaw);
    debugSpy.mockRestore();
  });
});
