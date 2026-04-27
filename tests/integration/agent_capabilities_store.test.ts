/**
 * Integration test: capability scoping at the action boundary now reads
 * from the AAuth admission record stored on the request context (set
 * by `aauth_admission` middleware), not from the legacy env registry.
 *
 * The legacy env-config code paths have been removed by the Stronger
 * AAuth Admission plan. This test plugs directly into the request-
 * context AsyncLocalStorage the same way the admission middleware does
 * and asserts that `enforceAgentCapability` behaves correctly when:
 *
 * 1. The admitted grant covers the requested (op, entity_type).
 * 2. The admitted grant does NOT cover the (op, entity_type).
 * 3. The agent is signature-verified but unadmitted (no grant matched)
 *    and `NEOTOMA_AGENT_DEFAULT_DENY` is unset → allowed.
 * 4. Same as (3) but with `NEOTOMA_AGENT_DEFAULT_DENY=1` → denied.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AgentCapabilityError,
  contextFromAgentIdentity,
  enforceAgentCapability,
} from "../../src/services/agent_capabilities.js";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import {
  getCurrentAgentIdentity,
  runWithRequestContext,
} from "../../src/services/request_context.js";

const ENV_KEYS = ["NEOTOMA_AGENT_DEFAULT_DENY"] as const;

const FEEDBACK_GRANT = {
  admitted: true as const,
  user_id: "usr_owner",
  grant_id: "ent_grant_feedback",
  agent_label: "agent-site@neotoma.io",
  capabilities: [
    { op: "store_structured" as const, entity_types: ["neotoma_feedback"] },
    { op: "correct" as const, entity_types: ["neotoma_feedback"] },
    { op: "create_relationship" as const, entity_types: ["neotoma_feedback"] },
    { op: "retrieve" as const, entity_types: ["neotoma_feedback"] },
  ],
  reason: "admitted" as const,
};

describe("agent capabilities (integration: admission → action boundary)", () => {
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

  it("allows in-scope entity_type when admission attached a matching grant", async () => {
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
      thumbprint: "tp-scoped",
      algorithm: "ES256",
      sub: "agent-site@neotoma.io",
      iss: "https://agent.neotoma.io",
    });

    await runWithRequestContext(
      { agentIdentity: identity, aauthAdmission: FEEDBACK_GRANT },
      async () => {
        const ctx = contextFromAgentIdentity(getCurrentAgentIdentity());
        expect(ctx).not.toBeNull();
        expect(ctx!.admitted).toBe(true);
        expect(() =>
          enforceAgentCapability(
            "store_structured",
            ["neotoma_feedback"],
            ctx!,
          ),
        ).not.toThrow();
      },
    );
  });

  it("denies out-of-scope entity_type even when admitted", async () => {
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
      thumbprint: "tp-scoped-deny",
      algorithm: "ES256",
      sub: "agent-site@neotoma.io",
      iss: "https://agent.neotoma.io",
    });

    await runWithRequestContext(
      { agentIdentity: identity, aauthAdmission: FEEDBACK_GRANT },
      async () => {
        const ctx = contextFromAgentIdentity(getCurrentAgentIdentity())!;
        try {
          enforceAgentCapability("store_structured", ["task"], ctx);
          throw new Error("expected capability_denied");
        } catch (err) {
          expect(err).toBeInstanceOf(AgentCapabilityError);
          expect((err as AgentCapabilityError).code).toBe("capability_denied");
          expect((err as AgentCapabilityError).entityType).toBe("task");
        }
      },
    );
  });

  it("passes through unadmitted agents when default_deny is unset", async () => {
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
      thumbprint: "tp-other",
      algorithm: "ES256",
      sub: "other-agent@example.com",
      iss: "https://other.example",
    });

    await runWithRequestContext({ agentIdentity: identity }, async () => {
      const ctx = contextFromAgentIdentity(getCurrentAgentIdentity())!;
      expect(ctx.admitted).toBe(false);
      expect(() =>
        enforceAgentCapability("store_structured", ["task"], ctx),
      ).not.toThrow();
    });
  });

  it("denies unadmitted verified agents when default_deny=1", async () => {
    process.env.NEOTOMA_AGENT_DEFAULT_DENY = "1";
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
      thumbprint: "tp-strict",
      algorithm: "ES256",
      sub: "stranger@example.com",
      iss: "https://stranger.example",
    });

    await runWithRequestContext({ agentIdentity: identity }, async () => {
      const ctx = contextFromAgentIdentity(getCurrentAgentIdentity())!;
      try {
        enforceAgentCapability("store_structured", ["task"], ctx);
        throw new Error("expected capability_denied");
      } catch (err) {
        expect(err).toBeInstanceOf(AgentCapabilityError);
        expect((err as AgentCapabilityError).hint).toContain(
          "No active agent_grant matches",
        );
      }
    });
  });
});
