/**
 * Unit tests for the Bundles m3 MCP tool `manage_bundles`:
 *  - it is advertised by buildToolDefinitions() and listed in NEOTOMA_TOOL_NAMES;
 *  - the handler returns structured JSON for list/info and for the mutating
 *    actions, mirroring the CLI;
 *  - it refuses to disable an always-active default bundle with a clear error.
 *
 * Plan: ent_089da2ecebc3bd804d63dcf2 (Bundles Strategy, m3).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildToolDefinitions, NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";
import { NeotomaServer } from "../../src/server.js";
import {
  resetBundleRegistryForTesting,
  resetBundleStateCacheForTesting,
} from "../../src/services/bundles/index.js";

type TextResponse = { content: Array<{ type: string; text: string }> };

function parseResponse(res: TextResponse): Record<string, unknown> {
  expect(res.content[0]?.type).toBe("text");
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

async function callManageBundles(args: unknown): Promise<Record<string, unknown>> {
  const server = new NeotomaServer();
  const res = (await (
    server as unknown as {
      handleManageBundles(a: unknown): Promise<TextResponse>;
    }
  ).handleManageBundles(args)) as TextResponse;
  return parseResponse(res);
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "manage-bundles-"));
  process.env.NEOTOMA_BUNDLE_STATE_PATH = path.join(tmpDir, "bundle_state.json");
  resetBundleStateCacheForTesting();
  resetBundleRegistryForTesting();
});

afterEach(() => {
  delete process.env.NEOTOMA_BUNDLE_STATE_PATH;
  resetBundleStateCacheForTesting();
  resetBundleRegistryForTesting();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("manage_bundles registration", () => {
  it("is advertised by buildToolDefinitions() with the expected schema", () => {
    const tool = buildToolDefinitions().find((t) => t.name === "manage_bundles");
    expect(tool).toBeDefined();
    expect(tool!.inputSchema).toMatchObject({
      properties: {
        action: { enum: ["list", "info", "install", "enable", "disable"] },
        bundle: { type: "string" },
      },
      required: ["action"],
    });
  });

  it("is in NEOTOMA_TOOL_NAMES", () => {
    expect(NEOTOMA_TOOL_NAMES).toContain("manage_bundles");
  });
});

describe("manage_bundles handler", () => {
  it("action=list returns the bundle set as structured JSON", async () => {
    const out = await callManageBundles({ action: "list" });
    expect(out.ok).toBe(true);
    expect(out.action).toBe("list");
    const bundles = out.bundles as Array<{ name: string }>;
    expect(bundles.map((b) => b.name)).toEqual(
      expect.arrayContaining(["core", "core_workflows", "infrastructure"])
    );
  });

  it("action=info returns full manifest detail for a known bundle", async () => {
    const out = await callManageBundles({ action: "info", bundle: "core_workflows" });
    expect(out.ok).toBe(true);
    expect(out.always_active).toBe(true);
    const manifest = out.manifest as { bundle_type: string; requires_bundles: string[] };
    expect(manifest.bundle_type).toBe("skill");
    expect(manifest.requires_bundles).toContain("core");
  });

  it("action=info on an unknown bundle returns ok:false", async () => {
    const out = await callManageBundles({ action: "info", bundle: "no_such_bundle" });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/unknown bundle/i);
  });

  it("action=disable on a default bundle returns ok:false with a clear error", async () => {
    const out = await callManageBundles({ action: "disable", bundle: "core" });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/cannot be disabled/i);
  });

  it("action=install on an unknown bundle returns ok:false (UnknownBundleError)", async () => {
    const out = await callManageBundles({ action: "install", bundle: "no_such_bundle" });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/unknown bundle/i);
  });

  it("a mutating action without a bundle name throws InvalidParams", async () => {
    await expect(callManageBundles({ action: "install" })).rejects.toThrow(/requires a "bundle"/i);
  });
});
