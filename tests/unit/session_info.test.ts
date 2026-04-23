/**
 * Unit tests for `src/services/session_info.ts`.
 *
 * Covers the three observable outputs of the `/session` +
 * `get_session_identity` surface:
 *   1. Attribution block (tier + identity fields) assembled from the
 *      resolved {@link AgentIdentity}.
 *   2. Decision diagnostic merging (signature-side from the middleware +
 *      client-info normalisation reason computed here).
 *   3. `eligible_for_trusted_writes` convenience flag tracks the same
 *      policy surface `enforceAttributionPolicy` uses, so clients can use
 *      `/session` as a preflight.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import { buildSessionInfo } from "../../src/services/session_info.js";

const ENV_KEYS = [
  "NEOTOMA_ATTRIBUTION_POLICY",
  "NEOTOMA_MIN_ATTRIBUTION_TIER",
  "NEOTOMA_ATTRIBUTION_POLICY_JSON",
] as const;

describe("buildSessionInfo", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("returns anonymous tier + allow policy for an unattributed session", () => {
    const session = buildSessionInfo({
      userId: "user-anon",
      identity: null,
    });

    expect(session.user_id).toBe("user-anon");
    expect(session.attribution.tier).toBe("anonymous");
    expect(session.attribution.agent_thumbprint).toBeUndefined();
    expect(session.policy.anonymous_writes).toBe("allow");
    expect(session.eligible_for_trusted_writes).toBe(true);
  });

  it("populates identity fields from a hardware-tier AAuth identity", () => {
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256"}',
      thumbprint: "tp-hw",
      algorithm: "ES256",
      sub: "agent:hw",
      iss: "https://agent.example",
      clientName: "ateles",
      clientVersion: "0.1.0",
      connectionId: "conn_1",
    });

    const session = buildSessionInfo({
      userId: "user-hw",
      identity,
    });

    expect(session.attribution.tier).toBe("hardware");
    expect(session.attribution.agent_thumbprint).toBe("tp-hw");
    expect(session.attribution.agent_sub).toBe("agent:hw");
    expect(session.attribution.agent_algorithm).toBe("ES256");
    expect(session.attribution.client_name).toBe("ateles");
    expect(session.attribution.client_version).toBe("0.1.0");
    expect(session.attribution.connection_id).toBe("conn_1");
    expect(session.eligible_for_trusted_writes).toBe(true);
  });

  it("surfaces the normalisation reason when a generic clientInfo.name is dropped", () => {
    const session = buildSessionInfo({
      userId: "user-generic",
      identity: null,
      rawClientInfoName: "mcp",
    });
    expect(session.attribution.decision).toBeDefined();
    expect(session.attribution.decision!.client_info_raw_name).toBe("mcp");
    expect(
      session.attribution.decision!.client_info_normalised_to_null_reason,
    ).toBe("too_generic");
    expect(session.attribution.decision!.resolved_tier).toBe("anonymous");
  });

  it("mirrors the middleware signature decision onto the session decision", () => {
    const session = buildSessionInfo({
      userId: "user-sigfail",
      identity: null,
      middlewareDecision: {
        signature_present: true,
        signature_verified: false,
        signature_error_code: "signature_expired",
        resolved_tier: "anonymous",
      },
      rawClientInfoName: null,
    });
    expect(session.attribution.decision).toMatchObject({
      signature_present: true,
      signature_verified: false,
      signature_error_code: "signature_expired",
      resolved_tier: "anonymous",
    });
  });

  it("sets eligible_for_trusted_writes=false when reject mode applies to anonymous", () => {
    process.env.NEOTOMA_ATTRIBUTION_POLICY = "reject";
    const session = buildSessionInfo({
      userId: "user-rejected",
      identity: null,
    });
    expect(session.policy.anonymous_writes).toBe("reject");
    expect(session.eligible_for_trusted_writes).toBe(false);
  });

  it("sets eligible_for_trusted_writes=false when identity is below min_tier", () => {
    process.env.NEOTOMA_MIN_ATTRIBUTION_TIER = "software";
    const identity = createAgentIdentity({ clientName: "Claude Code" });
    expect(identity.tier).toBe("unverified_client");
    const session = buildSessionInfo({
      userId: "user-below-floor",
      identity,
    });
    expect(session.eligible_for_trusted_writes).toBe(false);
  });

  it("per-path override on observations flips eligibility independently", () => {
    process.env.NEOTOMA_ATTRIBUTION_POLICY_JSON = JSON.stringify({
      observations: "reject",
    });
    const session = buildSessionInfo({
      userId: "user-ppath",
      identity: null,
    });
    expect(session.policy.per_path).toEqual({ observations: "reject" });
    expect(session.eligible_for_trusted_writes).toBe(false);
  });
});
