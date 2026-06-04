/**
 * Unit tests for buildSandboxBootBannerLines (issue #1505).
 *
 * The refuse-mode banner must not promise the loopback escape under
 * NEOTOMA_ENV=production, because resolveSandboxMode() gates the local_sandbox
 * loopback verdict on `!productionEnv`. Pure-function tests, no IO.
 */
import { describe, expect, it } from "vitest";

import { buildSandboxBootBannerLines } from "../../src/services/sandbox_mode.ts";

describe("buildSandboxBootBannerLines", () => {
  it("offers the loopback escape outside production", () => {
    const lines = buildSandboxBootBannerLines({
      mode: "refuse",
      reason: "no auth + non-loopback",
      shouldRefuseBoot: false,
      refusePolicy: "warn",
      productionEnv: false,
    });
    const text = lines.join("\n");
    expect(text).toContain("NEOTOMA_HTTP_HOST=127.0.0.1");
    expect(text).toContain("NEOTOMA_REQUIRE_AUTH=1");
    expect(text).toContain("NEOTOMA_SANDBOX_MODE=1");
  });

  it("does NOT promise the loopback escape under production", () => {
    const lines = buildSandboxBootBannerLines({
      mode: "refuse",
      reason: "production env",
      shouldRefuseBoot: false,
      refusePolicy: "warn",
      productionEnv: true,
    });
    const text = lines.join("\n");
    // The misleading remediation: binding loopback does not escape refuse mode
    // in production, so the banner must not advertise it as an escape.
    expect(text).not.toContain("bind to loopback (NEOTOMA_HTTP_HOST=127.0.0.1)");
    expect(text).toContain("loopback bind does NOT escape");
    // The remediations that actually work under production are still offered.
    expect(text).toContain("NEOTOMA_REQUIRE_AUTH=1");
    expect(text).toContain("NEOTOMA_SANDBOX_MODE=1");
  });

  it("emits no remediation block for non-refuse modes", () => {
    const lines = buildSandboxBootBannerLines({
      mode: "local",
      reason: "auth configured",
      shouldRefuseBoot: false,
      refusePolicy: "warn",
      productionEnv: true,
    });
    const text = lines.join("\n");
    expect(text).toContain("Sandbox mode resolved: local");
    expect(text).not.toContain("NEOTOMA_REQUIRE_AUTH=1");
    expect(text).not.toContain("advisory class");
  });

  it("reports enforce-policy refusal with exit code 1", () => {
    const lines = buildSandboxBootBannerLines({
      mode: "refuse",
      reason: "production env",
      shouldRefuseBoot: true,
      refusePolicy: "enforce",
      productionEnv: true,
    });
    const text = lines.join("\n");
    expect(text).toContain("refusing to start");
    expect(text).toContain("Exit code 1");
  });
});
