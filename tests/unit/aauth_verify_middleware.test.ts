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
 * fast and do not generate real keys. These controls do not establish genuine
 * signed transport, original authority, or admitted grants.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@hellocoop/httpsig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hellocoop/httpsig")>()),
  expressVerify: vi.fn(),
}));

const admissionMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/services/aauth_admission.js", () => ({ admitFromAAuthContext: admissionMock }));

// Grant lookup stub: thumbprint -> grant pinning that key.
const pinnedGrants = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock("../../src/services/agent_grants.js", () => ({
  lookupGrantForIdentity: vi.fn(async (input: { thumbprint?: string | null }) => ({
    grant: (input.thumbprint && pinnedGrants.get(input.thumbprint)) || null,
    unbound_claim_match: false,
    inactive_grant: null,
    pin_conflict: false,
  })),
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
    pinnedGrants.clear();
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
    const headerB64 = Buffer.from(JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" })).toString(
      "base64url"
    );
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
        "signature-input": 'sig=("@method");created=1',
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
    const headerB64 = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "aa-agent+jwt" })).toString(
      "base64url"
    );
    // exp far in the past
    const payloadB64 = Buffer.from(JSON.stringify({ sub: "x", iss: "y", exp: 1000 })).toString(
      "base64url"
    );
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
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ error_code: "AAUTH_REQUIRED" }));
    });

    it("rejects pinned-label requests signed by a key no grant pins", async () => {
      const headerB64 = Buffer.from(JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" })).toString(
        "base64url"
      );
      const payloadB64 = Buffer.from(
        JSON.stringify({
          sub: "someone-else@example.com",
          iss: "https://agent.neotoma.io",
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
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
          "signature-input": 'sig=("@method");created=1',
          "signature-key": "sk",
        },
      });
      const next = vi.fn();
      const { res, status, json } = buildStatusJsonRes();

      await middleware(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.aauth).toBeUndefined();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ error_code: "AAUTH_REQUIRED" }));
    });

    it("accepts pinned-label requests signed by a key whose grant records the sub", async () => {
      pinnedGrants.set("tp-match", {
        grant_id: "ent_grant_site",
        user_id: "user-owner",
        label: "site forwarder",
        capabilities: [],
        status: "active",
        match_thumbprint: "tp-match",
        match_sub: "agent-site@neotoma.io",
      });
      const headerB64 = Buffer.from(JSON.stringify({ alg: "ES256", typ: "aa-agent+jwt" })).toString(
        "base64url"
      );
      const payloadB64 = Buffer.from(
        JSON.stringify({
          sub: "agent-site@neotoma.io",
          iss: "https://agent.neotoma.io",
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
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
          "signature-input": 'sig=("@method");created=1',
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

// Synthetic verifier outcomes exercise wiring and the REAL public fields parser,
// not cryptographic verification, original authority or an admitted grant.
describe("native private delivery candidate", () => {
  const required = ["@method", "@authority", "@path", "content-digest", "signature-key"];
  const result = () =>
    ({
      verified: true,
      label: "chosen",
      keyType: "hwk",
      publicKey: {},
      thumbprint: "synthetic-thumbprint",
      created: 1,
    }) as any;
  const input = (components = required) =>
    `other=("@method");created=1, chosen=(${components.map((c) => JSON.stringify(c)).join(" ")});created=1`;
  const reqFor = (header = input()) =>
    buildReq({
      headers: {
        signature: "chosen=:c3ludGhldGlj:",
        "signature-input": header,
        "signature-key": "chosen=hwk",
        "x-synthetic-array": ["one", "two"],
      },
      rawBody: Buffer.from('{"synthetic":0.76}'),
    });
  beforeEach(() => {
    verifyMock.mockReset();
    pinnedGrants.clear();
  });
  it("retains frozen bytes only for the returned verified label and full coverage", async () => {
    verifyMock.mockResolvedValue(result());
    const req = reqFor();
    await aauthVerify({ authority: "neotoma.io" })(req, {} as any, vi.fn());
    const candidate = req.aauth?.nativeHttpDelivery;
    expect(candidate?.signature_label).toBe("chosen");
    expect(candidate?.covered_components).toEqual(required);
    expect(Buffer.from(candidate.raw_body_bytes_base64, "base64")).toEqual(req.rawBody);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.covered_components)).toBe(true);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });
  it("gives the original verifier private body and header-array copies before await", async () => {
    const req = reqFor();
    const original = Buffer.from(req.rawBody);
    verifyMock.mockImplementation(async (privateInput) => {
      expect(privateInput.headers).not.toBe(req.headers);
      expect((privateInput.headers as any)["x-synthetic-array"]).not.toBe(
        req.headers["x-synthetic-array"]
      );
      expect(privateInput.body).not.toBe(req.rawBody);
      expect(Object.isFrozen(privateInput)).toBe(true);
      expect(Object.isFrozen(privateInput.headers)).toBe(true);
      expect(Object.isFrozen((privateInput.headers as any)["x-synthetic-array"])).toBe(true);
      expect(Reflect.set(privateInput.headers, "signature-input", input(["@method"]))).toBe(false);
      expect(Reflect.set((privateInput.headers as any)["x-synthetic-array"], 0, "changed")).toBe(
        false
      );
      expect(Reflect.set(privateInput, "originalUrl", "/changed")).toBe(false);
      req.rawBody.fill(0);
      req.headers["x-synthetic-array"][0] = "changed";
      req.headers["signature-input"] = input(["@method"]);
      req.originalUrl = "/changed";
      await Promise.resolve();
      expect(privateInput.body).toEqual(original);
      expect((privateInput.headers as any)["x-synthetic-array"]).toEqual(["one", "two"]);
      return result();
    });
    await aauthVerify({ authority: "neotoma.io" })(req, {} as any, vi.fn());
    expect(Buffer.from(req.aauth.nativeHttpDelivery.raw_body_bytes_base64, "base64")).toEqual(
      original
    );
    expect(req.aauth.nativeHttpDelivery.path).toBe("/mcp");
  });
  it.each(required)(
    "never infers missing %s coverage from verified:true or another label",
    async (missing) => {
      verifyMock.mockResolvedValue(result());
      const header = `other=(${required.map((c) => JSON.stringify(c)).join(" ")});created=1, chosen=(${required
        .filter((c) => c !== missing)
        .map((c) => JSON.stringify(c))
        .join(" ")});created=1`;
      const req = reqFor(header);
      await aauthVerify({ authority: "neotoma.io" })(req, {} as any, vi.fn());
      expect(req.aauth.verified).toBe(true);
      expect(req.aauth.nativeHttpDelivery).toBeUndefined();
    }
  );
  it.each([
    'chosen=("@method";req "@authority" "@path" "content-digest" "signature-key");created=1',
    "chosen=token",
    'other=("@method");created=1',
    'malformed="unterminated',
  ])("keeps malformed or unsupported structured fields out of native metadata", async (header) => {
    verifyMock.mockResolvedValue(result());
    const req = reqFor(header);
    await aauthVerify({ authority: "neotoma.io" })(req, {} as any, vi.fn());
    expect(req.aauth.verified).toBe(true);
    expect(req.aauth.nativeHttpDelivery).toBeUndefined();
  });
  it.each(["/mcp?query=1", "/other"])(
    "does not retain a candidate for path %s",
    async (originalUrl) => {
      verifyMock.mockResolvedValue(result());
      const req = reqFor();
      req.originalUrl = originalUrl;
      await aauthVerify({ authority: "neotoma.io" })(req, {} as any, vi.fn());
      expect(req.aauth.nativeHttpDelivery).toBeUndefined();
    }
  );
  it("does not retain a candidate on verifier failure or mutated private input", async () => {
    verifyMock.mockResolvedValue({ ...result(), verified: false });
    let req = reqFor();
    await aauthVerify({ authority: "neotoma.io" })(req, {} as any, vi.fn());
    expect(req.aauth).toBeUndefined();
    verifyMock.mockImplementation(async (privateInput) => {
      (privateInput.body as Buffer).fill(0);
      return result();
    });
    req = reqFor();
    await aauthVerify({ authority: "neotoma.io" })(req, {} as any, vi.fn());
    expect(req.aauth.nativeHttpDelivery).toBeUndefined();
  });
});

it.each(["unsigned", "no-match", "lookup-failure"])(
  "preserves actual per-request metadata across %s admission without granting authority",
  async (kind) => {
    const { attributionContext } = await import("../../src/middleware/attribution_context.js");
    const { aauthAdmission } = await import("../../src/middleware/aauth_admission.js");
    const { runWithRequestContext, getRequestContext } =
      await import("../../src/services/request_context.js");
    const candidate: any = Object.freeze({
      kind: "native-http-delivery-candidate-v1",
      raw_body_bytes_base64: "SYNTHETIC",
    });
    const req = buildReq({
      aauth: kind === "unsigned" ? undefined : { verified: true, nativeHttpDelivery: candidate },
    });
    admissionMock.mockReset();
    if (kind === "lookup-failure")
      admissionMock.mockRejectedValue(new Error("synthetic unavailable"));
    else admissionMock.mockResolvedValue({ admitted: false, reason: "no_match" });
    await runWithRequestContext(
      { agentIdentity: null, nativeHttpDelivery: candidate },
      () =>
        new Promise<void>((resolve, reject) => {
          aauthAdmission()(req, {} as any, () => {
            try {
              expect(getRequestContext()?.nativeHttpDelivery).toBe(candidate);
              expect(getRequestContext()?.aauthAdmission?.admitted).toBe(false);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        })
    );
    if (kind !== "unsigned")
      attributionContext()(req, {} as any, () =>
        expect(getRequestContext()?.nativeHttpDelivery).toBe(candidate)
      );
  }
);
