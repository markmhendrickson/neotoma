/**
 * Unit tests for `src/services/agent_capabilities.ts`.
 *
 * Exercises the pure registry matching + enforcement logic without touching
 * the HTTP stack. Integration coverage through `/store` lives in
 * `tests/integration/agent_capabilities_store.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AgentCapabilityError,
  contextFromAgentIdentity,
  enforceAgentCapability,
  findMatchingAgent,
  isAgentCapabilitiesEnforced,
  loadAgentCapabilities,
  resetAgentCapabilitiesCache,
  type AgentCapabilityContext,
  type AgentCapabilityRegistry,
} from "../../src/services/agent_capabilities.js";

const ENV_KEYS = [
  "NEOTOMA_AGENT_CAPABILITIES_JSON",
  "NEOTOMA_AGENT_CAPABILITIES_FILE",
  "NEOTOMA_AGENT_CAPABILITIES_ENFORCE",
] as const;

function withRegistry(registry: AgentCapabilityRegistry): void {
  process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify(registry);
  resetAgentCapabilitiesCache();
}

function enableEnforcement(value = true): void {
  if (value) {
    process.env.NEOTOMA_AGENT_CAPABILITIES_ENFORCE = "true";
  } else {
    delete process.env.NEOTOMA_AGENT_CAPABILITIES_ENFORCE;
  }
}

const softwareCtx: AgentCapabilityContext = {
  sub: "agent-site@neotoma.io",
  iss: "https://agent.neotoma.io",
  thumbprint: "thumb-abc",
  tier: "software",
};

describe("agent_capabilities", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    resetAgentCapabilitiesCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    resetAgentCapabilitiesCache();
  });

  describe("loadAgentCapabilities", () => {
    it("loads the committed default when no env is set", () => {
      const registry = loadAgentCapabilities();
      // The committed config/agent_capabilities.default.json pins the
      // Netlify forwarder to neotoma_feedback. When that file disappears
      // (fresh checkout, CI image without config), the loader returns an
      // empty registry — both shapes are valid defaults.
      if (Object.keys(registry.agents).length === 0) {
        expect(registry).toEqual({ agents: {} });
      } else {
        expect(registry.agents["agent-site@neotoma.io"]).toBeDefined();
      }
    });

    it("parses inline JSON via NEOTOMA_AGENT_CAPABILITIES_JSON", () => {
      withRegistry({
        agents: {
          "agent-site@neotoma.io": {
            match: { sub: "agent-site@neotoma.io" },
            capabilities: [
              { op: "store_structured", entity_types: ["neotoma_feedback"] },
            ],
          },
        },
      });
      const registry = loadAgentCapabilities();
      expect(Object.keys(registry.agents)).toEqual(["agent-site@neotoma.io"]);
    });

    it("drops entries with no usable match key", () => {
      process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
        agents: {
          "broken@example.com": {
            match: {},
            capabilities: [
              { op: "store_structured", entity_types: ["x"] },
            ],
          },
          "ok@example.com": {
            match: { sub: "ok@example.com" },
            capabilities: [
              { op: "store_structured", entity_types: ["x"] },
            ],
          },
        },
      });
      resetAgentCapabilitiesCache();
      const registry = loadAgentCapabilities();
      expect(Object.keys(registry.agents)).toEqual(["ok@example.com"]);
    });

    it("ignores unknown ops and non-string entity_types", () => {
      process.env.NEOTOMA_AGENT_CAPABILITIES_JSON = JSON.stringify({
        agents: {
          "partial@example.com": {
            match: { sub: "partial@example.com" },
            capabilities: [
              { op: "teleport", entity_types: ["x"] },
              { op: "store_structured", entity_types: [1, null, "neotoma_feedback"] },
              { op: "correct", entity_types: [] },
            ],
          },
        },
      });
      resetAgentCapabilitiesCache();
      const registry = loadAgentCapabilities();
      expect(registry.agents["partial@example.com"].capabilities).toEqual([
        { op: "store_structured", entity_types: ["neotoma_feedback"] },
      ]);
    });
  });

  describe("findMatchingAgent", () => {
    it("matches by sub alone", () => {
      const registry: AgentCapabilityRegistry = {
        agents: {
          s: {
            match: { sub: "agent-site@neotoma.io" },
            capabilities: [{ op: "store_structured", entity_types: ["x"] }],
          },
        },
      };
      const m = findMatchingAgent(registry, { sub: "agent-site@neotoma.io", tier: "software" });
      expect(m?.label).toBe("s");
    });

    it("requires iss when configured", () => {
      const registry: AgentCapabilityRegistry = {
        agents: {
          s: {
            match: { sub: "a@b", iss: "https://expected" },
            capabilities: [{ op: "store_structured", entity_types: ["x"] }],
          },
        },
      };
      expect(
        findMatchingAgent(registry, { sub: "a@b", iss: "https://wrong", tier: "software" }),
      ).toBeNull();
      expect(
        findMatchingAgent(registry, { sub: "a@b", iss: "https://expected", tier: "software" })
          ?.label,
      ).toBe("s");
    });

    it("matches by thumbprint and prefers it over sub", () => {
      const registry: AgentCapabilityRegistry = {
        agents: {
          byThumb: {
            match: { thumbprint: "thumb-abc" },
            capabilities: [{ op: "store_structured", entity_types: ["x"] }],
          },
          bySub: {
            match: { sub: "agent-site@neotoma.io" },
            capabilities: [{ op: "store_structured", entity_types: ["y"] }],
          },
        },
      };
      const m = findMatchingAgent(registry, softwareCtx);
      expect(m?.label).toBe("byThumb");
    });
  });

  describe("enforceAgentCapability", () => {
    beforeEach(() => {
      withRegistry({
        agents: {
          "agent-site@neotoma.io": {
            match: { sub: "agent-site@neotoma.io", iss: "https://agent.neotoma.io" },
            capabilities: [
              { op: "store_structured", entity_types: ["neotoma_feedback"] },
              { op: "correct", entity_types: ["neotoma_feedback"] },
            ],
          },
          "wildcard@example.com": {
            match: { sub: "wildcard@example.com" },
            capabilities: [{ op: "retrieve", entity_types: ["*"] }],
          },
        },
      });
      enableEnforcement(true);
    });

    it("allows in-scope entity type", () => {
      expect(() =>
        enforceAgentCapability("store_structured", ["neotoma_feedback"], softwareCtx),
      ).not.toThrow();
    });

    it("throws for out-of-scope entity type when enforced", () => {
      try {
        enforceAgentCapability("store_structured", ["task"], softwareCtx);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(AgentCapabilityError);
        expect((err as AgentCapabilityError).code).toBe("capability_denied");
        expect((err as AgentCapabilityError).op).toBe("store_structured");
        expect((err as AgentCapabilityError).entityType).toBe("task");
      }
    });

    it("throws for unknown op even if entity type is otherwise allowed", () => {
      expect(() =>
        enforceAgentCapability("create_relationship", ["neotoma_feedback"], softwareCtx),
      ).toThrow(AgentCapabilityError);
    });

    it("allows wildcard entity_types", () => {
      const ctx: AgentCapabilityContext = {
        sub: "wildcard@example.com",
        tier: "software",
      };
      expect(() =>
        enforceAgentCapability("retrieve", ["anything", "else"], ctx),
      ).not.toThrow();
    });

    it("does nothing when entityTypes is empty", () => {
      expect(() =>
        enforceAgentCapability("store_structured", [], softwareCtx),
      ).not.toThrow();
    });

    it("observe-only mode never throws but logs denials", () => {
      enableEnforcement(false);
      expect(isAgentCapabilitiesEnforced()).toBe(false);
      expect(() =>
        enforceAgentCapability("store_structured", ["task"], softwareCtx),
      ).not.toThrow();
    });

    it("allows unknown agents when default_deny is false (legacy behaviour)", () => {
      withRegistry({
        agents: {
          "agent-site@neotoma.io": {
            match: { sub: "agent-site@neotoma.io" },
            capabilities: [
              { op: "store_structured", entity_types: ["neotoma_feedback"] },
            ],
          },
        },
      });
      const strangerCtx: AgentCapabilityContext = {
        sub: "other@example.com",
        tier: "software",
      };
      expect(() =>
        enforceAgentCapability("store_structured", ["task"], strangerCtx),
      ).not.toThrow();
    });

    it("denies unknown AAuth-verified agents when default_deny is true", () => {
      withRegistry({
        default_deny: true,
        agents: {
          "agent-site@neotoma.io": {
            match: { sub: "agent-site@neotoma.io" },
            capabilities: [
              { op: "store_structured", entity_types: ["neotoma_feedback"] },
            ],
          },
        },
      });
      enableEnforcement(true);
      const strangerCtx: AgentCapabilityContext = {
        sub: "other@example.com",
        tier: "software",
      };
      expect(() =>
        enforceAgentCapability("store_structured", ["task"], strangerCtx),
      ).toThrow(AgentCapabilityError);
    });

    it("does not apply default_deny to anonymous/unverified tiers", () => {
      withRegistry({ default_deny: true, agents: {} });
      enableEnforcement(true);
      const anonCtx: AgentCapabilityContext = { tier: "anonymous" };
      expect(() =>
        enforceAgentCapability("store_structured", ["task"], anonCtx),
      ).not.toThrow();
    });
  });

  describe("contextFromAgentIdentity", () => {
    it("returns null for missing identity", () => {
      expect(contextFromAgentIdentity(null)).toBeNull();
      expect(contextFromAgentIdentity(undefined)).toBeNull();
    });

    it("returns null when identity has neither sub nor thumbprint", () => {
      expect(
        contextFromAgentIdentity({ tier: "unverified_client" }),
      ).toBeNull();
    });

    it("projects sub/iss/thumbprint/tier", () => {
      const ctx = contextFromAgentIdentity({
        sub: "a@b",
        iss: "https://c",
        thumbprint: "t",
        tier: "software",
      });
      expect(ctx).toEqual({
        sub: "a@b",
        iss: "https://c",
        thumbprint: "t",
        tier: "software",
      });
    });
  });
});
