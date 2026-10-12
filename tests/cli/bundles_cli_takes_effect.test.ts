/**
 * `neotoma bundles install|enable|disable` writes the local state file only.
 * A running server reads it at startup, so the CLI must say the change takes
 * effect at the next server restart and point at `manage_bundles` for
 * immediate effect. Pins that message on the real command.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerBundlesCommand, takesEffectNote } from "../../src/cli/commands/bundles.js";
import {
  resetBundleRegistryForTesting,
  resetBundleStateCacheForTesting,
} from "../../src/services/bundles/index.js";

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundles-cli-"));
  statePath = path.join(tmpDir, "bundle_state.json");
  process.env.NEOTOMA_BUNDLE_STATE_PATH = statePath;
  resetBundleStateCacheForTesting();
  resetBundleRegistryForTesting();
  process.exitCode = undefined;
});

afterEach(() => {
  delete process.env.NEOTOMA_BUNDLE_STATE_PATH;
  resetBundleStateCacheForTesting();
  resetBundleRegistryForTesting();
  vi.restoreAllMocks();
  process.exitCode = undefined;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function run(args: string[]): Promise<string> {
  let out = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    out += String(chunk);
    return true;
  });
  const program = new Command();
  program.option("--json");
  registerBundlesCommand(program);
  await program.parseAsync(["node", "neotoma", ...args]);
  vi.restoreAllMocks();
  return out;
}

describe("takesEffectNote", () => {
  it("says the change takes effect at the next restart and points to manage_bundles", () => {
    expect(takesEffectNote("install", "/x/bundle_state.json")).toBe(
      "Recorded in /x/bundle_state.json. A running Neotoma server reads this file only at " +
        "startup, so this change takes effect at its next restart, when it also registers the " +
        "bundle's schemas. A server on another machine never sees it. For immediate effect on " +
        'a running server, use the manage_bundles MCP tool (action "install") instead.'
    );
  });

  it("does not promise schema registration on disable", () => {
    const note = takesEffectNote("disable", "/x/s.json");
    expect(note).toMatch(/next restart\. A server/);
    expect(note).not.toMatch(/registers the bundle's schemas/);
    expect(note).toMatch(/action "disable"/);
  });
});

describe("neotoma bundles (real command)", () => {
  it.each(["install", "enable"] as const)(
    "%s prints the success message followed by when it takes effect",
    async (action) => {
      const out = await run(["bundles", action, "crm"]);
      expect(out).toContain(`Bundle "crm"`);
      expect(out).toContain(takesEffectNote(action, statePath));
      expect(process.exitCode).toBeUndefined();
    }
  );

  it("disable prints the takes-effect note too", async () => {
    await run(["bundles", "install", "crm"]);
    const out = await run(["bundles", "disable", "crm"]);
    expect(out).toContain(takesEffectNote("disable", statePath));
  });

  it("--json carries the note as takes_effect", async () => {
    const out = await run(["--json", "bundles", "install", "crm"]);
    const body = JSON.parse(out) as { ok: boolean; takes_effect: string };
    expect(body.ok).toBe(true);
    expect(body.takes_effect).toBe(takesEffectNote("install", statePath));
  });
});
