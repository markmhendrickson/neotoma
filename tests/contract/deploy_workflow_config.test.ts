import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
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

  it("lets the escalation step open its issue: the token needs issues: write", () => {
    // 2026-10-13 and 2026-10-14: two failed deploys escalated to nobody. The
    // Escalate step creates the `autodeploy-failure` label with `|| true` and
    // then files the issue, and the workflow's read-only token refused both, so
    // the step died with "could not add label ... not found".
    const source = readWorkflow();
    const block = source.split(/^permissions:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
    expect(block).toMatch(/^\s+issues:\s*write\b/m);
  });

  it("does not leave the workflow token in .git/config after checkout", () => {
    // Nothing after checkout runs git against the remote, and `flyctl deploy
    // --remote-only` uploads the tree, so a persisted credential would travel
    // with it for no benefit.
    const source = readWorkflow();
    const checkout = source.slice(source.indexOf("uses: actions/checkout@"));
    expect(source.indexOf("uses: actions/checkout@")).toBeGreaterThan(-1);
    expect(checkout.split(/^\s+- name:/m)[0]).toMatch(/persist-credentials:\s*false\b/);
  });

  it("retries the authenticated read probe in a bounded window and still fails without a 200", () => {
    // A single 90s read right after the machine is replaced reported "wedged"
    // for a warm-up (cold cache, every client reconnecting). The probe must
    // retry, must be bounded (an unanswering database still fails), and must
    // keep requiring a 200 from an authenticated entity read.
    const source = readWorkflow();
    expect(source.indexOf("PROBE_BUDGET_SECONDS=")).toBeGreaterThan(-1);
    const probe = source.slice(source.indexOf("PROBE_BUDGET_SECONDS="));
    expect(probe).toMatch(/PROBE_BUDGET_SECONDS=\d+/);
    expect(probe).toMatch(/while :; do/);
    expect(probe).toMatch(/\/entities\?limit=1/);
    expect(probe).toMatch(/Authorization: Bearer \$READ_PROBE_TOKEN/);
    expect(probe).toMatch(/\[ "\$CODE" = "200" \] && break/);
    expect(probe).toMatch(/-ge "\$PROBE_BUDGET_SECONDS"/);
    expect(probe).toMatch(/--max-time 90\b/);
    expect(probe).toMatch(/\bsleep \d+/);
    expect(probe).toMatch(/case "\$CODE" in 401\|403\) break;; esac/);
    expect(probe).toMatch(/\[ "\$CODE" != "200" \]/);
    expect(probe.slice(probe.indexOf('[ "$CODE" != "200" ]'))).toMatch(/exit 1/);
    const budget = Number(probe.match(/PROBE_BUDGET_SECONDS=(\d+)/)?.[1]);
    expect(budget).toBeGreaterThanOrEqual(180);
    expect(budget).toBeLessThanOrEqual(900);
  });
});

/**
 * The text assertions above prove the retry loop is spelled a certain way; they
 * cannot prove it behaves. These tests extract the real "Verify deploy" probe
 * (section (e)) from the workflow and run it under bash against a stub `curl`
 * and `sleep`, so a mutation of the loop (unconditional break, budget
 * comparison dropped, no pacing, auth errors retried) turns them red.
 *
 * Only the budget NUMBER is rewritten, to a few seconds, so the budget exit is
 * reachable in a unit test; the comparison and the loop are the workflow's own.
 */
