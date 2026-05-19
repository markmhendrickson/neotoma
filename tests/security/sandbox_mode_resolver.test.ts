/**
 * Sandbox mode resolver tests (Gate G3 — advisory closure 2026-05-11).
 *
 * Pure-function coverage for `resolveSandboxMode()` and the install-fingerprint
 * derivation, per plan ent_b4958d038bd41e8694fe0aef Phase 1.
 *
 * What this proves:
 *
 *   1. Each of the 4 modes (authenticated / local_sandbox / hosted_sandbox /
 *      refuse) is reachable from a specific input shape.
 *   2. The v0.11.1 advisory regression class — no-auth + non-loopback bind —
 *      always lands in `refuse` mode, regardless of production-env flag.
 *   3. `refusePolicy` controls boot-exit vs warn-only behavior. The first cut
 *      defaults to "warn"; flipping to "enforce" gates server boot.
 *   4. Install fingerprint is deterministic per data dir: same dir -> same
 *      fingerprint across calls; different dirs -> different fingerprints.
 *   5. `sandboxPrincipalIdFromFingerprint` is a pure hash: same fingerprint
 *      always maps to the same UUID-shaped principal id.
 *
 * Not covered here (Phase 2 work):
 *   - Live `src/actions.ts` boot wiring (resolver -> process.exit on enforce).
 *   - `protected_routes_manifest.json` `sandbox_allowed` column.
 *   - UI auth bootstrap recognising sandbox session state.
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveSandboxMode,
  resolveRefusePolicy,
  getOrCreateInstallFingerprint,
  sandboxPrincipalIdFromFingerprint,
  type ResolveSandboxModeInputs,
} from "../../src/services/sandbox_mode.js";

function makeInputs(overrides: Partial<ResolveSandboxModeInputs> = {}): ResolveSandboxModeInputs {
  return {
    authConfigured: false,
    loopbackBindOnly: true,
    productionEnv: false,
    hostedSandboxEnabled: false,
    refusePolicy: "warn",
    ...overrides,
  };
}

describe("resolveSandboxMode — mode selection", () => {
  it("returns authenticated when auth is configured (highest precedence)", () => {
    // Auth wins even when hosted_sandbox would otherwise apply.
    const result = resolveSandboxMode(
      makeInputs({ authConfigured: true, hostedSandboxEnabled: true })
    );
    expect(result.mode).toBe("authenticated");
    expect(result.shouldRefuseBoot).toBe(false);
  });

  it("returns authenticated even when bind is non-loopback in production", () => {
    const result = resolveSandboxMode(
      makeInputs({ authConfigured: true, loopbackBindOnly: false, productionEnv: true })
    );
    expect(result.mode).toBe("authenticated");
  });

  it("returns hosted_sandbox when NEOTOMA_SANDBOX_MODE is enabled and no auth", () => {
    // Hosted sandbox is already shipping; the resolver routes to it.
    const result = resolveSandboxMode(
      makeInputs({ hostedSandboxEnabled: true, loopbackBindOnly: false, productionEnv: true })
    );
    expect(result.mode).toBe("hosted_sandbox");
    expect(result.shouldRefuseBoot).toBe(false);
  });

  it("returns local_sandbox on loopback + no auth + non-production (opt-out default)", () => {
    const result = resolveSandboxMode(makeInputs());
    expect(result.mode).toBe("local_sandbox");
    expect(result.shouldRefuseBoot).toBe(false);
    expect(result.reason).toContain("LOCAL_DEV_USER_ID");
  });

  it("returns refuse on no-auth + non-loopback bind (v0.11.1 advisory shape)", () => {
    // This is the regression class the gates exist to catch.
    const result = resolveSandboxMode(makeInputs({ loopbackBindOnly: false }));
    expect(result.mode).toBe("refuse");
    expect(result.reason).toContain("v0.11.1");
    expect(result.reason).toContain("advisory");
  });

  it("returns refuse on no-auth + loopback + production env (no local-dev shortcut in prod)", () => {
    // Loopback alone is not enough in production — a reverse proxy could be
    // forwarding public traffic. The canonical `isLocalRequest` helper already
    // enforces this; the resolver mirrors it.
    const result = resolveSandboxMode(
      makeInputs({ loopbackBindOnly: true, productionEnv: true })
    );
    expect(result.mode).toBe("refuse");
  });
});

describe("resolveSandboxMode — refuse policy gating", () => {
  it("does NOT request boot refusal when refusePolicy=warn (first cut default)", () => {
    const result = resolveSandboxMode(
      makeInputs({ loopbackBindOnly: false, refusePolicy: "warn" })
    );
    expect(result.mode).toBe("refuse");
    expect(result.shouldRefuseBoot).toBe(false);
  });

  it("requests boot refusal when refusePolicy=enforce", () => {
    const result = resolveSandboxMode(
      makeInputs({ loopbackBindOnly: false, refusePolicy: "enforce" })
    );
    expect(result.mode).toBe("refuse");
    expect(result.shouldRefuseBoot).toBe(true);
  });

  it("never requests boot refusal for non-refuse modes, regardless of policy", () => {
    for (const policy of ["warn", "enforce"] as const) {
      expect(
        resolveSandboxMode(makeInputs({ authConfigured: true, refusePolicy: policy }))
          .shouldRefuseBoot
      ).toBe(false);
      expect(
        resolveSandboxMode(makeInputs({ hostedSandboxEnabled: true, refusePolicy: policy }))
          .shouldRefuseBoot
      ).toBe(false);
      expect(resolveSandboxMode(makeInputs({ refusePolicy: policy })).shouldRefuseBoot).toBe(
        false
      );
    }
  });
});

describe("resolveRefusePolicy — env parsing", () => {
  it("defaults to warn when NEOTOMA_REFUSE_MODE is unset", () => {
    expect(resolveRefusePolicy({})).toBe("warn");
  });

  it("returns enforce only on the literal 'enforce' value (case-insensitive)", () => {
    expect(resolveRefusePolicy({ NEOTOMA_REFUSE_MODE: "enforce" })).toBe("enforce");
    expect(resolveRefusePolicy({ NEOTOMA_REFUSE_MODE: "ENFORCE" })).toBe("enforce");
    expect(resolveRefusePolicy({ NEOTOMA_REFUSE_MODE: "Enforce" })).toBe("enforce");
  });

  it("falls back to warn on unrecognised values (fail-safe)", () => {
    expect(resolveRefusePolicy({ NEOTOMA_REFUSE_MODE: "off" })).toBe("warn");
    expect(resolveRefusePolicy({ NEOTOMA_REFUSE_MODE: "1" })).toBe("warn");
    expect(resolveRefusePolicy({ NEOTOMA_REFUSE_MODE: "" })).toBe("warn");
  });
});

describe("getOrCreateInstallFingerprint — determinism + persistence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "neotoma-fingerprint-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a fingerprint file on first call", () => {
    const fp = getOrCreateInstallFingerprint(tempDir);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(existsSync(join(tempDir, ".install_fingerprint"))).toBe(true);
  });

  it("returns the same fingerprint across calls in the same dir (stable across restarts)", () => {
    const first = getOrCreateInstallFingerprint(tempDir);
    const second = getOrCreateInstallFingerprint(tempDir);
    expect(second).toBe(first);
  });

  it("produces different fingerprints across different data dirs", () => {
    const otherDir = mkdtempSync(join(tmpdir(), "neotoma-fingerprint-other-"));
    try {
      const a = getOrCreateInstallFingerprint(tempDir);
      const b = getOrCreateInstallFingerprint(otherDir);
      expect(a).not.toBe(b);
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("creates the data dir if it does not yet exist", () => {
    const nested = join(tempDir, "does-not-exist-yet", "data");
    const fp = getOrCreateInstallFingerprint(nested);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(existsSync(nested)).toBe(true);
  });

  it("regenerates a fresh fingerprint if the stored file is corrupted (fail-safe)", () => {
    // Write garbage into the fingerprint file.
    const fpPath = join(tempDir, ".install_fingerprint");
    writeFileSync(fpPath, "not-hex-content-!!!");
    const fp = getOrCreateInstallFingerprint(tempDir);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    // And the file is now valid hex.
    expect(readFileSync(fpPath, "utf8")).toMatch(/^[0-9a-f]+$/);
  });
});

describe("sandboxPrincipalIdFromFingerprint — deterministic principal", () => {
  it("returns a UUID-shaped string", () => {
    const id = sandboxPrincipalIdFromFingerprint("abcdef0123456789");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("is deterministic: same fingerprint -> same principal id", () => {
    const a = sandboxPrincipalIdFromFingerprint("abcdef0123456789");
    const b = sandboxPrincipalIdFromFingerprint("abcdef0123456789");
    expect(b).toBe(a);
  });

  it("is distinct across fingerprints", () => {
    const a = sandboxPrincipalIdFromFingerprint("abcdef0123456789");
    const b = sandboxPrincipalIdFromFingerprint("0123456789abcdef");
    expect(a).not.toBe(b);
  });
});
