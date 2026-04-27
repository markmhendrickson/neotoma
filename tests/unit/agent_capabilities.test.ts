/**
 * Unit tests for `src/services/agent_capabilities.ts`.
 *
 * The capability layer is now grant-driven: capabilities flow in via
 * the admission service (AsyncLocalStorage `RequestContext`) rather
 * than from environment-variable registries. The legacy env-config
 * code paths have been removed and are replaced here by:
 *
 * - `enforceAgentCapability` against the resolved grant (admitted path)
 * - `assertNoLegacyCapabilityEnv` boot-time guard that fails fast if
 *   any of the deprecated `NEOTOMA_AGENT_CAPABILITIES_*` env vars are
 *   still set.
 *
 * Integration coverage of the protected-entity-types guard lives in
 * `tests/unit/protected_entity_types.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AgentCapabilityError,
  LegacyAgentCapabilityEnvError,
  assertNoLegacyCapabilityEnv,
  contextFromAgentIdentity,
  enforceAgentCapability,
  isAgentDefaultDenyEnabled,
  getAgentCapabilitiesSource,
  type AgentCapabilityContext,
} from "../../src/services/agent_capabilities.js";
import { runWithRequestContext } from "../../src/services/request_context.js";
import type { AgentIdentity } from "../../src/crypto/agent_identity.js";

const LEGACY_ENV_KEYS = [
  "NEOTOMA_AGENT_CAPABILITIES_JSON",
  "NEOTOMA_AGENT_CAPABILITIES_FILE",
  "NEOTOMA_AGENT_CAPABILITIES_ENFORCE",
  "NEOTOMA_AGENT_DEFAULT_DENY",
] as const;

function admittedCtx(
  caps: AgentCapabilityContext["capabilities"] = [
    { op: "store_structured", entity_types: ["neotoma_feedback"] },
    { op: "correct", entity_types: ["neotoma_feedback"] },
  ],
): AgentCapabilityContext {
  return {
    sub: "agent-site@neotoma.io",
    iss: "https://agent.neotoma.io",
    thumbprint: "thumb-abc",
    tier: "software",
    capabilities: caps,
    agentLabel: "agent-site@neotoma.io",
    admitted: true,
  };
}

function unadmittedCtx(
  overrides: Partial<AgentCapabilityContext> = {},
): AgentCapabilityContext {
  return {
    sub: "unknown@example.com",
    tier: "software",
    capabilities: null,
    agentLabel: "unknown@example.com",
    admitted: false,
    ...overrides,
  };
}

describe("agent_capabilities", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of LEGACY_ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of LEGACY_ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  describe("getAgentCapabilitiesSource", () => {
    it("identifies the source of truth as agent_grant entities", () => {
      expect(getAgentCapabilitiesSource()).toBe("agent_grant_entities");
    });
  });

  describe("assertNoLegacyCapabilityEnv (boot guard)", () => {
    it("returns silently when no legacy env vars are set", () => {
      expect(() => assertNoLegacyCapabilityEnv()).not.toThrow();
    });

    it("throws when NEOTOMA_AGENT_CAPABILITIES_JSON is still set", () => {
      process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = '{"agents":{}}';
      try {
        assertNoLegacyCapabilityEnv();
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(LegacyAgentCapabilityEnvError);
        const legacy = err as LegacyAgentCapabilityEnvError;
        expect(legacy.code).toBe("legacy_agent_capabilities_env");
        expect(legacy.variables).toEqual(["NEOTOMA_AGENT_CAPABILITIES_JSON"]);
        expect(legacy.migrationCommand).toContain(
          "neotoma agents grants import",
        );
      }
    });

    it("collects every legacy variable that is still set", () => {
      process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = '{"agents":{}}';
      process.env.NEOTOMA_AGENT_CAPABILITIES_FILE = "/tmp/x.json";
      process.env.NEOTOMA_AGENT_CAPABILITIES_ENFORCE = "1";
      try {
        assertNoLegacyCapabilityEnv();
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(LegacyAgentCapabilityEnvError);
        expect((err as LegacyAgentCapabilityEnvError).variables).toEqual([
          "NEOTOMA_AGENT_CAPABILITIES_JSON",
          "NEOTOMA_AGENT_CAPABILITIES_FILE",
          "NEOTOMA_AGENT_CAPABILITIES_ENFORCE",
        ]);
      }
    });

    it("ignores empty-string variables (pristine .env keeps shipping)", () => {
      process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = "";
      process.env.NEOTOMA_AGENT_CAPABILITIES_FILE = "   ";
      expect(() => assertNoLegacyCapabilityEnv()).not.toThrow();
    });
  });

  describe("isAgentDefaultDenyEnabled", () => {
    it("defaults to false", () => {
      expect(isAgentDefaultDenyEnabled()).toBe(false);
    });

    it("honours common truthy values", () => {
      for (const value of ["true", "TRUE", "1", "yes"]) {
        process.env.NEOTOMA_AGENT_DEFAULT_DENY = value;
        expect(isAgentDefaultDenyEnabled()).toBe(true);
      }
    });

    it("treats unrecognised strings as false", () => {
      process.env.NEOTOMA_AGENT_DEFAULT_DENY = "maybe";
      expect(isAgentDefaultDenyEnabled()).toBe(false);
    });
  });

  describe("contextFromAgentIdentity", () => {
    it("returns null when there is no agent identity", () => {
      expect(contextFromAgentIdentity(null)).toBeNull();
      expect(contextFromAgentIdentity(undefined)).toBeNull();
    });

    it("returns null for an identity with no usable match key", () => {
      const ident: AgentIdentity = { tier: "anonymous" } as AgentIdentity;
      expect(contextFromAgentIdentity(ident)).toBeNull();
    });

    it("surfaces the admitted grant's capabilities from the request context", () => {
      const ident: AgentIdentity = {
        sub: "agent-cli@example.com",
        iss: "https://agent.example.com",
        thumbprint: "thumb-xyz",
        tier: "software",
      } as AgentIdentity;
      const caps = [
        { op: "store_structured" as const, entity_types: ["task"] },
      ];
      const ctx = runWithRequestContext(
        {
          agentIdentity: ident,
          aauthAdmission: {
            admitted: true,
            user_id: "usr_1",
            grant_id: "ent_1",
            agent_label: "Cursor on macbook-pro",
            capabilities: caps,
            reason: "admitted",
          },
        },
        () => contextFromAgentIdentity(ident),
      ) as AgentCapabilityContext | null;
      expect(ctx).not.toBeNull();
      expect(ctx!.admitted).toBe(true);
      expect(ctx!.capabilities).toEqual(caps);
      expect(ctx!.agentLabel).toBe("Cursor on macbook-pro");
    });

    it("treats unadmitted but signed identities as unrecognised", () => {
      const ident: AgentIdentity = {
        sub: "agent-cli@example.com",
        tier: "software",
      } as AgentIdentity;
      const ctx = contextFromAgentIdentity(ident);
      expect(ctx).not.toBeNull();
      expect(ctx!.admitted).toBe(false);
      expect(ctx!.capabilities).toBeNull();
      expect(ctx!.agentLabel).toBe("agent-cli@example.com");
    });
  });

  describe("enforceAgentCapability (admitted)", () => {
    it("allows in-scope (op, entity_type) pairs", () => {
      expect(() =>
        enforceAgentCapability(
          "store_structured",
          ["neotoma_feedback"],
          admittedCtx(),
        ),
      ).not.toThrow();
    });

    it("rejects out-of-scope entity types", () => {
      try {
        enforceAgentCapability(
          "store_structured",
          ["task"],
          admittedCtx(),
        );
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(AgentCapabilityError);
        const cap = err as AgentCapabilityError;
        expect(cap.code).toBe("capability_denied");
        expect(cap.op).toBe("store_structured");
        expect(cap.entityType).toBe("task");
        expect(cap.hint).toContain("Inspector → Agents → Grants");
      }
    });

    it("rejects an op that the grant does not include", () => {
      expect(() =>
        enforceAgentCapability(
          "create_relationship",
          ["neotoma_feedback"],
          admittedCtx(),
        ),
      ).toThrow(AgentCapabilityError);
    });

    it("supports wildcard entity_types in the grant", () => {
      const ctx = admittedCtx([
        { op: "retrieve", entity_types: ["*"] },
      ]);
      expect(() =>
        enforceAgentCapability("retrieve", ["any", "thing"], ctx),
      ).not.toThrow();
    });

    it("dedupes entity_types before checking", () => {
      expect(() =>
        enforceAgentCapability(
          "store_structured",
          ["neotoma_feedback", "neotoma_feedback"],
          admittedCtx(),
        ),
      ).not.toThrow();
    });

    it("no-ops on empty entity_types", () => {
      expect(() =>
        enforceAgentCapability("store_structured", [], admittedCtx()),
      ).not.toThrow();
    });
  });

  describe("enforceAgentCapability (unadmitted)", () => {
    it("allows by default for unadmitted, signature-verified agents", () => {
      // Mirrors the v0.7 behaviour: unknown agents fall through to
      // attribution policy unless default_deny is set.
      expect(() =>
        enforceAgentCapability(
          "store_structured",
          ["task"],
          unadmittedCtx(),
        ),
      ).not.toThrow();
    });

    it("denies when NEOTOMA_AGENT_DEFAULT_DENY is enabled and tier is verifying", () => {
      process.env.NEOTOMA_AGENT_DEFAULT_DENY = "1";
      try {
        enforceAgentCapability(
          "store_structured",
          ["task"],
          unadmittedCtx(),
        );
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(AgentCapabilityError);
        expect((err as AgentCapabilityError).hint).toContain(
          "No active agent_grant matches",
        );
      }
    });

    it("does NOT deny anonymous tier even with default_deny enabled", () => {
      process.env.NEOTOMA_AGENT_DEFAULT_DENY = "1";
      const ctx = unadmittedCtx({ tier: "anonymous" });
      expect(() =>
        enforceAgentCapability("store_structured", ["task"], ctx),
      ).not.toThrow();
    });
  });
});
