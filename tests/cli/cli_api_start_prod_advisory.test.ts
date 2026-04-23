/**
 * v0.5.1 → v0.5.2 regression test: `neotoma api start --env prod` on a
 * source checkout routes through the `dev:prod` npm script (tsx watcher,
 * not release-compiled `dist/`). In v0.5.2 the one-line stderr advisory
 * originally shipped in v0.5.1 was upgraded to a **deprecation** line
 * that also announces the v0.6.0 default flip and instructs contributors
 * to pass `--watch` to preserve current behavior. The remediation target
 * for headless operators — install.md § Production deployment (headless
 * / systemd) — is unchanged.
 *
 * The deprecation must fire only on the
 * `--env prod + hasSource + no tunnel + no --watch` branch: not on dev,
 * not when the installed package is running (no source scripts), not on
 * the tunnel path (`watch:prod:tunnel`), and not when a contributor has
 * opted in with `--watch`. v0.5.2-specific assertions about `--watch`
 * itself live in tests/cli/cli_api_start_watch_flag.test.ts.
 *
 * Because exercising the full `api start` flow would require spawning a
 * real server, we assert the advisory text and branch selectors are
 * present in the compiled CLI bundle for both the background and
 * foreground code paths.
 */

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// The TypeScript source splits the deprecation message across multiple
// concatenated string literals; anchor on a prefix that lives within a
// single emitted literal.
const DEPRECATION_PREFIX =
  "deprecation: `neotoma api start --env prod` on a source checkout currently runs";

describe("neotoma api start --env prod on source checkout", () => {
  it("emits the dev:prod deprecation text on both background and foreground branches", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    // `DEPRECATION_PREFIX` intentionally stops before the concat boundary
    // that splits the string literal in the emitted bundle.
    const matches = compiled.split(DEPRECATION_PREFIX).length - 1;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it("references install.md § Production deployment as the remediation", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    expect(compiled).toMatch(
      /install\.md.*Production deployment \(headless \/ systemd\)/
    );
  });

  it("guards the advisory with the `--env prod + hasSource + childScript === dev:prod` branch", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    // The guard condition should check childScript === "dev:prod" so that
    // the advisory does NOT fire on the installed `start:api` path.
    expect(compiled).toMatch(/childScript\s*===\s*["']dev:prod["']/);
  });

  it("is suppressed under --output json on the --background branch", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    const backgroundGuardIdx = compiled.indexOf(
      DEPRECATION_PREFIX
    );
    expect(backgroundGuardIdx).toBeGreaterThan(-1);
    const windowStart = Math.max(0, backgroundGuardIdx - 800);
    const window = compiled.slice(windowStart, backgroundGuardIdx);
    expect(window).toMatch(/outputMode\s*!==\s*["']json["']/);
  });

  it("does NOT fire on --env dev (guard requires envOpt === 'prod')", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    const advisoryIdx = compiled.indexOf(
      DEPRECATION_PREFIX
    );
    expect(advisoryIdx).toBeGreaterThan(-1);
    const window = compiled.slice(Math.max(0, advisoryIdx - 800), advisoryIdx);
    expect(window).toMatch(/envOpt\s*===\s*["']prod["']/);
  });

  it("does NOT fire when source scripts are absent (installed-package path)", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    const advisoryIdx = compiled.indexOf(
      DEPRECATION_PREFIX
    );
    expect(advisoryIdx).toBeGreaterThan(-1);
    const window = compiled.slice(Math.max(0, advisoryIdx - 800), advisoryIdx);
    expect(window).toMatch(/hasSourceWatchScripts/);
  });
});
