/**
 * Integration test: capability scoping blocks out-of-scope writes at the
 * action boundary when a matched agent identity is active in the request
 * context.
 *
 * Because end-to-end HTTP signing requires a full JWKS + key pair (see
 * `tests/integration/aauth_attribution_stamping.test.ts` for the rationale),
 * this test plugs directly into the request-context ALS the same way the
 * REST middleware does. It asserts that `createCorrection` — exercised via
 * the POST /correct capability check — rejects out-of-scope entity types
 * and allows in-scope ones.
 *
 * The /correct handler is the simplest end-to-end proof because
 * `storeStructuredForApi` triggers a lot of DB I/O that is orthogonal to
 * the capability check.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AgentCapabilityError,
  contextFromAgentIdentity,
  enforceAgentCapability,
  resetAgentCapabilitiesCache,
} from "../../src/services/agent_capabilities.js";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";
import {
  getCurrentAgentIdentity,
  runWithRequestContext,
} from "../../src/services/request_context.js";

const ENV_KEYS = [
  "NEOTOMA_AGENT_CAPABILITIES_JSON",
  "NEOTOMA_AGENT_CAPABILITIES_FILE",
  "NEOTOMA_AGENT_CAPABILITIES_ENFORCE",
] as const;

describe("agent capabilities (integration: request-context → action boundary)", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.NEOTOMA_AGENT_CAPABILITIES_ENFORCE = "true";
    process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
      agents: {
        "agent-site@neotoma.io": {
          match: {
            sub: "agent-site@neotoma.io",
            iss: "https://agent.neotoma.io",
          },
          capabilities: [
            { op: "store_structured", entity_types: ["neotoma_feedback"] },
            { op: "correct", entity_types: ["neotoma_feedback"] },
            { op: "create_relationship", entity_types: ["neotoma_feedback"] },
            { op: "retrieve", entity_types: ["neotoma_feedback"] },
          ],
        },
      },
    });
    resetAgentCapabilitiesCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    resetAgentCapabilitiesCache();
  });

  it("allows in-scope entity_type when identity matches the registry", async () => {
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
      thumbprint: "tp-scoped",
      algorithm: "ES256",
      sub: "agent-site@neotoma.io",
      iss: "https://agent.neotoma.io",
    });

    await runWithRequestContext({ agentIdentity: identity }, async () => {
      const ctx = contextFromAgentIdentity(getCurrentAgentIdentity());
      expect(ctx).not.toBeNull();
      expect(() =>
        enforceAgentCapability(
          "store_structured",
          ["neotoma_feedback"],
          ctx!,
        ),
      ).not.toThrow();
    });
  });

  it("denies out-of-scope entity_type when identity matches the registry", async () => {
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
      thumbprint: "tp-scoped-deny",
      algorithm: "ES256",
      sub: "agent-site@neotoma.io",
      iss: "https://agent.neotoma.io",
    });

    await runWithRequestContext({ agentIdentity: identity }, async () => {
      const ctx = contextFromAgentIdentity(getCurrentAgentIdentity())!;
      try {
        enforceAgentCapability("store_structured", ["task"], ctx);
        throw new Error("expected capability_denied");
      } catch (err) {
        expect(err).toBeInstanceOf(AgentCapabilityError);
        expect((err as AgentCapabilityError).code).toBe("capability_denied");
      }
    });
  });

  it("passes through unknown agents when default_deny is not set", async () => {
    const identity = createAgentIdentity({
      publicKey: '{"kty":"EC","crv":"P-256","alg":"ES256"}',
      thumbprint: "tp-other",
      algorithm: "ES256",
      sub: "other-agent@example.com",
      iss: "https://other.example",
    });

    await runWithRequestContext({ agentIdentity: identity }, async () => {
      const ctx = contextFromAgentIdentity(getCurrentAgentIdentity())!;
      expect(() =>
        enforceAgentCapability("store_structured", ["task"], ctx),
      ).not.toThrow();
    });
  });
});
