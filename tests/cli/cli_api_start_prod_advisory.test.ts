/**
 * v0.5.1 regression test: `neotoma api start --env prod` on a source
 * checkout routes through the `dev:prod` npm script (tsx watcher, not
 * release-compiled `dist/`). That is fine for operator-local smoke tests
 * but NOT for a real headless deployment. The CLI MUST emit a one-line
 * stderr advisory in this case pointing operators at the supervised
 * systemd recipe in install.md.
 *
 * The advisory must fire only on the `--env prod + hasSource + no tunnel`
 * branch, not on dev, not when the installed package is running (no
 * source scripts), and not on the tunnel path (watch:prod:tunnel).
 *
 * Because exercising the full `api start` flow would require spawning a
 * real server, we assert the advisory text and branch selectors are
 * present in the compiled CLI bundle for both the background and
 * foreground code paths. The behavioral parity is covered by the
 * identical advisory text appearing twice.
 */

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("neotoma api start --env prod on source checkout", () => {
  it("emits the dev:prod advisory text on both background and foreground branches", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    const matches = compiled.match(
      /notice: `neotoma api start --env prod` on a source checkout selects `dev:prod`/g
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
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
    // The --background branch emits a json payload AFTER spawning, so the
    // advisory emit site there must be gated on outputMode !== "json" to
    // keep `neotoma api start --env prod --background --output json`
    // stdout clean of extraneous stderr lines.
    // The foreground branch already early-returns under --output json
    // (emitting a commands-manifest json payload) *before* the childScript
    // selection runs, so it never reaches the advisory code path — no
    // runtime guard needed there.
    const backgroundGuardIdx = compiled.indexOf(
      "notice: `neotoma api start --env prod` on a source checkout selects `dev:prod`"
    );
    expect(backgroundGuardIdx).toBeGreaterThan(-1);
    // Search backwards to confirm an outputMode !== "json" appears within
    // ~600 chars of the first advisory (the --background emit site).
    const windowStart = Math.max(0, backgroundGuardIdx - 600);
    const window = compiled.slice(windowStart, backgroundGuardIdx);
    expect(window).toMatch(/outputMode\s*!==\s*["']json["']/);
  });

  it("does NOT fire on --env dev (guard requires envOpt === 'prod')", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    // The advisory guard requires envOpt === "prod"; the dev branch never
    // routes through dev:prod, so the guard short-circuits on --env dev.
    // We assert the "envOpt === prod" check appears in the same vicinity
    // as the dev:prod-notice text.
    const advisoryIdx = compiled.indexOf(
      "notice: `neotoma api start --env prod` on a source checkout selects `dev:prod`"
    );
    expect(advisoryIdx).toBeGreaterThan(-1);
    const window = compiled.slice(Math.max(0, advisoryIdx - 500), advisoryIdx);
    expect(window).toMatch(/envOpt\s*===\s*["']prod["']/);
  });

  it("does NOT fire when source scripts are absent (installed-package path)", async () => {
    const compiled = await readFile(
      resolve(__dirname, "../../dist/cli/index.js"),
      "utf-8"
    );
    // When hasSourceWatchScripts is false the CLI falls through to
    // start:api; the guard must require hasSourceWatchScripts to be true.
    const advisoryIdx = compiled.indexOf(
      "notice: `neotoma api start --env prod` on a source checkout selects `dev:prod`"
    );
    expect(advisoryIdx).toBeGreaterThan(-1);
    const window = compiled.slice(Math.max(0, advisoryIdx - 500), advisoryIdx);
    expect(window).toMatch(/hasSourceWatchScripts/);
  });
});
