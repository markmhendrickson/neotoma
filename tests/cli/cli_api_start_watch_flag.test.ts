/**
 * v0.5.2 regression test: `neotoma api start` gains a `--watch` flag that
 * disambiguates "watch with prod env" from "run production." In v0.5.2 the
 * flag is observable but does NOT alter routing — `--env prod` on a source
 * checkout still routes through `dev:prod` (the tsx watcher). A stderr
 * deprecation line fires when the watcher is selected implicitly (no
 * `--watch`), announcing the v0.6.0 default flip and instructing
 * contributors to pass `--watch` to preserve current behavior.
 *
 * v0.6.0 will flip the default: `--env prod + hasSource + !watch` →
 * `start:api:prod`; `--env prod + hasSource + --watch` → `watch:prod`
 * (the `dev:prod` alias is dropped in the same release). Tests for the
 * flipped state live in the same file with `it.skip` markers; un-skip
 * when cutting v0.6.0 and flip the default one-liner in src/cli/index.ts.
 *
 * Like the v0.5.1 advisory test (tests/cli/cli_api_start_prod_advisory.test.ts),
 * these assertions run against the compiled CLI bundle rather than spawning
 * a real server, so they pin the branch selectors and text that the
 * release preflight and agent-instructions sync rule both reference.
 */

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function loadCompiledCli(): Promise<string> {
  return readFile(resolve(__dirname, "../../dist/cli/index.js"), "utf-8");
}

// The TypeScript source splits the deprecation text across multiple
// concatenated string literals; `indexOf` on the full sentence returns
// -1 against the compiled output. Anchor on a substring that lives
// within a single emitted literal instead.
const DEPRECATION_PREFIX =
  "deprecation: `neotoma api start --env prod` on a source checkout currently runs";

describe("neotoma api start --watch flag (v0.5.2)", () => {
  it("declares the --watch flag on the api start command", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toMatch(/["']--watch["']/);
    expect(compiled).toMatch(/flip the default to the built runner/);
  });

  it("threads opts.watch into the deprecation guard on both branches", async () => {
    const compiled = await loadCompiledCli();
    // "In v0.6.0 the default will" lives within a single concatenated
    // fragment and appears twice (background + foreground spawn sites).
    const occurrences =
      compiled.split("In v0.6.0 the default will").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
    const firstIdx = compiled.indexOf(DEPRECATION_PREFIX);
    expect(firstIdx).toBeGreaterThan(-1);
    const windowStart = Math.max(0, firstIdx - 600);
    const window = compiled.slice(windowStart, firstIdx);
    expect(window).toMatch(/!\s*opts\.watch|opts\.watch\s*===\s*(?:false|undefined)/);
  });

  it("emits a deprecation (not notice) line referencing v0.6.0 and the --watch opt-in", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toContain(DEPRECATION_PREFIX);
    expect(compiled).toMatch(/pass `--watch` to preserve/);
    expect(compiled).toMatch(/In v0\.6\.0 the default will/);
    expect(compiled).toMatch(/flip to the built runner/);
  });

  it("references install.md § Production deployment as the remediation for operators", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toMatch(
      /install\.md.*Production deployment \(headless \/ systemd\)/
    );
  });

  it("guards the deprecation with childScript === 'dev:prod' so it does not fire on installed-package path", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toMatch(/childScript\s*===\s*["']dev:prod["']/);
  });

  it("is suppressed under --output json on the --background branch", async () => {
    const compiled = await loadCompiledCli();
    const deprecationIdx = compiled.indexOf(
      DEPRECATION_PREFIX
    );
    expect(deprecationIdx).toBeGreaterThan(-1);
    const windowStart = Math.max(0, deprecationIdx - 800);
    const window = compiled.slice(windowStart, deprecationIdx);
    expect(window).toMatch(/outputMode\s*!==\s*["']json["']/);
  });

  it("does NOT fire on --env dev (guard requires envOpt === 'prod')", async () => {
    const compiled = await loadCompiledCli();
    const deprecationIdx = compiled.indexOf(
      DEPRECATION_PREFIX
    );
    expect(deprecationIdx).toBeGreaterThan(-1);
    const window = compiled.slice(Math.max(0, deprecationIdx - 800), deprecationIdx);
    expect(window).toMatch(/envOpt\s*===\s*["']prod["']/);
  });

  it("does NOT fire when source scripts are absent (installed-package path)", async () => {
    const compiled = await loadCompiledCli();
    const deprecationIdx = compiled.indexOf(
      DEPRECATION_PREFIX
    );
    expect(deprecationIdx).toBeGreaterThan(-1);
    const window = compiled.slice(Math.max(0, deprecationIdx - 800), deprecationIdx);
    expect(window).toMatch(/hasSourceWatchScripts/);
  });

  it("does NOT fire when --watch is passed explicitly (contributor opt-in path)", async () => {
    const compiled = await loadCompiledCli();
    const deprecationIdx = compiled.indexOf(
      DEPRECATION_PREFIX
    );
    expect(deprecationIdx).toBeGreaterThan(-1);
    const window = compiled.slice(Math.max(0, deprecationIdx - 800), deprecationIdx);
    // Guard must include a negated watch check so explicit --watch suppresses the line.
    expect(window).toMatch(/!\s*(?:opts|options)\.watch|opts\.watch\s*===\s*(?:false|undefined)/);
  });
});

describe.skip("neotoma api start --env prod default flip (v0.6.0)", () => {
  // Un-skip these when cutting v0.6.0. The one-line change in
  // src/cli/index.ts that flips the default is:
  //
  //   envOpt === "prod"
  //     ? hasSourceWatchScripts
  //       ? opts.watch
  //         ? "watch:prod"         // was "dev:prod"
  //         : "start:api:prod"      // flipped default
  //       : "start:api"
  //
  // Plus: drop the `dev:prod` alias from package.json (it was an alias for
  // `watch:prod` — callers now reference `watch:prod` directly).

  it("routes prod + hasSource + !watch to start:api:prod (flipped default)", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toMatch(/childScript\s*=.*start:api:prod/);
    const envProdIdx = compiled.indexOf('envOpt === "prod"');
    expect(envProdIdx).toBeGreaterThan(-1);
    const window = compiled.slice(envProdIdx, envProdIdx + 400);
    expect(window).toMatch(/start:api:prod/);
  });

  it("routes prod + hasSource + --watch to watch:prod (was dev:prod)", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toMatch(/opts\.watch.*\?\s*["']watch:prod["']/);
    expect(compiled).not.toMatch(/["']dev:prod["']/);
  });

  it("leaves the tunnel branch unchanged (watch:prod:tunnel)", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).toMatch(/watch:prod:tunnel/);
  });

  it("drops the dev:prod alias from package.json", async () => {
    const pkgRaw = await readFile(
      resolve(__dirname, "../../package.json"),
      "utf-8"
    );
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts?.["dev:prod"]).toBeUndefined();
    expect(pkg.scripts?.["watch:prod"]).toBeDefined();
    expect(pkg.scripts?.["start:api:prod"]).toBeDefined();
  });

  it("removes the v0.5.2 deprecation line once the default is flipped", async () => {
    const compiled = await loadCompiledCli();
    expect(compiled).not.toMatch(
      /deprecation: `neotoma api start --env prod` on a source checkout currently runs the tsx watcher/
    );
  });
});
