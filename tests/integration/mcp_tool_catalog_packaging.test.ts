/**
 * The MCP tool catalog (docs/developer/mcp/tool_descriptions.yaml) is
 * fail-closed: the server refuses to advertise tools without it. That makes it
 * a runtime dependency of every shipped artifact, not a doc.
 *
 * These tests pin the three places it has to reach:
 *   1. the npm package (`package.json#files`, checked with `npm pack --dry-run`);
 *   2. the container image (the Dockerfile runtime stage copies it, and
 *      `.dockerignore` re-includes it after excluding `docs/`);
 *   3. a real installed layout: pack the package, extract it, and construct the
 *      server card and `NeotomaServer` from the extracted `dist/` with the
 *      working directory and HOME outside any checkout.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { TOOL_CATALOG_RELATIVE_PATH } from "../../src/shared/tool_effect_catalog.js";
import { NEOTOMA_TOOL_NAMES } from "../../src/tool_definitions.js";

const REPO_ROOT = resolve(__dirname, "..", "..");
const scratch: string[] = [];

function makeScratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("MCP tool catalog ships with every artifact", () => {
  it("is included in the npm package", () => {
    const raw = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const [pack] = JSON.parse(raw) as Array<{ files: Array<{ path: string }> }>;
    const paths = pack.files.map((file) => file.path);
    expect(paths).toContain(TOOL_CATALOG_RELATIVE_PATH);
  }, 120_000);

  it("is copied into the container runtime stage and not excluded by .dockerignore", () => {
    const dockerfile = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8");
    const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));
    expect(runtimeStage).toMatch(
      new RegExp(
        `^COPY ${TOOL_CATALOG_RELATIVE_PATH.replace(/[.]/g, "\\.")} \\./${TOOL_CATALOG_RELATIVE_PATH.replace(/[.]/g, "\\.")}$`,
        "m"
      )
    );

    // .dockerignore is last-match-wins. The final rule that could match the
    // catalog must be its re-include, or the COPY above has nothing to copy.
    const rules = readFileSync(join(REPO_ROOT, ".dockerignore"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    const relevant = rules.filter((rule) => {
      const bare = rule.replace(/^!/, "").replace(/\/$/, "");
      return (
        bare === "docs" ||
        TOOL_CATALOG_RELATIVE_PATH.startsWith(`${bare}/`) ||
        bare === TOOL_CATALOG_RELATIVE_PATH ||
        bare === "*.yaml" ||
        bare === "**/*.yaml"
      );
    });
    expect(relevant.at(-1)).toBe(`!${TOOL_CATALOG_RELATIVE_PATH}`);
  });

  it("lets an installed package build the server card and construct the MCP server", () => {
    expect(existsSync(join(REPO_ROOT, "dist", "mcp_server_card.js"))).toBe(true);

    const packDir = makeScratch("neotoma-pack-");
    const tarball = execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--silent", "--pack-destination", packDir],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
      .trim()
      .split("\n")
      .at(-1)!;
    execFileSync("tar", ["-xzf", join(packDir, tarball), "-C", packDir]);
    const installed = join(packDir, "package");
    expect(existsSync(join(installed, TOOL_CATALOG_RELATIVE_PATH))).toBe(true);
    // Dependencies come from the checkout; only the package's own files are
    // what `npm pack` produced.
    symlinkSync(join(REPO_ROOT, "node_modules"), join(installed, "node_modules"), "dir");

    // Run from outside any checkout, with an isolated HOME so no CLI-configured
    // repo root can point the server back at this repository.
    const outside = makeScratch("neotoma-installed-cwd-");
    mkdirSync(join(outside, "data"), { recursive: true });
    const probe = `
      const card = await import(${JSON.stringify(join(installed, "dist", "mcp_server_card.js"))});
      const server = await import(${JSON.stringify(join(installed, "dist", "server.js"))});
      const tools = card.buildSmitheryServerCard().tools;
      new server.NeotomaServer();
      const store = tools.find((tool) => tool.name === "store");
      process.stdout.write(JSON.stringify({ count: tools.length, storeTitle: store && store.title }));
      process.exit(0);
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: outside,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: outside,
        NODE_ENV: "test",
        NEOTOMA_DATA_DIR: join(outside, "data"),
      },
    });
    expect(result.stderr).not.toMatch(/ENOENT|tool catalog .* is missing/);
    expect(result.status, result.stderr).toBe(0);
    const lastLine = result.stdout.trim().split("\n").at(-1) ?? "{}";
    const parsed = JSON.parse(lastLine) as { count: number; storeTitle?: string };
    expect(parsed.count).toBe(NEOTOMA_TOOL_NAMES.length);
    expect(parsed.storeTitle).toBe("Store entities and files");
  }, 240_000);
});
