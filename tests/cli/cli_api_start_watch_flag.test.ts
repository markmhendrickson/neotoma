/**
 * Regression tests for `neotoma api start` npm-script routing. These inspect
 * the compiled CLI bundle so the test remains cheap and does not spawn a real
 * server or tunnel.
 */

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function loadCompiledCli(): Promise<string> {
  return readFile(resolve(__dirname, "../../dist/cli/index.js"), "utf-8");
}

describe("neotoma api start npm-script routing", () => {
  it("declares the --watch flag on the api start command", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toMatch(/["']--watch["']/);
  });

  it("routes source-checkout dev starts through dev:server", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toContain("dev:server");
    expect(compiled).toContain("dev:server:tunnel");
  });

  it("routes source-checkout prod starts through dev:server:prod", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toContain("dev:server:prod");
    expect(compiled).toContain("dev:server:prod:tunnel");
  });

  it("routes installed-package starts through start:server", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toContain("start:server");
    expect(compiled).toContain("start:server:prod");
  });

  it("does not contain the old prod deprecation branch", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).not.toMatch(
      /deprecation: `neotoma api start --env prod` on a source checkout currently runs the tsx watcher/
    );
  });
});
