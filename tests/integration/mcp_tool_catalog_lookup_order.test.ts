/**
 * The MCP tool catalog is versioned data tied to the compiled tool inventory,
 * so the server must read the copy that ships with the running code, not one
 * from whatever checkout the project root happens to point at.
 *
 * The project root can be any directory whose package.json is named `neotoma`
 * (cwd, NEOTOMA_PROJECT_ROOT, or `repo_root` in the CLI config). Here it is a
 * stale checkout whose catalog predates titles and effect classes, which is
 * what every checkout from before the catalog looks like. The server card and
 * NeotomaServer must still start and load every tool from the package's own
 * catalog. If the project root were searched first, the stale file would shadow
 * the package copy and both would throw.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  loadToolEffectCatalog,
  TOOL_CATALOG_SEGMENTS,
} from "../../src/shared/tool_effect_catalog.js";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";

const REPO_ROOT = resolve(__dirname, "..", "..");

describe("MCP tool catalog lookup order", () => {
  const previousProjectRoot = process.env.NEOTOMA_PROJECT_ROOT;
  let staleRoot = "";
  let staleCatalog = "";

  beforeAll(() => {
    staleRoot = mkdtempSync(join(tmpdir(), "neotoma-stale-checkout-"));
    writeFileSync(
      join(staleRoot, "package.json"),
      JSON.stringify({ name: "neotoma", version: "0.0.1" })
    );
    mkdirSync(join(staleRoot, ...TOOL_CATALOG_SEGMENTS.slice(0, -1)), { recursive: true });
    staleCatalog = join(staleRoot, ...TOOL_CATALOG_SEGMENTS);
    // The catalog as every checkout from before titles and effect classes has
    // it: tool descriptions only. Derived from the current file so it needs no
    // git history (CI checks out a shallow clone).
    const current = yaml.load(readFileSync(join(REPO_ROOT, ...TOOL_CATALOG_SEGMENTS), "utf8")) as {
      tools?: Record<string, string>;
    };
    const staleYaml = yaml.dump({ tools: current.tools ?? {} });
    writeFileSync(staleCatalog, staleYaml);
    process.env.NEOTOMA_PROJECT_ROOT = staleRoot;
    vi.resetModules();
  });

  afterAll(() => {
    if (previousProjectRoot === undefined) delete process.env.NEOTOMA_PROJECT_ROOT;
    else process.env.NEOTOMA_PROJECT_ROOT = previousProjectRoot;
    vi.resetModules();
    rmSync(staleRoot, { recursive: true, force: true });
  });

  it("uses the stale checkout as the project root (precondition)", async () => {
    const { config } = await import("../../src/config.js");
    expect(resolve(config.projectRoot)).toBe(resolve(staleRoot));
    // The stale catalog really is invalid for this build, and the error names it.
    expect(() => loadToolEffectCatalog(staleCatalog, NEOTOMA_TOOL_NAMES)).toThrow(
      new RegExp(`tool catalog at ${staleCatalog.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  });

  it("builds the server card from the package's own catalog", async () => {
    const { buildSmitheryServerCard } = await import("../../src/mcp_server_card.js");
    const tools = buildSmitheryServerCard().tools as Array<{ name: string; title?: string }>;
    expect(tools).toHaveLength(NEOTOMA_TOOL_NAMES.length);
    expect(tools.find((tool) => tool.name === "store")?.title).toBe("Store entities and files");
  });

  it("constructs NeotomaServer with the package's own catalog", async () => {
    const { NeotomaServer } = await import("../../src/server.js");
    expect(() => new NeotomaServer()).not.toThrow();
  });
});
