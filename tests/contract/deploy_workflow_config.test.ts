import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Contract test over the operator deploy WORKFLOW's flyctl invocation.
 *
 * `tests/contract/fly_deploy_config.test.ts` asserts that the committed Fly
 * configs declare the right machine. This file asserts the complementary half:
 * that the workflow actually DEPLOYS FROM the right one.
 *
 * Both halves are needed, and neither implies the other. `flyctl deploy`
 * defaults to `fly.toml` when no `-c` is passed, and it REAPPLIES the selected
 * config's `[[vm]]` block over the running machine — it does not merge, and it
 * prints no warning when it shrinks one. So a workflow that omits `-c` deploys
 * the small shared default over the operator instance no matter how correct
 * fly.operator.toml is.
 *
 * That is the 2026-09-01 outage in one flag: a deploy reapplied a
 * 1GB/shared-cpu-1x guest over a machine running performance/2 CPU/8GB and took
 * it from slow to unreachable for ~30 minutes, while `flyctl status` reported
 * `started` throughout.
 *
 * This is asserted as a test rather than left to the comment above the step
 * because the failure is silent: a deploy missing `-c` still exits 0, still
 * reports success, and only shows up later as "the database is degraded".
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const WORKFLOW = ".github/workflows/deploy-operator-instance.yml";

function readWorkflow(): string {
  return fs.readFileSync(path.join(repoRoot, WORKFLOW), "utf8");
}

/** The `flyctl deploy ...` invocation, rejoined across YAML line continuations. */
function deployCommand(source: string): string {
  const flattened = source.replace(/\\\r?\n\s*/g, " ");
  const line = flattened.split("\n").find((l) => /^\s*flyctl\s+deploy\b/.test(l));
  if (!line) throw new Error(`no 'flyctl deploy' invocation found in ${WORKFLOW}`);
  return line.trim();
}

/**
 * The real `[[vm]]` table, excluding comments.
 *
 * These configs discuss `[[vm]]` and past bad sizes at length in prose, so a
 * naive indexOf("[[vm]]") lands in a comment and asserts against the very
 * values the comment is warning about. Strip comment lines first, then take
 * the table.
 */
function vmBlockOf(config: string): string {
  const lines = config.split("\n").filter((l) => !/^\s*#/.test(l));
  const start = lines.findIndex((l) => /^\s*\[\[vm\]\]/.test(l));
  if (start === -1) throw new Error("no [[vm]] table found");
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\s*\[/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

describe("deploy_workflow_config", () => {
  it("deploys the operator instance from fly.operator.toml, not the default fly.toml", () => {
    // -c is what stops `flyctl deploy` falling back to fly.toml. Accept the
    // long form too, so a later rewrite to --config is not a false failure.
    expect(deployCommand(readWorkflow())).toMatch(/(?:-c|--config)\s+fly\.operator\.toml\b/);
  });

  it("selects a config that declares the operator machine's real size", () => {
    // The flag is only worth having if the file it selects is right, so follow
    // it to the config rather than trusting the name. These are the verified
    // running values of the largest operator instance, read from the live
    // machine on 2026-09-01: performance / 2 CPU / 8GB. It was scaled up by
    // hand after repeated exit-134 (V8 heap OOM) aborts.
    const configName = deployCommand(readWorkflow()).match(/(?:-c|--config)\s+(\S+)/)?.[1];
    expect(configName).toBe("fly.operator.toml");

    const vmBlock = vmBlockOf(fs.readFileSync(path.join(repoRoot, configName!), "utf8"));
    expect(vmBlock).toMatch(/memory\s*=\s*['"]8gb['"]/);
    expect(vmBlock).toMatch(/cpu_kind\s*=\s*['"]performance['"]/);
    expect(vmBlock).toMatch(/cpus\s*=\s*2\b/);
  });

  it("keeps the volume mount the database lives on", () => {
    // A fresh machine must mount the EXISTING volume. The mount is declared by
    // source name ("data"), and Fly attaches an available volume of that name
    // in the target region. Losing this block is how a redeploy comes back
    // serving an empty database on ephemeral storage.
    const config = fs.readFileSync(path.join(repoRoot, "fly.operator.toml"), "utf8");
    expect(config).toMatch(/\[\[mounts\]\]/);
    expect(config).toMatch(/source\s*=\s*["']data["']/);
  });

  it("passes --primary-region, without which machine creation fails on the volume", () => {
    // The volume is region-pinned. Without --primary-region the deploy builds
    // and then fails at machine creation with "needs an unattached volume named
    // 'data' in region '<region>'". `--regions` does NOT substitute.
    expect(deployCommand(readWorkflow())).toMatch(/--primary-region\s/);
  });
});
