import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveAccessPolicy,
  setAccessPolicy,
  enforceGuestAccess,
  assertGuestWriteAllowed,
  resolveGuestReadAccess,
  AccessPolicyError,
  ISSUE_SUBMISSION_ENTITY_TYPES,
  VALID_MODES,
  type GuestIdentity,
} from "../services/access_policy.js";

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const TEST_CONFIG_DIR = path.join(os.tmpdir(), "neotoma-test-access-policy-" + Date.now());
const TEST_CONFIG_PATH = path.join(TEST_CONFIG_DIR, "config.json");

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
    },
  };
});

describe("Access Policy Service", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    await fs.mkdir(TEST_CONFIG_DIR, { recursive: true });
    await fs.writeFile(TEST_CONFIG_PATH, JSON.stringify({}), "utf8");
  });

  afterEach(async () => {
    process.env = originalEnv;
    try {
      await fs.rm(TEST_CONFIG_DIR, { recursive: true });
    } catch {
      // Ignore cleanup races in temp directories.
    }
  });

  describe("resolveAccessPolicy", () => {
    it("returns closed by default for unconfigured types", async () => {
      const mode = await resolveAccessPolicy("some_random_type");
      expect(mode).toBe("closed");
    });

    it("respects env var overrides", async () => {
      process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "open";
      const mode = await resolveAccessPolicy("issue");
      expect(mode).toBe("open");
    });

    it("env var takes precedence over stored config", async () => {
      await setAccessPolicy("issue", "submitter_scoped");
      process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "read_only";
      const mode = await resolveAccessPolicy("issue");
      expect(mode).toBe("read_only");
    });

    it("env var takes precedence over schema metadata", async () => {
      // Schema metadata sets submitter_scoped for issue at seed, but
      // if the schema registry import fails (as in unit tests without DB)
      // the test still validates env > fallthrough
      process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "open";
      const mode = await resolveAccessPolicy("issue");
      expect(mode).toBe("open");
    });

    it("config file is used as deprecated fallback", async () => {
      await setAccessPolicy("legacy_type", "read_only");
      const mode = await resolveAccessPolicy("legacy_type");
      expect(mode).toBe("read_only");
    });
  });

  describe("enforceGuestAccess", () => {
    const guestId: GuestIdentity = { thumbprint: "test-thumbprint-123" };

    describe("closed mode", () => {
      it("denies store for closed entity_type", async () => {
        const decisions = await enforceGuestAccess("store", ["secret_type"], guestId);
        const decision = decisions.get("secret_type")!;
        expect(decision.allowed).toBe(false);
        expect(decision.mode).toBe("closed");
      });

      it("denies retrieve for closed entity_type", async () => {
        const decisions = await enforceGuestAccess("retrieve", ["secret_type"], guestId);
        const decision = decisions.get("secret_type")!;
        expect(decision.allowed).toBe(false);
      });
    });

    describe("read_only mode", () => {
      beforeEach(() => {
        process.env.NEOTOMA_ACCESS_POLICY_BLOG_POST = "read_only";
      });

      it("denies store for read_only entity_type", async () => {
        const decisions = await enforceGuestAccess("store", ["blog_post"], guestId);
        expect(decisions.get("blog_post")!.allowed).toBe(false);
      });

      it("allows retrieve for read_only entity_type", async () => {
        const decisions = await enforceGuestAccess("retrieve", ["blog_post"], guestId);
        const d = decisions.get("blog_post")!;
        expect(d.allowed).toBe(true);
        expect(d.scopeFilter).toBeUndefined();
      });
    });

    describe("submit_only mode", () => {
      beforeEach(() => {
        process.env.NEOTOMA_ACCESS_POLICY_FEEDBACK = "submit_only";
      });

      it("allows store for submit_only entity_type", async () => {
        const decisions = await enforceGuestAccess("store", ["feedback"], guestId);
        expect(decisions.get("feedback")!.allowed).toBe(true);
      });

      it("denies retrieve for submit_only entity_type", async () => {
        const decisions = await enforceGuestAccess("retrieve", ["feedback"], guestId);
        expect(decisions.get("feedback")!.allowed).toBe(false);
      });
    });

    describe("submitter_scoped mode", () => {
      beforeEach(() => {
        process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "submitter_scoped";
      });

      it("allows store for submitter_scoped entity_type", async () => {
        const decisions = await enforceGuestAccess("store", ["issue"], guestId);
        expect(decisions.get("issue")!.allowed).toBe(true);
      });

      it("allows retrieve with scopeFilter for submitter_scoped", async () => {
        const decisions = await enforceGuestAccess("retrieve", ["issue"], guestId);
        const d = decisions.get("issue")!;
        expect(d.allowed).toBe(true);
        expect(d.scopeFilter).toBe("submitter_only");
      });
    });

    describe("open mode", () => {
      beforeEach(() => {
        process.env.NEOTOMA_ACCESS_POLICY_PUBLIC_NOTE = "open";
      });

      it("allows store for open entity_type", async () => {
        const decisions = await enforceGuestAccess("store", ["public_note"], guestId);
        expect(decisions.get("public_note")!.allowed).toBe(true);
      });

      it("allows retrieve without scope filter for open entity_type", async () => {
        const decisions = await enforceGuestAccess("retrieve", ["public_note"], guestId);
        const d = decisions.get("public_note")!;
        expect(d.allowed).toBe(true);
        expect(d.scopeFilter).toBeUndefined();
      });
    });
  });

  describe("assertGuestWriteAllowed", () => {
    const guestId: GuestIdentity = { thumbprint: "test-thumbprint" };

    it("throws AccessPolicyError for closed types", async () => {
      await expect(
        assertGuestWriteAllowed(["closed_type"], guestId),
      ).rejects.toBeInstanceOf(AccessPolicyError);
    });

    it("does not throw for open types", async () => {
      process.env.NEOTOMA_ACCESS_POLICY_OPEN_TYPE = "open";
      await expect(
        assertGuestWriteAllowed(["open_type"], guestId),
      ).resolves.toBeUndefined();
    });

    it("throws if ANY type in batch is closed", async () => {
      process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "submitter_scoped";
      await expect(
        assertGuestWriteAllowed(["issue", "secret_type"], guestId),
      ).rejects.toBeInstanceOf(AccessPolicyError);
    });
  });

  describe("resolveGuestReadAccess", () => {
    const guestId: GuestIdentity = { thumbprint: "test-thumbprint" };

    it("returns submitter_only scope for submitter_scoped", async () => {
      process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "submitter_scoped";
      const decision = await resolveGuestReadAccess("issue", guestId);
      expect(decision.allowed).toBe(true);
      expect(decision.scopeFilter).toBe("submitter_only");
    });

    it("denies for closed types", async () => {
      const decision = await resolveGuestReadAccess("secret", guestId);
      expect(decision.allowed).toBe(false);
    });
  });

  describe("AccessPolicyError", () => {
    it("produces a structured error envelope", () => {
      const err = new AccessPolicyError({
        op: "store",
        entityType: "issue",
        mode: "closed",
        reason: "entity_type_closed",
      });
      const envelope = err.toErrorEnvelope();
      expect(envelope.code).toBe("access_policy_denied");
      expect(envelope.entity_type).toBe("issue");
      expect(envelope.mode).toBe("closed");
      expect(envelope.hint).toContain("neotoma access set");
    });
  });

  describe("ISSUE_SUBMISSION_ENTITY_TYPES", () => {
    it("contains the expected types", () => {
      expect(ISSUE_SUBMISSION_ENTITY_TYPES).toEqual(["issue", "conversation", "conversation_message"]);
    });
  });

  describe("VALID_MODES", () => {
    it("includes all five modes", () => {
      expect(VALID_MODES.size).toBe(5);
      expect(VALID_MODES.has("closed")).toBe(true);
      expect(VALID_MODES.has("read_only")).toBe(true);
      expect(VALID_MODES.has("submit_only")).toBe(true);
      expect(VALID_MODES.has("submitter_scoped")).toBe(true);
      expect(VALID_MODES.has("open")).toBe(true);
    });
  });
});
