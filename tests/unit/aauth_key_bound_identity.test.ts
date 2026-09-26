/**
 * Identity-bearing AAuth decisions key on the verified signing key.
 *
 * - The `operator_attested` tier is granted only to a key pinned by an
 *   active grant whose recorded identity is allow-listed, or to a key
 *   whose thumbprint is allow-listed directly.
 * - `NEOTOMA_STRICT_AAUTH_SUBS` compares the `x-agent-label` against the
 *   `match_sub` of the grant that pins the signing key.
 * - Admission refuses a key pinned by active grants under more than one
 *   owner (`grant_pin_conflict`), and that reason fails closed at the
 *   capability layer.
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

import {
  aauthVerify,
  getAAuthContextFromRequest,
  getAttributionDecisionFromRequest,
} from "../../src/middleware/aauth_verify.js";
import { admitFromAAuthContext } from "../../src/services/aauth_admission.js";
import { capabilityCeilingFromAdmission } from "../../src/services/agent_capabilities.js";
import { resetOperatorAllowlistCacheForTests } from "../../src/services/aauth_operator_allowlist.js";
import {
  clearGrantCacheForTests,
  clearMatchDebounceForTests,
} from "../../src/services/agent_grants.js";

const AUTHORITY = "neotoma.test";
const SUB = "worker@swarm.example";
const ISS = "https://issuer.example";
const ALLOWED_ISS = "https://allow.example";
const OWNER_A = "user-owner-a";
const OWNER_B = "user-owner-b";

const ENV_KEYS = [
  "NEOTOMA_OPERATOR_ATTESTED_ISSUERS",
  "NEOTOMA_OPERATOR_ATTESTED_SUBS",
  "NEOTOMA_OPERATOR_ATTESTED_THUMBPRINTS",
  "NEOTOMA_STRICT_AAUTH_SUBS",
  "NEOTOMA_AAUTH_ADMISSION_DISABLED",
] as const;
const savedEnv: Record<string, string | undefined> = {};

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

async function signedRequest(
  key: TestKey,
  claims: { sub: string; iss: string },
  extraHeaders: Record<string, string> = {}
) {
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
    headers: { ...flat, ...extraHeaders },
    rawBody: undefined,
  } as any;
}

async function runVerify(req: any) {
  const middleware = aauthVerify({ authority: AUTHORITY, strict: true });
  const next = vi.fn();
  const json = vi.fn();
  const res: any = { status: vi.fn(() => ({ json })), json };
  await middleware(req, res, next);
  return { next, res, json };
}

function putGrant(id: string, owner: string, fields: Record<string, unknown>, observedAt?: string) {
  grantRows.push({
    entity_id: id,
    user_id: owner,
    snapshot: {
      label: `grant ${id}`,
      status: "active",
      capabilities: [{ op: "retrieve", entity_types: ["task"] }],
      ...fields,
    },
    last_observation_at: observedAt ?? "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
  });
}

beforeEach(() => {
  grantRows.length = 0;
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  resetOperatorAllowlistCacheForTests();
  clearGrantCacheForTests();
  clearMatchDebounceForTests();
});

afterEach(() => {
  grantRows.length = 0;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetOperatorAllowlistCacheForTests();
  clearGrantCacheForTests();
});

describe("operator_attested tier is bound to the verified key", () => {
  it("an allow-listed issuer claimed by a key no grant pins resolves to software", async () => {
    process.env.NEOTOMA_OPERATOR_ATTESTED_ISSUERS = ALLOWED_ISS;
    const key = await freshKey();
    const req = await signedRequest(key, { sub: SUB, iss: ALLOWED_ISS });

    const { next } = await runVerify(req);

    expect(next).toHaveBeenCalledTimes(1);
    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.signature_verified).toBe(true);
    expect(decision?.resolved_tier).toBe("software");
    expect(decision?.operator_allowlist_source).toBeUndefined();
  });

  it("an allow-listed issuer:subject claimed by a key no grant pins resolves to software", async () => {
    process.env.NEOTOMA_OPERATOR_ATTESTED_SUBS = `${ALLOWED_ISS}:${SUB}`;
    const key = await freshKey();
    const req = await signedRequest(key, { sub: SUB, iss: ALLOWED_ISS });

    await runVerify(req);

    expect(getAttributionDecisionFromRequest(req)?.resolved_tier).toBe("software");
  });

  it("a key pinned by an active grant whose match_iss is allow-listed is operator_attested", async () => {
    process.env.NEOTOMA_OPERATOR_ATTESTED_ISSUERS = ALLOWED_ISS;
    const key = await freshKey();
    putGrant("ent_grant_allowed", OWNER_A, {
      match_sub: SUB,
      match_iss: ALLOWED_ISS,
      match_thumbprint: key.thumbprint,
    });
    const req = await signedRequest(key, { sub: SUB, iss: ALLOWED_ISS });

    await runVerify(req);

    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("operator_attested");
    expect(decision?.operator_allowlist_source).toBe("issuer");
  });

  it("a key pinned by an active grant whose iss:sub is allow-listed is operator_attested", async () => {
    process.env.NEOTOMA_OPERATOR_ATTESTED_SUBS = `${ALLOWED_ISS}:${SUB}`;
    const key = await freshKey();
    putGrant("ent_grant_allowed", OWNER_A, {
      match_sub: SUB,
      match_iss: ALLOWED_ISS,
      match_thumbprint: key.thumbprint,
    });
    const req = await signedRequest(key, { sub: SUB, iss: ALLOWED_ISS });

    await runVerify(req);

    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("operator_attested");
    expect(decision?.operator_allowlist_source).toBe("issuer_subject");
  });

  it("a pinned key whose grant records a different issuer is not promoted by the token's issuer", async () => {
    process.env.NEOTOMA_OPERATOR_ATTESTED_ISSUERS = ALLOWED_ISS;
    const key = await freshKey();
    putGrant("ent_grant_other_iss", OWNER_A, {
      match_sub: SUB,
      match_iss: ISS,
      match_thumbprint: key.thumbprint,
    });
    const req = await signedRequest(key, { sub: SUB, iss: ALLOWED_ISS });

    await runVerify(req);

    expect(getAttributionDecisionFromRequest(req)?.resolved_tier).toBe("software");
  });

  it("a thumbprint-only grant does not take the tier from the token's issuer", async () => {
    process.env.NEOTOMA_OPERATOR_ATTESTED_ISSUERS = ALLOWED_ISS;
    const key = await freshKey();
    putGrant("ent_grant_tp_only", OWNER_A, { match_thumbprint: key.thumbprint });
    const req = await signedRequest(key, { sub: SUB, iss: ALLOWED_ISS });

    await runVerify(req);

    expect(getAttributionDecisionFromRequest(req)?.resolved_tier).toBe("software");
  });

  it("a suspended grant pinning the key does not confer the tier", async () => {
    process.env.NEOTOMA_OPERATOR_ATTESTED_ISSUERS = ALLOWED_ISS;
    const key = await freshKey();
    putGrant("ent_grant_suspended", OWNER_A, {
      match_sub: SUB,
      match_iss: ALLOWED_ISS,
      match_thumbprint: key.thumbprint,
      status: "suspended",
    });
    const req = await signedRequest(key, { sub: SUB, iss: ALLOWED_ISS });

    await runVerify(req);

    expect(getAttributionDecisionFromRequest(req)?.resolved_tier).toBe("software");
  });

  it("an allow-listed thumbprint is operator_attested with source thumbprint", async () => {
    const key = await freshKey();
    process.env.NEOTOMA_OPERATOR_ATTESTED_THUMBPRINTS = key.thumbprint;
    const req = await signedRequest(key, { sub: SUB, iss: ISS });

    await runVerify(req);

    const decision = getAttributionDecisionFromRequest(req);
    expect(decision?.resolved_tier).toBe("operator_attested");
    expect(decision?.operator_allowlist_source).toBe("thumbprint");
  });

  it("a thumbprint allow-list entry does not promote a different key", async () => {
    const listed = await freshKey();
    const other = await freshKey();
    process.env.NEOTOMA_OPERATOR_ATTESTED_THUMBPRINTS = listed.thumbprint;
    const req = await signedRequest(other, { sub: SUB, iss: ISS });

    await runVerify(req);

    expect(getAttributionDecisionFromRequest(req)?.resolved_tier).toBe("software");
  });

  it("a key pinned under more than one owner is not promoted", async () => {
    process.env.NEOTOMA_OPERATOR_ATTESTED_ISSUERS = ALLOWED_ISS;
    const key = await freshKey();
    putGrant("ent_grant_a", OWNER_A, {
      match_sub: SUB,
      match_iss: ALLOWED_ISS,
      match_thumbprint: key.thumbprint,
    });
    putGrant("ent_grant_b", OWNER_B, {
      match_sub: SUB,
      match_iss: ALLOWED_ISS,
      match_thumbprint: key.thumbprint,
    });
    const req = await signedRequest(key, { sub: SUB, iss: ALLOWED_ISS });

    await runVerify(req);

    expect(getAttributionDecisionFromRequest(req)?.resolved_tier).toBe("software");
  });
});

describe("NEOTOMA_STRICT_AAUTH_SUBS compares against the pinned grant's sub", () => {
  const LABEL = "agent-site@neotoma.io";

  it("rejects a signed request whose key no grant pins, even when the token claims the sub", async () => {
    process.env.NEOTOMA_STRICT_AAUTH_SUBS = LABEL;
    const key = await freshKey();
    const req = await signedRequest(key, { sub: LABEL, iss: ISS }, { "x-agent-label": LABEL });

    const { next, res } = await runVerify(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(getAAuthContextFromRequest(req)).toBeNull();
  });

  it("rejects when the pinned grant records a different sub", async () => {
    process.env.NEOTOMA_STRICT_AAUTH_SUBS = LABEL;
    const key = await freshKey();
    putGrant("ent_grant_other_sub", OWNER_A, {
      match_sub: "someone-else@example.com",
      match_thumbprint: key.thumbprint,
    });
    const req = await signedRequest(key, { sub: LABEL, iss: ISS }, { "x-agent-label": LABEL });

    const { next, res } = await runVerify(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects when the key is pinned under more than one owner", async () => {
    process.env.NEOTOMA_STRICT_AAUTH_SUBS = LABEL;
    const key = await freshKey();
    putGrant("ent_grant_a", OWNER_A, { match_sub: LABEL, match_thumbprint: key.thumbprint });
    putGrant("ent_grant_b", OWNER_B, { match_sub: LABEL, match_thumbprint: key.thumbprint });
    const req = await signedRequest(key, { sub: LABEL, iss: ISS }, { "x-agent-label": LABEL });

    const { next, res } = await runVerify(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("accepts when the grant pinning the key records the labelled sub", async () => {
    process.env.NEOTOMA_STRICT_AAUTH_SUBS = LABEL;
    const key = await freshKey();
    putGrant("ent_grant_site", OWNER_A, { match_sub: LABEL, match_thumbprint: key.thumbprint });
    const req = await signedRequest(key, { sub: LABEL, iss: ISS }, { "x-agent-label": LABEL });

    const { next } = await runVerify(req);

    expect(next).toHaveBeenCalledTimes(1);
    expect(getAAuthContextFromRequest(req)?.thumbprint).toBe(key.thumbprint);
  });
});

describe("admission refuses a key pinned under more than one owner", () => {
  async function admit(req: any) {
    const { next } = await runVerify(req);
    expect(next).toHaveBeenCalledTimes(1);
    return admitFromAAuthContext(getAAuthContextFromRequest(req));
  }

  it("two active grants under different owners pinning the same key: grant_pin_conflict", async () => {
    const key = await freshKey();
    putGrant(
      "ent_grant_a",
      OWNER_A,
      { match_sub: SUB, match_thumbprint: key.thumbprint },
      "2026-09-01T00:00:00.000Z"
    );
    putGrant(
      "ent_grant_b",
      OWNER_B,
      { match_sub: SUB, match_thumbprint: key.thumbprint },
      "2026-09-02T00:00:00.000Z"
    );

    const admission = await admit(await signedRequest(key, { sub: SUB, iss: ISS }));

    expect(admission.admitted).toBe(false);
    expect(admission.reason).toBe("grant_pin_conflict");
    expect(admission.user_id).toBeUndefined();
    expect(admission.grant_id).toBeUndefined();
    expect(admission.capabilities).toBeUndefined();
  });

  it("grant_pin_conflict maps to the deny ceiling", () => {
    expect(capabilityCeilingFromAdmission({ admitted: false, reason: "grant_pin_conflict" })).toEqual(
      { kind: "deny", reason: "grant_pin_conflict" }
    );
  });

  it("an inactive grant under another owner does not block admission", async () => {
    const key = await freshKey();
    putGrant("ent_grant_a", OWNER_A, { match_sub: SUB, match_thumbprint: key.thumbprint });
    putGrant("ent_grant_b", OWNER_B, {
      match_sub: SUB,
      match_thumbprint: key.thumbprint,
      status: "revoked",
    });

    const admission = await admit(await signedRequest(key, { sub: SUB, iss: ISS }));

    expect(admission.admitted).toBe(true);
    expect(admission.user_id).toBe(OWNER_A);
  });

  it("two active grants under the same owner pinning the same key still admit", async () => {
    const key = await freshKey();
    putGrant(
      "ent_grant_a1",
      OWNER_A,
      { match_sub: SUB, match_thumbprint: key.thumbprint },
      "2026-09-01T00:00:00.000Z"
    );
    putGrant(
      "ent_grant_a2",
      OWNER_A,
      { match_sub: SUB, match_thumbprint: key.thumbprint },
      "2026-09-02T00:00:00.000Z"
    );

    const admission = await admit(await signedRequest(key, { sub: SUB, iss: ISS }));

    expect(admission.admitted).toBe(true);
    expect(admission.user_id).toBe(OWNER_A);
    expect(admission.grant_id).toBe("ent_grant_a2");
  });
});
