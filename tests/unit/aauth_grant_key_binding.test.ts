/**
 * Grant admission requires a key binding (`match_thumbprint`).
 *
 * Uses real RFC 9421 signatures, the real `aauthVerify` middleware and
 * the real grant lookup in `agent_grants.ts`; only the storage layer
 * (entity query + owner lookup) is stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair, type JWK } from "jose";
import { fetch as signedFetch } from "@hellocoop/httpsig";

type GrantRow = {
  entity_id: string;
  user_id: string;
  snapshot: Record<string, unknown>;
  last_observation_at: string;
  created_at: string;
};

const grantRows: GrantRow[] = [];

vi.mock("../../src/services/entity_queries.js", () => ({
  queryEntities: vi.fn(async () =>
    grantRows.map((r) => ({
      entity_id: r.entity_id,
      snapshot: r.snapshot,
      last_observation_at: r.last_observation_at,
      created_at: r.created_at,
    }))
  ),
  getEntityWithProvenance: vi.fn(async () => null),
}));

vi.mock("../../src/db.js", () => ({
  db: {
    from: () => {
      let id: string | null = null;
      const chain = {
        select: () => chain,
        eq: (_col: string, value: string) => {
          id = value;
          return chain;
        },
        maybeSingle: async () => {
          const row = grantRows.find((r) => r.entity_id === id);
          return row
            ? { data: { user_id: row.user_id, entity_type: "agent_grant" }, error: null }
            : { data: null, error: null };
        },
      };
      return chain;
    },
  },
}));

vi.mock("../../src/services/correction.js", () => ({
  createCorrection: vi.fn(async () => ({})),
}));

import { aauthVerify, getAAuthContextFromRequest } from "../../src/middleware/aauth_verify.js";
import { attributionContext } from "../../src/middleware/attribution_context.js";
import { aauthAdmission } from "../../src/middleware/aauth_admission.js";
import { admitFromAAuthContext } from "../../src/services/aauth_admission.js";
import {
  AgentCapabilityError,
  contextFromAgentIdentity,
  enforceAgentCapability,
} from "../../src/services/agent_capabilities.js";
import { getCurrentAgentIdentity } from "../../src/services/request_context.js";
import {
  clearGrantCacheForTests,
  clearMatchDebounceForTests,
  grantAdmissionWarnings,
} from "../../src/services/agent_grants.js";

const AUTHORITY = "neotoma.test";
const SUB = "worker@swarm.example";
const ISS = "https://issuer.example";
const OWNER = "user-owner-1";

interface TestKey {
  privateJwk: JWK;
  publicJwk: JWK;
  thumbprint: string;
}

async function freshKey(): Promise<TestKey> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  privateJwk.alg = "ES256";
  publicJwk.alg = "ES256";
  const thumbprint = await calculateJwkThumbprint(publicJwk);
  return { privateJwk, publicJwk, thumbprint };
}

/** Sign a GET request the way an AAuth agent does (`jwt` Signature-Key). */
async function signedRequest(key: TestKey, claims: { sub: string; iss: string }) {
  const { importJWK } = await import("jose");
  const signingKey = await importJWK(key.privateJwk, "ES256");
  const jwt = await new SignJWT({ cnf: { jwk: key.publicJwk } })
    .setProtectedHeader({ alg: "ES256", typ: "aa-agent+jwt" })
    .setSubject(claims.sub)
    .setIssuer(claims.iss)
    .setIssuedAt()
    .setExpirationTime("300s")
    .sign(signingKey);

  const { headers } = (await signedFetch(`https://${AUTHORITY}/entities`, {
    method: "GET",
    signingKey: key.privateJwk as unknown as JsonWebKey,
    signatureKey: { type: "jwt", jwt },
    label: "aasig",
    dryRun: true,
  })) as unknown as { headers: Headers };

  const flat: Record<string, string> = {};
  headers.forEach((v, k) => {
    flat[k] = v;
  });
  return {
    method: "GET",
    protocol: "https",
    hostname: AUTHORITY,
    originalUrl: "/entities",
    headers: flat,
    rawBody: undefined,
  } as any;
}

