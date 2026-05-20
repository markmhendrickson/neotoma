/**
 * Guard: MCP launcher scripts and shared lib snippets must parse under bash -n.
 */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const SCRIPTS = join(REPO_ROOT, "scripts");
const LIB = join(SCRIPTS, "lib");

describe("run_neotoma_mcp launcher bash syntax", () => {
  it("bash -n succeeds for scripts/run_neotoma_mcp*.sh and scripts/lib/*.sh", () => {
    const launchers = readdirSync(SCRIPTS).filter(
      (n) => n.startsWith("run_neotoma_mcp") && n.endsWith(".sh"),
    );
    expect(launchers.length).toBeGreaterThan(0);

    for (const name of launchers) {
      execSync(`bash -n "${join(SCRIPTS, name)}"`, { stdio: "pipe" });
    }

    const libs = readdirSync(LIB).filter((n) => n.endsWith(".sh"));
    expect(libs.length).toBeGreaterThan(0);
    for (const name of libs) {
      execSync(`bash -n "${join(LIB, name)}"`, { stdio: "pipe" });
    }
  });
});
