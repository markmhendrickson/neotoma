/**
 * Unit tests for `src/services/aauth_admission.ts`.
 *
 * Covers the deterministic branches of `admitFromAAuthContext`:
 *
 *   - null / unverified context → `not_signed`
 *   - admission disabled via env → `aauth_disabled`
 *   - lookup error → `no_match`
 *   - no grant matched → `no_match`
 *   - matched grant in `suspended` / `revoked` state → corresponding
 *     `grant_suspended` / `grant_revoked` reason
 *   - active grant → `admitted` with user_id / grant_id / capabilities
 *
 * The grants service is stubbed via `vi.mock` so this test never
 * touches SQLite.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AAuthRequestContext } from "../../src/crypto/agent_identity.js";

vi.mock("../../src/services/agent_grants.js", () => ({
  findActiveGrantByIdentity: vi.fn(),
  recordMatch: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  findActiveGrantByIdentity,
  recordMatch,
} from "../../src/services/agent_grants.js";
import { admitFromAAuthContext } from "../../src/services/aauth_admission.js";

const findMock = vi.mocked(findActiveGrantByIdentity);
const recordMock = vi.mocked(recordMatch);

const VERIFIED_CTX: AAuthRequestContext = {
  verified: true,
  sub: "agent-cli@example.com",
  iss: "https://agent.example.com",
  thumbprint: "tp-cli",
  algorithm: "ES256",
  publicKey: '{"kty":"EC"}',
  decision: {
    signature_present: true,
    signature_verified: true,
    resolved_tier: "software",
  },
} as unknown as AAuthRequestContext;

beforeEach(() => {
  findMock.mockReset();
  recordMock.mockReset();
  recordMock.mockResolvedValue(undefined);
  delete process.env.NEOTOMA_AAUTH_ADMISSION_DISABLED;
});

afterEach(() => {
  delete process.env.NEOTOMA_AAUTH_ADMISSION_DISABLED;
});

describe("admitFromAAuthContext", () => {
  it("returns `not_signed` for null context", async () => {
    const result = await admitFromAAuthContext(null);
    expect(result).toEqual({ admitted: false, reason: "not_signed" });
    expect(findMock).not.toHaveBeenCalled();
  });

  it("returns `not_signed` for unverified context", async () => {
    const result = await admitFromAAuthContext({
      ...VERIFIED_CTX,
      verified: false,
    } as AAuthRequestContext);
    expect(result.admitted).toBe(false);
    expect(result.reason).toBe("not_signed");
    expect(findMock).not.toHaveBeenCalled();
  });

  it("returns `aauth_disabled` when the kill switch is set", async () => {
    process.env.NEOTOMA_AAUTH_ADMISSION_DISABLED = "1";
    const result = await admitFromAAuthContext(VERIFIED_CTX);
    expect(result).toEqual({ admitted: false, reason: "aauth_disabled" });
    expect(findMock).not.toHaveBeenCalled();
  });

  it("returns `no_match` when the grant lookup throws", async () => {
    findMock.mockRejectedValueOnce(new Error("db unavailable"));
    const result = await admitFromAAuthContext(VERIFIED_CTX);
    expect(result.admitted).toBe(false);
    expect(result.reason).toBe("no_match");
  });

  it("returns `no_match` when no grant matches the identity", async () => {
    findMock.mockResolvedValueOnce(null);
    const result = await admitFromAAuthContext(VERIFIED_CTX);
    expect(result).toEqual({ admitted: false, reason: "no_match" });
    expect(findMock).toHaveBeenCalledWith({
      sub: "agent-cli@example.com",
      iss: "https://agent.example.com",
      thumbprint: "tp-cli",
    });
  });

  it("returns `grant_suspended` for a suspended grant", async () => {
    findMock.mockResolvedValueOnce({
      grant_id: "ent_grant_susp",
      user_id: "usr_owner",
      label: "Suspended grant",
      capabilities: [],
      status: "suspended",
      match_sub: "agent-cli@example.com",
      match_iss: null,
      match_thumbprint: null,
    });
    const result = await admitFromAAuthContext(VERIFIED_CTX);
    expect(result.admitted).toBe(false);
    expect(result.reason).toBe("grant_suspended");
    expect(result.grant_id).toBe("ent_grant_susp");
    expect(result.user_id).toBe("usr_owner");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("returns `grant_revoked` for a revoked grant", async () => {
    findMock.mockResolvedValueOnce({
      grant_id: "ent_grant_rev",
      user_id: "usr_owner",
      label: "Revoked grant",
      capabilities: [],
      status: "revoked",
      match_sub: "agent-cli@example.com",
      match_iss: null,
      match_thumbprint: null,
    });
    const result = await admitFromAAuthContext(VERIFIED_CTX);
    expect(result.admitted).toBe(false);
    expect(result.reason).toBe("grant_revoked");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("returns admitted result for an active grant", async () => {
    const grant = {
      grant_id: "ent_grant_active",
      user_id: "usr_owner",
      label: "Cursor on macbook-pro",
      capabilities: [
        { op: "store_structured" as const, entity_types: ["task"] },
      ],
      status: "active" as const,
      match_sub: "agent-cli@example.com",
      match_iss: "https://agent.example.com",
      match_thumbprint: "tp-cli",
    };
    findMock.mockResolvedValueOnce(grant);
    const result = await admitFromAAuthContext(VERIFIED_CTX);
    expect(result.admitted).toBe(true);
    expect(result.reason).toBe("admitted");
    expect(result.user_id).toBe("usr_owner");
    expect(result.grant_id).toBe("ent_grant_active");
    expect(result.agent_label).toBe("Cursor on macbook-pro");
    expect(result.capabilities).toEqual(grant.capabilities);
    // Best-effort match recording fires off without awaiting.
    await new Promise((resolve) => setImmediate(resolve));
    expect(recordMock).toHaveBeenCalledWith(grant);
  });

  it("does not throw when recordMatch rejects (best-effort)", async () => {
    findMock.mockResolvedValueOnce({
      grant_id: "ent_grant_active",
      user_id: "usr_owner",
      label: "test",
      capabilities: [],
      status: "active",
      match_sub: "agent-cli@example.com",
      match_iss: null,
      match_thumbprint: null,
    });
    recordMock.mockRejectedValueOnce(new Error("transient"));
    const result = await admitFromAAuthContext(VERIFIED_CTX);
    expect(result.admitted).toBe(true);
    // Allow the unawaited recordMatch.catch() handler to run.
    await new Promise((resolve) => setImmediate(resolve));
  });
});
