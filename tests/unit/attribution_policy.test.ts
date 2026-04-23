/**
 * Unit tests for `src/services/attribution_policy.ts`.
 *
 * These tests exercise the central enforcement seam that gates every
 * durable write. Because every write-path service calls this helper the
 * same way, covering it in isolation gives us transport-agnostic
 * parity (HTTP, MCP stdio, MCP HTTP, CLI backup) without spinning up a
 * server per transport — the whole point of the seam is uniformity.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AttributionPolicyError,
  effectiveAnonymousWriteMode,
  enforceAttributionPolicy,
  getAttributionPolicySnapshot,
} from "../../src/services/attribution_policy.js";
import { createAgentIdentity } from "../../src/crypto/agent_identity.js";

const ENV_KEYS = [
  "NEOTOMA_ATTRIBUTION_POLICY",
  "NEOTOMA_MIN_ATTRIBUTION_TIER",
  "NEOTOMA_ATTRIBUTION_POLICY_JSON",
] as const;

describe("attribution_policy", () => {
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

  describe("getAttributionPolicySnapshot", () => {
    it("defaults to allow + no min_tier when env is unset", () => {
      expect(getAttributionPolicySnapshot()).toEqual({
        anonymous_writes: "allow",
      });
    });

    it("reads mode, min_tier, and per-path overrides from env", () => {
      process.env.NEOTOMA_ATTRIBUTION_POLICY = "warn";
      process.env.NEOTOMA_MIN_ATTRIBUTION_TIER = "software";
      process.env.NEOTOMA_ATTRIBUTION_POLICY_JSON = JSON.stringify({
        observations: "reject",
        bogus_path: "allow",
      });

      const snapshot = getAttributionPolicySnapshot();
      expect(snapshot.anonymous_writes).toBe("warn");
      expect(snapshot.min_tier).toBe("software");
      expect(snapshot.per_path).toEqual({ observations: "reject" });
    });

    it("ignores malformed per-path JSON", () => {
      process.env.NEOTOMA_ATTRIBUTION_POLICY_JSON = "{not json";
      expect(getAttributionPolicySnapshot().per_path).toBeUndefined();
    });
  });

  describe("effectiveAnonymousWriteMode", () => {
    it("prefers per-path override", () => {
      const mode = effectiveAnonymousWriteMode(
        { anonymous_writes: "allow", per_path: { observations: "reject" } },
        "observations",
      );
      expect(mode).toBe("reject");
    });

    it("falls back to global mode when no override", () => {
      const mode = effectiveAnonymousWriteMode(
        { anonymous_writes: "warn" },
        "relationships",
      );
      expect(mode).toBe("warn");
    });
  });

  describe("enforceAttributionPolicy", () => {
    it("allows anonymous writes by default", () => {
      const outcome = enforceAttributionPolicy("observations", null);
      expect(outcome.action).toBe("allow");
    });

    it("rejects anonymous writes in reject mode", () => {
      process.env.NEOTOMA_ATTRIBUTION_POLICY = "reject";
      expect(() => enforceAttributionPolicy("observations", null)).toThrow(
        AttributionPolicyError,
      );
    });

    it("warn mode returns warn outcome with a message", () => {
      process.env.NEOTOMA_ATTRIBUTION_POLICY = "warn";
      const outcome = enforceAttributionPolicy("sources", null);
      expect(outcome.action).toBe("warn");
      expect(outcome.warningMessage).toContain("sources");
    });

    it("per-path override can reject one path while others allow", () => {
      process.env.NEOTOMA_ATTRIBUTION_POLICY_JSON = JSON.stringify({
        corrections: "reject",
      });
      expect(() => enforceAttributionPolicy("corrections", null)).toThrow(
        AttributionPolicyError,
      );
      expect(enforceAttributionPolicy("observations", null).action).toBe(
        "allow",
      );
    });

    it("min_tier rejects tiers below the floor even when identity is present", () => {
      process.env.NEOTOMA_MIN_ATTRIBUTION_TIER = "software";
      const clientOnly = createAgentIdentity({
        clientName: "Claude Code",
      });
      expect(clientOnly.tier).toBe("unverified_client");
      expect(() =>
        enforceAttributionPolicy("observations", clientOnly),
      ).toThrow(AttributionPolicyError);
    });

    it("min_tier allows tiers at or above the floor", () => {
      process.env.NEOTOMA_MIN_ATTRIBUTION_TIER = "software";
      const hw = createAgentIdentity({
        publicKey: "pk",
        thumbprint: "tp",
        algorithm: "ES256",
        sub: "agent:x",
      });
      expect(enforceAttributionPolicy("observations", hw).action).toBe("allow");
    });

    it("error envelope carries current/min/write_path/hint/retryable", () => {
      process.env.NEOTOMA_ATTRIBUTION_POLICY = "reject";
      try {
        enforceAttributionPolicy("timeline_events", null);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AttributionPolicyError);
        const envelope = (err as AttributionPolicyError).toErrorEnvelope();
        expect(envelope.code).toBe("ATTRIBUTION_REQUIRED");
        expect(envelope.current_tier).toBe("anonymous");
        expect(envelope.write_path).toBe("timeline_events");
        expect(envelope.hint).toContain("AAuth");
        expect(envelope.retryable).toBe(false);
      }
    });

    it("applies the same seam across every canonical write path", () => {
      process.env.NEOTOMA_ATTRIBUTION_POLICY = "reject";
      const paths = [
        "observations",
        "relationships",
        "sources",
        "interpretations",
        "timeline_events",
        "corrections",
      ] as const;
      for (const path of paths) {
        expect(() => enforceAttributionPolicy(path, null)).toThrow(
          AttributionPolicyError,
        );
      }
    });
  });
});