async function verifyAndAdmit(req: any) {
  const middleware = aauthVerify({ authority: AUTHORITY, strict: true });
  const next = vi.fn();
  const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
  await middleware(req, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  const ctx = getAAuthContextFromRequest(req);
  expect(ctx?.verified).toBe(true);
  return { ctx: ctx!, admission: await admitFromAAuthContext(ctx) };
}

function putGrant(id: string, fields: Record<string, unknown>) {
  grantRows.push({
    entity_id: id,
    user_id: OWNER,
    snapshot: {
      label: `grant ${id}`,
      status: "active",
      capabilities: [{ op: "retrieve", entity_types: ["task"] }],
      ...fields,
    },
    last_observation_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
  });
}

beforeEach(() => {
  grantRows.length = 0;
  clearGrantCacheForTests();
  clearMatchDebounceForTests();
  delete process.env.NEOTOMA_AAUTH_ADMISSION_DISABLED;
});

afterEach(() => {
  grantRows.length = 0;
  clearGrantCacheForTests();
});

describe("grant admission requires a key binding", () => {
  it("sub+iss grant without a thumbprint pin does not admit; reason grant_key_unbound", async () => {
    putGrant("ent_grant_subiss", { match_sub: SUB, match_iss: ISS });
    const otherKey = await freshKey();

    const { ctx, admission } = await verifyAndAdmit(
      await signedRequest(otherKey, { sub: SUB, iss: ISS })
    );

    expect(ctx.sub).toBe(SUB);
    expect(ctx.iss).toBe(ISS);
    expect(ctx.thumbprint).toBe(otherKey.thumbprint);
    expect(admission.admitted).toBe(false);
    expect(admission.reason).toBe("grant_key_unbound");
    expect(admission.user_id).toBeUndefined();
    expect(admission.capabilities).toBeUndefined();
  });

  it("sub-only grant without a thumbprint pin does not admit", async () => {
    putGrant("ent_grant_subonly", { match_sub: SUB });
    const otherKey = await freshKey();

    const { admission } = await verifyAndAdmit(
      await signedRequest(otherKey, { sub: SUB, iss: "https://anything.example" })
    );

    expect(admission.admitted).toBe(false);
    expect(admission.reason).toBe("grant_key_unbound");
  });

  it("admits the key pinned by match_thumbprint", async () => {
    const agent = await freshKey();
    putGrant("ent_grant_pinned", {
      match_sub: SUB,
      match_iss: ISS,
      match_thumbprint: agent.thumbprint,
    });

    const { admission } = await verifyAndAdmit(await signedRequest(agent, { sub: SUB, iss: ISS }));

    expect(admission.admitted).toBe(true);
    expect(admission.reason).toBe("admitted");
    expect(admission.grant_id).toBe("ent_grant_pinned");
    expect(admission.user_id).toBe(OWNER);
  });

  it("pinned grant does not admit a key other than the pinned one", async () => {
    const agent = await freshKey();
    putGrant("ent_grant_pinned", {
      match_sub: SUB,
      match_iss: ISS,
      match_thumbprint: agent.thumbprint,
    });
    const otherKey = await freshKey();

    const { admission } = await verifyAndAdmit(
      await signedRequest(otherKey, { sub: SUB, iss: ISS })
    );

    expect(admission.admitted).toBe(false);
    expect(admission.reason).toBe("no_match");
  });

  it("identity cache is keyed by the presented key", async () => {
    const agent = await freshKey();
    putGrant("ent_grant_pinned", {
      match_sub: SUB,
      match_iss: ISS,
      match_thumbprint: agent.thumbprint,
    });

    const first = await verifyAndAdmit(await signedRequest(agent, { sub: SUB, iss: ISS }));
    expect(first.admission.admitted).toBe(true);

    const otherKey = await freshKey();
    const second = await verifyAndAdmit(await signedRequest(otherKey, { sub: SUB, iss: ISS }));
    expect(second.admission.admitted).toBe(false);
  });

  it("thumbprint-only grant admits its key", async () => {
    const agent = await freshKey();
    putGrant("ent_grant_tp_only", { match_thumbprint: agent.thumbprint });

    const { admission } = await verifyAndAdmit(
      await signedRequest(agent, { sub: "some-other-label", iss: ISS })
    );

    expect(admission.admitted).toBe(true);
    expect(admission.grant_id).toBe("ent_grant_tp_only");
  });
});

/**
 * Capability limits for signed requests that also carry a bearer token.
 *
 * Authentication and the capability ceiling are separate decisions: the
 * bearer token decides who the caller is, and the grant the signature
 * names decides what a capability-gated write may touch. These cases run
 * the real middleware chain (`aauthVerify` -> `attributionContext` ->
 * `aauthAdmission`) and the real capability gate.
 */
describe("capability limits for signed requests", () => {
  const WRITE_TYPE_IN_GRANT = "neotoma_feedback";
  const WRITE_TYPE_OUTSIDE_GRANT = "task";
  const GRANT_CAPS = [{ op: "store_structured", entity_types: [WRITE_TYPE_IN_GRANT] }];

  let savedDefaultDeny: string | undefined;
  beforeEach(() => {
    savedDefaultDeny = process.env.NEOTOMA_AGENT_DEFAULT_DENY;
    // The default configuration: no default-deny.
    delete process.env.NEOTOMA_AGENT_DEFAULT_DENY;
  });
  afterEach(() => {
    if (savedDefaultDeny === undefined) delete process.env.NEOTOMA_AGENT_DEFAULT_DENY;
    else process.env.NEOTOMA_AGENT_DEFAULT_DENY = savedDefaultDeny;
  });

  type WriteOutcome = { allowed: true } | { allowed: false; error: unknown };

  /**
   * Drive `req` through the request middleware and attempt a
   * capability-gated `store_structured` write of `entityType`.
   */
  async function attemptWrite(req: any, entityType: string): Promise<WriteOutcome> {
    const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
    return new Promise<WriteOutcome>((resolve, reject) => {
      const verify = aauthVerify({ authority: AUTHORITY, strict: true });
      void verify(req, res, () => {
        attributionContext()(req, res, () => {
          aauthAdmission()(req, res, () => {
            try {
              const ctx = contextFromAgentIdentity(getCurrentAgentIdentity());
              if (ctx) enforceAgentCapability("store_structured", [entityType], ctx);
              resolve({ allowed: true });
            } catch (error) {
              resolve({ allowed: false, error });
            }
          });
        });
      }).catch(reject);
    });
  }

  function withBearer(req: any) {
    req.headers = { ...req.headers, authorization: "Bearer test-operator-token" };
    return req;
  }

  it("unpinned grant + bearer + signature: a write outside the grant is denied", async () => {
    putGrant("ent_grant_unpinned", { match_sub: SUB, match_iss: ISS, capabilities: GRANT_CAPS });
    const agent = await freshKey();

    const outcome = await attemptWrite(
      withBearer(await signedRequest(agent, { sub: SUB, iss: ISS })),
      WRITE_TYPE_OUTSIDE_GRANT
    );

    expect(outcome.allowed).toBe(false);
    const error = (outcome as { error: unknown }).error;
    expect(error).toBeInstanceOf(AgentCapabilityError);
    expect((error as AgentCapabilityError).code).toBe("capability_denied");
    expect((error as AgentCapabilityError).hint).toContain("match_thumbprint");
  });

  it("unpinned grant + bearer + signature: capability-gated writes fail closed", async () => {
    putGrant("ent_grant_unpinned", { match_sub: SUB, match_iss: ISS, capabilities: GRANT_CAPS });
    const agent = await freshKey();

    const outcome = await attemptWrite(
      withBearer(await signedRequest(agent, { sub: SUB, iss: ISS })),
      WRITE_TYPE_IN_GRANT
    );

    expect(outcome.allowed).toBe(false);
    expect((outcome as { error: unknown }).error).toBeInstanceOf(AgentCapabilityError);
  });

  it("pinned grant: the grant's limits apply as before", async () => {
    const agent = await freshKey();
    putGrant("ent_grant_pinned", {
      match_sub: SUB,
      match_iss: ISS,
      match_thumbprint: agent.thumbprint,
      capabilities: GRANT_CAPS,
    });

    const inside = await attemptWrite(
      withBearer(await signedRequest(agent, { sub: SUB, iss: ISS })),
      WRITE_TYPE_IN_GRANT
    );
    expect(inside.allowed).toBe(true);

    const outside = await attemptWrite(
      withBearer(await signedRequest(agent, { sub: SUB, iss: ISS })),
      WRITE_TYPE_OUTSIDE_GRANT
    );
    expect(outside.allowed).toBe(false);
    expect((outside as { error: unknown }).error).toBeInstanceOf(AgentCapabilityError);
  });

  it("bearer only (no signature): the capability gate is unchanged", async () => {
    putGrant("ent_grant_unpinned", { match_sub: SUB, match_iss: ISS, capabilities: GRANT_CAPS });
    const req: any = withBearer({
      method: "GET",
      protocol: "https",
      hostname: AUTHORITY,
      originalUrl: "/entities",
      path: "/entities",
      headers: { "x-client-name": "some-client" },
      rawBody: undefined,
    });

    const outcome = await attemptWrite(req, WRITE_TYPE_OUTSIDE_GRANT);

    expect(outcome.allowed).toBe(true);
  });

  it("signed request with no grant naming it: unchanged (default-deny decides)", async () => {
    const agent = await freshKey();

    const outcome = await attemptWrite(
      withBearer(await signedRequest(agent, { sub: "unrelated@example", iss: ISS })),
      WRITE_TYPE_OUTSIDE_GRANT
    );

    expect(outcome.allowed).toBe(true);
  });
});

describe("grant write warnings", () => {
  it("warns when a grant pins no key", () => {
    const warnings = grantAdmissionWarnings({ match_thumbprint: null, status: "active" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("match_thumbprint");
    expect(warnings[0]).toContain("pin-a-key-to-an-existing-grant");
  });

  it("does not warn for a pinned grant or a revoked one", () => {
    expect(grantAdmissionWarnings({ match_thumbprint: "tp-abc", status: "active" })).toEqual([]);
    expect(grantAdmissionWarnings({ match_thumbprint: "  ", status: "suspended" })).toHaveLength(1);
    expect(grantAdmissionWarnings({ match_thumbprint: null, status: "revoked" })).toEqual([]);
  });
});
