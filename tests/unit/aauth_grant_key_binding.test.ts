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
import { admitFromAAuthContext } from "../../src/services/aauth_admission.js";
import {
  clearGrantCacheForTests,
  clearMatchDebounceForTests,
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
