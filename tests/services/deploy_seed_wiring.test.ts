/**
 * Issue #1968 — regression guard on the deploy-config artifacts themselves.
 *
 * History this guards against (cited in the #1968 PR): the Fly `release_command`
 * that runs schema seeding was added in commit 8d0f09bd1 and silently stripped
 * back out in 399f81fd2 — with no test catching it — which is what re-introduced
 * the unseeded-registry bug #1968 fixes. These assertions parse the actual
 * deploy artifacts so a future change that drops the seed step fails CI instead
 * of shipping and silently regressing on the next deploy.
 *
 * Deliberately string/-config level (not behavioral): the seeding *behavior* is
 * covered by schema_registry_bootstrap.test.ts. This file's job is only to pin
 * that every deploy path still invokes the seed entrypoint.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEED_ENTRYPOINT = "node dist/seed_schemas_entry.js";

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

/**
 * Match a TOML `release_command = "..."` whose value contains the seed
 * entrypoint, tolerating quoting/whitespace variation but NOT matching a
 * commented-out (`#`) line.
 */
function hasUncommentedReleaseCommand(toml: string): boolean {
  return toml.split("\n").some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return false;
    return /^release_command\s*=/.test(trimmed) && trimmed.includes(SEED_ENTRYPOINT);
  });
}

describe("deploy seed wiring (#1968 regression guard)", () => {
  it("fly.toml wires the seed entrypoint as an active release_command", () => {
    expect(hasUncommentedReleaseCommand(read("fly.toml"))).toBe(true);
  });

  it("fly.sandbox.toml wires the seed entrypoint as an active release_command", () => {
    expect(hasUncommentedReleaseCommand(read("fly.sandbox.toml"))).toBe(true);
  });

  it("redeploy_rc_from_main.sh invokes the seed entrypoint (not commented out)", () => {
    const script = read("scripts/redeploy_rc_from_main.sh");
    const invokes = script.split("\n").some((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return false;
      return trimmed.includes(SEED_ENTRYPOINT);
    });
    expect(invokes).toBe(true);
  });
});