describe(
  "deploy_workflow_config: read probe behaviour against a stub curl",
  { timeout: 60_000 },
  () => {
    const BUDGET_FOR_TEST = 3;

    function probeScript(): string {
      const doc = yaml.load(readWorkflow()) as {
        jobs: { deploy: { steps: Array<{ name?: string; run?: string }> } };
      };
      const step = doc.jobs.deploy.steps.find((st) => st.name === "Verify deploy");
      if (!step?.run) throw new Error("no 'Verify deploy' step with a run block");
      const at = step.run.indexOf('if [ -z "${READ_PROBE_TOKEN:-}" ]');
      expect(at).toBeGreaterThan(-1);
      const section = step.run.slice(at);
      expect(section).toMatch(/PROBE_BUDGET_SECONDS=\d+/);
      return section.replace(/PROBE_BUDGET_SECONDS=\d+/, `PROBE_BUDGET_SECONDS=${BUDGET_FOR_TEST}`);
    }

    interface Run {
      status: number | null;
      out: string;
      curlCalls: string[];
      sleepCalls: number;
    }

    function runProbe(codes: string[], body = '{"entities":[]}'): Run {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-"));
      try {
        const bin = path.join(dir, "bin");
        fs.mkdirSync(bin);
        // Replays `codes` one per call and repeats the last forever. "000" mimics
        // curl's timeout: prints 000 on stdout and exits non-zero.
        fs.writeFileSync(
          path.join(bin, "curl"),
          `#!/bin/bash
n=$(cat "${dir}/n" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${dir}/n"
echo "$*" >> "${dir}/curl.log"
codes=(${codes.join(" ")}); i=$((n-1)); [ $i -ge \${#codes[@]} ] && i=$((\${#codes[@]}-1))
code=\${codes[$i]}
out=""; while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out="$2"; shift; done
if [ "$code" = "200" ]; then printf '%s' '${body}' > "$out"; else : > "$out"; fi
printf '%s' "$code"
[ "$code" = "000" ] && exit 28
exit 0
`,
          { mode: 0o755 }
        );
        // One real second per sleep so the (shortened) budget elapses; the
        // workflow's own sleep length is ignored.
        fs.writeFileSync(
          path.join(bin, "sleep"),
          `#!/bin/bash
echo x >> "${dir}/sleep.log"
exec /bin/sleep 1
`,
          { mode: 0o755 }
        );
        const script = probeScript().replaceAll("/tmp/", `${dir}/`);
        const r = spawnSync("bash", ["-eo", "pipefail", "-c", `set -euo pipefail\n${script}`], {
          env: {
            PATH: `${bin}:${process.env.PATH}`,
            HOST: "instance.example.test",
            READ_PROBE_TOKEN: "stub-token",
          },
          encoding: "utf8",
          timeout: 25_000,
        });
        const read = (f: string) =>
          fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : "";
        return {
          status: r.status,
          out: `${r.stdout}${r.stderr}`,
          curlCalls: read("curl.log").split("\n").filter(Boolean),
          sleepCalls: read("sleep.log").split("\n").filter(Boolean).length,
        };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("passes on the first 200 with one request and no warning", () => {
      const r = runProbe(["200"]);
      expect(r.status).toBe(0);
      expect(r.curlCalls).toHaveLength(1);
      expect(r.out).not.toContain("::warning::");
    });

    it("sends the bearer token to /entities?limit=1 with a 90s per-attempt cap", () => {
      const r = runProbe(["200"]);
      expect(r.curlCalls[0]).toContain("Authorization: Bearer stub-token");
      expect(r.curlCalls[0]).toContain("https://instance.example.test/entities?limit=1");
      expect(r.curlCalls[0]).toMatch(/--max-time 90\b/);
    });

    it("recovers from a slow warm-up and reports the FIRST code, attempt and elapsed time", () => {
      const r = runProbe(["503", "000", "200"]);
      expect(r.status).toBe(0);
      expect(r.curlCalls).toHaveLength(3);
      expect(r.out).toMatch(
        /::warning::first authenticated read was not a 200 \(HTTP 503\); passed on attempt 3 after \d+s/
      );
      expect(r.out).not.toContain("did not answer inside 90s");
    });

    it("retries a 5xx or a timeout instead of failing on the first one", () => {
      expect(runProbe(["000", "200"]).status).toBe(0);
      expect(runProbe(["500", "200"]).status).toBe(0);
    });

    it("fails fast on 401 and 403: one request, no waiting out the window", () => {
      for (const code of ["401", "403"]) {
        const r = runProbe([code]);
        expect(r.status).toBe(1);
        expect(r.curlCalls).toHaveLength(1);
        expect(r.sleepCalls).toBe(0);
        expect(r.out).toContain(`HTTP ${code}`);
      }
    });

    it("stops after the budget when the instance never answers, pacing its attempts", () => {
      const r = runProbe(["000"]);
      expect(r.status).toBe(1);
      expect(r.out).toContain("FAIL: authenticated read returned HTTP 000");
      // Bounded: more than one attempt (it did retry), but nowhere near unbounded.
      expect(r.curlCalls.length).toBeGreaterThan(1);
      expect(r.curlCalls.length).toBeLessThanOrEqual(BUDGET_FOR_TEST + 3);
      // Paced: exactly one sleep between consecutive attempts, never a hot loop.
      expect(r.sleepCalls).toBe(r.curlCalls.length - 1);
    });

    it("still fails when a persistent 5xx exhausts the window", () => {
      const r = runProbe(["502"]);
      expect(r.status).toBe(1);
      expect(r.out).toContain("HTTP 502");
    });

    it("requires an entity array in a 200, not just the status", () => {
      const r = runProbe(["200"], '{"error":"x"}');
      expect(r.status).toBe(1);
      expect(r.out).toContain("returned no entity array");
    });
  }
);
